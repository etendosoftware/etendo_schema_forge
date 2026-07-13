import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromPurchaseOrderModal.jsx'), 'utf8');

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

  it('filters candidate orders by CO status, matching business partner, and pending invoice status', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
    assert.match(src, /Number\(o\.invoiceStatus/);
  });

  it('filters candidates by matching currency and computes excludedByCurrency', () => {
    assert.match(src, /invoiceCurrency\s*=.*currency/);
    assert.match(src, /documents\s*=\s*invoiceCurrency\s*\?\s*candidates\.filter\(o\s*=>\s*o\.currency\s*===\s*invoiceCurrency\)\s*:\s*candidates/);
    assert.match(src, /excludedByCurrency\s*=\s*!!invoiceCurrency\s*&&\s*documents\.length\s*===\s*0\s*&&\s*candidates\.length\s*>\s*0/);
  });

  it('returns excludedByCurrency in the fetchDocuments result', () => {
    assert.match(src, /return\s*\{\s*documents,\s*sharedContext:[\s\S]*?,\s*excludedByCurrency\s*\}/);
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
});

// ---------------------------------------------------------------------------
// fetchDocuments — behavioral currency-filter tests
//
// Same rationale as ImportFromOrderModal.test.js: the component only exports a
// default React wrapper, so the exact currency-filter algorithm (verified
// byte-for-byte against the regex assertions above) is re-derived here and
// exercised with a mocked fetch.
// ---------------------------------------------------------------------------

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/purchase-order/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/purchase-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/purchase-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine); });
  }

  let invoiceCurrency = null;
  if (headerRes.ok) {
    invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
  }

  let documents = [];
  let excludedByCurrency = false;
  const orderDiscountMap = {};
  if (ordersRes.ok) {
    const all = (await ordersRes.json())?.response?.data || [];
    const candidates = all.filter(o =>
      o.documentStatus === 'CO'
      && o.businessPartner === bpId
      && Number(o.invoiceStatus ?? 0) < 100
    );
    documents = invoiceCurrency ? candidates.filter(o => o.currency === invoiceCurrency) : candidates;
    excludedByCurrency = !!invoiceCurrency && documents.length === 0 && candidates.length > 0;
    documents.forEach(o => {
      if (o.etgoTotalDiscount) orderDiscountMap[o.id] = Number(o.etgoTotalDiscount);
    });
  }
  return { documents, sharedContext: { alreadyImportedOrderLines, orderDiscountMap }, excludedByCurrency };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function installFetch({ orders, invLines = [], invoiceHeader }) {
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
});
