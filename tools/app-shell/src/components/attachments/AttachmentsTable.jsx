import { Download, FileX, Loader2, Trash2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useUI } from '@/i18n';

/**
 * Format an ISO date string as a compact date (no time).
 * e.g. "12 may. 2026" in es-ES
 */
function formatDate(value) {
  if (!value) return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const locale = (typeof navigator !== 'undefined' && navigator.language) || 'es-ES';
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Single row for a file that is currently being uploaded.
 */
function UploadingRow({ name, size, formatBytes, selectable }) {
  return (
    <TableRow className="h-10" data-testid="TableRow__e868a0">
      {selectable && <TableCell className="w-10 px-2 py-0" data-testid="TableCell__e868a0" />}
      <TableCell className="px-3 py-0 font-medium" data-testid="TableCell__e868a0">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
            data-testid="Loader2__e868a0" />
          <span>{name}</span>
        </div>
      </TableCell>
      <TableCell className="px-3 py-0" data-testid="TableCell__e868a0">{formatBytes(size)}</TableCell>
      <TableCell
        colSpan={4}
        className="px-3 py-0 text-muted-foreground italic"
        data-testid="TableCell__e868a0" />
    </TableRow>
  );
}

/**
 * Generic table that renders the list of attachments for the current record.
 *
 * Props:
 *   items          - Attachment objects.
 *   loading        - True while the list is being fetched.
 *   uploadingFiles - Map<string, { name, size }> with optimistic upload rows.
 *   onDownload     - (attachment) => void
 *   onDelete       - (attachment) => void
 *   onDownloadAll  - () => void. Renders the header-wide "Download all (ZIP)" control.
 *                    Still used by SifAttachmentsSection, which has no selection and
 *                    no other way to pull its fiscal XML bundle; the Adjuntos tab
 *                    stopped passing it when the selection bar replaced it (ETP-5526).
 *   formatBytes    - (bytes) => string
 *
 * ── Selection is an opt-in capability (ETP-5526) ──────────────────────────────
 * This component is shared, and selection is NOT part of its baseline contract.
 * It is a CONTROLLED capability: the owner of the selection is the caller, exactly
 * as in MovementsTab → StatementsTable (`selectedIds` down, toggles up), which is
 * how the rest of the app wires a bulk-selection surface.
 *
 *   selectedIds  - Set<string> | undefined. Supplying it turns the capability ON:
 *                  the checkbox column appears and the rows tint. Leaving it out
 *                  means the capability does not exist here at all — no column, no
 *                  state, nothing to toggle. It used to render unconditionally, so
 *                  SifAttachmentsSection (the other consumer, read-only by design)
 *                  showed checkboxes that could not drive anything: the very
 *                  inert-control defect this ticket reports, in a second screen.
 *   onToggleRow  - (id) => void. One row's checkbox.
 *   onToggleAll  - (nextIds: string[]) => void. Header checkbox; receives the full
 *                  id list, or [] when it is clearing an already-complete selection.
 *
 * The selection BAR itself is deliberately not rendered here: SelectionToolbar
 * portals to document.body and its actions are caller business (download a subset,
 * delete a subset — each with its own gating), so the caller that owns the
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
  onToggleRow,
  onToggleAll,
  formatBytes,
}) {
  const ui = useUI();

  const selectable = selectedIds != null;
  const isSelected = (id) => selectable && selectedIds.has(id);

  const uploadingEntries = uploadingFiles ? Array.from(uploadingFiles.entries()) : [];
  const hasItems = items && items.length > 0;
  const hasUploads = uploadingEntries.length > 0;

  // fileName, size, uploadedAt, updatedAt, uploadedBy, actions — plus the
  // checkbox column only when the caller opted into selection.
  const COLUMNS = selectable ? 7 : 6;

  // Counted against `items`, not against the raw Set: a row deleted by a bulk
  // action leaves its id behind in the caller's Set for one render, and an
  // "all selected" that includes ids no longer on screen would tick the header
  // checkbox for a selection the user can no longer see.
  const selectedCount = selectable && hasItems
    ? items.filter((i) => selectedIds.has(i.id)).length
    : 0;
  const allSelected = hasItems && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleAll = () => onToggleAll?.(
    allSelected || !hasItems ? [] : items.map((i) => i.id)
  );

  // h-10 overrides the default h-11 from TableHead base styles
  const headCell = 'h-10 px-3 py-0 text-xs font-semibold text-foreground';
  const dataCell = 'px-3 py-0 text-sm text-foreground';

  return (
    <Table data-testid="attachments-table">
      <TableHeader data-testid="TableHeader__e868a0">
        <TableRow className="h-10" data-testid="TableRow__e868a0">
          {selectable && (
            <TableHead className={`${headCell} w-10 px-2`} data-testid="TableHead__e868a0">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
                data-testid="attachments-select-all" />
            </TableHead>
          )}
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsFileName')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsSize')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsUploadedAt')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsUpdatedAt')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsUploadedBy')}</TableHead>
          {/* ETP-5526 — "Eliminar todo" is gone from here: the selection bar is the
              one bulk-delete affordance now, and the Figma header has exactly the
              five data columns above. "Descargar todo (ZIP)" survives only because
              a caller without selection (SifAttachmentsSection) has no other way to
              pull the whole bundle; the Adjuntos tab no longer passes it. */}
          <TableHead className={headCell} data-testid="TableHead__e868a0">
            {onDownloadAll && (
              <div className="flex justify-end items-center gap-3">
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
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody data-testid="TableBody__e868a0">
        {uploadingEntries.map(([id, info]) => (
          <UploadingRow
            key={id}
            name={info.name}
            size={info.size}
            formatBytes={formatBytes}
            selectable={selectable}
            data-testid="UploadingRow__e868a0" />
        ))}

        {loading && !hasItems && !hasUploads && (
          [0, 1, 2].map((i) => (
            <TableRow key={`skeleton-${i}`} className="h-10" data-testid="TableRow__e868a0">
              {selectable && (
                <TableCell className="w-10 px-2 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-4" data-testid="Skeleton__e868a0" /></TableCell>
              )}
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-32" data-testid="Skeleton__e868a0" /></TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-16" data-testid="Skeleton__e868a0" /></TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-28" data-testid="Skeleton__e868a0" /></TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-28" data-testid="Skeleton__e868a0" /></TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-24" data-testid="Skeleton__e868a0" /></TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0"><Skeleton className="ml-auto h-4 w-16" data-testid="Skeleton__e868a0" /></TableCell>
            </TableRow>
          ))
        )}

        {!loading && !hasItems && !hasUploads && (
          <TableRow data-testid="TableRow__e868a0">
            <TableCell colSpan={COLUMNS} className="py-10" data-testid="TableCell__e868a0">
              <div data-testid="attachments-empty-state" className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileX className="h-8 w-8" aria-hidden="true" data-testid="FileX__e868a0" />
                <span className="text-sm">{ui('attachmentsNoFiles')}</span>
              </div>
            </TableCell>
          </TableRow>
        )}

        {hasItems && items.map((item) => {
          const uploadedByName = item.uploadedBy?.name
            ?? item.createdBy?.name
            ?? item['createdBy$_identifier']
            ?? null;
          const updatedAt = item.updatedAt ?? item.modifiedAt ?? item.updateDate ?? null;
          return (
            // ETP-5030 — exactly ONE background per row, mirroring
            // `computeRowClassName` (contract-ui/InlineLinesPanel.jsx). TableRow's
            // own base class is `hover:bg-muted/50`, so the `hover:` half is
            // required: the pointer is over the row when the checkbox is clicked,
            // and without it the base hover repaints over the tint at exactly the
            // moment the user looks for feedback. TableRow merges via `cn`
            // (tailwind-merge), so this className legitimately replaces the base
            // hover rather than racing it on stylesheet order.
            <TableRow
              key={item.id}
              data-testid={`attachment-row-${item.id}`}
              className={isSelected(item.id)
                ? 'group h-10 bg-primary/5 hover:bg-primary/5'
                : 'group h-10'}
            >
              {selectable && (
                <TableCell className="w-10 px-2 py-0" data-testid="TableCell__e868a0">
                  <Checkbox
                    checked={isSelected(item.id)}
                    onChange={() => onToggleRow?.(item.id)}
                    data-testid={`attachment-select-${item.id}`} />
                </TableCell>
              )}
              <TableCell data-testid={`attachment-name-${item.id}`} className={`${dataCell} font-medium`}>
                {item.name || item.fileName || item.id}
              </TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{formatBytes(item.size ?? item.fileSize)}</TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{formatDate(item.uploadedAt || item.createdAt || item.creationDate)}</TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{formatDate(updatedAt)}</TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{uploadedByName || ui('attachmentsUnknownUser')}</TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0">
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onDownload && (
                    <button
                      type="button"
                      data-testid={`attachment-download-${item.id}`}
                      onClick={() => onDownload(item)}
                      // ETP-5526 — the hover plate was `--muted`, which in light mode is
                      // hsl(210 40% 96%) against a row already hovering on `bg-muted/50`:
                      // roughly a 7/255 lift, i.e. no visible circle at all, while the
                      // sibling delete button reads clearly off its own
                      // `--status-destructive-bg`. `--border-subtle` is the palette's
                      // neutral counterpart with real separation from the hovered row in
                      // BOTH themes (#E1E7EF light / hsl(215 20% 30%) dark), and it is
                      // already the app's idiom for exactly this control — same h-8 w-8
                      // rounded-full `--text-disabled` icon button in AccountRowActions,
                      // MovementRowKebab, StatementsTable and ListModalWindow.
                      className="h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--border-subtle))] hover:text-[hsl(var(--foreground))] transition-all"
                      aria-label={ui('attachmentsDownload')}
                      title={ui('attachmentsDownload')}
                    >
                      <Download className="h-4 w-4" aria-hidden="true" data-testid="Download__e868a0" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      data-testid={`attachment-delete-${item.id}`}
                      onClick={() => onDelete(item)}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)] transition-all"
                      aria-label={ui('delete')}
                      title={ui('delete')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" data-testid="Trash2__e868a0" />
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
