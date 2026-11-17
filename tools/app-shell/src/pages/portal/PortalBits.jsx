import { Search } from 'lucide-react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
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
      {...rest}
      // An explicit testId wins over a generated data-testid passed through rest.
      data-testid={testId ?? rest['data-testid']}
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
      data-testid="PortalTag__7a317e">
      {statusLabel(status, dictionary, ui)}
    </PortalTag>
  );
}

/** An invoice's payment state, as the app shows it (see `invoicePaymentState`). */
export function PortalPaymentStatus({ document, installments = null, useServerOverdue = false, className }) {
  const ui = useUI();
  const state = invoicePaymentState(document, installments, { useServerOverdue });
  if (!state) return null;
  return (
    <PortalTag
      tone={state.tone}
      className={className}
      testId="portal-payment-status"
      data-state={state.id}
      data-testid="PortalTag__7a317e">
      {ui(state.labelKey)}
    </PortalTag>
  );
}

/** The badge a row shows: an invoice's payment state, any other document's status. */
export function PortalRowBadge({ document, className, useServerOverdue = false }) {
  return document?.kind === 'INVOICE'
    ? <PortalPaymentStatus
    document={document}
    className={className}
    useServerOverdue={useServerOverdue}
    data-testid="PortalPaymentStatus__7a317e" />
    : <PortalDocumentStatus
    status={document?.documentStatus}
    className={className}
    data-testid="PortalDocumentStatus__7a317e" />;
}

/** The due date with the app's four-state dot (paid / overdue / soon / ok). */
export function PortalDueDate({ document }) {
  if (!document?.dueDate) return <span>—</span>;
  const state = getDueDateState(document.dueDate, document.outstandingAmount);
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="portal-due-date" data-state={state}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={getDueDateDotStyle(state)} />
      <PortalDate value={document.dueDate} data-testid="PortalDate__7a317e" />
    </span>
  );
}

