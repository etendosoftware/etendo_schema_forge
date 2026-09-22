import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated straight out of the .jsx — not a copy.
// See artifacts/_test-support/loadCustomModule.js (ETP-5381).
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromGoodsReceiptModal.jsx'),
  // The prelude calls `moduleApiFetch` (imported from '@/auth/api.js', a
  // binding the loader strips); the stub forwards to `globalThis.fetch`,
  // which is what the mocks below install.
  { moduleApiFetch: apiFetchToGlobalFetch },
);
const { fetchDocuments, buildLineBody } = helpers;

// The invoice-line -> order-line FK key, read from the generated contract
// (ETGO_SF_FIELD.java_qualifier for C_INVOICELINE.C_OrderLine_ID).
const ORDER_LINE_FK = orderLineApiKey('purchase-invoice');

describe('ImportFromGoodsReceiptModal — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromGoodsReceiptModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromGoodsReceiptModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches goods receipts and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /goods-receipt\/goodsReceipt/);
    assert.match(src, /purchase-invoice\/lines\?parentId=/);
    assert.match(src, /purchase-invoice\/header\/\$\{invoiceId\}/);
  });

  it('wires the goods-receipt-specific i18n keys including the currency empty state', () => {
    assert.match(src, /searchPlaceholderKey="searchGoodsReceipt"/);
    assert.match(src, /emptyMessageKey="noPendingGoodsReceiptsForSupplier"/);
    assert.match(src, /noSearchResultsKey="noGoodsReceiptsMatchYourSearch"/);
    assert.match(src, /noCurrencyMatchMessageKey="noGoodsReceiptsMatchCurrency"/);
    assert.match(src, /successMessageKey="linesImportedFromGoodsReceipt"/);
    assert.match(src, /titleKey="importFromGoodsReceipt"/);
  });

  it('fetches receipt lines on expand with callout price enrichment', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /goods-receipt\/goodsReceiptLine\?parentId=/);
    assert.match(src, /resolveLinePrice/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  // ETP-5381: the sales side had drifted to `cOrderlineId`, a key absent from
  // the spec, which NeoFieldFilter.filterRecord drops silently. The purchase
  // side was always correct — this guard keeps it that way.
  it('never mentions the non-existent cOrderlineId key', () => {
    assert.doesNotMatch(src, /cOrderlineId/);
  });
});

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ receipts = [], invLines = [], invoiceHeader = {}, orders = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/goods-receipt/goodsReceipt?')) return mockRes(true, receipts);
    if (url.includes('/purchase-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/purchase-invoice/lines/selectors/')) return { ok: true, json: async () => ({ items: [] }) };
    if (url.includes('/purchase-invoice/lines/callout')) return { ok: false, json: async () => ({}) };
    if (url.includes('/purchase-invoice/header/')) return mockResSingle(true, invoiceHeader);
    const orderMatch = url.match(/\/purchase-order\/header\/([^/?]+)/);
    if (orderMatch) return mockResSingle(true, orders[orderMatch[1]] || null);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromGoodsReceiptModal — fetchDocuments filtering', () => {
  afterEach(() => {
    mock.reset();
  });

  it('filters receipts by CO status, matching business partner, and not-yet-invoiced', async () => {
    installFetch({
      receipts: [
        { id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false },
        { id: 'rDraft', documentStatus: 'DR', businessPartner: 'bp1', invoiced: false },
        { id: 'rOtherBp', documentStatus: 'CO', businessPartner: 'other-bp', invoiced: false },
        { id: 'rInvoiced', documentStatus: 'CO', businessPartner: 'bp1', invoiced: true },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['r1']);
  });

  it('keeps a receipt whose linked order currency matches the invoice currency', async () => {
    installFetch({
      receipts: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { po1: { id: 'po1', currency: 'USD' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'r1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a receipt whose linked order currency does not match the invoice currency', async () => {
    installFetch({
      receipts: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { po1: { id: 'po1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('never excludes a receipt with no linked order, regardless of invoice currency', async () => {
    installFetch({
      receipts: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: null }],
      invoiceHeader: { currency: 'USD' },
      orders: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'r1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('sets excludedByCurrency=true when ALL bp/status candidates are filtered out by currency', async () => {
    installFetch({
      receipts: [
        { id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po1' },
        { id: 'r2', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po2' },
      ],
      invoiceHeader: { currency: 'USD' },
      orders: { po1: { id: 'po1', currency: 'EUR' }, po2: { id: 'po2', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('keeps excludedByCurrency falsy when there were no bp/status candidates at all', async () => {
    installFetch({
      receipts: [{ id: 'r1', documentStatus: 'DR', businessPartner: 'bp1', invoiced: false, salesOrder: 'po1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { po1: { id: 'po1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice currency is falsy', async () => {
    installFetch({
      receipts: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po1' }],
      invoiceHeader: {},
      orders: { po1: { id: 'po1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('keeps the mix of matching and no-order receipts, excludes only the mismatched one', async () => {
    installFetch({
      receipts: [
        { id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po1' },
        { id: 'r2', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'po2' },
        { id: 'r3', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: null },
      ],
      invoiceHeader: { currency: 'USD' },
      orders: { po1: { id: 'po1', currency: 'USD' }, po2: { id: 'po2', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const ids = result.documents.map(d => d.id).sort();
    assert.deepEqual(ids, ['r1', 'r3']);
    assert.equal(result.excludedByCurrency, false);
  });
});

describe('ImportFromGoodsReceiptModal — duplicate detection via the order line FK', () => {
  afterEach(() => {
    mock.reset();
  });

  it('builds the already-imported order line set from the spec API key', async () => {
    installFetch({ invLines: [{ id: 'il1', goodsShipmentLine: 'rl1', [ORDER_LINE_FK]: 'ol1' }] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.ok(result.sharedContext.alreadyImportedOrderLines.has('ol1'));
  });

  it('ignores the legacy cOrderlineId key, which NEO never returns', async () => {
    installFetch({ invLines: [{ id: 'il1', goodsShipmentLine: 'rl1', cOrderlineId: 'ol9' }] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.alreadyImportedOrderLines.has('ol9'), false);
  });
});

describe('ImportFromGoodsReceiptModal — buildLineBody order line FK (ETP-5381)', () => {
  afterEach(() => {
    mock.reset();
  });

  const buildArgs = (line) => ({
    line,
    qty: 2,
    invoiceId: 'inv1',
    lineNo: 10,
    sharedContext: { invoiceHeader: {}, productAuxMap: {} },
    base: '/b',
    headers: {},
  });

  // ETP-5381 REGRESSION GUARD (purchase side — the reference implementation).
  // Posting the FK under a key the spec does not declare makes NeoFieldFilter
  // drop it silently (HTTP 200, line created, C_OrderLine_ID NULL), which keeps
  // the match table empty and skips `UPDATE C_ORDERLINE SET QtyInvoiced`,
  // leaving the order invoiceable forever. Keep the working side working.
  it('sends the receipt line source order line under the spec API key for C_OrderLine_ID', async () => {
    installFetch({});
    const body = await buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', [ORDER_LINE_FK]: 'ol1', _unitPrice: 10,
    }));
    assert.equal(body[ORDER_LINE_FK], 'ol1');
    assert.equal(body.goodsShipmentLine, 'rl1');
  });

  it('does not send the order line under a key the NEO spec would silently drop', async () => {
    installFetch({});
    const body = await buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', [ORDER_LINE_FK]: 'ol1', _unitPrice: 10,
    }));
    assert.equal(Object.hasOwn(body, 'cOrderlineId'), false);
  });

  it('sends an explicit null when the receipt line has no linked order line', async () => {
    installFetch({});
    const body = await buildLineBody(buildArgs({
      id: 'rl1', product: 'p1', [ORDER_LINE_FK]: null, _unitPrice: 10,
    }));
    assert.equal(Object.hasOwn(body, ORDER_LINE_FK), true);
    assert.equal(body[ORDER_LINE_FK], null);
  });
});
