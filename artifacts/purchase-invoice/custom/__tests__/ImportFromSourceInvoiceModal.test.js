// @covers artifacts/purchase-invoice/custom/ImportFromSourceInvoiceModal.jsx
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApSubtype } from '../purchaseInvoiceSubtype.js';
import { loadCustomModule, apiFetchToGlobalFetch } from '../../../_test-support/loadCustomModule.js';
import * as importActionClient from '../../../../tools/app-shell/src/windows/custom/shared/importActionClient.js';
import { newestCreatedFirst } from '../../../../tools/app-shell/src/windows/custom/shared/invoiceOrderImport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// ETP-6099: the listing helpers are the REAL production ones (loadCustomModule), the read-action
// client the real shared module, both over the same fetch stub.
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromSourceInvoiceModal.jsx'),
  {
    moduleApiFetch: apiFetchToGlobalFetch,
    listAll: importActionClient.listAll,
    listLines: importActionClient.listLines,
    newestCreatedFirst,
  },
);
const { fetchDocuments, fetchLines, isDocumentCovered, getDocumentTotal } = helpers;

describe('ImportFromSourceInvoiceModal (purchase) — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromSourceInvoiceModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromSourceInvoiceModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  // ETP-6099: FAC-only, own supplier, completed and not the invoice itself are decided by the
  // availableOriginInvoices action now (behaviour tests below); the client filter must not return.
  it('lists through the invoice actions, not a client-filtered header list', () => {
    assert.match(src, /action: 'availableOriginInvoices'/);
    assert.match(src, /action: 'availableOriginInvoiceLines'/);
    assert.doesNotMatch(src, /getApSubtype\(inv\)/);
  });

  it('always force-negates the imported quantity, mirroring ImportFromGoodsReturnModal', () => {
    assert.match(src, /const negQty = -Math\.abs\(qty\);/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
  });

  it('best-effort PATCHes originInvoices after import to link back to the source(s)', () => {
    assert.match(src, /afterImport/);
    assert.match(src, /originInvoices:\s*\[\.\.\.importedDocIds\]/);
    assert.match(src, /method:\s*'PATCH'/);
  });

  // ETP-4919: importing from a SECOND source invoice used to silently drop the link to the
  // first one — afterImport only ever PATCHed when exactly one document had been imported in
  // that run, and always sent a single `originInvoice` id, discarding any earlier import.
  it('does not gate afterImport on importedDocIds.size === 1 (ETP-4919 fix)', () => {
    assert.doesNotMatch(src, /importedDocIds\.size\s*!==\s*1/);
  });

  it('wires the source-invoice-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromSourceInvoice"/);
    assert.match(src, /emptyMessageKey="noFacSourceInvoicesForSupplier"/);
    assert.match(src, /successMessageKey="linesImportedFromSourceInvoice"/);
  });

  it('sends sourceInvoiceLineId and reads importedHere back for duplicate detection — ETP-4737 follow-up', () => {
    assert.match(src, /sourceInvoiceLineId:\s*line\.id/);
    assert.match(src, /importedHere/);
  });
});

describe('ImportFromSourceInvoiceModal (purchase) — getApSubtype exclusion, real module', () => {
  it('excludes a rectificativa invoice (new doc type) from being a valid FAC source', () => {
    assert.notEqual(getApSubtype({ apInvoiceSubtype: 'RECTIFICATIVA' }), 'FAC');
  });

  it('excludes a historical AP CreditMemo invoice from being a valid FAC source (fallback path)', () => {
    assert.notEqual(
      getApSubtype({ 'transactionDocument$_identifier': 'AP CreditMemo' }),
      'FAC',
    );
  });

  it('accepts a plain AP Invoice as a valid FAC source', () => {
    assert.equal(getApSubtype({ apInvoiceSubtype: 'FAC' }), 'FAC');
  });
});

// ── Behavioral tests: fetchDocuments / buildLineBody (re-implemented per the
// established repo pattern — see ImportFromGoodsReceiptModal.test.js). ──────

