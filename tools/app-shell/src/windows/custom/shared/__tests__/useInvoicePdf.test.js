import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerResolveProductCodeHookTests } from './testUtils/resolveProductCodeAssertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useInvoicePdf.js'), 'utf8');
const sharedSrc = readFileSync(join(__dirname, '..', 'documentPdf.js'), 'utf8');
const pdfUtilsSrc = readFileSync(join(__dirname, '..', 'pdfUtils.js'), 'utf8');

describe('useInvoicePdf', () => {

  // ── Exports ──────────────────────────────────────────────────────────────

  it('exports useInvoicePdf as a named export', () => {
    assert.match(src, /export function useInvoicePdf/);
  });

  it('accepts invoiceId, apiBaseUrl, token and optional cacheConfig parameters', () => {
    // Signature updated in ETP-4315 to include cacheConfig for jsreport-regeneration-skip caching
    assert.match(src, /useInvoicePdf\(invoiceId,\s*apiBaseUrl,\s*token,\s*cacheConfig\s*=\s*null\)/);
  });

  it('returns pdfUrl, pdfBlob, loading and error', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── API endpoints ─────────────────────────────────────────────────────────

  it('fetches header from the sales-invoice header endpoint', () => {
    assert.match(src, /sales-invoice\/header\/\$\{invoiceId\}/);
  });

  it('fetches lines from the sales-invoice lines endpoint with parentId', () => {
    assert.match(src, /sales-invoice\/lines\?parentId=\$\{invoiceId\}/);
  });

  it('fetches header and lines in parallel via Promise.all', () => {
    assert.match(src, /Promise\.all/);
  });

  it('optionally fetches session defaults to resolve the company document image', () => {
    assert.match(src, /\/session/);
    assert.match(src, /fetchDocumentAssets/, 'delegates logo and address fetch to shared fetchDocumentAssets');
    assert.match(sharedSrc, /yourCompanyDocumentImageId/);
  });

  it('derives the base URL by stripping the spec segment from apiBaseUrl', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  it('sends Bearer token in all API requests', () => {
    // fetch helpers live in pdfUtils.js (shared), re-exported via documentPdf.js
    // ETP-5022 — neither the header nor the request is assembled here any more: the module
    // goes through the shared `apiFetch`, which supplies Authorization AND Accept-Language.
    // Asserting that is the stronger check, and two repo-root guardrails fail the build if
    // a call site regresses — test/auth-header-policy.test.js on a hand-rolled header,
    // test/no-raw-fetch.test.js on a bare fetch that bypasses the helper entirely.
    assert.match(pdfUtilsSrc, /\bapiFetch\s*\(/);
    assert.match(pdfUtilsSrc, /import \{ apiFetch \}/);
  });

  // ── PDF rendering ─────────────────────────────────────────────────────────

  it('renders the PDF via jsreport at /jsreport/api/report', () => {
    // renderPdf lives in pdfUtils.js (shared), called via documentPdf.renderDocumentPdf
    assert.match(pdfUtilsSrc, /\/jsreport\/api\/report/);
  });

  it('uses the handlebars engine', () => {
    assert.match(pdfUtilsSrc, /engine.*handlebars|handlebars.*engine/);
  });

  it('uses the chrome-pdf recipe for PDF generation', () => {
    assert.match(pdfUtilsSrc, /chrome-pdf/);
  });

  it('creates a blob URL from the jsreport response', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  it('embeds the company logo in the rendered template when available', () => {
    assert.match(src, /companyLogoDataUrl/);
    assert.match(sharedSrc, /inv-logo-img/);
  });

  it('renders the company identity block with name, address and tax ID', () => {
    assert.match(src, /buildCompanyFields/, 'delegates company fields to shared buildCompanyFields');
    assert.match(sharedSrc, /companyName/);
    assert.match(sharedSrc, /companyAddress1/);
    assert.match(sharedSrc, /companyTaxId/);
  });

  it('pulls the issuer organization from the session endpoint', () => {
    assert.match(sharedSrc, /session\?\.organization/);
  });

  it('fetches the full partner location from the contacts locationAddress endpoint', () => {
    // fetchLocationAddress lives in pdfUtils.js (shared), re-exported via documentPdf.js
    assert.match(pdfUtilsSrc, /contacts\/locationAddress\/\$\{locationId\}/);
  });

  it('builds multi-line customer address output for the PDF', () => {
    assert.match(sharedSrc, /customerAddressLines/);
    assert.match(sharedSrc, /inv-address-lines/);
  });

  // ── Memory management ─────────────────────────────────────────────────────

  it('revokes the previous blob URL on cleanup to avoid memory leaks', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── Cancellation ─────────────────────────────────────────────────────────

  it('uses a cancellation flag to prevent setState after unmount', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('propagates error messages to the error state', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── fetchAll — inline logic tests ─────────────────────────────────────────

  describe('fetchAll (inline replica)', () => {
    async function fetchAll(url, token) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
      });
      if (!res.ok) return [];
      const d = await res.json();
      return d?.response?.data ?? (Array.isArray(d) ? d : []);
    }

    it('returns empty array when the response is not ok', async () => {
      const saved = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 500 });
      const result = await fetchAll('/url', 'tok');
      assert.deepEqual(result, []);
      globalThis.fetch = saved;
    });

    it('extracts response.data from the NEO Headless envelope', async () => {
      const saved = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'L1' }, { id: 'L2' }] } }),
      });
      const result = await fetchAll('/url', 'tok');
      assert.equal(result.length, 2);
      assert.equal(result[0].id, 'L1');
      globalThis.fetch = saved;
    });

    it('falls back to a raw array response when the envelope is absent', async () => {
      const saved = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => [{ id: 'X' }],
      });
      const result = await fetchAll('/url', 'tok');
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'X');
      globalThis.fetch = saved;
    });
  });

  // ── Discount breakdown ────────────────────────────────────────────────────

  describe('discount breakdown', () => {
    it('computes grossAmount from raw lines using getGrossLine helper', () => {
      assert.match(src, /getGrossLine/);
      assert.match(src, /computeDiscountBreakdown/, 'delegates reduce logic to computeDiscountBreakdown');
    });

    it('uses listPrice when available to compute the gross line amount', () => {
      assert.match(src, /l\.listPrice != null/);
    });

    it('falls back to lineNetAmount derivation when listPrice is null', () => {
      assert.match(src, /lineNet \/ \(1 - disc \/ 100\)/);
    });

    it('computes discountPerProduct as Math.max(0, grossAmount - productNetAmount)', () => {
      assert.match(src, /computeDiscountBreakdown/, 'delegates to computeDiscountBreakdown');
      assert.match(sharedSrc, /Math\.max\(0, grossAmount - productNetAmount\)/);
    });

    it('reads etgoTotalDiscount from header', () => {
      assert.match(src, /header\.etgoTotalDiscount/);
    });

    it('computes totalDiscountAmt only when etgoTotalDiscount > 0', () => {
      assert.match(src, /computeDiscountBreakdown/, 'delegates to computeDiscountBreakdown');
      assert.match(sharedSrc, /etgoTotalDiscount > 0 \? productNetAmount \* etgoTotalDiscount/);
    });

    it('passes null for grossAmount when discountPerProduct is 0', () => {
      assert.match(src, /discountPerProduct > 0 \? grossAmount : null/);
    });

    it('passes null for totalDiscountAmt when no total discount applies', () => {
      assert.match(src, /totalDiscountAmt > 0 \? totalDiscountAmt : null/);
    });

    it('uses invoicedQuantity (not orderedQuantity) inside getGrossLine', () => {
      assert.match(src, /l\.invoicedQuantity \?\? l\.qtyInvoiced/);
      assert.doesNotMatch(src, /l\.orderedQuantity/);
    });

    registerResolveProductCodeHookTests(assert, src, sharedSrc);

    it('includes subtotalWithoutDiscount label key in labels object', () => {
      assert.match(src, /buildDocumentPdfLabels/, 'hook delegates base labels to buildDocumentPdfLabels');
      assert.match(sharedSrc, /subtotalWithoutDiscount/);
    });

    it('includes discountPerProduct label key in labels object', () => {
      assert.match(src, /buildDocumentPdfLabels/, 'hook delegates base labels to buildDocumentPdfLabels');
      assert.match(sharedSrc, /discountPerProduct/);
    });

    it('includes totalDiscount label key in labels object', () => {
      assert.match(src, /buildDocumentPdfLabels/, 'hook delegates base labels to buildDocumentPdfLabels');
      assert.match(sharedSrc, /totalDiscount/);
    });
  });
});
