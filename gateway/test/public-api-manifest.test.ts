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
  }
});

test('derives the complete action from the draft-mode completion flow, never for fiscal monitors', () => {
  const salesOrder = manifest.entities['sales-order'].processes;
  assert.deepEqual(salesOrder.find((p: any) => p.action === 'complete'), {
    action: 'complete',
    method: 'POST',
    path: '/header/:id/action/documentAction',
    body: { docAction: 'CO' },
  });
  assert.ok(manifest.entities['sales-invoice'].processes.some((p: any) => p.action === 'complete'));
  // v1 exposes only the derived complete action, never declared processEndpoints.
  assert.deepEqual(manifest.entities['return-material-receipt'].processes.map((p: any) => p.action), ['complete']);
  for (const [name, entity] of Object.entries(manifest.entities) as Array<[string, any]>) {
    if (entity.parent || entity.group === 'Fiscal Monitors') assert.deepEqual(entity.processes, [], name);
    for (const process of entity.processes) assert.equal(process.action, 'complete', name);
  }
});
