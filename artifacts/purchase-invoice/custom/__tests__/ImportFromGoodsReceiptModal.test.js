import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromGoodsReceiptModal.jsx'), 'utf8');

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

  it('filters receipts by CO status, matching business partner, and not fully invoiced', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
    assert.match(src, /invoiced\s*!==\s*true/);
  });

  it('resolves receipt currency via the linked purchase order and never excludes receipts with no linked order', () => {
    assert.match(src, /invoiceCurrency\s*=\s*invoiceHeader\.currency/);
    assert.match(src, /purchase-order\/header\/\$\{id\}/);
    assert.match(src, /documents\s*=\s*candidates\.filter\(r\s*=>\s*!r\.salesOrder\s*\|\|\s*orderCurrencyMap\[r\.salesOrder\]\s*===\s*invoiceCurrency\)/);
  });

  it('computes excludedByCurrency only when currency filtering removed every candidate', () => {
    assert.match(src, /excludedByCurrency\s*=\s*documents\.length\s*===\s*0\s*&&\s*candidates\.length\s*>\s*0/);
  });

  it('returns excludedByCurrency in the fetchDocuments result', () => {
    assert.match(src, /return\s*\{\s*documents,\s*sharedContext:[\s\S]*?,\s*excludedByCurrency,?\s*\}/);
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
});

// ---------------------------------------------------------------------------
// fetchDocuments — behavioral currency-filter tests
//
// M_InOut (goods receipt) has no currency column of its own — currency must be
// resolved via the linked purchase order (candidate.salesOrder). This mirrors
// the exact algorithm in the source (verified against the regex assertions
// above) with a mocked fetch, since the component only exports a default React
// wrapper.
// ---------------------------------------------------------------------------

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const [receiptRes, invLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/goods-receipt/goodsReceipt?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/purchase-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/purchase-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedReceiptLines = new Set();
  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.goodsShipmentLine) alreadyImportedReceiptLines.add(il.goodsShipmentLine);
      if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine);
    });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  let candidates = [];
  if (receiptRes.ok) {
    const all = (await receiptRes.json())?.response?.data || [];
    candidates = all.filter(r =>
      r.documentStatus === 'CO'
      && r.businessPartner === bpId
      && r.invoiced !== true
    );
  }

  const invoiceCurrency = invoiceHeader.currency || null;
  let documents = candidates;
  let excludedByCurrency = false;
  if (invoiceCurrency) {
    const orderIds = [...new Set(candidates.filter(r => r.salesOrder).map(r => r.salesOrder))];
    const orderCurrencyMap = {};
    await Promise.all(orderIds.map(async (id) => {
      try {
        const r = await fetch(`${base}/purchase-order/header/${id}`, { headers });
        if (r.ok) {
          const o = (await r.json())?.response?.data?.[0];
          if (o) orderCurrencyMap[id] = o.currency;
        }
      } catch { /* ignore */ }
    }));
    documents = candidates.filter(r => !r.salesOrder || orderCurrencyMap[r.salesOrder] === invoiceCurrency);
    excludedByCurrency = documents.length === 0 && candidates.length > 0;
  }

  return {
    documents,
    sharedContext: { invoiceHeader, alreadyImportedReceiptLines, alreadyImportedOrderLines },
    excludedByCurrency,
  };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ receipts, invLines = [], invoiceHeader = {}, orders = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/goods-receipt/goodsReceipt?')) return mockRes(true, receipts);
    if (url.includes('/purchase-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/purchase-invoice/header/')) return mockResSingle(true, invoiceHeader);
    const orderMatch = url.match(/\/purchase-order\/header\/([^/?]+)/);
    if (orderMatch) return mockResSingle(true, orders[orderMatch[1]] || null);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromGoodsReceiptModal — fetchDocuments currency filter', () => {
  afterEach(() => {
    mock.reset();
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
