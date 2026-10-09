import { useState } from 'react';
import { MoreVertical, Upload, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import ConfirmDeleteDialog from '@/components/attachments/ConfirmDeleteDialog.jsx';
import { useUI } from '@/i18n';
import PdfViewer from './PdfViewer.jsx';
import FileLightbox from './FileLightbox.jsx';

/* eslint-disable react/prop-types */

/**
 * The "More" button of the file mini toolbar and its menu: Replace file / Delete file.
 * An action the caller did not provide is not offered.
 */
function FileMoreMenu({ onReplace, onDelete, disabled }) {
  const ui = useUI();
  return (
    // Non-modal: the items open a file picker or a confirmation dialog, and a modal menu
    // would still be holding the page's pointer events while that dialog mounts.
    <DropdownMenu modal={false} data-testid="DropdownMenu__688c6e">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__688c6e">
        <button
          type="button"
          className="w-12 h-[38px] flex items-center justify-center hover:bg-muted transition-colors"
          aria-label={ui('more')}
          title={ui('more')}
          data-testid="file-viewer-more"
        >
          <MoreVertical
            size={20}
            className="text-[hsl(var(--text-disabled))]"
            data-testid="MoreVertical__688c6e" />
        </button>
      </DropdownMenuTrigger>
      {/* z-[60]: this menu also opens from inside the z-50 list preview. */}
      <DropdownMenuContent align="end" className="z-[60] w-[204px]" data-testid="file-viewer-menu">
        {onReplace && (
          <DropdownMenuItem disabled={disabled} onSelect={onReplace} data-testid="file-viewer-replace">
            <Upload
              className="h-5 w-5 text-[hsl(var(--text-disabled))]"
              data-testid="Upload__688c6e" />
            <span className="text-sm font-normal leading-6 text-[hsl(var(--foreground))]">
              {ui('fileViewerReplace')}
            </span>
          </DropdownMenuItem>
        )}
        {onReplace && onDelete && <DropdownMenuSeparator data-testid="DropdownMenuSeparator__688c6e" />}
        {onDelete && (
          <DropdownMenuItem disabled={disabled} onSelect={onDelete} data-testid="file-viewer-delete">
            <Trash2
              className="h-5 w-5 text-[hsl(var(--destructive))]"
              data-testid="Trash2__688c6e" />
            <span className="text-sm font-normal leading-6 text-[hsl(var(--destructive))]">
              {ui('fileViewerDelete')}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Viewer for an uploaded file (ETP-5518): the PDF or image, a "More" menu on its mini
 * toolbar (Replace file / Delete file) and a lightbox that opens when the preview is
 * clicked. Deleting always asks for confirmation first.
 *
 * It owns no storage: `onReplace` opens the caller's file picker and `onDelete` runs the
 * caller's delete, so each caller keeps its own validation and write gates. A caller whose
 * writes are gated (read-only tier) passes neither — the menu disappears and the lightbox
 * keeps only zoom and close.
 *
 * @param {{ objectUrl: string, fileName: string, mimeType?: string }} file
 * @param {Function} [onReplace]        - open the caller's file picker.
 * @param {Function} [onDelete]         - delete the file; called only after confirmation.
 * @param {boolean}  [actionsDisabled]  - a write is in flight; Replace / Delete are disabled.
 */
export default function UploadedFileViewer({
  file, onReplace, onDelete, actionsDisabled = false,
}) {
  const ui = useUI();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const askDelete = onDelete ? () => setConfirmOpen(true) : undefined;
  // Focus the clicked preview first (not every browser focuses a button on click), so the
  // lightbox has somewhere to return focus to when it closes.
  const openLightbox = (event) => {
    event?.currentTarget?.focus?.();
    setLightboxOpen(true);
  };
  const moreMenu = (onReplace || onDelete) ? (
    <FileMoreMenu
      onReplace={onReplace}
      onDelete={askDelete}
      disabled={actionsDisabled}
      data-testid="FileMoreMenu__688c6e" />
  ) : null;

  return (
    <>
      {file.mimeType?.startsWith('image/') ? (
        <div className="relative h-full w-full overflow-auto">
          {moreMenu && (
            <div
              className="absolute top-2 right-2 z-10 flex items-stretch bg-card rounded-lg overflow-hidden"
              style={{
                border: '1px solid hsl(var(--border-control))',
                boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
              }}
            >
              {moreMenu}
            </div>
          )}
          <button
            type="button"
            onClick={openLightbox}
            className="flex h-full w-full items-center justify-center cursor-zoom-in"
            aria-label={ui('fileViewerExpand')}
            title={ui('fileViewerExpand')}
            data-testid="file-viewer-expand"
          >
            <img src={file.objectUrl} alt={file.fileName} className="max-h-full max-w-full object-contain bg-card shadow-md" />
          </button>
        </div>
      ) : (
        <PdfViewer
          url={file.objectUrl}
          toolbarExtra={moreMenu}
          onExpand={openLightbox}
          data-testid="PdfViewer__688c6e" />
      )}
      <FileLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        file={file}
        onReplace={onReplace}
        onDelete={askDelete}
        actionsDisabled={actionsDisabled}
        data-testid="FileLightbox__688c6e" />
      <ConfirmDeleteDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onDelete}
        title={ui('fileViewerDelete')}
        data-testid="ConfirmDeleteDialog__688c6e" />
    </>
  );
}
