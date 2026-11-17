// @covers tools/app-shell/src/windows/custom/shared/invoiceImportPricing.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadPricingContext, pricingContextOf } from '../invoiceImportPricing.js';

const ok = (body) => ({ ok: true, json: async () => body });
const HEADER = { id: 'inv1', priceList: 'PL 1', currency: 'EUR' };
const SELECTOR = { items: [
  { id: 'p1', _aux: { _PSTD: '10', _UOM: 'u1' } },
  { id: 'p2' },
  { _aux: { _PSTD: '5' } },
] };

function backend({ header = ok({ response: { data: [HEADER] } }), selector = ok(SELECTOR) } = {}) {
  const urls = [];
  const apiFetch = async (url) => {
    urls.push(url);
    const answer = url.includes('/selectors/') ? selector : header;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { apiFetch, urls };
}

const ARGS = { base: '/b', spec: 'sales-invoice' };

describe('invoiceImportPricing — loadPricingContext', () => {
  it('reads the header, then the product selector on its price list, and maps the _aux suffixes', async () => {
    const { apiFetch, urls } = backend();
    const ctx = await loadPricingContext({ apiFetch, ...ARGS, invoiceId: 'inv1' });
    assert.deepEqual(ctx, {
      invoiceHeader: HEADER,
      productAuxMap: { p1: { product_PSTD: '10', product_UOM: 'u1' } },
    });
    assert.deepEqual(urls, [
      '/b/sales-invoice/header/inv1',
      '/b/sales-invoice/lines/selectors/M_Product_ID?limit=500&offset=0&priceList=PL%201',
    ]);
  });

  for (const [name, setup, expected, selectorUrl] of [
    ['header refused: empty header, selector without price list',
      { header: { ok: false, json: async () => ({}) } },
      { invoiceHeader: {}, productAuxMap: { p1: { product_PSTD: '10', product_UOM: 'u1' } } },
      '/b/sales-invoice/lines/selectors/M_Product_ID?limit=500&offset=0'],
    ['header throws: same degradation',
      { header: new Error('network') },
      { invoiceHeader: {}, productAuxMap: { p1: { product_PSTD: '10', product_UOM: 'u1' } } },
      '/b/sales-invoice/lines/selectors/M_Product_ID?limit=500&offset=0'],
    ['selector refused: no aux values',
      { selector: { ok: false, json: async () => ({}) } },
      { invoiceHeader: HEADER, productAuxMap: {} }, undefined],
    ['selector throws: no aux values',
      { selector: new Error('network') },
      { invoiceHeader: HEADER, productAuxMap: {} }, undefined],
  ]) {
    it(name, async () => {
      const { apiFetch, urls } = backend(setup);
      assert.deepEqual(await loadPricingContext({ apiFetch, ...ARGS, invoiceId: 'inv1' }), expected);
      if (selectorUrl) assert.equal(urls[1], selectorUrl);
    });
  }
});

describe('invoiceImportPricing — pricingContextOf', () => {
  it('loads header and selector ONCE per sharedContext across repeated calls', async () => {
    const { apiFetch, urls } = backend();
    const sharedContext = { invoiceId: 'inv1' };
    const first = pricingContextOf({ apiFetch, ...ARGS, sharedContext });
    const second = pricingContextOf({ apiFetch, ...ARGS, sharedContext });
    assert.equal(second, first, 'the same promise is reused');
    const [a, b] = await Promise.all([first, second, pricingContextOf({ apiFetch, ...ARGS, sharedContext })]);
    assert.equal(a.invoiceHeader, HEADER);
    assert.equal(b, a);
    assert.equal(urls.length, 2);
  });

  it('a new sharedContext loads again', async () => {
    const { apiFetch, urls } = backend();
    await pricingContextOf({ apiFetch, ...ARGS, sharedContext: { invoiceId: 'inv1' } });
    await pricingContextOf({ apiFetch, ...ARGS, sharedContext: { invoiceId: 'inv1' } });
    assert.equal(urls.length, 4);
  });

  it('a degraded load is cached too: a failing backend is not re-asked', async () => {
    const { apiFetch, urls } = backend({ header: new Error('down'), selector: new Error('down') });
    const sharedContext = { invoiceId: 'inv1' };
    assert.deepEqual(await pricingContextOf({ apiFetch, ...ARGS, sharedContext }), { invoiceHeader: {}, productAuxMap: {} });
    await pricingContextOf({ apiFetch, ...ARGS, sharedContext });
    assert.equal(urls.length, 2);
  });

  it('returns the context the caller already put on sharedContext, with no request', () => {
    const { apiFetch, urls } = backend();
    const sharedContext = { invoiceId: 'inv1', invoiceHeader: HEADER, productAuxMap: {} };
    assert.equal(pricingContextOf({ apiFetch, ...ARGS, sharedContext }), sharedContext);
    assert.equal(urls.length, 0);
  });
});
