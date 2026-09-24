import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCustomModule,
  apiFetchToGlobalFetch,
} from '../../../_test-support/loadCustomModule.js';
import { orderLineApiKey } from '../../../_test-support/contractApiKey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The REAL production helpers, evaluated straight out of the .jsx — not a copy.
// See artifacts/_test-support/loadCustomModule.js (ETP-5381).
const { helpers, source: src } = loadCustomModule(
  join(__dirname, '..', 'ImportFromSourceInvoiceModal.jsx'),
  // The prelude calls `moduleApiFetch` (imported from '@/auth/api.js', a
  // binding the loader strips); the stub forwards to `globalThis.fetch`,
  // which is what the mocks below install.
  { moduleApiFetch: apiFetchToGlobalFetch },
);
const { fetchDocuments, fetchLines, buildLineBody, afterImport } = helpers;

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

  it('shows the quantity stepper as negative and links back to the source invoice(s)', () => {
    assert.match(src, /negativeQuantity/);
    assert.match(src, /originInvoices/);
    assert.match(src, /afterImport=\{afterImport\}/);
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

function installFetch({ invoices = [], invLines = [], invoiceHeader = {} }) {
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

  it('server-side criteria requests only ARI category, non-rectificative invoices', async () => {
    installFetch({ invoices: [] });
    await fetchDocuments({ base: '/b', headers: {}, bpId: 'bp1', invoiceId: 'inv1' });
    const calledUrl = globalThis.fetch.mock.calls[0].arguments[0];
    const decoded = decodeURIComponent(calledUrl);
    assert.match(decoded, /"fieldName":"transactionDocument\$documentCategory","operator":"equals","value":"ARI"/);
    assert.match(decoded, /"fieldName":"transactionDocument\$etsgIsRectificative","operator":"notEqual","value":true/);
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

describe('ImportFromSourceInvoiceModal — buildLineBody order line FK (ETP-5381)', () => {
  // ETP-5381 REGRESSION GUARD — the FK must travel under the spec's key.
  // Under the old `cOrderlineId`, NeoFieldFilter dropped it silently (HTTP 200,
  // line created, C_OrderLine_ID NULL), which kept M_MATCHSO empty and skipped
  // `UPDATE C_ORDERLINE SET QtyInvoiced`, leaving the order invoiceable forever.
  it('propagates the source line order line under the spec API key for C_OrderLine_ID', async () => {
    const body = await buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10, [ORDER_LINE_FK]: 'ol1' },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body[ORDER_LINE_FK], 'ol1');
  });

  it('does not send the order line under a key the NEO spec would silently drop', async () => {
    const body = await buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10, [ORDER_LINE_FK]: 'ol1' },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(Object.hasOwn(body, 'cOrderlineId'), false);
  });

  it('reads the source line FK from the spec key, not from the legacy cOrderlineId', async () => {
    const body = await buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10, cOrderlineId: 'ol9' },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(body[ORDER_LINE_FK], null);
  });

  it('sends an explicit null when the source line has no linked order line', async () => {
    const body = await buildLineBody({
      line: { id: 'source-line-1', product: 'p1', unitPrice: 10 },
      qty: 3,
      invoiceId: 'inv1',
      lineNo: 10,
    });
    assert.equal(Object.hasOwn(body, ORDER_LINE_FK), true);
    assert.equal(body[ORDER_LINE_FK], null);
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

  it('marks a source line already imported into the current invoice as _alreadyImported', async () => {
    globalThis.fetch = mock.fn(async () => mockRes(true, [
      { id: 'source-line-1', invoicedQuantity: 2, unitPrice: 10 },
      { id: 'source-line-2', invoicedQuantity: 2, unitPrice: 10 },
    ]));
    const lines = await fetchLines({
      base: '/b',
      headers: {},
      docId: 'inv2',
      sharedContext: { alreadyImportedSourceLineIds: new Set(['source-line-1']) },
    });
    assert.equal(lines.find(l => l.id === 'source-line-1')._alreadyImported, true);
    assert.equal(lines.find(l => l.id === 'source-line-2')._alreadyImported, false);
  });
});

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

  it('PATCHes originInvoices with BOTH ids when importing from two source invoices — this used to silently drop the first one', async () => {
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
