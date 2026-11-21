import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleNotchIcon, DownloadSimpleIcon, FileTextIcon, FileXlsIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate, todayCalendarISO } from '@/lib/dateOnly.js';
import { buildReportFilename } from '@/pages/ReportViewerPage.jsx';
import { reportCategoryMenuKey } from '@/components/reports/reportCategories.js';
import DynamicReportPanel from './DynamicReportPanel.jsx';
import DynamicReportTable from './DynamicReportTable.jsx';
import DynamicReportKpis from './DynamicReportKpis.jsx';
import { RESULT_REPORT_IDS } from './dynamicReports.js';
import { kpiCards, reportKpis } from './reportVisuals.js';
import DynamicDrillPanel from './DynamicDrillPanel.jsx';
import DynamicResultPanel from './DynamicResultPanel.jsx';
import { ENTRY_REPORT_ID, LEDGER_REPORT_ID, drillRowOf } from './drillDown.js';
import DynamicReportBalance from './DynamicReportBalance.jsx';
import { useReportQuery } from './useReportQuery.js';
import { useReportPanelCollapsed } from './useReportPanelCollapsed.js';
import { useReportDefaults } from './useReportDefaults.js';
import { useAccountSplit } from './useAccountSplit.js';
import { useBalanceAtDate } from './useBalanceAtDate.js';
import { REPORT_EVENTS, filterTypeOf, useReportTelemetry } from './reportTelemetry.js';
import { endShortcutDate, ledgerStartFor, matchingShortcut, matchingYear, openingPeriod, periodBuckets, pickedYearPeriod, serializePeriods, shortcutPeriod } from './dynamicDates.js';
import { modeHiddenCount, periodLimit, exportTooLong as isExportTooLong, columnModel, modeOf, rowsForMode } from './reportColumns.js';
import { readReportUrlState, reportOffers, urlStateSpec, writeReportUrlState } from './reportUrlState.js';
import { useRestoredPickerNames } from './useRestoredPickerNames.js';
import { expandedNodeIdsParam, foldExpansion, levelHiddenIds, visibleRows } from './reportTree.js';

const EXPORTS = [
  { format: 'pdf', label: 'PDF', icon: DownloadSimpleIcon },
  { format: 'xlsx', label: 'Excel', icon: FileXlsIcon },
  { format: 'csv', label: 'CSV', icon: FileTextIcon },
];
const SPLIT_DIMENSIONS = [['org', 'orgId'], ['bpartner', 'bPartnerId'], ['product', 'productId']];

/** Same rule as the org picker: the Organización split only exists for a role with several orgs. */
function splitDimensionsFor(multiOrg, label) {
  return SPLIT_DIMENSIONS.filter(([value]) => value !== 'org' || multiOrg).map(([value, name]) => ({ value, label: label(name) }));
}
const COLUMN_LABELS = { total: 'dynamicReportColumnsTotal', month: 'dynamicReportColumnsMonth', quarter: 'dynamicReportColumnsQuarter' };
const ERROR_KEYS = { org_access_denied: 'reportErrorOrgAccess', report_access_denied: 'reportErrorReportAccess', report_timeout: 'reportErrorTimeout',
  period_range_too_long: 'reportErrorPeriodRangeTooLong', invalid_periods: 'reportErrorInvalidPeriods',
};

/** The error line of a failed query: a network failure carries its own translated message. */
function queryErrorText(error, errorCode, ui) {
  if (!error) return error;
  return errorCode === 'network' ? error : ui(ERROR_KEYS[errorCode] || 'dynamicReportErrorGeneric');
}

