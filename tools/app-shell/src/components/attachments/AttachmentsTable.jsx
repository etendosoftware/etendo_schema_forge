import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { DataTable } from '@/components/contract-ui/DataTable.jsx';
import {
  ROW_ACTION_BUTTON_NEUTRAL,
  ROW_ACTION_BUTTON_DESTRUCTIVE,
} from '@/components/contract-ui/rowVisuals.js';
import { IconicTrashIcon } from '@/components/ui/custom-icons';
import { useClientSort } from '@/hooks/useClientSort';
import { useLocaleSwitch, useUI } from '@/i18n';

const UPLOADING_ID_PREFIX = 'uploading:';

const DATE_PARTS = new Set(['weekday', 'day', 'month']);

/**
 * Figma date of an attachment row: abbreviated weekday (capitalized), day and abbreviated
 * month, no abbreviation dots — "Jue 30 abr" (es_ES), "Thu Apr 30" (en_US). When the date
 * is not in the current year (local time) the year is appended at the end after a single
 * space: "Jue 30 abr 2024", "Thu Apr 30 2024".
 * The parts keep the locale's own order (formatToParts); the locale's separators are
 * replaced by single spaces, which drops the ", " after the weekday.
 *
 * `value` is a UTC instant (NeoAttachmentsHelper#formatDate), so `new Date(value)` and the
 * viewer's local time are correct here — this is NOT a date-only value, and
 * `parseCalendarDate` would read the UTC calendar day instead.
 *
 * @param {string|Date|null|undefined} value ISO-8601 instant
 * @param {string} locale UI locale, e.g. "es_ES"
 * @param {Date} [now] reference "today" for the current-year check (injectable for tests)
 * @returns {string} the formatted date, or "—" when missing or invalid
 */
export function formatAttachmentDate(value, locale, now = new Date()) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const tag = String(locale || 'es_ES').replace('_', '-');
  const parts = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(date)
    .filter((part) => DATE_PARTS.has(part.type))
    .map((part) => {
      const text = part.value.replaceAll('.', '');
      return part.type === 'weekday'
        ? text.charAt(0).toLocaleUpperCase(tag) + text.slice(1)
        : text;
    });
  if (date.getFullYear() !== now.getFullYear()) parts.push(String(date.getFullYear()));
  return parts.join(' ');
}

/**
 * Flattens one attachment into the row shape the grid reads. The backend has used a few
 * names for the same facts over time, so the fallbacks live here, once, and every column
 * (and the client-side sort) reads the same normalized keys.
 *
 * `uploadedAt` / `updatedAt` are UTC instants (NeoAttachmentsHelper#formatDate), not
 * date-only values; they stay raw ISO strings here (sorting) and are formatted at render
 * time by `formatAttachmentDate`.
 */
function toRow(item) {
  return {
    ...item,
    name: item.name || item.fileName || item.id,
    size: item.size ?? item.fileSize ?? null,
    uploadedAt: item.uploadedAt || item.createdAt || item.creationDate || null,
    updatedAt: item.updatedAt ?? item.modifiedAt ?? item.updateDate ?? null,
    uploadedByName: item.uploadedBy?.name
      ?? item.createdBy?.name
      ?? item['createdBy$_identifier']
      ?? null,
  };
}

const isPersistedRow = (row) => !row.uploading;

/**
 * Hover actions of one attachment row — Figma "Fila" sm Round Tertiary buttons, the same
 * class strings every list's quick actions use (rowVisuals.js). Rendered inside DataTable's
 * shared quick-actions cell, so the sticky positioning and the fade behind it come for free.
 */
function AttachmentRowActions({ row, onDownload, onDelete }) {
  const ui = useUI();
  if (row.uploading) return null;
  const stop = (handler) => (event) => {
    event.stopPropagation();
    handler(row.item);
  };
  return (
    <div
      className="absolute right-0 inset-y-0 z-10 flex h-full flex-row items-center justify-center gap-0.5 px-3 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
      data-testid={`attachment-actions-${row.id}`}>
      {onDownload && (
        <button
          type="button"
          onClick={stop(onDownload)}
          className={ROW_ACTION_BUTTON_NEUTRAL}
          aria-label={ui('attachmentsDownload')}
          title={ui('attachmentsDownload')}
          data-testid={`attachment-download-${row.id}`}>
          <Download className="h-5 w-5" aria-hidden="true" data-testid="Download__e868a0" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={stop(onDelete)}
          className={ROW_ACTION_BUTTON_DESTRUCTIVE}
          aria-label={ui('delete')}
          title={ui('delete')}
          data-testid={`attachment-delete-${row.id}`}>
          <IconicTrashIcon className="h-5 w-5" aria-hidden="true" data-testid="IconicTrashIcon__e868a0" />
        </button>
      )}
    </div>
  );
}

