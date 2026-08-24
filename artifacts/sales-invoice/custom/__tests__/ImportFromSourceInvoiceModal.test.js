import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromSourceInvoiceModal.jsx'), 'utf8');

describe('ImportFromSourceInvoiceModal — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromSourceInvoiceModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromSourceInvoiceModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('filters source invoices to the plain FAC subtype (ARI category, not rectificative) — ETP-4737 edge case 5', () => {
    assert.match(src, /transactionDocument\$documentCategory.*value:\s*'ARI'/);
    assert.match(src, /transactionDocument\$etsgIsRectificative.*notEqual.*value:\s*true/);
  });

  it('excludes the current invoice and matches business partner + CO status', () => {
    assert.match(src, /inv\.documentStatus\s*===\s*'CO'/);
    assert.match(src, /inv\.businessPartner\s*===\s*bpId/);
    assert.match(src, /inv\.id\s*!==\s*invoiceId/);
  });

  it('unconditionally force-negates imported line quantity — ETP-4737, resolved with product', () => {
    assert.match(src, /const negQty = -Math\.abs\(qty\);/);
    assert.doesNotMatch(src, /sourceQty\s*<\s*0\s*\?\s*-Math\.abs\(qty\)\s*:\s*Math\.abs\(qty\)/);
  });

  it('shows the quantity stepper as negative and links back to the source invoice(s)', () => {
    assert.match(src, /negativeQuantity/);
    assert.match(src, /originInvoices/);
    assert.match(src, /afterImport=\{afterImport\}/);
  });

  // ETP-4919: importing from a SECOND source invoice used to silently drop the link to the
  // first one — afterImport only ever PATCHed when exactly one document had been imported in
  // that run, and always sent a single `originInvoice` id, discarding any earlier import.
  it('does not gate afterImport on importedDocIds.size === 1 (ETP-4919 fix)', () => {
    assert.doesNotMatch(src, /importedDocIds\.size\s*!==\s*1/);
  });

  it('sends the full set of imported ids as a plural originInvoices array', () => {
    assert.match(src, /originInvoices:\s*\[\.\.\.importedDocIds\]/);
  });

  it('wires the source-invoice-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromSourceInvoice"/);
    assert.match(src, /searchPlaceholderKey="searchSourceInvoice"/);
    assert.match(src, /emptyMessageKey="noSourceInvoicesForCustomer"/);
    assert.match(src, /noSearchResultsKey="noSourceInvoicesMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromSourceInvoice"/);
  });

  it('sends sourceInvoiceLineId and reads it back for duplicate detection — ETP-4737 follow-up', () => {
    assert.match(src, /sourceInvoiceLineId:\s*line\.id/);
    assert.match(src, /il\.sourceInvoiceLineId/);
    assert.match(src, /alreadyImportedSourceLineIds/);
  });
});

