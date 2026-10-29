// @covers scripts/generate-base-public-api-manifest.mjs
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertNoFieldMapping,
  buildEntity,
  fiscalMonitorWindows,
  generateManifest,
  inputFieldsOf,
  isCurated,
  exposurePolicyOf,
  isLinesEntity,
  isPublicField,
  neverExposedFields,
  publicFieldName,
  publicFunctionalText,
} from '../generate-base-public-api-manifest.mjs';

const functional = {
  functionalName: 'Window',
  functionalSummary: 'Summary',
  functionalCapabilities: [],
  functionalDoc: null,
};

function contractFor(specName, fields, { methods = ['GET', 'POST', 'PUT', 'DELETE'], entityName = 'header' } = {}) {
  return {
    version: '1.0.0',
    frontendContract: {
      window: { name: specName, primaryEntity: entityName, category: 'sales' },
      entities: { [entityName]: { tableName: `${specName}_table`, tabName: 'Header', fields } },
    },
    backendContract: {
      entities: { [entityName]: { tableName: `${specName}_table` } },
      endpoints: methods.map((method) => ({ entity: entityName, method })),
      processEndpoints: [],
    },
  };
}

function build(specName, fields, options) {
  return buildEntity({
    specName,
    entityName: options?.entityName ?? 'header',
    contract: contractFor(specName, fields, options),
    functional,
    parent: null,
    rawEntity: null,
  });
}

const formFields = [
  { name: 'documentNo', visibility: 'readOnly', form: true, type: 'string' },
  { name: 'orderDate', visibility: 'editable', form: true, type: 'date' },
  { name: 'businessPartner', visibility: 'editable', type: 'foreignKey', reference: 'BusinessPartner' },
  { name: 'listOnlyTotal', visibility: 'readOnly', form: false, type: 'amount' },
  { name: 'hiddenEverywhere', visibility: 'readOnly', form: false, grid: false, type: 'string' },
  { name: 'gridOnlyEditable', visibility: 'editable', form: false, type: 'string' },
  { name: 'processed', visibility: 'system', form: true, type: 'boolean' },
  { name: 'legacyField', visibility: 'discarded', form: true, type: 'string' },
];

describe('isCurated', () => {
  it('is true only when at least one field declares publicApi.exposed: true', () => {
    assert.equal(isCurated({ fields: [{ name: 'a', publicApi: { exposed: true } }] }), true);
    assert.equal(isCurated({ fields: [{ name: 'a', publicApi: { exposed: false } }, { name: 'b' }] }), false);
    assert.equal(isCurated({ fields: [] }), false);
    assert.equal(isCurated(undefined), false);
  });
});

describe('isPublicField', () => {
  it('never publishes system, discarded or excluded fields, curated or not', () => {
    for (const curated of [true, false]) {
      const options = { curated, specName: 'sales-order' };
      assert.equal(isPublicField({ name: 'x', visibility: 'system', publicApi: { exposed: true } }, options), false);
      assert.equal(isPublicField({ name: 'x', visibility: 'discarded', publicApi: { exposed: true } }, options), false);
      for (const name of neverExposedFields) {
        assert.equal(isPublicField({ name, visibility: 'editable', publicApi: { exposed: true } }, options), false);
      }
    }
  });

  it('keeps the tenant, the organization, the portal-access grant, bank data and bulk-posting fields excluded', () => {
    for (const name of [
      'client',
      'organization',
      'grantPortalAccess',
      'accountNo',
      'bankName',
      'displayedAccount',
      'iBAN',
      'swiftCode',
      'etblkpAccountingstatus',
      'etblkpBulkposting',
    ]) {
      assert.ok(neverExposedFields.has(name), name);
    }
  });
});

