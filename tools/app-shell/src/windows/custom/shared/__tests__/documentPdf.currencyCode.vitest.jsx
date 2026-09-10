// ETP-5125 (CP-2) — the printable's header must state the DOCUMENT's currency.
//
// The value MUST come from the header each builder already fetches
// (`currency$_identifier`), NEVER from the `currencyData` argument: that one is
// `null` on the hook-free print path (`documentPdfRegistry.js` -> `commercial()`,
// which passes `null` deliberately), so sourcing it there would make the printed
// PDF disagree with the previewed and emailed one for the same record — breaking
// the "one document, one design" criterion in docs/document-printables.md.
//
// Each case therefore passes a `currencyData` whose `orgCurrencyCode` differs
// from the document's currency: a builder that read the wrong source would emit
// the org code and fail.
//
// The four commercial documents are driven through their PUBLIC hooks so the
// whole chain runs (build*Data -> renderDocumentPdf -> renderPdf), with only
// `globalThis.fetch` intercepted.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useOrderPdf } from '../useOrderPdf.js';
import { usePurchaseOrderPdf } from '../usePurchaseOrderPdf.js';
import { useInvoicePdf } from '../useInvoicePdf.js';
import { useQuotationPdf } from '../useQuotationPdf.js';
import { resolveDocumentCurrencyCode } from '../documentPdf.js';
import { installDocumentPdfFetchMock } from './testUtils/documentPdfNetworkMock.js';

const TOKEN = 'tok';
const DOC_CURRENCY = 'USD';
const ORG_CURRENCY = 'EUR';

// Deliberately different from DOC_CURRENCY — see the file header.
const CURRENCY_DATA = { orgCurrencyCode: ORG_CURRENCY, exchangeRate: 1.1 };

/**
 * One entry per commercial document. `hook` is invoked with the record id and
 * receives `currencyData` where the signature accepts it (the invoice's does
 * not — its template has no conversion row).
 */
const DOCUMENTS = [
  {
    name: 'sales-order',
    apiBase: 'https://api.example/sws/neo/sales-order',
    headerPath: '/sales-order/header/',
    linesPath: '/sales-order/lines',
    header: { documentNo: 'SO-1', grandTotalAmount: 121, summedLineAmount: 100 },
    lines: [{ lineNo: 1, orderedQuantity: 1, listPrice: 100, lineGrossAmount: 121 }],
    hook: (id, base) => useOrderPdf(id, base, TOKEN, CURRENCY_DATA),
  },
  {
    name: 'purchase-order',
    apiBase: 'https://api.example/sws/neo/purchase-order',
    headerPath: '/purchase-order/header/',
    linesPath: '/purchase-order/lines',
    header: { documentNo: 'PO-1', grandTotalAmount: 121, summedLineAmount: 100 },
    lines: [{ lineNo: 1, orderedQuantity: 1, listPrice: 100, lineGrossAmount: 121 }],
    hook: (id, base) => usePurchaseOrderPdf(id, base, TOKEN, CURRENCY_DATA),
  },
  {
    name: 'sales-invoice',
    apiBase: 'https://api.example/sws/neo/sales-invoice',
    headerPath: '/sales-invoice/header/',
    linesPath: '/sales-invoice/lines',
    header: { documentNo: 'INV-1', grandTotalAmount: 121, summedLineAmount: 100 },
    lines: [{ lineNo: 1, invoicedQuantity: 1, unitPrice: 100, lineNetAmount: 100 }],
    hook: (id, base) => useInvoicePdf(id, base, TOKEN),
  },
  {
    name: 'sales-quotation',
    apiBase: 'https://api.example/sws/neo/sales-quotation',
    headerPath: '/sales-quotation/quotation/',
    linesPath: '/sales-quotation/quotationLine',
    header: { documentNo: 'QUO-1', grandTotalAmount: 121, summedLineAmount: 100 },
    lines: [{ lineNo: 1, orderedQuantity: 1, unitPrice: 100, lineNetAmount: 100 }],
    hook: (id, base) => useQuotationPdf(id, base, TOKEN, CURRENCY_DATA),
  },
];

describe('resolveDocumentCurrencyCode (ETP-5125)', () => {
  it('returns the ISO code NEO exposes for the currency foreignKey', () => {
    expect(resolveDocumentCurrencyCode({ 'currency$_identifier': DOC_CURRENCY })).toBe(DOC_CURRENCY);
  });

  it.each([
    ['the field is missing', {}],
    ['the field is empty', { 'currency$_identifier': '' }],
    ['the header is null', null],
    ['the header is undefined', undefined],
  ])('returns null when %s', (_desc, header) => {
    expect(resolveDocumentCurrencyCode(header)).toBeNull();
  });

  // No fallback to session.currencyCode on purpose: printing the organization's
  // currency on a foreign-currency document states the wrong one.
  it('never falls back to the raw internal currency id', () => {
    expect(resolveDocumentCurrencyCode({ currency: '100' })).toBeNull();
  });
});

describe.each(DOCUMENTS)('$name printable — document currency (ETP-5125)', (doc) => {
  let jsreportCalls;
  let originalFetch;

  beforeEach(() => {
    jsreportCalls = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function renderPdfFor(header) {
    installDocumentPdfFetchMock({
      headerPath: doc.headerPath,
      linesPath: doc.linesPath,
      header,
      lines: doc.lines,
      jsreportCalls,
      session: { currencyCode: ORG_CURRENCY },
    });
    return renderHook(() => doc.hook('rec-1', doc.apiBase));
  }

  async function renderAndGetData(header) {
    const { result } = renderPdfFor(header);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(jsreportCalls).toHaveLength(1);
    return jsreportCalls[0].data;
  }

  it('sends the document currency to jsreport, not the org currency', async () => {
    const data = await renderAndGetData({ ...doc.header, 'currency$_identifier': DOC_CURRENCY });
    expect(data.currencyCode).toBe(DOC_CURRENCY);
    expect(data.currencyCode).not.toBe(ORG_CURRENCY);
  });

  it('sends currencyCode: null when the header carries no currency', async () => {
    const data = await renderAndGetData(doc.header);
    expect(data.currencyCode).toBeNull();
  });

  it('carries a "currency" label so the header row is translated', async () => {
    const { result } = renderPdfFor({ ...doc.header, 'currency$_identifier': DOC_CURRENCY });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The mocked ui() echoes the key, proving which locale key is consumed.
    expect(jsreportCalls[0].data.labels.currency).toBe('invoicePdfCurrency');
  });
});