function buildLineBody({ line, qty }) {
  const unitPrice = Number(line._unitPrice) || Number(line.unitPrice) || 0;
  const negQty = -Math.abs(qty);
  const lineNetAmount = negQty * unitPrice;
  return { invoicedQuantity: negQty, unitPrice, lineNetAmount, sourceInvoiceLineId: line.id };
}

const ACTION_LIST = '/purchase-invoice/header/inv1/action/availableOriginInvoices';
const ACTION_LINES = '/purchase-invoice/header/inv1/action/availableOriginInvoiceLines';

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data, hasMore: false } }) };
}

/** `listed` = what availableOriginInvoices answers (filtered server-side), `lines` = the lines action. */
function installFetch({ listed = [], lines = [], listOk = true } = {}) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.endsWith(ACTION_LIST)) return listOk ? mockRes(true, listed) : { ok: false, json: async () => null };
    if (url.endsWith(ACTION_LINES)) return mockRes(true, lines);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromSourceInvoiceModal (purchase) — fetchDocuments (edge case 5)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('lists the FAC candidates with ONE availableOriginInvoices call, covered included, nothing else', async () => {
    installFetch({ listed: [{ id: 'inv2', documentNo: 'FP-2', date: '2026-10-02', pendingLines: 1 }] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, `/b${ACTION_LIST}`);
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), { limit: 1000, includeCovered: true, detail: true });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
    assert.equal(result.documents[0].invoiceDate, '2026-10-02');
    assert.equal(result.sharedContext.invoiceId, 'inv1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('follows nextOffset while hasMore (every candidate examined)', async () => {
    let page = 0;
    globalThis.fetch = mock.fn(async () => {
      page += 1;
      return page === 1
        ? { ok: true, json: async () => ({ response: { data: [{ id: 'a' }], hasMore: true, nextOffset: 1000 } }) }
        : { ok: true, json: async () => ({ response: { data: [{ id: 'b' }], hasMore: false, nextOffset: null } }) };
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['a', 'b']);
    assert.equal(JSON.parse(globalThis.fetch.mock.calls[1].arguments[1].body).offset, 1000);
  });

  it('lists newest created first, as the header GET did (the action answers by invoice date)', async () => {
    installFetch({ listed: [
      { id: 'old', date: '2026-10-05', creationDate: '2026-09-01T08:00:00' },
      { id: 'new', date: '2026-10-01', creationDate: '2026-10-02T08:00:00' },
    ] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['new', 'old']);
  });

  it('a refused read rejects with ImportLoadError (the component toasts it)', async () => {
    installFetch({ listOk: false });
    await assert.rejects(
      fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' }),
      err => err instanceof importActionClient.ImportLoadError,
    );
  });

  it('the row hides a covered invoice and shows its total negated, without its lines', () => {
    assert.equal(isDocumentCovered({ pendingLines: 0 }), true);
    assert.equal(isDocumentCovered({ pendingLines: 3 }), false);
    assert.equal(getDocumentTotal({ amount: 40 }), -40);
    assert.equal(getDocumentTotal({}), null);
  });
});

describe('ImportFromSourceInvoiceModal (purchase) — buildLineBody force-negates (both directions)', () => {
  it('negates an already-positive source unit price/qty combination', () => {
    const body = buildLineBody({ line: { unitPrice: 10, id: 'l1' }, qty: 4 });
    assert.equal(body.invoicedQuantity, -4);
    assert.equal(body.lineNetAmount, -40);
  });

  it('keeps the result negative even if the caller passed a negative qty', () => {
    const body = buildLineBody({ line: { unitPrice: 10, id: 'l1' }, qty: -4 });
    assert.equal(body.invoicedQuantity, -4);
  });

  it('carries the source line id as sourceInvoiceLineId, ETP-4737 duplicate-detection follow-up', () => {
    const body = buildLineBody({ line: { unitPrice: 10, id: 'source-line-1' }, qty: 4 });
    assert.equal(body.sourceInvoiceLineId, 'source-line-1');
  });
});