describe('buildEntity — non-curated entity derives its form and read-only list fields', () => {
  it('publishes form fields and read-only list fields, skipping editable grid-only, hidden, system and discarded', () => {
    const entity = build('sales-order', formFields);
    assert.deepEqual(Object.keys(entity.fields).sort(), [
      'business_partner',
      'document_no',
      'id',
      'list_only_total',
      'order_date',
    ]);
  });

  it('publishes a read-only list-only field as out, and never an editable form:false one', () => {
    const { fields } = build('sales-order', formFields);
    assert.equal(fields.list_only_total.direction, 'out');
    assert.equal(fields.list_only_total.sourceVisibility, 'readOnly');
    assert.equal(fields.grid_only_editable, undefined);
    assert.equal(fields.hidden_everywhere, undefined);
  });

  it('marks editable fields inout and readOnly fields out when the entity accepts writes', () => {
    const { fields } = build('sales-order', formFields);
    assert.equal(fields.order_date.direction, 'inout');
    assert.equal(fields.business_partner.direction, 'inout');
    assert.equal(fields.document_no.direction, 'out');
    assert.equal(fields.order_date.internalPath, 'orderDate');
    assert.equal(fields.order_date.sourceVisibility, 'editable');
    assert.deepEqual(fields.order_date.dataType, { type: 'string', format: 'date' });
  });

  it('marks every derived field out when the entity has no write endpoint', () => {
    const { fields } = build('matched-purchase-invoices', formFields, { methods: ['GET'] });
    assert.equal(fields.order_date.direction, 'out');
    assert.equal(fields.document_no.direction, 'out');
  });

  it('drops excluded fields even when the form shows them', () => {
    const { fields } = build('project', [
      { name: 'client', visibility: 'editable', form: true, type: 'foreignKey' },
      { name: 'grantPortalAccess', visibility: 'editable', form: true, type: 'boolean' },
      { name: 'code', visibility: 'editable', form: true, type: 'string' },
    ]);
    assert.deepEqual(Object.keys(fields).sort(), ['code', 'id']);
  });
});

describe('buildEntity — curated entity keeps its curation', () => {
  it('publishes only curated fields, ignoring the rest of its form', () => {
    // listOnlyTotal is read-only and shown in the list, but curation wins.
    const curatedFields = formFields.map((field) =>
      field.name === 'orderDate' ? { ...field, publicApi: { exposed: true, name: 'date' } } : field
    );
    const entity = build('contacts', curatedFields);
    assert.deepEqual(Object.keys(entity.fields).sort(), ['date', 'id']);
    assert.equal(entity.fields.date.internalPath, 'orderDate');
  });
});

describe('buildEntity — API-only input fields declared in decisions.json', () => {
  const decisions = { entities: { header: { publicApi: { inputFields: [
    { name: 'city_name', internalPath: 'cityName', dataType: 'string', readable: true },
    { name: 'secret_note', internalPath: 'secretNote', dataType: 'string', required: true },
  ] } } } };
  const curatedFields = [{ name: 'orderDate', visibility: 'editable', type: 'date', publicApi: { exposed: true, name: 'date' } }];

  it('reads the list from the entity decisions and ignores a missing one', () => {
    assert.equal(inputFieldsOf(decisions, 'header').length, 2);
    assert.deepEqual(inputFieldsOf(decisions, 'lines'), []);
    assert.deepEqual(inputFieldsOf(null, 'header'), []);
  });

  it('publishes them writable: inout when GET returns the value, in otherwise', () => {
    const entity = buildEntity({
      specName: 'contacts', entityName: 'header', contract: contractFor('contacts', curatedFields),
      functional, parent: null, rawEntity: null, inputFields: inputFieldsOf(decisions, 'header'),
    });
    assert.equal(entity.fields.city_name.direction, 'inout');
    assert.equal(entity.fields.city_name.internalPath, 'cityName');
    assert.equal(entity.fields.secret_note.direction, 'in');
    assert.equal(entity.fields.secret_note.required, true);
    assert.equal(entity.fields.date.internalPath, 'orderDate');
  });

  it('publishes none on a resource without write endpoints', () => {
    const entity = buildEntity({
      specName: 'contacts', entityName: 'header', contract: contractFor('contacts', curatedFields, { methods: ['GET'] }),
      functional, parent: null, rawEntity: null, inputFields: inputFieldsOf(decisions, 'header'),
    });
    assert.equal(entity.fields.city_name, undefined);
  });

  it('rejects a name that collides with a published field', () => {
    assert.throws(() => buildEntity({
      specName: 'contacts', entityName: 'header', contract: contractFor('contacts', curatedFields),
      functional, parent: null, rawEntity: null, inputFields: [{ name: 'date', internalPath: 'x' }],
    }), /collision/);
  });
});