/** POSTs the render request and saves the file; a refusal throws an Error carrying the server's lowercased `code`. */
async function downloadRender(apiFetch, reportId, format, body) {
  const res = await apiFetch(`/api/reports/${reportId}/render`, {
    method: 'POST',
    baseUrl: '',
    timeout: 0, // a render can take longer than the read default
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const code = String((await res.json().catch(() => null))?.code ?? '').toLowerCase();
    throw Object.assign(new Error(`HTTP ${res.status}`), { code });
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = buildReportFilename(reportId, format);
  a.click();
  URL.revokeObjectURL(url);
}

/** The chips under the title: the active filters, each one with a `clear` removable. */
function buildChips({ state, ui, label, fmt, orgName, multiOrg, reference, splitDimensions, pickers, groupByOptions, asOf = false }) {
  return [
    // A balance at a date (ETP-6083) has no period: the chip names the date.
    asOf
      ? { key: 'period', label: ui('dynamicReportAsOfChip'), value: fmt(state.dateTo) }
      : { key: 'period', label: ui('dynamicReportPeriodChip'), value: `${fmt(state.dateFrom)} – ${fmt(state.dateTo)}` },
    // The org has no `clear` on purpose: the query requires one, so it is changed in the panel, never removed.
    // Shown only for a multi-org role (the export header keeps the name regardless).
    multiOrg && orgName && { key: 'org', label: label('orgId'), value: orgName },
    // One chip per filter the contract declares; the P&L's two keep their historical keys.
    ...pickers.map(({ name }) => state[name] && { key: CHIP_KEYS[name] ?? name, label: label(name), value: state[`_display_${name}`] || state[name], clear: { [name]: '', [`_display_${name}`]: '', [`_names_${name}`]: null } }),
    state.groupBy && { key: 'groupBy', label: label('groupBy'), value: groupByOptions?.find((o) => o.value === state.groupBy)?.label ?? state.groupBy, clear: { groupBy: '' } },
    state.columns !== 'total' && { key: 'columns', label: ui('dynamicReportColumns'), value: ui(COLUMN_LABELS[state.columns]), clear: { columns: 'total' } },
    reference && { key: 'compare', label: ui('dynamicReportComparedWith'), value: reference.from === reference.to ? fmt(reference.to) : `${fmt(reference.from)} – ${fmt(reference.to)}`, clear: { compare: '' } },
    state.splitBy && { key: 'split', label: ui('dynamicReportSplitChip'), value: splitDimensions.find((d) => d.value === state.splitBy)?.label, clear: { splitBy: '' } },
  ].filter(Boolean);
}

const CHIP_KEYS = { bPartnerId: 'bp', productId: 'product' };
const isOn = (value) => value === true || value === 'true';

const pick = (labelObj, locale) => labelObj?.[locale] || labelObj?.en_US || labelObj?.es_ES || '';

/**
 * Filters the view starts on, and goes back to with "Limpiar filtros". `config` (from the contract): the pickers it
 * declares and the option toggles with their defaults (ETP-6084: the P&L has two pickers and no toggles).
 */
function initialState(defaultOrgId, period, level, config) {
  const state = {
    orgId: defaultOrgId || '', dateFrom: period?.dateFrom || '', dateTo: period?.dateTo || '',
    compare: '', columns: 'total', splitBy: '', level, groupBy: '', compareMovements: false,
    ...config.toggleDefaults,
  };
  for (const { name } of config.pickers) Object.assign(state, { [name]: '', [`_display_${name}`]: '', [`_names_${name}`]: null });
  return state;
}

/** The fold with `id` flipped from its base (open becomes closed and back); the input is not mutated. */
function flipFoldedRow(fold, id) {
  const flipped = new Set(fold.flipped);
  if (flipped.has(id)) flipped.delete(id); else flipped.add(id);
  return { ...fold, flipped };
}

/** ETP-6084: what the contract declares drives the filters, the toggles, the grouping and the amount columns. */
function useContractReportConfig(report, locale) {
  const params = report.parameters || [];
  const chartTree = report.tree === 'chart';
  const amountColumns = report.amountColumns ?? null;
  const pickers = useMemo(() => urlStateSpec(report).pickers, [report]);
  const toggleParams = useMemo(
    () => (chartTree ? params.filter((p) => p.type === 'toggle' && !p.hidden && p.name !== 'compareTo') : []),
    [chartTree, params],
  );
  const config = useMemo(
    () => ({ pickers, toggleDefaults: Object.fromEntries(toggleParams.map((p) => [p.name, isOn(p.default)])) }),
    [pickers, toggleParams],
  );
  // The grouping's options: the parameter's own, or (as the old viewer) one per dimension filter that declares a `groupByValue`.
  const groupByOptions = useMemo(() => {
    const declared = params.find((p) => p.name === 'groupBy');
    if (!chartTree || !declared) return null;
    const options = declared.options ?? params.filter((p) => p.groupByValue).map((p) => ({ value: p.groupByValue, label: p.label }));
    return options.map((o) => ({ value: o.value, label: pick(o.label, locale) }));
  }, [chartTree, params, locale]);
  const levelParam = params.find((p) => p.name === 'accountLevel');
  const defaultLevel = levelParam?.default || 'C';
  // ETP-6083: an option only the old viewer acts on (`legacyOnly`) is not offered here; `maxIndent` folds by listed-row indent.
  const levelOptions = (levelParam?.options || []).filter((o) => !o.legacyOnly).map((o) => ({ value: o.value, label: pick(o.label, locale), maxIndent: o.maxIndent ?? null }));
  // ETP-6083: a report that is a balance AT A DATE says so in its contract: Desde is the ledger start, Hasta has end-date
  // shortcuts, and the comparisons are one day (`compareTo.compareModes`).
  const ledgerStart = params.find((p) => p.name === 'dateFrom')?.role === 'ledgerStart';
  const endShortcuts = params.find((p) => p.name === 'dateTo')?.shortcuts ?? null;
  const compareModes = params.find((p) => p.name === 'compareTo')?.compareModes ?? null;
  return { chartTree, amountColumns, pickers, toggleParams, config, groupByOptions, defaultLevel, levelOptions, ledgerStart, endShortcuts, compareModes };
}

/** Writes the view state back to the URL (minus the defaults); a no-op when the address already says it. */
function syncReportUrl({ state, report, selectedOrgId, opening, current, onSearchChange }) {
  const next = writeReportUrlState(current, state, report, { orgId: selectedOrgId, dateFrom: opening?.dateFrom, dateTo: opening?.dateTo });
  if (next.replace(/^\?/, '') === current.replace(/^\?/, '')) return;
  if (onSearchChange) onSearchChange(next);
  else window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
}

/** The export buttons of the top bar. */
function ExportButtons({ exporting, disabled, exportTooLong, onExport }) {
  return (
    <div className="flex items-center gap-1">
      {EXPORTS.map(({ format, label: text, icon: Icon }) => (
        <Button
          key={format}
          variant="ghost"
          className="h-9 px-3 gap-1.5 text-sm"
          disabled={disabled || exporting !== null || (exportTooLong && format !== 'pdf')}
          onClick={() => onExport(format)}
          data-testid={`DynamicReportView__export-${format}`}
        >
          {exporting === format ? <CircleNotchIcon className="w-4 h-4 animate-spin" data-testid="Loader2__c51cea" /> : <Icon className="w-4 h-4" data-testid="Icon__c51cea" />}
          {text}
        </Button>
      ))}
    </div>
  );
}

/** The active-filter chips under the title; each one with a `clear` can be removed. */
function ReportChips({ chips, ui, onClear }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 my-3 text-xs text-muted-foreground" data-testid="DynamicReportView__chips">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1" data-testid={`DynamicReportView__chip-${c.key}`}>
          {c.label}: <b className="text-foreground font-semibold">{c.value}</b>
          {c.clear && (
            <button
              type="button"
              className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-muted"
              aria-label={ui('dynamicReportRemoveFilter', { label: c.label })}
              onClick={() => onClear(c.clear)}
              data-testid={`DynamicReportView__chipRemove-${c.key}`}
            >
              <XIcon className="w-3 h-3" data-testid="X__c51cea" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/** The notes under the table: periods hidden by the cap and partial periods. */
function PeriodNotes({ hiddenCount, hasPartial, ui }) {
  if (hiddenCount <= 0 && !hasPartial) return null;
  return (
    <div className="mt-2 text-xs text-muted-foreground" data-testid="DynamicReportView__periodNotes">
      {hiddenCount > 0 && <p data-testid="DynamicReportView__hiddenNote">{ui(hiddenCount === 1 ? 'dynamicReportHiddenPeriodsOne' : 'dynamicReportHiddenPeriods', { count: hiddenCount })}</p>}
      {hasPartial && <p data-testid="DynamicReportView__partialNote">{ui('dynamicReportPartialPeriods')}</p>}
    </div>
  );
}

/** The body under the filters: the empty note, or the balance, the KPIs, the table and the period notes. */
function ReportResults({ ui, data, rows, shown, noSchema, loading, chartTree, partialFilters, productFiltered, onOpenResult, kpis, compare, groups, mode, expanded, onToggle, splitBy, splits, hasRange, onToggleSplit, onOpenLedger, hiddenCount, hasPartial }) {
  return (
    <>
      {(noSchema || (data && !rows.length)) && <p className="text-sm text-muted-foreground" data-testid="DynamicReportView__empty">{ui('noResults')}</p>}
      {rows.length > 0 && (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
          {data?.balance && <DynamicReportBalance balance={data.balance} partial={partialFilters} productFiltered={productFiltered} data-testid="DynamicReportBalance__c51cea" />}
          {kpis && <DynamicReportKpis kpis={kpis} compare={compare} data-testid="DynamicReportKpis__c51cea" />}
          <DynamicReportTable
            rows={shown}
            groups={groups}
            mode={mode}
            expanded={expanded}
            onToggle={onToggle}
            splitBy={splitBy}
            splits={splits}
            onToggleSplit={hasRange ? onToggleSplit : undefined}
            onOpenLedger={onOpenLedger}
            onOpenResult={onOpenResult}
            totals={chartTree ? (data?.totals ?? null) : null}
            data-testid="DynamicReportTable__c51cea" />
          <PeriodNotes
            hiddenCount={hiddenCount}
            hasPartial={hasPartial}
            ui={ui}
            data-testid="PeriodNotes__c51cea" />
        </div>
      )}
    </>
  );
}

/**
 * ETP-6080 — the interactive report view (behind `dynamic-reports`). Opens on the fiscal year that
 * contains today (§19), applies every change on its own through `useReportQuery`, folds the tree
 * on screen, compares with a preset period and splits leaf accounts by a dimension. The exports
 * print what the screen shows: same params plus `expandedNodeIds`. `source` ('menu' | 'deep_link')
 * is how the report was opened, for `report_opened` (F10).
 *
 * ETP-6239 D8: the panel collapses (button, or automatically on Mes/Trimestre). The chips under the
 * title are always shown, so they are the active filters while it is hidden and each one with a
 * `clear` can be removed from there. Exception: the organization chip is not removable, because the
 * query requires an org; it is changed in the panel.
 */
export default function DynamicReportView({ report, onBack, selectedOrgId, roleOrgs = [], source = 'deep_link', reportAccess = null, search, onSearchChange }) {
  // The server refuses a drill step the role cannot open (ETP-6080), so the view does not offer it.
  const canOpen = (id) => Boolean(reportAccess?.[id]);
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch('');
  const title = pick(report.title, locale) || report.id;

  const params = report.parameters || [];
  const paramOf = (name) => params.find((p) => p.name === name);
  const label = (name) => pick(paramOf(name)?.label, locale) || name;
  const selectorOf = (name) => paramOf(name)?.selector;
  const sectionLabel = (id) => pick((report.sections || []).find((s) => s.id === id)?.label, locale);
  const { chartTree, amountColumns, pickers, toggleParams, config, groupByOptions, defaultLevel, levelOptions, ledgerStart, endShortcuts, compareModes } = useContractReportConfig(report, locale);
  // Q7: the org picker only when the role reaches more than one org; `0` (*) is not an org to pick.
  const orgs = useMemo(() => roleOrgs.filter((o) => o?.id && o.id !== '0'), [roleOrgs]);
  // Same rule for the Organización split and chip: with one org there is nothing to tell apart.
  const multiOrg = orgs.length > 1;
  const splitDimensions = splitDimensionsFor(multiOrg, label);

  useSetPageMeta({
    title,
    // The report's own category names the first level (ETP-6389), Finance when it has none.
    breadcrumb: [{ label: tMenu(reportCategoryMenuKey(report.category, 'Finance')) }, { label: tMenu('Reports'), href: `/report-viewer?category=${report.category || 'finance'}` }, { label: title }],
  }, [title]);

  const defaults = useReportDefaults(selectedOrgId);
  const [today] = useState(() => todayCalendarISO());
  const opening = useMemo(() => (defaults.loading ? null : openingPeriod(defaults.years, today)), [defaults.loading, defaults.years, today]);
  // The selections come back from the URL before the first query (no request with the defaults, then a second one).
  // `search` / `onSearchChange` are the router's (the page passes them); on its own the view uses the address bar.
  const [state, setState] = useState(() => ({
    ...initialState(selectedOrgId, null, defaultLevel, config),
    ...readReportUrlState(search ?? window.location.search, report, { orgIds: orgs.map((o) => o.id) }),
  }));
  useRestoredPickerNames(pickers, state, setState);
  // Every change goes back to the URL, minus the defaults (replace: filter tweaks do not fill the back history).
  // Not while the defaults reload (the opening period is unknown then, and the defaults would be written).
  const searchRef = useRef(search);
  searchRef.current = search;
  useEffect(() => {
    if (defaults.loading) return;
    syncReportUrl({ state, report, selectedOrgId, opening, current: searchRef.current ?? window.location.search, onSearchChange });
  }, [state, report, selectedOrgId, opening, defaults.loading, onSearchChange]);
  // The opening period lands once the years have loaded; a user edit before that is kept.
  useEffect(() => {
    if (opening) setState((s) => (s.dateFrom ? s : { ...s, dateFrom: opening.dateFrom, dateTo: opening.dateTo }));
  }, [opening]);

  const change = useCallback((patch) => setState((s) => ({ ...s, ...patch })), []);
  const mode = modeOf(state.compare);
  // ETP-6239: every request carries both compared ranges and the most periods any mode shows, so the comparison is a display choice, not a request.
  // ETP-6083: a report whose Desde is the ledger start asks for the balance at Hasta from the start of its fiscal year, whatever
  // Desde says (the amounts never depend on it): changing Desde sends no request, it only moves where the ledger drill starts.
  const fmt = useCallback((d) => (d ? formatCalendarDate(d, locale.replace('_', '-')) : ''), [locale]);
  const atDate = useBalanceAtDate({ ledgerStart, endShortcuts, compareModes, years: defaults.years, state, today, fmt, ui });
  const { rules, queryFrom, withLedgerStart } = atDate;
  // A deep link's Desde is clamped like an edit is, once the fiscal years are known (they load after the first render).
  useEffect(() => {
    if (!ledgerStart || defaults.loading) return;
    setState((s) => {
      const from = s.dateFrom && s.dateTo ? ledgerStartFor(defaults.years, s.dateFrom, s.dateTo) : s.dateFrom;
      return from === s.dateFrom ? s : { ...s, dateFrom: from };
    });
  }, [ledgerStart, defaults.loading, defaults.years]);
  const range = useMemo(() => ({ dateFrom: queryFrom, dateTo: state.dateTo }), [queryFrom, state.dateTo]);
  const hasRange = Boolean(queryFrom && state.dateTo && queryFrom <= state.dateTo);
  const plan = useMemo(
    () => (hasRange ? periodBuckets(range, state.columns, { maxShown: periodLimit(state.columns, 'none'), rules }) : null),
    [hasRange, range, state.columns, rules],
  );
  const filterValues = JSON.stringify([pickers.map(({ name }) => state[name]), state.groupBy, toggleParams.map((p) => state[p.name])]);
  const queryParams = useMemo(() => ({
    acctSchemaId: defaults.acctSchemaId || '',
    orgId: state.orgId,
    // An invalid range (from > to) leaves the dates blank, so the query, the split and the exports stay idle.
    dateFrom: hasRange ? queryFrom : '',
    dateTo: hasRange ? state.dateTo : '',
    ...Object.fromEntries(pickers.map(({ name }) => [name, state[name]])),
    showOnlyAccountsWithValue: 'true',
    // A chart tree (ETP-6084) sends its own options: the grouping and the toggles, `showOnlyAccountsWithValue` included.
    ...(chartTree && { groupBy: state.groupBy, ...Object.fromEntries(toggleParams.map((p) => [p.name, String(Boolean(state[p.name]))])) }),
    columns: state.columns,
    periods: plan ? serializePeriods(plan.buckets) : '',
    hiddenCount: String(plan?.hiddenCount ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the picker / toggle values are listed as `filterValues`
  }), [defaults.acctSchemaId, state.orgId, queryFrom, state.dateTo, hasRange, filterValues, state.columns, plan]);

  const { data: queried, loading, error: queryError, errorCode: queryErrorCode, settled } = useReportQuery(report.id, queryParams, { locale });
  // From after to is a user error: say so, and show nothing of the previous period under the new one.
  const reversed = Boolean(queryFrom && state.dateTo && queryFrom > state.dateTo);
  const data = reversed ? null : queried;
  const error = queryError;
  const errorCode = queryErrorCode; // telemetry reads this: a client-side refusal is not a server error class
  const telemetry = useReportTelemetry(report.id, { source, paramsKey: JSON.stringify(queryParams), settled, errorCode });
  // D8: the panel hides on a button or on Mes/Trimestre. The button the user was on disappears, so
  // focus moves to the one that replaces it.
  const panel = useReportPanelCollapsed();
  const collapseRef = useRef(null);
  const expandRef = useRef(null);
  const focusAfter = useRef(null);
  const togglePanel = (collapsed, trigger, opts) => {
    telemetry.emit(REPORT_EVENTS.PANEL_TOGGLED, { panelState: collapsed ? 'collapsed' : 'expanded', trigger: trigger ?? 'user', outcome: 'success' });
    focusAfter.current = collapsed ? expandRef : collapseRef;
    panel.setCollapsed(collapsed, opts);
  };
  // A link restored on Mes / Trimestre hides the panel for the session like a manual pick (D8).
  const restoredPeriodColumns = useRef(state.columns !== 'total');
  useEffect(() => {
    // Silent: nothing the user did, so no panel event and no focus move.
    if (restoredPeriodColumns.current && !panel.collapsed) panel.setCollapsed(true, { persist: false });
    restoredPeriodColumns.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  useEffect(() => {
    focusAfter.current?.current?.focus();
    focusAfter.current = null;
  }, [panel.collapsed]);
  // A user's change: marked for report_filter_applied. The defaults and "Limpiar filtros" are not.
  // The comparison sends no request, so there is no result to time: it is emitted here, like `setLevel`.
  const userChange = (rawPatch) => {
    const patch = withLedgerStart(rawPatch);
    // D8: picking Mes/Trimestre hides the panel for this session only (nothing is saved).
    if (patch.columns && patch.columns !== 'total' && !panel.collapsed) togglePanel(true, 'auto_columns', { persist: false });
    if ('compare' in patch) telemetry.emit(REPORT_EVENTS.FILTER_APPLIED, { type: 'comparison', outcome: 'success' });
    // A Desde-only change of a ledger-start report sends no request: nothing to time.
    else if (!(ledgerStart && 'dateFrom' in patch && !('dateTo' in patch))) telemetry.markFilter(filterTypeOf(patch));
    // A new grouping brings dimension rows: its accounts start open (the level base), or the change looks like it did nothing.
    if ('groupBy' in patch) refold('level');
    change(patch);
  };
  const groupToggled = (type) => telemetry.emit(REPORT_EVENTS.GROUP_TOGGLED, { type, outcome: 'success' });
  // The query waits for the schema (isQueryReady); a role that sees none would wait forever.
  const noSchema = !defaults.loading && !defaults.acctSchemaId;
  // What the answer was asked with: an answer is only ever set for the params at hand (a newer change aborts the older request).
  /* eslint-disable react-hooks/exhaustive-deps */
  const answered = useMemo(() => ({ grain: state.columns, periods: data?.periods ?? [], hiddenCount: data?.hiddenCount ?? 0 }), [data]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const rows = useMemo(() => rowsForMode(data?.rows ?? [], mode), [data, mode]);
  const compare = mode !== 'none' && Boolean(data);
  const quarterPrefix = ui('dynamicReportQuarterPrefix');
  const totalLabel = ui('dynamicReportColumnsTotal');
  const groups = useMemo(
    () => columnModel({ periods: answered.periods, grain: answered.grain, mode, locale, quarterPrefix, totalLabel, amountColumns, compareMovements: state.compareMovements, rules }),
    [answered, mode, locale, quarterPrefix, totalLabel, amountColumns, state.compareMovements, rules],
  );
  const reference = compare ? groups.find((g) => g.pos === 0)?.compared : null;
  const hiddenCount = answered.hiddenCount + modeHiddenCount(answered.periods, answered.grain, mode);
  const hasPartial = groups.some((g) => g.partial);

  // Folding: a base (the level, expand all, collapse all) plus the rows the user flipped since,
  // applied to every result, so rows a new filter brings in follow the base.
  const [fold, setFold] = useState(() => ({ base: 'level', flipped: new Set() }));
  // A mixed-level chart (ETP-6084 D6) shows nested same-level nodes at the chosen level and folds their deeper children.
  const maxIndent = levelOptions.find((o) => o.value === state.level)?.maxIndent ?? null;
  const expandedSet = useMemo(() => foldExpansion(rows, fold, state.level, { nested: chartTree, maxIndent }), [rows, fold, state.level, chartTree, maxIndent]);
  const levelHidden = useMemo(() => (chartTree && fold.base === 'level' ? levelHiddenIds(rows, state.level) : null), [chartTree, fold.base, rows, state.level]);
  const kpis = useMemo(() => (RESULT_REPORT_IDS.has(report.id) ? reportKpis(rows) : null), [report.id, rows]);
  const shown = useMemo(() => visibleRows(rows, expandedSet, levelHidden, { foldedSummary: ledgerStart }), [rows, expandedSet, levelHidden, ledgerStart]);
  const refold = (base) => setFold({ base, flipped: new Set() });
  const toggleRow = (id) => {
    groupToggled(expandedSet.has(id) ? 'collapse' : 'expand');
    setFold((f) => flipFoldedRow(f, id));
  };
  // The level folds on screen: nothing loads, so the change is applied at once.
  const setLevel = (level) => {
    telemetry.emit(REPORT_EVENTS.FILTER_APPLIED, { type: 'account_level', outcome: 'success' });
    change({ level });
    refold('level');
  };

  const [drill, setDrill] = useState(null); // { row, range, clicked, calculated }: the account whose ledger is open, the cell's range (null = the view's period) and the amount clicked
  const openLedger = useCallback((row, cellRange, clicked, calculated = 0) => setDrill({ row: drillRowOf(row), range: cellRange, clicked, calculated }), []);
  // ETP-6083: the ledger of a balance reads from the ledger start (Desde, inside the fiscal year of the cell's date) to that date.
  const drillRange = useMemo(() => atDate.drillRange(drill), [atDate.drillRange, drill]);
  // ETP-6083: the income-summary row's explanation: { row, pos, which, range }.
  const [resultInfo, setResultInfo] = useState(null);
  const openResult = useCallback((row, cell) => {
    setResultInfo({ row, ...cell });
    telemetry.emit(REPORT_EVENTS.DRILLDOWN, { type: 'result', outcome: 'success' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- telemetry.emit is stable per session
  }, [telemetry.emit]);
  const { splits, toggle: toggleSplit } = useAccountSplit(report.id, queryParams, state.splitBy, { locale });

  const shortcut = endShortcuts ? atDate.shortcut : matchingShortcut(state, defaults.years, today);
  const onShortcut = (kind) => {
    if (endShortcuts) {
      const dateTo = endShortcutDate(kind, today, defaults.years);
      if (dateTo) userChange({ dateTo });
      return;
    }
    const { dateFrom, dateTo } = kind === 'year' ? openingPeriod(defaults.years, today) : shortcutPeriod(kind, today);
    userChange({ dateFrom, dateTo });
  };
  const reset = () => { setState(initialState(selectedOrgId, opening, defaultLevel, config)); refold('level'); };

  const orgName = orgs.find((o) => o.id === state.orgId)?.name;
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  // PDF prints what the screen shows; Excel / CSV print every period, up to the cap (D5).
  const fullPlan = useMemo(() => (hasRange ? periodBuckets(range, state.columns, { rules }) : null), [hasRange, range, state.columns, rules]);
  const exportTooLong = hasRange && isExportTooLong(fullPlan, state.columns);
  const exportAs = async (format) => {
    setExporting(format);
    setExportError(null);
    // The PDF prints what the screen shows in this mode (a comparison shows fewer periods).
    const exportPlan = format === 'pdf' ? periodBuckets(range, state.columns, { maxShown: periodLimit(state.columns, mode), rules }) : fullPlan;
    try {
      await downloadRender(apiFetch, report.id, format, {
        format,
        locale,
        params: {
          ...queryParams,
          periods: serializePeriods(exportPlan.buckets),
          hiddenCount: String(exportPlan.hiddenCount),
          compareMode: mode,
          // The PDF's headline cards: the very figures on screen (same pure function), as JSON the template parses.
          kpis: format === 'pdf' && kpis ? JSON.stringify(kpiCards(kpis, compare)) : undefined,
          accountLevel: state.level,
          expandedNodeIds: expandedNodeIdsParam(expandedSet),
          // A chart tree prints exactly the rows on screen (level fold, expansion and mode included), by node id.
          ...(chartTree && { visibleNodeIds: shown.length ? shown.map((r) => r.node_id).join(',') : undefined, compareMovements: String(Boolean(state.compareMovements)) }),
          // The exported header names the filters, not their ids (report-filters.js reads `_display_*`).
          _display_orgId: orgName,
          ...Object.fromEntries(pickers.map(({ name }) => [`_display_${name}`, state[`_display_${name}`]])),
        },
      });
    } catch (err) {
      setExportError(ui(ERROR_KEYS[err?.code] || 'dynamicReportErrorGeneric'));
    }
    setExporting(null);
  };

  const chips = buildChips({ state, ui, label, fmt, orgName, multiOrg, reference, splitDimensions, pickers, groupByOptions, asOf: ledgerStart });
  // D8: with any dimension filter or an account range the debits and credits of the shown accounts need not balance.
  const partialFilters = pickers.some(({ name }) => Boolean(state[name]));
  // Opening balances carry no product (ETP-6083): with a product filter the balance of a closed year loses its prior years.
  const productFiltered = pickers.some(({ name, selector }) => String(selector).startsWith('product') && Boolean(state[name]));

  // The strip's badge counts what the user chose to narrow; the period and the (required) org are always on.
  const activeFilterCount = chips.filter((c) => c.clear).length;
  const errorText = reversed ? ui('dynamicReportErrorReversedDates') : queryErrorText(error, errorCode, ui);
  const shownError = errorText || exportError;

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="DynamicReportView">
      <div className="flex items-center justify-between px-2 py-2 bg-card border-b border-border/30 shrink-0">
        <Button variant="outline" className="h-9 px-3 rounded-lg" data-testid="action-cancel" onClick={onBack}>
          {ui('cancel')}
        </Button>
        <ExportButtons
          exporting={exporting}
          disabled={!data || !hasRange}
          exportTooLong={exportTooLong}
          onExport={exportAs}
          data-testid="ExportButtons__c51cea" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <DynamicReportPanel
          selectorOf={selectorOf}
          collapsed={panel.collapsed}
          onToggleCollapsed={togglePanel}
          activeFilterCount={activeFilterCount}
          collapseRef={collapseRef}
          expandRef={expandRef}
          state={state}
          onChange={userChange}
          onShortcut={onShortcut}
          onPickYear={(y) => y && userChange(pickedYearPeriod(y, today))}
          onLevel={setLevel}
          onExpandAll={() => { groupToggled('expand_all'); refold('all'); }}
          onCollapseAll={() => { groupToggled('collapse_all'); refold('none'); }}
          offers={{ ...reportOffers(report), movements: Boolean(amountColumns?.some((a) => a.compare === 'optional')) }}
          pickers={pickers}
          toggles={toggleParams.map((p) => p.name)}
          groupByOptions={groupByOptions}
          onReset={reset}
          shortcut={shortcut}
          yearId={matchingYear(state, defaults.years, today)?.id}
          years={defaults.years}
          orgs={orgs}
          splitDimensions={splitDimensions}
          levelOptions={levelOptions}
          endShortcuts={endShortcuts}
          endShortcutDates={atDate.endShortcutDates}
          ledgerStart={ledgerStart}
          compareOptions={atDate.compareOptions}
          label={label}
          sectionLabel={sectionLabel}
          noFiscalYear={Boolean(opening?.noFiscalYear)}
          data-testid="DynamicReportPanel__c51cea" />

        <main className="flex-1 min-w-0 overflow-auto p-4">
          <div className="bg-card rounded-xl border border-border/40 p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold" data-testid="DynamicReportView__title">{title}</h2>
              {loading && <CircleNotchIcon className="w-4 h-4 animate-spin text-muted-foreground" data-testid="DynamicReportView__loading" />}
            </div>

            <ReportChips
              chips={chips}
              ui={ui}
              onClear={userChange}
              data-testid="ReportChips__c51cea" />

            {exportTooLong && <p className="text-xs text-muted-foreground mb-3" data-testid="DynamicReportView__exportTooLong">{ui('dynamicReportExportTooLong')}</p>}
            {shownError && (
              <p role="alert" className="text-sm text-destructive mb-3" data-testid="DynamicReportView__error">{shownError}</p>
            )}

            <ReportResults
              ui={ui}
              data={data}
              rows={rows}
              shown={shown}
              noSchema={noSchema}
              loading={loading}
              chartTree={chartTree}
              partialFilters={partialFilters}
              productFiltered={productFiltered}
              onOpenResult={openResult}
              kpis={kpis}
              compare={compare}
              groups={groups}
              mode={mode}
              expanded={expandedSet}
              onToggle={toggleRow}
              splitBy={state.splitBy}
              splits={splits}
              hasRange={hasRange}
              onToggleSplit={toggleSplit}
              onOpenLedger={canOpen(LEDGER_REPORT_ID) ? openLedger : null}
              hiddenCount={hiddenCount}
              hasPartial={hasPartial}
              data-testid="ReportResults__c51cea" />
          </div>
        </main>
      </div>
      <DynamicDrillPanel
        reportTitle={title}
        account={drill?.row ?? null}
        range={drillRange}
        atDate={ledgerStart}
        clicked={drill?.clicked ?? null}
        calculated={drill?.calculated ?? 0}
        queryParams={queryParams}
        session={telemetry.session}
        canOpenEntry={canOpen(ENTRY_REPORT_ID)}
        onClose={() => setDrill(null)}
        data-testid="DynamicDrillPanel__c51cea" />
      <DynamicResultPanel
        info={resultInfo}
        years={defaults.years}
        state={state}
        pickers={pickers}
        onOpenLedger={canOpen(LEDGER_REPORT_ID) ? (row, range, clicked, calculated) => { setResultInfo(null); openLedger(row, range, clicked, calculated); } : null}
        onClose={() => setResultInfo(null)}
        data-testid="DynamicResultPanel__c51cea" />
    </div>
  );
}
