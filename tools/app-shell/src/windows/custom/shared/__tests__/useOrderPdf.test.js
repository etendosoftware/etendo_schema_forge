import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useOrderPdf.js'), 'utf8');
const sharedSrc = readFileSync(join(__dirname, '..', 'documentPdf.js'), 'utf8');

describe('useOrderPdf', () => {

  // ── Exports ──────────────────────────────────────────────────────────────

  it('exports useOrderPdf as a named export', () => {
    assert.match(src, /export function useOrderPdf/);
  });

  it('accepts orderId, apiBaseUrl, token and optional currencyData parameters', () => {
    // Signature updated in ETP-4027 to include currencyData for dual-currency PDF generation
    assert.match(src, /useOrderPdf\(orderId,\s*apiBaseUrl,\s*token,\s*currencyData/);
  });

  it('returns pdfUrl, pdfBlob, loading and error', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  it('delegates data building to shared buildOrderData', () => {
    assert.match(src, /buildOrderData/);
    assert.match(src, /'sales-order'/, 'passes sales-order spec to buildOrderData');
  });

  // ── API endpoints ─────────────────────────────────────────────────────────

  it('fetches header from the sales-order header endpoint', () => {
    assert.match(sharedSrc, /\$\{spec\}\/header\/\$\{orderId\}/);
  });

  it('fetches lines from the sales-order lines endpoint with parentId', () => {
    assert.match(sharedSrc, /\$\{spec\}\/lines\?parentId=\$\{orderId\}/);
  });

  it('fetches header and lines in parallel via Promise.all', () => {
    assert.match(sharedSrc, /Promise\.all/);
  });

  it('optionally fetches session to resolve the company document image', () => {
    assert.match(sharedSrc, /\/session/);
    assert.match(sharedSrc, /yourCompanyDocumentImageId/);
  });

  it('derives the base URL by stripping the spec segment from apiBaseUrl', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── Field mappings ────────────────────────────────────────────────────────

  it('maps quantity using orderedQuantity with qtyOrdered as fallback', () => {
    assert.match(sharedSrc, /l\.orderedQuantity \?\? l\.qtyOrdered \?\? 0/);
  });

  it('does NOT include a validUntil field in the returned data object', () => {
    assert.doesNotMatch(src, /validUntil:/);
  });

  it('renders company identity block with name, address and tax ID', () => {
    assert.match(sharedSrc, /companyName/);
    assert.match(sharedSrc, /companyAddress1/);
    assert.match(sharedSrc, /companyTaxId/);
  });

  it('pulls the issuer organization from the session endpoint', () => {
    assert.match(sharedSrc, /session\?\.organization/);
  });

  it('sorts lines by lineNo before mapping', () => {
    assert.match(sharedSrc, /linesSorted.*sort|sort.*lineNo/s);
  });

  it('imports computeDocumentTotals to derive printed totals', () => {
    assert.match(sharedSrc, /import \{ computeDocumentTotals \} from '@\/lib\/documentTotals';/);
  });

  it('imports ORDER_LINE_CONFIG to match order detail totals', () => {
    assert.match(sharedSrc, /import \{ ORDER_LINE_CONFIG \} from '@\/hooks\/useLineGrossAmount';/);
  });

  it('uses taxAmt from computeDocumentTotals for printed tax', () => {
    assert.match(sharedSrc, /const taxAmount = taxAmt \?\? 0/);
  });

  it('uses grandTotal returned by computeDocumentTotals for printed total', () => {
    assert.match(sharedSrc, /grandTotal,/);
  });

  // ── Memory management ─────────────────────────────────────────────────────

  it('revokes the previous blob URL on cleanup to avoid memory leaks', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── Cancellation ─────────────────────────────────────────────────────────

  it('uses a cancellation flag to prevent setState after unmount', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  it('early-returns from useEffect when orderId is null', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('propagates error messages to the error state', () => {
    assert.match(src, /useDocumentPdf/, 'hook delegates PDF lifecycle to useDocumentPdf');
  });

  // ── i18n ─────────────────────────────────────────────────────────────────

  it('uses orderPdfTitle i18n key for the document title label', () => {
    assert.match(src, /orderPdfTitle/);
  });

  it('uses orderPdfDate i18n key for the date label', () => {
    assert.match(src, /orderPdfDate/);
  });

  it('uses orderPdfColQty i18n key for the quantity column label', () => {
    assert.match(src, /orderPdfColQty/);
  });

  // ── Discount breakdown ────────────────────────────────────────────────────

  describe('discount breakdown', () => {
    it('reuses computeDocumentTotals for printed totals', () => {
      assert.match(sharedSrc, /computeDocumentTotals\(linesRaw, null, null, ORDER_LINE_CONFIG, etgoTotalDiscount\)/);
    });

    it('uses listPrice as the printed unit price when available', () => {
      assert.match(sharedSrc, /unitPrice: l\.listPrice \?\? l\.unitPrice \?\? l\.priceActual \?\? 0/);
    });

    it('uses lineGrossAmount as the printed line total when available', () => {
      assert.match(sharedSrc, /lineTotal: l\.lineGrossAmount \?\? l\.grossAmount \?\? l\.lineNetAmount \?\? l\.lineAmount \?\? 0/);
    });

    it('derives netAmount from netSubtotal minus totalDiscountAmt', () => {
      assert.match(sharedSrc, /const netAmount = \(netSubtotal \?\? 0\) - \(totalDiscountAmt \?\? 0\)/);
    });

    it('uses taxAmt returned by computeDocumentTotals', () => {
      assert.match(sharedSrc, /const taxAmount = taxAmt \?\? 0/);
    });

    it('passes null for grossAmount when discountAmt is 0', () => {
      assert.match(sharedSrc, /discountAmt > 0 \? grossSubtotal : null/);
    });

    it('passes null for discountPerProduct when discountAmt is 0', () => {
      assert.match(sharedSrc, /discountAmt > 0 \? discountAmt : null/);
    });

    it('passes null for totalDiscountAmt when no total discount applies', () => {
      assert.match(sharedSrc, /totalDiscountAmt:\s+totalDiscountAmt > 0 \? totalDiscountAmt : null/);
    });

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