/** A quotation's "Válido hasta", with the design's dot while it can still be answered. */
export function PortalValidUntil({ document }) {
  const validity = quotationValidity(document);
  if (!validity) return <span className="text-muted-foreground">—</span>;
  if (validity.state === 'answered') {
    return <span className="text-muted-foreground"><PortalDate value={document.validUntil} data-testid="PortalDate__7a317e" /></span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="portal-valid-until" data-state={validity.state}>
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', validity.state === 'expired' ? 'bg-destructive' : 'bg-foreground')}
      />
      <PortalDate value={document.validUntil} data-testid="PortalDate__7a317e" />
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

/**
 * The uppercase section titles ("REQUIERE TU ATENCIÓN", "TU SALDO", …). Set in the body font
 * (Inter, `index.css`) like the design's, by inheriting it instead of naming it: the app's global
 * `h1–h6` rule switches headings to Plus Jakarta Sans, whose word space at 12px uppercase collapses
 * visually and ran the words together ("REQUIERETUATENCIÓN"). Tailwind's `font-sans` is not mapped
 * to Inter in this app, so `inherit` is what reaches the body font.
 */
export const PORTAL_SECTION_TITLE = "[font-family:inherit] text-[13px] font-medium uppercase leading-[18px] tracking-normal [word-spacing:normal] md:text-xs md:leading-4";

/**
 * An invoice's document type, as the app's sales-invoice list shows it in its "Tipo de documento"
 * column. Mirrors the `transactionDocument` column's renderer of
 * `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx` (not imported: it lives in that window's
 * own code, and the portal must not depend on a window): a rectificative invoice gets the primary
 * pill labelled `rectificativeInvoicesTab`, any other invoice the info pill labelled
 * `invoicesTab`, same classes and same no-wrap. The app decides rectificative through
 * `getArSubtype` (`invoiceSubtype.js`), backed by the server's subtype; the portal's row carries
 * the server's own answer for the same rule, `isCreditNote` (`PortalDocumentKind#isCreditNote`:
 * the ARC / ARI_RM categories or the localization's rectificative flag).
 */
export function PortalInvoiceTypeBadge({ document, className }) {
  const ui = useUI();
  const cfg = document?.isCreditNote
    ? { color: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.1)', labelKey: 'rectificativeInvoicesTab' }
    : { color: 'var(--status-info-fg)', bg: 'var(--status-info-bg)', labelKey: 'invoicesTab' };
  return (
    <span
      className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={{ color: cfg.color, backgroundColor: cfg.bg, whiteSpace: 'nowrap' }}
      data-testid="portal-invoice-type"
      data-credit-note={document?.isCreditNote ? 'true' : 'false'}
    >
      {ui(cfg.labelKey)}
    </span>
  );
}

/**
 * The main screen's section titles on desktop (designer's spec of 2026-11-17): Space Mono 12/16,
 * the font the app already loads for `.font-mono` (`index.css`). Named here rather than through
 * `md:font-mono`, which Tailwind maps to its own monospace stack, not to Space Mono. Mobile keeps
 * {@link PORTAL_SECTION_TITLE}.
 */
export const PORTAL_DASHBOARD_SECTION_TITLE = `${PORTAL_SECTION_TITLE} md:[font-family:'Space_Mono',ui-monospace,monospace] md:font-normal md:text-foreground`;

/**
 * A section with the design's grey header band. `variant="dashboard"` is the main screen's
 * (spec of 2026-11-17): a 40px band with 8/12 padding and the Space Mono title, on desktop only;
 * the other views keep the default until their own spec arrives.
 */
export function PortalSection({ title, action, children, className = '', testId, variant }) {
  const dashboard = variant === 'dashboard';
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-lg border border-border bg-card md:rounded-lg ${className}`}
      data-testid={testId}
    >
      <div className={cn(
        'flex h-14 items-center justify-between border-b border-border bg-muted px-5',
        dashboard ? 'md:h-10 md:px-3 md:py-2' : 'md:h-12 md:px-3',
      )}>
        <h2 className={dashboard ? PORTAL_DASHBOARD_SECTION_TITLE : PORTAL_SECTION_TITLE}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The design's search pill (header of Inicio and the lists). `variant="header"` is the main
 * screen's top-bar pill (spec of 2026-11-17): white, 40px tall, on the page background.
 */
export function PortalSearchPill({
  value, onChange, placeholder, label, testId, className, children, variant,
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <label className={cn(
        'flex h-12 items-center gap-2.5 rounded-full bg-muted px-4 md:gap-2 md:px-3.5',
        variant === 'header' ? 'md:h-10 md:bg-card md:px-4' : 'md:h-9',
      )}>
        {/* The main screen's top-bar pill takes the design's Phosphor glyph (spec of 2026-11-17);
            the lists keep theirs until their own spec arrives. */}
        {variant === 'header' ? (
          <MagnifyingGlassIcon
            size={20}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
            data-testid="MagnifyingGlass__7a317e" />
        ) : (
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
            data-testid="Search__7a317e" />
        )}
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
export function PortalDesktopHeader({ title, count, breadcrumb, search, size }) {
  // `size="lg"`: the main screen's top bar (spec of 2026-11-17) — a 20/32 title and a 392px
  // search column. The other views keep the default until their own spec arrives.
  const large = size === 'lg';
  return (
    <header
      className={cn(
        'hidden items-center gap-4 px-1 pb-3 pt-1 md:grid',
        large
          ? 'grid-cols-[minmax(0,1fr)_minmax(0,392px)_minmax(0,1fr)]'
          : 'grid-cols-[minmax(0,1fr)_minmax(0,320px)_minmax(0,1fr)]',
      )}
      data-testid="portal-view-header"
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <h1
            className={cn('truncate font-semibold', large ? 'text-xl leading-8' : 'text-lg leading-7')}
            data-testid="portal-view-title"
          >
            {title}
          </h1>
          {count != null ? <PortalCountChip
            count={count}
            testId="portal-view-count"
            data-testid="PortalCountChip__7a317e" /> : null}
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
