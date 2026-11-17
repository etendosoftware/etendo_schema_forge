import { Copy, FileText, Image as ImageIcon, Link2, Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TruncatedText } from '@/components/ui/truncated-text';
import { StatusTag } from '@/components/ui/status-tag';
import { formatCalendarDate, parseWallClockInstant } from '@/lib/dateOnly.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { STATUS, isProcessingRow } from './invoiceInboxFilters.js';
import { errorCodeLabelKey, statusLabelKey, STATUS_TONES } from './invoiceInboxMessages.js';
import { isImageFileName } from './invoiceInboxUploadPolicy.js';

const EMPTY = '—';
const SUBLINE_CLASS = 'mt-1 text-xs leading-4';

/** Animated placeholder for a value the background reader has not produced yet. */
function Shimmer({ width }) {
  return (
    <Skeleton
      className="inline-block h-3 rounded-md align-middle"
      style={{ width }}
      data-testid="Skeleton__85f13c" />
  );
}

/**
 * One line of cell text that ellipsises when the column is too narrow and then shows the full
 * value in a tooltip, on hover and on keyboard focus (`tabIndex` 0; the shared `TruncatedText`
 * only opens it when the text is really clipped). The tooltip is Radix's, so the trigger gets
 * `aria-describedby` while it is open. Row selection is unaffected: the checkbox owns it (a row
 * click opens the review panel, ETP-6050).
 */
function CellText({ text, className, testId }) {
  return <TruncatedText text={text} className={className} tabIndex={0} data-testid={testId} />;
}

function Muted({ children, className = '' }) {
  return <span className={`text-muted-foreground ${className}`}>{children}</span>;
}

const DAY_PARTS = Object.freeze({ day: '2-digit', month: '2-digit', year: 'numeric' });

/** A timestamp column read as the server's wall clock (`parseWallClockInstant`), formatted. */
function formatWallClock(raw, locale, parts) {
  const date = parseWallClockInstant(raw);
  if (!date) return '';
  return new Intl.DateTimeFormat(String(locale ?? 'en-GB').replace('_', '-'), parts).format(date);
}

/** Reception date and time (`created` is a timestamp, read as the server's wall clock). */
export function formatReceived(raw, locale) {
  return formatWallClock(raw, locale, { ...DAY_PARTS, hour: '2-digit', minute: '2-digit' });
}

/**
 * Document: type icon, file name, and a second line with the reception date. The origin is shown
 * only when it is not the usual manual upload ("Correo" with its icon, then " · " and the date);
 * an uploaded document shows the date alone. The line is always rendered, at the same text-xs
 * height, so rows keep one height whatever the origin.
 */
export function DocumentCell({ row, ui, locale }) {
  const FileIcon = isImageFileName(row.fileName) ? ImageIcon : FileText;
  const byEmail = row.source === 'EMAIL';
  const received = formatReceived(row.created, locale);
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-testid={`invoice-inbox-document-${row.id}`}>
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileIcon className="h-4 w-4" aria-hidden="true" data-testid="FileIcon__85f13c" />
      </span>
      <div className="min-w-0">
        <CellText
          text={row.fileName}
          className="font-medium"
          testId={`invoice-inbox-file-name-${row.id}`}
          data-testid="CellText__85f13c" />
        <div className="flex h-4 items-center gap-1.5 whitespace-nowrap text-xs leading-4 text-muted-foreground">
          {byEmail && (
            <span className="inline-flex items-center gap-1.5" data-testid={`invoice-inbox-source-${row.id}`}>
              <Mail className="h-3 w-3" aria-hidden="true" data-testid={`invoice-inbox-source-icon-${row.id}`} />
              {ui('invoiceInboxSourceEmail')}
              {received && <span aria-hidden="true">·</span>}
            </span>
          )}
          {received && <span data-testid={`invoice-inbox-received-${row.id}`}>{received}</span>}
        </div>
      </div>
    </div>
  );
}

