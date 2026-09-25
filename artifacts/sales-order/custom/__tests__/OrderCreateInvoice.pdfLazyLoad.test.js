// ETP-5308 — opening the edit form of a Draft Sales Order fired
// POST /jsreport/api/report on mount, because useOrderPdf was called
// unconditionally with `recordId` even while the Send modal was closed.
// The hook is now called lazily: `showSend ? recordId : null`, so no PDF is
// requested until the user actually opens the Send modal — see
// tools/app-shell/src/windows/custom/shared/__tests__/useOrderPdf.pdfLazyLoad.vitest.jsx
// for the behavioral proof that a null id produces no fetch.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderCreateInvoice.jsx'), 'utf8');

describe('OrderCreateInvoice — lazy PDF load on Send modal open (ETP-5308)', () => {
  it('calls useOrderPdf with the recordId gated on showSend, not unconditionally', () => {
    assert.match(
      src,
      /useOrderPdf\(showSend \? recordId : null, apiBaseUrl, token\)/,
    );
  });

  it('destructures an error flag from the hook alongside pdfUrl and loading', () => {
    assert.match(
      src,
      /const \{ pdfUrl, loading: pdfLoading, error: pdfError \} = useOrderPdf\(/,
    );
  });

  it('derives sendPdfLoading covering the one-render gap between showSend and the hook loading flag', () => {
    assert.match(
      src,
      /const sendPdfLoading = pdfLoading \|\| \(showSend && !pdfUrl && !pdfError\);/,
    );
  });

  it('passes sendPdfLoading — not the raw hook loading flag — to SendDocumentModal', () => {
    assert.match(src, /pdfBlobLoading=\{sendPdfLoading\}/);
    assert.doesNotMatch(src, /pdfBlobLoading=\{pdfLoading\}/);
  });
});
