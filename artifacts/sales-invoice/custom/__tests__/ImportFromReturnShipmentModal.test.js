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

  it('fetches customer returns and existing invoice lines in parallel', () => {
    assert.match(src, /Promise\.all/);
    assert.match(src, /return-from-customer\/customerReturn/);
    assert.match(src, /sales-invoice\/lines\?parentId=/);
  });

  it('filters returns by CO status and matching business partner', () => {
    assert.match(src, /documentStatus\s*===\s*'CO'/);
    assert.match(src, /businessPartner\s*===\s*bpId/);
  });

  it('tracks already-imported return lines via mInoutlineId', () => {
    assert.match(src, /alreadyImportedReturnLines/);
    assert.match(src, /mInoutlineId/);
  });

  it('excludes returns whose lines are fully invoiced elsewhere', () => {
    assert.match(src, /invoicedElsewhere/);
    assert.match(src, /invoicedElsewhere\.has/);
  });

  it('wires the return-shipment-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromReturnShipment"/);
    assert.match(src, /searchPlaceholderKey="searchReturnShipment"/);
    assert.match(src, /emptyMessageKey="noReturnShipmentsForCustomer"/);
    assert.match(src, /noSearchResultsKey="noReturnShipmentsMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromReturnShipment"/);
  });

  it('fetches return shipment lines on expand', () => {
    assert.match(src, /fetchLines/);
    assert.match(src, /return-from-customer\/customerReturnLine\?parentId=/);
  });

  it('marks lines as already imported via goodsShipmentLine', () => {
    assert.match(src, /_alreadyImported/);
    assert.match(src, /alreadyImportedReturnLines\?\.has\(l\.goodsShipmentLine\)/);
  });

  it('negates quantity for ARI_RM return invoice lines', () => {
    assert.match(src, /-Math\.abs\(qty\)/);
    assert.match(src, /negQty/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
  });

  it('passes mInoutlineId to link invoice line back to the return shipment line', () => {
    assert.match(src, /mInoutlineId:\s*line\.goodsShipmentLine/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
  });

  it('fetches the invoice header to resolve the invoice currency', () => {
    assert.match(src, /sales-invoice\/header\/\$\{invoiceId\}/);
    assert.match(src, /invoiceCurrency\s*=\s*\(await headerRes\.json\(\)\)\?\.response\?\.data\?\.\[0\]\?\.currency\s*\|\|\s*null/);
  });

  it('resolves return currency via the linked sales order and never excludes returns with no linked order', () => {
    assert.match(src, /sales-order\/header\/\$\{id\}/);
    assert.match(src, /candidateReturns\s*=\s*candidateReturns\.filter\(r\s*=>\s*!r\.salesOrder\s*\|\|\s*orderCurrencyMap\[r\.salesOrder\]\s*===\s*invoiceCurrency\)/);
  });

  it('computes excludedByCurrency only when currency filtering removed every bp/status candidate', () => {
    assert.match(src, /excludedByCurrency\s*=\s*candidateReturns\.length\s*===\s*0\s*&&\s*beforeCurrencyCount\s*>\s*0/);
  });

  it('runs the currency filter after the bp/status filter but before the unimported-lines filter', () => {
    const bpFilterIdx = src.indexOf("documentStatus === 'CO' && r.businessPartner === bpId");
    const currencyFilterIdx = src.indexOf('Returns have no currency of their own');
    const unimportedLinesFilterIdx = src.indexOf('Fetch lines for each return in parallel');
    assert.ok(bpFilterIdx > -1 && currencyFilterIdx > -1 && unimportedLinesFilterIdx > -1, 'expected all three stages to be present');
    assert.ok(bpFilterIdx < currencyFilterIdx, 'bp/status filter must run before currency filter');
    assert.ok(currencyFilterIdx < unimportedLinesFilterIdx, 'currency filter must run before unimported-lines filter');
  });

  it('passes noCurrencyMatchMessageKey to the shared modal', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noReturnShipmentsMatchCurrency"/);
  });
});

