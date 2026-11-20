import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretRightIcon,
  ChartBarHorizontalIcon,
  ChartBarIcon,
  CheckIcon,
  FileTextIcon,
  SmileyIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

// The design's own Phosphor icons (spec of 2026-11-17), with the library's `*Icon` names like the
// rest of the app (`pages/first-steps/firstStepsIcons.js`). Phosphor sizes by its `size` prop.

import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import { niceScale } from '@/lib/dashboardNumberFormat.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import {
  PORTAL_CHART_MONTHS, PORTAL_ERROR, searchPortalDocuments,
} from '@/lib/portal/portalApi.js';
import { PORTAL_KIND_ICONS, PortalMobileBrandBar } from './PortalShell.jsx';
import {
  PortalDate, PortalDesktopHeader, PortalMain, PortalMoney, PortalRowBadge, PortalSearchPill,
  PortalSection, PortalTag, PORTAL_DASHBOARD_SECTION_TITLE, PORTAL_ROW_FOCUS, usePortalLocale,
} from './PortalBits.jsx';
import { PORTAL_HIGHLIGHTS, PORTAL_KIND_META, documentLabelKey } from './portalPresentation.js';

const SEARCH_DEBOUNCE_MS = 300;

/** The tiles' order in the design (Main / Movil-Inicio): what most often needs the customer first. */
const TILE_ORDER = Object.freeze(['QUOTATION', 'INVOICE', 'ORDER', 'SHIPMENT']);

/**
 * "Inicio" (design Main / Movil-Inicio; desktop aligned with the designer's spec of 2026-11-17),
 * every figure from `GET /sws/portal/home`, aggregated server-side.
 *
 * Desktop: the top bar ("Portal del cliente" and the search across every kind); the greeting and
 * the period button (which drives the "Facturado por mes" chart); "Requiere tu atención" (one tile
 * per kind) beside "Tu saldo" (paid this year, then pending payment); "Documentos recientes"
 * beside the chart, which switches between vertical and horizontal bars.
 * Mobile: the brand bar, the greeting, the dark "Pendiente de pago" card, the tiles and the recent
 * documents, as the mobile board draws it.
 */