describe('ImportFromSourceInvoiceModal (purchase) — duplicate detection via sourceInvoiceLineId', () => {
  afterEach(() => {
    mock.reset();
  });

  it('asks availableOriginInvoiceLines for the source invoice, covered lines included', async () => {
    installFetch();
    await fetchLines({ base: '/b', headers: {}, docId: 'inv2', sharedContext: { invoiceId: 'inv1' } });
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, `/b${ACTION_LINES}`);
    assert.deepEqual(JSON.parse(opts.body), { invoiceId: 'inv2', includeCovered: true, detail: true });
  });

  it('marks a source line already imported into the current invoice as _alreadyImported, keeping its quantity', async () => {
    installFetch({
      lines: [
        { id: 'source-line-1', lineNo: 10, invoicedQuantity: 2, pendingQuantity: 0, unitPrice: 10, importedHere: true },
        { id: 'source-line-2', lineNo: 20, invoicedQuantity: 4, pendingQuantity: 4, unitPrice: 10, importedHere: false, tax: 't1', uOM: 'u1' },
      ],
    });
    const lines = await fetchLines({ base: '/b', headers: {}, docId: 'inv2', sharedContext: { invoiceId: 'inv1' } });
    const imported = lines.find(l => l.id === 'source-line-1');
    const offered = lines.find(l => l.id === 'source-line-2');
    assert.equal(imported._alreadyImported, true);
    assert.equal(imported._maxQty, 2);
    assert.equal(offered._alreadyImported, false);
    assert.equal(offered._maxQty, 4);
    assert.equal(offered._lineNetAmount, 40);
    assert.equal(offered._tax, 't1');
    assert.equal(offered._uOM, 'u1');
  });
});

// ── Behavioral: afterImport (ETP-4919 — multi-origin fix) ───────────────────
// Re-implemented verbatim (same reasoning as the other helpers above: only the
// component is exported). Proves the PATCH always fires and always carries the
// FULL set of imported ids, not just when exactly one document was imported.

async function afterImport({ importedDocIds, base, headers, invoiceId }) {
  if (importedDocIds.size === 0) return;
  try {
    await fetch(`${base}/purchase-invoice/header/${invoiceId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ originInvoices: [...importedDocIds] }),
    });
  } catch {
    // best-effort — the lines are already imported regardless of this link.
  }
}

describe('ImportFromSourceInvoiceModal (purchase) — afterImport (ETP-4919: multi-origin fix)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('PATCHes originInvoices with a single id when importing from one source invoice', async () => {
    globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    await afterImport({
      importedDocIds: new Set(['source-1']),
      base: '/b', headers: {}, invoiceId: 'inv1',
    });
    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, '/b/purchase-invoice/header/inv1');
    assert.equal(opts.method, 'PATCH');
    assert.deepEqual(JSON.parse(opts.body), { originInvoices: ['source-1'] });
  });

  it('PATCHes originInvoices with BOTH ids when importing from two source invoices across two runs — this used to silently drop the first one', async () => {
    globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    await afterImport({
      importedDocIds: new Set(['source-1', 'source-2']),
      base: '/b', headers: {}, invoiceId: 'inv1',
    });
    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.deepEqual(JSON.parse(opts.body), { originInvoices: ['source-1', 'source-2'] });
  });

  it('does not PATCH when nothing was imported', async () => {
    globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    await afterImport({ importedDocIds: new Set(), base: '/b', headers: {}, invoiceId: 'inv1' });
    assert.equal(globalThis.fetch.mock.calls.length, 0);
  });

  it('swallows a fetch failure (best-effort link, lines are already imported regardless)', async () => {
    globalThis.fetch = mock.fn(async () => { throw new Error('network error'); });
    await assert.doesNotReject(afterImport({
      importedDocIds: new Set(['source-1']),
      base: '/b', headers: {}, invoiceId: 'inv1',
    }));
  });
});
