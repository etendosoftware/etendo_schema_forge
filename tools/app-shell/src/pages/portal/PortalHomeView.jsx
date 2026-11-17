import { useEffect, useState } from 'react';
import {
  ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, FileText,
} from 'lucide-react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatDashboardAxisTick, niceScale } from '@/lib/dashboardNumberFormat.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import {
  PORTAL_CHART_MONTHS, PORTAL_ERROR, searchPortalDocuments,
} from '@/lib/portal/portalApi.js';
import { PORTAL_KIND_ICONS, PortalMobileBrandBar } from './PortalShell.jsx';
import {
  PortalDate, PortalDesktopHeader, PortalMain, PortalMoney, PortalRowBadge, PortalSearchPill,
  PortalSection, PortalTag, PORTAL_ROW_FOCUS, PORTAL_SECTION_TITLE, usePortalLocale,
} from './PortalBits.jsx';
import { PORTAL_HIGHLIGHTS, PORTAL_KIND_META, documentLabelKey } from './portalPresentation.js';

const SEARCH_DEBOUNCE_MS = 300;

/** The tiles' order in the design (Main / Movil-Inicio): what most often needs the customer first. */
const TILE_ORDER = Object.freeze(['QUOTATION', 'INVOICE', 'ORDER', 'SHIPMENT']);

/**
 * "Inicio" (design Main / Movil-Inicio), every figure from `GET /sws/portal/home`, aggregated
 * server-side.
 *
 * Desktop: the header with the search across every kind; the greeting and the period button
 * (which drives the "Facturado por mes" chart); "Requiere tu atención" (one tile per kind) beside
 * "Tu saldo" (pending payment and paid this year); "Documentos recientes" beside the chart.
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
        title={ui('portalNavHome')}
        breadcrumb={ui('portalNavHome')}
        search={searchBox}
        data-testid="PortalDesktopHeader__beaeb4" />

      <PortalMain
        className="overflow-y-auto px-6 pb-28 pt-6 md:pb-3 md:pt-3"
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
            <div className="hidden h-12 items-center border-b border-border bg-muted px-3 md:flex">
              <h2 className={PORTAL_SECTION_TITLE}>{ui('portalAttentionTitle')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] md:p-3">
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
              <button
                type="button"
                onClick={viewAll}
                className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary md:text-xs"
                data-testid="portal-recent-view-all"
              >
                {ui('portalViewAll')}
              </button>
            )}
            className="rounded-xl"
            testId="portal-recent"
            data-testid="PortalSection__beaeb4">
            <RecentDocuments recent={recent} onOpen={open} data-testid="RecentDocuments__beaeb4" />
          </PortalSection>

          <PortalSection
            title={ui('portalInvoicedPerMonth')}
            className="hidden md:block"
            testId="portal-chart"
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
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent-highlight))] text-[hsl(var(--accent-highlight-foreground))] md:flex">
          <FileText
            className="h-[18px] w-[18px]"
            aria-hidden="true"
            data-testid="FileText__beaeb4" />
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
          <h2 className="hidden text-lg font-semibold leading-7 md:block" data-testid="portal-headline">
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
            className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 font-medium md:inline-flex"
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
 * "Tu saldo" (desktop, design Main): "Pendiente de pago" with its count chip and one amount pill
 * per currency, a divider, then "Pagado este año" the same way. The overdue detail ("… vencidos
 * desde …") belongs to the mobile card only, as on the Movil-Inicio board.
 */
