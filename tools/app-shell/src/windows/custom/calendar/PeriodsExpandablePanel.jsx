import { useFlaggedGridView } from '@/hooks/useFlaggedGridView.js';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { DoorOpen, Lock } from 'lucide-react';
import { useUI, useLabel, useLocaleSwitch } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCalendarMonthYear, parseCalendarDate } from '@/lib/dateOnly.js';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/contract-ui';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';
import { parseBackendErrorMessage } from '@/lib/backendErrors.js';
import {
  isPeriodBulkSelectable,
  runPeriodsBulkOpenClose,
  summarizePeriodsBulkResults,
} from './periodsBulkOpenClose.js';
import { PeriodsBulkConfirmDialog, PeriodsBulkResultDialog, countedLabel } from './PeriodsBulkDialogs.jsx';

// Same color mapping as artifacts/open-close-period-control/decisions.json's
// periodControl.status enumVariants — kept in sync manually since this is a custom component,
// not generator-driven output.
const PERIOD_STATUS_VARIANTS = { O: 'green', N: 'neutral', C: 'red', P: 'red', M: 'orange' };

// periodControl's LIST endpoint goes through NEO's generic DefaultJsonDataService (classic
// Openbravo datasource), which does NOT support arbitrary `fieldName=value` query params — a
// plain `?year=<id>` is silently ignored and returns ALL periods across every year unfiltered
// (confirmed live). The classic Openbravo `criteria` JSON-array param is the real mechanism.
function yearCriteria(yearId) {
  return `criteria=${encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: yearId }]))}`;
}

// This panel's requests previously sent no Accept-Language header at all via a hand-rolled raw
// fetch()/postAction. `apiFetch` (from `@/auth/useApiFetch.js`) sends `Accept-Language` (and
// `Authorization`) on every request automatically now, so no manual header-building is needed
// here anymore. This was verified live (not assumed) to NOT be sufficient on its own for
// translation, though: with the header correctly sent as es_ES (confirmed via captured network
// requests), periodControl — served through NEO's generic DefaultJsonDataService (classic
// Openbravo datasource) — still returned English $_identifier values. The logged-in test user's
// own ad_user.default_ad_language is en_US in this DB, which is the more likely actual authority
// for that datasource's identifier resolution, not the per-request OBContext language. So
// $_identifier can't be relied on for localization here — see PERIOD_STATUS_LABEL_KEYS below for
// the actual fix (client-side enumLabels, same convention DataTable.cellRenderers.jsx's
// renderEnumCell already uses everywhere else).

// The actual fix for the untranslated labels: client-side enumLabels dictionary resolved via
// ui()/tMenu (dictionary.genericLabels), exactly like DataTable.cellRenderers.jsx's
// renderEnumCell() does for every other enum/status column in the app — NOT server
// $_identifier strings (see the note above for why those can't be trusted here). Generated
// directly from the real AD_Ref_List/AD_Ref_List_Trl values already captured in
// artifacts/open-close-period-control/schema-raw.json (enumValues[].name /
// enumValues[].labels.es_ES) — copied from the DB's own real translations, not hand-guessed.
const PERIOD_STATUS_LABEL_KEYS = {
  N: 'calendarPeriodStatusAllNeverOpened',
  O: 'calendarPeriodStatusAllOpened',
  C: 'calendarPeriodStatusAllClosed',
  P: 'calendarPeriodStatusAllPermanentlyClosed',
  M: 'calendarPeriodStatusMixed',
};

const PERIOD_NAME_RE = /^([A-Z][a-z]{2})-(\d{2})$/;
const PERIOD_MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function formatPeriodName(period, locale) {
  const startDate = parseCalendarDate(period.startingDate);
  if (startDate) return formatCalendarMonthYear(startDate, locale);
  const match = String(period.name ?? '').match(PERIOD_NAME_RE);
  if (!match) return period.name;
  const month = PERIOD_MONTHS[match[1]];
  return formatCalendarMonthYear(new Date(2000 + Number(match[2]), month, 1), locale);
}