export default function PortalHomeView({
  apiFetch, token, identity, logoUrl, home, months, onMonthsChange, onNavigate, onInvalid,
}) {
  const ui = useUI();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const search = usePortalSearch(apiFetch, token, onInvalid);
  const balances = home?.balances ?? [];
  const tiles = home?.tiles ?? {};
  const recent = home?.recent ?? [];
  const open = (document) => onNavigate({ view: 'doc', kind: document.kind, id: document.id });
  // "Ver todos" opens the list of the newest document's kind: the recent list mixes every kind,
  // and that is the list it most likely continues.
  const viewAll = () => onNavigate({ view: 'list', kind: recent[0]?.kind ?? 'INVOICE' });

  const searchBox = (
    <PortalSearchPill
      value={search.input}
      onChange={search.setInput}
      placeholder={ui('portalSearchAllPlaceholder')}
      label={ui('portalSearch')}
      testId="portal-global-search"
      data-testid="PortalSearchPill__beaeb4">
      <SearchResults search={search} onOpen={open} data-testid="SearchResults__beaeb4" />
    </PortalSearchPill>
  );

  return (
    <>
      <PortalMobileBrandBar
        identity={identity}
        logoUrl={logoUrl}
        onSearch={() => setMobileSearchOpen((value) => !value)}
        data-testid="PortalMobileBrandBar__beaeb4" />
      <PortalDesktopHeader
        title={ui('portalPageTitle')}
        breadcrumb={ui('portalPageTitle')}
        search={searchBox}
        size="lg"
        data-testid="PortalDesktopHeader__beaeb4" />

      <PortalMain
        className="overflow-y-auto px-6 pb-28 pt-6 md:gap-4 md:rounded-xl md:p-2"
        testId="portal-home"
        data-testid="PortalMain__beaeb4">
        {mobileSearchOpen ? <div className="md:hidden">{searchBox}</div> : null}

        <Greeting
          identity={identity}
          months={months}
          onMonthsChange={onMonthsChange}
          data-testid="Greeting__beaeb4" />

        <MobilePendingHero
          balances={balances}
          onNavigate={onNavigate}
          data-testid="MobilePendingHero__beaeb4" />

        {/* Desktop, from both Figma frames: at the 1440px design width the four tiles are 205px
            and "Requiere tu atención" hugs them (901px), "Tu saldo" takes the rest — 259px with the
            rail expanded, 443px collapsed. Other widths keep that rail state's proportion (901 :
            259 or 901 : 443), so the tiles grow or shrink with the window and "Tu saldo" never
            balloons; "Tu saldo" never goes under 258px. The four tiles share their card equally. A
            row is at least 226px tall and grows when real content needs it (both cards keep the
            same height: grid items stretch); it never stretches to the window; the body scrolls. */}
        <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-[minmax(0,901fr)_minmax(258px,259fr)] md:items-stretch md:gap-4 md:group-data-[rail=collapsed]/shell:grid-cols-[minmax(0,901fr)_minmax(258px,443fr)]">
          <section
            className="min-w-0 flex-[2_1_560px] overflow-hidden md:flex md:min-h-[226px] md:flex-col md:rounded-lg md:border md:border-border"
            aria-label={ui('portalAttentionTitle')}
            data-testid="portal-tiles"
          >
            <div className="hidden h-10 items-center border-b border-border bg-muted px-3 py-2 md:flex">
              <h2 className={PORTAL_DASHBOARD_SECTION_TITLE}>{ui('portalAttentionTitle')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-h-0 md:flex-1 md:grid-cols-4 md:gap-4 md:p-4">
              {TILE_ORDER.map((kind) => (
                <KindTile
                  key={kind}
                  kind={kind}
                  tile={tiles[kind]}
                  onNavigate={onNavigate}
                  data-testid="KindTile__beaeb4" />
              ))}
            </div>
          </section>

          <PortalSection
            title={ui('portalBalanceTitle')}
            className="hidden flex-[1_1_280px] md:block md:min-h-[226px]"
            testId="portal-balance"
            variant="dashboard"
            data-testid="PortalSection__beaeb4">
            <Balance
              balances={balances}
              paid={home?.paidThisYear ?? []}
              data-testid="Balance__beaeb4" />
          </PortalSection>
        </div>

        {/* A row at least 320px tall (it grows with its content): "Documentos recientes" and the chart keep the design's 520 : 840 at every
            width (the Figma's 520px card beside a growing chart, as a ratio so neither empties),
            the documents never under the 440px their widest row needs on one line. */}
        <div className="grid gap-3 md:grid-cols-[minmax(440px,520fr)_minmax(0,824fr)] md:gap-4">
          <PortalSection
            title={ui('portalRecentDocuments')}
            action={(
              <>
                {/* Mobile keeps its "Ver todos" link; desktop has the spec's round arrow button. */}
                <button
                  type="button"
                  onClick={viewAll}
                  className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary md:hidden"
                  data-testid="portal-recent-view-all-mobile"
                >
                  {ui('portalViewAll')}
                </button>
                <button
                  type="button"
                  onClick={viewAll}
                  aria-label={ui('portalViewAll')}
                  title={ui('portalViewAll')}
                  className="hidden h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground md:flex"
                  data-testid="portal-recent-view-all"
                >
                  <ArrowUpRightIcon size={16} aria-hidden="true" data-testid="ArrowUpRight__beaeb4" />
                </button>
              </>
            )}
            className="rounded-xl md:flex md:min-h-[320px] md:flex-col"
            testId="portal-recent"
            variant="dashboard"
            data-testid="PortalSection__beaeb4">
            <RecentDocuments recent={recent} onOpen={open} data-testid="RecentDocuments__beaeb4" />
          </PortalSection>

          <PortalSection
            title={ui('portalInvoicedPerMonth')}
            className="hidden md:flex md:min-h-[320px] md:flex-col"
            testId="portal-chart"
            variant="dashboard"
            data-testid="PortalSection__beaeb4">
            <InvoicedChart
              chart={home?.chart}
              year={home?.invoicesThisYear}
              data-testid="InvoicedChart__beaeb4" />
          </PortalSection>
        </div>
      </PortalMain>
    </>
  );
}

/** The header search across every kind, debounced; 401 ends on the page's re-check. */
function usePortalSearch(apiFetch, token, onInvalid) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    const query = input.trim();
    if (!query) {
      setResults(null);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchPortalDocuments(apiFetch, token, query).then((documents) => {
        if (active) setResults(documents);
      }).catch((error) => {
        if (!active) return;
        if (error?.code === PORTAL_ERROR.invalidLink) onInvalid();
        else setResults([]);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [apiFetch, token, input, onInvalid]);

  return { input, setInput, results };
}

function SearchResults({ search, onOpen }) {
  const ui = useUI();
  if (search.results == null) return null;
  return (
    <div
      className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
      data-testid="portal-search-results"
    >
      {search.results.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">{ui('portalSearchNoResults')}</p>
      ) : search.results.map((document) => (
        <button
          key={`${document.kind}:${document.id}`}
          type="button"
          onClick={() => onOpen(document)}
          className={`flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-muted ${PORTAL_ROW_FOCUS}`}
          data-testid="portal-search-result"
        >
          <span className="min-w-0 flex-1 truncate">
            {ui(documentLabelKey(document))} <span className="text-muted-foreground">{document.documentNo}</span>
          </span>
          <PortalRowBadge document={document} data-testid="PortalRowBadge__beaeb4" />
        </button>
      ))}
    </div>
  );
}

/** "Hola, …" and the headline, with the period button on desktop. */
function Greeting({ identity, months, onMonthsChange }) {
  const ui = useUI();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground md:flex">
          <SmileyIcon size={20} aria-hidden="true" data-testid="Smiley__beaeb4" />
        </div>
        <div className="flex min-w-0 flex-col gap-1 md:gap-0">
          {identity?.businessPartnerName ? (
            <span className="text-sm text-muted-foreground md:text-xs md:leading-4 md:text-foreground" data-testid="portal-greeting">
              {ui('portalGreeting', { name: identity.businessPartnerName })}
            </span>
          ) : null}
          <h2 className="text-[28px] font-bold leading-9 tracking-[-0.01em] md:hidden">
            {ui('portalHomeHeadlineGeneric')}
          </h2>
          <h2 className="hidden text-lg font-semibold leading-6 md:block" data-testid="portal-headline">
            {identity?.tenantName
              ? ui('portalHomeHeadline', { tenantName: identity.tenantName })
              : ui('portalHomeHeadlineGeneric')}
          </h2>
        </div>
      </div>
      <DropdownMenu data-testid="DropdownMenu__beaeb4">
        <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__beaeb4">
          <button
            type="button"
            className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium md:inline-flex"
            data-testid="portal-period"
          >
            <CalendarBlankIcon size={20} aria-hidden="true" data-testid="CalendarBlank__beaeb4" />
            {ui('portalPeriodMonths', { count: months })}
            <CaretDownIcon size={16} aria-hidden="true" data-testid="CaretDown__beaeb4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="DropdownMenuContent__beaeb4">
          {PORTAL_CHART_MONTHS.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => onMonthsChange(option)}
              data-testid={`portal-period-${option}`}
            >
              {ui('portalPeriodMonths', { count: option })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Mobile only: the design's dark "Pendiente de pago" card, one per currency owed. */
function MobilePendingHero({ balances, onNavigate }) {
  const ui = useUI();
  const bcpLocale = usePortalLocale();
  const viewPending = () => onNavigate({ view: 'list', kind: 'INVOICE', group: 'pending' });
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl bg-foreground p-6 text-background md:hidden"
      data-testid="portal-pending-hero"
    >
      {balances.length === 0 ? (
        <span className="text-sm opacity-80">{ui('portalNothingPending')}</span>
      ) : balances.map((balance) => (
        <div key={balance.currency || 'none'} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm opacity-80">{ui('portalPendingPayment')}</span>
            <span className="rounded-lg bg-[hsl(var(--accent-highlight))] px-2.5 py-0.5 text-[13px] font-medium leading-[18px] text-[hsl(var(--accent-highlight-foreground))]">
              {ui(balance.pendingCount === 1 ? 'portalInvoicesCount_one' : 'portalInvoicesCount_plural',
                { count: balance.pendingCount })}
            </span>
          </div>
          {/* The card's key figure, set in the app's heading face by the global h1–h6 rule. */}
          <h3 className="text-[44px] font-bold leading-[52px] tabular-nums">
            {formatCurrency(balance.currency, balance.outstanding)}
          </h3>
          {balance.overdue > 0 ? (
            <span className="text-sm text-[var(--status-destructive-bg)]">
              {ui('portalOverdueSince', {
                amount: formatCurrency(balance.currency, balance.overdue),
                date: formatCalendarDate(balance.overdueSince, bcpLocale),
              })}
            </span>
          ) : null}
        </div>
      ))}
      {balances.length > 0 ? (
        <button
          type="button"
          onClick={viewPending}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[10px] bg-primary font-medium text-primary-foreground"
          data-testid="portal-view-pending-invoices"
        >
          {ui('portalViewPendingInvoices')}
          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" data-testid="ArrowRight__beaeb4" />
        </button>
      ) : null}
    </section>
  );
}

/**
 * "Tu saldo" (desktop, spec of 2026-11-17): "Pagado este año", then a divider, then "Pendiente de
 * pago" — each with its count pill (a document icon on the muted surface) and one amount badge
 * per currency, green for paid and red for pending. The overdue detail ("… vencidos desde …")
 * belongs to the mobile card only, as on the Movil-Inicio board.
 */
function Balance({ balances, paid }) {
  const ui = useUI();
  // One badge per currency; several sit side by side and wrap (never stacked into a clipped column).
  const badge = 'whitespace-nowrap rounded-lg border px-2 text-sm leading-7 tabular-nums';
  const countPill = (count, testId) => (
    <span
      className="inline-flex items-center gap-1 rounded-lg bg-[#F3F5F9] px-2 py-1 text-xs leading-4 text-[#40465C]"
      data-testid={testId}
    >
      <FileTextIcon size={14} aria-hidden="true" data-testid="FileText__beaeb4" />
      {count}
    </span>
  );
  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-col gap-2" data-testid="portal-balance-paid">
        <span className="flex items-center gap-2 text-sm text-foreground">
          {ui('portalPaidThisYear')}
          {countPill(paid.reduce((sum, entry) => sum + entry.count, 0), 'portal-balance-paid-count')}
        </span>
        <span className="flex flex-wrap gap-2">
        {paid.length === 0 ? (
          <span className={`${badge} border-border text-muted-foreground`}>—</span>
        ) : paid.map((entry) => (
          <span
            key={entry.currency || 'none'}
            className={`${badge} border-[#B2EECC] bg-[#EEFBF4] text-[#17663A]`}
            data-testid="portal-balance-paid-amount"
          >
            {formatCurrency(entry.currency, entry.paid)}
          </span>
        ))}
        </span>
      </div>
      <div className="h-px bg-border" />
      <div className="flex flex-col gap-2" data-testid="portal-balance-pending">
        <span className="flex items-center gap-2 text-sm text-foreground">
          {ui('portalPendingPayment')}
          {countPill(balances.reduce((sum, balance) => sum + balance.pendingCount, 0), 'portal-balance-pending-count')}
        </span>
        <span className="flex flex-wrap gap-2">
        {balances.length === 0 ? (
          <span className={`${badge} border-border text-muted-foreground`} data-testid="portal-balance-empty">—</span>
        ) : balances.map((balance) => (
          <span
            key={balance.currency || 'none'}
            className={`${badge} border-[#FBB1C4] bg-[#FEF0F4] text-[#D50B3E]`}
            data-testid="portal-balance-outstanding"
          >
            {formatCurrency(balance.currency, balance.outstanding)}
          </span>
        ))}
        </span>
      </div>
    </div>
  );
}

/** The tile figure's desktop size by its number of digits (the design's 60px up to three). */
const TILE_FIGURE_SIZES = Object.freeze({ 4: 'md:text-[44px]', 5: 'md:text-[34px]' });

/**
 * One kind's tile: the figure the kind calls out (or its total), and that figure's badge. Desktop
 * follows the spec of 2026-11-17 (154px tall, a 24px icon bubble beside the label, a 60px figure
 * in the heading face, a pill badge); mobile keeps the Movil-Inicio tile.
 */
function KindTile({ kind, tile, onNavigate }) {
  const ui = useUI();
  const Icon = PORTAL_KIND_ICONS[kind];
  const highlight = tile?.highlight ? PORTAL_HIGHLIGHTS[tile.highlight.code] : null;
  const shown = Boolean(highlight) && tile.highlight.count > 0;
  const target = shown && highlight.group
    ? { view: 'list', kind, group: highlight.group } : { view: 'list', kind };
  const figure = shown ? tile.highlight.count : (tile?.count ?? 0);
  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      className={`flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-[18px] text-left hover:border-primary md:h-full md:min-h-0 md:justify-between md:gap-0 md:rounded-lg md:p-3 md:shadow-sm ${PORTAL_ROW_FOCUS}`}
      data-testid={`portal-tile-${kind.toLowerCase()}`}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground md:text-xs">
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted md:flex">
          <Icon size={16} aria-hidden="true" data-testid="Icon__beaeb4" />
        </span>
        {ui(PORTAL_KIND_META[kind].pluralKey)}
      </span>
      <span
        // Proportional figures: Plus Jakarta's tabular "1" carries a base bar the design's does not.
        // The design's 60px fits three digits in the narrowest tile (1280px, rail expanded); a
        // longer figure steps down so it never overflows its tile.
        className={cn(
          "text-[44px] font-medium leading-[48px] md:leading-[60px] md:[font-family:'Plus_Jakarta_Sans','Inter',sans-serif]",
          TILE_FIGURE_SIZES[Math.min(String(figure).length, 5)] ?? 'md:text-[60px]',
        )}
        data-testid="portal-tile-count"
      >
        {figure}
      </span>
      {shown ? (
        <PortalTag
          tone={highlight.tone}
          palette="figma"
          className="max-w-full self-start whitespace-normal font-normal md:rounded-full"
          data-testid="PortalTag__beaeb4">{ui(highlight.labelKey)}</PortalTag>
      ) : (
        <span className="text-xs text-muted-foreground">{ui('portalTileTotal')}</span>
      )}
    </button>
  );
}

