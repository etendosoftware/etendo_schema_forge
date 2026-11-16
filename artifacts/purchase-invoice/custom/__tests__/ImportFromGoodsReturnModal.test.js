// @covers artifacts/purchase-invoice/custom/ImportFromGoodsReturnModal.jsx
//
// Characterization of what the "Import from goods return" popup SHOWS and
// SENDS: the documents listed, the lines (pending qty, price, amount, blocked),
// and the line body posted on import. Assertions are on handler OUTPUT only.
// Every endpoint the handlers reach is confined to `backend()` below, so the
// data source can be swapped (e.g. to a server action) by rewriting that one
// helper while every expectation stays untouched.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCustomModule } from '../../../_test-support/loadCustomModule.js';
import { listAll, listLines, newestCreatedFirst, ImportLoadError } from '../../../../tools/app-shell/src/windows/custom/shared/importActionClient.js';
import { pricingContextOf } from '../../../../tools/app-shell/src/windows/custom/shared/invoiceImportPricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated out of the .jsx (no copies).
// `moduleApiFetch` is routed per test through `currentBackend`; the shared read-action client
// (`listAll` / `listLines`) is the real one.
let currentBackend = () => { throw new Error('backend() not installed'); };
const { helpers } = loadCustomModule(
  join(__dirname, '..', 'ImportFromGoodsReturnModal.jsx'),
  { moduleApiFetch: (url, options) => currentBackend(url, options), listAll, listLines, pricingContextOf, newestCreatedFirst },
);
const {
  fetchDocuments, fetchLines, getDocDisplay, buildLineBody, isReturnCovered,
} = helpers;

const BASE = '/api';
/** The popup's lazily loaded pricing context (shared invoiceImportPricing helper). */
const pricingOf = (sharedContext) => pricingContextOf({ apiFetch: (url, options) => currentBackend(url, options), base: BASE, spec: 'purchase-invoice', sharedContext });
const BP = 'bp-1';
const INVOICE = 'inv-1';

function res(ok, payload) {
  return { ok, json: async () => payload };
}

const actionOf = (url) => /\/purchase-invoice\/header\/[^/]+\/action\/(\w+)$/.exec(url)?.[1];

/**
 * The ONLY place that knows the endpoints. Fixture keys describe data, not URLs: swap this helper
 * when the data source moves. Since ETP-6099 the documents and lines come from the invoice's
 * `availableReturns` / `availableReturnLines` actions; this helper plays the server's part
 * (partner, completed, not invoiced in full; a line this invoice holds is `importedHere`), which
 * com.etendoerp.go covers in its own tests.
 *
 * @param {object} f
 * @param {Array|null} [f.returns]        return-to-vendor shipments (null = request fails)
 * @param {Array|null} [f.invoiceLines]   lines already on the invoice
 * @param {object|null} [f.invoiceHeader] the invoice header
 * @param {Array|null} [f.products]       product selector items (with `_aux`)
 * @param {Array|null} [f.returnLines]    lines of the expanded return (null = request fails)
 * @param {(field:string, body:object) => object|null} [f.callout] callout answer per field
 */
