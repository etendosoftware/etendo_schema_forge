import { useUI } from '@/i18n';
import { useAttachments } from '@/components/attachments/useAttachments';
import AttachmentsTable from '@/components/attachments/AttachmentsTable';

/**
 * ETP-4888 — "Adjuntos" section reused inside the SIF tab's SII, TBAI, and Verifactu
 * panels. SII and TBAI hang the outbound/response XML off a fiscal sub-record (not off
 * C_Invoice itself), and Verifactu's AEAT-response leg does the same — the generic
 * Attachments tab (tableName/recordId keyed on the invoice header) can never reach them.
 * This component points the same generic attachments endpoints at the sub-record id the
 * backend NeoHandler stamps onto the header response (`aeatsiiFacturaId`,
 * `tbaiSyncInvoiceId`, `invoiceVerifactuId`).
 *
 * Read-only by design (view/download only, no upload/delete): these files are the actual
 * signed XML sent to AEAT and the government's own response — not ad-hoc business
 * attachments — so no destructive actions are offered here.
 *
 * Renders nothing when the sub-record id has not been resolved yet (e.g. the invoice has
 * never been sent to that fiscal target), keeping every panel's layout stable — `AttachmentsTable`
 * would otherwise still show its own empty state, which reads as "no files" a bit too eagerly
 * before the invoice has even been submitted.
 *
 * @param {object} props
 * @param {string} props.tableName  - AD_Table.tablename of the sub-record (e.g. "aeatsii_facturas").
 * @param {string} [props.recordId] - the sub-record's id, as stamped on the invoice header response.
 * @param {string} props.token      - Bearer token for the API.
 * @param {string} props.apiBaseUrl - Base URL for the NEO Headless API (same one SifTab already receives).
 */
export default function SifAttachmentsSection({ tableName, recordId, token, apiBaseUrl }) {
  const ui = useUI();

  const { items, loading, uploadingFiles, download, downloadAll, formatBytes } = useAttachments({
    tableName,
    recordId,
    apiBaseUrl,
    isActive: Boolean(recordId),
  });

  if (!recordId) {
    return null;
  }

  return (
    <div className="col-span-2 pt-2 mt-1 border-t border-border/40 space-y-2">
      <span className="text-xs font-semibold text-foreground">{ui('attachments')}</span>
      <AttachmentsTable
        items={items}
        loading={loading}
        uploadingFiles={uploadingFiles}
        onDownload={download}
        onDownloadAll={items.length > 0 ? downloadAll : undefined}
        formatBytes={formatBytes}
        data-testid="AttachmentsTable__sif" />
    </div>
  );
}
