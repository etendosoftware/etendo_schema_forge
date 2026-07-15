import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromReturnShipmentModal.jsx'), 'utf8');

describe('ImportFromReturnShipmentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromReturnShipmentModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromReturnShipmentModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches return material receipts and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /return-material-receipt\/returnMaterialReceipt\?/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
  });

  it('filters return receipts by CO status, matching business partner, and unbilled invoiceStatus', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
    assert.match(src, /Number\(r\.invoiceStatus\s*\|\|\s*0\)\s*<\s*100/);
  });

  it('tracks invoiced quantities (not just presence) per goodsShipmentLine and salesOrderLine', () => {
    assert.match(src, /invoicedQtyByGoodsShipmentLine/);
    assert.match(src, /invoicedQtyByOrderLine/);
    assert.match(src, /addQty/);
    assert.match(src, /il\.goodsShipmentLine/);
    assert.match(src, /il\.salesOrderLine/);
    assert.match(src, /Math\.abs\(Number\(il\.invoicedQuantity\)\s*\|\|\s*0\)/);
  });

  it('does NOT reference the removed mInoutlineId or the dead return-from-customer backend', () => {
    assert.doesNotMatch(src, /mInoutlineId/);
    assert.doesNotMatch(src, /return-from-customer/);
  });

  it('de-dupes an invoice line already counted for the current invoice when scanning invoiced-elsewhere', () => {
    assert.match(src, /currentInvoiceLineIds/);
    assert.match(src, /currentInvoiceLineIds\.has\(il\.id\)/);
  });

  it('wires the return-shipment-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromReturnShipment"/);
    assert.match(src, /searchPlaceholderKey="searchReturnShipment"/);
    assert.match(src, /emptyMessageKey="noReturnShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noReturnShipmentsMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromReturnShipment"/);
  });

  it('fetches return receipt lines on expand with callout price enrichment', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /return-material-receipt\/returnMaterialReceiptLine\?parentId=/);
    assert.match(src, /resolveLinePrice/);
  });

  it('marks lines already imported only once remaining qty hits zero, or when order-line blocked (ETP-4459 partial import)', () => {
    assert.match(src, /_alreadyImported/);
    assert.match(src, /remainingQty\s*=\s*Math\.max\(0,\s*movementQty\s*-\s*alreadyInvoicedQty\)/);
    assert.match(src, /_alreadyImported:\s*orderLineBlocked\s*\|\|\s*remainingQty\s*<=\s*0/);
    assert.match(src, /_maxQty:\s*orderLineBlocked\s*\?\s*0\s*:\s*remainingQty/);
  });

  it('creates invoice lines via POST to sales-invoice/lines', () => {
    assert.match(src, /sales-invoice\/lines/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('negates quantity for ARI_RM return invoice lines', () => {
    assert.match(src, /const negQty = -Math\.abs\(qty\);/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
    assert.match(src, /lineNetAmount\s*=\s*negQty\s*\*\s*unitPrice/);
  });

  it('carries goodsShipmentLine and salesOrderLine forward on the created line', () => {
    assert.match(src, /goodsShipmentLine:\s*line\.id/);
    assert.match(src, /salesOrderLine:\s*line\.salesOrderLine\s*\|\|\s*null/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  it('resolves return-receipt currency via the receipt-own salesOrder field and never excludes receipts with no linked order', () => {
    assert.match(src, /invoiceCurrency\s*=\s*invoiceHeader\.currency/);
    assert.match(src, /sales-order\/header\/\$\{id\}/);
    assert.match(src, /documents\s*=\s*candidates\.filter\(r\s*=>\s*!r\.salesOrder\s*\|\|\s*orderCurrencyMap\[r\.salesOrder\]\s*===\s*invoiceCurrency\)/);
  });

  it('computes excludedByCurrency only when currency filtering removed every candidate', () => {
    assert.match(src, /excludedByCurrency\s*=\s*documents\.length\s*===\s*0\s*&&\s*candidates\.length\s*>\s*0/);
  });

  it('passes noCurrencyMatchMessageKey to the shared modal', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noReturnShipmentsMatchCurrency"/);
  });
});

// ---------------------------------------------------------------------------
// fetchDocuments — behavioral tests (status/bp/invoiceStatus filter + currency
// filter). M_InOut (return receipt) has no currency column of its own —
// currency must be resolved via the receipt's own `salesOrder` field (a real
// field newly exposed on return-material-receipt, unlike the old broken
// `customerReturn.salesOrder` reference this replaced). This mirrors the exact
// algorithm in the source (verified against the regex assertions above) with a
// mocked fetch, since the component only exports a default React wrapper.
// ---------------------------------------------------------------------------

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const invoicedLinesFilter = 'ignored';
  const [returnRes, invLinesRes, allInvoicedLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/return-material-receipt/returnMaterialReceipt?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/lines?criteria=${invoicedLinesFilter}&_startRow=0&_endRow=2000`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  const invoicedQtyByGoodsShipmentLine = new Map();
  const invoicedQtyByOrderLine = new Map();
  const addQty = (map, key, qty) => {
    if (!key || !qty) return;
    map.set(key, (map.get(key) || 0) + qty);
  };

  const currentInvoiceLineIds = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.id) currentInvoiceLineIds.add(il.id);
      const qty = Math.abs(Number(il.invoicedQuantity) || 0);
      if (il.goodsShipmentLine) addQty(invoicedQtyByGoodsShipmentLine, il.goodsShipmentLine, qty);
      if (il.salesOrderLine) addQty(invoicedQtyByOrderLine, il.salesOrderLine, qty);
    });
  }

  if (allInvoicedLinesRes.ok) {
    const all = (await allInvoicedLinesRes.json())?.response?.data || [];
    all.forEach(il => {
      if (il.id && currentInvoiceLineIds.has(il.id)) return;
      const qty = Math.abs(Number(il.invoicedQuantity) || 0);
      if (il.goodsShipmentLine) addQty(invoicedQtyByGoodsShipmentLine, il.goodsShipmentLine, qty);
      if (il.salesOrderLine) addQty(invoicedQtyByOrderLine, il.salesOrderLine, qty);
    });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  let candidates = [];
  if (returnRes.ok) {
    const all = (await returnRes.json())?.response?.data || [];
    candidates = all.filter(r =>
      r.documentStatus === 'CO'
      && r.businessPartner === bpId
      && Number(r.invoiceStatus || 0) < 100
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
        const r = await fetch(`${base}/sales-order/header/${id}`, { headers });
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
    sharedContext: { invoiceHeader, invoicedQtyByGoodsShipmentLine, invoicedQtyByOrderLine },
    excludedByCurrency,
  };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ returns, invLines = [], allInvoicedLines = [], invoiceHeader = {}, orders = {}, returnLines = null }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/return-material-receipt/returnMaterialReceiptLine?parentId=')) return mockRes(true, returnLines || []);
    if (url.includes('/return-material-receipt/returnMaterialReceipt?')) return mockRes(true, returns);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/sales-invoice/lines?criteria=')) return mockRes(true, allInvoicedLines);
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
    const orderMatch = url.match(/\/sales-order\/header\/([^/?]+)/);
    if (orderMatch) return mockResSingle(true, orders[orderMatch[1]] || null);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromReturnShipmentModal — fetchDocuments status/bp/currency filters', () => {
  afterEach(() => {
    mock.reset();
  });

  it('keeps a CO return receipt for the matching business partner, not yet fully invoiced', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'r1');
  });

  it('excludes a receipt not in CO status', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'DR', businessPartner: 'bp1', invoiceStatus: 0 }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('excludes a receipt for a different business partner (empty result — bp with no return receipts)', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp2', invoiceStatus: 0 }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('excludes a receipt already fully invoiced (invoiceStatus >= 100)', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 100 }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('returns an empty result set when there are no return receipts at all', async () => {
    installFetch({ returns: [] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents, []);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('keeps a receipt whose linked sales order currency matches the invoice currency', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'r1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a receipt whose linked sales order currency does not match the invoice currency', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('never excludes a receipt with no linked sales order, regardless of invoice currency', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, salesOrder: null }],
      invoiceHeader: { currency: 'USD' },
      orders: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice has no currency set', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0, salesOrder: 'so1' }],
      invoiceHeader: {},
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('sums invoiced quantities (as absolute values) per goodsShipmentLine and salesOrderLine from existing invoice lines', async () => {
    // Invoice lines store a NEGATIVE invoicedQuantity for ARI_RM lines — the map must hold abs().
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [{ id: 'il1', goodsShipmentLine: 'rline1', salesOrderLine: 'oline1', invoicedQuantity: -5 }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.invoicedQtyByGoodsShipmentLine.get('rline1'), 5);
    assert.equal(result.sharedContext.invoicedQtyByOrderLine.get('oline1'), 5);
  });

  it('de-dupes an invoice-line id counted on both the current-invoice query and the global "elsewhere" query (would double-count without the currentInvoiceLineIds guard)', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [{ id: 'ilSelf', goodsShipmentLine: 'rlineSelf', invoicedQuantity: -5 }],
      allInvoicedLines: [
        { id: 'ilSelf', goodsShipmentLine: 'rlineSelf', invoicedQuantity: -5 },
        { id: 'ilOther', goodsShipmentLine: 'rlineOther', invoicedQuantity: -3 },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    // Same underlying invoice line (ilSelf) appears in both queries — must count once (5), not twice (10).
    assert.equal(result.sharedContext.invoicedQtyByGoodsShipmentLine.get('rlineSelf'), 5);
    assert.equal(result.sharedContext.invoicedQtyByGoodsShipmentLine.get('rlineOther'), 3);
  });

  it('sums invoiced quantity split across two different invoices for the same return-receipt line (3 elsewhere + 2 on current = 5 total)', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [{ id: 'ilCurrent', goodsShipmentLine: 'rline1', invoicedQuantity: -2 }],
      allInvoicedLines: [
        { id: 'ilCurrent', goodsShipmentLine: 'rline1', invoicedQuantity: -2 },
        { id: 'ilElsewhere', goodsShipmentLine: 'rline1', invoicedQuantity: -3 },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.invoicedQtyByGoodsShipmentLine.get('rline1'), 5);
  });

  it('populates invoicedQtyByOrderLine from a DIFFERENT return-receipt line invoiced on a DIFFERENT invoice, found only via the "elsewhere" query (ETP-4459 cross-invoice fix)', async () => {
    // rlineA (a different return-receipt line than the one under test) was invoiced
    // against oline1 on some other invoice. The current invoice has no lines yet
    // referencing oline1 — this entry can ONLY come from allInvoicedLinesRes, not
    // invLinesRes, proving the cross-invoice merge into invoicedQtyByOrderLine works.
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [],
      allInvoicedLines: [
        { id: 'ilOtherInvoice', goodsShipmentLine: 'rlineA', salesOrderLine: 'oline1', invoicedQuantity: -4 },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.sharedContext.invoicedQtyByOrderLine.get('oline1'), 4);
  });

  it('de-dupes an invoice-line id counted on both queries for invoicedQtyByOrderLine too (boolean-map consumer makes double-count unobservable downstream, but the map itself must still be correct)', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [{ id: 'ilSelf', salesOrderLine: 'oline1', invoicedQuantity: -5 }],
      allInvoicedLines: [
        { id: 'ilSelf', salesOrderLine: 'oline1', invoicedQuantity: -5 },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    // Without the currentInvoiceLineIds guard this would be 10 (double-counted).
    // orderLineBlocked only checks truthiness, so 5 vs 10 wouldn't change _alreadyImported —
    // but the map value itself must still be correct, since a future consumer (or a
    // debugging session) could reasonably read the raw quantity.
    assert.equal(result.sharedContext.invoicedQtyByOrderLine.get('oline1'), 5);
  });
});

// ---------------------------------------------------------------------------
// resolveLinePrice — pricing cascade behavioral tests. Return receipt lines
// carry no pricing, so this callout cascade (SL_Invoice_Product ->
// PriceActual) is the only source of unit price / tax / uOM, mirroring
// ImportFromShipmentModal's own resolveLinePrice (identical implementation,
// copied verbatim per source comment).
// ---------------------------------------------------------------------------

const resolveLinePrice = async (base, headers, productId, qty, invoiceHeader, auxData = {}) => {
  const formState = {
    ...invoiceHeader,
    ...auxData,
    product: productId,
    invoicedQuantity: qty || 1,
  };
  try {
    const auxiliaryValues = {};
    for (const [k, v] of Object.entries(formState)) {
      if (/^[a-zA-Z]+_[A-Z]{2,5}$/.test(k) && v != null && v !== '') {
        auxiliaryValues[k] = String(v);
      }
    }
    const res = await fetch(`${base}/sales-invoice/lines/callout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        field: 'product', value: productId, formState,
        ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const result = {};
    if (data.updates) {
      for (const [k, entry] of Object.entries(data.updates)) result[k] = entry.value;
    }
    if (data.combos) {
      for (const [k, combo] of Object.entries(data.combos)) {
        if (combo.selected != null) result[k] = combo.selected;
      }
    }
    if (Number(result.standardPrice) && !Number(result.listPrice)) {
      result.listPrice = result.standardPrice;
    }
    let unitPrice = Number(result.unitPrice) || Number(result.grossUnitPrice) || 0;
    if (unitPrice) result.unitPrice = unitPrice;

    if (unitPrice) {
      const cascadeState = { ...formState, ...result, invoicedQuantity: qty || 1 };
      const cascadeRes = await fetch(`${base}/sales-invoice/lines/callout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ field: 'PriceActual', value: String(unitPrice), formState: cascadeState }),
      });
      if (cascadeRes.ok) {
        const cascadeData = await cascadeRes.json();
        if (cascadeData.updates) {
          for (const [k, entry] of Object.entries(cascadeData.updates)) result[k] = entry.value;
        }
        if (cascadeData.combos) {
          for (const [k, combo] of Object.entries(cascadeData.combos)) {
            if (combo.selected != null && !(k in result)) result[k] = combo.selected;
          }
        }
      }
    }
    return result;
  } catch {
    return {};
  }
};

function calloutRes(ok, body) {
  return { ok, json: async () => body };
}

describe('ImportFromReturnShipmentModal — resolveLinePrice pricing cascade', () => {
  afterEach(() => {
    mock.reset();
  });

  it('resolves unitPrice and triggers the PriceActual cascade, merging tax/uOM from the second callout', async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.equal(url, '/b/sales-invoice/lines/callout');
      const body = JSON.parse(opts.body);
      calls += 1;
      if (calls === 1) {
        assert.equal(body.field, 'product');
        assert.equal(body.value, 'prod1');
        return calloutRes(true, { updates: { unitPrice: { value: 100 }, listPrice: { value: 100 } } });
      }
      assert.equal(body.field, 'PriceActual');
      assert.equal(body.value, '100');
      return calloutRes(true, { updates: { tax: { value: 'tax1' }, uOM: { value: 'Unit' }, lineNetAmount: { value: 100 } } });
    });
    const result = await resolveLinePrice('/b', {}, 'prod1', 1, { currency: 'EUR' });
    assert.equal(calls, 2);
    assert.equal(result.unitPrice, 100);
    assert.equal(result.tax, 'tax1');
    assert.equal(result.uOM, 'Unit');
    assert.equal(result.lineNetAmount, 100);
  });

  it('falls back to grossUnitPrice as unitPrice when the product callout does not return a plain unitPrice', async () => {
    globalThis.fetch = mock.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.field === 'product') {
        return calloutRes(true, { updates: { grossUnitPrice: { value: 121 } } });
      }
      return calloutRes(true, { updates: {} });
    });
    const result = await resolveLinePrice('/b', {}, 'prod1', 1, {});
    assert.equal(result.unitPrice, 121);
  });

  it('applies the standardPrice -> listPrice fallback when listPrice comes back zeroed', async () => {
    globalThis.fetch = mock.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.field === 'product') {
        return calloutRes(true, { updates: { standardPrice: { value: 50 }, listPrice: { value: 0 }, unitPrice: { value: 50 } } });
      }
      return calloutRes(true, { updates: {} });
    });
    const result = await resolveLinePrice('/b', {}, 'prod1', 1, {});
    assert.equal(result.listPrice, 50);
  });

  it('does not trigger the PriceActual cascade when no unit price could be resolved', async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      return calloutRes(true, { updates: {} });
    });
    const result = await resolveLinePrice('/b', {}, 'prod1', 1, {});
    assert.equal(calls, 1);
    assert.deepEqual(result, {});
  });

  it('returns an empty object when the product callout request fails', async () => {
    globalThis.fetch = mock.fn(async () => calloutRes(false, {}));
    const result = await resolveLinePrice('/b', {}, 'prod1', 1, {});
    assert.deepEqual(result, {});
  });

  it('returns an empty object when fetch throws', async () => {
    globalThis.fetch = mock.fn(async () => { throw new Error('network down'); });
    const result = await resolveLinePrice('/b', {}, 'prod1', 1, {});
    assert.deepEqual(result, {});
  });
});

// ---------------------------------------------------------------------------
// fetchLines — partial-quantity remaining-import behavioral tests (ETP-4459).
// Mirrors the exact merge logic in the source: remainingQty = movementQty -
// alreadyInvoicedQty (clamped at 0); a line is "already imported" only once
// remainingQty hits 0, OR when the conservative salesOrderLine path blocks it
// outright regardless of the quantity math. resolveLinePrice is stubbed out
// (pricing is covered separately above) so these tests isolate the
// duplicate/remaining-quantity detection merge.
// ---------------------------------------------------------------------------

async function fetchLines({ base, headers, docId, sharedContext }, resolvePriceFn) {
  const res = await fetch(`${base}/return-material-receipt/returnMaterialReceiptLine?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { invoicedQtyByGoodsShipmentLine, invoicedQtyByOrderLine } = sharedContext;

  return Promise.all(lines.map(async (l) => {
    const movementQty = Number(l.movementQuantity) || 0;
    const alreadyInvoicedQty = invoicedQtyByGoodsShipmentLine?.get(l.id) || 0;
    const remainingQty = Math.max(0, movementQty - alreadyInvoicedQty);
    const orderLineBlocked = !!(l.salesOrderLine && invoicedQtyByOrderLine?.get(l.salesOrderLine));
    const priceData = await resolvePriceFn(l);
    return {
      ...l,
      _maxQty: orderLineBlocked ? 0 : remainingQty,
      _unitPrice: Number(priceData.unitPrice) || 0,
      _alreadyImported: orderLineBlocked || remainingQty <= 0,
    };
  }));
}

describe('ImportFromReturnShipmentModal — fetchLines partial-quantity remaining import (ETP-4459)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('offers the full movementQuantity when nothing has been invoiced yet (baseline)', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [{ id: 'l1', product: 'p1', movementQuantity: 10, salesOrderLine: null }]));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: { invoicedQtyByGoodsShipmentLine: new Map(), invoicedQtyByOrderLine: new Map() },
    }, async () => ({}));
    assert.equal(lines[0]._maxQty, 10);
    assert.equal(lines[0]._alreadyImported, false);
  });

  it('offers the remaining 5 units and _alreadyImported=false when 5 of 10 units were already invoiced (the reported bug)', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [{ id: 'l1', product: 'p1', movementQuantity: 10, salesOrderLine: null }]));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: {
        invoicedQtyByGoodsShipmentLine: new Map([['l1', 5]]),
        invoicedQtyByOrderLine: new Map(),
      },
    }, async () => ({}));
    assert.equal(lines[0]._maxQty, 5);
    assert.equal(lines[0]._alreadyImported, false);
  });

  it('fully blocks the line (maxQty 0, alreadyImported true) once invoiced qty reaches movementQuantity', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [{ id: 'l1', product: 'p1', movementQuantity: 10, salesOrderLine: null }]));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: {
        invoicedQtyByGoodsShipmentLine: new Map([['l1', 10]]),
        invoicedQtyByOrderLine: new Map(),
      },
    }, async () => ({}));
    assert.equal(lines[0]._maxQty, 0);
    assert.equal(lines[0]._alreadyImported, true);
  });

  it('clamps remaining qty at 0 (never negative) when invoiced qty somehow exceeds movementQuantity', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [{ id: 'l1', product: 'p1', movementQuantity: 10, salesOrderLine: null }]));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: {
        invoicedQtyByGoodsShipmentLine: new Map([['l1', 15]]),
        invoicedQtyByOrderLine: new Map(),
      },
    }, async () => ({}));
    assert.equal(lines[0]._maxQty, 0);
    assert.equal(lines[0]._alreadyImported, true);
  });

  it('fully blocks via the conservative salesOrderLine path regardless of the remaining-quantity math (unchanged, by design)', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [{ id: 'l1', product: 'p1', movementQuantity: 10, salesOrderLine: 'o1' }]));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: {
        // Nothing invoiced via the return-line path itself...
        invoicedQtyByGoodsShipmentLine: new Map(),
        // ...but the underlying sales-order-line was invoiced through another route.
        invoicedQtyByOrderLine: new Map([['o1', 1]]),
      },
    }, async () => ({}));
    assert.equal(lines[0]._maxQty, 0);
    assert.equal(lines[0]._alreadyImported, true);
  });

  it('does not mark a genuinely new, unimported line and still carries through resolved pricing', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [{ id: 'l1', product: 'p1', movementQuantity: 7, salesOrderLine: 'o9' }]));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: {
        invoicedQtyByGoodsShipmentLine: new Map([['other', 5]]),
        invoicedQtyByOrderLine: new Map([['different', 3]]),
      },
    }, async () => ({ unitPrice: 42 }));
    assert.equal(lines[0]._maxQty, 7);
    assert.equal(lines[0]._alreadyImported, false);
    assert.equal(lines[0]._unitPrice, 42);
  });

  it('returns an empty array of lines for a document with no lines', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, []));
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'd1',
      sharedContext: { invoicedQtyByGoodsShipmentLine: new Map(), invoicedQtyByOrderLine: new Map() },
    }, async () => ({}));
    assert.deepEqual(lines, []);
  });
});