describe('buildEntity — fiscal monitors are not derived', () => {
  it('publishes no form field for any fiscal monitor without curation', () => {
    for (const specName of fiscalMonitorWindows) {
      const entity = build(specName, formFields);
      assert.deepEqual(Object.keys(entity.fields), ['id'], specName);
      assert.deepEqual(entity.operations, ['GET', 'LIST'], specName);
      assert.equal(entity.group, 'Fiscal Monitors', specName);
    }
  });

  it('covers the three monitors owned by the localization team', () => {
    assert.deepEqual([...fiscalMonitorWindows].sort(), ['monitor-verifactu', 'sii-monitor', 'tbai-facturas-enviadas']);
  });

  it('publishes the curation of a curated fiscal monitor, still without excluded fields', () => {
    const entity = build('sii-monitor', [
      { name: 'documentNo', visibility: 'readOnly', form: true, type: 'string', publicApi: { exposed: true } },
      { name: 'client', visibility: 'readOnly', form: true, type: 'foreignKey', publicApi: { exposed: true } },
      { name: 'orderDate', visibility: 'editable', form: true, type: 'date' },
    ]);
    assert.deepEqual(Object.keys(entity.fields).sort(), ['document_no', 'id']);
    assert.deepEqual(entity.operations, ['GET', 'LIST']);
  });
});

describe('buildEntity — operations', () => {
  it('makes a resource with no writable field read-only, even if its window accepts writes', () => {
    const entity = build('matched-purchase-invoices', [
      { name: 'quantity', visibility: 'readOnly', form: true, type: 'decimal' },
      { name: 'processed', visibility: 'readOnly', form: true, type: 'boolean' },
    ]);
    assert.deepEqual(entity.operations, ['GET', 'LIST']);
  });

  it('keeps every write operation, PATCH included, when the resource has a writable field', () => {
    const entity = build('sales-order', formFields);
    assert.deepEqual([...entity.operations].sort(), ['DELETE', 'GET', 'LIST', 'PATCH', 'POST', 'PUT']);
  });
});

