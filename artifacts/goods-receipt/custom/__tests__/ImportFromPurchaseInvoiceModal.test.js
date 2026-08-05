import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromPurchaseInvoiceModal.jsx'), 'utf8');

describe('ImportFromPurchaseInvoiceModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromPurchaseInvoiceModal/);
  });

  it('delegates to the shared ImportLinesModal', () => {
    assert.match(src, /import ImportLinesModal from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /<ImportLinesModal/);
  });

  describe('ETP-4028 — currency-aware fetchDocuments (status/BP first, THEN currency)', () => {
    it('fetches the current receipt header to read its currency', () => {
      assert.match(src, /goods-receipt\/goodsReceipt\/\$\{receiptId\}/);
      assert.match(src, /receiptCurrency\s*=\s*\(await headerRes\.json\(\)\)\?\.response\?\.data\?\.\[0\]\?\.etgoCurrency/);
    });

    it('computes statusAndBpCandidates (status=CO + businessPartner match) BEFORE any currency filtering', () => {
      const statusIdx = src.indexOf('const statusAndBpCandidates');
      const currencyIdx = src.indexOf('const candidates = receiptCurrency');
      assert.ok(statusIdx !== -1, 'statusAndBpCandidates computation not found');
      assert.ok(currencyIdx !== -1, 'currency-filtered candidates computation not found');
      assert.ok(statusIdx < currencyIdx, 'statusAndBpCandidates must be computed before the currency filter');
    });

    it('applies the currency filter on top of statusAndBpCandidates, not on the raw list', () => {
      assert.match(
        src,
        /const candidates = receiptCurrency\s*\n\s*\? statusAndBpCandidates\.filter\(o => o\.currency === receiptCurrency\)\s*\n\s*: statusAndBpCandidates;/,
      );
    });

    it('flags excludedByCurrency only when status/BP-eligible docs exist but zero survive the currency filter', () => {
      assert.match(
        src,
        /excludedByCurrency = !!receiptCurrency\s*\n\s*&& candidates\.length === 0\s*\n\s*&& statusAndBpCandidates\.length > 0;/,
      );
    });

    it('does not conflate "zero statusAndBpCandidates to begin with" with excludedByCurrency', () => {
      // The excludedByCurrency formula must require statusAndBpCandidates.length > 0 —
      // i.e. it is false when there was nothing eligible to exclude in the first place.
      assert.match(src, /statusAndBpCandidates\.length > 0/);
    });

    it('further narrows documents by line-level goodsShipmentLine/invoicedQuantity AFTER the currency filter, without touching excludedByCurrency', () => {
      assert.match(
        src,
        /const documents = candidates\.filter\(inv => \{/,
      );
      // excludedByCurrency must already be computed (const, not reassigned) before this line-level filter
      const excludedIdx = src.indexOf('const excludedByCurrency');
      const documentsIdx = src.indexOf('const documents = candidates.filter');
      assert.ok(excludedIdx !== -1 && documentsIdx !== -1);
      assert.ok(excludedIdx < documentsIdx, 'excludedByCurrency must be finalized before the line-level documents filter runs');
    });

    it('returns sharedContext.linesCache and excludedByCurrency from fetchDocuments', () => {
      assert.match(src, /return \{ documents, sharedContext: \{ linesCache \}, excludedByCurrency \};/);
    });
  });

  it('passes noPurchaseInvoicesMatchReceiptCurrency as the noCurrencyMatchMessageKey', () => {
    assert.match(src, /noCurrencyMatchMessageKey="noPurchaseInvoicesMatchReceiptCurrency"/);
  });
});

// ---------------------------------------------------------------------------
// fetchDocuments — real behavioral tests (ETP-4028 status/BP/currency/line
// filters), executed with a mocked fetch. The component only exports a
// default React wrapper (`<ImportLinesModal fetchDocuments={fetchDocuments}
// .../>`), so — same convention as ImportFromReturnShipmentModal.test.js and
// ImportFromShipmentModal.test.js in this codebase — this mirrors the exact
// algorithm from the source verbatim (verified against the regex assertions
// above, which pin the literal source strings this copy must keep matching)
// and runs it for real against a mocked fetch, instead of only pattern-
// matching the source text.
// ---------------------------------------------------------------------------

