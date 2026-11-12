// @covers artifacts/sales-invoice/custom/ImportFromSourceInvoiceModal.jsx
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';
import * as importActionClient from '../../../../tools/app-shell/src/windows/custom/shared/importActionClient.js';
import { newestCreatedFirst } from '../../../../tools/app-shell/src/windows/custom/shared/invoiceOrderImport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated straight out of the .jsx — not a copy.
// See artifacts/_test-support/loadCustomModule.js (ETP-5381).
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromSourceInvoiceModal.jsx'),
  // The prelude calls `moduleApiFetch` (imported from '@/auth/api.js', a
  // binding the loader strips); the stub forwards to `globalThis.fetch`,
  // which is what the mocks below install.
  // The read-action client is the REAL shared module (ETP-6099), handed the same fetch stub.
  {
    moduleApiFetch: apiFetchToGlobalFetch,
    listAll: importActionClient.listAll,
    listLines: importActionClient.listLines,
    newestCreatedFirst,
  },
);
const { fetchDocuments, fetchLines, buildLineBody, isDocumentCovered, getDocumentTotal } = helpers;

// The invoice-line -> order-line FK key, read from the generated contract
// (ETGO_SF_FIELD.java_qualifier for C_INVOICELINE.C_OrderLine_ID).
const ORDER_LINE_FK = orderLineApiKey('sales-invoice');

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

  it('shows the quantity stepper as negative', () => {
    assert.match(src, /negativeQuantity/);
  });

  // ETP-6002: the origin link is written by the backend on each line POST (sourceInvoiceLineId).
  // The header PATCH it replaces always failed with 409 stale_record, so it must not come back.
  it('does not PATCH the header with originInvoices after the import', () => {
    assert.doesNotMatch(src, /afterImport=/);
    assert.doesNotMatch(src, /method:\s*'PATCH'/);
    assert.equal(helpers.afterImport, undefined);
  });

  it('wires the source-invoice-specific i18n keys', () => {
    assert.match(src, /titleKey="importFromSourceInvoice"/);
    assert.match(src, /searchPlaceholderKey="searchSourceInvoice"/);
    assert.match(src, /emptyMessageKey="noSourceInvoicesForCustomer"/);
    assert.match(src, /noSearchResultsKey="noSourceInvoicesMatchSearch"/);
    assert.match(src, /successMessageKey="linesImportedFromSourceInvoice"/);
  });

  // ETP-5381: `cOrderlineId` is not a key of the sales-invoice NEO spec, and
  // NeoFieldFilter.filterRecord drops unknown body keys silently.
  it('never mentions the non-existent cOrderlineId key', () => {
    assert.doesNotMatch(src, /cOrderlineId/);
  });
});

function mockRes(ok, data) {
  return { ok, json: async () => ({ response: { data } }) };
}

function mockResSingle(ok, item) {
  return { ok, json: async () => ({ response: { data: item ? [item] : [] } }) };
}

const ACTION_LIST = '/sales-invoice/header/inv1/action/availableOriginInvoices';
const ACTION_LINES = '/sales-invoice/header/inv1/action/availableOriginInvoiceLines';

/**
 * ETP-6099: the popup lists through the invoice's actions. `listed` is what availableOriginInvoices
 * answers (already filtered server-side); `invoices` / `invoiceHeader` only answer the
 * «other currency» fallback GETs, read when the action lists nothing.
 */
