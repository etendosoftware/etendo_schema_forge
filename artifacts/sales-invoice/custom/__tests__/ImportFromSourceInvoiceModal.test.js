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

  it('does NOT unconditionally force-negate imported line quantity — sign is preserved from the source line', () => {
    assert.doesNotMatch(src, /const negQty = -Math\.abs\(qty\);/);
    assert.match(src, /sourceQty\s*<\s*0\s*\?\s*-Math\.abs\(qty\)\s*:\s*Math\.abs\(qty\)/);
  });

  it('wires the source-invoice-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromSourceInvoice"/);
    assert.match(src, /searchPlaceholderKey="searchSourceInvoice"/);
    assert.match(src, /emptyMessageKey="noSourceInvoicesForCustomer"/);
    assert.match(src, /noSearchResultsKey="noSourceInvoicesMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromSourceInvoice"/);
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
  return { documents, sharedContext: { alreadyImportedOrderLines }, excludedByCurrency };
}

function buildLineBody({ line, qty, invoiceId, lineNo }) {
  const unitPrice = Number(line.unitPrice) || 0;
  const listPrice = Number(line.listPrice) || unitPrice;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.etgoDiscount) || 0;
  const sourceQty = Number(line.invoicedQuantity) || 0;
  const signedQty = sourceQty < 0 ? -Math.abs(qty) : Math.abs(qty);
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: signedQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * signedQty,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    cOrderlineId: line.cOrderlineId || null,
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

describe('ImportFromSourceInvoiceModal — buildLineBody (sign preservation, not force-negated)', () => {
  it('preserves a positive source line sign on import (proveedor cobró de más scenario)', () => {
    const body = buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: 5 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, 3);
    assert.equal(body.lineNetAmount, 30);
  });

  it('preserves a negative source line sign on import (proveedor cobró de menos scenario)', () => {
    const body = buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: -5 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, -3);
    assert.equal(body.lineNetAmount, -30);
  });

  it('always uses the positive magnitude of qty from the stepper regardless of its own sign', () => {
    const negativeSourceNegativeQty = buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: -5 },
      qty: -3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(negativeSourceNegativeQty.invoicedQuantity, -3);
  });
});