function backend(f = {}) {
  const heldHere = new Set((f.invoiceLines || []).map(il => il.goodsShipmentLine).filter(Boolean));
  const lineRow = (l) => {
    const blocked = heldHere.has(l.id);
    return {
      id: l.id, lineNo: l.lineNo ?? 10, product: l.product ?? null, 'product$_identifier': l['product$_identifier'] ?? null,
      uOM: l.uOM ?? null, movementQuantity: Math.abs(Number(l.movementQuantity) || 0),
      pendingQuantity: blocked ? 0 : Math.abs(Number(l.movementQuantity) || 0),
      orderLine: null, orderLineDiscount: 0, blockedReason: blocked ? 'importedHere' : null,
    };
  };
  currentBackend = async (url, options) => {
    const action = actionOf(url);
    if (action === 'availableReturns') {
      if (f.returns === null) return res(false, { error: { code: 'importInvalidParameter' } });
      const listed = (f.returns ?? []).filter(r => r.documentStatus === 'CO' && r.businessPartner === BP
        && Number(r.invoiceStatus || 0) < 100);
      return res(true, { response: { hasMore: false, nextOffset: null, data: listed.map(r => ({
        id: r.id, documentNo: r.documentNo, date: r.movementDate, businessPartner: r.businessPartner,
        pendingLines: 1, sourceDocumentNo: r.sourceReceiptDocNo ?? null,
      })) } });
    }
    if (action === 'availableReturnLines') {
      if (f.returnLines === null) return res(false, {});
      return res(true, { response: { data: (f.returnLines ?? []).map(lineRow) } });
    }
    if (url.includes('/purchase-invoice/lines/callout')) {
      const body = JSON.parse(options.body);
      const answer = f.callout ? f.callout(body.field, body) : null;
      return answer ? res(true, answer) : res(false, {});
    }
    if (url.includes('/purchase-invoice/lines/selectors/M_Product_ID')) {
      return f.products === null ? res(false, {}) : res(true, { items: f.products ?? [] });
    }
    if (url.includes('/purchase-invoice/header/')) {
      return f.invoiceHeader === null
        ? res(false, {})
        : res(true, { response: { data: f.invoiceHeader ? [f.invoiceHeader] : [] } });
    }
    throw new Error(`unexpected request ${url}`);
  };
}

/** Callout answering `product` with `productUpdates` and `PriceActual` with `cascadeUpdates`. */
function priceCallout({ productUpdates = {}, productCombos, cascadeUpdates = {} } = {}) {
  const wrap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { value: v }]));
  return (field) => {
    if (field === 'product') return { updates: wrap(productUpdates), ...(productCombos ? { combos: productCombos } : {}) };
    if (field === 'PriceActual') return { updates: wrap(cascadeUpdates) };
    return null;
  };
}

function sharedContext(overrides = {}) {
  return {
    invoiceId: INVOICE,
    invoiceHeader: {},
    productAuxMap: {},
    ...overrides,
  };
}

describe('ImportFromGoodsReturnModal — documents listed', () => {
  const ret = (id, over) => ({ id, documentStatus: 'CO', businessPartner: BP, invoiceStatus: 0, ...over });

  const cases = [
    { name: 'completed, same supplier, not invoiced', doc: ret('r'), listed: true },
    { name: 'invoiceStatus missing counts as not invoiced', doc: ret('r', { invoiceStatus: undefined }), listed: true },
    { name: 'partially invoiced (99)', doc: ret('r', { invoiceStatus: 99 }), listed: true },
    { name: 'fully invoiced (100)', doc: ret('r', { invoiceStatus: 100 }), listed: false },
    { name: 'draft', doc: ret('r', { documentStatus: 'DR' }), listed: false },
    { name: 'voided', doc: ret('r', { documentStatus: 'VO' }), listed: false },
    { name: 'another supplier', doc: ret('r', { businessPartner: 'bp-2' }), listed: false },
  ];
  for (const c of cases) {
    it(`${c.listed ? 'lists' : 'hides'} a return that is ${c.name}`, async () => {
      backend({ returns: [c.doc] });
      const { documents } = await fetchDocuments({ base: BASE, bpId: BP, invoiceId: INVOICE });
      assert.deepEqual(documents.map(d => d.id), c.listed ? ['r'] : []);
    });
  }

  it('keeps the backend order and never reports a currency exclusion', async () => {
    backend({ returns: [ret('r2'), ret('r1'), ret('r3', { invoiceStatus: 100 })] });
    const out = await fetchDocuments({ base: BASE, bpId: BP, invoiceId: INVOICE });
    assert.deepEqual(out.documents.map(d => d.id), ['r2', 'r1']);
    assert.equal(out.excludedByCurrency, false);
  });

  // ETP-6099: a refused read is no longer «nothing to import» — it rejects, and the component
  // shows the describeLoadFailure toast with an empty list.
  it('rejects with ImportLoadError when the returns request fails', async () => {
    backend({ returns: null });
    await assert.rejects(fetchDocuments({ base: BASE, bpId: BP, invoiceId: INVOICE }), ImportLoadError);
  });

  it('hides a return with nothing left to credit (pendingLines 0) from its own row', () => {
    assert.equal(isReturnCovered({ pendingLines: 0 }), true);
    assert.equal(isReturnCovered({ pendingLines: 2 }), false);
  });

  // ETP-6099: the invoice header and the product aux data are read when a line is imported,
  // not on open; the already-imported lines come flagged by the server.
  it('loads the invoice header and the product aux data for the import, not on open', async () => {
    backend({
      returns: [],
      invoiceHeader: { id: INVOICE, priceList: 'pl-1', currency: 'EUR' },
      products: [
        { id: 'p1', _aux: { _UOM: 'kg', _PSTD: '5' } },
        { id: 'p2' },
      ],
    });
    const { sharedContext: ctx } = await fetchDocuments({ base: BASE, bpId: BP, invoiceId: INVOICE });
    assert.deepEqual(ctx, { invoiceId: INVOICE });
    const pricing = await pricingOf(ctx);
    assert.deepEqual(pricing.invoiceHeader, { id: INVOICE, priceList: 'pl-1', currency: 'EUR' });
    assert.deepEqual(pricing.productAuxMap, { p1: { product_UOM: 'kg', product_PSTD: '5' } });
    assert.equal(await pricingOf(ctx), pricing, 'read once per popup');
  });

  it('degrades to an empty pricing context when the header and products fail', async () => {
    backend({ returns: [], invoiceHeader: null, products: null });
    const { sharedContext: ctx } = await fetchDocuments({ base: BASE, bpId: BP, invoiceId: INVOICE });
    const pricing = await pricingOf(ctx);
    assert.deepEqual(pricing.invoiceHeader, {});
    assert.deepEqual(pricing.productAuxMap, {});
  });
});