// ---------------------------------------------------------------------------
// fetchDocuments — behavioral currency-filter tests
//
// M_InOut (customer return) has no currency column of its own — currency must
// be resolved via the linked sales order (candidate.salesOrder). Mirrors the
// exact algorithm in the source (verified against the regex assertions above),
// including the two early-return points around `candidateReturns.length === 0`
// (once before currency filtering, once after).
// ---------------------------------------------------------------------------

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const [returnRes, invLinesRes, invoicedLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/return-from-customer/customerReturn?_startRow=0&_endRow=500&_sortBy=orderDate desc`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/lines?criteria=ignored&_startRow=0&_endRow=2000`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  let invoiceCurrency = null;
  if (headerRes.ok) {
    invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
  }

  const alreadyImportedReturnLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.mInoutlineId) alreadyImportedReturnLines.add(il.mInoutlineId); });
  }

  const invoicedElsewhere = new Set();
  if (invoicedLinesRes.ok) {
    const all = (await invoicedLinesRes.json())?.response?.data || [];
    all.forEach(il => {
      if (il.mInoutlineId && !alreadyImportedReturnLines.has(il.mInoutlineId)) {
        invoicedElsewhere.add(il.mInoutlineId);
      }
    });
  }

  let candidateReturns = [];
  if (returnRes.ok) {
    const all = (await returnRes.json())?.response?.data || [];
    candidateReturns = all.filter(r => r.documentStatus === 'CO' && r.businessPartner === bpId);
  }

  if (candidateReturns.length === 0) {
    return { documents: [], sharedContext: { alreadyImportedReturnLines } };
  }

  let excludedByCurrency = false;
  if (invoiceCurrency) {
    const orderIds = [...new Set(candidateReturns.filter(r => r.salesOrder).map(r => r.salesOrder))];
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
    const beforeCurrencyCount = candidateReturns.length;
    candidateReturns = candidateReturns.filter(r => !r.salesOrder || orderCurrencyMap[r.salesOrder] === invoiceCurrency);
    excludedByCurrency = candidateReturns.length === 0 && beforeCurrencyCount > 0;
  }

  if (candidateReturns.length === 0) {
    return { documents: [], sharedContext: { alreadyImportedReturnLines }, excludedByCurrency };
  }

  const returnLinesResults = await Promise.all(
    candidateReturns.map(ret =>
      fetch(`${base}/return-from-customer/customerReturnLine?parentId=${ret.id}&_startRow=0&_endRow=200`, { headers })
        .then(r => (r.ok ? r.json() : null))
        .then(json => json?.response?.data || []),
    ),
  );

  const documents = candidateReturns.filter((_, idx) => {
    const lines = returnLinesResults[idx];
    if (lines.length === 0) return false;
    return lines.some(l => !invoicedElsewhere.has(l.id));
  });

  return { documents, sharedContext: { alreadyImportedReturnLines }, excludedByCurrency };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ returns, invLines = [], invoiceHeader = {}, orders = {}, returnLines = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/return-from-customer/customerReturn?')) return mockRes(true, returns);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/sales-invoice/lines?criteria=')) return mockRes(true, []);
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
    const orderMatch = url.match(/\/sales-order\/header\/([^/?]+)/);
    if (orderMatch) return mockResSingle(true, orders[orderMatch[1]] || null);
    const lineMatch = url.match(/\/return-from-customer\/customerReturnLine\?parentId=([^&]+)/);
    if (lineMatch) return mockRes(true, returnLines[lineMatch[1]] || [{ id: `${lineMatch[1]}-line1` }]);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromReturnShipmentModal — fetchDocuments currency filter', () => {
  afterEach(() => {
    mock.reset();
  });

  it('keeps a return whose linked order currency matches the invoice currency', async () => {
    installFetch({
      returns: [{ id: 'ret1', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so1' }],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'ret1');
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('excludes a return whose linked order currency does not match the invoice currency', async () => {
    installFetch({
      returns: [{ id: 'ret1', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('never excludes a return with no linked order, regardless of invoice currency', async () => {
    installFetch({
      returns: [{ id: 'ret1', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: null }],
      invoiceHeader: { currency: 'USD' },
      orders: {},
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'ret1');
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('sets excludedByCurrency=true when ALL bp/status candidates are filtered out by currency', async () => {
    installFetch({
      returns: [
        { id: 'ret1', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so1' },
        { id: 'ret2', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so2' },
      ],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' }, so2: { id: 'so2', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('keeps excludedByCurrency falsy when there were no bp/status candidates at all (early return before currency filter)', async () => {
    installFetch({
      returns: [{ id: 'ret1', documentStatus: 'DR', businessPartner: 'bp1', salesOrder: 'so1' }],
      invoiceHeader: { currency: 'USD' },
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('does not filter by currency when the invoice currency is falsy', async () => {
    installFetch({
      returns: [{ id: 'ret1', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so1' }],
      invoiceHeader: {},
      orders: { so1: { id: 'so1', currency: 'EUR' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 1);
    assert.equal(!!result.excludedByCurrency, false);
  });

  it('keeps the mix of matching and no-order returns, excludes only the mismatched one', async () => {
    installFetch({
      returns: [
        { id: 'ret1', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so1' },
        { id: 'ret2', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: 'so2' },
        { id: 'ret3', documentStatus: 'CO', businessPartner: 'bp1', salesOrder: null },
      ],
      invoiceHeader: { currency: 'EUR' },
      orders: { so1: { id: 'so1', currency: 'EUR' }, so2: { id: 'so2', currency: 'USD' } },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const ids = result.documents.map(d => d.id).sort();
    assert.deepEqual(ids, ['ret1', 'ret3']);
    assert.equal(!!result.excludedByCurrency, false);
  });
});
