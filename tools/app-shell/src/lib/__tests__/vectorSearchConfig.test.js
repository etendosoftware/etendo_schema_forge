import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveVectorSearchTargetKeys,
  resolveVectorSearchTargetForPath,
  resolveVectorSearchTargets,
  resolveWindowSearchSuggestions,
} from '../vectorSearchConfig.js';

test('window contracts opt in to global vector search without a per-window opt-out', () => {
  assert.deepEqual(resolveVectorSearchTargetKeys([
    { frontendContract: { window: { vectorSearch: { target: 'products' } } } },
    { frontendContract: { window: {} } },
    { default: { frontendContract: { window: { vectorSearch: { target: 'products' } } } } },
    { frontendContract: { window: { vectorSearch: { target: 'business-partners' } } } },
  ]), ['products', 'business-partners']);
  assert.deepEqual(resolveVectorSearchTargetKeys([{ frontendContract: { window: {} } }]), []);
});

test('contract loader metadata maps a vector target to its editable window route', () => {
  assert.deepEqual(resolveVectorSearchTargets([
    {
      specName: 'product',
      contract: { frontendContract: { window: { name: 'Product', vectorSearch: { target: 'product' } } } },
    },
  ]), [{ target: 'product', specName: 'product', label: 'Product' }]);
});

test('window contracts ignore malformed vector targets', () => {
  assert.deepEqual(resolveVectorSearchTargetKeys([
    { frontendContract: { window: { vectorSearch: { target: 'bad target' } } } },
    { frontendContract: { window: { vectorSearch: { target: '9-invalid' } } } },
  ]), []);
});

test('a record or list route resolves to the target declared by its current window', () => {
  const targets = [
    { target: 'sales-invoice', specName: 'sales-invoice', label: 'Sales Invoice' },
    { target: 'product', specName: 'product', label: 'Product' },
  ];
  assert.equal(resolveVectorSearchTargetForPath('/sales-invoice', targets), targets[0]);
  assert.equal(resolveVectorSearchTargetForPath('/sales-invoice/10000012', targets), targets[0]);
  assert.equal(resolveVectorSearchTargetForPath('/home', targets), null);
});

test('window-owned suggestions retain only local navigation paths', () => {
  assert.deepEqual(resolveWindowSearchSuggestions([{
    specName: 'sales-invoice',
    contract: {
      frontendContract: {
        window: {
          searchSuggestions: [
            { label: 'overdueSalesInvoices', path: '/sales-invoice?filter=overdue' },
            { label: 'invalid', path: '/purchase-invoice?filter=overdue' },
          ],
        },
      },
    },
  }]), [{
    label: 'overdueSalesInvoices',
    path: '/sales-invoice?filter=overdue',
    specName: 'sales-invoice',
  }]);
});