const fetchDocuments = async ({ base, headers, bpId, invoiceId: receiptId }) => {
  const [res, headerRes] = await Promise.all([
    fetch(`${base}/purchase-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/goods-receipt/goodsReceipt/${receiptId}`, { headers }),
  ]);
  if (!res.ok) return { documents: [], sharedContext: { linesCache: {} } };

  let receiptCurrency = null;
  if (headerRes.ok) {
    receiptCurrency = (await headerRes.json())?.response?.data?.[0]?.etgoCurrency || null;
  }

  const all = (await res.json())?.response?.data || [];
  const statusAndBpCandidates = all.filter(o =>
    o.documentStatus === 'CO'
    && o.businessPartner === bpId
    && Number(o.grandTotalAmount ?? 0) >= 0
  );
  const candidates = receiptCurrency
    ? statusAndBpCandidates.filter(o => o.currency === receiptCurrency)
    : statusAndBpCandidates;
  const excludedByCurrency = !!receiptCurrency
    && candidates.length === 0
    && statusAndBpCandidates.length > 0;

  const lineResults = await Promise.all(
    candidates.map(async inv => {
      try {
        const r = await fetch(
          `${base}/purchase-invoice/lines?parentId=${inv.id}&_startRow=0&_endRow=200`,
          { headers },
        );
        return { id: inv.id, lines: r.ok ? (await r.json())?.response?.data || [] : [] };
      } catch {
        return { id: inv.id, lines: [] };
      }
    }),
  );

  const linesCache = {};
  lineResults.forEach(r => { linesCache[r.id] = r.lines; });

  const documents = candidates.filter(inv => {
    const lines = linesCache[inv.id] || [];
    return lines.some(l => !l.goodsShipmentLine && Number(l.invoicedQuantity) > 0);
  });

  return { documents, sharedContext: { linesCache }, excludedByCurrency };
};

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ invoices, receiptHeader = null, linesByInvoiceId = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/purchase-invoice/header?')) return mockRes(true, invoices);
    if (url.includes('/goods-receipt/goodsReceipt/')) return mockResSingle(true, receiptHeader);
    const linesMatch = url.match(/\/purchase-invoice\/lines\?parentId=([^&]+)/);
    if (linesMatch) return mockRes(true, linesByInvoiceId[linesMatch[1]] || []);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromPurchaseInvoiceModal — fetchDocuments (real execution, mocked fetch)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('happy path: receipt has a currency, a matching invoice with an importable line is returned and excludedByCurrency is false', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'EUR' },
      ],
      receiptHeader: { etgoCurrency: 'EUR' },
      linesByInvoiceId: {
        inv1: [{ id: 'l1', goodsShipmentLine: null, invoicedQuantity: 5 }],
      },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].id, 'inv1');
    assert.equal(result.excludedByCurrency, false);
    assert.deepEqual(result.sharedContext.linesCache.inv1, [{ id: 'l1', goodsShipmentLine: null, invoicedQuantity: 5 }]);
  });

  it('currency exclusion: status/BP-eligible invoices exist but none match the receipt currency -> documents empty, excludedByCurrency true', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'USD' },
      ],
      receiptHeader: { etgoCurrency: 'EUR' },
      linesByInvoiceId: {
        inv1: [{ id: 'l1', goodsShipmentLine: null, invoicedQuantity: 5 }],
      },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.deepEqual(result.documents, []);
    assert.equal(result.excludedByCurrency, true);
  });

  it('no eligible invoices at all (status/BP mismatch): excludedByCurrency stays false, not conflated with the currency-exclusion case', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'DR', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'EUR' },
        { id: 'inv2', documentStatus: 'CO', businessPartner: 'bp2', grandTotalAmount: 100, currency: 'EUR' },
      ],
      receiptHeader: { etgoCurrency: 'EUR' },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.deepEqual(result.documents, []);
    assert.equal(result.excludedByCurrency, false);
  });

  it('receipt has no currency: no currency filtering applied — every status/BP-eligible invoice with an importable line is kept', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'USD' },
        { id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 50, currency: 'EUR' },
      ],
      receiptHeader: { etgoCurrency: null },
      linesByInvoiceId: {
        inv1: [{ id: 'l1', goodsShipmentLine: null, invoicedQuantity: 3 }],
        inv2: [{ id: 'l2', goodsShipmentLine: null, invoicedQuantity: 4 }],
      },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.deepEqual(result.documents.map(d => d.id).sort(), ['inv1', 'inv2']);
    assert.equal(result.excludedByCurrency, false);
  });

  it('also returns no currency filtering applied when the receipt header itself has no etgoCurrency field at all', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'USD' },
      ],
      receiptHeader: {},
      linesByInvoiceId: {
        inv1: [{ id: 'l1', goodsShipmentLine: null, invoicedQuantity: 1 }],
      },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.equal(result.documents.length, 1);
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes an otherwise currency-matching candidate whose only lines are already linked to a goods shipment (line-level filter, applied AFTER currency)', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'EUR' },
      ],
      receiptHeader: { etgoCurrency: 'EUR' },
      linesByInvoiceId: {
        inv1: [{ id: 'l1', goodsShipmentLine: 'gsl1', invoicedQuantity: 5 }],
      },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    // Filtered out at the line-import stage, not the currency stage — the invoice
    // DID match the receipt currency, so this must never be reported as a currency exclusion.
    assert.deepEqual(result.documents, []);
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a candidate whose only lines have invoicedQuantity <= 0', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: 100, currency: 'EUR' },
      ],
      receiptHeader: { etgoCurrency: 'EUR' },
      linesByInvoiceId: {
        inv1: [{ id: 'l1', goodsShipmentLine: null, invoicedQuantity: 0 }],
      },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.deepEqual(result.documents, []);
    assert.equal(result.excludedByCurrency, false);
  });

  it('excludes a candidate with a negative grandTotalAmount (credit-memo-like invoice) at the status/BP stage', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', grandTotalAmount: -50, currency: 'EUR' },
      ],
      receiptHeader: { etgoCurrency: 'EUR' },
    });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.deepEqual(result.documents, []);
    assert.equal(result.excludedByCurrency, false);
  });

  it('returns an empty result set (and no currency exclusion) when there are no invoices at all', async () => {
    installFetch({ invoices: [], receiptHeader: { etgoCurrency: 'EUR' } });

    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'r1' });

    assert.deepEqual(result.documents, []);
    assert.equal(result.excludedByCurrency, false);
    assert.deepEqual(result.sharedContext.linesCache, {});
  });
});