describe('buildEntity — conservative base exposure', () => {
  const completeContract = () => {
    const contract = contractFor('sales-order', formFields);
    contract.frontendContract.entities.header.draftMode = {
      enabled: true, processField: 'documentAction', processValue: 'CO',
    };
    return contract;
  };
  const buildWith = (decisions) => buildEntity({
    specName: 'sales-order', entityName: 'header', contract: completeContract(), functional,
    parent: null, rawEntity: null, policy: exposurePolicyOf(decisions, 'header'),
  });

  it('publishes no action unless the window opts in with window.publicApi.actions', () => {
    assert.deepEqual(buildWith(null).processes, []);
    assert.deepEqual(buildWith({ window: { publicApi: {} } }).processes, []);
    assert.deepEqual(buildWith({ window: { publicApi: { actions: [] } } }).processes, []);
    const entity = buildWith({ window: { publicApi: { actions: ['complete'] } } });
    assert.deepEqual(entity.processes.map((process) => process.action), ['complete']);
  });

  it('never publishes actions on a fiscal monitor, whatever the decisions say', () => {
    const contract = completeContract();
    const entity = buildEntity({
      specName: [...fiscalMonitorWindows][0], entityName: 'header', contract, functional,
      parent: null, rawEntity: null, policy: { actions: ['complete'], readOnly: false, readOnlyFields: new Set() },
    });
    assert.deepEqual(entity.processes, []);
  });

  it('publishes an entity with publicApi.readOnly as GET/LIST with every field out', () => {
    const decisions = { entities: { exchangeRates: { publicApi: { readOnly: true } } } };
    const policy = exposurePolicyOf(decisions, 'exchangeRates');
    assert.equal(policy.readOnly, true);
    const contract = contractFor('sales-invoice', formFields, { entityName: 'exchangeRates' });
    const entity = buildEntity({ specName: 'sales-invoice', entityName: 'exchangeRates', contract, functional, parent: null, rawEntity: null, policy });
    assert.deepEqual(entity.operations, ['GET', 'LIST']);
    assert.ok(Object.values(entity.fields).every((field) => field.direction === 'out'));
    assert.equal(exposurePolicyOf(decisions, 'header').readOnly, false);
  });

  it('publishes a field with publicApi.readOnly as out while the other editable fields stay inout', () => {
    const fields = [
      { name: 'searchKey', visibility: 'editable', form: true, type: 'string' },
      { name: 'name', visibility: 'editable', form: true, type: 'string' },
    ];
    const byField = exposurePolicyOf({ entities: { header: { fields: { searchKey: { publicApi: { readOnly: true } } } } } }, 'header');
    const byList = exposurePolicyOf({ entities: { header: { publicApi: { readOnlyFields: ['searchKey'] } } } }, 'header');
    for (const policy of [byField, byList]) {
      const entity = buildEntity({ specName: 'contacts', entityName: 'header', contract: contractFor('contacts', fields), functional, parent: null, rawEntity: null, policy });
      assert.equal(entity.fields.search_key.direction, 'out');
      assert.equal(entity.fields.name.direction, 'inout');
    }
    assert.equal(build('product', fields).fields.search_key.direction, 'inout');
  });

  it('marks a writable field declared publicApi.required, and never a read-only one', () => {
    const fields = [
      { name: 'searchKey', visibility: 'editable', form: true, type: 'string' },
      { name: 'name', visibility: 'editable', form: true, type: 'string' },
      { name: 'description', visibility: 'editable', form: true, type: 'string' },
    ];
    const policy = exposurePolicyOf({ entities: { header: { fields: {
      searchKey: { publicApi: { required: true } },
      name: { publicApi: { required: true, readOnly: true } },
    } } } }, 'header');
    const entity = buildEntity({ specName: 'product', entityName: 'header', contract: contractFor('product', fields), functional, parent: null, rawEntity: null, policy });
    assert.equal(entity.fields.search_key.required, true);
    assert.equal(entity.fields.name.required, undefined, 'a read-only field is never required on write');
    assert.equal(entity.fields.description.required, undefined);
  });

  it('lets a read-only field work on a curated entity too', () => {
    const fields = [
      { name: 'searchKey', visibility: 'editable', type: 'string', publicApi: { exposed: true } },
      { name: 'name', visibility: 'editable', type: 'string', publicApi: { exposed: true } },
    ];
    const policy = exposurePolicyOf({ entities: { header: { fields: { searchKey: { publicApi: { readOnly: true } } } } } }, 'header');
    const entity = buildEntity({ specName: 'contacts', entityName: 'header', contract: contractFor('contacts', fields), functional, parent: null, rawEntity: null, policy });
    assert.equal(entity.fields.search_key.direction, 'out');
    assert.equal(entity.fields.name.direction, 'inout');
  });

  it('recognizes the lines entity by its key plus the window linesLayout', () => {
    assert.equal(isLinesEntity('lines', { linesLayout: 'inlineEditable' }), true);
    assert.equal(isLinesEntity('lines', {}), false);
    assert.equal(isLinesEntity('exchangeRates', { linesLayout: 'inlineEditable' }), false);
  });
});

