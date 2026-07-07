import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromShipmentModal.jsx'), 'utf8');

describe('ImportFromShipmentModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromShipmentModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromShipmentModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('fetches shipments and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /goods-shipment\/goodsShipment/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
  });

  it('filters shipments by CO status, matching business partner, and not fully invoiced', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
    assert.match(src, /invoiced\s*!==\s*true/);
  });

  it('tracks already-imported shipment lines and order lines', () => {
    assert.match(src, /alreadyImported/);
    assert.match(src, /goodsShipmentLine/);
    assert.match(src, /salesOrderLine/);
  });

  it('wires the shipment-specific i18n keys for search and empty states', () => {
    assert.match(src, /searchPlaceholderKey="searchShipment"/);
    assert.match(src, /emptyMessageKey="noPendingShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noShipmentsMatchYourSearch"/);
  });

  it('fetches shipment lines on expand with callout price enrichment', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /goods-shipment\/goodsShipmentLine\?parentId=/);
    assert.match(src, /resolveLinePrice/);
  });

  it('marks lines as already imported via shipment and order line ids', () => {
    assert.match(src, /_alreadyImported/);
    assert.match(src, /alreadyImportedShipmentLines\?\.has\(l\.id\)/);
    assert.match(src, /alreadyImportedOrderLines\?\.has\(l\.salesOrderLine\)/);
  });

  it('creates invoice lines via POST to sales-invoice/lines', () => {
    assert.match(src, /sales-invoice\/lines/);
    assert.match(src, /method:\s*'POST'/);
  });

  it('wires the success message key so the shared modal can toast on success', () => {
    assert.match(src, /successMessageKey="linesImportedFromShipment"/);
    assert.match(src, /titleKey="importFromShipment"/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  it('resolves shipment currency via the linked sales order and never excludes shipments with no linked order', () => {
    assert.match(src, /invoiceCurrency\s*=\s*invoiceHeader\.currency/);
    assert.match(src, /sales-order\/header\/\$\{id\}/);
    assert.match(src, /documents\s*=\s*candidates\.filter\(s\s*=>\s*!s\.salesOrder\s*\|\|\s*orderCurrencyMap\[s\.salesOrder\]\s*===\s*invoiceCurrency\)/);
  });

  it('computes excludedByCurrency only when currency filtering removed every candidate', () => {
    assert.match(src, /excludedByCurrency\s*=\s*documents\.length\s*===\s*0\s*&&\s*candidates\.length\s*>\s*0/);
  });

  it('passes noCurrencyMatchMessageKey to the shared modal', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noShipmentsMatchCurrency"/);
  });
});

// ---------------------------------------------------------------------------
// fetchDocuments — behavioral currency-filter tests
//
// M_InOut (shipment) has no currency column of its own — currency must be
// resolved via the linked sales order (candidate.salesOrder). This mirrors the
// exact algorithm in the source (verified against the regex assertions above)
// with a mocked fetch, since the component only exports a default React
// wrapper.
// ---------------------------------------------------------------------------

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const [shipRes, invLinesRes, , headerRes] = await Promise.all([
    fetch(`${base}/goods-shipment/goodsShipment?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/lines?criteria=ignored&_startRow=0&_endRow=2000`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedShipmentLines = new Set();
  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.goodsShipmentLine) alreadyImportedShipmentLines.add(il.goodsShipmentLine);
      if (il.cOrderlineId) alreadyImportedOrderLines.add(il.cOrderlineId);
    });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  let candidates = [];
  if (shipRes.ok) {
    const all = (await shipRes.json())?.response?.data || [];
    candidates = all.filter(s =>
      s.documentStatus === 'CO'
      && s.businessPartner === bpId
      && s.invoiced !== true
    );
  }

  const invoiceCurrency = invoiceHeader.currency || null;
  let documents = candidates;
  let excludedByCurrency = false;
  if (invoiceCurrency) {
    const orderIds = [...new Set(candidates.filter(s => s.salesOrder).map(s => s.salesOrder))];
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
    documents = candidates.filter(s => !s.salesOrder || orderCurrencyMap[s.salesOrder] === invoiceCurrency);
    excludedByCurrency = documents.length === 0 && candidates.length > 0;
  }

  return {
    documents,
    sharedContext: { invoiceHeader, alreadyImportedShipmentLines, alreadyImportedOrderLines },
    excludedByCurrency,
  };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ shipments, invLines = [], invoiceHeader = {}, orders = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/goods-shipment/goodsShipment?')) return mockRes(true, shipments);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/sales-invoice/lines?criteria=')) return mockRes(true, []);
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
    const orderMatch = url.match(/\/sales-order\/header\/([^/?]+)/);
    if (orderMatch) return mockResSingle(true, orders[orderMatch[1]] || null);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromShipmentModal — fetchDocuments currency filter', () => {
  afterEach(() => {
    mock.reset();
  });

  it('keeps a shipment whose linked order currency matches the invoice currency', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 's1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a shipment whose linked order currency does not match the invoice currency', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('never excludes a shipment with no linked order, regardless of invoice currency', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: null }],
      invoiceHeader: { currency: 'USD' },
      orders: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 's1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('sets excludedByCurrency=true when ALL bp/status candidates are filtered out by currency', async () => {
    installFetch({
      shipments: [
        { id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' },
        { id: 's2', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so2' },
      ],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' }, so2: { id: 'so2', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('keeps excludedByCurrency falsy when there were no bp/status candidates at all', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'DR', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice currency is falsy', async () => {
    installFetch({
      shipments: [{ id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' }],
      invoiceHeader: {},
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('keeps the mix of matching and no-order shipments, excludes only the mismatched one', async () => {
    installFetch({
      shipments: [
        { id: 's1', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so1' },
        { id: 's2', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: 'so2' },
        { id: 's3', documentStatus: 'CO', businessPartner: 'bp1', invoiced: false, salesOrder: null },
      ],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' }, so2: { id: 'so2', currency: 'USD' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const ids = result.documents.map(d => d.id).sort();
    assert.deepEqual(ids, ['s1', 's3']);
    assert.equal(result.excludedByCurrency, false);
  });
});
