import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  toSpecName,
  mapVisibility,
  buildWebhookUrl,
  extractFieldsFromContract,
  pushToNeo,
  loadConfig,
  stepExcludeNonContractFields,
  checkDuplicateFields,
  formatDuplicateFieldsError,
  pushProcessToNeo,
  pushReportToNeo,
  dumpDelta,
  buildFieldAgentPromptMap,
  buildFieldUpdateParams,
  buildSpecUpsertParams,
} from '../src/push-to-neo.js';
import {
  generateId,
  auditDefaults,
} from '../src/neo-writer.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// 1. Visibility mapping
// ---------------------------------------------------------------------------

describe('buildFieldAgentPromptMap', () => {
  it('maps entity.field -> agentPrompt, resolving entity name like defaultExpr', () => {
    const decisions = {
      entities: {
        header: { name: 'Order', fields: { docStatus: { agentPrompt: 'confirm before complete' }, note: {} } },
        lines: { fields: { qty: { agentPrompt: 'quantity hint' } } },
      },
    };

    const map = buildFieldAgentPromptMap(decisions);

    assert.deepEqual(map, {
      'Order.docStatus': 'confirm before complete',
      'lines.qty': 'quantity hint',
    });
  });

  it('returns an empty object when there are no prompts or no entities', () => {
    assert.deepEqual(buildFieldAgentPromptMap({}), {});
    assert.deepEqual(buildFieldAgentPromptMap({ entities: {} }), {});
    assert.deepEqual(
      buildFieldAgentPromptMap({ entities: { h: { fields: { a: {} } } } }),
      {},
    );
  });

  it('maps whitespace-only field prompts to null and trims the rest', () => {
    const decisions = {
      entities: {
        header: {
          name: 'Order',
          fields: {
            blank: { agentPrompt: '   ' },
            real: { agentPrompt: '  pick nearest warehouse  ' },
          },
        },
      },
    };
    assert.deepEqual(buildFieldAgentPromptMap(decisions), {
      'Order.blank': null,
      'Order.real': 'pick nearest warehouse',
    });
  });
});

describe('push-to-neo agentPrompt upsert params', () => {
  it('passes spec agentPrompt into upsertSpec params', () => {
    const params = buildSpecUpsertParams({
      specName: 'purchase-order',
      moduleId: 'MOD1',
      windowId: 'WIN1',
      specAgentPrompt: 'Confirm before completing.',
      auditOpts: { userId: 'USR1' },
    }, 'SPEC1');

    assert.equal(params.agentPrompt, 'Confirm before completing.');
    assert.equal(params.specId, 'SPEC1');
    assert.equal(params.name, 'purchase-order');
  });

  it('passes field agentPrompt into upsertField params', () => {
    const params = buildFieldUpdateParams(
      {
        entityName: 'Order',
        fieldName: 'docStatus',
        visibility: 'readOnly',
      },
      {
        moduleId: 'MOD1',
        auditOpts: {},
        fieldDefaultExprs: {},
        fieldAgentPrompts: { 'Order.docStatus': 'Only advance status forward.' },
      },
      'FIELD1',
      'ENTITY1',
    );

    assert.equal(params.agentPrompt, 'Only advance status forward.');
    assert.equal(params.isReadOnly, 'Y');
  });

  it('passes null field agentPrompt when decisions do not declare one, clearing stale DB values', () => {
    const params = buildFieldUpdateParams(
      {
        entityName: 'Order',
        fieldName: 'plain',
        visibility: 'editable',
      },
      {
        moduleId: 'MOD1',
        auditOpts: {},
        fieldDefaultExprs: {},
        fieldAgentPrompts: { 'Order.docStatus': 'Prompt' },
      },
      'FIELD2',
      'ENTITY1',
    );

    assert.equal(params.agentPrompt, null);
    assert.equal(params.isIncluded, 'Y');
  });

  it('sets java_qualifier when the field key differs from the AD column', () => {
    const params = buildFieldUpdateParams(
      {
        entityName: 'Order',
        fieldName: 'documentAction',
        column: 'DocAction',
        visibility: 'editable',
      },
      { moduleId: 'MOD1', auditOpts: {}, fieldDefaultExprs: {} },
      'FIELD1',
      'ENTITY1',
    );
    assert.equal(params.javaQualifier, 'documentAction');
  });

  it('omits java_qualifier when the field key equals the AD column', () => {
    const params = buildFieldUpdateParams(
      {
        entityName: 'Order',
        fieldName: 'DocAction',
        column: 'DocAction',
        visibility: 'editable',
      },
      { moduleId: 'MOD1', auditOpts: {}, fieldDefaultExprs: {} },
      'FIELD1',
      'ENTITY1',
    );
    assert.equal('javaQualifier' in params, false);
  });
});