describe('generateManifest — lines survive explicit child visibility', () => {
  let root;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'public-api-manifest-lines-'));
    const tab = (tableName) => ({ tableName, tabName: tableName, fields: [{ name: 'description', visibility: 'editable', form: true, type: 'string' }] });
    const contract = {
      version: '1.0.0',
      frontendContract: {
        window: { name: 'Doc', primaryEntity: 'header', category: 'sales', linesLayout: 'inlineEditable' },
        entities: { header: tab('d_head'), lines: tab('d_line'), exchangeRates: tab('d_rate'), other: tab('d_other') },
      },
      backendContract: {
        entities: {},
        endpoints: ['header', 'lines', 'exchangeRates', 'other'].flatMap((entity) => ['POST', 'PUT'].map((method) => ({ entity, method }))),
        processEndpoints: [],
      },
    };
    const child = (tableName) => ({
      tableName,
      fields: [
        { name: 'id', type: 'id', visibility: 'system', columnName: `${tableName}_id` },
        { name: 'doc', type: 'foreignKey', visibility: 'system', reference: { targetTable: 'd_head', keyColumn: 'd_head_id' } },
      ],
    });
    mkdirSync(join(root, 'doc'), { recursive: true });
    writeFileSync(join(root, 'doc', 'contract.json'), JSON.stringify(contract));
    writeFileSync(join(root, 'doc', 'decisions.json'), JSON.stringify({ window: { secondaryTabs: { exchangeRates: {} } } }));
    writeFileSync(join(root, 'doc', 'schema-raw.json'), JSON.stringify({
      entities: [
        { tableName: 'd_head', fields: [{ name: 'id', type: 'id', visibility: 'system', columnName: 'd_head_id' }] },
        child('d_line'), child('d_rate'), child('d_other'),
      ],
    }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('keeps lines with CRUD next to the declared secondary tabs, and still drops undeclared children', async () => {
    const { entities } = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'none') });
    assert.deepEqual(Object.keys(entities).sort(), ['doc', 'doc-exchangeRates', 'doc-lines']);
    assert.deepEqual([...entities['doc-lines'].operations].sort(), ['GET', 'LIST', 'PATCH', 'POST', 'PUT']);
  });
});

describe('publicFunctionalText', () => {
  it('drops capability lines and summary sentences that cite a ticket or Jira', () => {
    const { summary, capabilities } = publicFunctionalText({
      summary: 'Register receipts. Totals follow ETP-1234. Lines are editable.',
      capabilities: ['Create a receipt', 'Reactivate (agreed in a Jira comment by a teammate)', 'Undo per ETP-42', 'Print'],
    });
    assert.equal(summary, 'Register receipts. Lines are editable.');
    assert.deepEqual(capabilities, ['Create a receipt', 'Print']);
  });

  it('returns an empty summary when every sentence is internal, so the caller can fall back', () => {
    assert.equal(publicFunctionalText({ summary: 'See ETP-1.', capabilities: [] }).summary, '');
  });
});

describe('buildEntity — public names', () => {
  it('fails the generation on a public name collision among derived fields', () => {
    assert.throws(
      () => build('sales-order', [
        { name: 'taxId', visibility: 'editable', form: true, type: 'string' },
        { name: 'taxID', visibility: 'editable', form: true, type: 'string' },
      ]),
      /Public field name collision in sales-order\/header: tax_id/
    );
  });

  it('derives readable snake_case names, including acronym overrides', () => {
    assert.equal(publicFieldName('iBAN'), 'iban');
    assert.equal(publicFieldName('uOM'), 'uom');
    assert.equal(publicFieldName('movementQuantity'), 'movement_quantity');
    assert.equal(publicFieldName('pOPaymentTerms'), 'purchase_payment_terms');
    assert.equal(publicFieldName('etgoCurrency'), 'currency');
  });
});

function writeArtifact(root, specName, contract, { rawSchema = true } = {}) {
  mkdirSync(join(root, specName), { recursive: true });
  writeFileSync(join(root, specName, 'contract.json'), JSON.stringify(contract));
  if (!rawSchema) return;
  const tableName = Object.values(contract.frontendContract.entities)[0].tableName;
  writeFileSync(join(root, specName, 'schema-raw.json'), JSON.stringify({
    entities: [{ tableName, fields: [{ name: 'id', type: 'id', visibility: 'system' }, { name: 'updated', type: 'datetime', visibility: 'system' }] }],
  }));
}

