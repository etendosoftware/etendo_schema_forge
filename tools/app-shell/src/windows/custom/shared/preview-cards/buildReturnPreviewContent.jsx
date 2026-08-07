import PreviewActionButtons, { makeStaticPreviewTabs } from '../PreviewActionButtons.jsx';
import ReturnDocStatsPanel from './ReturnDocStatsPanel.jsx';

export function buildReturnPreviewContent({
  doc, pdfBlob, handleDownload, modalRef,
  specs, partnerName, movementDate, token, apiBaseUrl, ui,
  // ETP-4789 — optional: callers gate Download PDF by document status. Omitted
  // callers keep existing behavior (always downloadable).
  canDownload = true,
  // ETP-4718 — optional: callers that wire a send-email modal pass onEmail here so
  // PreviewActionButtons renders the "Enviar" button. Omitted by callers that don't
  // wire send yet, so existing behavior (no send button) stays unchanged for them.
  onEmail,
}) {
  const actionButtons = (
    <PreviewActionButtons
      onEmail={onEmail}
      onDownloadPdf={canDownload ? handleDownload : undefined}
      hasPdf={!!pdfBlob}
      triggerEdit={() => modalRef.current?.triggerEdit?.()}
      sendLabel={ui('invoicePreviewSend')}
      downloadLabel={ui('invoicePreviewDownloadPdf')}
      editLabel={ui('invoicePreviewEdit')}
      data-testid="PreviewActionButtons__634d79" />
  );

  const tabs = [
    {
      key: 'general',
      label: ui('invoicePreviewGeneral'),
      content: (
        <ReturnDocStatsPanel
          doc={doc}
          partnerName={partnerName}
          movementDate={movementDate}
          token={token}
          apiBaseUrl={apiBaseUrl}
          ui={ui}
          specs={specs}
          data-testid="ReturnDocStatsPanel__634d79" />
      ),
    },
    ...makeStaticPreviewTabs(ui),
  ];

  return { actionButtons, tabs };
}
