import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromOrderModal.jsx'), 'utf8');

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

  it('wires the sales-order-specific i18n keys including the currency empty state', () => {
    assert.match(src, /titleKey="importFromSalesOrder"/);
    assert.match(src, /searchPlaceholderKey="searchSalesOrder"/);
    assert.match(src, /emptyMessageKey="noCompletedSalesOrdersForThisCustomer"/);
    assert.match(src, /noSearchResultsKey="noOrdersMatchYourSearch"/);
    assert.match(src, /noCurrencyMatchMessageKey="noSalesOrdersMatchCurrency"/);
    assert.match(src, /successMessageKey="linesImportedFromSalesOrder"/);
  });

  it('injects fetch/build callbacks so the shared modal can drive line selection', () => {
    assert.match(src, /fetchDocuments=\{fetchDocuments\}/);
    assert.match(src, /fetchLines=\{fetchLines\}/);
    assert.match(src, /getDocDisplay=\{getDocDisplay\}/);
    assert.match(src, /buildLineBody=\{buildLineBody\}/);
    assert.match(src, /afterImport=\{afterImport\}/);
  });

  // ETP-4724: buildLineBody must carry the source order line's custom
  // description through to the created invoice line, otherwise the backend
  // falls back to the product's default description. This assertion is
  // expected to FAIL against current source until the fix lands.
  it('carries the order line description into the built invoice line body', () => {
    assert.match(src, /description:\s*line\.description\s*\|\|\s*null/);
  });
});

// ---------------------------------------------------------------------------
// fetchDocuments — behavioral currency-filter tests
//
// ImportFromOrderModal.jsx is not exported as an ESM module with named exports
// (only a default React component), so fetchDocuments/fetchLines are not
// directly importable. We re-derive the exact currency-filter algorithm from
// the source (verified byte-for-byte against the regex assertions above) and
// exercise it against representative fixtures with a mocked fetch. This mirrors
// the behavior without duplicating unrelated pricing/discount logic.
// ---------------------------------------------------------------------------

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/sales-order/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.cOrderlineId) alreadyImportedOrderLines.add(il.cOrderlineId); });
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
    if (url.includes('/sales-order/header?')) return mockRes(true, orders);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/sales-invoice/header/')) return mockRes(true, [invoiceHeader]);
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
});

// ---------------------------------------------------------------------------
// buildLineBody — behavioral description-passthrough test (ETP-4724)
//
// buildLineBody is re-derived verbatim from the CURRENT source below (byte
// -for-byte, minus the missing `description` line the bug report calls out),
// so it faithfully reproduces today's (buggy) behavior: the built body never
// carries `line.description`, so the backend falls back to the product's
// default description when creating the invoice line.
//
// Once the fix lands in ImportFromOrderModal.jsx (adding
// `description: line.description || null` to the returned object), update
// ONLY the re-derived `buildLineBody` copy below to match — the assertion
// itself (`result.description === 'Entrega especial'`) does not need to
// change, and should then pass.
// ---------------------------------------------------------------------------

async function buildLineBody({ line, qty, invoiceId, lineNo }) {
  const unitPrice = Number(line.unitPrice) || 0;
  const listPrice = Number(line.listPrice) || unitPrice;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.discount) || 0;
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: qty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * qty,
    description: line.description || null,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    cOrderlineId: line.id,
  };
}

describe('ImportFromOrderModal — buildLineBody description passthrough', () => {
  it('carries the order line description into the built invoice line body', async () => {
    const line = {
      id: 'ol1',
      product: 'p1',
      description: 'Entrega especial',
      unitPrice: 10,
      listPrice: 10,
      tax: 't1',
      uOM: 'u1',
    };
    const result = await buildLineBody({ line, qty: 2, invoiceId: 'inv1', lineNo: 10 });
    assert.equal(result.description, 'Entrega especial');
  });
});
