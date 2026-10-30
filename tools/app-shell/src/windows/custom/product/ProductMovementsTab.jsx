import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useCurrency } from '@/hooks/useCurrency';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { PRODUCT_MOVEMENTS_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly';
import { getRouterBase } from '@/lib/deploymentBasePath';
import { DateRangePopover } from '@/components/ui/date-range-popover.jsx';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableHeaderLabel } from '@/components/financial-accounts/SortableHeaderLabel.jsx';
import { useProductMovementsTabTracking } from './useProductMovementsTabTracking';
import {
  DEFAULT_MOVEMENTS_PERIOD,
  MOVEMENTS_DEFAULT_SORT,
  MOVEMENTS_PAGE_SIZE,
  buildMovementsCountQuery,
  buildMovementsQuery,
  isMovementsSortKey,
  isStorableProduct,
  quantityTone,
  resolveMovementType,
  shouldShowMovementsTab,
  signedQuantity,
} from './productMovements';

// ETP-5889 — read-only history of the stock movements of a product (a custom tab: it filters, sorts and
// pages on the server, which the generic secondary tabs do not do). Rows are M_Transaction; the backend
// adds the source document (`etgoDocLabel`, `etgoDocWindow`, `etgoDocHeaderId`) and the stock left after
// each movement (`etgoStockAfter`).

const GRID = 'grid grid-cols-[150px_minmax(220px,1.6fr)_minmax(140px,1fr)_100px_150px_130px] items-center gap-x-4';
const NEAR_BOTTOM_PX = 80;
const SKELETON_ROWS = 6;

// Colours come from the shared tokens, not from picks of this tab: the type badge is the shared `Tag`
// (Figma token map, ETP-3835) and the sign of a quantity uses the semantic colours the grid's
// `signedDelta` cell uses, so a movement reads like any other signed quantity of the app.
const TAG_VARIANT = { in: 'green', out: 'orange', neutral: 'neutral' };
const SIGN_COLOR = {
  in: 'var(--status-success-fg)',
  out: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--foreground))',
};

// The same pill as the "Summary / Warehouses" switch of the side panel (`ProductSidebar`): a `muted`
// track, the selected option on `card` with a soft shadow and a dark label.
const SEGMENT_TRACK = { background: 'hsl(var(--muted))' };
const SEGMENT_ACTIVE = { background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontWeight: 500 };
const SEGMENT_IDLE = { color: 'hsl(var(--foreground))', fontWeight: 400 };

const rowsOf = (json) => json?.response?.data ?? json?.data ?? [];
// NEO's own `totalRows` is only a lower bound on a partial page (the rows returned plus one), so it must
// not be used as a count. The backend sends the exact total as `etgoTotalRows`; without it there is no
// counter rather than a wrong one.
const ARIA_SORT = { asc: 'ascending', desc: 'descending' };

const totalOf = (json) => {
  const total = json?.response?.etgoTotalRows;
  return total == null ? Number.NaN : Number(total);
};