async function fetchJson(apiFetch, path) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const body = await res.json();
  // periodControl's LIST goes through NEO's generic DefaultJsonDataService (classic Openbravo
  // datasource), which wraps rows as { response: { data: [...] } } — NOT a flat { data: [...] }.
  // Match useEntity.js's exact fallback (data?.response?.data ?? (Array.isArray(data) ? data : []))
  // so a genuinely flat array response (e.g. a future custom handler) still works too.
  return body?.response?.data ?? (Array.isArray(body) ? body : []);
}

const DONE_TOAST_KEYS = { O: 'periodsBulkOpenedToast', C: 'periodsBulkClosedToast', P: 'periodsBulkPermanentlyClosedToast' };
const NOTHING_TO_DO_KEYS = { O: 'periodsBulkNothingToOpen', C: 'periodsBulkNothingToClose', P: 'periodsBulkNothingToClose' };

/**
 * A period's hover actions (ETP-5592), as text links inside DataTable's shared quick-actions
 * cell — same chrome as `NotPostedRowActions`. Only the transitions that change something are
 * offered; a permanently closed period has none. Every link asks for confirmation first, the
 * same dialog as the bulk bar.
 */
export function PeriodRowActions({ period, disabled, onAction }) {
  const ui = useUI();
  if (period.status === 'P') return null;
  const link = (action, labelKey, testId) => (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={action === 'P' ? 'text-destructive' : 'text-foreground'}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onAction(action, period); }}
      data-testid={`${testId}-${period.id}`}>
      {ui(labelKey)}
    </Button>
  );
  return (
    <div
      className="absolute right-0 inset-y-0 z-10 flex h-full flex-row items-center gap-1 px-3 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
      data-testid={`period-row-actions-${period.id}`}>
      {period.status !== 'O' && link('O', 'periodsBulkOpen', 'period-open')}
      {period.status !== 'C' && link('C', 'periodsBulkClose', 'period-close')}
      {link('P', 'periodsClosePermanently', 'period-close-permanent')}
    </div>
  );
}