/** Vendor name and tax id, each truncated with a tooltip; a link icon marks a linked partner. */
function VendorLines({ row, name, taxId, linked = false }) {
  return (
    <div className="min-w-0">
      <CellText
        text={name}
        className="font-semibold"
        testId={`invoice-inbox-vendor-name-${row.id}`}
        data-testid="CellText__85f13c" />
      {taxId && (
        <div className="flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground">
          {linked && <Link2
            className="h-3 w-3 flex-none"
            aria-hidden="true"
            data-testid="Link2__85f13c" />}
          <span className="min-w-0 flex-1">
            <CellText
              text={taxId}
              testId={`invoice-inbox-vendor-tax-id-${row.id}`}
              data-testid="CellText__85f13c" />
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Vendor: the linked business partner (name + its tax id), else what the reader extracted (no
 * badge: "new vendor" / "N matches" need columns the table does not have yet), else "No data".
 */
export function VendorCell({ row, ui }) {
  if (isProcessingRow(row)) return <Shimmer width={140} data-testid="Shimmer__85f13c" />;
  if (row.businessPartner) {
    return (
      <VendorLines
        row={row}
        name={row['businessPartner$_identifier']}
        taxId={row['businessPartner$taxID']}
        linked
        data-testid="VendorLines__85f13c" />
    );
  }
  if (row.extractedName) {
    return (
      <VendorLines
        row={row}
        name={row.extractedName}
        taxId={row.extractedTaxID}
        data-testid="VendorLines__85f13c" />
    );
  }
  return <Muted data-testid="Muted__85f13c">{ui('invoiceInboxVendorNoData')}</Muted>;
}

const SETTLED_STATUSES = new Set([STATUS.CONFIRMED, STATUS.DISCARDED]);

export function NumberCell({ row, ui }) {
  if (isProcessingRow(row)) return <Shimmer width={80} data-testid="Shimmer__85f13c" />;
  const duplicate = row.duplicateOfInvoice && !SETTLED_STATUSES.has(row.status);
  const duplicateTitle = duplicate
    ? ui('invoiceInboxPossibleDuplicate', { doc: row['duplicateOfInvoice$documentNo'] || row['duplicateOfInvoice$_identifier'] || '' })
    : null;
  return (
    <span className="whitespace-nowrap font-mono text-[13px]">
      {row.orderReference || <Muted data-testid="Muted__85f13c">{EMPTY}</Muted>}
      {duplicate && (
        <span
          role="img"
          aria-label={duplicateTitle}
          title={duplicateTitle}
          className="ml-1.5 inline-flex align-[-2px] text-status-warning-foreground"
          data-testid={`invoice-inbox-duplicate-${row.id}`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" data-testid="Copy__85f13c" />
        </span>
      )}
    </span>
  );
}

export function InvoiceDateCell({ row, locale }) {
  if (isProcessingRow(row)) return <Shimmer width={70} data-testid="Shimmer__85f13c" />;
  if (!row.invoiceDate) return <span className="text-destructive">{EMPTY}</span>;
  return <span className="whitespace-nowrap">{formatCalendarDate(row.invoiceDate, locale)}</span>;
}

/** Total in the organization currency: the inbox row has no currency of its own yet. */
export function TotalCell({ row, currency }) {
  if (isProcessingRow(row)) return <Shimmer width={64} data-testid="Shimmer__85f13c" />;
  if (row.grandTotalAmount == null) return <Muted data-testid="Muted__85f13c">{EMPTY}</Muted>;
  return <span className="whitespace-nowrap font-semibold tabular-nums">{formatCurrency(currency, row.grandTotalAmount)}</span>;
}

/**
 * Day a document was discarded (`discardedAt` is a timestamp, read as the server's wall clock, like
 * `created`), formatted as a date only.
 */
export function formatDiscardedDay(raw, locale) {
  return formatWallClock(raw, locale, DAY_PARTS);
}

/**
 * The line under the status tag: the error reason, the created invoice, or the day it was
 * discarded. Full text in a tooltip.
 */
function StatusSubline({ row, ui, locale }) {
  if (row.status === STATUS.ERROR) {
    return (
      <CellText
        text={ui(errorCodeLabelKey(row.errorCode))}
        className={`${SUBLINE_CLASS} text-destructive`}
        testId={`invoice-inbox-status-reason-${row.id}`}
        data-testid="CellText__85f13c" />
    );
  }
  // The plain document number; the DAL identifier ("no - date - amount") only when it is absent.
  const invoiceDoc = row['invoice$documentNo'] || row['invoice$_identifier'];
  if (row.status === STATUS.CONFIRMED && invoiceDoc) {
    return (
      <CellText
        text={ui('invoiceInboxConfirmedAs', { doc: invoiceDoc })}
        className={`${SUBLINE_CLASS} font-mono text-primary`}
        testId={`invoice-inbox-status-reason-${row.id}`}
        data-testid="CellText__85f13c" />
    );
  }
  const discardedDay = row.status === STATUS.DISCARDED ? formatDiscardedDay(row.discardedAt, locale) : '';
  if (discardedDay) {
    return (
      <CellText
        text={ui('invoiceInboxDiscardedAt', { date: discardedDay })}
        className={`${SUBLINE_CLASS} text-muted-foreground`}
        testId={`invoice-inbox-discarded-at-${row.id}`}
        data-testid="CellText__85f13c" />
    );
  }
  return null;
}

export function StatusCell({ row, ui, locale }) {
  const key = statusLabelKey(row.status);
  return (
    <div className="min-w-0" data-testid={`invoice-inbox-status-${row.id}`}>
      <StatusTag
        tone={STATUS_TONES[row.status] ?? 'neutral'}
        label={key ? ui(key) : row.status}
        data-testid="StatusTag__85f13c" />
      <StatusSubline row={row} ui={ui} locale={locale} data-testid="StatusSubline__85f13c" />
    </div>
  );
}
