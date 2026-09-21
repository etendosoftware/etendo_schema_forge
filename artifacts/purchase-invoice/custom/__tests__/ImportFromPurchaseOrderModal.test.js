import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCustomModule } from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated straight out of the .jsx — not a copy.
// See artifacts/_test-support/loadCustomModule.js (ETP-5381).
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromPurchaseOrderModal.jsx'),
);
const { fetchDocuments, buildLineBody } = helpers;

// The invoice-line -> order-line FK key, read from the generated contract
// (ETGO_SF_FIELD.java_qualifier for C_INVOICELINE.C_OrderLine_ID).
const ORDER_LINE_FK = orderLineApiKey('purchase-invoice');

describe('ImportFromPurchaseOrderModal — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromPurchaseOrderModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromPurchaseOrderModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches purchase orders, current invoice lines, and the invoice header in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /purchase-order\/header/);
    assert.match(src, /purchase-invoice\/lines\?parentId=/);
    assert.match(src, /purchase-invoice\/header\/\$\{invoiceId\}/);
  });

  it('wires the purchase-order-specific i18n keys including the currency empty state', () => {
    assert.match(src, /titleKey="importFromPurchaseOrder"/);
    assert.match(src, /searchPlaceholderKey="searchPurchaseOrder"/);
    assert.match(src, /emptyMessageKey="noCompletedPurchaseOrdersForThisSupplier"/);
    assert.match(src, /noSearchResultsKey="noOrdersMatchYourSearch"/);
    assert.match(src, /noCurrencyMatchMessageKey="noPurchaseOrdersMatchCurrency"/);
    assert.match(src, /successMessageKey="linesImportedFromPurchaseOrder"/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
    assert.match(src, /afterImport=\{afterImport\}/);
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

function installFetch({ orders = [], invLines = [], invoiceHeader = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/purchase-order/header?')) return mockRes(true, orders);
    if (url.includes('/purchase-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/purchase-invoice/header/')) return mockRes(true, [invoiceHeader]);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromPurchaseOrderModal — fetchDocuments currency filter', () => {
  afterEach(() => {
    mock.reset();
  });

  it('keeps a candidate order whose currency matches the invoice currency', async () => {
    installFetch({
      orders: [{ id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'USD' }],
      invoiceHeader: { currency: 'USD' },
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
      orders: [{ id: 'o1', documentStatus: 'DR', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' }],
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
        { id: 'o1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'USD' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, currency: 'EUR' },
      ],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'o1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes orders for another business partner and fully invoiced orders', async () => {
    installFetch({
      orders: [
        { id: 'o1', documentStatus: 'CO', businessPartner: 'other-bp', invoiceStatus: 0, currency: 'USD' },
        { id: 'o2', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 100, currency: 'USD' },
      ],
      invoiceHeader: { currency: 'USD' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });
});

describe('ImportFromPurchaseOrderModal — buildLineBody', () => {
  const line = {
    id: 'ol1',
    product: 'p1',
    description: 'Entrega especial',
    unitPrice: 10,
    listPrice: 10,
    tax: 't1',
    uOM: 'u1',
  };

  it('carries the order line description into the built invoice line body', async () => {
    const result = await buildLineBody({ line, qty: 2, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result.description, 'Entrega especial');
  });

  it('computes the line net amount from the unit price and the imported quantity', async () => {
    const result = await buildLineBody({ line, qty: 3, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result.invoicedQuantity, 3);
    assert.equal(result.lineNetAmount, 30);
  });

  // ETP-5381 REGRESSION GUARD (purchase side — the reference implementation).
  // Posting the FK under a key the spec does not declare makes NeoFieldFilter
  // drop it silently (HTTP 200, line created, C_OrderLine_ID NULL), which keeps
  // the match table empty and skips `UPDATE C_ORDERLINE SET QtyInvoiced`,
  // leaving the order invoiceable forever. Keep the working side working.
  it('sends the source order line under the spec API key for C_OrderLine_ID', async () => {
    const result = await buildLineBody({ line, qty: 2, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result[ORDER_LINE_FK], 'ol1');
  });

  it('does not send the order line under a key the NEO spec would silently drop', async () => {
    const result = await buildLineBody({ line, qty: 2, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(Object.hasOwn(result, 'cOrderlineId'), false);
  });
});

describe('ImportFromPurchaseOrderModal — duplicate detection via the order line FK', () => {
  afterEach(() => {
    mock.reset();
  });

  it('builds the already-imported set from the spec API key on existing invoice lines', async () => {
    installFetch({ invLines: [{ id: 'il1', [ORDER_LINE_FK]: 'ol1' }] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.ok(result.sharedContext.alreadyImportedOrderLines.has('ol1'));
  });

  it('ignores the legacy cOrderlineId key, which NEO never returns', async () => {
    installFetch({ invLines: [{ id: 'il1', cOrderlineId: 'ol9' }] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.alreadyImportedOrderLines.has('ol9'), false);
  });
});
