import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  toSpecName,
  mapVisibility,
  buildWebhookUrl,
  extractFieldsFromContract,
  pushToNeo,
  loadConfig,
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