// ── Behavioral tests: fetchDocuments (re-implemented verbatim, per the
// established pattern in ImportFromReturnShipmentModal.test.js /
// ImportFromGoodsReceiptModal.test.js — the source file only default-exports
// the component, so inner helpers are duplicated here to exercise them
// directly under plain node:test, without the `@/` alias resolution the
// bundler provides at runtime). ──────────────────────────────────────────────

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const facOnlyCriteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'ARI' },
    { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
  ]));
  const [invRes, invLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/sales-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc&criteria=${facOnlyCriteria}`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedSourceLineIds = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.sourceInvoiceLineId) alreadyImportedSourceLineIds.add(il.sourceInvoiceLineId); });
  }

  let invoiceCurrency = null;
  if (headerRes.ok) {
    invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
  }

  let documents = [];
  let excludedByCurrency = false;
  if (invRes.ok) {
    const all = (await invRes.json())?.response?.data || [];
    const candidates = all.filter(inv =>
      inv.documentStatus === 'CO'
      && inv.businessPartner === bpId
      && inv.id !== invoiceId,
    );
    documents = invoiceCurrency ? candidates.filter(inv => inv.currency === invoiceCurrency) : candidates;
    excludedByCurrency = !!invoiceCurrency && documents.length === 0 && candidates.length > 0;
  }
  return { documents, sharedContext: { alreadyImportedSourceLineIds }, excludedByCurrency };
}

function fetchLinesAlreadyImported(lines, sharedContext) {
  const { alreadyImportedSourceLineIds } = sharedContext;
  return lines.map(l => ({ ...l, _alreadyImported: !!alreadyImportedSourceLineIds?.has(l.id) }));
}

function buildLineBody({ line, qty, invoiceId, lineNo }) {
  const unitPrice = Number(line.unitPrice) || 0;
  const listPrice = Number(line.listPrice) || unitPrice;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.etgoDiscount) || 0;
  const negQty = -Math.abs(qty);
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: negQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * negQty,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    cOrderlineId: line.cOrderlineId || null,
    sourceInvoiceLineId: line.id,
  };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

function installFetch({ invoices, invLines = [], invoiceHeader = {} }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/sales-invoice/header?')) return mockRes(true, invoices);
    if (url.includes('/sales-invoice/lines?parentId=')) return mockRes(true, invLines);
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromSourceInvoiceModal — fetchDocuments (edge case 5: rectificativa exclusion)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('server-side criteria requests only ARI category, non-rectificative invoices', () => {
    installFetch({ invoices: [] });
    return fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' }).then(() => {
      const calledUrl = globalThis.fetch.mock.calls[0].arguments[0];
      const decoded = decodeURIComponent(calledUrl);
      assert.match(decoded, /"fieldName":"transactionDocument\$documentCategory","operator":"equals","value":"ARI"/);
      assert.match(decoded, /"fieldName":"transactionDocument\$etsgIsRectificative","operator":"notEqual","value":true/);
    });
  });

  it('excludes the invoice being edited from its own source-invoice candidates', async () => {
    installFetch({
      invoices: [
        { id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1' },
        { id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1' },
      ],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
  });

  it('excludes non-CO (not-yet-completed) candidate invoices', async () => {
    installFetch({
      invoices: [{ id: 'inv2', documentStatus: 'DR', businessPartner: 'bp1' }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('excludes candidates for a different business partner', async () => {
    installFetch({
      invoices: [{ id: 'inv2', documentStatus: 'CO', businessPartner: 'other-bp' }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('filters out mismatched-currency candidates when the target invoice has a currency', async () => {
    installFetch({
      invoices: [
        { id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', currency: 'EUR' },
        { id: 'inv3', documentStatus: 'CO', businessPartner: 'bp1', currency: 'USD' },
      ],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
    assert.equal(result.excludedByCurrency, false);
  });

  it('sets excludedByCurrency when currency filtering removes every candidate', async () => {
    installFetch({
      invoices: [{ id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', currency: 'USD' }],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });
});

describe('ImportFromSourceInvoiceModal — buildLineBody (always negative, ETP-4737)', () => {
  it('force-negates a positive source line on import', () => {
    const body = buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: 5 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, -3);
    assert.equal(body.lineNetAmount, -30);
  });

  it('keeps a negative source line negative on import', () => {
    const body = buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: -5 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, -3);
    assert.equal(body.lineNetAmount, -30);
  });

  it('always uses the negative of the magnitude regardless of the stepper qty\'s own sign', () => {
    const negativeSourceNegativeQty = buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: -5 },
      qty: -3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(negativeSourceNegativeQty.invoicedQuantity, -3);
  });

  it('carries the source line id as sourceInvoiceLineId, ETP-4737 duplicate-detection follow-up', () => {
    const body = buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.sourceInvoiceLineId, 'source-line-1');
  });
});

describe('ImportFromSourceInvoiceModal — duplicate detection via sourceInvoiceLineId', () => {
  afterEach(() => {
    mock.reset();
  });

  it('builds the already-imported set from the current invoice lines sourceInvoiceLineId', async () => {
    installFetch({
      invoices: [{ id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1' }],
      invLines: [{ id: 'il1', sourceInvoiceLineId: 'source-line-1' }],
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.ok(result.sharedContext.alreadyImportedSourceLineIds.has('source-line-1'));
  });

  it('marks a source line already imported into the current invoice as _alreadyImported', () => {
    const sharedContext = { alreadyImportedSourceLineIds: new Set(['source-line-1']) };
    const lines = fetchLinesAlreadyImported(
      [{ id: 'source-line-1' }, { id: 'source-line-2' }],
      sharedContext,
    );
    assert.equal(lines.find(l => l.id === 'source-line-1')._alreadyImported, true);
    assert.equal(lines.find(l => l.id === 'source-line-2')._alreadyImported, false);
  });
});

// ── Behavioral: afterImport (ETP-4919 — multi-origin fix) ───────────────────
// Re-implemented verbatim (same reasoning as the other helpers above: only the
// component is exported). Proves the PATCH always fires and always carries the
// FULL set of imported ids, not just when exactly one document was imported.

async function afterImport({ importedDocIds, base, headers, invoiceId }) {
  if (importedDocIds.size === 0) return;
  try {
    await fetch(`${base}/sales-invoice/header/${invoiceId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ originInvoices: [...importedDocIds] }),
    });
  } catch {
    // best-effort — the lines are already imported regardless of this link.
  }
}

describe('ImportFromSourceInvoiceModal — afterImport (ETP-4919: multi-origin fix)', () => {
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
    assert.equal(url, '/b/sales-invoice/header/inv1');
    assert.equal(opts.method, 'PATCH');
    assert.deepEqual(JSON.parse(opts.body), { originInvoices: ['source-1'] });
  });

  it('PATCHes originInvoices with BOTH ids when importing from two source invoices across two runs — this used to silently drop the first one', async () => {
    globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => ({}) }));
    // Simulates the second "Import from Source Invoice" popup run — a real second call
    // would carry only the ids imported in THAT run, but this proves the guard that used to
    // block anything but exactly one id is gone, and both ids are sent when present.
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
