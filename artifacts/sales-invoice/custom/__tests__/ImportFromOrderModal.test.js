// @covers artifacts/sales-invoice/custom/ImportFromOrderModal.jsx
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';
import { translateImportRefusal } from '../../../../tools/app-shell/src/lib/backendErrors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated straight out of the .jsx — not a copy.
// See artifacts/_test-support/loadCustomModule.js for why (ETP-5381: the old
// hand-copied clones carried the same wrong API key as the source, so the suite
// stayed green while every imported invoice line lost its C_OrderLine_ID).
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromOrderModal.jsx'),
  // The prelude calls `moduleApiFetch` (imported from '@/auth/api.js', a
  // binding the loader strips); the stub forwards to `globalThis.fetch`,
  // which is what the mocks below install.
  { moduleApiFetch: apiFetchToGlobalFetch, translateImportRefusal },
);
const { fetchDocuments, fetchLines, submitOrderImport } = helpers;

// The invoice-line -> order-line FK key, read from the generated contract
// (ETGO_SF_FIELD.java_qualifier for C_INVOICELINE.C_OrderLine_ID). Anchored to
// the spec rather than to a literal, so the test cannot agree with a typo.
const ORDER_LINE_FK = orderLineApiKey('sales-invoice');

describe('ImportFromOrderModal — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromOrderModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromOrderModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches sales orders, current invoice lines, and the invoice header in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /sales-order\/header/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
    assert.match(src, /sales-invoice\/header\/\$\{invoiceId\}/);
  });

  it('wires the sales-order-specific i18n keys including the currency empty state', () => {
    assert.match(src, /titleKey="importFromSalesOrder"/);
    assert.match(src, /searchPlaceholderKey="searchSalesOrder"/);
    assert.match(src, /emptyMessageKey="noCompletedSalesOrdersForThisCustomer"/);
    assert.match(src, /noSearchResultsKey="noOrdersMatchYourSearch"/);
    assert.match(src, /noCurrencyMatchMessageKey="noSalesOrdersMatchCurrency"/);
    assert.match(src, /successMessageKey="linesImportedFromSalesOrder"/);
  });

  // ETP-6002: one importOrderLines call instead of one line POST per order line.
  it('imports through the submitImport callback, never one POST per line', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /submitImport=\{submitImport\}/);
    assert.doesNotMatch(src, /buildLineBody=/);
    assert.doesNotMatch(src, /linesEndpoint=/);
  });

  it('spreads the shared global-discount props bound to the sales-invoice header', () => {
    assert.match(src, /useOrderGlobalDiscountImport\(\{ headerEndpoint: 'sales-invoice\/header' \}\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.globalDiscountProps\}/);
    assert.doesNotMatch(src, /afterImport=/);
  });

  // ETP-5381: `cOrderlineId` is not a key of the sales-invoice NEO spec, and
  // NeoFieldFilter.filterRecord drops unknown body keys silently (HTTP 200, no
  // log), so the line was created with C_OrderLine_ID NULL.
  it('never mentions the non-existent cOrderlineId key', () => {
    assert.doesNotMatch(src, /cOrderlineId/);
  });
});

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function installFetch({ orders, invLines = [], invoiceHeader, linesOk = true, headerOk = true }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/sales-order/header?')) return mockRes(true, orders);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(linesOk, invLines);
    if (url.includes('/sales-invoice/header/')) return mockRes(headerOk, [invoiceHeader]);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromOrderModal — fetchDocuments currency filter', () => {
  afterEach(() => {
    mock.reset();
  });

  it('keeps a candidate order whose currency matches the invoice currency', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'o1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a candidate order whose currency does not match the invoice currency', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('sets excludedByCurrency=true when ALL bp/status candidates are filtered out by currency', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
      ],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('keeps excludedByCurrency falsy when there were no bp/status candidates at all', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'DR', businessPartner: 'bp1', invoiceStatus: 0, currency: 'USD' }],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice currency is falsy', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
      invoiceHeader: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('keeps some documents and reports excludedByCurrency=false when only part of the candidates match', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'USD' },
      ],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'o1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes orders for another business partner and fully invoiced orders', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'other-bp', invoiceStatus: 0, currency: 'EUR' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 100, currency: 'EUR' },
      ],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });
});

