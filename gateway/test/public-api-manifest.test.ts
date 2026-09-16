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
