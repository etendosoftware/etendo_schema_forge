// @covers artifacts/goods-shipment/custom/ImportFromSalesInvoiceModal.jsx
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import {
  draftDocumentsOf, fetchInOutDocuments, fetchInOutLines, pendingOf,
} from '../../../../tools/app-shell/src/windows/custom/shared/inOutImport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { helpers } = loadCustomModule(
  join(__dirname, '..', 'ImportFromSalesInvoiceModal.jsx'),
  {
    moduleApiFetch: apiFetchToGlobalFetch,
    fetchInOutDocuments, fetchInOutLines, pendingOf, draftDocumentsOf,
  },
);
const { fetchDocuments, fetchLines, buildLineBody } = helpers;

const BASE = '/b';
const BP = 'bp1';
const SHIPMENT = 'ship1';

const res = (ok, response) => ({ ok, json: async () => ({ response }) });

/**
 * The ONLY place that knows the endpoints. `invoices` / `lines` are what the shipment's
 * `availableInvoices` / `availableInvoiceLines` actions answer; `probe` is the partner's
 * completed-invoice list read only when nothing is listed, `header` the shipment header.
 */
function backend({ invoices = [], lines = [], probe = [], header = {} } = {}) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.endsWith('/action/availableInvoices')) return res(true, { data: invoices, hasMore: false });
    if (url.endsWith('/action/availableInvoiceLines')) return res(true, { data: lines });
    if (url.includes('/sales-invoice/header?')) return res(true, { data: probe });
    if (url.endsWith(`/goods-shipment/goodsShipment/${SHIPMENT}`)) return res(true, { data: [header] });
    throw new Error(`unexpected request ${url}`);
  });
  return globalThis.fetch;
}

const callsOf = (fetchMock) => fetchMock.mock.calls.map(c => ({
  url: decodeURIComponent(c.arguments[0]),
  body: c.arguments[1]?.body ? JSON.parse(c.arguments[1].body) : undefined,
}));

describe('ImportFromSalesInvoiceModal — fetchDocuments', () => {
  afterEach(() => { mock.reset(); });

  it('lists through the shipment availableInvoices action in ONE call, covered invoices included', async () => {
    const f = backend({ invoices: [{ id: 'i1', documentNo: 'FV1', date: '2026-03-04', pendingLines: 2 }, { id: 'i2', pendingLines: 0 }] });
    const out = await fetchDocuments({ base: BASE, headers: {}, bpId: BP, invoiceId: SHIPMENT });
    const calls = callsOf(f);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/goods-shipment/goodsShipment/${SHIPMENT}/action/availableInvoices`);
    assert.equal(calls[0].body.includeCovered, true);
    assert.deepEqual(out.documents.map(d => [d.id, d.invoiceDate]), [['i1', '2026-03-04'], ['i2', undefined]]);
    assert.equal(out.excludedByCurrency, false);
    assert.equal(out.sharedContext.targetId, SHIPMENT);
  });

  it('when nothing is listed, asks the server for plain invoices only (ARI, not rectificative) to tell a currency exclusion', async () => {
    const f = backend({
      invoices: [],
      header: { etgoCurrency: 'EUR' },
      probe: [{ id: 'x', documentStatus: 'CO', businessPartner: BP, currency: 'USD' }],
    });
    const out = await fetchDocuments({ base: BASE, headers: {}, bpId: BP, invoiceId: SHIPMENT });
    const invoiceUrl = callsOf(f).map(c => c.url).find(url => url.includes('/sales-invoice/header?'));
    assert.ok(invoiceUrl, 'the invoice list is requested');
    assert.match(invoiceUrl, /"fieldName":"transactionDocument\$documentCategory","operator":"equals","value":"ARI"/);
    assert.match(invoiceUrl, /"fieldName":"transactionDocument\$etsgIsRectificative","operator":"notEqual","value":true/);
    assert.equal(out.excludedByCurrency, true);
  });

  it('does not flag a currency exclusion when the partner has no completed invoice at all', async () => {
    backend({ invoices: [], header: { etgoCurrency: 'EUR' }, probe: [] });
    const out = await fetchDocuments({ base: BASE, headers: {}, bpId: BP, invoiceId: SHIPMENT });
    assert.equal(out.excludedByCurrency, false);
  });
});

describe('ImportFromSalesInvoiceModal — row total', () => {
  // ETP-6002 CP-27: the invoice rows used to show 0,00 (`zeroDocumentTotal`); they now show the
  // invoice's pending `amount`, which `availableInvoices` sends with `detail`, as the order popup.
  it('takes the row total from the server pending amount, not a fixed 0', () => {
    const source = readFileSync(join(__dirname, '..', 'ImportFromSalesInvoiceModal.jsx'), 'utf8');
    assert.match(source, /getDocumentTotal=\{pendingDocumentTotal\}/);
    assert.doesNotMatch(source, /zeroDocumentTotal/);
  });
});

describe('ImportFromSalesInvoiceModal — fetchLines', () => {
  afterEach(() => { mock.reset(); });

  it('maps the server pending, order line and other-draft note to what the popup shows', async () => {
    const f = backend({
      lines: [
        { id: 'l2', lineNo: 20, product: 'p2', pendingQuantity: 0, orderLine: null, linked: true, inDraftDocuments: [] },
        { id: 'l1', lineNo: 10, product: 'p1', 'product$_identifier': 'Widget', pendingQuantity: 3, orderLine: 'ol1', inDraftDocuments: [], unitPrice: 2.5 },
        { id: 'l3', lineNo: 30, product: 'p3', pendingQuantity: 0, orderLine: 'ol3', inDraftDocuments: ['SH-D1'] },
      ],
    });
    const out = await fetchLines({ base: BASE, docId: 'i1', sharedContext: { targetId: SHIPMENT } });
    const [call] = callsOf(f);
    assert.equal(call.url, `${BASE}/goods-shipment/goodsShipment/${SHIPMENT}/action/availableInvoiceLines`);
    assert.deepEqual(call.body, { invoiceId: 'i1', includeCovered: true, detail: true });
    assert.deepEqual(out.map(l => [l.id, l._maxQty, l._alreadyImported, l._orderLineId, l._inDraftShipments]), [
      ['l1', 3, false, 'ol1', undefined],
      ['l2', 0, true, undefined, undefined],
      ['l3', 0, true, 'ol3', ['SH-D1']],
    ]);
    assert.equal(out[0]._productName, 'Widget');
    assert.equal(out[1]._productName, 'l2');
    // ETP-6002 CP-27: priced like the order popup's lines, so the row total follows them once loaded
    assert.deepEqual(out.map(l => [l._unitPrice, l._lineNetAmount]), [[2.5, 7.5], [0, 0], [0, 0]]);
  });

  it('posts the invoice line linked to its order line when it has one', async () => {
    const withOrder = await buildLineBody({ line: { id: 'l1', product: 'p1', uOM: 'u', _orderLineId: 'ol1' }, qty: 2, invoiceId: SHIPMENT, lineNo: 10 });
    assert.deepEqual(withOrder, { parentId: SHIPMENT, product: 'p1', movementQuantity: 2, uOM: 'u', salesOrderLine: 'ol1', invoiceLineId: 'l1', lineNo: 10 });
    const without = await buildLineBody({ line: { id: 'l2', product: 'p2' }, qty: 1, invoiceId: SHIPMENT, lineNo: 20 });
    assert.deepEqual(without, { parentId: SHIPMENT, product: 'p2', movementQuantity: 1, uOM: null, invoiceLineId: 'l2', lineNo: 20 });
  });
});