// ETP-6002 — "Añadir desde pedido" is ONE call to the invoice's importOrderLines action, so the
// window and the MCP share one rule (oldest pending shipment line first, one invoice line per
// shipment line). Prices, discount, tax, UoM and the order-line link are set server-side.
describe('ImportFromOrderModal — submitOrderImport (importOrderLines action)', () => {
  afterEach(() => {
    mock.reset();
  });

  const carrying = () => ({ carryGlobalDiscount: true, afterImportResult: { carried: true, pct: 5 } });

  it('sends every selected line in ONE call, grouped by order, with the carry decision', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, { importedCount: 3 }));
    const result = await submitOrderImport({
      lines: [
        { line: { id: 'ol1' }, qty: 2, docId: 'o1' },
        { line: { id: 'ol2' }, qty: 1, docId: 'o2' },
        { line: { id: 'ol3' }, qty: 4, docId: 'o1' },
      ],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying,
    });

    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/b/sales-invoice/header/inv1/action/importOrderLines');
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), {
      orders: [
        { orderId: 'o1', lines: [{ sourceLineId: 'ol1', quantity: 2 }, { sourceLineId: 'ol3', quantity: 4 }] },
        { orderId: 'o2', lines: [{ sourceLineId: 'ol2', quantity: 1 }] },
      ],
      carryGlobalDiscount: true,
    });
    assert.deepEqual(result, { ok: true, count: 3, afterImportResult: { carried: true, pct: 5 } });
  });

  // The `ui` stub renders `key:params`, so the assertions prove the CODE was translated (with its
  // details), never the server's English prose.
  const ui = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

  it('renders a refusal by its code and details, never the English server text', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      json: async () => ({ error: {
        code: 'importQuantityExceedsPending', message: 'Cannot import 9 of Fernet: only 2 …',
        product: 'Fernet', requested: 9, pending: 2,
      } }),
    }));
    const result = await submitOrderImport({
      lines: [{ line: { id: 'ol1' }, qty: 9, docId: 'o1' }],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying, ui,
    });
    assert.deepEqual(result, {
      ok: false,
      error: 'backendError.importQuantityExceedsPending:{"product":"Fernet","requested":9,"pending":2}',
    });
  });

  it('sends nothing when every selected quantity is 0, and asks for a positive quantity', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, { importedCount: 0 }));
    const result = await submitOrderImport({
      lines: [{ line: { id: 'ol1' }, qty: 0, docId: 'o1' }],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying, ui,
    });
    assert.equal(globalThis.fetch.mock.calls.length, 0);
    assert.deepEqual(result, { ok: false, error: 'qtyMustBePositive' });
  });

  it('falls back to the generic import failure for an unknown import code', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false, json: async () => ({ error: { code: 'importSomethingNew', message: 'English text' } }),
    }));
    const result = await submitOrderImport({
      lines: [{ line: { id: 'ol1' }, qty: 1, docId: 'o1' }],
      base: '/b', invoiceId: 'inv1', selection: {}, serverCarry: carrying, ui,
    });
    assert.deepEqual(result, { ok: false, error: 'failedToImportLines' });
  });

  it('caps the selectable quantity with the action pending (drafts included)', async () => {
    globalThis.fetch = mock.fn(async (url) => {
      if (url.includes('/action/availableOrderLines')) return mockRes(true, [{ id: 'ol1', pendingQuantity: 2 }]);
      return mockRes(true, [
        { id: 'ol1', orderedQuantity: 5, invoicedQuantity: 0, unitPrice: 10 },
        { id: 'ol2', orderedQuantity: 5, invoicedQuantity: 0, unitPrice: 10 },
      ]);
    });
    const lines = await fetchLines({
      base: '/b', docId: 'o1', sharedContext: { invoiceId: 'inv1', alreadyImportedOrderLines: new Set() },
    });
    assert.equal(lines.find(l => l.id === 'ol1')._maxQty, 2);
    assert.equal(lines.find(l => l.id === 'ol2')._maxQty, 0);
    assert.equal(lines.find(l => l.id === 'ol2')._alreadyImported, true);
  });
});

describe('ImportFromOrderModal — duplicate detection via the order line FK', () => {
  afterEach(() => {
    mock.reset();
  });

  it('builds the already-imported set from the spec API key on existing invoice lines', async () => {
    installFetch({
      orders: [],
      invLines: [{ id: 'il1', [ORDER_LINE_FK]: 'ol1' }],
      invoiceHeader: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.ok(result.sharedContext.alreadyImportedOrderLines.has('ol1'));
  });

  it('ignores the legacy cOrderlineId key, which NEO never returns', async () => {
    installFetch({
      orders: [],
      invLines: [{ id: 'il1', cOrderlineId: 'ol9' }],
      invoiceHeader: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.alreadyImportedOrderLines.has('ol9'), false);
  });
});

describe('ImportFromOrderModal — fetchDocuments invoice global-discount context', () => {
  afterEach(() => {
    mock.reset();
  });

  for (const { name, invLines, invoiceHeader, linesOk = true, headerOk = true, expected } of [
    {
      name: 'invoice with a % and lines',
      invLines: [{ id: 'il1' }],
      invoiceHeader: { etgoTotalDiscount: '5.00' },
      expected: { invoiceGlobalDiscount: 5, invoiceHasLines: true, invoiceStateKnown: true },
    },
    {
      name: 'invoice without % nor lines',
      invLines: [],
      invoiceHeader: { etgoTotalDiscount: 0 },
      expected: { invoiceGlobalDiscount: null, invoiceHasLines: false, invoiceStateKnown: true },
    },
    {
      name: 'header GET non-OK',
      invLines: [],
      invoiceHeader: { etgoTotalDiscount: '5.00' },
      headerOk: false,
      expected: { invoiceGlobalDiscount: null, invoiceHasLines: false, invoiceStateKnown: false },
    },
    {
      name: 'lines GET non-OK',
      invLines: [{ id: 'il1' }],
      invoiceHeader: { etgoTotalDiscount: 0 },
      linesOk: false,
      expected: { invoiceGlobalDiscount: null, invoiceHasLines: false, invoiceStateKnown: false },
    },
  ]) {
    it(`exposes the invoice % and whether it has lines: ${name}`, async () => {
      installFetch({ orders: [], invLines, invoiceHeader, linesOk, headerOk });
      const { sharedContext } = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
      assert.equal(sharedContext.invoiceGlobalDiscount, expected.invoiceGlobalDiscount);
      assert.equal(sharedContext.invoiceHasLines, expected.invoiceHasLines);
      assert.equal(sharedContext.invoiceStateKnown, expected.invoiceStateKnown);
    });
  }
});
