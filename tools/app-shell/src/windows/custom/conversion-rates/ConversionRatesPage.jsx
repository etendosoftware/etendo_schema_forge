import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FunnelSimpleIcon, LinkSimpleIcon, PlusIcon } from '@phosphor-icons/react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useCurrency, useCurrencyId } from '@/hooks/useCurrency.jsx';
import { useCopyPageLink } from '@/hooks/useCopyLinkAction.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { getCurrencySymbol } from '@/lib/formatCurrency.js';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/contract-ui/RefreshButton.jsx';
import { ListSortPopover } from '@/components/contract-ui/ListSortPopover.jsx';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import { CurrentRatesSection } from './CurrentRatesSection.jsx';
import { RateHistorySection } from './RateHistorySection.jsx';
import { ManualRateDialog, DIALOG_MODES } from './ManualRateDialog.jsx';
import { fetchCurrentRates, fetchHistory, deleteManualRate } from './conversionRatesApi.js';
import {
  DEFAULT_PERIOD, PERIODS, ORIGINS, STATUSES,
  buildHistoryCriteria, groupRatesByCurrency, periodBounds,
} from './conversionRatesModel.js';

const ICON_BUTTON_CLASS = 'h-10 w-10 flex items-center justify-center rounded-lg border border-border text-[#828FA3] hover:bg-[hsl(var(--muted))] transition-colors';
const DEFAULT_SORT = { key: 'validFromDate', direction: 'desc' };

/** History filters, kept in the URL so "Copiar enlace" shares them and Back restores them. */
export function readFilters(params) {
  const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
  return {
    currencyId: params.get('currency') || null,
    period: pick('period', PERIODS, DEFAULT_PERIOD),
    customFrom: params.get('from') || null,
    customTo: params.get('to') || null,
    origin: pick('origin', ORIGINS, 'all'),
    status: pick('status', STATUSES, 'all'),
  };
}

export function writeFilters(filters, showAll) {
  const params = new URLSearchParams();
  if (filters.currencyId) params.set('currency', filters.currencyId);
  if (filters.period !== DEFAULT_PERIOD) params.set('period', filters.period);
  if (filters.period === 'custom' && filters.customFrom) params.set('from', filters.customFrom);
  if (filters.period === 'custom' && filters.customTo) params.set('to', filters.customTo);
  if (filters.origin !== 'all') params.set('origin', filters.origin);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (showAll) params.set('all', '1');
  return params;
}

/** Display name of the organization currency ("Euro"), from Intl — the AD name is not served here. */
function currencyDisplayName(iso, locale) {
  if (!iso) return '';
  try {
    const name = new Intl.DisplayNames([String(locale || 'es_ES').replace('_', '-')], { type: 'currency' }).of(iso);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
  } catch {
    return '';
  }
}

function Legend({ ui }) {
  return (
    <section aria-label={ui('convRateLegend')} className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground" data-testid="convrate-legend">
      <span><b className="font-semibold text-[#17663A]">{ui('convRateStatusCurrent')}</b>{ui('convRateLegendCurrent')}</span>
      <span><b className="font-semibold text-foreground">{ui('convRateStatusUnused')}</b>{ui('convRateLegendUnused')}</span>
      <span><b className="font-semibold text-[#8A6100]">{ui('convRateStatusPosted')}</b>{ui('convRateLegendPosted')}</span>
      <span>{ui('convRateLegendActions')}</span>
    </section>
  );
}

/**
 * ETP-6365 — "Conversión de divisas" (Currency Conversion), the redesign of the Conversion Rates
 * window (spec `conversion-rates`, entity `conversionRate`). Three blocks:
 *
 * 1. "Vigentes hoy": the rate in force now per currency (action `currentRates`);
 * 2. "Histórico": the forward rates grouped by currency, filtered in the backend;
 * 3. the legend.
 *
 * Writes are manual rates only: "Nueva divisa" (a first rate for a currency with none), "+ Nueva
 * tasa" (a new range for a manual currency), and Modificar / Eliminar on a manual row not yet
 * used in accounting. Every rule (inverse rate, closing the previous range, overlap, the lock)
 * is enforced by the server; this page shows its preview and its messages.
 */
