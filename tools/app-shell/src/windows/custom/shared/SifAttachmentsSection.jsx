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
 * ETP-6284 — an invoice can own SEVERAL sub-records of the same table: an SII purchase
 * invoice with DUA import lines is sent as one F1 plus one F5 per DUA, each an
 * `aeatsii_facturas` row with its own request/response XML. The backend then also stamps
 * the full list (`aeatsiiFacturaIds`, oldest first); pass it as `recordIds` and the section
 * lists every record's files, each group labelled "Record N of M". The sub-record row carries
 * nothing that tells F1 from F5 (that lives only inside the XML), so the label is ordinal.
 * With a single record the output is identical to the single-`recordId` form.
 *
 * Renders nothing when no sub-record id has been resolved yet (e.g. the invoice has
 * never been sent to that fiscal target), keeping every panel's layout stable — `AttachmentsTable`
 * would otherwise still show its own empty state, which reads as "no files" a bit too eagerly
 * before the invoice has even been submitted.
 *
 * @param {object} props
 * @param {string} props.tableName     - AD_Table.tablename of the sub-record (e.g. "aeatsii_facturas").
 * @param {string} [props.recordId]    - the sub-record's id, as stamped on the invoice header response.
 * @param {string[]} [props.recordIds] - every sub-record id of the invoice, oldest first; wins over
 *                                       `recordId` when it holds at least one id.
 * @param {string} props.token         - Bearer token for the API.
 * @param {string} props.apiBaseUrl    - Base URL for the NEO Headless API (same one SifTab already receives).
 */
export default function SifAttachmentsSection({ tableName, recordId, recordIds, token, apiBaseUrl }) {
  const ui = useUI();
  const ids = resolveRecordIds(recordIds, recordId);

  if (ids.length === 0) {
    return null;
  }

  return (
    <div className="col-span-2 pt-2 mt-1 border-t border-border/40 space-y-2">
      <span className="text-xs font-semibold text-foreground">{ui('attachments')}</span>
      {ids.length === 1 ? (
        <SubRecordAttachments
          tableName={tableName}
          recordId={ids[0]}
          token={token}
          apiBaseUrl={apiBaseUrl}
          testId="AttachmentsTable__sif" />
      ) : (
        ids.map((id, index) => (
          <div key={id} className="space-y-1" data-testid={`SifAttachmentsSection__record-${index + 1}`}>
            <span className="text-xs font-medium text-muted-foreground">
              {ui('sifAttachmentsRecordLabel', { index: index + 1, total: ids.length })}
            </span>
            <SubRecordAttachments
              tableName={tableName}
              recordId={id}
              token={token}
              apiBaseUrl={apiBaseUrl}
              testId={`AttachmentsTable__sif-${index + 1}`} />
          </div>
        ))
      )}
    </div>
  );
}

/**
 * The ids to list: `recordIds` (deduplicated, blanks dropped) when it holds any, else the
 * single `recordId`, else none.
 */
function resolveRecordIds(recordIds, recordId) {
  if (Array.isArray(recordIds)) {
    const ids = [...new Set(recordIds.filter((id) => typeof id === 'string' && id))];
    if (ids.length > 0) {
      return ids;
    }
  }
  return recordId ? [recordId] : [];
}

/** Read-only attachments table of one sub-record (one `useAttachments` per record). */
function SubRecordAttachments({ tableName, recordId, token, apiBaseUrl, testId }) {
  const { items, loading, uploadingFiles, download, downloadAll, formatBytes } = useAttachments({
    tableName,
    recordId,
    token,
    apiBaseUrl,
    isActive: Boolean(recordId),
  });

  return (
    <AttachmentsTable
      items={items}
      loading={loading}
      uploadingFiles={uploadingFiles}
      onDownload={download}
      onDownloadAll={items.length > 0 ? downloadAll : undefined}
      formatBytes={formatBytes}
      data-testid={testId} />
  );
}
