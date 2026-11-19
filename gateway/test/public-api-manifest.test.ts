// @covers public-api/base.v1.json
// @covers scripts/generate-base-public-api-manifest.mjs
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const manifest = JSON.parse(
  await readFile(new URL('../../public-api/base.v1.json', import.meta.url), 'utf8'),
);

test('publishes only explicitly curated fields for Contacts and Product', () => {
  assert.deepEqual(Object.keys(manifest.entities.contacts.fields).sort(), [
    'category',
    'email',
    'first_name',
    'id',
    'is_customer',
    'is_person',
    'is_vendor',
    'last_name',
    'name',
    'payment_method',
    'phone',
    'purchase_payment_method',
    'search_key',
    'tax_id',
    'tax_id_key',
    'updated',
    'web',
  ]);
  assert.deepEqual(Object.keys(manifest.entities.product.fields).sort(), [
    'category',
    'description',
    'id',
    'name',
    'sale_price',
    'search_key',
    'stock',
    'updated',
  ]);
});

test('publishes the seven UI selectors with their transaction context', () => {
  const lookups = Object.fromEntries(Object.entries(manifest.entities).flatMap(([resource, entity]: [string, any]) =>
    Object.entries(entity.fields).filter(([, field]: [string, any]) => field.lookup).map(([name, field]: [string, any]) => [`${resource}.${name}`, field.lookup])));
  assert.deepEqual(lookups, {
    // The lookup values are sent back as the contact-category relationship, so they carry its type.
    'contacts.category': { selector: 'businessPartnerCategory', type: 'contact-category', context: {} },
    'contacts.payment_method': { selector: 'paymentMethod', type: 'payment-method', context: { FIN_ISRECEIPT: 'Y' } },
    'contacts.purchase_payment_method': { selector: 'pOPaymentMethod', type: 'payment-method', context: { FIN_ISRECEIPT: 'N' } },
    'purchase-order.warehouse': { selector: 'warehouse', type: 'warehouse', context: {} },
    'sales-order.warehouse': { selector: 'warehouse', type: 'warehouse', context: {} },
    'purchase-order.payment_method': { selector: 'paymentMethod', type: 'payment-method', context: { IsSOTrx: 'N' } },
    'sales-order.payment_method': { selector: 'paymentMethod', type: 'payment-method', context: { IsSOTrx: 'Y' } },
  });
  for (const name of ['payment_method', 'purchase_payment_method']) {
    assert.equal(manifest.entities.contacts.fields[name].direction, 'inout', `contacts.${name} is writable`);
  }
});

test('publishes a contact as a person or a company: no field is required, the rules are described', () => {
  const fields = manifest.entities.contacts.fields;
  for (const name of ['name', 'first_name', 'last_name', 'is_person', 'tax_id_key', 'category', 'phone']) {
    assert.equal(fields[name].direction, 'inout', `contacts.${name} is writable`);
    assert.equal(fields[name].required, undefined, `contacts.${name} is not required in every case`);
  }
  assert.deepEqual(fields.is_person.dataType, { type: 'boolean' });
  assert.match(fields.name.description, /Required for a company/);
  assert.match(fields.name.description, /For a person Etendo derives it/);
  for (const name of ['first_name', 'last_name']) {
    assert.match(fields[name].description, /Required when is_person is true/);
    assert.match(fields[name].description, /Refused for a company/);
  }
  assert.equal(fields.tax_id_key.internalPath, 'oBTIKTaxIDKey');
  assert.equal(fields.tax_id_key.enumLabels['1'], 'NIF');
});

test('does not publish Contacts child tabs without explicit public API curation', () => {
  assert.equal(manifest.entities['contacts-costSalaryCategory'], undefined);
  assert.equal(manifest.entities['contacts-basicDiscount'], undefined);
});

test('publishes exactly the sixteen resources in the agreed V1 scope', () => {
  assert.deepEqual(Object.keys(manifest.entities).sort(), [
    'contact-category', 'contacts', 'contacts-contact', 'contacts-locationAddress', 'conversion-rates',
    'product', 'product-category', 'product-costing', 'purchase-order', 'purchase-order-lines',
    'sales-order', 'sales-order-lines', 'sales-quotation', 'sales-quotation-quotationLine',
    'tax', 'tax-category',
  ]);
  assert.deepEqual(manifest.entities['product-costing'].operations, ['GET', 'LIST']);
  assert.deepEqual(Object.keys(manifest.entities).filter((name) => name.startsWith('contacts-')).sort(),
    ['contacts-contact', 'contacts-locationAddress']);
});

test('publishes tax, tax category and conversion rates read-only, from windows outside the default categories', () => {
  for (const resource of ['tax', 'tax-category', 'conversion-rates']) {
    const entity = manifest.entities[resource];
    assert.deepEqual(entity.operations, ['GET', 'LIST'], resource);
    for (const [name, field] of Object.entries(entity.fields) as Array<[string, any]>) {
      assert.equal(field.direction, 'out', `${resource}.${name}`);
    }
  }
  assert.deepEqual(manifest.entities.tax.fields.tax_category.relationship, { resource: 'tax-category', cardinality: 'one', foreignKey: 'tax_category' });
  assert.equal(manifest.entities['tax-accounting'], undefined);
  const rates = manifest.entities['conversion-rates'].fields;
  assert.deepEqual(Object.keys(rates).sort(), [
    'currency', 'divide_rate_by', 'id', 'multiple_rate_by', 'to_currency', 'updated', 'valid_from_date', 'valid_to_date',
  ], 'curated: the downloader sync flag is not published');
  for (const name of ['multiple_rate_by', 'divide_rate_by']) {
    assert.deepEqual(rates[name].dataType, { type: 'number', format: 'double' }, `NEO answers a Rate as a JSON number: ${name}`);
  }
  for (const lines of ['sales-order-lines', 'purchase-order-lines', 'sales-quotation-quotationLine']) {
    const tax = manifest.entities[lines].fields.tax;
    assert.deepEqual(tax.relationship, { resource: 'tax', cardinality: 'one', foreignKey: 'tax' }, `${lines}.tax`);
    assert.equal(tax.direction, 'inout', `${lines}.tax stays writable`);
  }
  assert.equal(manifest.policy.windowSelection, 'allowlist-overrides-excluded-categories');
});

