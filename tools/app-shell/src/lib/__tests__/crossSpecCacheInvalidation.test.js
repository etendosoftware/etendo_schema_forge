/**
 * ETP-5525 — cross-spec cache invalidation after a write. A successful write to a child
 * document (goods shipment / sales invoice) must mark the sales order's cached record stale, so its
 * `needsPrimaryDoc` / `needsInvoiceDoc` annotations are refetched instead of served for 30 s.
 *
 * Two contracts, each table-driven:
 *   1. `specsInvalidatedByWrite(url)` — which parent specs a URL writes into, matched by WHOLE
 *      path segment (a query value or a camelCase entity name must never match).
 *   2. `invalidateAfterWrite(cache, request)` — when the cache is actually touched (write methods
 *      only, any case; never without a cache). `isWriteMethod` is exercised through it.
 * The `useApiFetch` wiring (base-URL composition, ok-only) is covered in
 * `src/auth/__tests__/useApiFetch.vitest.jsx`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { specsInvalidatedByWrite, invalidateAfterWrite } from '../crossSpecCacheInvalidation.js';

function fakeCache() {
  const calls = [];
  return { calls, invalidate: (pattern) => { calls.push(pattern); return 1; } };
}

describe('specsInvalidatedByWrite', () => {
  const cases = [
    ['goods-shipment write → sales-order', '/sws/neo/goods-shipment/goodsShipment/1', ['sales-order']],
    ['sales-invoice action on an absolute URL → sales-order',
      'https://erp.example/sws/neo/sales-invoice/header/1/action/complete', ['sales-order']],
    ['spec name only in the query string → nothing', '/sws/neo/sales-order/header?criteria=goods-shipment', []],
    ['spec name only in the fragment → nothing', '/sws/neo/sales-order/header#goods-shipment', []],
    ['camelCase entity segment, unrelated spec → nothing', '/sws/neo/warehouse/goodsShipment/1', []],
    ['segment that merely starts with a mapped spec → nothing', '/sws/neo/goods-shipment-line/header', []],
    ['the parent spec itself → nothing (useEntity owns its own spec)', '/sws/neo/sales-order/header/1', []],
    ['empty string → nothing', '', []],
  ];

  for (const [label, url, expected] of cases) {
    it(label, () => {
      assert.deepEqual(specsInvalidatedByWrite(url), expected);
    });
  }

  it('non-string URL (null / undefined) → nothing', () => {
    assert.deepEqual(specsInvalidatedByWrite(null), []);
    assert.deepEqual(specsInvalidatedByWrite(undefined), []);
  });
});

describe('invalidateAfterWrite', () => {
  const WRITE_URL = '/sws/neo/goods-shipment/goodsShipment/1';

  // One upper-case and one mixed-case write: the method is upper-cased before the read-set
  // lookup, so every other write verb takes the same branch.
  for (const method of ['POST', 'Patch']) {
    it(`${method} to a child spec invalidates the parent spec`, () => {
      const cache = fakeCache();
      invalidateAfterWrite(cache, { url: WRITE_URL, method });
      assert.deepEqual(cache.calls, [{ spec: 'sales-order' }]);
    });
  }

  for (const [label, method] of [['GET', 'GET'], ['missing method (fetch defaults to GET)', undefined]]) {
    it(`${label} is a read — cache untouched`, () => {
      const cache = fakeCache();
      invalidateAfterWrite(cache, { url: WRITE_URL, method });
      assert.deepEqual(cache.calls, []);
    });
  }

  // The unmapped spec used here is goods-receipt on purpose: ETP-5525 is scoped to the sales
  // cell, so purchase child documents are deliberately NOT mapped to purchase-order.
  it('a write to an unmapped spec (goods-receipt, purchase side out of scope) leaves the cache untouched', () => {
    const cache = fakeCache();
    invalidateAfterWrite(cache, { url: '/sws/neo/goods-receipt/goodsReceipt/1', method: 'POST' });
    assert.deepEqual(cache.calls, []);
  });

  it('no cache (no DataProvider: null / undefined) does not throw', () => {
    assert.doesNotThrow(() => invalidateAfterWrite(null, { url: WRITE_URL, method: 'POST' }));
    assert.doesNotThrow(() => invalidateAfterWrite(undefined, { url: WRITE_URL, method: 'POST' }));
  });
});