/** The newest documents: desktop rows of chips, mobile two-line rows (design Main / Movil-Inicio). */
function RecentDocuments({ recent, onOpen }) {
  const ui = useUI();
  if (recent.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{ui('portalNoDocumentsYet')}</p>;
  }
  return (
    <ul className="md:py-1">
      {recent.map((document) => (
        <li key={`${document.kind}:${document.id}`} className="border-b border-border last:border-b-0 md:border-b-0">
          {/* Desktop (spec of 2026-11-17): the kind, then its pills packed after it — the number
              (document icon, muted surface), the status as the app labels it, and the amount (a
              shipment has none, so no pill) — and the caret at the far right. */}
          <button
            type="button"
            onClick={() => onOpen(document)}
            className={`hidden min-h-10 w-full cursor-pointer items-center gap-2 px-4 py-1 text-left hover:bg-muted md:flex ${PORTAL_ROW_FOCUS}`}
            data-testid="portal-recent-document"
          >
            <span className="shrink-0 text-sm">{ui(documentLabelKey(document))}</span>
            {/* One line at the design's widths; wraps rather than clips when a row cannot fit. */}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="inline-flex min-w-0 max-w-[10rem] shrink-0 items-center gap-1 rounded-lg bg-[#F3F5F9] px-2 py-1 text-xs leading-4 text-[#40465C]"
                title={document.documentNo}
              >
                <FileTextIcon size={14} className="shrink-0" aria-hidden="true" data-testid="FileText__beaeb4" />
                <span className="truncate">{document.documentNo}</span>
              </span>
              <PortalRowBadge
                document={document}
                useServerOverdue
                palette="figma"
                // The recent rows' status pills are borderless in the design (the tiles' are not).
                className="rounded-full border-transparent py-1 font-normal"
                data-testid="PortalRowBadge__beaeb4" />
              {document.grandTotal != null ? (
                <span className="rounded-full border border-[#C7CBD3] px-2 py-1 text-xs leading-4 text-[#6B7280] tabular-nums">
                  <PortalMoney
                    currency={document.currency}
                    value={document.grandTotal}
                    data-testid="PortalMoney__beaeb4" />
                </span>
              ) : null}
            </span>
            <CaretRightIcon size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" data-testid="CaretRight__beaeb4" />
          </button>
          <button
            type="button"
            onClick={() => onOpen(document)}
            className={`flex w-full cursor-pointer items-center gap-3.5 px-[18px] py-4 text-left md:hidden ${PORTAL_ROW_FOCUS}`}
            data-testid="portal-recent-document-mobile"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{ui(documentLabelKey(document))} {document.documentNo}</span>
              <span className="text-sm text-muted-foreground">
                {document.kind === 'INVOICE' && document.dueDate
                  ? <>{ui('portalDueOnPrefix')} <PortalDate value={document.dueDate} data-testid="PortalDate__beaeb4" /></>
                  : <PortalDate value={document.date} data-testid="PortalDate__beaeb4" />}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <PortalMoney
                currency={document.currency}
                value={document.grandTotal}
                className="font-semibold tabular-nums"
                data-testid="PortalMoney__beaeb4" />
              <PortalRowBadge document={document} useServerOverdue data-testid="PortalRowBadge__beaeb4" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The design's sparse dotted gridlines: a 2px dot every 16px, in its border grey. */
const GRID_DOT = 'radial-gradient(circle, #C7CBD3 1px, transparent 1.2px)';
const GRID_DOTS_HORIZONTAL = Object.freeze({ backgroundImage: GRID_DOT, backgroundSize: '16px 2px', backgroundRepeat: 'repeat-x' });
const GRID_DOTS_VERTICAL = Object.freeze({ backgroundImage: GRID_DOT, backgroundSize: '2px 16px', backgroundRepeat: 'repeat-y' });

/** The chart's two orientations (spec of 2026-11-17: a two-button switch in the chart's header). */
export const PORTAL_CHART_ORIENTATIONS = Object.freeze(['vertical', 'horizontal']);

/**
 * The vertical chart's column gap, as a share of the plot width: the Figma draws 6 bars of
 * ~79.33px with 56px gaps in a 756px plot, and every period keeps that bar:gap proportion.
 */
const FIGMA_BAR_PX = 756 / 6 - 56 * 5 / 6;
const FIGMA_GAP_PX = 56;
function chartColumnGap(count) {
  const n = Math.max(count, 1);
  const share = FIGMA_GAP_PX / (n * FIGMA_BAR_PX + (n - 1) * FIGMA_GAP_PX);
  return `${(share * 100).toFixed(4)}%`;
}

/**
 * The chart's series. One: what the customer was invoiced per month, named "Gastos" (PO answer:
 * for the customer, what they were invoiced is their expense). Kept as a list so a series can be
 * added without reshaping the chart; every series reads its own amount from a bar. The legend
 * swatch is the bars' green (user decision: the Figma's red "Gastos" swatch was an artefact of the
 * generic chart).
 */
const CHART_SERIES = Object.freeze([
  {
    key: 'invoiced',
    labelKey: 'expenses',
    amountOf: (bar) => bar.amount,
    swatch: 'bg-[hsl(var(--status-done-badge))]',
    // The spec's gradient (#26A95F → #EEFBF4), from the app's success tokens.
    vertical: 'bg-gradient-to-t from-[var(--status-success-bg)] to-[hsl(var(--status-done-badge))]',
    horizontal: 'bg-gradient-to-r from-[var(--status-success-bg)] to-[hsl(var(--status-done-badge))]',
  },
]);

/**
 * "Facturado por mes" (spec of 2026-11-17): one bar per month of the chosen period, in the most
 * used currency. The header row says how many of the year's invoices are up to date, names the
 * series and switches between vertical and horizontal bars; dotted gridlines at round ticks (the
 * app's dashboard helpers, as before), a dark tooltip with the month and the amount on hover or
 * keyboard focus. Drawn with the same plain HTML as before, like the app's other bespoke charts.
 */
function InvoicedChart({ chart, year }) {
  const ui = useUI();
  const bcpLocale = usePortalLocale();
  const [orientation, setOrientation] = useState('vertical');
  const [active, setActive] = useState(null);
  const bars = chart?.bars ?? [];
  const max = Math.max(0, ...bars.flatMap((bar) => CHART_SERIES.map((series) => series.amountOf(bar))));
  // Round ticks (0 / 500 / 1K / 1,5K), with the app's dashboard helpers: the axis tops at the
  // nice maximum, not at the largest bar.
  const { niceMax: top, ticks } = niceScale(max);
  const share = (amount) => `${top > 0 ? (amount / top) * 100 : 0}%`;
  // The design's month labels: three letters, capitalised ("Jul", "Ago", "Sep" — not "sept.").
  const monthShort = (bar) => {
    const short = formatCalendarDate(`${bar.month}-01`, bcpLocale, { month: 'short' }).replace(/\./g, '').slice(0, 3);
    return short.charAt(0).toLocaleUpperCase(bcpLocale) + short.slice(1);
  };
  const monthLong = (bar) => formatCalendarDate(`${bar.month}-01`, bcpLocale, { month: 'long', year: 'numeric' });
  // A chart with no currency (no invoices yet) shows plain grouped figures.
  const amountText = (amount) => (chart?.currency
    ? formatCurrency(chart.currency, amount)
    : formatGroupedNumber(amount, { maximumFractionDigits: 2 }));
  // The design's ticks ("0", "500", "1K", "1,5K"), with the instance's decimal separator.
  const tick = (value) => (value >= 1000
    ? `${formatGroupedNumber(value / 1000, { maximumFractionDigits: 1 })}K`
    : formatGroupedNumber(value));
  const vertical = orientation === 'vertical';

  /** One bar of one series, with its tooltip while hovered or focused. */
  const barOf = (bar, series) => {
    const id = `${bar.month}:${series.key}`;
    const amount = series.amountOf(bar);
    const label = `${monthLong(bar)}: ${amountText(amount)}`;
    return (
      <span
        key={series.key}
        role="img"
        tabIndex={0}
        aria-label={label}
        onMouseEnter={() => setActive(id)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(id)}
        onBlur={() => setActive(null)}
        className={cn(
          'relative block outline-none focus-visible:ring-2 focus-visible:ring-ring',
          vertical ? `w-full rounded-t ${series.vertical}` : `h-full rounded-r ${series.horizontal}`,
        )}
        style={vertical ? { height: share(amount) } : { width: share(amount) }}
        data-testid="portal-chart-bar"
      >
        {active === id ? (
          <span
            role="tooltip"
            className={cn(
              'pointer-events-none absolute z-10 flex flex-col whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg',
              vertical ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2' : 'left-full top-1/2 ml-1.5 -translate-y-1/2',
            )}
            data-testid="portal-chart-tooltip"
          >
            <span className="opacity-70">{monthLong(bar)}</span>
            <span className="font-semibold tabular-nums">{amountText(amount)}</span>
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3" data-testid="portal-chart-body" data-orientation={orientation}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {year?.total > 0 ? (
            <span className="flex items-center gap-2 text-xs text-[var(--status-success-fg)]" data-testid="portal-up-to-date">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--status-success-bg)]">
                <CheckIcon size={12} aria-hidden="true" data-testid="Check__beaeb4" />
              </span>
              {ui('portalUpToDate', { upToDate: year.upToDate, total: year.total })}
            </span>
          ) : null}
          <span className="flex items-center gap-4" data-testid="portal-chart-legend">
            {CHART_SERIES.map((series) => (
              <span key={series.key} className="flex items-center gap-1.5 text-xs text-foreground">
                <span className={cn('h-1 w-3.5 rounded-sm', series.swatch)} aria-hidden="true" />
                {ui(series.labelKey)}
              </span>
            ))}
          </span>
        </div>
        <div className="flex h-10 items-center gap-1 rounded-xl bg-muted p-1" role="group" aria-label={ui('portalChartOrientation')}>
          {[['vertical', ChartBarIcon, 'portalChartVertical'], ['horizontal', ChartBarHorizontalIcon, 'portalChartHorizontal']].map(([value, Icon, labelKey]) => (
            <button
              key={value}
              type="button"
              aria-pressed={orientation === value}
              aria-label={ui(labelKey)}
              title={ui(labelKey)}
              onClick={() => setOrientation(value)}
              className={cn(
                'flex h-8 w-[42px] items-center justify-center rounded-lg text-muted-foreground',
                orientation === value ? 'bg-card text-foreground shadow-sm' : '',
              )}
              data-testid={`portal-chart-orientation-${value}`}
            >
              <Icon size={20} aria-hidden="true" data-testid="Icon__beaeb4" />
            </button>
          ))}
        </div>
      </div>

      {vertical ? (
        // The plot fills what the 320px card leaves below the header row.
        <div className="grid min-h-0 flex-1 grid-cols-[36px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-2 gap-y-2">
          <div className="relative h-full min-h-[80px] text-right text-xs text-[#6C6C89]">
            {ticks.map((value) => (
              <span key={value} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: share(value) }}>
                {tick(value)}
              </span>
            ))}
          </div>
          <div className="relative h-full min-h-[80px] border-x border-b border-[#C7CBD3]">
            {ticks.filter((value) => value > 0).map((value) => (
              <span
                key={value}
                className="absolute inset-x-0 h-0.5 translate-y-1/2"
                style={{ bottom: share(value), ...GRID_DOTS_HORIZONTAL }}
                aria-hidden="true"
              />
            ))}
            <div
              className="relative grid h-full items-end px-2.5"
              style={{
                gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))`,
                columnGap: chartColumnGap(bars.length),
              }}
              data-testid="portal-chart-bars"
            >
              {bars.map((bar) => (
                <div key={bar.month} className="flex h-full items-end justify-center gap-1">
                  {CHART_SERIES.map((series) => barOf(bar, series))}
                </div>
              ))}
            </div>
          </div>
          <span />
          <div
            className="grid px-2.5 text-center text-xs text-[#6C6C89]"
            style={{
              gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))`,
              columnGap: chartColumnGap(bars.length),
            }}
          >
            {/* Short month names without the trailing dot; with more than 6 bars every other label
                is shown, so none is ever cut. */}
            {bars.map((bar, index) => (
              <span key={bar.month} className="whitespace-nowrap" data-testid="portal-chart-label">
                {bars.length > 6 && index % 2 === 1 ? '' : monthShort(bar)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[40px_minmax(0,1fr)] content-start gap-x-2 gap-y-1.5 overflow-y-auto">
          <div className="flex flex-col gap-1.5 text-right text-xs text-muted-foreground">
            {bars.map((bar) => (
              <span key={bar.month} className="flex h-5 items-center justify-end whitespace-nowrap" data-testid="portal-chart-label">
                {monthShort(bar)}
              </span>
            ))}
          </div>
          <div className="relative mr-16 border-b border-l border-[#C7CBD3]">
            {ticks.filter((value) => value > 0).map((value) => (
              <span
                key={value}
                className="absolute inset-y-0 w-0.5 -translate-x-1/2"
                style={{ left: share(value), ...GRID_DOTS_VERTICAL }}
                aria-hidden="true"
              />
            ))}
            <div className="relative flex flex-col gap-1.5" data-testid="portal-chart-bars">
              {bars.map((bar) => (
                <div key={bar.month} className="flex h-5 flex-col justify-center gap-0.5">
                  {CHART_SERIES.map((series) => barOf(bar, series))}
                </div>
              ))}
            </div>
          </div>
          <span />
          <div className="relative mr-16 h-4 text-xs text-muted-foreground">
            {ticks.map((value) => (
              <span key={value} className="absolute -translate-x-1/2 leading-none" style={{ left: share(value) }}>
                {tick(value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