/**
 * Keeps DataTable's internal selection in step with the caller-owned `selectedIds`.
 *
 * DataTable owns its checkbox state and only reports changes up (`onSelectionChange`); it
 * can be told to clear everything (`clearSelectionTrigger`) or to drop some ids
 * (`deselectTrigger` + `deselectRowIds`). The caller here owns the selection, so the two
 * cases where it changes it on its own are pushed down:
 *   - it emptied the Set (record navigation, the bar's close, a bulk delete) → clear;
 *   - a selected row left the list (single delete) → drop that id on both sides, or
 *     DataTable's "all selected" count would include a row no longer on screen.
 */
function useSelectionSync({ selectable, selectedIds, items, loading, onSelectionChange }) {
  const [clearTrigger, setClearTrigger] = useState(0);
  const [deselect, setDeselect] = useState({ trigger: 0, ids: [] });
  const selectionSize = selectedIds?.size ?? 0;

  useEffect(() => {
    if (selectable && selectionSize === 0) setClearTrigger((n) => n + 1);
  }, [selectable, selectionSize]);

  useEffect(() => {
    if (!selectable || loading || selectionSize === 0) return;
    const live = new Set((items ?? []).map((it) => it.id));
    const stale = [...selectedIds].filter((id) => !live.has(id));
    if (stale.length === 0) return;
    setDeselect((prev) => ({ trigger: prev.trigger + 1, ids: stale }));
    onSelectionChange?.([...selectedIds].filter((id) => live.has(id)));
  }, [selectable, loading, items, selectedIds, selectionSize, onSelectionChange]);

  return { clearTrigger, deselect };
}

/**
 * The attachments grid of the current record, rendered through the generic `DataTable`
 * (ETP-5526) so it shares every list's row visuals: the lift hover (Shadows/lg + top
 * separator), the #F5F7F9 checked row, the 32px row-action buttons and the fade behind
 * them. Attachments are not a NEO entity (C_File has no AD tab), so `ListView` does not
 * apply: the rows come from `useAttachments` and are sorted client-side.
 *
 * Props:
 *   items          - Attachment objects.
 *   loading        - True while the list is being fetched.
 *   uploadingFiles - Map<string, { name, size }> with optimistic upload rows (shown first,
 *                    with a spinner, a disabled checkbox when selection is on — DataTable
 *                    renders it with `isRowSelectable` false — and no actions).
 *   onDownload     - (attachment) => void. Omit to hide the per-row Download button.
 *   onDelete       - (attachment) => void. Omit to hide the per-row Delete button (this is
 *                    how AttachmentsTab applies its `readOnly` rule).
 *   onDownloadAll  - () => void. Renders a "Download all (ZIP)" link above the grid.
 *                    Still used by SifAttachmentsSection, which has no selection and no
 *                    other way to pull its fiscal XML bundle; the Adjuntos tab stopped
 *                    passing it when the selection bar replaced it (ETP-5526).
 *   formatBytes    - (bytes) => string
 *
 * ── Selection is an opt-in, caller-owned capability (ETP-5526) ─────────────────
 *   selectedIds        - Set<string> | undefined. Supplying it turns the checkbox column
 *                        ON. Leaving it out means no column and nothing to toggle —
 *                        SifAttachmentsSection (read-only by design) relies on that.
 *   onSelectionChange  - (ids: string[]) => void. The full new selection, every time it
 *                        changes (row checkbox, header checkbox, or a selected row that
 *                        left the list).
 *
 * The selection BAR is deliberately not rendered here: SelectionToolbar portals to
 * document.body and its actions are caller business, so the caller that owns the
 * selection owns the bar too. See AttachmentsTab.
 */