describe('generateManifest', () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'public-api-manifest-'));
    const write = (specName, contract) => writeArtifact(root, specName, contract);
    write('sales-order', contractFor('sales-order', formFields));
    write('contacts', contractFor('contacts', [
      { name: 'name', visibility: 'editable', form: true, type: 'string', publicApi: { exposed: true } },
      { name: 'comments', visibility: 'editable', form: true, type: 'string' },
    ], { entityName: 'businessPartner' }));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('records the field-selection policy and the excluded fields', async () => {
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.equal(manifest.policy.fieldSelection, 'curated-publicApi-else-form-plus-readonly-list');
    assert.deepEqual(manifest.policy.excludedFields, [...neverExposedFields]);
    assert.equal(manifest.policy.failClosed, true);
  });

  it('turns a derived foreign key into a relationship when the target resource is public', async () => {
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.deepEqual(manifest.entities['sales-order'].fields.business_partner.relationship, {
      resource: 'contacts',
      cardinality: 'one',
      foreignKey: 'business_partner',
    });
    assert.deepEqual(Object.keys(manifest.entities.contacts.fields).sort(), ['id', 'name', 'updated']);
  });
});

describe('generateManifest — schema-raw.json is required', () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'public-api-manifest-raw-'));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('fails, naming the file, when a published window has no schema-raw.json', async () => {
    writeArtifact(root, 'sales-order', contractFor('sales-order', formFields), { rawSchema: false });
    await assert.rejects(
      generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') }),
      /Missing .*sales-order\/schema-raw\.json.*gitignored/s
    );
    rmSync(join(root, 'sales-order'), { recursive: true, force: true });
  });

  it('does not publish the legacy windows that have no NeoServlet spec', async () => {
    for (const specName of ['document', 'project', 'uom']) {
      writeArtifact(root, specName, contractFor(specName, formFields), { rawSchema: false });
    }
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.deepEqual(Object.keys(manifest.entities), []);
  });

  it('does not require schema-raw.json for windows that are not published', async () => {
    writeArtifact(root, 'absence', contractFor('absence', formFields), { rawSchema: false });
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.equal(manifest.entities.absence, undefined);
  });
});

describe('generateManifest — child tabs and functional texts', () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'public-api-manifest-children-'));
    const tab = (tableName, tabName) => ({ tableName, tabName, fields: [{ name: 'description', visibility: 'editable', form: true, type: 'string' }] });
    const contract = {
      version: '1.0.0',
      frontendContract: {
        window: { name: 'Contacts', primaryEntity: 'businessPartner', category: 'sales' },
        entities: {
          businessPartner: tab('c_bpartner', 'Business Partner'),
          bankAccount: tab('c_bp_bankaccount', 'Bank Account'),
          locationAddress: tab('c_bpartner_location', 'Location/Address'),
          addressNote: tab('c_bp_address_note', 'Address Note'),
        },
      },
      backendContract: {
        entities: {},
        endpoints: ['businessPartner', 'bankAccount', 'locationAddress', 'addressNote'].map((entity) => ({ entity, method: 'POST' })),
        processEndpoints: [],
      },
    };
    const child = (tableName) => ({
      tableName,
      fields: [
        { name: 'id', type: 'id', visibility: 'system', columnName: `${tableName}_id` },
        { name: 'businessPartner', type: 'foreignKey', visibility: 'system', reference: { targetTable: 'c_bpartner', keyColumn: 'c_bpartner_id' } },
      ],
    });
    mkdirSync(join(root, 'contacts'), { recursive: true });
    writeFileSync(join(root, 'contacts', 'contract.json'), JSON.stringify(contract));
    writeFileSync(join(root, 'contacts', 'schema-raw.json'), JSON.stringify({
      entities: [
        { tableName: 'c_bpartner', fields: [{ name: 'id', type: 'id', visibility: 'system', columnName: 'c_bpartner_id' }] },
        child('c_bp_bankaccount'),
        child('c_bpartner_location'),
        // A tab under a child tab (AD level 2), linked to the window's record as well.
        { ...child('c_bp_address_note'), level: 'subline' },
      ],
    }));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'contacts.md'), '# Contacts\n\n## Intent\nAgreed in ETP-99.\n\n## What this window should allow\n- Create a contact\n- Merge contacts (Jira thread)\n\n## Next\n');
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('does not publish the bank account tab nor a tab under a child tab, but keeps the other linked children', async () => {
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.deepEqual(Object.keys(manifest.entities).sort(), ['contacts', 'contacts-locationAddress']);
    assert.ok(manifest.policy.excludedChildTabs.includes('^bank account$'));
  });

  it('publishes no internal reference and falls back to the default summary', async () => {
    const { functional } = (await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') })).entities.contacts;
    assert.equal(functional.functionalSummary, 'Public API resource for the Contacts window.');
    assert.deepEqual(functional.functionalCapabilities, ['Create a contact']);
  });
});

