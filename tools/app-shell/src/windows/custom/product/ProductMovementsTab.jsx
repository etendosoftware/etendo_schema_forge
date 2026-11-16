import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, FileText, Loader2 } from 'lucide-react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useCurrency } from '@/hooks/useCurrency';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { PRODUCT_MOVEMENTS_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatStockQuantity } from './stockQuantityFormat';
import { formatCalendarDate } from '@/lib/dateOnly';
import { getRouterBase } from '@/lib/deploymentBasePath';
import { DateRangePopover } from '@/components/ui/date-range-popover.jsx';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableHeaderLabel } from '@/components/financial-accounts/SortableHeaderLabel.jsx';
import { useProductMovementsTabTracking } from './useProductMovementsTabTracking';
import { useMovementsPeriodRequest } from './useMovementsPeriodRequest';
import { useRemainingHeight } from './useRemainingHeight';
import {
  DEFAULT_MOVEMENTS_PERIOD,
  MOVEMENTS_DEFAULT_SORT,
  MOVEMENTS_PAGE_SIZE,
  MOVEMENTS_TABLE_MIN_HEIGHT,
  buildAnyMovementQuery,
  buildMovementsQuery,
  buildTypeLabelOrder,
  extractMovementTotals,
  formatProcessTime,
  isMovementsSortKey,
  isStorableProduct,
  isUnfilteredMovements,
  quantityTone,
  resolveMovementType,
  resolveMovementsEmptyKind,
  shouldShowMovementsTab,
  signedQuantity,
} from './productMovements';

// ETP-5889 — read-only history of the stock movements of a product (a custom tab: it filters, sorts and
// pages on the server, which the generic secondary tabs do not do). Rows are M_Transaction; the backend
// adds the source document (`etgoDocLabel`, `etgoDocWindow`, `etgoDocHeaderId`) and the stock left after
// each movement (`etgoStockAfter`).

// Opt-in presets of the period filter: they map 1:1 to the side panel's 3M / 6M (12M is a default one).
const MOVEMENTS_EXTRA_PRESETS = ['last3m', 'last6m'];

// `min-w-[900px]` (sum of the column minimums + gaps + padding) makes every row, the sticky header and the
// sticky total row as wide as the columns, so their backgrounds and cells stay aligned when the box scrolls sideways.
const GRID = 'grid shrink-0 min-w-[900px] grid-cols-[150px_minmax(220px,1.6fr)_minmax(140px,1fr)_100px_150px_130px] items-center gap-x-4';
const NEAR_BOTTOM_PX = 80;
const SKELETON_ROWS = 6;

// Colours come from the shared tokens, not from picks of this tab: the type badge is the shared `Tag`
// (Figma token map, ETP-3835) and the sign of a quantity uses the semantic colours the grid's
// `signedDelta` cell uses, so a movement reads like any other signed quantity of the app.
const TAG_VARIANT = { in: 'green', out: 'orange', neutral: 'neutral' };
const TOTAL_NEGATIVE_FG = 'var(--quantity-negative-fg)';
const SIGN_COLOR = {
  in: 'var(--status-success-fg)',
  out: 'var(--quantity-negative-fg)',
  neutral: 'hsl(var(--foreground))',
};

// The same pill as the "Summary / Warehouses" switch of the side panel (`ProductSidebar`): a `muted`
// track, the selected option on `card` with a soft shadow and a dark label.
const SEGMENT_TRACK = { background: 'hsl(var(--muted))' };
const SEGMENT_ACTIVE = { background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontWeight: 500 };
const SEGMENT_IDLE = { color: 'hsl(var(--foreground))', fontWeight: 400 };

const rowsOf = (json) => json?.response?.data ?? json?.data ?? [];
const ARIA_SORT = { asc: 'ascending', desc: 'descending' };

