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
    'phone',
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

test('does not publish Contacts child tabs without explicit public API curation', () => {
  assert.equal(manifest.entities['contacts-costSalaryCategory'], undefined);
  assert.equal(manifest.entities['contacts-basicDiscount'], undefined);
});

test('publishes fiscal monitors as read-only resources in one OpenAPI group', () => {
  for (const resource of ['monitor-verifactu', 'sii-monitor', 'tbai-facturas-enviadas']) {
    assert.deepEqual(manifest.entities[resource].operations, ['GET', 'LIST']);
    assert.equal(manifest.entities[resource].group, 'Fiscal Monitors');
    assert.deepEqual(manifest.entities[resource].processes, []);
    assert.deepEqual(Object.keys(manifest.entities[resource].fields).sort(), ['id', 'updated']);
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

test('publishes processes only when the base policy exposes them, and only complete', () => {
  // The conservative base (ETP-5879) publishes no document completion.
  if (manifest.policy.exposeProcesses === false) {
    for (const [name, entity] of Object.entries(manifest.entities) as Array<[string, any]>) {
      assert.deepEqual(entity.processes, [], name);
    }
    return;
  }
  assert.ok(manifest.entities['sales-order'].processes.some((p: any) => p.action === 'complete'));
  for (const [name, entity] of Object.entries(manifest.entities) as Array<[string, any]>) {
    if (entity.parent || entity.group === 'Fiscal Monitors') assert.deepEqual(entity.processes, [], name);
    for (const process of entity.processes) assert.equal(process.action, 'complete', name);
  }
});