export default function AttachmentsTable({
  items,
  loading,
  uploadingFiles,
  onDownload,
  onDelete,
  onDownloadAll,
  selectedIds,
  onSelectionChange,
  formatBytes,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const selectable = selectedIds != null;

  const rows = useMemo(
    () => (items ?? []).map((item) => ({ ...toRow(item), item })),
    [items],
  );
  const { sorted, sortKey, sortDirection, toggleSort } = useClientSort(rows);

  // In-flight uploads stay on top whatever the sort: they are not part of the list yet.
  const uploadingRows = useMemo(
    () => (uploadingFiles ? Array.from(uploadingFiles.entries()) : []).map(([key, info]) => ({
      id: `${UPLOADING_ID_PREFIX}${key}`,
      uploading: true,
      name: info.name,
      size: info.size,
    })),
    [uploadingFiles],
  );
  const data = useMemo(() => [...uploadingRows, ...sorted], [uploadingRows, sorted]);

  const { clearTrigger, deselect } = useSelectionSync({
    selectable, selectedIds, items, loading, onSelectionChange,
  });

  const columns = useMemo(() => [
    {
      key: 'name',
      label: ui('attachmentsFileName'),
      type: 'string',
      render: (row) => (row.uploading
        ? (
          <span className="flex items-center gap-2 font-medium text-muted-foreground" data-testid={`attachment-uploading-${row.id}`}>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" data-testid="Loader2__e868a0" />
            <span>{row.name}</span>
          </span>
        )
        : <span className="font-medium text-foreground" data-testid={`attachment-name-${row.id}`}>{row.name}</span>),
    },
    {
      key: 'size',
      label: ui('attachmentsSize'),
      type: 'string',
      render: (row) => formatBytes(row.size),
    },
    // Figma "Jue 30 abr" through `render`, so DataTable's shared date cell (and its
    // due-date dot — `dot: false` documents that it never applies) stays untouched. The
    // row keeps the raw ISO value, so the client sort stays chronological.
    {
      key: 'uploadedAt',
      label: ui('attachmentsUploadedAt'),
      type: 'date',
      // ETP-5833 — explicit width: this table lives in a narrow side panel and its labels are
      // short, so it keeps the compact 130px instead of the 176px date tier (which pushed the
      // row's download action out of reach).
      minWidth: 130,
      dot: false,
      render: (row) => (row.uploading ? null : formatAttachmentDate(row.uploadedAt, locale)),
    },
    {
      key: 'updatedAt',
      label: ui('attachmentsUpdatedAt'),
      type: 'date',
      // ETP-5833 — explicit width: this table lives in a narrow side panel and its labels are
      // short, so it keeps the compact 130px instead of the 176px date tier (which pushed the
      // row's download action out of reach).
      minWidth: 130,
      dot: false,
      render: (row) => (row.uploading ? null : formatAttachmentDate(row.updatedAt, locale)),
    },
    {
      key: 'uploadedByName',
      label: ui('attachmentsUploadedBy'),
      type: 'string',
      render: (row) => (row.uploading ? null : (row.uploadedByName || ui('attachmentsUnknownUser'))),
    },
  ], [ui, locale, formatBytes]);

  const actionCount = (onDownload ? 1 : 0) + (onDelete ? 1 : 0);
  const rowQuickActions = actionCount > 0
    ? {
      enabled: true,
      buttonCount: actionCount,
      render: (row) => (
        <AttachmentRowActions
          row={row}
          onDownload={onDownload}
          onDelete={onDelete}
          data-testid="AttachmentRowActions__e868a0" />
      ),
    }
    : undefined;

  const hasItems = rows.length > 0;
  const hasUploads = uploadingRows.length > 0;

  return (
    <div className="space-y-1" data-testid="attachments-table">
      {onDownloadAll && (
        <div className="flex justify-end" data-testid="attachments-table-toolbar">
          <button
            type="button"
            data-testid="attachments-download-all"
            onClick={onDownloadAll}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" data-testid="Download__e868a0" />
            {ui('attachmentsDownloadAll')}
          </button>
        </div>
      )}
      {/* No overflow box of our own: DataTable scrolls horizontally inside its wrapper, and
          an `overflow-auto` here would turn the 24px it keeps below the last row for the
          lift shadow into a stray vertical scrollbar. */}
      <div className="min-w-0" data-testid="attachments-table-body">
        <DataTable
          columns={columns}
          data={data}
          loading={loading && !hasItems && !hasUploads}
          showFooterTotals={false}
          rowHoverStyle="lift-always"
          selectable={selectable}
          isRowSelectable={isPersistedRow}
          onSelectionChange={(selectedRows) => onSelectionChange?.(selectedRows.map((r) => r.id))}
          clearSelectionTrigger={clearTrigger}
          deselectTrigger={deselect.trigger}
          deselectRowIds={deselect.ids}
          sortColumn={sortKey}
          sortDirection={sortDirection}
          onSort={toggleSort}
          emptyState={{ title: ui('attachmentsNoFiles'), testId: 'attachments-empty-state' }}
          rowQuickActions={rowQuickActions}
          data-testid="DataTable__e868a0" />
      </div>
    </div>
  );
}
