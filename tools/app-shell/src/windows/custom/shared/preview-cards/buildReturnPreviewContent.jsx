import PreviewActionButtons, { makeStaticPreviewTabs } from '../PreviewActionButtons.jsx';
import ReturnDocStatsPanel from './ReturnDocStatsPanel.jsx';

export function buildReturnPreviewContent({
  doc, openEmailModal, pdfBlob, handleDownload, modalRef,
  specs, partnerName, movementDate, token, apiBaseUrl, ui,
}) {
  const actionButtons = (
    <PreviewActionButtons
      onEmail={openEmailModal}
      onDownloadPdf={handleDownload}
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