function Balance({ balances, paid }) {
  const ui = useUI();
  const pill = 'self-start rounded-md border px-2.5 text-lg font-medium leading-7 tabular-nums';
  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      <div className="flex flex-col gap-1.5" data-testid="portal-balance-pending">
        <span className="flex items-center gap-1.5 font-medium text-destructive">
          {ui('portalPendingPayment')}
          <PortalTag className="px-1.5 py-0 font-normal" data-testid="PortalTag__beaeb4">
            {balances.reduce((sum, balance) => sum + balance.pendingCount, 0)}
          </PortalTag>
        </span>
        {balances.length === 0 ? (
          <span className={`${pill} border-border text-muted-foreground`} data-testid="portal-balance-empty">—</span>
        ) : balances.map((balance) => (
          <span
            key={balance.currency || 'none'}
            className={`${pill} border-destructive/30 bg-[var(--status-destructive-bg)] text-destructive`}
            data-testid="portal-balance-outstanding"
          >
            {formatCurrency(balance.currency, balance.outstanding)}
          </span>
        ))}
      </div>
      <div className="h-px bg-border" />
      <div className="flex flex-col gap-1.5" data-testid="portal-balance-paid">
        <span className="flex items-center gap-1.5 font-medium text-[var(--status-success-fg)]">
          {ui('portalPaidThisYear')}
          <PortalTag className="px-1.5 py-0 font-normal" data-testid="PortalTag__beaeb4">
            {paid.reduce((sum, entry) => sum + entry.count, 0)}
          </PortalTag>
        </span>
        {paid.length === 0 ? (
          <span className={`${pill} border-border text-muted-foreground`}>—</span>
        ) : paid.map((entry) => (
          <span
            key={entry.currency || 'none'}
            className={`${pill} border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]`}
            data-testid="portal-balance-paid-amount"
          >
            {formatCurrency(entry.currency, entry.paid)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One kind's tile: the figure the kind calls out (or its total), and that figure's badge. */
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
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-[18px] text-left hover:border-primary md:rounded-lg md:px-3.5 md:py-3"
      data-testid={`portal-tile-${kind.toLowerCase()}`}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon
          className="hidden h-4 w-4 md:block"
          aria-hidden="true"
          data-testid="Icon__beaeb4" />
        {ui(PORTAL_KIND_META[kind].pluralKey)}
      </span>
      <span className="text-[44px] font-medium leading-[48px] tabular-nums md:text-5xl md:leading-[48px]" data-testid="portal-tile-count">
        {shown ? tile.highlight.count : (tile?.count ?? 0)}
      </span>
      {shown ? (
        <PortalTag
          tone={highlight.tone}
          className="max-w-full self-start whitespace-normal"
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
          <button
            type="button"
            onClick={() => onOpen(document)}
            className={`hidden w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left hover:bg-muted md:flex ${PORTAL_ROW_FOCUS}`}
            data-testid="portal-recent-document"
          >
            {/* Fixed-width cells, as on the board, so number, status and amount line up row to
                row, each packed to the right of its cell so the group sits together on the right:
                a long number truncates (tooltip); the status cell is as wide as the common badges
                ("Por responder", "Pago parcial", "En evaluación") and a rare long label wraps in
                it; every amount (or a shipment's "—") is right-aligned in a 110 px pill. */}
            <span className="min-w-0 flex-1 truncate">{ui(documentLabelKey(document))}</span>
            <span className="flex w-24 shrink-0 justify-end">
              <PortalTag
                className="block max-w-full truncate font-normal"
                title={document.documentNo}
                data-testid="PortalTag__beaeb4">{document.documentNo}</PortalTag>
            </span>
            <span className="flex w-28 shrink-0 justify-end">
              <PortalRowBadge
                document={document}
                useServerOverdue
                className="whitespace-normal font-normal"
                data-testid="PortalRowBadge__beaeb4" />
            </span>
            <span className="w-[110px] shrink-0 rounded-lg border border-border px-2 py-0.5 text-right text-xs leading-4 tabular-nums">
              <PortalMoney
                currency={document.currency}
                value={document.grandTotal}
                data-testid="PortalMoney__beaeb4" />
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 text-muted-foreground"
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

/** "Facturado por mes": one bar per month of the chosen period, in the most used currency. */
function InvoicedChart({ chart, year }) {
  const ui = useUI();
  const bcpLocale = usePortalLocale();
  const bars = chart?.bars ?? [];
  const max = Math.max(0, ...bars.map((bar) => bar.amount));
  // Round ticks (0 / 500 / 1K / 1,5K), with the app's dashboard helpers: the axis tops at the
  // nice maximum, not at the largest bar.
  const { niceMax: top, ticks: ascending } = niceScale(max);
  const ticks = [...ascending].reverse();
  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-3">
      {year?.total > 0 ? (
        <span className="flex items-center gap-2 text-xs text-[var(--status-success-fg)]" data-testid="portal-up-to-date">
          <CheckCircle2
            className="h-3.5 w-3.5"
            aria-hidden="true"
            data-testid="CheckCircle2__beaeb4" />
          {ui('portalUpToDate', { upToDate: year.upToDate, total: year.total })}
        </span>
      ) : null}
      <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-2">
        <div className="flex h-[150px] flex-col justify-between text-right text-[11px] text-muted-foreground">
          {ticks.map((tick) => <span key={tick}>{formatDashboardAxisTick(tick, bcpLocale)}</span>)}
        </div>
        <div
          className="grid h-[150px] items-end gap-4 border-b border-l border-border px-2.5"
          style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
          data-testid="portal-chart-bars"
        >
          {bars.map((bar) => (
            <div
              key={bar.month}
              className={cn('rounded-t-[3px] bg-[var(--status-success-fg)]')}
              style={{ height: `${(bar.amount / top) * 100}%` }}
              title={chart?.currency ? formatCurrency(chart.currency, bar.amount) : undefined}
              data-testid="portal-chart-bar"
            />
          ))}
        </div>
        <span />
        <div
          className="grid gap-4 px-2.5 text-center text-[11px] text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
        >
          {/* Short month names without the trailing dot; with more than 6 bars every other label is
              shown, so none is ever cut. */}
          {bars.map((bar, index) => (
            <span key={bar.month} className="whitespace-nowrap" data-testid="portal-chart-label">
              {bars.length > 6 && index % 2 === 1 ? ''
                : formatCalendarDate(`${bar.month}-01`, bcpLocale, { month: 'short' }).replace(/\.$/, '')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
