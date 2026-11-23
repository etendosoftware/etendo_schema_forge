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
 * shows the files of every record merged into ONE table, sorted by upload date then name.
 * A record with no files contributes nothing; the empty state shows only when the merged
 * list is empty. Each record is still read through the shared `useAttachments` hook (one
 * call per record, see `CollectAttachments`), and per-file download works for any of them
 * (the file endpoint is keyed on the attachment id alone). "Download all (ZIP)" is per
 * record on the server, so it is offered only while every listed file belongs to a single
 * record; with files from several records it is hidden. With one record the output is
 * identical to the single-`recordId` form.
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
      <CollectAttachments
        ids={ids}
        hookArgs={{ tableName, token, apiBaseUrl }}
        data-testid="CollectAttachments__ec5f20">
        {(results) => <MergedAttachmentsTable results={results} data-testid="MergedAttachmentsTable__ec5f20" />}
      </CollectAttachments>
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

/**
 * Calls `useAttachments` once per id, one component level per id, so the number of hook
 * calls per component never changes, and hands every record's result to `children`.
 */
function CollectAttachments({ ids, hookArgs, acc = [], children }) {
  const [currentId, ...rest] = ids;
  const result = useAttachments({ ...hookArgs, recordId: currentId, isActive: Boolean(currentId) });
  const collected = [...acc, { recordId: currentId, ...result }];
  if (rest.length === 0) {
    return children(collected);
  }
  return (
    <CollectAttachments
      ids={rest}
      hookArgs={hookArgs}
      acc={collected}
      data-testid="CollectAttachments__ec5f20">
      {children}
    </CollectAttachments>
  );
}

function uploadTime(item) {
  const raw = item.uploadedAt || item.createdAt || item.creationDate;
  const time = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Upload date ascending, then name; files without a date go last. */
function compareAttachments(a, b) {
  const byTime = uploadTime(a) - uploadTime(b);
  if (byTime !== 0 && !Number.isNaN(byTime)) {
    return byTime;
  }
  return String(a.name || a.fileName || '').localeCompare(String(b.name || b.fileName || ''));
}

/** One read-only table with the files of every record. */
function MergedAttachmentsTable({ results }) {
  const [first] = results;
  const items = results.length === 1
    ? first.items
    : results.flatMap((r) => r.items).sort(compareAttachments);
  const owners = results.filter((r) => r.items.length > 0);
  const downloadAll = owners.length === 1 ? owners[0].downloadAll : undefined;

  return (
    <AttachmentsTable
      items={items}
      loading={results.some((r) => r.loading)}
      uploadingFiles={first.uploadingFiles}
      onDownload={first.download}
      onDownloadAll={items.length > 0 ? downloadAll : undefined}
      formatBytes={first.formatBytes}
      data-testid="AttachmentsTable__sif" />
  );
}