describe('ImportFromGoodsReturnModal — getDocDisplay', () => {
  const cases = [
    { doc: { id: 'r1', documentNo: 'RTV-1', movementDate: '2026-01-02', sourceReceiptDocNo: 'GR-9' }, out: { docNo: 'RTV-1', date: '2026-01-02', secondary: '#GR-9' } },
    { doc: { id: 'r1', movementDate: '2026-01-02' }, out: { docNo: 'r1', date: '2026-01-02', secondary: '' } },
  ];
  for (const c of cases) {
    it(`shows ${c.out.docNo} with secondary "${c.out.secondary}"`, () => {
      assert.deepEqual(getDocDisplay(c.doc), c.out);
    });
  }
});

describe('ImportFromGoodsReturnModal — lines shown on expand', () => {
  it('derives pending qty, price, amount, tax and uOM for each return line', async () => {
    backend({
      returnLines: [
        { id: 'rl-1', product: 'p1', 'product$_identifier': 'Widget', movementQuantity: 4, uOM: 'u-line' },
      ],
      callout: priceCallout({
        productUpdates: { unitPrice: 12.5, tax: 'tax-21' },
        productCombos: { uOM: { selected: 'u-callout' } },
        cascadeUpdates: { lineNetAmount: 50 },
      }),
    });
    const [line] = await fetchLines({ base: BASE, docId: 'r1', sharedContext: sharedContext() });
    assert.equal(line.id, 'rl-1');
    assert.equal(line._productName, 'Widget');
    assert.equal(line._maxQty, 4);
    assert.equal(line._unitPrice, 12.5);
    assert.equal(line._lineNetAmount, 50);
    assert.equal(line._tax, 'tax-21');
    assert.equal(line._uOM, 'u-callout');
    assert.equal(line._alreadyImported, false);
    assert.equal(line._orderDiscount, 0);
  });

  const cases = [
    {
      name: 'a line already on the invoice is blocked',
      invoiceLines: [{ id: 'il1', goodsShipmentLine: 'rl-1' }],
      line: { id: 'rl-1', product: 'p1', movementQuantity: 3 },
      callout: priceCallout({ productUpdates: { unitPrice: 2 } }),
      expect: { _alreadyImported: true, _maxQty: 3 },
    },
    {
      name: 'a missing movement quantity offers 0 and the id stands in for the product name',
      line: { id: 'rl-2', product: 'p1' },
      callout: priceCallout({ productUpdates: { unitPrice: 2 } }),
      expect: { _maxQty: 0, _productName: 'rl-2' },
    },
    {
      name: 'gross price is used when the callout gives no net price',
      line: { id: 'rl-3', product: 'p1', movementQuantity: 1 },
      callout: priceCallout({ productUpdates: { grossUnitPrice: 9 } }),
      expect: { _unitPrice: 9 },
    },
    {
      name: 'a failing callout shows zero price/amount and the line own uOM',
      line: { id: 'rl-4', product: 'p1', movementQuantity: 2, uOM: 'u-line' },
      callout: () => null,
      expect: { _unitPrice: 0, _lineNetAmount: 0, _tax: null, _uOM: 'u-line' },
    },
    {
      name: 'a line without product is shown unpriced',
      line: { id: 'rl-5', movementQuantity: 2 },
      callout: () => { throw new Error('callout must not be called'); },
      expect: { _unitPrice: 0, _lineNetAmount: 0, _tax: null, _uOM: null },
    },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      backend({ returnLines: [c.line], invoiceLines: c.invoiceLines, callout: c.callout });
      const [line] = await fetchLines({ base: BASE, docId: 'r1', sharedContext: sharedContext() });
      for (const [k, v] of Object.entries(c.expect)) assert.equal(line[k], v, k);
    });
  }

  it('rejects with ImportLoadError when the lines request fails', async () => {
    backend({ returnLines: null });
    await assert.rejects(fetchLines({ base: BASE, docId: 'r1', sharedContext: sharedContext() }), ImportLoadError);
  });
});

