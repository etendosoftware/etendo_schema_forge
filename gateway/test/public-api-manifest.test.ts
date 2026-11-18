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
    'email',
    'id',
    'name',
    'payment_method',
    'phone',
    'purchase_payment_method',
    'search_key',
    'tax_id',
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

test('publishes the six UI selectors with their transaction context', () => {
  const lookups = Object.fromEntries(Object.entries(manifest.entities).flatMap(([resource, entity]: [string, any]) =>
    Object.entries(entity.fields).filter(([, field]: [string, any]) => field.lookup).map(([name, field]: [string, any]) => [`${resource}.${name}`, field.lookup])));
  assert.deepEqual(lookups, {
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

test('does not publish Contacts child tabs without explicit public API curation', () => {
  assert.equal(manifest.entities['contacts-costSalaryCategory'], undefined);
  assert.equal(manifest.entities['contacts-basicDiscount'], undefined);
});

test('publishes exactly the twelve resources in the agreed V1 scope', () => {
  assert.deepEqual(Object.keys(manifest.entities).sort(), [
    'contacts', 'contacts-contact', 'contacts-locationAddress', 'product', 'product-category',
    'product-costing', 'purchase-order', 'purchase-order-lines', 'sales-order', 'sales-order-lines',
    'sales-quotation', 'sales-quotation-quotationLine',
  ]);
  assert.deepEqual(manifest.entities['product-costing'].operations, ['GET', 'LIST']);
  assert.deepEqual(Object.keys(manifest.entities).filter((name) => name.startsWith('contacts-')).sort(),
    ['contacts-contact', 'contacts-locationAddress']);
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

test('publishes no internal ticket or Jira reference in the functional texts', () => {
  for (const [resource, entity] of entities) {
    const texts = [entity.functional.functionalSummary, ...entity.functional.functionalCapabilities];
    for (const text of texts) assert.doesNotMatch(text, /\bETP-\d+\b|\bjira\b/i, resource);
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