describe('mapVisibility', () => {
  it('maps editable to included, not read-only', () => {
    assert.deepStrictEqual(mapVisibility('editable'), { isIncluded: 'Y', isReadOnly: 'N' });
  });

  it('maps readOnly to included and read-only', () => {
    assert.deepStrictEqual(mapVisibility('readOnly'), { isIncluded: 'Y', isReadOnly: 'Y' });
  });

  it('maps system to included and read-only', () => {
    assert.deepStrictEqual(mapVisibility('system'), { isIncluded: 'Y', isReadOnly: 'Y' });
  });

  it('maps discarded to not included', () => {
    assert.deepStrictEqual(mapVisibility('discarded'), { isIncluded: 'N', isReadOnly: 'N' });
  });

  it('maps unknown visibility to not included', () => {
    assert.deepStrictEqual(mapVisibility('unknown'), { isIncluded: 'N', isReadOnly: 'N' });
  });
});

// ---------------------------------------------------------------------------
// 2. Webhook URL construction (deprecated but still exported)
// ---------------------------------------------------------------------------

describe('buildWebhookUrl', () => {
  it('constructs correct URL from base and webhook name', () => {
    assert.equal(
      buildWebhookUrl('http://localhost:8080/etendo', 'SFUpsertSpec'),
      'http://localhost:8080/etendo/sws/webhooks/SFUpsertSpec',
    );
  });

  it('strips trailing slashes from base URL', () => {
    assert.equal(
      buildWebhookUrl('http://localhost:8080/etendo/', 'SFPopulateSpec'),
      'http://localhost:8080/etendo/sws/webhooks/SFPopulateSpec',
    );
  });

  it('handles multiple trailing slashes', () => {
    assert.equal(
      buildWebhookUrl('http://localhost:8080/etendo///', 'SFUpsertField'),
      'http://localhost:8080/etendo/sws/webhooks/SFUpsertField',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Spec name derivation
// ---------------------------------------------------------------------------

describe('toSpecName', () => {
  it('converts "Sales Order" to "sales-order"', () => {
    assert.equal(toSpecName('Sales Order'), 'sales-order');
  });

  it('converts "Business Partner" to "business-partner"', () => {
    assert.equal(toSpecName('Business Partner'), 'business-partner');
  });

  it('handles single word', () => {
    assert.equal(toSpecName('Product'), 'product');
  });

  it('handles extra whitespace', () => {
    assert.equal(toSpecName('  Sales  Order  '), 'sales-order');
  });

  it('handles camelCase input', () => {
    assert.equal(toSpecName('salesOrder'), 'sales-order');
  });

  it('handles special characters', () => {
    assert.equal(toSpecName('Price List (Sales)'), 'price-list-sales');
  });

  // Regression: regex grouping `(^-)|(-$)` must trim both leading and trailing dashes
  it('trims leading and trailing dashes (edge-dash inputs)', () => {
    assert.equal(toSpecName('-Sales Order-'), 'sales-order');
  });

  it('strips outer dashes from doubly-dashed input', () => {
    assert.equal(toSpecName('--Foo--Bar--'), 'foo-bar');
  });

  it('preserves already-kebab input unchanged', () => {
    assert.equal(toSpecName('Already-Kebab'), 'already-kebab');
  });

  it('handles single word with no dashes', () => {
    assert.equal(toSpecName('Single'), 'single');
  });
});

// ---------------------------------------------------------------------------
// 4. Field extraction from contract
// ---------------------------------------------------------------------------

describe('extractFieldsFromContract', () => {
  const backendContract = {
    entities: {
      order: {
        fields: [
          { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', visibility: 'editable', required: true },
          { name: 'adClientId', column: 'AD_Client_ID', type: 'id', visibility: 'system', required: true },
        ],
      },
      orderLine: {
        fields: [
          { name: 'product', column: 'M_Product_ID', type: 'foreignKey', visibility: 'editable', required: true },
          { name: 'lineNo', column: 'Line', type: 'integer', visibility: 'readOnly', required: true },
        ],
      },
    },
  };

  it('extracts fields from all entities', () => {
    const fields = extractFieldsFromContract(backendContract);
    assert.equal(fields.length, 4);
  });

  it('includes entity name for each field', () => {
    const fields = extractFieldsFromContract(backendContract);
    const orderFields = fields.filter(f => f.entityName === 'order');
    const lineFields = fields.filter(f => f.entityName === 'orderLine');
    assert.equal(orderFields.length, 2);
    assert.equal(lineFields.length, 2);
  });

  it('preserves column name and visibility', () => {
    const fields = extractFieldsFromContract(backendContract);
    const bp = fields.find(f => f.column === 'C_BPartner_ID');
    assert.equal(bp.visibility, 'editable');
    assert.equal(bp.fieldName, 'businessPartner');
  });

  it('handles empty entities object', () => {
    const fields = extractFieldsFromContract({ entities: {} });
    assert.equal(fields.length, 0);
  });

  // ── businessCritical regression guard (ETP-4233) ──────────────────────────
  // This is the exact point where the flag was silently dropped before the fix.

  it('businessCritical:true on a field is preserved in extracted output', () => {
    const contract = {
      entities: {
        order: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', visibility: 'readOnly', businessCritical: true },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    const f = fields.find(x => x.fieldName === 'documentNo');
    assert.equal(f.businessCritical, true,
      'businessCritical:true must survive extractFieldsFromContract — regression guard for ETP-4233');
  });

  it('businessCritical absent on a field defaults to false', () => {
    const contract = {
      entities: {
        order: {
          fields: [
            { name: 'description', column: 'Description', visibility: 'editable' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    const f = fields.find(x => x.fieldName === 'description');
    assert.equal(f.businessCritical, false,
      'absent businessCritical must default to false');
  });

  it('businessCritical:false on a field stays false', () => {
    const contract = {
      entities: {
        order: {
          fields: [
            { name: 'notes', column: 'Notes', visibility: 'editable', businessCritical: false },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    const f = fields.find(x => x.fieldName === 'notes');
    assert.equal(f.businessCritical, false);
  });
});

// ---------------------------------------------------------------------------
// 5. Dry run mode
// ---------------------------------------------------------------------------

describe('pushToNeo dry run', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `push-to-neo-test-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'sales-order');
    await mkdir(artifactsDir, { recursive: true });

    const schema = {
      window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
      entities: [],
    };

    const contract = {
      backendContract: {
        entities: {
          order: {
            fields: [
              { name: 'bp', column: 'C_BPartner_ID', type: 'foreignKey', visibility: 'editable', required: true },
              { name: 'client', column: 'AD_Client_ID', type: 'id', visibility: 'system', required: true },
              { name: 'docNo', column: 'DocumentNo', type: 'string', visibility: 'readOnly', required: true },
              { name: 'old', column: 'OldField', type: 'string', visibility: 'discarded', required: false },
            ],
          },
        },
      },
    };

    await writeFile(join(artifactsDir, 'schema-raw.json'), JSON.stringify(schema));
    await writeFile(join(artifactsDir, 'contract.json'), JSON.stringify(contract));
  });

  it('returns plan without writing to DB', async () => {
    const result = await pushToNeo('sales-order', {
      dryRun: true,
      projectRoot: tmpDir,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.specName, 'sales-order');
    assert.equal(result.windowId, '143');
    assert.ok(result.plan);
    assert.ok(result.plan.spec);
    assert.ok(result.plan.populate);
    assert.ok(Array.isArray(result.plan.fields));
  });

  it('correctly counts included/excluded/readOnly fields', async () => {
    const result = await pushToNeo('sales-order', {
      dryRun: true,
      projectRoot: tmpDir,
    });

    // editable(bp) + readOnly(docNo) + system(client) = 3 included
    assert.equal(result.summary.included, 3);
    // discarded(old) = 1 excluded
    assert.equal(result.summary.excluded, 1);
    // readOnly(docNo) + system(client) = 2
    assert.equal(result.summary.readOnly, 2);
    assert.equal(result.summary.totalFields, 4);
  });

  it('uses direct DB action names in plan', async () => {
    const result = await pushToNeo('sales-order', {
      dryRun: true,
      projectRoot: tmpDir,
    });

    assert.equal(result.plan.spec.action, 'upsertSpec');
    assert.equal(result.plan.populate.action, 'populateSpec');
    assert.equal(result.plan.fields[0].action, 'upsertField');
  });

  it('derives spec name from schema window name', async () => {
    const result = await pushToNeo('sales-order', {
      dryRun: true,
      projectRoot: tmpDir,
    });

    assert.equal(result.plan.spec.params.name, 'sales-order');
    assert.equal(result.plan.spec.params.specType, 'W');
    assert.equal(result.plan.spec.params.windowId, '143');
  });
});

// ---------------------------------------------------------------------------
// 6. Error handling
// ---------------------------------------------------------------------------

describe('pushToNeo error handling', () => {
  it('throws on missing contract.json', async () => {
    const tmpDir = join(tmpdir(), `push-to-neo-err-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'nonexistent');
    await mkdir(artifactsDir, { recursive: true });

    await assert.rejects(
      () => pushToNeo('nonexistent', {
        dryRun: true,
        projectRoot: tmpDir,
      }),
      /Cannot read contract\.json/,
    );
  });

  it('throws on missing schema-raw.json', async () => {
    const tmpDir = join(tmpdir(), `push-to-neo-err2-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'partial');
    await mkdir(artifactsDir, { recursive: true });

    const contract = { backendContract: { entities: {} } };
    await writeFile(join(artifactsDir, 'contract.json'), JSON.stringify(contract));

    await assert.rejects(
      () => pushToNeo('partial', {
        dryRun: true,
        projectRoot: tmpDir,
      }),
      /Cannot read schema-raw\.json/,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. loadConfig (deprecated but still tested for backwards compat)
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('reads from properties file', async () => {
    const tmpDir = join(tmpdir(), `push-to-neo-cfg-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'schema_forge.properties'),
      'etendo.url=http://myhost:8080/etendo\netendo.user=testuser\netendo.password=testpass\n',
    );

    const origUrl = process.env.ETENDO_URL;
    const origUser = process.env.ETENDO_USER;
    const origPass = process.env.ETENDO_PASSWORD;
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;

    try {
      const cfg = await loadConfig(tmpDir);
      assert.equal(cfg.url, 'http://myhost:8080/etendo');
      assert.equal(cfg.user, 'testuser');
      assert.equal(cfg.password, 'testpass');
    } finally {
      if (origUrl !== undefined) process.env.ETENDO_URL = origUrl;
      if (origUser !== undefined) process.env.ETENDO_USER = origUser;
      if (origPass !== undefined) process.env.ETENDO_PASSWORD = origPass;
    }
  });

  it('env vars take precedence over properties file', async () => {
    const tmpDir = join(tmpdir(), `push-to-neo-cfg2-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'schema_forge.properties'),
      'etendo.url=http://file-url\netendo.user=file-user\netendo.password=file-pass\n',
    );

    const origUrl = process.env.ETENDO_URL;
    const origUser = process.env.ETENDO_USER;
    const origPass = process.env.ETENDO_PASSWORD;

    process.env.ETENDO_URL = 'http://env-url';
    process.env.ETENDO_USER = 'env-user';
    process.env.ETENDO_PASSWORD = 'env-pass';

    try {
      const cfg = await loadConfig(tmpDir);
      assert.equal(cfg.url, 'http://env-url');
      assert.equal(cfg.user, 'env-user');
      assert.equal(cfg.password, 'env-pass');
    } finally {
      if (origUrl !== undefined) process.env.ETENDO_URL = origUrl; else delete process.env.ETENDO_URL;
      if (origUser !== undefined) process.env.ETENDO_USER = origUser; else delete process.env.ETENDO_USER;
      if (origPass !== undefined) process.env.ETENDO_PASSWORD = origPass; else delete process.env.ETENDO_PASSWORD;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. neo-writer.js pure function tests
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('returns a 32-character uppercase hex string', () => {
    const id = generateId();
    assert.equal(id.length, 32);
    assert.match(id, /^[0-9A-F]{32}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    assert.equal(ids.size, 100);
  });
});

describe('auditDefaults', () => {
  it('returns all required audit columns', () => {
    const audit = auditDefaults();
    assert.equal(audit.ad_client_id, '0');
    assert.equal(audit.ad_org_id, '0');
    assert.equal(audit.isactive, 'Y');
    assert.equal(audit.createdby, '0');
    assert.equal(audit.updatedby, '0');
    assert.ok(audit.created instanceof Date);
    assert.ok(audit.updated instanceof Date);
  });

  it('accepts custom clientId, orgId, userId', () => {
    const audit = auditDefaults({ clientId: 'ABC', orgId: 'DEF', userId: 'GHI' });
    assert.equal(audit.ad_client_id, 'ABC');
    assert.equal(audit.ad_org_id, 'DEF');
    assert.equal(audit.createdby, 'GHI');
    assert.equal(audit.updatedby, 'GHI');
  });
});

// ---------------------------------------------------------------------------
// 9. stepExcludeNonContractFields — extractedColumns scoping (ETP-4177)
// ---------------------------------------------------------------------------

function makeClient(rows) {
  return {
    query: async (sql) => {
      if (sql.includes('SELECT')) return { rows };
      return {};
    },
  };
}

describe('stepExcludeNonContractFields', () => {
  it('excludes a field that is in schemaRawData but not in contract', async () => {
    const updated = [];
    const client = {
      query: async (sql, params) => {
        if (sql.includes('SELECT')) {
          return { rows: [{ etgo_sf_field_id: 'F1', columnname: 'description' }] };
        }
        updated.push(params[0]);
        return {};
      },
    };
    const popResult = { entities: [{ entityId: 'E1' }] };
    const allFields = [{ column: 'name' }];
    const schemaRawData = { entities: [{ fields: [{ columnName: 'description' }, { columnName: 'name' }] }] };

    await stepExcludeNonContractFields(client, popResult, allFields, schemaRawData);
    assert.deepEqual(updated, ['F1'], 'description should be excluded (in AD but not in contract)');
  });

  it('does NOT exclude a field from an uninstalled module (not in schemaRawData)', async () => {
    const updated = [];
    const client = {
      query: async (sql, params) => {
        if (sql.includes('SELECT')) {
          // em_sii_description belongs to an uninstalled module — not in schemaRawData
          return { rows: [{ etgo_sf_field_id: 'F2', columnname: 'em_sii_description' }] };
        }
        updated.push(params[0]);
        return {};
      },
    };
    const popResult = { entities: [{ entityId: 'E1' }] };
    const allFields = [{ column: 'name' }];
    const schemaRawData = { entities: [{ fields: [{ columnName: 'name' }] }] };

    await stepExcludeNonContractFields(client, popResult, allFields, schemaRawData);
    assert.deepEqual(updated, [], 'em_sii_description must not be toggled — module not extracted');
  });

  it('does NOT exclude a field that is already in the contract', async () => {
    const updated = [];
    const client = {
      query: async (sql, params) => {
        if (sql.includes('SELECT')) {
          return { rows: [{ etgo_sf_field_id: 'F3', columnname: 'name' }] };
        }
        updated.push(params[0]);
        return {};
      },
    };
    const popResult = { entities: [{ entityId: 'E1' }] };
    const allFields = [{ column: 'name' }];
    const schemaRawData = { entities: [{ fields: [{ columnName: 'name' }] }] };

    await stepExcludeNonContractFields(client, popResult, allFields, schemaRawData);
    assert.deepEqual(updated, [], 'name is in contract — must not be excluded');
  });

  it('excludes nothing when schemaRawData is null', async () => {
    const updated = [];
    const client = {
      query: async (sql, params) => {
        if (sql.includes('SELECT')) {
          return { rows: [{ etgo_sf_field_id: 'F4', columnname: 'description' }] };
        }
        updated.push(params[0]);
        return {};
      },
    };
    const popResult = { entities: [{ entityId: 'E1' }] };
    const allFields = [{ column: 'name' }];

    await stepExcludeNonContractFields(client, popResult, allFields, null);
    assert.deepEqual(updated, [], 'null schemaRawData → extractedColumns is empty → nothing excluded');
  });

  it('returns the count of excluded fields', async () => {
    const client = {
      query: async (sql) => {
        if (sql.includes('SELECT')) {
          return { rows: [
            { etgo_sf_field_id: 'FA', columnname: 'col_a' },
            { etgo_sf_field_id: 'FB', columnname: 'col_b' },
          ]};
        }
        return {};
      },
    };
    const popResult = { entities: [{ entityId: 'E1' }] };
    const allFields = [];
    const schemaRawData = { entities: [{ fields: [{ columnName: 'col_a' }, { columnName: 'col_b' }] }] };

    const count = await stepExcludeNonContractFields(client, popResult, allFields, schemaRawData);
    assert.equal(count, 2);
  });
});

// ---------------------------------------------------------------------------
// 10. extractFieldsFromContract — tabId / tableName propagation
// ---------------------------------------------------------------------------

describe('extractFieldsFromContract — tabId and tableName propagation', () => {
  it('propagates tabId from entity onto each field', () => {
    const contract = {
      entities: {
        header: {
          tabId: 'TAB-99',
          fields: [
            { name: 'docNo', column: 'DocumentNo', visibility: 'readOnly' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields[0].tabId, 'TAB-99');
  });

  it('propagates tableName from entity onto each field', () => {
    const contract = {
      entities: {
        header: {
          tableName: 'C_Order',
          fields: [
            { name: 'docNo', column: 'DocumentNo', visibility: 'readOnly' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields[0].tableName, 'C_Order');
  });

  it('sets tabId to null when entity has no tabId', () => {
    const contract = {
      entities: {
        header: {
          fields: [{ name: 'f', column: 'C', visibility: 'editable' }],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields[0].tabId, null);
  });

  it('sets tableName to null when entity has no tableName', () => {
    const contract = {
      entities: {
        header: {
          fields: [{ name: 'f', column: 'C', visibility: 'editable' }],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields[0].tableName, null);
  });

  it('handles an entity with an empty fields array', () => {
    const contract = {
      entities: {
        emptyEntity: { fields: [] },
        realEntity: { fields: [{ name: 'x', column: 'X', visibility: 'editable' }] },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 1);
    assert.equal(fields[0].entityName, 'realEntity');
  });
});

// ---------------------------------------------------------------------------
// 11. checkDuplicateFields — mock client
// ---------------------------------------------------------------------------

describe('checkDuplicateFields', () => {
  it('returns empty array when no duplicates exist', async () => {
    const client = {
      query: async () => ({ rows: [] }),
    };
    const result = await checkDuplicateFields(client, 'sales-order');
    assert.deepStrictEqual(result, []);
  });

  it('returns duplicate records with entityName, columnName, fieldIds', async () => {
    const client = {
      query: async () => ({
        rows: [
          { entity_name: 'header', column_name: 'DocumentNo', field_ids: ['ID1', 'ID2'] },
        ],
      }),
    };
    const result = await checkDuplicateFields(client, 'sales-order');
    assert.equal(result.length, 1);
    assert.equal(result[0].entityName, 'header');
    assert.equal(result[0].columnName, 'DocumentNo');
    assert.deepStrictEqual(result[0].fieldIds, ['ID1', 'ID2']);
  });

  it('returns multiple duplicates when several columns conflict', async () => {
    const client = {
      query: async () => ({
        rows: [
          { entity_name: 'header', column_name: 'DocumentNo', field_ids: ['A1', 'A2'] },
          { entity_name: 'line',   column_name: 'Line',        field_ids: ['B1', 'B2', 'B3'] },
        ],
      }),
    };
    const result = await checkDuplicateFields(client, 'sales-order');
    assert.equal(result.length, 2);
    assert.equal(result[1].fieldIds.length, 3);
  });
});

// ---------------------------------------------------------------------------
// 12. formatDuplicateFieldsError — pure function
// ---------------------------------------------------------------------------

describe('formatDuplicateFieldsError', () => {
  it('includes the spec name in the error message', () => {
    const msg = formatDuplicateFieldsError('sales-order', [
      { entityName: 'header', columnName: 'DocumentNo', fieldIds: ['K1', 'D1'] },
    ]);
    assert.match(msg, /sales-order/);
  });

  it('marks the first fieldId as keep and subsequent ones as delete', () => {
    const msg = formatDuplicateFieldsError('my-spec', [
      { entityName: 'h', columnName: 'DocNo', fieldIds: ['KEEP', 'DEL1', 'DEL2'] },
    ]);
    assert.match(msg, /keep:\s+KEEP/);
    assert.match(msg, /delete:\s+DEL1/);
    assert.match(msg, /delete:\s+DEL2/);
  });

  it('includes a suggested DELETE SQL statement', () => {
    const msg = formatDuplicateFieldsError('my-spec', [
      { entityName: 'h', columnName: 'DocNo', fieldIds: ['K', 'D'] },
    ]);
    assert.match(msg, /DELETE FROM etgo_sf_field/);
    assert.match(msg, /'D'/);
  });

  it('handles zero duplicates (empty array) gracefully', () => {
    const msg = formatDuplicateFieldsError('clean-spec', []);
    assert.match(msg, /clean-spec/);
    // No keep/delete lines expected
    assert.doesNotMatch(msg, /keep:/);
  });

  it('references the spec in the regen reminder at the end', () => {
    const msg = formatDuplicateFieldsError('purchase-order', [
      { entityName: 'e', columnName: 'c', fieldIds: ['K', 'D'] },
    ]);
    assert.match(msg, /purchase-order/);
    assert.match(msg, /make regen/);
  });
});

// ---------------------------------------------------------------------------
// 13. pushProcessToNeo — dry run and error paths
// ---------------------------------------------------------------------------

describe('pushProcessToNeo dry run', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `push-process-test-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'generate-invoices');
    await mkdir(artifactsDir, { recursive: true });

    const contract = {
      type: 'process',
      process: {
        id: 'PROC-001',
        specName: 'generate-invoices',
        name: 'Generate Invoices',
      },
    };
    await writeFile(join(artifactsDir, 'contract.json'), JSON.stringify(contract));
  });

  it('returns dry-run plan without touching DB', async () => {
    const result = await pushProcessToNeo('generate-invoices', {
      dryRun: true,
      projectRoot: tmpDir,
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.specName, 'generate-invoices');
    assert.equal(result.processId, 'PROC-001');
  });

  it('plan spec action is upsertSpec', async () => {
    const result = await pushProcessToNeo('generate-invoices', {
      dryRun: true,
      projectRoot: tmpDir,
    });
    assert.equal(result.plan.spec.action, 'upsertSpec');
    assert.equal(result.plan.spec.params.specType, 'P');
    assert.equal(result.plan.spec.params.processId, 'PROC-001');
  });

  it('plan populate action is populateSpec', async () => {
    const result = await pushProcessToNeo('generate-invoices', {
      dryRun: true,
      projectRoot: tmpDir,
    });
    assert.equal(result.plan.populate.action, 'populateSpec');
  });

  it('uses specType=R (report) when options.specType is R', async () => {
    const result = await pushProcessToNeo('generate-invoices', {
      dryRun: true,
      projectRoot: tmpDir,
      specType: 'R',
    });
    assert.equal(result.plan.spec.params.specType, 'R');
  });
});

describe('pushProcessToNeo error handling', () => {
  it('throws when contract.json is missing', async () => {
    const tmpDir = join(tmpdir(), `push-process-err-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'no-contract');
    await mkdir(artifactsDir, { recursive: true });

    await assert.rejects(
      () => pushProcessToNeo('no-contract', { dryRun: true, projectRoot: tmpDir }),
      /Cannot read contract\.json for process/,
    );
  });

  it('throws when contract.type is not process', async () => {
    const tmpDir = join(tmpdir(), `push-process-type-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'bad-type');
    await mkdir(artifactsDir, { recursive: true });

    const contract = {
      type: 'window',
      process: { id: 'X', specName: 'x', name: 'X' },
    };
    await writeFile(join(artifactsDir, 'contract.json'), JSON.stringify(contract));

    await assert.rejects(
      () => pushProcessToNeo('bad-type', { dryRun: true, projectRoot: tmpDir }),
      /expected 'process'/,
    );
  });
});

// ---------------------------------------------------------------------------
// 14. pushReportToNeo — dry run and error path
// ---------------------------------------------------------------------------

describe('pushReportToNeo dry run', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `push-report-test-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'aging-receivable');
    await mkdir(artifactsDir, { recursive: true });

    const contract = {
      reportId: 'aging-receivable',
      title: { en_US: 'Aging Receivable' },
      neo: { handler: 'aging-receivable-handler' },
      jasper: { processId: null },
    };
    await writeFile(join(artifactsDir, 'report-contract.json'), JSON.stringify(contract));
  });

  it('returns dry-run result without touching DB', async () => {
    const result = await pushReportToNeo('aging-receivable', {
      dryRun: true,
      projectRoot: tmpDir,
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.specName, 'aging-receivable');
    assert.equal(result.handler, 'aging-receivable-handler');
  });

  it('uses reportId as specName', async () => {
    const result = await pushReportToNeo('aging-receivable', {
      dryRun: true,
      projectRoot: tmpDir,
    });
    assert.equal(result.specName, 'aging-receivable');
  });

  it('falls back to reportName when reportId is absent', async () => {
    const tmpDir2 = join(tmpdir(), `push-report-fallback-${Date.now()}`);
    const artifactsDir = join(tmpDir2, 'artifacts', 'my-report');
    await mkdir(artifactsDir, { recursive: true });

    const contract = {
      // no reportId — falls back to the folder name
      title: { en_US: 'My Report' },
      neo: {},
    };
    await writeFile(join(artifactsDir, 'report-contract.json'), JSON.stringify(contract));

    const result = await pushReportToNeo('my-report', {
      dryRun: true,
      projectRoot: tmpDir2,
    });
    assert.equal(result.specName, 'my-report');
    assert.equal(result.handler, null);
  });
});

describe('pushReportToNeo error handling', () => {
  it('throws when report-contract.json is missing', async () => {
    const tmpDir = join(tmpdir(), `push-report-err-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'no-report');
    await mkdir(artifactsDir, { recursive: true });

    await assert.rejects(
      () => pushReportToNeo('no-report', { dryRun: true, projectRoot: tmpDir }),
      /Cannot read report-contract\.json/,
    );
  });
});

// ---------------------------------------------------------------------------
// 15. loadConfig — error paths (missing URL / user / password)
// ---------------------------------------------------------------------------

describe('loadConfig error paths', () => {
  const savedUrl = process.env.ETENDO_URL;
  const savedUser = process.env.ETENDO_USER;
  const savedPass = process.env.ETENDO_PASSWORD;

  const cleanup = () => {
    if (savedUrl !== undefined) process.env.ETENDO_URL = savedUrl; else delete process.env.ETENDO_URL;
    if (savedUser !== undefined) process.env.ETENDO_USER = savedUser; else delete process.env.ETENDO_USER;
    if (savedPass !== undefined) process.env.ETENDO_PASSWORD = savedPass; else delete process.env.ETENDO_PASSWORD;
  };

  it('throws when URL is missing (no env, no file)', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const emptyDir = join(tmpdir(), `cfg-err-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });

    try {
      await assert.rejects(
        () => loadConfig(emptyDir),
        /Missing Etendo URL/,
      );
    } finally {
      cleanup();
    }
  });

  it('throws when user is missing', async () => {
    const tmpDir = join(tmpdir(), `cfg-nouser-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'schema_forge.properties'),
      'etendo.url=http://host:8080/etendo\n',
    );
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;

    try {
      await assert.rejects(
        () => loadConfig(tmpDir),
        /Missing Etendo user/,
      );
    } finally {
      cleanup();
    }
  });

  it('throws when password is missing', async () => {
    const tmpDir = join(tmpdir(), `cfg-nopass-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      join(tmpDir, 'schema_forge.properties'),
      'etendo.url=http://host:8080/etendo\netendo.user=admin\n',
    );
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;

    try {
      await assert.rejects(
        () => loadConfig(tmpDir),
        /Missing Etendo password/,
      );
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 16. dumpDelta — missing outPath guard
// ---------------------------------------------------------------------------

describe('dumpDelta', () => {
  it('throws when options is missing', async () => {
    await assert.rejects(
      () => dumpDelta('sales-order', undefined),
      /options\.outPath is required/,
    );
  });

  it('throws when options.outPath is not provided', async () => {
    await assert.rejects(
      () => dumpDelta('sales-order', {}),
      /options\.outPath is required/,
    );
  });

  it('throws when contract.json is missing even with outPath set', async () => {
    const tmpDir = join(tmpdir(), `dump-delta-err-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'no-window');
    await mkdir(artifactsDir, { recursive: true });

    await assert.rejects(
      () => dumpDelta('no-window', { outPath: join(tmpDir, 'out.json'), projectRoot: tmpDir }),
      /Cannot read contract\.json/,
    );
  });

  it('throws when specType is not W (non-window spec)', async () => {
    const tmpDir = join(tmpdir(), `dump-delta-type-${Date.now()}`);
    const artifactsDir = join(tmpDir, 'artifacts', 'my-process');
    await mkdir(artifactsDir, { recursive: true });

    const contract = {
      specType: 'P',
      backendContract: { entities: {} },
    };
    const schema = { window: { id: '1', name: 'Process' } };
    await writeFile(join(artifactsDir, 'contract.json'), JSON.stringify(contract));
    await writeFile(join(artifactsDir, 'schema-raw.json'), JSON.stringify(schema));

    await assert.rejects(
      () => dumpDelta('my-process', { outPath: join(tmpDir, 'out.json'), projectRoot: tmpDir }),
      /specType=W/,
    );
  });
});