function DocumentLink({ row, label, openInNewTab }) {
  const open = () => {
    window.open(`${window.location.origin}${getRouterBase()}/${row.etgoDocWindow}/${row.etgoDocHeaderId}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <button
      type="button"
      onClick={open}
      data-testid="product-movements-doc-link"
      className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs text-[hsl(var(--foreground))] underline underline-offset-2 transition-colors hover:text-primary"
    >
      <FileText
        className="h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
        data-testid="FileText__763719" />
      <span>{label}</span>
      <span className="sr-only">{openInNewTab}</span>
    </button>
  );
}

function MovementRow({ row, ui, currency }) {
  const { labelKey, tone } = resolveMovementType(row);
  const typeLabel = labelKey ? ui(labelKey) : (row['movementType$_identifier'] ?? row.movementType ?? '—');
  const time = formatProcessTime(row.etgoProcessTime);
  const hasDocument = row.etgoDocWindow && row.etgoDocHeaderId && row.etgoDocLabel;

  return (
    <div role="row" className={`${GRID} border-b border-border/50 px-3 py-2 text-sm`} data-testid="product-movements-row">
      <div role="cell" className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="font-medium tabular-nums">{formatCalendarDate(row.movementDate)}</span>
        {time ? <span className="text-xs tabular-nums text-muted-foreground" data-testid="product-movements-time">{time}</span> : null}
      </div>
      <div role="cell" className="flex min-w-0 flex-nowrap items-center gap-2 whitespace-nowrap">
        <span className="min-w-0 truncate" title={typeLabel} data-testid="product-movements-type">
          <Tag variant={TAG_VARIANT[tone]} data-testid="Tag__763719">{typeLabel}</Tag>
        </span>
        {hasDocument ? <DocumentLink
          row={row}
          label={row.etgoDocLabel}
          openInNewTab={ui('openFullReport')}
          data-testid="DocumentLink__763719" /> : null}
      </div>
      <span role="cell" className="truncate">{row['etgoWarehouse$_identifier'] ?? '—'}</span>
      <span role="cell" className="text-right font-semibold tabular-nums" style={{ color: SIGN_COLOR[quantityTone(row.movementQuantity)] }}>
        {signedQuantity(row.movementQuantity, formatStockQuantity)}
      </span>
      <span role="cell" className="text-right tabular-nums">{formatCurrency(currency, row.transactionCost)}</span>
      <span role="cell" className="text-right font-semibold tabular-nums">
        {row.etgoStockAfter == null ? '—' : formatStockQuantity(row.etgoStockAfter)}
      </span>
    </div>
  );
}

/** Neutral for zero, green for a net entry, red for a net exit. */
function totalColor(netQuantity) {
  const tone = quantityTone(netQuantity);
  if (tone === 'in') return SIGN_COLOR.in;
  return tone === 'out' ? TOTAL_NEGATIVE_FG : SIGN_COLOR.neutral;
}

/**
 * Last row of the table, sticky at the bottom of the scroll box: the net quantity of ALL the movements the
 * filters match (server side), under the Quantity column. `row` is what `resolveTotalRow` answers: hidden, or the totals (null while loading, a skeleton).
 */
function MovementsTotalRow({ ui, row }) {
  if (!row.show) return null;
  const { totals } = row;
  const count = totals?.count ?? 0;
  const countLabel = ui(count === 1 ? 'productMovementsTotalCountOne' : 'productMovementsTotalCountOther', { count });
  return (
    <div role="row" className={`${GRID} sticky bottom-0 z-20 mt-auto border-t border-border bg-[var(--surface-subtle)] px-3 py-2.5 text-sm`} data-testid="product-movements-total">
      <span role="cell" className="col-span-3 flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-xs font-semibold">{ui('productMovementsTotalLabel')}</span>
        {totals ? <span className="text-xs text-muted-foreground" data-testid="product-movements-total-count">{countLabel}</span> : null}
      </span>
      <span role="cell" className="text-right text-[15px] font-bold tabular-nums" style={totals ? { color: totalColor(totals.netQuantity) } : undefined} aria-busy={!totals} data-testid="product-movements-total-value">
        {totals ? signedQuantity(totals.netQuantity, formatStockQuantity) : <Skeleton className="ml-auto h-4 w-12" data-testid="Skeleton__763719" />}
      </span>
      <span role="cell" className="col-span-2" aria-hidden="true" />
    </div>
  );
}

/** GET of one page; a non-2xx answer throws so the caller shows the error block. */
async function fetchMovementsJson(apiFetch, path) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** Retry handler: a failed first load starts again (and re-asks the probe), a failed page asks for that same page again. */
function retryMovements(state, setProbe, loadPage) {
  return () => {
    if (state.rows.length === 0) setProbe(null);
    loadPage(state.rows.length);
  };
}

/** The cached totals, only when they were computed for the filters on screen. */
function totalsEntryFor(totals, key) {
  return totals?.key === key ? totals : null;
}

/** Only a first page carries totals (the builder asks for them there only); a later page keeps what is there. */
function totalsAfterPage(prev, { key, json, start }) {
  return start === 0 ? { key, value: extractMovementTotals(json) } : prev;
}

/** What the total row shows: nothing (hidden), 'loading' (skeleton) or the totals of the current filters. */
function resolveTotalRow({ entry, state, pageEmpty }) {
  if (pageEmpty) return { show: false };
  if (state.loading) return entry ? { show: Boolean(entry.value), totals: entry.value } : { show: true, totals: null };
  if (state.rows.length === 0) return { show: false };
  return { show: Boolean(entry?.value), totals: entry?.value ?? null };
}

/** The product has no movement at all: the design's empty state. */
function NoMovementsYet({ ui }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center" data-testid="product-movements-empty">
      <ArrowLeftRight className="h-8 w-8 text-muted-foreground" aria-hidden="true" data-testid="ArrowLeftRight__763719" />
      <p className="text-base font-semibold">{ui('noStockMovements')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{ui('productMovementsEmptyText')}</p>
    </div>
  );
}

/** The product has movements, but the filters of the view (the period included) match none of them. */
function NoMovementsForFilters({ ui }) {
  return <p className="p-10 text-center text-sm text-muted-foreground" data-testid="product-movements-no-results">{ui('productMovementsNoResults')}</p>;
}

/** The first page finished loading without error and came back empty. */
function isFirstPageEmpty(everActive, state) {
  return everActive && !state.loading && !state.error && state.rows.length === 0;
}

/** The probe only runs under filters that are not the unfiltered ones, and only while nothing is cached. */
function shouldProbe(filters, probeAnswer) {
  return !isUnfilteredMovements(filters) && probeAnswer === undefined;
}

/** The pages of the old product still in flight are dropped by bumping the generation. */
function useDropStalePagesOnProductChange(productId, generation) {
  const lastProductId = useRef(productId);
  useEffect(() => {
    if (lastProductId.current === productId) return;
    lastProductId.current = productId;
    generation.current += 1;
  }, [productId, generation]);
}

/** The cached probe answer, only when it belongs to the product on screen. */
function probeAnswerFor(probe, productId) {
  return probe && probe.productId === productId ? probe.answer : undefined;
}

const EMPTY_MOVEMENTS_STATE = { rows: [], loading: true, loadingMore: false, error: null, hasMore: false };

/** A request went out: the first page starts from scratch, a later one keeps the rows and shows the footer loader. */
function movementsStateOnRequest(prev, start) {
  return start === 0 ? { ...EMPTY_MOVEMENTS_STATE } : { ...prev, loadingMore: true };
}

/** A page arrived: it replaces the rows (first page) or is appended to them. */
function movementsStateOnPage(prev, page, start) {
  return {
    rows: start === 0 ? page : [...prev.rows, ...page],
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: page.length === MOVEMENTS_PAGE_SIZE,
  };
}

/** True when the scroll box is near its bottom and the next page can be asked for. */
function shouldLoadNextPage(el, state) {
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - NEAR_BOTTOM_PX;
  return nearBottom && state.hasMore && !state.loading && !state.loadingMore;
}

function MovementsSkeleton() {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => (
    <div key={i} aria-hidden="true" className={`${GRID} border-b border-border/50 px-3 py-2.5`} data-testid="product-movements-skeleton">
      {Array.from({ length: 6 }, (__, j) => <Skeleton key={j} className="h-4 w-full" data-testid="Skeleton__763719" />)}
    </div>
  ));
}

function MovementsError({ ui, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center" role="alert" data-testid="product-movements-error">
      <p className="text-sm text-destructive">{ui('productMovementsError')}</p>
      {/* A failed first load starts again; a failed page asks for that same page again. */}
      <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid="product-movements-retry">
        {ui('retry')}
      </Button>
    </div>
  );
}

const DIRECTION_OPTIONS = [['all', 'all'], ['in', 'productMovementsIn'], ['out', 'productMovementsOut']];

/** One segment of the direction toggle. */
function DirectionButton({ active, label, onSelect }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`h-8 rounded-lg px-3 text-sm transition-all${active ? ' shadow-sm' : ''}`}
      style={active ? SEGMENT_ACTIVE : SEGMENT_IDLE}
    >
      {label}
    </button>
  );
}

/** Clicking the sorted column flips its direction; any other column starts ascending. */
function nextMovementsSort(prev, key) {
  if (prev.key !== key) return { key, direction: 'asc' };
  return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
}

/** Sorts by `key` unless it is not a sortable column. */
function requestMovementsSort(setSort, key) {
  if (isMovementsSortKey(key)) setSort((prev) => nextMovementsSort(prev, key));
}

/** `aria-sort` of a header cell: a direction on the sorted column, 'none' on the others. */
function ariaSortFor(sort, key) {
  return sort.key === key ? ARIA_SORT[sort.direction] : 'none';
}

/** Distinct warehouses (id + name, sorted by name) found in the product's stock rows. */
function warehouseOptionsFromStock(stockRows) {
  const seen = new Map();
  for (const stockRow of stockRows) {
    if (stockRow.warehouse && !seen.has(stockRow.warehouse)) seen.set(stockRow.warehouse, stockRow['warehouse$_identifier'] ?? stockRow.warehouse);
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Loads the warehouses the product has stock in, once the tab has been shown. */
function useWarehouseFilterOptions({ productId, storable, everActive, apiFetch, setWarehouses }) {
  useEffect(() => {
    if (!storable || !productId || !everActive) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/stock?parentId=${encodeURIComponent(productId)}&_startRow=0&_endRow=100`);
        if (!res.ok) return;
        const options = warehouseOptionsFromStock(rowsOf(await res.json()));
        if (!cancelled) setWarehouses(options);
      } catch { /* without the list the filter just offers every warehouse */ }
    })();
    return () => { cancelled = true; };
  }, [productId, storable, everActive, apiFetch, setWarehouses]);
}