function installFetch({ listed = [], invoices = [], invoiceHeader = {}, lines = [], listOk = true }) {
  globalThis.fetch = mock.fn(async (url) => {
    if (url.endsWith(ACTION_LIST)) {
      return listOk
        ? { ok: true, json: async () => ({ response: { data: listed, hasMore: false } }) }
        : { ok: false, json: async () => ({ error: 'importRequiresRectificative' }) };
    }
    if (url.endsWith(ACTION_LINES)) return mockRes(true, lines);
    if (url.includes('/sales-invoice/header?')) return mockRes(true, invoices);
    if (url.includes('/sales-invoice/header/')) return mockResSingle(true, invoiceHeader);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

const callsTo = (fragment) => globalThis.fetch.mock.calls.filter(c => c.arguments[0].includes(fragment));

describe('ImportFromSourceInvoiceModal — fetchDocuments (edge case 5: rectificativa exclusion)', () => {
  afterEach(() => {
    mock.reset();
  });

  it('lists through ONE availableOriginInvoices call (every page, covered included, detail) and nothing else', async () => {
    installFetch({ listed: [{ id: 'inv2', documentNo: 'F-2', date: '2026-10-01', pendingLines: 2 }] });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(globalThis.fetch.mock.calls.length, 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, `/b${ACTION_LIST}`);
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), { limit: 1000, includeCovered: true, detail: true });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
    assert.equal(result.documents[0].invoiceDate, '2026-10-01');
    assert.equal(result.sharedContext.invoiceId, 'inv1');
    assert.equal(result.excludedByCurrency, false);
  });

  it('the «other currency» fallback asks only ARI category, non-rectificative invoices of the customer', async () => {
    installFetch({ listed: [] });
    await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const decoded = decodeURIComponent(callsTo('/sales-invoice/header?')[0].arguments[0]);
    assert.match(decoded, /"fieldName":"transactionDocument\$documentCategory","operator":"equals","value":"ARI"/);
    assert.match(decoded, /"fieldName":"transactionDocument\$etsgIsRectificative","operator":"notEqual","value":true/);
    assert.match(decoded, /"fieldName":"businessPartner","operator":"equals","value":"bp1"/);
  });

  it('a refused read rejects with ImportLoadError (the component toasts it)', async () => {
    installFetch({ listOk: false });
    await assert.rejects(
      fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' }),
      err => err instanceof importActionClient.ImportLoadError,
    );
  });

  it('keeps the listed candidates without reading the currency', async () => {
    installFetch({ listed: [{ id: 'inv2', currency: 'EUR' }], invoiceHeader: { currency: 'EUR' } });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.deepEqual(result.documents.map(d => d.id), ['inv2']);
    assert.equal(result.excludedByCurrency, false);
    assert.equal(callsTo('/sales-invoice/header/inv1').filter(c => !c.arguments[0].includes('/action/')).length, 0);
  });

  it('sets excludedByCurrency when the customer only has invoices in another currency', async () => {
    installFetch({
      listed: [],
      invoices: [{ id: 'inv2', documentStatus: 'CO', businessPartner: 'bp1', currency: 'USD' }],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.documents.length, 0);
    assert.equal(result.excludedByCurrency, true);
  });

  it('does not set excludedByCurrency when the only other candidate is the invoice itself or same-currency', async () => {
    installFetch({
      listed: [],
      invoices: [{ id: 'inv1', currency: 'USD' }, { id: 'inv3', currency: 'EUR' }],
      invoiceHeader: { currency: 'EUR' },
    });
    const result = await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    assert.equal(result.excludedByCurrency, false);
  });
});

describe('ImportFromSourceInvoiceModal — document row without its lines (eagerLoadLines off)', () => {
  it('hides an invoice with nothing left to import (pendingLines 0)', () => {
    assert.equal(isDocumentCovered({ pendingLines: 0 }), true);
    assert.equal(isDocumentCovered({ pendingLines: 2 }), false);
    assert.equal(isDocumentCovered({}), false);
  });

  it('shows the row total negated, as the negative quantities shown', () => {
    assert.equal(getDocumentTotal({ amount: 120.5 }), -120.5);
    assert.equal(getDocumentTotal({}), null);
  });
});

describe('ImportFromSourceInvoiceModal — buildLineBody (always negative, ETP-4737)', () => {
  it('force-negates a positive source line on import', async () => {
    const body = await buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: 5 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, -3);
    assert.equal(body.lineNetAmount, -30);
  });

  it('keeps a negative source line negative on import', async () => {
    const body = await buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: -5 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, -3);
    assert.equal(body.lineNetAmount, -30);
  });

  it('always uses the negative of the magnitude regardless of the stepper qty\'s own sign', async () => {
    const body = await buildLineBody({
      line: { product: 'p1', unitPrice: 10, invoicedQuantity: -5 },
      qty: -3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.invoicedQuantity, -3);
  });

  it('carries the source line id as sourceInvoiceLineId, ETP-4737 duplicate-detection follow-up', async () => {
    const body = await buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body.sourceInvoiceLineId, 'source-line-1');
  });
});

// ETP-6002 (as ETP-5729 for the return path): a rectificative line never carries the source line's
// order line — C_INVOICE_POST would lower the order's invoiced quantity and match the rectificative
// to the order's shipment. Neither the spec key nor the legacy cOrderlineId may be sent.
describe('ImportFromSourceInvoiceModal — buildLineBody sends no order line (ETP-6002)', () => {
  it('drops the source line order line', async () => {
    const body = await buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10, [ORDER_LINE_FK]: 'ol1', cOrderlineId: 'ol9' },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(Object.hasOwn(body, ORDER_LINE_FK), false);
    assert.equal(Object.hasOwn(body, 'cOrderlineId'), false);
    assert.equal(body.sourceInvoiceLineId, 'source-line-1');
  });
});

describe('ImportFromSourceInvoiceModal — duplicate detection via sourceInvoiceLineId', () => {
  afterEach(() => {
    mock.reset();
  });

  it('asks availableOriginInvoiceLines for the source invoice, covered lines included', async () => {
    installFetch({ lines: [] });
    await fetchLines({ base: '/b', headers: {}, docId: 'inv2', sharedContext: { invoiceId: 'inv1' } });
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.equal(url, `/b${ACTION_LINES}`);
    assert.deepEqual(JSON.parse(opts.body), { invoiceId: 'inv2', includeCovered: true, detail: true });
  });

  it('marks a source line already imported into the current invoice as _alreadyImported, keeping its quantity', async () => {
    installFetch({
      lines: [
        { id: 'source-line-1', lineNo: 10, invoicedQuantity: 2, pendingQuantity: 0, unitPrice: 10, importedHere: true },
        { id: 'source-line-2', lineNo: 20, invoicedQuantity: -3, pendingQuantity: 3, unitPrice: 10, importedHere: false, discount: 5 },
      ],
    });
    const lines = await fetchLines({ base: '/b', headers: {}, docId: 'inv2', sharedContext: { invoiceId: 'inv1' } });
    const imported = lines.find(l => l.id === 'source-line-1');
    const offered = lines.find(l => l.id === 'source-line-2');
    assert.equal(imported._alreadyImported, true);
    assert.equal(imported._maxQty, 2);
    assert.equal(offered._alreadyImported, false);
    assert.equal(offered._maxQty, 3);
    assert.equal(offered._lineNetAmount, -30);
    assert.equal(offered.etgoDiscount, 5);
  });
});
