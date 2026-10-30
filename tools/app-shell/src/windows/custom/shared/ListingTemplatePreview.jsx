import { useEffect, useMemo, useState } from 'react';
import { useUI } from '@/i18n';
import { NEO_BASE } from '@/lib/neoWebhookClient.js';
import { loadCompanyLogo } from './docTemplateConfig.js';
import { renderViaJsreport } from '@/components/contract-ui/ReportDrawer.jsx';
import PrintablePreviewFrame from './PrintablePreviewFrame.jsx';

const SAMPLE_ROWS = [
  { documentNo: 'F-2026/0001', date: '2026-01-15', partner: 'Cliente de ejemplo S.A.', status: 'CO', amount: 1815 },
  { documentNo: 'F-2026/0002', date: '2026-01-18', partner: 'Distribuciones Norte S.L.', status: 'CO', amount: 920.5 },
  { documentNo: 'F-2026/0003', date: '2026-01-22', partner: 'Comercial Sur S.A.', status: 'DR', amount: 4310 },
  { documentNo: 'F-2026/0004', date: '2026-02-03', partner: 'Servicios Levante S.L.', status: 'CO', amount: 275.9 },
  { documentNo: 'F-2026/0005', date: '2026-02-09', partner: 'Cliente de ejemplo S.A.', status: 'CO', amount: 1260 },
  { documentNo: 'F-2026/0006', date: '2026-02-14', partner: 'Talleres Centro S.L.', status: 'DR', amount: 745.3 },
];

/**
 * ETP-5988 — Preview of the list-print design being edited: a fictitious list rendered with the
 * settings as they are NOW through the same jsreport template as the print drawer. Always with a
 * configuration, never null: once saved, even an all-unset one is a configured list print (no
 * alternating rows), so the preview must show that, not the print of an organization with none. A render failure
 * is shown as text, never swallowed.
 *
 * @param {{settings: object}} props
 */
export default function ListingTemplatePreview({ settings }) {
  const ui = useUI();
  const [html, setHtml] = useState('');
  const [error, setError] = useState(null);

  const labels = useMemo(() => ({
    recordsLabel: ui('records'),
    filtersLabel: ui('filters'),
    totalLabel: ui('total'),
    generatedByLabel: ui('reportGeneratedBy'),
    yesLabel: ui('yes'),
    noLabel: ui('no'),
  }), [ui]);
  const columns = useMemo(() => [
    { key: 'documentNo', label: ui('documentTemplatesSampleDocNo') },
    { key: 'date', label: ui('documentTemplatesSampleDate'), type: 'date' },
    { key: 'partner', label: ui('documentTemplatesSamplePartner') },
    { key: 'status', label: ui('documentTemplatesSampleStatus') },
    { key: 'amount', label: ui('documentTemplatesSampleAmount'), type: 'amount' },
  ], [ui]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const wantsLogo = settings?.showLogo === 'on';
    (wantsLogo ? Promise.resolve(settings.logo || loadCompanyLogo(NEO_BASE)) : Promise.resolve(null))
      .then((logo) => renderViaJsreport('html', ui('documentTemplatesSampleListTitle'), columns, SAMPLE_ROWS, [], labels,
        settings, logo))
      .then((res) => res.text())
      .then((markup) => { if (!cancelled) setHtml(markup); })
      .catch((e) => { if (!cancelled) { setHtml(''); setError(e.message); } });
    return () => { cancelled = true; };
  }, [settings, ui, columns, labels]);

  if (error) {
    return (
      <p className="text-sm text-destructive" data-testid="ListingTemplatePreview__error">
        {ui('documentTemplatesPreviewFailed')}: {error}
      </p>
    );
  }
  return (
    <PrintablePreviewFrame
      html={html}
      title={ui('documentTemplatesPreviewTitle')}
      pageWidth={1123}
      pageHeight={794}
      testId="ListingTemplatePreview__frame"
      data-testid="PrintablePreviewFrame__abd9c6" />
  );
}