export default function PeriodsExpandablePanel({ parentId, apiBaseUrl, readOnly = false, onCount }) {
  const ui = useUI();
  const t = useLabel();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  // Three distinct states, not just null vs array (same convention as AccountingPanel):
  // `undefined` = loading, `null` = the request failed, an array = loaded (possibly empty).
  const [periods, setPeriods] = useState(undefined);
  // Selection is owned by DataTable; we mirror the ids (never its row objects, whose status goes
  // stale after a reload) and reset it through `clearSelectionTrigger`.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);
  // The open/close awaiting confirmation: `{ action: 'O'|'C'|'P', periods, bulk }` or null. A
  // row link and the bulk bar share it, so both confirm and run exactly the same way (ETP-5592).
  const [pending, setPending] = useState(null);
  const [running, setRunning] = useState(false);
  // The last run's per-period results, shown only when something failed.
  const [runResult, setRunResult] = useState(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setClearSelectionTrigger((n) => n + 1);
  }, []);

  // Fetches (or re-fetches) the periods list without touching the loading/error state — used
  // both by the mount effect (which resets to `undefined` itself first, below) and, silently,
  // to refresh the status tags right after an open/close succeeds. A stale tag left showing the
  // pre-action status until a manual F5 was the exact bug being fixed here.
  const loadPeriods = useCallback(async () => {
    if (!parentId) return;
    try {
      const data = await fetchJson(apiFetch, `/periodControl?${yearCriteria(parentId)}&_sortBy=startingDate asc`);
      setPeriods(data);
    } catch {
      setPeriods(null);
    }
  }, [parentId, apiFetch]);

  useEffect(() => {
    if (!parentId) return;
    setPeriods(undefined);
    clearSelection();
    loadPeriods();
  }, [parentId, loadPeriods, clearSelection]);

  // Tab count ("Períodos 12"), like every other secondary tab. Keyed on the length only: the
  // `onCount` DetailView passes is a new function on every render.
  useEffect(() => {
    if (Array.isArray(periods)) onCount?.(periods.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods?.length]);

  // "Create Periods" runs in a completely different React subtree — the generated `YearPage`
  // from the `fiscal-calendar` spec (this panel lives on the `open-close-period-control` spec,
  // stitched in via `secondaryTabs`, see the window's own doc for the 3-specs-one-window shape).
  // useEntity.js's handleProcess dispatches a generic `neo:processSuccess` window CustomEvent on
  // any successful process — the same cross-component signal AmortizationLinesTable.jsx and
  // AssetsAmortizationPanel.jsx already listen for to refresh a sibling panel after a header-level
  // process. Filtered on `recordId` only (not `entity`), matching AmortizationLinesTable's
  // convention: this panel only cares whether the event's record is its own year, regardless of
  // which spec/entity actually fired the process.
  useEffect(() => {
    if (!parentId) return undefined;
    function onProcessSuccess(e) {
      if (String(e?.detail?.recordId) !== String(parentId)) return;
      loadPeriods();
    }
    window.addEventListener('neo:processSuccess', onProcessSuccess);
    return () => window.removeEventListener('neo:processSuccess', onProcessSuccess);
  }, [parentId, loadPeriods]);

  // Keeps the query's start-date order, whatever order the boxes were ticked in.
  const selectedPeriods = useMemo(
    () => (Array.isArray(periods)
      ? periods.filter((p) => selectedIds.has(p.id) && isPeriodBulkSelectable(p))
      : []),
    [periods, selectedIds],
  );

  // Opens/closes EVERY C_PeriodControl row of the period in one DB transaction (AD Process 167 —
  // "Opens/Closes all PeriodControl for a C_Period"); per-document-type open/close was removed
  // (ETP-4948). The backend reads `fieldValues.openClose`.
  const postOpenClose = useCallback(async (periodId, openClose) => {
    const res = await apiFetch(`/periodControl/${periodId}/action/openClose`, {
      method: 'POST',
      body: JSON.stringify({ fieldValues: { openClose } }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await parseBackendErrorMessage(res) };
  }, [apiFetch]);

  const handleConfirm = useCallback(async () => {
    const run = pending;
    setPending(null);
    if (!run || run.periods.length === 0) return;
    const { action } = run;
    setRunning(true);
    try {
      const results = await runPeriodsBulkOpenClose(run.periods, action, postOpenClose);
      const { ok, skipped, failed } = summarizePeriodsBulkResults(results);
      if (failed > 0) {
        setRunResult({ action, results });
      } else if (ok === 0) {
        // Every target was already in the target state: nothing was posted.
        toast.info(ui(NOTHING_TO_DO_KEYS[action]));
      } else {
        const suffix = skipped > 0 ? countedLabel(ui, 'periodsBulkSkippedSuffix', skipped) : '';
        toast.success(countedLabel(ui, DONE_TOAST_KEYS[action], ok) + suffix);
      }
      if (run.bulk) clearSelection();
      await loadPeriods();
    } finally {
      setRunning(false);
    }
  }, [pending, postOpenClose, loadPeriods, clearSelection, ui]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: ui('calendarPeriod'),
      type: 'string',
      sortable: false,
      render: (period) => (
        <span className="font-medium" data-testid={`period-name-${period.id}`}>
          {formatPeriodName(period, locale)}
          {period.periodType === 'A' && (
            <span className="ml-2 inline-block align-middle" data-testid={`period-adjustment-badge-${period.id}`}>
              <Tag variant="neutral" label={ui('calendarAdjustmentPeriod')} data-testid="Tag__711967" />
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      label: ui('calendarStatus'),
      type: 'string',
      sortable: false,
      render: (period) => (
        <span data-testid={`period-status-${period.id}`}>
          <Tag
            variant={PERIOD_STATUS_VARIANTS[period.status] ?? 'neutral'}
            label={ui(PERIOD_STATUS_LABEL_KEYS[period.status] ?? period.status)}
            data-testid="Tag__711967" />
        </span>
      ),
    },
  ], [ui, locale]);

  // Use the backing NEO entity, independently of the surrounding route or parent record.
  const { gridView } = useFlaggedGridView({
    spec: 'open-close-period-control',
    entity: 'periodControl',
    columns,
    data: periods ?? [],
    apiBaseUrl,
  });

  if (periods === null) {
    return <div data-testid="periods-expandable-panel-error" className="p-4 text-sm text-destructive">{ui('periodsLoadError')}</div>;
  }
  const loading = periods === undefined;

  return (
    <div data-testid={loading ? 'periods-expandable-panel-loading' : 'periods-expandable-panel'}>
      {gridView.enabled && <GridViewControls
        gridView={gridView}
        gridColumns={columns}
        ui={ui}
        t={t}
        data-testid="GridViewControls__711967" />}
      <DataTable
        gridView={gridView}
        columns={columns}
        data={periods ?? []}
        loading={loading}
        showFooterTotals={false}
        // ETP-5830 — a read-only role sees the periods but cannot open/close them.
        selectable={!readOnly}
        isRowSelectable={isPeriodBulkSelectable}
        onSelectionChange={(rows) => setSelectedIds(new Set(rows.map((r) => r.id)))}
        clearSelectionTrigger={clearSelectionTrigger}
        emptyState={{
          title: ui('periodsEmptyTitle'),
          description: ui('periodsEmptyDescription'),
          testId: 'periods-empty',
        }}
        rowQuickActions={readOnly ? undefined : {
          enabled: true,
          // Fits the three Spanish links ("Abrir" + "Cerrar" + "Cerrar permanentemente…").
          reservedWidthPx: 320,
          render: (period) => (
            <PeriodRowActions
              period={period}
              disabled={running}
              onAction={(action, target) => setPending({ action, periods: [target], bulk: false })}
              data-testid="PeriodRowActions__711967" />
          ),
        }}
        data-testid="periods-table" />
      {/* Floating bulk bar, same component as every other checkbox list (ETP-4972). Portaled,
          so it renders no table markup and sits here as a plain sibling of the table. */}
      <SelectionToolbar
        visible={selectedPeriods.length > 0}
        onClose={clearSelection}
        closeTitle={ui('close')}
        data-testid="period-bulk-bar"
      >
        <span role="status" className="text-sm font-medium" data-testid="period-selection-count">
          {ui('selected').replace('{count}', String(selectedPeriods.length))}
        </span>
        <span className="inline-flex items-center gap-1" data-testid="period-bulk-actions">
          <button
            type="button"
            data-testid="period-bulk-open"
            onClick={() => setPending({ action: 'O', periods: selectedPeriods, bulk: true })}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] disabled:opacity-50"
          >
            <DoorOpen className="h-3.5 w-3.5" data-testid="DoorOpen__periodsBulkBar" />
            {ui('periodsBulkOpen')}
          </button>
          <button
            type="button"
            data-testid="period-bulk-close"
            onClick={() => setPending({ action: 'C', periods: selectedPeriods, bulk: true })}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" data-testid="Lock__periodsBulkBar" />
            {ui('periodsBulkClose')}
          </button>
        </span>
      </SelectionToolbar>
      <PeriodsBulkConfirmDialog
        action={pending?.action}
        periodNames={(pending?.periods ?? []).map((p) => formatPeriodName(p, locale))}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
        data-testid="PeriodsBulkConfirmDialog__711967"
      />
      <PeriodsBulkResultDialog
        action={runResult?.action}
        results={runResult?.results ?? null}
        periodName={(p) => formatPeriodName(p, locale)}
        onClose={() => setRunResult(null)}
        data-testid="PeriodsBulkResultDialog__711967"
      />
    </div>
  );
}
