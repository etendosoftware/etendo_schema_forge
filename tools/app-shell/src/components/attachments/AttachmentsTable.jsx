import { useState } from 'react';
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
function UploadingRow({ name, size, formatBytes }) {
  return (
    <TableRow className="h-10" data-testid="TableRow__e868a0">
      <TableCell className="w-10 px-2 py-0" data-testid="TableCell__e868a0" />
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
 *   onEdit         - (attachment) => void
 *   onDelete       - (attachment) => void
 *   formatBytes    - (bytes) => string
 */
export default function AttachmentsTable({
  items,
  loading,
  uploadingFiles,
  onDownload,
  onDelete,
  onDownloadAll,
  onDeleteAll,
  formatBytes,
}) {
  const ui = useUI();
  const [selectedIds, setSelectedIds] = useState(new Set());

  const uploadingEntries = uploadingFiles ? Array.from(uploadingFiles.entries()) : [];
  const hasItems = items && items.length > 0;
  const hasUploads = uploadingEntries.length > 0;

  // 7 columns: checkbox, fileName, size, uploadedAt, updatedAt, uploadedBy, actions
  const COLUMNS = 7;

  const allSelected = hasItems && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => setSelectedIds(
    allSelected ? new Set() : new Set(items.map((i) => i.id))
  );
  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  // h-10 overrides the default h-11 from TableHead base styles
  const headCell = 'h-10 px-3 py-0 text-xs font-semibold text-foreground';
  const dataCell = 'px-3 py-0 text-sm text-foreground';

  return (
    <Table data-testid="attachments-table">
      <TableHeader data-testid="TableHeader__e868a0">
        <TableRow className="h-10" data-testid="TableRow__e868a0">
          <TableHead className={`${headCell} w-10 px-2`} data-testid="TableHead__e868a0">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleAll}
              data-testid="Checkbox__e868a0" />
          </TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsFileName')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsSize')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsUploadedAt')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsUpdatedAt')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">{ui('attachmentsUploadedBy')}</TableHead>
          <TableHead className={headCell} data-testid="TableHead__e868a0">
            {(onDownloadAll || onDeleteAll) && (
              <div className="flex justify-end items-center gap-3">
                {onDownloadAll && (
                  <button
                    type="button"
                    data-testid="attachments-download-all"
                    onClick={onDownloadAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" data-testid="Download__e868a0" />
                    {ui('attachmentsDownloadAll')}
                  </button>
                )}
                {onDeleteAll && (
                  <button
                    type="button"
                    data-testid="attachments-delete-all"
                    onClick={onDeleteAll}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#D50B3E] hover:text-[#b00834] transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__e868a0" />
                    {ui('attachmentsDeleteAll')}
                  </button>
                )}
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
            data-testid="UploadingRow__e868a0" />
        ))}

        {loading && !hasItems && !hasUploads && (
          [0, 1, 2].map((i) => (
            <TableRow key={`skeleton-${i}`} className="h-10" data-testid="TableRow__e868a0">
              <TableCell className="w-10 px-2 py-0" data-testid="TableCell__e868a0"><Skeleton className="h-4 w-4" data-testid="Skeleton__e868a0" /></TableCell>
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
            <TableRow key={item.id} data-testid={`attachment-row-${item.id}`} className="group h-10">
              <TableCell className="w-10 px-2 py-0" data-testid="TableCell__e868a0">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                  data-testid="Checkbox__e868a0" />
              </TableCell>
              <TableCell data-testid={`attachment-name-${item.id}`} className={`${dataCell} font-medium`}>
                {item.name || item.fileName || item.id}
              </TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{formatBytes(item.size ?? item.fileSize)}</TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{formatDate(item.uploadedAt || item.createdAt || item.creationDate)}</TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{formatDate(updatedAt)}</TableCell>
              <TableCell className={dataCell} data-testid="TableCell__e868a0">{uploadedByName || ui('attachmentsUnknownUser')}</TableCell>
              <TableCell className="px-3 py-0" data-testid="TableCell__e868a0">
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    data-testid={`attachment-download-${item.id}`}
                    onClick={() => onDownload?.(item)}
                    className="h-8 w-8 flex items-center justify-center rounded-full text-[#828FA3] hover:bg-[#F5F7F9] transition-all"
                    aria-label={ui('attachmentsDownload')}
                    title={ui('attachmentsDownload')}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" data-testid="Download__e868a0" />
                  </button>
                  <button
                    type="button"
                    data-testid={`attachment-delete-${item.id}`}
                    onClick={() => onDelete?.(item)}
                    className="h-8 w-8 flex items-center justify-center rounded-full text-[#D50B3E] hover:bg-[#FEF0F4] transition-all"
                    aria-label={ui('delete')}
                    title={ui('delete')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" data-testid="Trash2__e868a0" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