function DocumentLink({ row, label, openInNewTab }) {
  const open = () => {
    window.open(`${window.location.origin}${getRouterBase()}/${row.etgoDocWindow}/${row.etgoDocHeaderId}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <button
      type="button"
      onClick={open}
      data-testid="product-movements-doc-link"
      className="group inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--foreground))]"
    >
      <span className="border-b border-[hsl(var(--text-disabled))] transition-colors group-hover:border-[hsl(var(--foreground))]">{label}</span>
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{openInNewTab}</span>
    </button>
  );
}

function MovementRow({ row, ui, currency }) {
  const { labelKey, tone } = resolveMovementType(row);
  const typeLabel = labelKey ? ui(labelKey) : (row['movementType$_identifier'] ?? row.movementType ?? '—');
  const hasDocument = row.etgoDocWindow && row.etgoDocHeaderId && row.etgoDocLabel;
  const formatQuantity = (n) => formatGroupedNumber(n, { maximumFractionDigits: 2 });

  return (
    <div role="row" className={`${GRID} border-b border-border/50 px-3 py-3 text-sm`} data-testid="product-movements-row">
      <span role="cell" className="font-medium tabular-nums">{formatCalendarDate(row.movementDate)}</span>
      <div role="cell" className="flex flex-col items-start gap-1">
        <Tag variant={TAG_VARIANT[tone]}>{typeLabel}</Tag>
        {hasDocument ? <DocumentLink row={row} label={row.etgoDocLabel} openInNewTab={ui('openFullReport')} /> : null}
      </div>
      <span role="cell" className="truncate">{row['etgoWarehouse$_identifier'] ?? '—'}</span>
      <span role="cell" className="text-right font-semibold tabular-nums" style={{ color: SIGN_COLOR[quantityTone(row.movementQuantity)] }}>
        {signedQuantity(row.movementQuantity, formatQuantity)}
      </span>
      <span role="cell" className="text-right tabular-nums">{formatCurrency(currency, row.transactionCost)}</span>
      <span role="cell" className="text-right font-semibold tabular-nums">
        {row.etgoStockAfter == null ? '—' : formatQuantity(row.etgoStockAfter)}
      </span>
    </div>
  );
}

export default function ProductMovementsTab({ data, apiBaseUrl, isActive, onCountChange, onVisibilityChange }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const currency = useCurrency() ?? 'USD';
  const productId = data?.id;
  // The backend decides per account whether the tab exists (feature flag `product-movements-tab`); while
  // the access map is not loaded, or with the flag off, the tab hides and does nothing at all.
  const enabled = isCapabilityVisible(useCapabilitiesSafe(), PRODUCT_MOVEMENTS_CAPABILITY);
  const visible = enabled && shouldShowMovementsTab(data);
  // Only a saved, stocked product has movements to read or to count.
  const storable = enabled && isStorableProduct(data);

  const [direction, setDirection] = useState('all');
  const [dateRange, setDateRange] = useState(DEFAULT_MOVEMENTS_PERIOD);
  const [warehouseId, setWarehouseId] = useState(null);
  const [sort, setSort] = useState(MOVEMENTS_DEFAULT_SORT);
  const [warehouses, setWarehouses] = useState([]);
  const [total, setTotal] = useState(null);
  const [state, setState] = useState({ rows: [], loading: true, loadingMore: false, error: null, hasMore: false });
  const [everActive, setEverActive] = useState(false);
  const generation = useRef(0);

  // The tab survives a change of record, so nothing of the previous product may outlive it: its counter,
  // its warehouses and its warehouse filter (an option the new product may not have). The state is reset
  // while rendering, so the effects of this same commit already see the clean filters; resetting it in an
  // effect would let the first page of the new product go out with the warehouse of the old one.
  const [stateProductId, setStateProductId] = useState(productId);
  if (stateProductId !== productId) {
    setStateProductId(productId);
    setWarehouseId(null);
    setWarehouses([]);
    setTotal(null);
    setEverActive(Boolean(isActive && storable));
    setState({ rows: [], loading: true, loadingMore: false, error: null, hasMore: false });
  }

  // Side effects of that change cannot run while rendering: the pages of the old product still in flight
  // are dropped by bumping the generation, and the counter of the tab strip is cleared.
  const lastProductId = useRef(productId);
  useEffect(() => {
    if (lastProductId.current === productId) return;
    lastProductId.current = productId;
    generation.current += 1;
    onCountChange?.(undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // The tab is mounted with the record and only hidden while another one is selected, so the data is
  // fetched from the first time it is shown, not from the mount.
  useEffect(() => {
    if (isActive && storable) setEverActive(true);
  }, [isActive, storable]);

  // A service, expense or resource has no stock: the tab hides itself (the counter hides with it).
  const visibilityRef = useRef(onVisibilityChange);
  visibilityRef.current = onVisibilityChange;
  useEffect(() => { visibilityRef.current?.(visible); }, [visible]);

  useProductMovementsTabTracking({ isActive: Boolean(isActive && storable) });

  // Tab counter: every movement of the product, whatever the filters.
  useEffect(() => {
    if (!storable || !productId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(buildMovementsCountQuery(productId));
        if (!res.ok) return;
        const count = totalOf(await res.json());
        if (!cancelled && Number.isFinite(count)) {
          setTotal(count);
          onCountChange?.(count);
        }
      } catch { /* the counter is optional */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, storable, apiFetch]);

  // Warehouses of the filter: the ones the product has stock in (the same source as the side panel).
  useEffect(() => {
    if (!storable || !productId || !everActive) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/stock?parentId=${encodeURIComponent(productId)}&_startRow=0&_endRow=100`);
        if (!res.ok) return;
        const seen = new Map();
        for (const stockRow of rowsOf(await res.json())) {
          if (stockRow.warehouse && !seen.has(stockRow.warehouse)) seen.set(stockRow.warehouse, stockRow['warehouse$_identifier'] ?? stockRow.warehouse);
        }
        if (!cancelled) setWarehouses([...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      } catch { /* without the list the filter just offers every warehouse */ }
    })();
    return () => { cancelled = true; };
  }, [productId, storable, everActive, apiFetch]);

  const filters = useMemo(() => ({ direction, dateRange, warehouseId }), [direction, dateRange, warehouseId]);

  const loadPage = useCallback(async (start) => {
    const mine = ++generation.current;
    setState((prev) => (start === 0
      ? { rows: [], loading: true, loadingMore: false, error: null, hasMore: false }
      : { ...prev, loadingMore: true }));
    try {
      const res = await apiFetch(buildMovementsQuery({ productId, filters, sort, start }));
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const page = rowsOf(await res.json());
      if (mine !== generation.current) return;
      setState((prev) => ({
        rows: start === 0 ? page : [...prev.rows, ...page],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: page.length === MOVEMENTS_PAGE_SIZE,
      }));
    } catch (error) {
      if (mine !== generation.current) return;
      setState((prev) => ({ ...prev, loading: false, loadingMore: false, error: error.message }));
    }
  }, [apiFetch, productId, filters, sort]);

  // Any change of the view starts again from the first page.
  useEffect(() => {
    if (!storable || !productId || !everActive) return;
    loadPage(0);
  }, [storable, productId, everActive, loadPage]);

  const onScroll = (event) => {
    const el = event.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - NEAR_BOTTOM_PX;
    if (nearBottom && state.hasMore && !state.loading && !state.loadingMore) loadPage(state.rows.length);
  };

  const toggleSort = (key) => {
    if (!isMovementsSortKey(key)) return;
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  };

  // Nothing to show while the product is unsaved (DetailView disables the tab, but a route state can
  // still open it) or not stocked.
  if (!visible || !storable) return null;

  // `aria-sort` belongs on the header cell, and only the column the list is sorted by carries a direction.
  const ariaSort = (key) => (sort.key === key ? ARIA_SORT[sort.direction] : 'none');

  const header = (key, labelKey, align) => (
    <SortableHeaderLabel
      label={ui(labelKey)}
      sortKey={key}
      activeKey={sort.key}
      direction={sort.direction}
      onSort={key === 'stockAfter' ? undefined : toggleSort}
      align={align} />
  );

  const noMovementsAtAll = total === 0;

  return (
    <div className="flex flex-col gap-3" data-testid="product-movements-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={ui('productMovementsDirection')} className="inline-flex h-10 items-center gap-1 rounded-xl p-1" style={SEGMENT_TRACK} data-testid="product-movements-direction">
          {[['all', 'all'], ['in', 'productMovementsIn'], ['out', 'productMovementsOut']].map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              aria-pressed={direction === value}
              onClick={() => setDirection(value)}
              className={`h-8 rounded-lg px-3 text-sm transition-all${direction === value ? ' shadow-sm' : ''}`}
              style={direction === value ? SEGMENT_ACTIVE : SEGMENT_IDLE}
            >
              {ui(labelKey)}
            </button>
          ))}
        </div>
        <DateRangePopover value={dateRange} onChange={setDateRange} />
        <Select value={warehouseId ?? 'all'} onValueChange={(value) => setWarehouseId(value === 'all' ? null : value)}>
          <SelectTrigger className="w-[200px]" aria-label={ui('productMovementsWarehouse')} data-testid="product-movements-warehouse">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ui('productMovementsAllWarehouses')}</SelectItem>
            {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* A keyboard user must be able to focus the scrollable list to scroll it and load the next page. */}
      <div
        role="table"
        aria-label={ui('productMovements')}
        aria-busy={state.loading || state.loadingMore}
        tabIndex={0}
        className="max-h-[calc(100vh-420px)] min-h-[200px] overflow-y-auto rounded-lg border border-border"
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

        {state.loading ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} aria-hidden="true" className={`${GRID} border-b border-border/50 px-3 py-3`} data-testid="product-movements-skeleton">
            {Array.from({ length: 6 }, (__, j) => <Skeleton key={j} className="h-4 w-full" />)}
          </div>
        )) : null}

        {state.error ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center" role="alert" data-testid="product-movements-error">
            <p className="text-sm text-destructive">{ui('productMovementsError')}</p>
            {/* A failed first load starts again; a failed page asks for that same page again. */}
            <Button type="button" variant="outline" size="sm" onClick={() => loadPage(state.rows.length)} data-testid="product-movements-retry">
              {ui('retry')}
            </Button>
          </div>
        ) : null}

        {!state.loading && !state.error && state.rows.length === 0 ? (
          noMovementsAtAll ? (
            <div className="flex flex-col items-center gap-1 p-10 text-center" data-testid="product-movements-empty">
              <ArrowLeftRight className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="font-semibold">{ui('noStockMovements')}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{ui('productMovementsEmptyText')}</p>
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground" data-testid="product-movements-no-results">{ui('productMovementsNoResults')}</p>
          )
        ) : null}

        {state.rows.map((row) => <MovementRow key={row.id} row={row} ui={ui} currency={currency} />)}

        {state.loadingMore ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : null}
      </div>
    </div>
  );
}

// ETP-5309: the tab cannot work on an unsaved product, so DetailView shows it disabled, with this hint.
ProductMovementsTab.requiresSavedRecord = true;
ProductMovementsTab.savedRecordHintKey = 'productMovementsSaveFirstHint';