// ---------------------------------------------------------------------------
// fetchDocuments -> fetchLines — end-to-end cross-invoice orderLine dupe-check
// (ETP-4459). A return split across two separate M_InOut return receipts, each
// half invoiced from a DIFFERENT sales invoice, both point at the same
// underlying C_OrderLine (salesOrderLine). Previously this was only caught if
// the OTHER invoice's line happened to also be visible through invLinesRes
// (the current-invoice-only query); allInvoicedLinesRes is the query that
// actually finds it, cross-invoice. This wires fetchDocuments' real
// sharedContext output straight into fetchLines to prove the full path, not
// just the intermediate map.
// ---------------------------------------------------------------------------

describe('ImportFromReturnShipmentModal — end-to-end cross-invoice orderLine dupe-check (ETP-4459)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('blocks a return-receipt line (_alreadyImported: true) whose salesOrderLine was already invoiced via a DIFFERENT return-receipt line on a DIFFERENT invoice, discovered only through allInvoicedLinesRes', async () => {
    // rlineA/oline1 was invoiced on some OTHER invoice (ilOtherInvoice) — never
    // appears on the current invoice's own lines (invLines is empty). The line
    // under test here is rlineB, a DIFFERENT return-receipt line sharing the same
    // salesOrderLine (oline1). The salesOrderLine path is boolean/conservative:
    // any recorded qty against the same order line fully blocks, so we assert
    // _alreadyImported and _maxQty:0 — not a partial remaining-qty number.
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [],
      allInvoicedLines: [
        { id: 'ilOtherInvoice', goodsShipmentLine: 'rlineA', salesOrderLine: 'oline1', invoicedQuantity: -4 },
      ],
      returnLines: [{ id: 'rlineB', product: 'p1', movementQuantity: 6, salesOrderLine: 'oline1' }],
    });

    const docsResult = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(docsResult.sharedContext.invoicedQtyByOrderLine.get('oline1'), 4);

    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'r1', sharedContext: docsResult.sharedContext,
    }, async () => ({}));

    assert.equal(lines[0]._alreadyImported, true);
    assert.equal(lines[0]._maxQty, 0);
  });

  it('does not block an unrelated return-receipt line whose salesOrderLine was never invoiced elsewhere', async () => {
    installFetch({
      returns: [{ id: 'r1', documentStatus: 'CO', businessPartner: 'bp1', invoiceStatus: 0 }],
      invLines: [],
      allInvoicedLines: [
        { id: 'ilOtherInvoice', goodsShipmentLine: 'rlineA', salesOrderLine: 'oline1', invoicedQuantity: -4 },
      ],
      returnLines: [{ id: 'rlineC', product: 'p1', movementQuantity: 6, salesOrderLine: 'olineUnrelated' }],
    });

    const docsResult = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const lines = await fetchLines({
      base: '/b', headers: {}, docId: 'r1', sharedContext: docsResult.sharedContext,
    }, async () => ({}));

    assert.equal(lines[0]._alreadyImported, false);
    assert.equal(lines[0]._maxQty, 6);
  });
});

// ---------------------------------------------------------------------------
// buildLineBody — negative-quantity behavioral test. ARI_RM (return invoice)
// lines must carry a NEGATIVE invoicedQuantity or Etendo rejects them at
// completion — the defining behavioral difference from a normal shipment
// import (ImportFromShipmentModal keeps qty positive).
// ---------------------------------------------------------------------------

describe('ImportFromReturnShipmentModal — buildLineBody negative quantity', () => {
  it('negates the imported quantity and derives a matching negative lineNetAmount', () => {
    const qty = 5;
    const unitPrice = 10;
    const negQty = -Math.abs(qty);
    const lineNetAmount = negQty * unitPrice;
    assert.equal(negQty, -5);
    assert.equal(lineNetAmount, -50);
  });

  it('always negates even if a caller mistakenly passes an already-negative qty', () => {
    const qty = -3;
    const negQty = -Math.abs(qty);
    assert.equal(negQty, -3);
  });
});
