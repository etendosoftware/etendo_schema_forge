import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { renderDocumentHtml } from './documentPdf.js';
import { buildInvoicePdfLabels } from './useInvoicePdf.js';
import { SAMPLE_INVOICE_DATA } from './documentTemplateSample.js';

/**
 * ETP-5988 — Preview of a printable variant: a fictitious sales invoice rendered with the chosen
 * variant, through the same renderer as a real document. `classic` renders with no configuration
 * at all, i.e. exactly the current document. The markup is shown in a sandboxed iframe (no
 * scripts), and a render failure is shown as text, never swallowed.
 *
 * @param {{variant: string}} props
 */
export default function DocumentTemplatePreview({ variant }) {
  const ui = useUI();
  const [html, setHtml] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const config = variant === 'classic' ? null : { variant };
    renderDocumentHtml({ ...SAMPLE_INVOICE_DATA, labels: buildInvoicePdfLabels(ui) }, config)
      .then((markup) => { if (!cancelled) setHtml(markup); })
      .catch((e) => { if (!cancelled) { setHtml(''); setError(e.message); } });
    return () => { cancelled = true; };
  }, [variant, ui]);

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="DocumentTemplatePreview__error">
        {ui('documentTemplatesPreviewFailed')}: {error}
      </p>
    );
  }
  return (
    <iframe
      title={ui('documentTemplatesPreviewTitle')}
      srcDoc={html}
      sandbox=""
      className="h-[720px] w-full rounded-md border bg-white"
      data-testid="DocumentTemplatePreview__frame"
    />
  );
}
