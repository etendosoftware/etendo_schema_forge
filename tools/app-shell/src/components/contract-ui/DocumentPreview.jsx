import { useEffect, useCallback } from 'react';
import { X, Download, FileText } from 'lucide-react';

/**
 * Full-screen modal overlay for previewing PDF documents.
 *
 * Props:
 * - open (boolean) — whether the modal is visible
 * - onClose (function) — close handler
 * - title (string) — document title shown in the header
 * - pdfUrl (string|null) — URL to the PDF; null shows a placeholder
 * - documentId (string) — record ID (reserved for future use)
 */
export function DocumentPreview({ open, onClose, title = 'Document Preview', pdfUrl = null, documentId }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50 transition-opacity"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-4 sm:inset-8 lg:inset-12 z-50 flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText
              className="h-4 w-4 text-muted-foreground shrink-0"
              data-testid="FileText__152a2f" />
            <span className="text-sm font-medium text-foreground truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                download
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4" data-testid="Download__152a2f" />
              </a>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" data-testid="X__152a2f" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-4">
          {pdfUrl ? (
            <object
              data={pdfUrl}
              type="application/pdf"
              className="w-full h-full rounded-lg shadow-lg bg-white"
            >
              <iframe
                src={pdfUrl}
                title={title}
                className="w-full h-full border-0 rounded-lg"
              />
            </object>
          ) : (
            /* Placeholder when no PDF URL is available */
            (<div className="h-full flex flex-col items-center justify-center text-center px-8 bg-white rounded-lg shadow-lg">
              <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-slate-400" data-testid="FileText__152a2f" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Preview not available
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                PDF preview will be available when the document is processed. The report endpoint is not configured yet.
              </p>
            </div>)
          )}
        </div>
      </div>
    </>
  );
}
