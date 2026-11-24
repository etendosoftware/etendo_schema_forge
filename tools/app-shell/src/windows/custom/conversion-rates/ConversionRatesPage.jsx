import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LinkSimpleIcon, PlusIcon, PrinterIcon } from '@phosphor-icons/react';
import { DistinctValuesFilter } from '@etendosoftware/app-shell-core/components/ui/distinct-values-filter.jsx';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useCurrency, useCurrencyId } from '@/hooks/useCurrency.jsx';
import { useCopyPageLink } from '@/hooks/useCopyLinkAction.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { getCurrencySymbol } from '@/lib/formatCurrency.js';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { RefreshButton } from '@/components/contract-ui/RefreshButton.jsx';
import { ListSortPopover } from '@/components/contract-ui/ListSortPopover.jsx';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import ReportDrawer from '@/components/contract-ui/ReportDrawer.jsx';
import { CurrencyRatesList } from './CurrencyRatesList.jsx';
import { ManualRateDialog, DIALOG_MODES } from './ManualRateDialog.jsx';
import { fetchCurrentRates, fetchHistory, deleteManualRate } from './conversionRatesApi.js';
import {
  DEFAULT_PERIOD, PERIODS, STATUSES, RATE_STATUS,
  buildHistoryCriteria, buildCurrencyList, periodBounds, displayValidTo, formatWallClock,
} from './conversionRatesModel.js';
import { formatRate } from './conversionRatesFormat.js';

// Same chrome as ListView's toolbar icon buttons (outline Button, 40px square, grey icon).
const ICON_BUTTON_CLASS = 'h-10 w-10 rounded-lg bg-card p-0 font-normal text-[#828FA3] hover:bg-[hsl(var(--muted))] hover:text-[#828FA3] [&_svg]:size-5';
const DEFAULT_SORT = { key: 'validFromDate', direction: 'desc' };
const PERIOD_LABEL = {
  last30: 'convRatePeriodLast30',
  thisMonth: 'convRatePeriodThisMonth',
  thisYear: 'convRatePeriodThisYear',
  custom: 'convRatePeriodCustom',
};
const STATUS_LABEL = { [RATE_STATUS.CURRENT]: 'convRateStatusCurrent', [RATE_STATUS.HISTORIC]: 'convRateStatusHistoric' };

/** Filters, kept in the URL so "Copiar enlace" shares them and Back restores them. */
export function readFilters(params) {
  const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
  return {
    currencyId: params.get('currency') || null,
    period: pick('period', PERIODS, DEFAULT_PERIOD),
    customFrom: params.get('from') || null,
    customTo: params.get('to') || null,
    status: pick('status', STATUSES, 'all'),
  };
}

export function writeFilters(filters) {
  const params = new URLSearchParams();
  if (filters.currencyId) params.set('currency', filters.currencyId);
  if (filters.period !== DEFAULT_PERIOD) params.set('period', filters.period);
  if (filters.period === 'custom' && filters.customFrom) params.set('from', filters.customFrom);
  if (filters.period === 'custom' && filters.customTo) params.set('to', filters.customTo);
  if (filters.status !== 'all') params.set('status', filters.status);
  return params;
}

/** Display name of a currency ("Euro"), from Intl — used where no action serves the AD name. */
function currencyDisplayName(iso, locale) {
  if (!iso) return '';
  try {
    const name = new Intl.DisplayNames([String(locale || 'es_ES').replace('_', '-')], { type: 'currency' }).of(iso);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
  } catch {
    return '';
  }
}

/**
 * Print rows: every forward rate of the listed currencies, in list order, as display strings (the
 * drawer prints what it is given).
 */
export function buildPrintRows(entries, ui) {
  const out = [];
  for (const entry of entries) {
    for (const row of entry.rows) {
      out.push({
        currency: entry.isoCode,
        origin: ui(row.sMFCRSynced === true ? 'convRateOriginAuto' : 'convRateOriginManual'),
        validFrom: formatWallClock(row.validFromDate),
        validTo: displayValidTo(row) ?? '—',
        rate: formatRate(row.multipleRateBy),
        inverse: formatRate(row.divideRateBy),
        status: ui(STATUS_LABEL[row.etgoRateStatus] ?? 'convRateStatusHistoric'),
      });
    }
  }
  return out;
}

