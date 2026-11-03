import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate, todayCalendarISO } from '@/lib/dateOnly.js';
import { buildReportFilename } from '@/pages/ReportViewerPage.jsx';
import DynamicReportPanel from './DynamicReportPanel.jsx';
import DynamicReportTable from './DynamicReportTable.jsx';
import DynamicDrillPanel from './DynamicDrillPanel.jsx';
import { useReportQuery } from './useReportQuery.js';
import { useReportDefaults } from './useReportDefaults.js';
import { useAccountSplit } from './useAccountSplit.js';
import { REPORT_EVENTS, filterTypeOf, useReportTelemetry } from './reportTelemetry.js';
import { comparisonPeriod, matchingShortcut, openingPeriod, pickedYearPeriod, shortcutPeriod } from './dynamicDates.js';
import { expandAll, expansionForLevel, visibleRows } from './reportTree.js';

const EXPORTS = [
  { format: 'pdf', label: 'PDF', icon: FileDown },
  { format: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { format: 'csv', label: 'CSV', icon: FileText },
];
const SPLIT_DIMENSIONS = [['org', 'orgId'], ['bpartner', 'bPartnerId'], ['product', 'productId']];
const ERROR_KEYS = { org_access_denied: 'dynamicReportErrorOrgAccess' };
const NO_ROWS_EXPANDED = new Set();

const pick = (labelObj, locale) => labelObj?.[locale] || labelObj?.en_US || labelObj?.es_ES || '';

/** Filters the view starts on, and goes back to with "Limpiar filtros". */
function initialState(defaultOrgId, period, level) {
  return {
    orgId: defaultOrgId || '', dateFrom: period?.dateFrom || '', dateTo: period?.dateTo || '',
    bPartnerId: '', _display_bPartnerId: '', productId: '', _display_productId: '',
    compare: '', splitBy: '', level,
  };
}

/**
 * ETP-6080 — the interactive report view (behind `dynamic-reports`). Opens on the fiscal year that
 * contains today (§19), applies every change on its own through `useReportQuery`, folds the tree
 * on screen, compares with a preset period and splits leaf accounts by a dimension. The exports
 * print what the screen shows: same params plus `expandedNodeIds`. `source` ('menu' | 'deep_link')
 * is how the report was opened, for `report_opened` (F10).
 */
export default function DynamicReportView({ report, onBack, selectedOrgId, roleOrgs = [], source = 'deep_link' }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch('');
  const title = pick(report.title, locale) || report.id;

  const params = report.parameters || [];
  const paramOf = (name) => params.find((p) => p.name === name);
  const label = (name) => pick(paramOf(name)?.label, locale) || name;
  const sectionLabel = (id) => pick((report.sections || []).find((s) => s.id === id)?.label, locale);
  const levelParam = paramOf('accountLevel');
  const defaultLevel = levelParam?.default || 'C';
  const levelOptions = (levelParam?.options || []).map((o) => ({ value: o.value, label: pick(o.label, locale) }));
  const splitDimensions = SPLIT_DIMENSIONS.map(([value, name]) => ({ value, label: label(name) }));
  // Q7: the org picker only when the role reaches more than one org; `0` (*) is not an org to pick.
  const orgs = useMemo(() => roleOrgs.filter((o) => o?.id && o.id !== '0'), [roleOrgs]);

  useSetPageMeta({
    title,
    breadcrumb: [{ label: tMenu('Finance') }, { label: tMenu('Reports'), href: `/report-viewer?category=${report.category || 'finance'}` }, { label: title }],
  }, [title]);

  const defaults = useReportDefaults(selectedOrgId);
  const [today] = useState(() => todayCalendarISO());
  const opening = useMemo(() => (defaults.loading ? null : openingPeriod(defaults.years, today)), [defaults.loading, defaults.years, today]);
  const [state, setState] = useState(() => initialState(selectedOrgId, null, defaultLevel));
  // The opening period lands once the years have loaded; a user edit before that is kept.
  useEffect(() => {
    if (opening) setState((s) => (s.dateFrom ? s : { ...s, dateFrom: opening.dateFrom, dateTo: opening.dateTo }));
  }, [opening]);

  const change = useCallback((patch) => setState((s) => ({ ...s, ...patch })), []);
  const reference = comparisonPeriod(state.compare, state);
  const queryParams = useMemo(() => ({
    acctSchemaId: defaults.acctSchemaId || '',
    orgId: state.orgId,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
    bPartnerId: state.bPartnerId,
    productId: state.productId,
    showOnlyAccountsWithValue: 'true',
    compareTo: reference ? 'true' : 'false',
    fromReferenceDate: reference?.fromReferenceDate || '',
    toReferenceDate: reference?.toReferenceDate || '',
  }), [defaults.acctSchemaId, state.orgId, state.dateFrom, state.dateTo, state.bPartnerId, state.productId, reference?.fromReferenceDate, reference?.toReferenceDate]);

  const { data, loading, error, errorCode, settled } = useReportQuery(report.id, queryParams, { locale });
  const telemetry = useReportTelemetry(report.id, { source, paramsKey: JSON.stringify(queryParams), settled, errorCode });
  // A user's change: marked for report_filter_applied. The defaults and "Limpiar filtros" are not.
  const userChange = (patch) => { telemetry.markFilter(filterTypeOf(patch)); change(patch); };
  const groupToggled = (type) => telemetry.emit(REPORT_EVENTS.GROUP_TOGGLED, { type, outcome: 'success' });
  // The query waits for the schema (isQueryReady); a role that sees none would wait forever.
  const noSchema = !defaults.loading && !defaults.acctSchemaId;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const compare = queryParams.compareTo === 'true' && Boolean(data) && rows.some((r) => 'variationAmount' in r);

  // Expansion: the level sets it; the user then folds rows one by one. First data → the level's expansion.
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    if (expanded === null && rows.length) setExpanded(expansionForLevel(rows, state.level));
  }, [rows, expanded, state.level]);
  const expandedSet = expanded ?? NO_ROWS_EXPANDED;
  const shown = useMemo(() => visibleRows(rows, expandedSet), [rows, expandedSet]);
  const toggleRow = (id) => {
    groupToggled(expandedSet.has(id) ? 'collapse' : 'expand');
    setExpanded((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // The level folds on screen: nothing loads, so the change is applied at once.
  const setLevel = (level) => {
    telemetry.emit(REPORT_EVENTS.FILTER_APPLIED, { type: 'account_level', outcome: 'success' });
    change({ level });
    setExpanded(expansionForLevel(rows, level));
  };

  const [drillAccount, setDrillAccount] = useState(null);
  const { splits, toggle: toggleSplit } = useAccountSplit(report.id, queryParams, state.splitBy, { locale });

  const shortcut = matchingShortcut(state, defaults.years, today);
  const onShortcut = (kind) => userChange(kind === 'year' ? openingPeriod(defaults.years, today) : shortcutPeriod(kind, today));
  const reset = () => { setState(initialState(selectedOrgId, opening, defaultLevel)); setExpanded(expansionForLevel(rows, defaultLevel)); };

  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  const exportAs = async (format) => {
    setExporting(format);
    setExportError(null);
    try {
      const res = await apiFetch(`/api/reports/${report.id}/render`, {
        method: 'POST',
        baseUrl: '',
        timeout: 0, // a render can take longer than the read default
        body: JSON.stringify({
          format,
          locale,
          params: { ...queryParams, accountLevel: state.level, expandedNodeIds: [...expandedSet].join(',') },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = buildReportFilename(report.id, format);
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(ui('dynamicReportErrorGeneric'));
    }
    setExporting(null);
  };

  const fmt = (d) => (d ? formatCalendarDate(d, locale.replace('_', '-')) : '');
  const orgName = orgs.find((o) => o.id === state.orgId)?.name;
  const chips = [
    { key: 'period', label: ui('dynamicReportPeriodChip'), value: `${fmt(state.dateFrom)} – ${fmt(state.dateTo)}` },
    orgName && { key: 'org', label: label('orgId'), value: orgName },
    state.bPartnerId && { key: 'bp', label: label('bPartnerId'), value: state._display_bPartnerId, clear: { bPartnerId: '', _display_bPartnerId: '' } },
    state.productId && { key: 'product', label: label('productId'), value: state._display_productId, clear: { productId: '', _display_productId: '' } },
    reference && { key: 'compare', label: ui('dynamicReportComparedWith'), value: `${fmt(reference.fromReferenceDate)} – ${fmt(reference.toReferenceDate)}`, clear: { compare: '' } },
    state.splitBy && { key: 'split', label: ui('dynamicReportSplitChip'), value: splitDimensions.find((d) => d.value === state.splitBy)?.label, clear: { splitBy: '' } },
  ].filter(Boolean);

  const errorText = error && (errorCode === 'network' ? error : ui(ERROR_KEYS[errorCode] || 'dynamicReportErrorGeneric'));

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="DynamicReportView">
      <div className="flex items-center justify-between px-2 py-2 bg-card border-b border-border/30 shrink-0">
        <Button variant="outline" className="h-9 px-3 rounded-lg" data-testid="action-cancel" onClick={onBack}>
          {ui('cancel')}
        </Button>
        <div className="flex items-center gap-1">
          {EXPORTS.map(({ format, label: text, icon: Icon }) => (
            <Button
              key={format}
              variant="ghost"
              className="h-9 px-3 gap-1.5 text-sm"
              disabled={!data || exporting !== null}
              onClick={() => exportAs(format)}
              data-testid={`DynamicReportView__export-${format}`}
            >
              {exporting === format ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              {text}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <DynamicReportPanel
          state={state}
          onChange={userChange}
          onShortcut={onShortcut}
          onPickYear={(y) => y && userChange(pickedYearPeriod(y, today))}
          onLevel={setLevel}
          onExpandAll={() => { groupToggled('expand_all'); setExpanded(expandAll(rows)); }}
          onCollapseAll={() => { groupToggled('collapse_all'); setExpanded(new Set()); }}
          onReset={reset}
          shortcut={shortcut}
          years={defaults.years}
          orgs={orgs}
          splitDimensions={splitDimensions}
          levelOptions={levelOptions}
          label={label}
          sectionLabel={sectionLabel}
          noFiscalYear={Boolean(opening?.noFiscalYear)}
        />

        <main className="flex-1 min-w-0 overflow-auto p-4">
          <div className="bg-card rounded-xl border border-border/40 p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold" data-testid="DynamicReportView__title">{title}</h2>
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" data-testid="DynamicReportView__loading" />}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 my-3 text-xs text-muted-foreground" data-testid="DynamicReportView__chips">
              {chips.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1" data-testid={`DynamicReportView__chip-${c.key}`}>
                  {c.label}: <b className="text-foreground font-semibold">{c.value}</b>
                  {c.clear && (
                    <button
                      type="button"
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-muted"
                      aria-label={ui('dynamicReportRemoveFilter', { label: c.label })}
                      onClick={() => userChange(c.clear)}
                      data-testid={`DynamicReportView__chipRemove-${c.key}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {(errorText || exportError) && (
              <p role="alert" className="text-sm text-destructive mb-3" data-testid="DynamicReportView__error">{errorText || exportError}</p>
            )}

            {(noSchema || (data && !rows.length)) && <p className="text-sm text-muted-foreground" data-testid="DynamicReportView__empty">{ui('noResults')}</p>}
            {rows.length > 0 && (
              <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
                <DynamicReportTable
                  rows={shown}
                  compare={compare}
                  expanded={expandedSet}
                  onToggle={toggleRow}
                  splitBy={state.splitBy}
                  splits={splits}
                  onToggleSplit={toggleSplit}
                  onOpenLedger={setDrillAccount}
                />
              </div>
            )}
          </div>
        </main>
      </div>
      <DynamicDrillPanel reportTitle={title} account={drillAccount} queryParams={queryParams} session={telemetry.session} onClose={() => setDrillAccount(null)} />
    </div>
  );
}
