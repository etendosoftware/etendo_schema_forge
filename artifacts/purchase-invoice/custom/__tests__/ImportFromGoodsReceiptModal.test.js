// @covers artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/importActionClient.js
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';
import { listAll, listLines, newestCreatedFirst } from '../../../../tools/app-shell/src/windows/custom/shared/importActionClient.js';
import { pricingContextOf } from '../../../../tools/app-shell/src/windows/custom/shared/invoiceImportPricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromGoodsReceiptModal.jsx'),
  { moduleApiFetch: apiFetchToGlobalFetch, listAll, listLines, pricingContextOf, newestCreatedFirst },
);
const { fetchDocuments, fetchLines, buildLineBody } = helpers;

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

  it('lists goods receipts through the invoice availableReceipts action, covered ones included', () => {
    assert.match(src, /action: 'availableReceipts', params: \{ includeCovered: true, detail: true \}/);
    assert.match(src, /eagerLoadLines=\{false\}/);
    assert.match(src, /isDocumentCovered=\{isReceiptCovered\}/);
  });

  it('wires the goods-receipt-specific i18n keys including the currency empty state', () => {
    assert.match(src, /searchPlaceholderKey="searchGoodsReceipt"/);
    assert.match(src, /emptyMessageKey="noPendingGoodsReceiptsForSupplier"/);
    assert.match(src, /noSearchResultsKey="noGoodsReceiptsMatchYourSearch"/);
    assert.match(src, /noCurrencyMatchMessageKey="noGoodsReceiptsMatchCurrency"/);
    assert.match(src, /successMessageKey="linesImportedFromGoodsReceipt"/);
    assert.match(src, /titleKey="importFromGoodsReceipt"/);
  });

  it('reads receipt lines on expand through availableReceiptLines and prices on expand and at import', () => {
    assert.match(src, /action: 'availableReceiptLines', params: \{ receiptId: docId, includeCovered: true, detail: true \}/);
    assert.match(src, /const fetchLines[\s\S]*resolveLinePrice/);
    assert.match(src, /const buildLineBody[\s\S]*resolveLinePrice/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{handlers\.fetchDocuments\}/);
    assert.match(src, /fetchLines=\{handlers\.fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

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

/**
 * ETP-6099 — the fixtures are the receipts and orders as stored; this mock plays the server's
 * `availableReceipts` (completed, the invoice partner's, not invoiced, in the invoice's currency —
 * a receipt's currency being its order's here) and the receipt read the popup makes only to tell a
 * currency-emptied list apart. com.etendoerp.go covers the real rule.
 */
function installFetch({ receipts = [], receiptLines = [], invoiceHeader = {}, orders = {}, bpId = 'bp1' }) {
  const currencyOf = (r) => (r.salesOrder ? orders[r.salesOrder]?.currency : invoiceHeader.currency) || null;
  const candidates = receipts.filter(r => r.documentStatus === 'CO' && r.businessPartner === bpId && r.invoiced !== true);
  globalThis.fetch = mock.fn(async (url, options) => {
    if (url.endsWith('/action/availableReceipts')) {
      const listed = candidates.filter(r => !invoiceHeader.currency || currencyOf(r) === invoiceHeader.currency);
      return { ok: true, json: async () => ({ response: { hasMore: false, data: listed.map(r => ({ ...r, date: r.movementDate, pendingLines: 1 })) } }) };
    }
    if (url.endsWith('/action/availableReceiptLines')) {
      assert.equal(JSON.parse(options.body).includeCovered, true);
      return mockRes(true, receiptLines);
    }
    if (url.includes('/goods-receipt/goodsReceipt?criteria=')) {
      return mockRes(true, candidates.filter(r => currencyOf(r) && currencyOf(r) !== invoiceHeader.currency));
    }
    if (url.includes('/purchase-invoice/lines/selectors/')) return { ok: true, json: async () => ({ items: [] }) };
    if (url.includes('/purchase-invoice/lines/callout')) return { ok: false, json: async () => ({}) };
    if (url.includes('/purchase-invoice/header/')) return mockResSingle(true, invoiceHeader);
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

describe('ImportFromGoodsReceiptModal — lines shown on expand', () => {
  afterEach(() => {
    mock.reset();
  });

  const row = (over) => ({
    id: 'rl1', lineNo: 10, product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1',
    movementQuantity: 5, pendingQuantity: 5, orderLine: 'ol1', orderLineDiscount: 10,
    importedHere: false, invoicedElsewhere: false, ...over,
  });
  const linesOf = async (rows) => {
    installFetch({ receiptLines: rows });
    return fetchLines({ base: '/b', headers: {}, docId: 'r1', sharedContext: { invoiceId: 'inv1' } });
  };

  it('offers the pending quantity and carries the order line under the spec key and its discount', async () => {
    const [line] = await linesOf([row({ pendingQuantity: 3 })]);
    assert.equal(line._maxQty, 3);
    assert.equal(line._alreadyImported, false);
    assert.equal(line[ORDER_LINE_FK], 'ol1');
    assert.equal(line._orderDiscount, 10);
    assert.equal(line._productName, 'Widget');
    assert.equal(line._uOM, 'u1');
  });

  const cases = [
    { name: 'a line this invoice already holds is greyed at its received quantity', over: { importedHere: true, pendingQuantity: 0 }, imported: true, max: 5 },
    { name: 'a line invoiced elsewhere is still offered on the purchase side', over: { invoicedElsewhere: true }, imported: false, max: 5 },
    { name: 'a line with nothing left is greyed', over: { pendingQuantity: 0 }, imported: true, max: 5 },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const [line] = await linesOf([row(c.over)]);
      assert.equal(line._alreadyImported, c.imported);
      assert.equal(line._maxQty, c.max);
    });
  }
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