/**
 * ETP-6365 — "Conversión de divisas" (Currency Conversion), the redesign of the Conversion Rates
 * window (spec `conversion-rates`, entity `conversionRate`), design v3: a toolbar with the
 * Divisa / Periodo / Estado filters, and ONE accordion list with a row per currency (rate in force
 * from `currentRates`) that expands into its rates of the period (forward rows, filtered in the
 * backend).
 *
 * Writes are manual rates only: "Nueva divisa" (a first rate for a currency with none), "+ Nueva
 * tasa" (a new range for a manual currency), Modificar (the rate only) and Eliminar on any manual
 * row. Every rule (inverse rate, closing the previous range, overlap, no future start) is enforced
 * by the server; this page shows its preview and its messages.
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
  const updateFilters = useCallback((patch) => {
    setSearchParams(writeFilters({ ...filters, ...patch }), { replace: true });
  }, [filters, setSearchParams]);

  // ── Rates in force (currency header lines) ──────────────────────────────────
  const [currentRates, setCurrentRates] = useState([]);
  const loadCurrent = useCallback(async (signal) => {
    try {
      setCurrentRates(await fetchCurrentRates(apiFetch, signal));
    } catch (e) {
      if (e?.name !== 'AbortError') setCurrentRates([]);
    }
  }, [apiFetch]);

  // ── Rates of the period (expanded content) ──────────────────────────────────
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const criteria = useMemo(() => buildHistoryCriteria({
    orgCurrencyId,
    currencyId: filters.currencyId,
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
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchHistory(apiFetch, criteria, ctrl.signal);
      if (historyAbort.current === ctrl) setRows(data);
    } catch (e) {
      if (e?.name !== 'AbortError' && historyAbort.current === ctrl) {
        setRows([]);
        setLoadError(true);
      }
    } finally {
      if (historyAbort.current === ctrl) {
        setLoading(false);
        setLoaded(true);
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

  // ── Currency list, sort, accordion ──────────────────────────────────────────
  const [sort, setSort] = useState(DEFAULT_SORT);
  const entries = useMemo(() => buildCurrencyList(currentRates, rows, { currencyId: filters.currencyId, sort })
    .map((e) => ({
      ...e,
      name: e.name || currencyDisplayName(e.isoCode, locale),
      symbol: e.symbol || getCurrencySymbol(e.isoCode),
    })), [currentRates, rows, filters.currencyId, sort, locale]);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.currencyId, e])), [entries]);
  // Divisa options: every currency known to the page, not narrowed by the Divisa filter itself.
  const currencyOptions = useMemo(
    () => buildCurrencyList(currentRates, rows).map((e) => ({ id: e.currencyId, iso: e.isoCode })),
    [currentRates, rows],
  );
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleCurrency = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Filtering by one currency opens it.
  useEffect(() => {
    if (filters.currencyId) setExpanded((prev) => (prev.has(filters.currencyId) ? prev : new Set(prev).add(filters.currencyId)));
  }, [filters.currencyId]);
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
  const openNewRate = useCallback((entry) => setDialog({ mode: DIALOG_MODES.NEW_RATE, currency: entry }), []);
  const openEdit = useCallback((row) => {
    const entry = entryById.get(row.toCurrency);
    setDialog({
      mode: DIALOG_MODES.EDIT,
      row,
      currency: entry ?? { currencyId: row.toCurrency, isoCode: row['toCurrency$_identifier'] ?? '' },
    });
  }, [entryById]);
  const onSaved = useCallback(() => {
    setDialog(null);
    toast.success(ui('convRateSaved'));
    reloadAll();
  }, [ui, reloadAll]);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Synchronous in-flight guard: `deletingId` disables the button only after a render, which a
  // fast double click on "Eliminar" can beat.
  const deleteInFlight = useRef(false);
  const confirmDelete = useCallback(async () => {
    const row = pendingDelete;
    if (!row || deleteInFlight.current) return;
    deleteInFlight.current = true;
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
      deleteInFlight.current = false;
      setDeletingId(null);
    }
  }, [pendingDelete, apiFetch, ui, reloadAll]);

  // ── Page meta / toolbar ─────────────────────────────────────────────────────
  useSetPageMeta({
    title,
    breadcrumb: `${ui('finance')} / ${title}`,
    recordCount: loaded ? entries.length : undefined,
  }, [title, entries.length, loaded]);
  const copyPageLink = useCopyPageLink();

  // ── Imprimir: the app's list print drawer, fed with the listed rates ────────
  const [printOpen, setPrintOpen] = useState(false);
  const printColumns = useMemo(() => [
    { key: 'currency', label: ui('convRateCurrency') },
    { key: 'origin', label: ui('convRateOrigin') },
    { key: 'validFrom', label: ui('convRateValidFromDateTime') },
    { key: 'validTo', label: ui('convRateValidToDateTime') },
    { key: 'rate', label: ui('convRateOneOrg', { currency: orgIso ?? '' }) },
    { key: 'inverse', label: ui('convRateInverseHeader', { currency: orgIso ?? '' }) },
    { key: 'status', label: ui('convRateStatus') },
  ], [ui, orgIso]);
  const printRows = useMemo(() => (printOpen ? buildPrintRows(entries, ui) : null), [printOpen, entries, ui]);
  const printFilters = useMemo(() => {
    const list = [];
    if (filters.currencyId) {
      list.push({ label: ui('convRateCurrency'), value: entryById.get(filters.currencyId)?.isoCode ?? filters.currencyId });
    }
    list.push({ label: ui('convRatePeriod'), value: ui(PERIOD_LABEL[filters.period]) });
    if (filters.status !== 'all') list.push({ label: ui('convRateStatus'), value: ui(STATUS_LABEL[filters.status]) });
    return list;
  }, [filters, entryById, ui]);

  const isoById = useMemo(() => new Map(currencyOptions.map((o) => [o.id, o.iso])), [currencyOptions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-tl-2xl bg-card" data-testid="convrate-page">
      <div className="flex flex-col gap-5 px-4 pb-8 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="convrate-toolbar">
          <div className="flex flex-wrap items-center gap-2" data-testid="convrate-filters">
            <DistinctValuesFilter
              value={filters.currencyId}
              onChange={(v) => updateFilters({ currencyId: v || null })}
              codes={currencyOptions.map((o) => o.id)}
              labelFor={(id) => isoById.get(id) ?? id}
              allLabel={ui('convRateAllCurrencies')}
              heading={ui('convRateCurrency')}
              searchPlaceholder={ui('searchValues')}
              popoverWidth="w-56"
              triggerTestId="convrate-filter-currency"
              data-testid="DistinctValuesFilter__convrate-currency" />
            <DistinctValuesFilter
              value={filters.period}
              onChange={(v) => updateFilters({ period: v || DEFAULT_PERIOD })}
              codes={[...PERIODS]}
              labelFor={(p) => ui(PERIOD_LABEL[p])}
              allLabel={null}
              heading={ui('convRatePeriod')}
              searchable={false}
              searchPlaceholder={ui('searchValues')}
              popoverWidth="w-56"
              triggerTestId="convrate-filter-period"
              data-testid="DistinctValuesFilter__convrate-period" />
            {filters.period === 'custom' && (
              <>
                <div className="w-[160px]">
                  <DateField
                    value={filters.customFrom ?? ''}
                    onChange={(iso) => updateFilters({ customFrom: iso || null })}
                    placeholder={ui('convRatePeriodFrom')}
                    data-testid="convrate-filter-custom-from" />
                </div>
                <div className="w-[160px]">
                  <DateField
                    value={filters.customTo ?? ''}
                    onChange={(iso) => updateFilters({ customTo: iso || null })}
                    placeholder={ui('convRatePeriodTo')}
                    data-testid="convrate-filter-custom-to" />
                </div>
              </>
            )}
            <DistinctValuesFilter
              value={filters.status === 'all' ? null : filters.status}
              onChange={(v) => updateFilters({ status: v || 'all' })}
              codes={[RATE_STATUS.CURRENT, RATE_STATUS.HISTORIC]}
              labelFor={(st) => ui(STATUS_LABEL[st])}
              allLabel={ui('convRateAllStatuses')}
              heading={ui('convRateStatus')}
              searchable={false}
              searchPlaceholder={ui('searchValues')}
              popoverWidth="w-56"
              triggerTestId="convrate-filter-status"
              data-testid="DistinctValuesFilter__convrate-status" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyPageLink}
              title={ui('copyLink')}
              aria-label={ui('copyLink')}
              className={ICON_BUTTON_CLASS}
              data-testid="convrate-share">
              <LinkSimpleIcon className="h-5 w-5" data-testid="LinkSimpleIcon__convrate" />
            </Button>
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
              variant="outline"
              size="sm"
              onClick={() => setPrintOpen(true)}
              aria-label={ui('print')}
              title={ui('print')}
              className={ICON_BUTTON_CLASS}
              data-testid="convrate-print">
              <PrinterIcon className="h-5 w-5" data-testid="PrinterIcon__convrate" />
            </Button>
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

        <CurrencyRatesList
          entries={entries}
          orgIso={orgIso ?? ''}
          orgSymbol={orgSymbol}
          expanded={expanded}
          onToggle={toggleCurrency}
          loading={loading}
          loaded={loaded}
          error={loadError}
          onNewRate={openNewRate}
          onEdit={openEdit}
          onDelete={setPendingDelete}
          deletingId={deletingId}
          ui={ui}
          data-testid="CurrencyRatesList__convrate" />
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
        title={ui('convRateDeleteTitle')}
        message={pendingDelete ? ui('convRateDeleteMessage', {
          currency: entryById.get(pendingDelete.toCurrency)?.isoCode ?? pendingDelete['toCurrency$_identifier'] ?? '',
          from: formatWallClock(pendingDelete.validFromDate),
        }) : null}
        notice={<p className="text-sm text-muted-foreground" data-testid="convrate-delete-notice">{ui('convRateDeleteNotice')}</p>}
        data-testid="DeleteConfirmDialog__86dbea" />
      <ReportDrawer
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        windowName="conversion-rates"
        title={title}
        columns={printColumns}
        rows={printRows}
        activeFilters={printFilters}
        apiBaseUrl={apiBaseUrl}
        entity="conversionRate"
        data-testid="ReportDrawer__convrate" />
    </div>
  );
}