/** Asks whether the product has ANY movement and stores the answer: 'any' | 'none' | 'failed'. */
async function fetchAnyMovementAnswer(apiFetch, { productId, sort }) {
  try {
    const res = await apiFetch(buildAnyMovementQuery({ productId, sort }));
    if (!res.ok) return 'failed';
    return rowsOf(await res.json()).length > 0 ? 'any' : 'none';
  } catch { /* falls back to the "no results for the filters" message */ }
  return 'failed';
}

function useAnyMovementProbe({ needsProbe, productId, sort, apiFetch, setProbe }) {
  useEffect(() => {
    if (!needsProbe) return undefined;
    let cancelled = false;
    (async () => {
      const answer = await fetchAnyMovementAnswer(apiFetch, { productId, sort });
      if (!cancelled) setProbe({ productId, answer });
    })();
    return () => { cancelled = true; };
  }, [needsProbe, productId, sort, apiFetch, setProbe]);
}

/** Direction toggle, period picker and warehouse select above the list. */
function MovementsFilterBar({ ui, direction, onDirectionChange, dateRange, onDateRangeChange, warehouseId, onWarehouseChange, warehouses }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={ui('productMovementsDirection')} className="inline-flex h-10 items-center gap-1 rounded-xl p-1" style={SEGMENT_TRACK} data-testid="product-movements-direction">
        {DIRECTION_OPTIONS.map(([value, labelKey]) => (
          <DirectionButton
            key={value}
            active={direction === value}
            label={ui(labelKey)}
            onSelect={() => onDirectionChange(value)}
            data-testid="DirectionButton__763719" />
        ))}
      </div>
      <DateRangePopover
        value={dateRange}
        onChange={onDateRangeChange}
        extraPresets={MOVEMENTS_EXTRA_PRESETS}
        data-testid="DateRangePopover__763719" />
      <Select
        value={warehouseId ?? 'all'}
        onValueChange={(value) => onWarehouseChange(value === 'all' ? null : value)}
        data-testid="Select__763719">
        <SelectTrigger className="w-[200px]" aria-label={ui('productMovementsWarehouse')} data-testid="product-movements-warehouse">
          <SelectValue data-testid="SelectValue__763719" />
        </SelectTrigger>
        <SelectContent data-testid="SelectContent__763719">
          <SelectItem value="all" data-testid="SelectItem__763719">{ui('productMovementsAllWarehouses')}</SelectItem>
          {warehouses.map((w) => <SelectItem key={w.id} value={w.id} data-testid="SelectItem__763719">{w.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ProductMovementsTab({ data, apiBaseUrl, isActive, onVisibilityChange }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const currency = useCurrency() ?? 'USD';
  const productId = data?.id;
  // The backend decides per account whether the tab exists (feature flag `product-movements-tab`); while
  // the access map is not loaded, or with the flag off, the tab hides and does nothing at all.
  const enabled = isCapabilityVisible(useCapabilitiesSafe(), PRODUCT_MOVEMENTS_CAPABILITY);
  const visible = enabled && shouldShowMovementsTab(data);
  // Only a saved, stocked product has movements to read.
  const storable = enabled && isStorableProduct(data);
  // Shown right now and stocked: the moment the data is wanted.
  const activeAndStorable = Boolean(isActive && storable);

  const [direction, setDirection] = useState('all');
  const [dateRange, setDateRange] = useState(DEFAULT_MOVEMENTS_PERIOD);
  const [warehouseId, setWarehouseId] = useState(null);
  const [sort, setSort] = useState(MOVEMENTS_DEFAULT_SORT);
  const [warehouses, setWarehouses] = useState([]);
  const [state, setState] = useState({ rows: [], loading: true, loadingMore: false, error: null, hasMore: false });
  const [everActive, setEverActive] = useState(false);
  const generation = useRef(0);
  // Answer of the "does the product have ANY movement" probe: { productId, answer: 'any' | 'none' | 'failed' }.
  const [probe, setProbe] = useState(null);
  // Period totals of the first page: { key, value }, `key` ties them to the product + filters they were
  // computed for (a sort does not change it), `value` is null when the backend sent none.
  const [totals, setTotals] = useState(null);
  // The tab's own scroll box is bounded by the room left in the content column (inline maxHeight wins
  // over the class, which only stays as the pre-measure fallback), so the page itself never scrolls.
  const remaining = useRemainingHeight({ active: Boolean(isActive), minHeight: MOVEMENTS_TABLE_MIN_HEIGHT });
  const scrollBoxStyle = { ...remaining.style, minHeight: MOVEMENTS_TABLE_MIN_HEIGHT };

  // The tab survives a change of record, so nothing of the previous product may outlive it: its
  // warehouses and its warehouse filter (an option the new product may not have). The state is reset
  // while rendering, so the effects of this same commit already see the clean filters; resetting it in an
  // effect would let the first page of the new product go out with the warehouse of the old one.
  const [stateProductId, setStateProductId] = useState(productId);
  if (stateProductId !== productId) {
    setStateProductId(productId);
    setWarehouseId(null);
    setWarehouses([]);
    setEverActive(activeAndStorable);
    setProbe(null);
    setTotals(null);
    setState({ rows: [], loading: true, loadingMore: false, error: null, hasMore: false });
  }

  // Side effects of that change cannot run while rendering: the pages of the old product still in flight
  // are dropped by bumping the generation.
  useDropStalePagesOnProductChange(productId, generation);

  // The tab is mounted with the record and only hidden while another one is selected, so the data is
  // fetched from the first time it is shown, not from the mount.
  useEffect(() => {
    if (activeAndStorable) setEverActive(true);
  }, [activeAndStorable]);

  // A service, expense or resource has no stock: the tab hides itself.
  const visibilityRef = useRef(onVisibilityChange);
  visibilityRef.current = onVisibilityChange;
  useEffect(() => { visibilityRef.current?.(visible); }, [visible]);

  // "Ver movimientos" (side panel): prefilters the period once, and tells the telemetry how the tab was opened.
  const source = useMovementsPeriodRequest({ enabled: storable, isActive: activeAndStorable, onPeriod: setDateRange });
  useProductMovementsTabTracking({ isActive: activeAndStorable, source });

  // Warehouses of the filter: the ones the product has stock in (the same source as the side panel).
  useWarehouseFilterOptions({ productId, storable, everActive, apiFetch, setWarehouses });

  const filters = useMemo(() => ({ direction, dateRange, warehouseId }), [direction, dateRange, warehouseId]);

  // The Type column sorts by the label the user reads, in the active language: the order of the label
  // buckets is recomputed per locale and travels with the request (a string, so the page loader only
  // changes when the order does). Any other sort sends nothing.
  const typeOrder = sort.key === 'type' ? buildTypeLabelOrder(ui, locale) : null;

  const totalsKey = JSON.stringify([productId, direction, dateRange, warehouseId]);

  const loadPage = useCallback(async (start) => {
    const mine = ++generation.current;
    setState((prev) => movementsStateOnRequest(prev, start));
    try {
      const json = await fetchMovementsJson(apiFetch, buildMovementsQuery({ productId, filters, sort, start, typeOrder, withTotals: true }));
      const page = rowsOf(json);
      if (mine !== generation.current) return;
      setTotals((prev) => totalsAfterPage(prev, { key: totalsKey, json, start }));
      setState((prev) => movementsStateOnPage(prev, page, start));
    } catch (error) {
      if (mine !== generation.current) return;
      setState((prev) => ({ ...prev, loading: false, loadingMore: false, error: error.message }));
    }
  }, [apiFetch, productId, filters, sort, typeOrder, totalsKey]);

  // Any change of the view starts again from the first page.
  useEffect(() => {
    if (!storable || !productId || !everActive) return;
    loadPage(0);
  }, [storable, productId, everActive, loadPage]);

  // The probe: only when the first page came back empty under filters that are not the unfiltered ones, and
  // only once per product (a failure is cached too, so nothing retries in a loop). A change of filters or
  // product cancels the one in flight, so a stale answer is never applied.
  const pageEmpty = isFirstPageEmpty(everActive, state);
  const probeAnswer = probeAnswerFor(probe, productId);
  const needsProbe = storable && Boolean(productId) && pageEmpty && shouldProbe(filters, probeAnswer);
  useAnyMovementProbe({ needsProbe, productId, sort, apiFetch, setProbe });

  const onScroll = (event) => {
    const el = event.currentTarget;
    if (shouldLoadNextPage(el, state)) loadPage(state.rows.length);
  };

  const toggleSort = (key) => requestMovementsSort(setSort, key);

  // Nothing to show while the product is unsaved (DetailView disables the tab, but a route state can
  // still open it) or not stocked.
  if (!visible || !storable) return null;

  const emptyKind = resolveMovementsEmptyKind({ filters, probe: probeAnswer });
  const totalRow = resolveTotalRow({ entry: totalsEntryFor(totals, totalsKey), state, pageEmpty });

  // `aria-sort` belongs on the header cell, and only the column the list is sorted by carries a direction.
  const ariaSort = (key) => ariaSortFor(sort, key);

  const header = (key, labelKey, align) => (
    <SortableHeaderLabel
      label={ui(labelKey)}
      sortKey={key}
      activeKey={sort.key}
      direction={sort.direction}
      onSort={key === 'stockAfter' ? undefined : toggleSort}
      align={align}
      data-testid="SortableHeaderLabel__763719" />
  );

  return (
    <div className="flex flex-col gap-3" data-testid="product-movements-tab">
      <MovementsFilterBar
        ui={ui}
        direction={direction}
        onDirectionChange={setDirection}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        warehouses={warehouses}
        data-testid="MovementsFilterBar__763719" />

      {/* A keyboard user must be able to focus the scrollable list to scroll it and load the next page. */}
      <div
        role="table"
        aria-label={ui('productMovements')}
        aria-busy={state.loading || state.loadingMore}
        tabIndex={0}
        ref={remaining.ref}
        style={scrollBoxStyle}
        // `relative` is load-bearing: the rows hold `sr-only` (position:absolute) spans, and an absolute box whose
        // containing block is OUTSIDE this scroll container is not clipped by it, so every loaded row kept adding
        // its static position to the content column's scrollable height (blank page after scrolling).
        className="relative flex max-h-[calc(100vh-420px)] flex-col overflow-y-auto"
        onScroll={onScroll}
        data-testid="product-movements-scroll">
        <div role="row" className={`${GRID} sticky top-0 z-30 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground`}>
          <span role="columnheader" aria-sort={ariaSort('date')}>{header('date', 'date')}</span>
          <span role="columnheader" aria-sort={ariaSort('type')}>{header('type', 'typeColumn')}</span>
          <span role="columnheader" aria-sort={ariaSort('warehouse')}>{header('warehouse', 'productMovementsWarehouse')}</span>
          <span role="columnheader" aria-sort={ariaSort('quantity')} className="text-right">{header('quantity', 'productMovementsQuantity', 'right')}</span>
          <span role="columnheader" aria-sort={ariaSort('cost')} className="text-right">{header('cost', 'productMovementsCost', 'right')}</span>
          <span
            role="columnheader"
            className="text-right"
            title={ui(warehouseId ? 'productMovementsStockAfterWarehouseHint' : 'productMovementsStockAfterTotalHint')}>
            {header('stockAfter', 'productMovementsStockAfter')}
          </span>
        </div>

        {state.loading ? <MovementsSkeleton data-testid="MovementsSkeleton__763719" /> : null}

        {state.error ? (
          <MovementsError
            ui={ui}
            onRetry={retryMovements(state, setProbe, loadPage)}
            data-testid="MovementsError__763719" />
        ) : null}

        {pageEmpty && emptyKind === 'none' ? <NoMovementsYet ui={ui} data-testid="NoMovementsYet__763719" /> : null}
        {pageEmpty && emptyKind === 'filtered' ? <NoMovementsForFilters ui={ui} data-testid="NoMovementsForFilters__763719" /> : null}

        {state.rows.map((row) => <MovementRow
          key={row.id}
          row={row}
          ui={ui}
          currency={currency}
          data-testid="MovementRow__763719" />)}

        {state.loadingMore ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__763719" /></div>
        ) : null}

        <MovementsTotalRow ui={ui} row={totalRow} data-testid="MovementsTotalRow__763719" />
      </div>
    </div>
  );
}

// ETP-5309: the tab cannot work on an unsaved product, so DetailView shows it disabled, with this hint.
ProductMovementsTab.requiresSavedRecord = true;
ProductMovementsTab.savedRecordHintKey = 'productMovementsSaveFirstHint';