export default function ConversionRatesPage({ apiBaseUrl }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const orgIso = useCurrency();
  const orgCurrencyId = useCurrencyId();
  const orgName = useMemo(() => currencyDisplayName(orgIso, locale), [orgIso, locale]);
  const orgSymbol = getCurrencySymbol(orgIso);
  const title = ui('convRateWindowTitle');

  // ── Filters (URL) ───────────────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-parse only when the query changes
  const filters = useMemo(() => readFilters(searchParams), [searchKey]);
  const showAll = searchParams.get('all') === '1';
  const updateFilters = useCallback((patch) => {
    setSearchParams(writeFilters({ ...filters, ...patch }, showAll), { replace: true });
  }, [filters, showAll, setSearchParams]);
  const toggleShowAll = useCallback(() => {
    setSearchParams(writeFilters(filters, !showAll), { replace: true });
  }, [filters, showAll, setSearchParams]);
  const [filtersVisible, setFiltersVisible] = useState(true);

  // ── "Vigentes hoy" ──────────────────────────────────────────────────────────
  const [currentRates, setCurrentRates] = useState([]);
  const [currentLoading, setCurrentLoading] = useState(true);
  const loadCurrent = useCallback(async (signal) => {
    setCurrentLoading(true);
    try {
      setCurrentRates(await fetchCurrentRates(apiFetch, signal));
    } catch (e) {
      if (e?.name !== 'AbortError') setCurrentRates([]);
    } finally {
      if (!signal?.aborted) setCurrentLoading(false);
    }
  }, [apiFetch]);

  // ── "Histórico" ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const criteria = useMemo(() => buildHistoryCriteria({
    orgCurrencyId,
    currencyId: filters.currencyId,
    origin: filters.origin,
    status: filters.status,
    bounds: periodBounds(filters.period, { from: filters.customFrom, to: filters.customTo }),
  }), [orgCurrencyId, filters]);
  const historyAbort = useRef(null);
  const loadHistory = useCallback(async () => {
    // Without the organization currency the inverse rows could not be told apart: wait for it.
    if (!orgCurrencyId) return;
    historyAbort.current?.abort();
    const ctrl = new AbortController();
    historyAbort.current = ctrl;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const data = await fetchHistory(apiFetch, criteria, ctrl.signal);
      if (historyAbort.current === ctrl) setRows(data);
    } catch (e) {
      if (e?.name !== 'AbortError' && historyAbort.current === ctrl) {
        setRows([]);
        setHistoryError(true);
      }
    } finally {
      if (historyAbort.current === ctrl) {
        setHistoryLoading(false);
        setHistoryLoaded(true);
      }
    }
  }, [apiFetch, criteria, orgCurrencyId]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadCurrent(ctrl.signal);
    return () => ctrl.abort();
  }, [loadCurrent]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => () => historyAbort.current?.abort(), []);

  const reloadAll = useCallback(() => {
    loadCurrent();
    loadHistory();
  }, [loadCurrent, loadHistory]);

  // ── Grouping, sort, collapse ────────────────────────────────────────────────
  const [sort, setSort] = useState(DEFAULT_SORT);
  const currencyInfo = useMemo(() => new Map(currentRates.map((r) => [r.currencyId, r])), [currentRates]);
  const groups = useMemo(() => groupRatesByCurrency(rows, {
    currencyOrder: currentRates.map((r) => r.currencyId),
    showAll,
    sort,
  }), [rows, currentRates, showAll, sort]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleGroup = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const sortColumns = useMemo(() => [
    { key: 'validFromDate', labels: { [locale]: ui('convRateValidFromDateTime') } },
    { key: 'validToDate', labels: { [locale]: ui('convRateValidToDateTime') } },
    { key: 'multipleRateBy', labels: { [locale]: ui('convRateOneOrg', { currency: orgIso ?? '' }) } },
  ], [ui, locale, orgIso]);
  const selectSort = useCallback((key) => {
    setSort((prev) => (prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'desc' }));
  }, []);

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  const [dialog, setDialog] = useState(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const openNewCurrency = useCallback(() => setDialog({ mode: DIALOG_MODES.NEW_CURRENCY }), []);
  const openNewRate = useCallback((rateOrId) => {
    const info = typeof rateOrId === 'string' ? currencyInfo.get(rateOrId) : rateOrId;
    const group = typeof rateOrId === 'string' ? groups.find((g) => g.currencyId === rateOrId) : null;
    const currency = info ?? { currencyId: rateOrId, isoCode: group?.identifier ?? '' };
    setDialog({ mode: DIALOG_MODES.NEW_RATE, currency });
  }, [currencyInfo, groups]);
  const openEdit = useCallback((row) => {
    const info = currencyInfo.get(row.toCurrency);
    setDialog({
      mode: DIALOG_MODES.EDIT,
      row,
      currency: info ?? { currencyId: row.toCurrency, isoCode: row['toCurrency$_identifier'] ?? '' },
    });
  }, [currencyInfo]);
  const onSaved = useCallback(() => {
    setDialog(null);
    toast.success(ui('convRateSaved'));
    reloadAll();
  }, [ui, reloadAll]);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const confirmDelete = useCallback(async () => {
    const row = pendingDelete;
    if (!row) return;
    setDeletingId(row.id);
    try {
      const res = await deleteManualRate(apiFetch, row.id);
      if (!res.ok) {
        toast.error(await extractErrorMessage(res, ui));
        return;
      }
      toast.success(ui('convRateDeleted'));
      setPendingDelete(null);
      reloadAll();
    } catch (e) {
      toast.error(e?.message || ui('convRateDeleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }, [pendingDelete, apiFetch, ui, reloadAll]);

  // ── Page meta / toolbar ─────────────────────────────────────────────────────
  useSetPageMeta({
    title,
    breadcrumb: `${ui('finance')} / ${title}`,
    recordCount: historyLoaded ? rows.length : undefined,
  }, [title, rows.length, historyLoaded]);
  const copyPageLink = useCopyPageLink();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-tl-2xl bg-card" data-testid="convrate-page">
      <div className="flex flex-col gap-5 px-4 pb-8 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="convrate-toolbar">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersVisible((v) => !v)}
            aria-expanded={filtersVisible}
            aria-controls="convrate-history-filters"
            className="h-10 gap-1.5 rounded-lg bg-card px-3 text-sm font-normal"
            data-testid="convrate-toggle-filters">
            <FunnelSimpleIcon className="h-5 w-5 text-[#828FA3]" data-testid="FunnelSimpleIcon__convrate" />
            {ui('filters')}
          </Button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyPageLink}
              title={ui('copyLink')}
              aria-label={ui('copyLink')}
              className={ICON_BUTTON_CLASS}
              data-testid="convrate-share">
              <LinkSimpleIcon className="h-5 w-5" data-testid="LinkSimpleIcon__convrate" />
            </button>
            <ListSortPopover
              columns={sortColumns}
              sortColumn={sort.key}
              sortDirection={sort.direction}
              onSelect={selectSort}
              onClear={() => setSort(DEFAULT_SORT)}
              isDefaultSort={sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction}
              data-testid="ListSortPopover__convrate" />
            <RefreshButton onRefresh={reloadAll} label={ui('refresh')} data-testid="RefreshButton__convrate" />
            <Button
              type="button"
              onClick={openNewCurrency}
              className="h-10 gap-2 rounded-lg pl-2 pr-3 text-sm font-medium [&_svg]:size-5"
              data-testid="convrate-new-currency">
              <PlusIcon className="h-5 w-5" data-testid="PlusIcon__convrate" />
              {ui('convRateNewCurrency')}
            </Button>
          </div>
        </div>

        <CurrentRatesSection
          rates={currentRates}
          orgIso={orgIso}
          loading={currentLoading}
          ui={ui}
          onNewRate={openNewRate}
          data-testid="CurrentRatesSection__86dbea" />

        <RateHistorySection
          groups={groups}
          currencyInfo={currencyInfo}
          currencies={currentRates}
          orgIso={orgIso ?? ''}
          orgSymbol={orgSymbol}
          filters={filters}
          onFiltersChange={updateFilters}
          filtersVisible={filtersVisible}
          loading={historyLoading}
          loaded={historyLoaded}
          error={historyError}
          showAll={showAll}
          onToggleShowAll={toggleShowAll}
          collapsed={collapsed}
          onToggleGroup={toggleGroup}
          onNewRate={openNewRate}
          onEdit={openEdit}
          onDelete={setPendingDelete}
          deletingId={deletingId}
          ui={ui}
          data-testid="RateHistorySection__86dbea" />

        <Legend ui={ui} data-testid="Legend__86dbea" />
      </div>

      {dialog && (
        <ManualRateDialog
          open
          mode={dialog.mode}
          currency={dialog.currency}
          row={dialog.row}
          orgIso={orgIso ?? ''}
          orgName={orgName}
          apiFetch={apiFetch}
          onClose={closeDialog}
          onSaved={onSaved}
          ui={ui}
          data-testid="ManualRateDialog__86dbea" />
      )}
      <DeleteConfirmDialog
        open={pendingDelete != null}
        count={1}
        deleting={deletingId != null}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
        testIdScope="convrate-delete"
        notice={<p className="text-sm text-muted-foreground" data-testid="convrate-delete-notice">{ui('convRateDeleteNotice')}</p>}
        data-testid="DeleteConfirmDialog__86dbea" />
    </div>
  );
}
