import { CaretRightIcon } from '@phosphor-icons/react';
import { SearchBar } from '@/components/layout/SearchBar.jsx';
import { useLocale, useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { getStatusTone, statusLabel } from '@/lib/statusBadge.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { getDueDateDotStyle, getDueDateState } from '@/lib/invoiceDueDate.js';
import { invoicePaymentState, quotationValidity } from './portalPresentation.js';

/**
 * Where the top bar's "Creado con Etendo" pill sends the visitor: Etendo's pricing page.
 * PROVISIONAL: marketing will send the final pricing URL (with its UTM); replace it here only.
 */
export const ETENDO_PRICING_URL = 'https://etendo.ai';

/**
 * Etendo's mark as the Figma draws it on the "Creado con Etendo" link: a 32×32 lime (#B8FA50)
 * circle with the black glyph centred at 15.38×12.8. It reuses `/logo-etendo-ai.png`, a 160px lime
 * tile of the same #B8FA50 whose glyph spans 77×64 (the same 1.2 ratio): drawn at 32px, the glyph
 * lands at the Figma's size, and the circle clips the tile's corners with no seam.
 */
function EtendoMark() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#B8FA50]">
      <img src="/logo-etendo-ai.png" alt="" className="h-8 w-8 max-w-none" />
    </span>
  );
}

/**
 * The top bar's "Creado con Etendo / Conoce más" pill, with the Figma's exact values (2026-11-20):
 * 216×44, padding 4px, gap 8px, #1B1A1F, radius 200px; Etendo's 32px lime circle, a 128px text
 * block (12/16 500 white title, 11/16 60%-white subtitle) and a 32px 10%-white round arrow with a
 * 50%-white CaretRight. It opens the pricing page ({@link ETENDO_PRICING_URL}) in a new tab; the
 * arrow is part of the link, not a button.
 */
