import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { SheetClose, SheetTitle } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { formatReceived } from './InvoiceInboxCells.jsx';
import { statusLabelKey, STATUS_TONES } from './invoiceInboxMessages.js';
import { isImageFileName } from './invoiceInboxUploadPolicy.js';

function IconButton({ label, onClick, disabled, testId, variant = 'outline', children }) {
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 flex-none"
      data-testid={testId}>
      {children}
    </Button>
  );
}

/** "Correo de {sender} · {date time}" for e-mail, "Carga manual · {date time}" for uploads. */
function originLine(document, ui, received) {
  const origin = document.source === 'EMAIL'
    ? ui('invoiceInboxReviewFromEmail', { sender: document.sender ?? '' })
    : ui('invoiceInboxReviewManualUpload');
  return received ? `${origin} · ${received}` : origin;
}

/**
 * ETP-6050 F3 — the drawer header (60px): the file-type icon, the file name (the dialog title),
 * the status tag, the origin line and the reception date/time, a save-status slot (empty in S1,
 * `aria-live` so S2's "Guardando… / Guardado" is announced), "{n} de {total}", previous / next
 * and the close X (the Sheet's own absolute close button is not drawn: this one sits in the row).
 *
 * `document` is the answer of the review read when it has arrived, else the list row: the header
 * never waits for the read.
 *
 * @param {{document: {fileName?: string, status?: string, source?: string, sender?: string,
 *   created?: string}, position: number|null, total: number, canPrev: boolean, canNext: boolean,
 *   onPrev: () => void, onNext: () => void, saveStatus?: import('react').ReactNode}} props
 */
export default function InvoiceInboxReviewHeader({
  document, position, total, canPrev, canNext, onPrev, onNext, saveStatus = null,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const statusKey = statusLabelKey(document.status);
  const FileIcon = isImageFileName(document.fileName) ? ImageIcon : FileText;
  return (
    <header
      className="flex h-[60px] flex-none items-center gap-3 border-b border-border pl-5 pr-4"
      data-testid="invoice-inbox-review-header">
      <FileIcon className="h-[18px] w-[18px] flex-none text-muted-foreground" aria-hidden="true" data-testid="FileIcon__review-header" />
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <SheetTitle className="min-w-0 truncate text-[17px] font-bold leading-tight tracking-tight" title={document.fileName ?? ''} data-testid="invoice-inbox-review-title">
            {document.fileName ?? ''}
          </SheetTitle>
          {document.status && (
            <span className="inline-flex flex-none" data-testid="invoice-inbox-review-status">
              <StatusTag
                tone={STATUS_TONES[document.status] ?? 'neutral'}
                label={statusKey ? ui(statusKey) : document.status}
                data-testid="StatusTag__review-header" />
            </span>
          )}
        </div>
        <p className="truncate text-xs leading-snug text-muted-foreground" data-testid="invoice-inbox-review-origin">
          {originLine(document, ui, formatReceived(document.created, locale))}
        </p>
      </div>
      <span className="flex-1" />
      <span
        className="min-h-4 flex-none whitespace-nowrap text-xs font-medium text-muted-foreground"
        aria-live="polite"
        data-testid="invoice-inbox-review-save-status">
        {saveStatus}
      </span>
      {position != null && (
        <span className="ml-2 flex-none whitespace-nowrap font-mono text-xs font-medium text-muted-foreground tabular-nums" data-testid="invoice-inbox-review-position">
          {ui('invoiceInboxReviewPosition', { n: position, total })}
        </span>
      )}
      <IconButton
        label={ui('invoiceInboxReviewPrevious')}
        onClick={onPrev}
        disabled={!canPrev}
        testId="invoice-inbox-review-prev"
        data-testid="IconButton__abf2a4">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" data-testid="ChevronLeft__review-header" />
      </IconButton>
      <IconButton
        label={ui('next')}
        onClick={onNext}
        disabled={!canNext}
        testId="invoice-inbox-review-next"
        data-testid="IconButton__abf2a4">
        <ChevronRight className="h-4 w-4" aria-hidden="true" data-testid="ChevronRight__review-header" />
      </IconButton>
      <SheetClose asChild data-testid="SheetClose__review-header">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ui('close')}
          title={ui('close')}
          className="h-8 w-8 flex-none"
          data-testid="invoice-inbox-review-close">
          <X className="h-4 w-4" aria-hidden="true" data-testid="X__review-header" />
        </Button>
      </SheetClose>
    </header>
  );
}