describe('ImportFromGoodsReturnModal — line body sent on import', () => {
  const line = { id: 'rl-1', product: 'p1', _unitPrice: 7, _tax: 'tax-line', _uOM: 'u-line', uOM: 'u-raw' };

  it('posts a negative quantity and amount priced by the callout', async () => {
    backend({
      callout: priceCallout({ productUpdates: { unitPrice: 10, listPrice: 12, grossUnitPrice: 12.1, tax: 'tax-21', uOM: 'u-c' } }),
    });
    const body = await buildLineBody({ line, qty: 3, invoiceId: INVOICE, lineNo: 20, sharedContext: sharedContext(), base: BASE });
    assert.deepEqual(body, {
      parentId: INVOICE,
      product: 'p1',
      invoicedQuantity: -3,
      unitPrice: 10,
      listPrice: 12,
      grossUnitPrice: 12.1,
      lineNetAmount: -30,
      etgoDiscount: 0,
      tax: 'tax-21',
      uOM: 'u-c',
      lineNo: 20,
      goodsShipmentLine: 'rl-1',
    });
  });

  const cases = [
    {
      name: 'an already-negative quantity stays negative',
      qty: -2,
      callout: priceCallout({ productUpdates: { unitPrice: 5 } }),
      expect: { invoicedQuantity: -2, lineNetAmount: -10, unitPrice: 5, listPrice: 5 },
    },
    {
      name: 'gross price is used when the callout gives no net price',
      qty: 1,
      callout: priceCallout({ productUpdates: { grossUnitPrice: 9 } }),
      expect: { unitPrice: 9, grossUnitPrice: 9 },
    },
    {
      name: 'standard price becomes the list price when list price is missing',
      qty: 1,
      callout: priceCallout({ productUpdates: { unitPrice: 5, standardPrice: 6 } }),
      expect: { listPrice: 6 },
    },
    {
      name: 'a failing callout falls back to the price shown on the line and its tax/uOM',
      qty: 2,
      callout: () => null,
      expect: { unitPrice: 7, listPrice: 7, lineNetAmount: -14, tax: 'tax-line', uOM: 'u-line' },
    },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      backend({ callout: c.callout });
      const body = await buildLineBody({ line, qty: c.qty, invoiceId: INVOICE, lineNo: 10, sharedContext: sharedContext(), base: BASE });
      for (const [k, v] of Object.entries(c.expect)) assert.equal(body[k], v, k);
    });
  }

  it('omits grossUnitPrice when the callout gives none', async () => {
    backend({ callout: priceCallout({ productUpdates: { unitPrice: 5 } }) });
    const body = await buildLineBody({ line, qty: 1, invoiceId: INVOICE, lineNo: 10, sharedContext: sharedContext(), base: BASE });
    assert.equal('grossUnitPrice' in body, false);
  });
});
