import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BarChart3, BarChartHorizontal, CalendarDays, Check, ChevronDown,
  ChevronRight, FileText, Smile,
} from 'lucide-react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import { formatDashboardAxisTick, niceScale } from '@/lib/dashboardNumberFormat.js';
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
      variant="header"
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
        className="overflow-y-auto px-6 pb-28 pt-6 md:rounded-xl md:pb-3 md:pt-3"
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

        {/* items-start: both cards hug their content, as in the design (no stretched tiles). */}
        <div className="flex flex-wrap items-start gap-3">
          <section
            className="min-w-0 flex-[2_1_560px] overflow-hidden md:rounded-lg md:border md:border-border"
            aria-label={ui('portalAttentionTitle')}
            data-testid="portal-tiles"
          >
            <div className="hidden h-10 items-center border-b border-border bg-muted px-3 py-2 md:flex">
              <h2 className={PORTAL_DASHBOARD_SECTION_TITLE}>{ui('portalAttentionTitle')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:gap-4 md:p-4">
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
            className="hidden flex-[1_1_280px] md:block"
            testId="portal-balance"
            variant="dashboard"
            data-testid="PortalSection__beaeb4">
            <Balance
              balances={balances}
              paid={home?.paidThisYear ?? []}
              data-testid="Balance__beaeb4" />
          </PortalSection>
        </div>

        <div className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))]">
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
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" data-testid="ArrowUpRight__beaeb4" />
                </button>
              </>
            )}
            className="rounded-xl"
            testId="portal-recent"
            variant="dashboard"
            data-testid="PortalSection__beaeb4">
            <RecentDocuments recent={recent} onOpen={open} data-testid="RecentDocuments__beaeb4" />
          </PortalSection>

          <PortalSection
            title={ui('portalInvoicedPerMonth')}
            className="hidden md:block"
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
          <Smile className="h-5 w-5" aria-hidden="true" data-testid="Smile__beaeb4" />
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
            <CalendarDays className="h-4 w-4" aria-hidden="true" data-testid="CalendarDays__beaeb4" />
            {ui('portalPeriodMonths', { count: months })}
            <ChevronDown
              className="h-3.5 w-3.5"
              aria-hidden="true"
              data-testid="ChevronDown__beaeb4" />
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
          <ArrowRight className="h-4 w-4" aria-hidden="true" data-testid="ArrowRight__beaeb4" />
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
  const badge = 'self-start rounded-lg border px-2 text-sm font-medium leading-6 tabular-nums';
  const countPill = (count, testId) => (
    <span
      className="inline-flex items-center gap-1 rounded-lg bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
      data-testid={testId}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" data-testid="FileText__beaeb4" />
      {count}
    </span>
  );
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2" data-testid="portal-balance-paid">
        <span className="flex items-center gap-2 text-sm text-foreground">
          {ui('portalPaidThisYear')}
          {countPill(paid.reduce((sum, entry) => sum + entry.count, 0), 'portal-balance-paid-count')}
        </span>
        {paid.length === 0 ? (
          <span className={`${badge} border-border text-muted-foreground`}>—</span>
        ) : paid.map((entry) => (
          <span
            key={entry.currency || 'none'}
            className={`${badge} border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]`}
            data-testid="portal-balance-paid-amount"
          >
            {formatCurrency(entry.currency, entry.paid)}
          </span>
        ))}
      </div>
      <div className="h-px bg-border" />
      <div className="flex flex-col gap-2" data-testid="portal-balance-pending">
        <span className="flex items-center gap-2 text-sm text-foreground">
          {ui('portalPendingPayment')}
          {countPill(balances.reduce((sum, balance) => sum + balance.pendingCount, 0), 'portal-balance-pending-count')}
        </span>
        {balances.length === 0 ? (
          <span className={`${badge} border-border text-muted-foreground`} data-testid="portal-balance-empty">—</span>
        ) : balances.map((balance) => (
          <span
            key={balance.currency || 'none'}
            className={`${badge} border-destructive/30 bg-[var(--status-destructive-bg)] text-destructive`}
            data-testid="portal-balance-outstanding"
          >
            {formatCurrency(balance.currency, balance.outstanding)}
          </span>
        ))}
      </div>
    </div>
  );
}

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
  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      className={`flex flex-col gap-2 rounded-xl border border-border bg-card p-[18px] text-left hover:border-primary md:h-[154px] md:justify-between md:gap-0 md:rounded-lg md:p-3 md:shadow-sm ${PORTAL_ROW_FOCUS}`}
      data-testid={`portal-tile-${kind.toLowerCase()}`}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground md:text-xs">
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted md:flex">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" data-testid="Icon__beaeb4" />
        </span>
        {ui(PORTAL_KIND_META[kind].pluralKey)}
      </span>
      <span
        className="text-[44px] font-medium leading-[48px] tabular-nums md:text-[60px] md:leading-[60px] md:[font-family:'Plus_Jakarta_Sans','Inter',sans-serif]"
        data-testid="portal-tile-count"
      >
        {shown ? tile.highlight.count : (tile?.count ?? 0)}
      </span>
      {shown ? (
        <PortalTag
          tone={highlight.tone}
          className="max-w-full self-start whitespace-normal md:rounded-full"
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
    <ul className="md:py-1.5">
      {recent.map((document) => (
        <li key={`${document.kind}:${document.id}`} className="border-b border-border last:border-b-0 md:border-b-0">
          {/* Desktop (spec of 2026-11-17): the kind, then its pills packed after it — the number
              (document icon, muted surface), the status as the app labels it, and the amount (a
              shipment has none, so no pill) — and the caret at the far right. */}
          <button
            type="button"
            onClick={() => onOpen(document)}
            className={`hidden min-h-8 w-full cursor-pointer items-center gap-2 px-3 py-1 text-left hover:bg-muted md:flex ${PORTAL_ROW_FOCUS}`}
            data-testid="portal-recent-document"
          >
            <span className="shrink-0 text-sm">{ui(documentLabelKey(document))}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span
                className="inline-flex min-w-0 max-w-[10rem] items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                title={document.documentNo}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-testid="FileText__beaeb4" />
                <span className="truncate">{document.documentNo}</span>
              </span>
              <PortalRowBadge
                document={document}
                useServerOverdue
                className="rounded-full font-normal"
                data-testid="PortalRowBadge__beaeb4" />
              {document.grandTotal != null ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs leading-4 text-muted-foreground tabular-nums">
                  <PortalMoney
                    currency={document.currency}
                    value={document.grandTotal}
                    data-testid="PortalMoney__beaeb4" />
                </span>
              ) : null}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
              data-testid="ChevronRight__beaeb4" />
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

/** The chart's two orientations (spec of 2026-11-17: a two-button switch in the chart's header). */
export const PORTAL_CHART_ORIENTATIONS = Object.freeze(['vertical', 'horizontal']);

/**
 * The chart's series. One today: what was invoiced per month. Kept as a list so a second series
 * can be added beside it (the spec's "Ingresos" / "Gastos" legend is pending with the PO: Jira
 * comment 149666) without reshaping the chart; every series reads its own amount from a bar.
 */
const CHART_SERIES = Object.freeze([
  {
    key: 'invoiced',
    labelKey: 'invoiced',
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
  const monthShort = (bar) => formatCalendarDate(`${bar.month}-01`, bcpLocale, { month: 'short' }).replace(/\.$/, '');
  const monthLong = (bar) => formatCalendarDate(`${bar.month}-01`, bcpLocale, { month: 'long', year: 'numeric' });
  // A chart with no currency (no invoices yet) shows plain grouped figures.
  const amountText = (amount) => (chart?.currency
    ? formatCurrency(chart.currency, amount)
    : formatGroupedNumber(amount, { maximumFractionDigits: 2 }));
  const tick = (value) => formatDashboardAxisTick(value, bcpLocale);
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
          vertical ? `w-full max-w-12 rounded-t ${series.vertical}` : `h-full rounded-r ${series.horizontal}`,
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
    <div className="flex flex-col gap-3 px-3 py-3" data-testid="portal-chart-body" data-orientation={orientation}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {year?.total > 0 ? (
            <span className="flex items-center gap-2 text-xs text-[var(--status-success-fg)]" data-testid="portal-up-to-date">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--status-success-bg)]">
                <Check className="h-3 w-3" aria-hidden="true" data-testid="Check__beaeb4" />
              </span>
              {ui('portalUpToDate', { upToDate: year.upToDate, total: year.total })}
            </span>
          ) : null}
          <span className="flex items-center gap-4" data-testid="portal-chart-legend">
            {CHART_SERIES.map((series) => (
              <span key={series.key} className="flex items-center gap-1.5 text-xs text-foreground">
                <span className={cn('h-[3px] w-3.5 rounded-sm', series.swatch)} aria-hidden="true" />
                {ui(series.labelKey)}
              </span>
            ))}
          </span>
        </div>
        <div className="flex h-10 items-center gap-1 rounded-xl bg-muted p-1" role="group" aria-label={ui('portalChartOrientation')}>
          {[['vertical', BarChart3, 'portalChartVertical'], ['horizontal', BarChartHorizontal, 'portalChartHorizontal']].map(([value, Icon, labelKey]) => (
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
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" data-testid="Icon__beaeb4" />
            </button>
          ))}
        </div>
      </div>

      {vertical ? (
        <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
          <div className="relative h-[180px] text-right text-xs text-muted-foreground">
            {ticks.map((value) => (
              <span key={value} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: share(value) }}>
                {tick(value)}
              </span>
            ))}
          </div>
          <div className="relative h-[180px]">
            {ticks.map((value) => (
              <span
                key={value}
                className="absolute inset-x-0 border-t border-dotted border-border"
                style={{ bottom: share(value) }}
                aria-hidden="true"
              />
            ))}
            <div
              className="relative grid h-full items-end gap-4 px-2.5"
              style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
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
            className="grid gap-4 px-2.5 text-center text-xs text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
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
        <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
          <div className="flex flex-col gap-1.5 text-right text-xs text-muted-foreground">
            {bars.map((bar) => (
              <span key={bar.month} className="flex h-5 items-center justify-end whitespace-nowrap" data-testid="portal-chart-label">
                {monthShort(bar)}
              </span>
            ))}
          </div>
          <div className="relative pr-16">
            {ticks.map((value) => (
              <span
                key={value}
                className="absolute inset-y-0 border-l border-dotted border-border"
                style={{ left: share(value) }}
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
