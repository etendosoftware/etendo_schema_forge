import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApSubtype } from '../purchaseInvoiceSubtype.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ImportFromSourceInvoiceModal.jsx'), 'utf8');

describe('ImportFromSourceInvoiceModal (purchase) — source shape', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ImportFromSourceInvoiceModal/);
  });

  it('delegates to the shared ImportLinesModal and forwards parent props', () => {
    assert.match(src, /from '@\/components\/contract-ui\/ImportLinesModal'/);
    assert.match(src, /function ImportFromSourceInvoiceModal\(props\)/);
    assert.match(src, /<ImportLinesModal[\s\S]*\{\.\.\.props\}/);
  });

  it('filters source invoices to apInvoiceSubtype === FAC via getApSubtype — ETP-4737 edge case 5', () => {
    assert.match(src, /from '\.\/purchaseInvoiceSubtype'/);
    assert.match(src, /getApSubtype\(inv\)\s*===\s*'FAC'/);
  });

  it('excludes the current invoice and matches business partner + CO status', () => {
    assert.match(src, /inv\.id\s*!==\s*invoiceId/);
    assert.match(src, /inv\.documentStatus\s*===\s*'CO'/);
    assert.match(src, /inv\.businessPartner\s*===\s*bpId/);
  });

  it('always force-negates the imported quantity, mirroring ImportFromGoodsReturnModal', () => {
    assert.match(src, /const negQty = -Math\.abs\(qty\);/);
    assert.match(src, /invoicedQuantity:\s*negQty/);
  });

  it('best-effort PATCHes originInvoice after import to link back to the source', () => {
    assert.match(src, /afterImport/);
    assert.match(src, /originInvoice:\s*sourceInvoiceId/);
    assert.match(src, /method:\s*'PATCH'/);
  });

  it('wires the source-invoice-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromSourceInvoice"/);
    assert.match(src, /emptyMessageKey="noFacSourceInvoicesForSupplier"/);
    assert.match(src, /successMessageKey="linesImportedFromSourceInvoice"/);
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

async function fetchDocuments({ base, headers, bpId, invoiceId }) {
  const res = await fetch(`${base}/purchase-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers });
  let documents = [];
  if (res.ok) {
    const all = (await res.json())?.response?.data || [];
    documents = all.filter(inv =>
      inv.id !== invoiceId
      && inv.documentStatus === 'CO'
      && inv.businessPartner === bpId
      && getApSubtype(inv) === 'FAC',
    );
  }
  return { documents, sharedContext: { productAuxMap: {} }, excludedByCurrency: false };
}

function buildLineBody({ line, qty }) {
  const unitPrice = Number(line._unitPrice) || Number(line.unitPrice) || 0;
  const negQty = -Math.abs(qty);
  const lineNetAmount = negQty * unitPrice;
  return { invoicedQuantity: negQty, unitPrice, lineNetAmount };
}

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function installFetch(invoices) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.includes('/purchase-invoice/header?')) return mockRes(true, invoices);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('ImportFromSourceInvoiceModal (purchase) — fetchDocuments (edge case 5)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('includes a plain FAC invoice from the same supplier', async () => {
    installFetch([{ id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', apInvoiceSubtype: 'FAC' }]);
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
  });

  it('excludes another rectificativa invoice from being selectable as a source', async () => {
    installFetch([{ id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', apInvoiceSubtype: 'RECTIFICATIVA' }]);
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('excludes a historical AP CreditMemo invoice from being selectable as a source (legacy fallback)', async () => {
    installFetch([{
      id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1',
      'transactionDocument$_identifier': 'AP CreditMemo',
    }]);
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('excludes the invoice being edited from its own candidates', async () => {
    installFetch([{ id: 'inv1', documentStatus: 'CO', businessPartner: 'bp1', apInvoiceSubtype: 'FAC' }]);
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
  });

  it('mixed candidate set: only the plain FAC invoice survives', async () => {
    installFetch([
      { id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', apInvoiceSubtype: 'FAC' },
      { id: 'inv3', documentStatus: 'CO', businessPartner: 'bp1', apInvoiceSubtype: 'RECTIFICATIVA' },
      { id: 'inv4', documentStatus: 'DR', businessPartner: 'bp1', apInvoiceSubtype: 'FAC' },
      { id: 'inv5', documentStatus: 'CO', businessPartner: 'other-bp', apInvoiceSubtype: 'FAC' },
    ]);
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
  });
});

describe('ImportFromSourceInvoiceModal (purchase) — buildLineBody force-negates (both directions)', () => {
  it('negates an already-positive source unit price/qty combination', () => {
    const body = buildLineBody({ line: { unitPrice: 10 }, qty: 4 });
    assert.equal(body.invoicedQuantity, -4);
    assert.equal(body.lineNetAmount, -40);
  });

  it('keeps the result negative even if the caller passed a negative qty', () => {
    const body = buildLineBody({ line: { unitPrice: 10 }, qty: -4 });
    assert.equal(body.invoicedQuantity, -4);
  });
});
