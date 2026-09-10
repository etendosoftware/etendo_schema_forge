// Shared network mock for the commercial-document PDF hooks (useOrderPdf,
// usePurchaseOrderPdf, useInvoicePdf, useQuotationPdf).
//
// These hooks are only worth testing end-to-end: their data builders compose
// several fetches and hand the result to jsreport, and the interesting bugs
// (ETP-4941's product code, ETP-5125's document currency) live in that wiring,
// not in any single unit. So the mock intercepts ONLY the network boundary
// (`globalThis.fetch`) and lets the real
// build*Data -> renderDocumentPdf -> renderPdf chain run, capturing the exact
// payload jsreport would receive.
//
// Centralized here so a new document type does not copy a fourth near-identical
// `mockNetwork()` into a fourth test file. Usage:
//
//   const jsreportCalls = [];
//   installDocumentPdfFetchMock({
//     headerPath: '/sales-invoice/header/',
//     linesPath: '/sales-invoice/lines',
//     header, lines, jsreportCalls,
//   });
//   // ... renderHook(...) ...
//   expect(jsreportCalls[0].data.currencyCode).toBe('USD');
import { vi } from 'vitest';

/** A minimal `fetch` Response stand-in covering every accessor the hooks use. */
export function jsonResponse(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['%PDF-fake'], { type: 'application/pdf' })),
  });
}

/**
 * Replaces `globalThis.fetch` with a mock serving the header, the lines, an
 * empty session, and jsreport. Any other URL throws, so a mis-mocked fixture
 * fails loudly instead of silently rendering a half-empty document.
 *
 * The caller is responsible for restoring the original fetch (capture it in
 * `beforeEach`, restore it in `afterEach`).
 *
 * @param {object} params
 * @param {string} params.headerPath    URL fragment identifying the header request
 * @param {string} params.linesPath     URL fragment identifying the lines request
 * @param {object} params.header        header record NEO would return
 * @param {object[]} [params.lines]     line records NEO would return
 * @param {object[]} params.jsreportCalls  array the parsed jsreport bodies are pushed into
 * @param {object} [params.session]     session payload (defaults to `{}`)
 * @returns {import('vitest').Mock} the installed fetch mock
 */
export function installDocumentPdfFetchMock({
  headerPath,
  linesPath,
  header,
  lines = [],
  jsreportCalls,
  session = {},
}) {
  const fetchMock = vi.fn((url, opts = {}) => {
    const u = String(url);
    if (u.includes(headerPath)) return jsonResponse({ response: { data: [header] } });
    if (u.includes(linesPath)) return jsonResponse({ response: { data: lines } });
    if (u.endsWith('/session')) return jsonResponse({ response: { data: session } });
    if (u.includes('/jsreport/api/report')) {
      jsreportCalls.push(JSON.parse(opts.body));
      return jsonResponse({});
    }
    throw new Error(`Unexpected fetch in test: ${u}`);
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}
