// @covers tools/app-shell/src/lib/crossSpecCacheInvalidation.js
/**
 * ETP-5525 — cross-spec cache invalidation after a write. A successful write to a child
 * document (goods shipment / sales invoice) must mark the sales order's cached record stale, so its
 * `needsPrimaryDoc` / `needsInvoiceDoc` annotations are refetched instead of served for 30 s.
 *
 * ETP-5571 adds the entity map: a write to `contacts` marks every cached selector page stale.
 * ETP-5681 maps the accounting dimensions too: `cost-center`, `project`, `service-project`.
 *
 * Contracts, each table-driven:
 *   1. `specsInvalidatedByWrite(url)` — which parent specs a URL writes into, matched by WHOLE
 *      path segment (a query value or a camelCase entity name must never match).
 *   2. `entitiesInvalidatedByWrite(url)` — same matching, for the entity-keyed map.
 *   3. Both lookups ignore inherited Object.prototype keys (`constructor`, `__proto__`).
 *   4. `invalidateAfterWrite(cache, request)` — when the cache is actually touched (write methods
 *      only, any case; never without a cache) and with which pattern (`{ spec }` vs `{ entity }`).
 *      `isWriteMethod` and `isReadOnlySubEndpoint` (POSTs to `evaluate-display` / `callout`
 *      are reads) are exercised through it.
 * The `useApiFetch` wiring (base-URL composition, ok-only) is covered in
 * `src/auth/__tests__/useApiFetch.vitest.jsx`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  specsInvalidatedByWrite,
  entitiesInvalidatedByWrite,
  invalidateAfterWrite,
} from '../crossSpecCacheInvalidation.js';

function fakeCache() {
  const calls = [];
  return { calls, invalidate: (pattern) => { calls.push(pattern); return 1; } };
}

describe('specsInvalidatedByWrite', () => {
  const cases = [
    // ETP-5576: the invoices show their shipments' / receipts' status (follow-up annotation,
    // delivery status, linked documents), so the follow-up document's writes reach them too.
    ['goods-shipment write → sales-order + sales-invoice', '/sws/neo/goods-shipment/goodsShipment/1',
      ['sales-order', 'sales-invoice']],
    ['goods-receipt process → purchase-invoice (not purchase-order: Purchase cell)',
      '/sws/neo/goods-receipt/goodsReceipt/1/action/complete', ['purchase-invoice']],
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

describe('entitiesInvalidatedByWrite', () => {
  const cases = [
    ['contacts write → selector', '/sws/neo/contacts/businessPartner/ABC', ['selector']],
    ['contacts write on an absolute URL → selector',
      'https://erp.example/sws/neo/contacts/businessPartner/ABC', ['selector']],
    ['contacts only in the query string → nothing', '/sws/neo/sales-order/header?bp=contacts', []],
    ['contacts only in the fragment → nothing', '/sws/neo/sales-order/header#contacts', []],
    ['segment that merely starts with contacts → nothing', '/sws/neo/contactsX/header/1', []],
    ['cost-center write → selector (ETP-5681)', '/sws/neo/cost-center/costCenter/ABC', ['selector']],
    ['project write → selector (ETP-5681)', '/sws/neo/project/project/ABC', ['selector']],
    ['service-project write → selector (ETP-5681)', '/sws/neo/service-project/project/ABC', ['selector']],
    ['cost-center only in the query string → nothing', '/sws/neo/simple-g-l-journal/gLJournal?x=cost-center', []],
    ['a spec mapped to no entity → nothing', '/sws/neo/sales-order/header', []],
    ['empty string → nothing', '', []],
    ['null → nothing', null, []],
  ];

  for (const [label, url, expected] of cases) {
    it(label, () => {
      assert.deepEqual(entitiesInvalidatedByWrite(url), expected);
    });
  }
});

// Before ETP-5571 the lookup was `map[segment]`, so a `constructor` segment resolved to
// Object.prototype.constructor and `.forEach` threw on it. Only own keys may match.
describe('inherited Object.prototype keys never match a path segment', () => {
  const url = '/sws/neo/constructor/__proto__/toString/1';
  for (const [name, fn] of [
    ['specsInvalidatedByWrite', specsInvalidatedByWrite],
    ['entitiesInvalidatedByWrite', entitiesInvalidatedByWrite],
  ]) {
    it(`${name} returns [] without throwing`, () => {
      assert.deepEqual(fn(url), []);
    });
  }
});

describe('invalidateAfterWrite', () => {
  const WRITE_URL = '/sws/neo/goods-shipment/goodsShipment/1';
  const CONTACTS_URL = '/sws/neo/contacts/businessPartner/ABC';

  // One upper-case and one mixed-case write: the method is upper-cased before the read-set
  // lookup, so every other write verb takes the same branch. The exact `calls` array also
  // proves the spec map does not bleed into an entity invalidation.
  for (const method of ['POST', 'Patch']) {
    it(`${method} to a child spec invalidates the parent spec`, () => {
      const cache = fakeCache();
      invalidateAfterWrite(cache, { url: WRITE_URL, method });
      assert.deepEqual(cache.calls, [{ spec: 'sales-order' }, { spec: 'sales-invoice' }]);
    });
  }

  // ETP-5571: the exact `calls` array proves the entity map emits `{ entity }` only — no `{ spec }`.
  for (const method of ['PATCH', 'DELETE']) {
    it(`${method} to contacts invalidates the selector entity only`, () => {
      const cache = fakeCache();
      invalidateAfterWrite(cache, { url: CONTACTS_URL, method });
      assert.deepEqual(cache.calls, [{ entity: 'selector' }]);
    });
  }

  // ETP-5571 regression caught by the ETP-4564 E2E: opening a contact POSTs `evaluate-display`
  // and a field edit POSTs `callout` — both read-only, yet they wiped every cached selector page.
  // The guard sits before BOTH maps, so the goods-shipment row proves the spec map is covered too.
  for (const [label, url] of [
    ['contacts evaluate-display', '/sws/neo/contacts/businessPartner/evaluate-display'],
    ['contacts callout (query + fragment stripped)', '/sws/neo/contacts/businessPartner/callout?x=1#y'],
    ['goods-shipment callout', '/sws/neo/goods-shipment/header/callout'],
  ]) {
    it(`POST to a read-only sub-endpoint (${label}) is not a write — cache untouched`, () => {
      const cache = fakeCache();
      invalidateAfterWrite(cache, { url, method: 'POST' });
      assert.deepEqual(cache.calls, []);
    });
  }

  it('callout as a MIDDLE path segment is not a sub-endpoint — contacts write still invalidates', () => {
    const cache = fakeCache();
    invalidateAfterWrite(cache, { url: '/sws/neo/contacts/callout/1', method: 'POST' });
    assert.deepEqual(cache.calls, [{ entity: 'selector' }]);
  });

  for (const [label, url, method] of [
    ['GET', WRITE_URL, 'GET'],
    ['missing method (fetch defaults to GET)', WRITE_URL, undefined],
    ['GET to contacts', CONTACTS_URL, 'GET'],
  ]) {
    it(`${label} is a read — cache untouched`, () => {
      const cache = fakeCache();
      invalidateAfterWrite(cache, { url, method });
      assert.deepEqual(cache.calls, []);
    });
  }

  // purchase-invoice on purpose: ETP-5525 is scoped to the sales cell, so a purchase invoice is
  // deliberately NOT mapped to purchase-order (and goods-receipt reaches purchase-invoice only).
  it('a write to an unmapped spec (purchase-invoice, purchase-order side out of scope) leaves the cache untouched', () => {
    const cache = fakeCache();
    invalidateAfterWrite(cache, { url: '/sws/neo/purchase-invoice/header/1', method: 'POST' });
    assert.deepEqual(cache.calls, []);
  });

  it('no cache (no DataProvider: null / undefined) does not throw', () => {
    assert.doesNotThrow(() => invalidateAfterWrite(null, { url: WRITE_URL, method: 'POST' }));
    assert.doesNotThrow(() => invalidateAfterWrite(undefined, { url: WRITE_URL, method: 'POST' }));
  });
});
