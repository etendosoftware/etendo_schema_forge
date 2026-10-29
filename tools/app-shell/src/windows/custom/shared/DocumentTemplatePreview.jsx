import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { NEO_BASE } from '@/lib/neoWebhookClient.js';
import { buildCompanyFields, fetchImageDataUrl, fetchOptionalJson, renderDocumentHtml } from './documentPdf.js';
import { buildInvoicePdfLabels } from './useInvoicePdf.js';
import { SAMPLE_INVOICE_DATA } from './documentTemplateSample.js';
import PrintablePreviewFrame from './PrintablePreviewFrame.jsx';
import { isCurrentDesign } from './printableStyle.js';

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
 * ETP-5988 — Preview of the document design being edited: a fictitious sales invoice, with the
 * company's own header and logo, rendered with the settings as they are NOW (saved or not) through
 * the same renderer as a real document. A render failure is shown as text, never swallowed.
 *
 * @param {{settings: object}} props
 */
export default function DocumentTemplatePreview({ settings }) {
  const ui = useUI();
  const [html, setHtml] = useState('');
  const [error, setError] = useState(null);
  const [sample, setSample] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadSampleData().then((data) => { if (!cancelled) setSample(data); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sample) return undefined;
    let cancelled = false;
    setError(null);
    renderDocumentHtml({ ...sample, labels: buildInvoicePdfLabels(ui) }, isCurrentDesign(settings) ? null : settings)
      .then((markup) => { if (!cancelled) setHtml(markup); })
      .catch((e) => { if (!cancelled) { setHtml(''); setError(e.message); } });
    return () => { cancelled = true; };
  }, [settings, ui, sample]);

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="DocumentTemplatePreview__error">
        {ui('documentTemplatesPreviewFailed')}: {error}
      </p>
    );
  }
  return (
    <PrintablePreviewFrame
      html={html}
      title={ui('documentTemplatesPreviewTitle')}
      pageWidth={794}
      pageHeight={1123}
      testId="DocumentTemplatePreview__frame"
    />
  );
}
