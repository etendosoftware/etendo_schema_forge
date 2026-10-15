// @covers scripts/generate-base-public-api-manifest.mjs
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  artifactsWithoutRawSchema,
  buildEntity,
  fiscalMonitorWindows,
  generateManifest,
  isCurated,
  isPublicField,
  neverExposedFields,
  publicFieldName,
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
  { name: 'gridOnlyTotal', visibility: 'readOnly', form: false, type: 'amount' },
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

  it('keeps the tenant, the portal-access grant, bank data and bulk-posting fields excluded', () => {
    for (const name of [
      'client',
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

describe('buildEntity — non-curated entity derives its window form', () => {
  it('publishes the form fields and skips grid-only, system and discarded fields', () => {
    const entity = build('sales-order', formFields);
    assert.deepEqual(Object.keys(entity.fields).sort(), ['business_partner', 'document_no', 'id', 'order_date']);
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
    const curatedFields = formFields.map((field) =>
      field.name === 'orderDate' ? { ...field, publicApi: { exposed: true, name: 'date' } } : field
    );
    const entity = build('contacts', curatedFields);
    assert.deepEqual(Object.keys(entity.fields).sort(), ['date', 'id']);
    assert.equal(entity.fields.date.internalPath, 'orderDate');
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
    assert.equal(manifest.policy.fieldSelection, 'curated-publicApi-else-window-form');
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

  it('tolerates the legacy artifacts published without schema-raw.json', async () => {
    assert.deepEqual([...artifactsWithoutRawSchema].sort(), ['document', 'project', 'uom']);
    writeArtifact(root, 'uom', contractFor('uom', formFields), { rawSchema: false });
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.deepEqual(Object.keys(manifest.entities.uom.fields).sort(), ['business_partner', 'document_no', 'id', 'order_date']);
  });

  it('does not require schema-raw.json for windows that are not published', async () => {
    writeArtifact(root, 'absence', contractFor('absence', formFields), { rawSchema: false });
    const manifest = await generateManifest({ artifactsRoot: root, functionalDocsRoot: join(root, 'docs') });
    assert.equal(manifest.entities.absence, undefined);
  });
});
