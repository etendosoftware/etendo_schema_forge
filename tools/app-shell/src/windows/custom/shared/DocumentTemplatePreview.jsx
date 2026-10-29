import { useEffect, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { NEO_BASE } from '@/lib/neoWebhookClient.js';
import { buildCompanyFields, fetchImageDataUrl, fetchOptionalJson, renderDocumentHtml } from './documentPdf.js';
import { buildInvoicePdfLabels } from './useInvoicePdf.js';
import { SAMPLE_INVOICE_DATA } from './documentTemplateSample.js';

// The printable is a fixed A4 page (794 px wide, `@page A4`); the preview scales it to the room it has.
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

/** The sample invoice with the user's own company (name, tax id, address, logo) when the session has it. */
async function loadSampleData() {
  const session = await fetchOptionalJson(`${NEO_BASE}/session`);
  if (!session) return SAMPLE_INVOICE_DATA;
  const logo = await fetchImageDataUrl(session.yourCompanyDocumentImageId, NEO_BASE);
  const company = buildCompanyFields(session, {}, logo, null);
  return {
    ...SAMPLE_INVOICE_DATA,
    ...company,
    // The sample customer's address stays: buildCompanyFields derives it from a real document.
    hasCustomerAddress: SAMPLE_INVOICE_DATA.hasCustomerAddress,
    customerAddressLines: SAMPLE_INVOICE_DATA.customerAddressLines,
  };
}

/**
 * ETP-5988 — Preview of a printable variant: a fictitious sales invoice, with the company's own
 * header and logo, rendered with the chosen variant through the same renderer as a real document.
 * `classic` renders with no configuration at all, i.e. exactly the current document. The page is
 * scaled to fit the available width (no scrollbars at low resolutions); the markup is shown in a
 * sandboxed iframe (no scripts), and a render failure is shown as text, never swallowed.
 *
 * @param {{variant: string}} props
 */
export default function DocumentTemplatePreview({ variant }) {
  const ui = useUI();
  const [html, setHtml] = useState('');
  const [error, setError] = useState(null);
  const [sample, setSample] = useState(null);
  const [scale, setScale] = useState(1);
  const boxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadSampleData().then((data) => { if (!cancelled) setSample(data); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sample) return undefined;
    let cancelled = false;
    setError(null);
    const config = variant === 'classic' ? null : { variant };
    renderDocumentHtml({ ...sample, labels: buildInvoicePdfLabels(ui) }, config)
      .then((markup) => { if (!cancelled) setHtml(markup); })
      .catch((e) => { if (!cancelled) { setHtml(''); setError(e.message); } });
    return () => { cancelled = true; };
  }, [variant, ui, sample]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const fit = () => setScale(Math.min(1, box.clientWidth / PAGE_WIDTH) || 1);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="DocumentTemplatePreview__error">
        {ui('documentTemplatesPreviewFailed')}: {error}
      </p>
    );
  }
  return (
    <div ref={boxRef} className="w-full overflow-hidden rounded-md border bg-white" style={{ height: PAGE_HEIGHT * scale }}>
      <iframe
        title={ui('documentTemplatesPreviewTitle')}
        srcDoc={html}
        sandbox=""
        scrolling="no"
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        data-testid="DocumentTemplatePreview__frame"
      />
    </div>
  );
}