test('publishes the business partner category window as contact-category, writable, on its own NEO spec', () => {
  const category = manifest.entities['contact-category'];
  assert.equal(category.specName, 'business-partner-category', 'the gateway calls NEO with the spec, never the public name');
  assert.equal(category.entityName, 'businessPartnerCategory');
  assert.deepEqual([...category.operations].sort(), ['DELETE', 'GET', 'LIST', 'PATCH', 'POST', 'PUT']);
  assert.equal(category.fields.updated.direction, 'out');
  assert.deepEqual(Object.keys(category.fields).sort(), ['default', 'description', 'id', 'is_customer', 'name', 'search_key', 'updated']);
  assert.equal(category.fields.is_customer.internalPath, 'etgoIscustomer');
  for (const name of ['search_key', 'name']) assert.equal(category.fields[name].required, true, `contact-category.${name} is required`);
  for (const name of ['description', 'default', 'is_customer']) assert.equal(category.fields[name].required, undefined, name);
  assert.equal(manifest.entities['business-partner-category'], undefined);
  assert.equal(manifest.entities['contact-category-accounting'], undefined);
  assert.deepEqual(manifest.entities.contacts.fields.category.relationship, { resource: 'contact-category', cardinality: 'one', foreignKey: 'category' });
});

test('orders expose an optional warehouse attribute without a dangling warehouse relationship', () => {
  for (const resource of ['sales-order', 'purchase-order']) {
    const warehouse = manifest.entities[resource].fields.warehouse;
    assert.equal(warehouse.direction, 'inout');
    assert.equal(warehouse.required, undefined, 'Etendo assigns a warehouse on create when it is omitted');
    assert.equal(warehouse.relationship, undefined);
    assert.equal(warehouse.internalPath, 'warehouse');
  }
  for (const [resource, entity] of Object.entries(manifest.entities) as Array<[string, any]>) {
    for (const field of Object.values(entity.fields) as any[]) {
      if (field.relationship) assert.ok(manifest.entities[field.relationship.resource], resource);
    }
  }
});

const entities = Object.entries(manifest.entities) as Array<[string, any]>;

test('never publishes an excluded field and keeps updated read-only', () => {
  const excluded = new Set(manifest.policy.excludedFields);
  for (const [resource, entity] of entities) {
    for (const [name, field] of Object.entries(entity.fields) as Array<[string, any]>) {
      assert.equal(excluded.has(field.internalPath), false, `${resource}.${name}`);
    }
    if (entity.fields.updated) assert.equal(entity.fields.updated.direction, 'out', resource);
  }
});

test('every write-enabled resource has a writable field and publishes updated for If-Match', () => {
  const writes = ['POST', 'PUT', 'PATCH', 'DELETE'];
  for (const [resource, entity] of entities) {
    if (!entity.operations.some((operation: string) => writes.includes(operation))) continue;
    const fields = Object.values(entity.fields) as Array<{ direction: string }>;
    assert.ok(fields.some((field) => field.direction !== 'out'), `${resource} has no writable field`);
    assert.ok(entity.fields.updated, `${resource} accepts updates without a version`);
  }
});

test('publishes no internal ticket or Jira reference in the functional texts nor in a field description', () => {
  for (const [resource, entity] of entities) {
    const texts = [entity.functional.functionalSummary, ...entity.functional.functionalCapabilities];
    for (const field of Object.values(entity.fields) as any[]) if (field.description) texts.push(field.description);
    for (const text of texts) assert.doesNotMatch(text, /\bETP-\d+\b|\bjira\b/i, resource);
  }
});

test('publishes the codes of an AD list with a label each, and never on a reference', () => {
  const orderStatus = manifest.entities['sales-order'].fields.document_status;
  assert.ok(orderStatus.dataType.enum.includes('CO') && orderStatus.dataType.enum.includes('DR'));
  for (const [resource, entity] of entities) {
    for (const [name, field] of Object.entries(entity.fields) as Array<[string, any]>) {
      if (!field.dataType.enum) continue;
      assert.equal(field.dataType.type, 'string', `${resource}.${name}`);
      assert.equal(field.reference, null, `${resource}.${name}`);
      assert.deepEqual(Object.keys(field.enumLabels), field.dataType.enum, `${resource}.${name}`);
    }
  }
});

test('publishes only complete, and never on child resources', () => {
  // Actions are opt-in per window (window.publicApi.actions in decisions.json).
  for (const [name, entity] of Object.entries(manifest.entities) as Array<[string, any]>) {
    if (entity.parent) assert.deepEqual(entity.processes, [], name);
    for (const process of entity.processes) assert.equal(process.action, 'complete', name);
  }
});

test('preserves exactly the two order complete actions', () => {
  assert.deepEqual(Object.entries(manifest.entities).flatMap(([name, entity]: [string, any]) =>
    entity.processes.map((process: any) => [name, process.action])),
  [['purchase-order', 'complete'], ['sales-order', 'complete']]);
});
