import { AlertCircle, Check, FileText, Image as ImageIcon, X } from 'lucide-react';
import { TruncatedText } from '@/components/ui/truncated-text';
import { useUI } from '@/i18n';
import { isImageFileName } from './invoiceInboxUploadPolicy.js';
import {
  ITEM_ACCEPTED, ITEM_QUEUED, ITEM_REJECTED, ITEM_UNCONFIRMED,
} from './useInvoiceInboxUpload.js';

/** The message under a file: queued, sending, delivered, unconfirmed, or the refusal reason. */
export function itemMessage(item, ui) {
  if (item.status === ITEM_REJECTED || item.status === ITEM_UNCONFIRMED) return item.reasonText ?? ui(item.reasonKey);
  if (item.status === ITEM_ACCEPTED) return ui('invoiceInboxUploadDelivered');
  if (item.status === ITEM_QUEUED) return ui('invoiceInboxUploadQueued');
  return ui('invoiceInboxUploadSending');
}

/**
 * Per-file bar. `fetch` reports no upload progress and the policy forbids XHR around `apiFetch`,
 * so there is no fake percentage: empty while queued, an indeterminate stripe while sending,
 * full when done.
 */
function ItemBar({ status }) {
  if (status === ITEM_QUEUED) return <div className="mt-1.5 h-1 rounded-full bg-muted" />;
  if (status === ITEM_ACCEPTED) return <div className="mt-1.5 h-1 rounded-full bg-status-success-foreground" />;
  if (status === ITEM_REJECTED) return <div className="mt-1.5 h-1 rounded-full bg-destructive" />;
  if (status === ITEM_UNCONFIRMED) return <div className="mt-1.5 h-1 rounded-full bg-status-warning-foreground" />;
  return <div className="mt-1.5 h-1 animate-pulse rounded-full bg-primary/60" />;
}

function ItemIcon({ status }) {
  if (status === ITEM_ACCEPTED) return (
    <Check
      className="h-3.5 w-3.5 text-status-success-foreground"
      aria-hidden="true"
      data-testid="Check__fad457" />
  );
  if (status === ITEM_REJECTED) return (
    <AlertCircle
      className="h-3.5 w-3.5 text-destructive"
      aria-hidden="true"
      data-testid="AlertCircle__fad457" />
  );
  if (status === ITEM_UNCONFIRMED) return (
    <AlertCircle
      className="h-3.5 w-3.5 text-status-warning-foreground"
      aria-hidden="true"
      data-testid="AlertCircle__unconfirmed" />
  );
  return null;
}

function TrayItem({ item, index }) {
  const ui = useUI();
  const FileIcon = isImageFileName(item.name) ? ImageIcon : FileText;
  let messageTone = 'text-muted-foreground';
  if (item.status === ITEM_REJECTED) messageTone = 'text-destructive';
  else if (item.status === ITEM_UNCONFIRMED) messageTone = 'text-status-warning-foreground';
  return (
    <li
      className="flex items-center gap-2.5 border-b border-border px-2 py-2.5"
      data-status={item.status}
      data-testid={`invoice-inbox-upload-item-${index}`}
    >
      <FileIcon
        className="h-[18px] w-[18px] flex-none text-muted-foreground"
        aria-hidden="true"
        data-testid="FileIcon__fad457" />
      <div className="min-w-0 flex-1">
        <TruncatedText
          text={item.name}
          className="text-[13px] font-medium"
          tabIndex={0}
          data-testid={`invoice-inbox-upload-item-name-${index}`} />
        <ItemBar status={item.status} data-testid="ItemBar__fad457" />
        <TruncatedText
          text={itemMessage(item, ui)}
          className={`mt-1 text-xs ${messageTone}`}
          tabIndex={0}
          data-testid={`invoice-inbox-upload-item-message-${index}`} />
      </div>
      <span className="flex w-5 flex-none justify-end"><ItemIcon status={item.status} data-testid="ItemIcon__fad457" /></span>
    </li>
  );
}

/**
 * ETP-6049 — "Uploading X of N": one line per file of the current uploads. X counts the files
 * the server answered for (delivered or refused); reading them happens afterwards, on the server,
 * and shows as "Processing" rows in the list.
 *
 * The page shows it while files are sent; once delivery is over the "Resultado de tus cargas"
 * panel takes over, and the tray keeps only the refused files (with their reasons) until the user
 * closes it. While files are still queued or sending, an inline notice asks not to leave the page
 * (leaving drops the queue; it does not block navigation). Each line's name and message are
 * truncated with the full text in a tooltip (hover and keyboard focus).
 *
 * @param {object} props
 * @param {number} [props.pending] files still queued or sending (drives the "stay" notice)
 */
export default function InvoiceInboxUploadTray({ items, done, total, finished, pending = 0, onClose }) {
  const ui = useUI();
  if (!items.length) return null;
  return (
    <section
      className="overflow-hidden rounded-xl border border-border"
      aria-live="polite"
      data-testid="invoice-inbox-upload-tray"
    >
      <div className="flex h-10 items-center gap-2.5 border-b border-border bg-muted/40 px-2">
        <span className="flex-1 font-mono text-[11px] font-bold uppercase tracking-[.08em]" data-testid="invoice-inbox-upload-progress">
          {ui('invoiceInboxUploadingProgress', { done, total })}
        </span>
        {finished && (
          <button
            type="button"
            onClick={onClose}
            aria-label={ui('close')}
            title={ui('close')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            data-testid="invoice-inbox-upload-close"
          >
            <X className="h-4 w-4" aria-hidden="true" data-testid="X__fad457" />
          </button>
        )}
      </div>
      {pending > 0 && (
        <p className="border-b border-border px-2 py-1.5 text-xs text-muted-foreground" data-testid="invoice-inbox-upload-stay-notice">
          {ui('invoiceInboxUploadStayNotice', { count: pending })}
        </p>
      )}
      <ul className="grid [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {items.map((item, index) => <TrayItem key={item.key} item={item} index={index} data-testid="TrayItem__fad457" />)}
      </ul>
    </section>
  );
}
