import { Search } from 'lucide-react';
import { useLocale, useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { getStatusTone, statusLabel } from '@/lib/statusBadge.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { getDueDateDotStyle, getDueDateState } from '@/lib/invoiceDueDate.js';
import { invoicePaymentState, quotationValidity } from './portalPresentation.js';

/** The viewer's BCP-47 locale, for dates. */
export function usePortalLocale() {
  const { locale } = useLocaleSwitch();
  return (locale || 'es_ES').replace('_', '-');
}

/** A calendar day (`yyyy-MM-dd`), never shifted by the browser's timezone. */
export function PortalDate({ value, testId }) {
  const bcpLocale = usePortalLocale();
  return <span data-testid={testId}>{value ? formatCalendarDate(value, bcpLocale) : '—'}</span>;
}

/** Money through the canonical formatter; a shipment's missing amount renders "—". */
export function PortalMoney({ currency, value, className, testId }) {
  return (
    <span className={className} data-testid={testId}>
      {value == null ? '—' : formatCurrency(currency, value)}
    </span>
  );
}

/**
 * Tone → the app's status tag tokens (`--status-*`, ETP-3835), drawn the way the design draws
 * every badge: 12/16 medium text, an 8px radius and a border of the tone.
 */
const TAG_TONES = Object.freeze({
  info: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]',
  success: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]',
  warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]',
  destructive: 'bg-[var(--status-destructive-bg)] text-destructive border-destructive/30',
  caution: 'bg-[var(--status-caution-bg)] text-[var(--status-caution-fg)] border-[var(--status-caution-fg)]/30',
  neutral: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-[var(--status-neutral-border)]',
});

/** The design's badge. */
export function PortalTag({ tone = 'neutral', children, className, testId, ...rest }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-lg border px-2.5 py-0.5 text-xs font-medium leading-4',
        TAG_TONES[tone] ?? TAG_TONES.neutral,
        className,
      )}
      data-testid={testId}
      {...rest}
    >
      {children}
    </span>
  );
}

/** The document status, with the app's own label and tone (`statusLabel`, `getStatusTone`). */
export function PortalDocumentStatus({ status, className }) {
  const ui = useUI();
  const dictionary = useLocale();
  if (!status) return null;
  return (
    <PortalTag
      tone={getStatusTone(status)}
      className={className}
      testId="portal-document-status"
      data-status={status}
    >
      {statusLabel(status, dictionary, ui)}
    </PortalTag>
  );
}

/** An invoice's payment state, as the app shows it (see `invoicePaymentState`). */
export function PortalPaymentStatus({ document, installments = null, className }) {
  const ui = useUI();
  const state = invoicePaymentState(document, installments);
  if (!state) return null;
  return (
    <PortalTag tone={state.tone} className={className} testId="portal-payment-status" data-state={state.id}>
      {ui(state.labelKey)}
    </PortalTag>
  );
}

/** The badge a row shows: an invoice's payment state, any other document's status. */
export function PortalRowBadge({ document, className }) {
  return document?.kind === 'INVOICE'
    ? <PortalPaymentStatus document={document} className={className} />
    : <PortalDocumentStatus status={document?.documentStatus} className={className} />;
}

/** The due date with the app's four-state dot (paid / overdue / soon / ok). */
export function PortalDueDate({ document }) {
  if (!document?.dueDate) return <span>—</span>;
  const state = getDueDateState(document.dueDate, document.outstandingAmount);
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="portal-due-date" data-state={state}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={getDueDateDotStyle(state)} />
      <PortalDate value={document.dueDate} />
    </span>
  );
}

/** A quotation's "Válido hasta", with the design's dot while it can still be answered. */
export function PortalValidUntil({ document }) {
  const validity = quotationValidity(document);
  if (!validity) return <span className="text-muted-foreground">—</span>;
  if (validity.state === 'answered') {
    return <span className="text-muted-foreground"><PortalDate value={document.validUntil} /></span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="portal-valid-until" data-state={validity.state}>
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', validity.state === 'expired' ? 'bg-destructive' : 'bg-foreground')}
      />
      <PortalDate value={document.validUntil} />
    </span>
  );
}

/** Focus ring every clickable portal row shows when reached by keyboard. */
export const PORTAL_ROW_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Makes a whole table row open its document, as the app's list rows do (`DataTable`: the row is
 * the click target, with a pointer cursor). A `<tr>` is not a native control, so the row is also
 * given what a button would have: a link role, a tab stop, Enter / Space and a focus ring.
 *
 * @param {Function} onActivate opens the document
 * @param {string} label the accessible name ("Factura FV/0001")
 */
export function portalRowActivation(onActivate, label) {
  return {
    role: 'link',
    tabIndex: 0,
    'aria-label': label,
    onClick: onActivate,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    },
  };
}

/** A section with the design's grey header band. */
export function PortalSection({ title, action, children, className = '', testId }) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-lg border border-border bg-card md:rounded-lg ${className}`}
      data-testid={testId}
    >
      <div className="flex h-14 items-center justify-between border-b border-border bg-muted px-5 md:h-12 md:px-3">
        <h2 className="text-[13px] font-medium uppercase leading-[18px] md:text-xs md:leading-4">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The design's search pill (header of Inicio and the lists). */
export function PortalSearchPill({ value, onChange, placeholder, label, testId, className, children }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <label className="flex h-12 items-center gap-2.5 rounded-full bg-muted px-4 md:h-9 md:gap-2 md:px-3.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label ?? placeholder}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent text-base outline-none md:text-sm"
          data-testid={testId}
        />
      </label>
      {children}
    </div>
  );
}

/** The count chip beside a list title. */
export function PortalCountChip({ count, testId }) {
  return (
    <span
      className="rounded-md border border-border bg-card px-2 py-px text-[13px] leading-[18px] text-muted-foreground md:px-[7px] md:text-xs md:leading-4"
      data-testid={testId}
    >
      {count}
    </span>
  );
}

/**
 * The desktop view header of Inicio and the lists (design: a three-column grid — title and
 * breadcrumb, the search pill centred, an empty column).
 */
export function PortalDesktopHeader({ title, count, breadcrumb, search }) {
  return (
    <header
      className="hidden grid-cols-[minmax(0,1fr)_minmax(0,320px)_minmax(0,1fr)] items-center gap-4 px-1 pb-3 pt-1 md:grid"
      data-testid="portal-view-header"
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold leading-7" data-testid="portal-view-title">{title}</h1>
          {count != null ? <PortalCountChip count={count} testId="portal-view-count" /> : null}
        </div>
        <span className="truncate text-xs leading-4 text-muted-foreground" data-testid="portal-breadcrumb">{breadcrumb}</span>
      </div>
      {search ?? <div />}
      <div />
    </header>
  );
}

/** The white content card every desktop view sits on. */
export function PortalMain({ children, className, testId = 'portal-main' }) {
  return (
    <main
      className={cn('flex min-h-0 flex-1 flex-col gap-3 md:overflow-y-auto md:rounded-lg md:bg-card md:p-3', className)}
      data-testid={testId}
    >
      {children}
    </main>
  );
}
