// ETP-5308 — see artifacts/sales-order/custom/__tests__/OrderCreateInvoice.pdfLazyLoad.test.js
// for the full rationale. Same fix, applied to useShipmentPdf. Variable names here differ
// from the commercial-document trio (shipmentPdfUrl/shipmentPdfLoading/shipmentPdfError,
// not pdfUrl/pdfLoading/pdfError) since this file already used that naming pre-fix.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentActions.jsx'), 'utf8');

describe('GoodsShipmentActions — lazy PDF load on Send modal open (ETP-5308)', () => {
  it('calls useShipmentPdf with the recordId gated on showSend, not unconditionally', () => {
    assert.match(
      src,
      /useShipmentPdf\(showSend \? recordId : null, apiBaseUrl, token\)/,
    );
  });

  it('destructures an error flag from the hook alongside pdfUrl and loading', () => {
    assert.match(
      src,
      /const \{ pdfUrl: shipmentPdfUrl, loading: shipmentPdfLoading, error: shipmentPdfError \} = useShipmentPdf\(/,
    );
  });

  it('derives sendPdfLoading covering the one-render gap between showSend and the hook loading flag', () => {
    assert.match(
      src,
      /const sendPdfLoading = shipmentPdfLoading \|\| \(showSend && !shipmentPdfUrl && !shipmentPdfError\);/,
    );
  });

  it('passes sendPdfLoading — not the raw hook loading flag — to SendDocumentModal', () => {
    assert.match(src, /pdfBlobLoading=\{sendPdfLoading\}/);
    assert.doesNotMatch(src, /pdfBlobLoading=\{shipmentPdfLoading\}/);
  });
});