export function PortalCreatedWithPill({ className }) {
  const ui = useUI();
  return (
    <a
      href={ETENDO_PRICING_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ui('portalCreatedWithLinkLabel')}
      className={cn(
        'flex h-11 w-[216px] min-w-0 max-w-full items-center gap-2 rounded-[200px] bg-[#1B1A1F] p-1 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      data-testid="portal-created-with"
    >
      <EtendoMark data-testid="EtendoMark__7a317e" />
      <span className="flex w-[128px] min-w-0 shrink flex-col items-start justify-center pr-1">
        <span className="-my-[3px] max-w-full truncate text-xs font-medium leading-4 tracking-[-0.005em] text-white">
          {ui('portalCreatedWith')}
        </span>
        <span className="max-w-full truncate text-[11px] font-normal leading-4 tracking-[-0.005em] text-white/60">
          {ui('portalLearnMore')}
        </span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[360px] bg-white/10 text-white/50" aria-hidden="true">
        <CaretRightIcon size={20} data-testid="CaretRight__7a317e" />
      </span>
    </a>
  );
}

/**
 * The compact "Creado con Etendo" link: only Etendo's lime circle, same destination as the desktop
 * pill, named and titled by the same copy. Used on mobile top bars and, between md and lg, in the
 * desktop headers. PROVISIONAL placement (user decision, 2026-11-20) until the designer sends the
 * mobile design.
 */
export function PortalCreatedWithTile({ testId = 'portal-created-with-mobile' }) {
  const ui = useUI();
  const label = ui('portalCreatedWithLinkLabel');
  return (
    <a
      href={ETENDO_PRICING_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={testId}
    >
      <EtendoMark data-testid="EtendoMark__7a317e" />
    </a>
  );
}

/**
 * The Etendo link of a desktop header's right side: the exact-Figma pill from lg up (inside the
 * Figma's 224×44 wrapper, whose 8px right padding keeps it off the window's edge) and, between md
 * and lg, where the pill does not fit beside the search, the compact lime circle with the same
 * right spacing. Never both. The md–lg tile is PROVISIONAL until the mobile/medium design arrives.
 */
export function PortalCreatedWithHeaderLink() {
  return (
    <>
      <span className="flex shrink-0 pr-2 lg:hidden">
        <PortalCreatedWithTile testId="portal-created-with-compact" data-testid="PortalCreatedWithTile__7a317e" />
      </span>
      <div className="hidden h-11 w-[224px] min-w-0 max-w-full items-center pr-2 lg:flex">
        <PortalCreatedWithPill data-testid="PortalCreatedWithPill__7a317e" />
      </div>
    </>
  );
}

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

/**
 * The main screen's badge colours, as the designer's Figma gives them (spec of 2026-11-17; the
 * user asked for the main screen to match the Figma exactly, so these are its hex values rather
 * than the app's `--status-*` palette). Light theme only, like the spec. Used through
 * `palette="figma"`; every other portal view keeps {@link TAG_TONES}.
 */
const FIGMA_TAG_TONES = Object.freeze({
  info: 'bg-[#EBEFFF] text-[#2B48BC] border-[#B0BEFF]',
  success: 'bg-[#EEFBF4] text-[#17663A] border-[#B2EECC]',
  warning: 'bg-[#FFF9EB] text-[#8A6100] border-[#FFDA85]',
  caution: 'bg-[#FFF9EB] text-[#8A6100] border-[#FFDA85]',
  destructive: 'bg-[#FEF0F4] text-[#D50B3E] border-[#FBB1C4]',
  neutral: 'bg-[#F3F5F9] text-[#40465C] border-[#C7CBD3]',
});

/**
 * Where the Figma colours a status differently from the app's tone (the label stays the app's):
 * a quotation waiting for the customer (`UE`) is blue, an invoice still to pay is yellow.
 */
const FIGMA_STATUS_TONES = Object.freeze({ UE: 'info' });
const FIGMA_PAYMENT_TONES = Object.freeze({ pending: 'warning' });

/** The design's badge. `palette="figma"`: the main screen's Figma colours. */
export function PortalTag({
  tone = 'neutral', palette, children, className, testId, ...rest
}) {
  const tones = palette === 'figma' ? FIGMA_TAG_TONES : TAG_TONES;
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-lg border px-2.5 py-0.5 text-xs font-medium leading-4',
        tones[tone] ?? tones.neutral,
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
export function PortalDocumentStatus({ status, className, palette }) {
  const ui = useUI();
  const dictionary = useLocale();
  if (!status) return null;
  const tone = (palette === 'figma' && FIGMA_STATUS_TONES[status]) || getStatusTone(status);
  return (
    <PortalTag
      tone={tone}
      palette={palette}
      className={className}
      testId="portal-document-status"
      data-status={status}
      data-testid="PortalTag__7a317e">
      {statusLabel(status, dictionary, ui)}
    </PortalTag>
  );
}

/** An invoice's payment state, as the app shows it (see `invoicePaymentState`). */
export function PortalPaymentStatus({
  document, installments = null, useServerOverdue = false, className, palette,
}) {
  const ui = useUI();
  const state = invoicePaymentState(document, installments, { useServerOverdue });
  if (!state) return null;
  const tone = (palette === 'figma' && FIGMA_PAYMENT_TONES[state.id]) || state.tone;
  return (
    <PortalTag
      tone={tone}
      palette={palette}
      className={className}
      testId="portal-payment-status"
      data-state={state.id}
      data-testid="PortalTag__7a317e">
      {ui(state.labelKey)}
    </PortalTag>
  );
}

/** The badge a row shows: an invoice's payment state, any other document's status. */
export function PortalRowBadge({ document, className, useServerOverdue = false, palette }) {
  return document?.kind === 'INVOICE'
    ? <PortalPaymentStatus
    document={document}
    className={className}
    useServerOverdue={useServerOverdue}
    palette={palette}
    data-testid="PortalPaymentStatus__7a317e" />
    : <PortalDocumentStatus
    status={document?.documentStatus}
    className={className}
    palette={palette}
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

/** The Figma's shadow-xs, for the screens aligned with the designer's spec. */
export const PORTAL_FIGMA_SHADOW = 'shadow-[0_1px_2px_rgba(27,26,31,0.05)]';

/** The Figma's 32px primary button (padding 4px 8px, #325CFF, r8, Inter 500 14/24 white). */
export const PORTAL_FIGMA_BUTTON_PRIMARY = 'inline-flex h-8 items-center rounded-lg bg-[#325CFF] px-2 py-1 text-sm font-medium leading-6 text-white transition-colors hover:bg-[#2849CC] disabled:pointer-events-none disabled:opacity-50';

/** The Figma's 32px secondary button (white, 1px #C7CBD3, shadow-xs, r8, Inter 500 14/24). */
export const PORTAL_FIGMA_BUTTON_SECONDARY = `inline-flex h-8 items-center rounded-lg border border-[#C7CBD3] bg-white px-2 py-1 text-sm font-medium leading-6 text-[#1B1A1F] transition-colors hover:bg-[#F3F5F9] disabled:pointer-events-none disabled:opacity-50 ${PORTAL_FIGMA_SHADOW}`;

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
 * The portal's search box: the app's own search bar (`components/layout/SearchBar.jsx`, the top
 * bar's pill, no microphone; PO answer, ETP-6209) around the portal's own search — the caller keeps
 * its data source (`searchPortalDocuments` on Inicio, the list's own query) and passes its results
 * panel as `children`, so the customer only ever sees their documents. Full width of its container.
 */
export function PortalSearchPill({
  value, onChange, placeholder, label, testId, className, children,
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <SearchBar
        className="w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ariaLabel={label ?? placeholder}
        inputTestId={testId}
        data-testid="SearchBar__7a317e" />
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
        'hidden items-center gap-4 px-1 md:grid',
        // The main screen's 62px top bar sits closer to the window's top edge.
        large ? '-mt-0.5 pb-2' : 'pb-3 pt-1',
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
          {count != null && large ? (
            // The Figma's count badge (PC Presupuestos): #F3F5F9, r8, 4px 8px, 12/16 #40465C.
            <span
              className="rounded-lg border border-[#C7CBD3] bg-[#F3F5F9] px-2 py-1 text-xs leading-4 tracking-[-0.005em] text-[#40465C]"
              data-testid="portal-view-count"
            >
              {count}
            </span>
          ) : null}
          {count != null && !large ? <PortalCountChip
            count={count}
            testId="portal-view-count"
            data-testid="PortalCountChip__7a317e" /> : null}
        </div>
        <span
          className={cn('truncate text-xs leading-4', large ? 'tracking-[-0.005em] text-[#81848F]' : 'text-muted-foreground')}
          data-testid="portal-breadcrumb"
        >
          {breadcrumb}
        </span>
      </div>
      {search ?? <div />}
      {/* Right column: the Etendo link (the pill from lg up, the compact circle md–lg). */}
      <div className="flex min-w-0 items-center justify-end">
        <PortalCreatedWithHeaderLink data-testid="PortalCreatedWithHeaderLink__7a317e" />
      </div>
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