describe('assertNoFieldMapping — removed publicApi type/handlerId keys', () => {
  const field = (publicApi) => ({ name: 'orderDate', visibility: 'editable', type: 'date', publicApi });

  for (const [key, value] of [['type', 'string'], ['handlerId', 'passthrough'], ['handlerId', null], ['type', null]]) {
    it(`throws naming the field and the key for ${key}=${JSON.stringify(value)}`, () => {
      assert.throws(
        () => assertNoFieldMapping(field({ exposed: true, name: 'x', [key]: value }), 'spec/header'),
        (err) => err instanceof Error && err.message.includes('spec/header.orderDate') && err.message.includes(`publicApi.${key}`)
      );
    });
  }

  it('does not throw for exposed/readOnly curation or a field without publicApi', () => {
    assert.doesNotThrow(() => assertNoFieldMapping(field({ exposed: true, name: 'x' }), 'spec/header'));
    assert.doesNotThrow(() => assertNoFieldMapping(field({ exposed: true, name: 'x', readOnly: true }), 'spec/header'));
    assert.doesNotThrow(() => assertNoFieldMapping(field(undefined), 'spec/header'));
  });

  it('buildEntity rejects the keys even on a field that would not be published', () => {
    const fields = [
      { name: 'orderDate', visibility: 'editable', publicApi: { exposed: true, name: 'date' } },
      { name: 'secret', visibility: 'discarded', publicApi: { handlerId: 'passthrough' } },
    ];
    assert.throws(() => build('contacts', fields), /contacts\/header\.secret.*publicApi\.handlerId/);
  });

  it('no emit site puts a type or handlerId key on a manifest field', () => {
    const curated = [{ name: 'orderDate', visibility: 'editable', type: 'date', publicApi: { exposed: true, name: 'date' } }];
    const inputFields = [
      { name: 'city_name', internalPath: 'cityName', dataType: 'string', readable: true },
      { name: 'secret_note', internalPath: 'secretNote', required: true },
    ];
    const rawEntity = { tableName: 'contacts_table', fields: [
      { name: 'contactId', type: 'id', visibility: 'system' },
      { name: 'updated', type: 'dateTime', visibility: 'system' },
    ] };
    const entities = [
      // curated field + input-param fields + synthetic id/updated from schema-raw
      buildEntity({ specName: 'contacts', entityName: 'header', contract: contractFor('contacts', curated),
        functional, parent: null, rawEntity, inputFields }),
      // fallback id (no raw schema)
      buildEntity({ specName: 'contacts', entityName: 'header', contract: contractFor('contacts', curated),
        functional, parent: null, rawEntity: null }),
    ];
    const published = entities.flatMap((entity) => Object.entries(entity.fields));
    const names = published.map(([name]) => name);
    for (const expected of ['date', 'city_name', 'secret_note', 'id', 'updated']) {
      assert.ok(names.includes(expected), `${expected} should be emitted`);
    }
    for (const [name, field] of published) {
      assert.equal(Object.hasOwn(field, 'type'), false, `${name} has a type key`);
      assert.equal(Object.hasOwn(field, 'handlerId'), false, `${name} has a handlerId key`);
    }
  });

  it('the committed public-api/base.v1.json has no field with type or handlerId', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public-api/base.v1.json', import.meta.url), 'utf8'));
    let checked = 0;
    for (const [entityName, entity] of Object.entries(manifest.entities)) {
      for (const [name, field] of Object.entries(entity.fields ?? {})) {
        checked += 1;
        assert.equal(Object.hasOwn(field, 'type'), false, `${entityName}.${name} has a type key`);
        assert.equal(Object.hasOwn(field, 'handlerId'), false, `${entityName}.${name} has a handlerId key`);
      }
    }
    assert.ok(checked > 0);
  });
});
