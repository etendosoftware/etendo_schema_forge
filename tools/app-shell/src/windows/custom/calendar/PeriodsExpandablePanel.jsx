import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCalendarMonthYear, parseCalendarDate } from '@/lib/dateOnly.js';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProcessParamDialog } from '@/components/contract-ui/ProcessParamDialog';

// Same color mapping as artifacts/open-close-period-control/decisions.json's
// periodControl.status enumVariants — kept in sync manually since this is a custom component,
// not generator-driven output.
const PERIOD_STATUS_VARIANTS = { O: 'green', N: 'neutral', C: 'red', P: 'red', M: 'orange' };

// openClose is not a simple toggle — it's a required 3-state choice (Open/Closed/Permanently
// closed). The backend (PeriodOpenCloseHandler) rejects a request with no
// `fieldValues.openClose` (400 "Missing required parameter: openClose"). These mirror, key-for-
// key and option-for-option, the `params` already declared in
// artifacts/open-close-period-control/decisions.json's `window.processOverrides.openClose` —
// kept in sync manually since this is a hand-written custom panel, not generator output.
// `ProcessParamDialog` (the same generic dialog DetailView's process buttons already use) is
// reused as-is: its prop contract (`open`, `onOpenChange`, `process`, `onConfirm`) has no
// dependency on DetailView/useEntity internals, so any `{label, params}`-shaped object works.
const OPEN_CLOSE_PARAMS = [
  {
    key: 'openClose',
    type: 'select',
    label: 'Action',
    required: true,
    options: [
      { value: 'O', label: 'Open' },
      { value: 'C', label: 'Closed' },
      { value: 'P', label: 'Permanently closed' },
    ],
  },
];
const PERIOD_OPEN_CLOSE_PROCESS = { label: 'Open Close Period', params: OPEN_CLOSE_PARAMS };

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

async function postAction(apiFetch, path, fieldValues) {
  const res = await apiFetch(path, {
    method: 'POST',
    // Matches useEntity.js's handleProcess body shape exactly — the backend reads the chosen
    // value via context.getRequestBody().optJSONObject("fieldValues").optString("openClose").
    body: JSON.stringify({ fieldValues }),
  });
  if (!res.ok) throw new Error(`Action failed: ${res.status}`);
  return res.json();
}

export default function PeriodsExpandablePanel({ parentId, apiBaseUrl }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  // Three distinct states, not just null vs array (same convention as AccountingPanel):
  // `undefined` = loading, `null` = the request failed, an array = loaded (possibly empty).
  const [periods, setPeriods] = useState(undefined);
  // Per-action pending flags keyed by `period-{id}` — disables the triggering button while its
  // request is in flight, guarding against double-submission on rapid double-click (matching
  // CloseYearConfirmModal's `submitting` pattern).
  const [pendingActions, setPendingActions] = useState({});
  // The period whose open/close dialog is currently open, if any. Clicking "Abrir/Cerrar
  // Periodo" no longer fires the POST directly — openClose is a required 3-state choice, not a
  // toggle, so the choice must be collected first.
  const [dialogPeriodId, setDialogPeriodId] = useState(null);

  // Fetches (or re-fetches) the periods list without touching the loading/error state — used
  // both by the mount effect (which resets to `undefined` itself first, below) and, silently,
  // to refresh the aggregate status badge right after a period action succeeds. A stale badge
  // left showing the pre-action status until a manual F5 was the exact bug being fixed here.
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
    loadPeriods();
  }, [parentId, loadPeriods]);

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

  const runAction = useCallback(async (key, path, fieldValues, onSuccess) => {
    setPendingActions((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
    try {
      await postAction(apiFetch, path, fieldValues);
      // Targeted refetch of just the affected data (never a full page reload) so the status
      // badge reflects the new value immediately, instead of staying stale until a manual F5.
      await onSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setPendingActions((prev) => ({ ...prev, [key]: false }));
    }
  }, [apiFetch, ui]);

  // Opens the shared ProcessParamDialog instead of firing the request directly — the actual
  // POST happens in handleDialogConfirm once the user picks Open/Closed/Permanently closed.
  const openClosePeriod = useCallback((periodId) => {
    setDialogPeriodId(periodId);
  }, []);

  const handleDialogConfirm = useCallback((paramValues) => {
    if (!dialogPeriodId) return;
    const id = dialogPeriodId;
    setDialogPeriodId(null);
    // Opens/closes EVERY C_PeriodControl row for this period in one DB transaction (AD Process
    // 167 — "Opens/Closes all PeriodControl for a C_Period"); this is already the global
    // mechanism, per-document-type open/close was removed (ETP-4948).
    runAction(`period-${id}`, `/periodControl/${id}/action/openClose`, paramValues, loadPeriods);
  }, [dialogPeriodId, runAction, loadPeriods]);

  if (periods === undefined) {
    return <div data-testid="periods-expandable-panel-loading" className="p-4 text-sm text-muted-foreground">{ui('loading')}</div>;
  }
  if (periods === null) {
    return <div data-testid="periods-expandable-panel-error" className="p-4 text-sm text-destructive">{ui('periodsLoadError')}</div>;
  }

  return (
    <div className="overflow-x-auto" data-testid="periods-expandable-panel">
      <Table data-testid="Table__711967">
        <TableHeader data-testid="TableHeader__711967">
          <TableRow data-testid="TableRow__711967">
            <TableHead data-testid="TableHead__711967">{ui('calendarPeriod')}</TableHead>
            <TableHead className="w-44" data-testid="TableHead__711967">{ui('calendarStatus')}</TableHead>
            <TableHead className="w-44 text-right" data-testid="TableHead__711967">{ui('calendarActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__711967">
          {periods.map((period) => {
            const periodPending = !!pendingActions[`period-${period.id}`];
            return (
              <TableRow key={period.id} data-testid="TableRow__711967">
                <TableCell className="font-medium" data-testid={`period-name-${period.id}`}>
                  {formatPeriodName(period, locale)}
                  {period.periodType === 'A' && (
                    <span className="ml-2 inline-block align-middle" data-testid={`period-adjustment-badge-${period.id}`}>
                      <Tag
                        variant="neutral"
                        label={ui('calendarAdjustmentPeriod')}
                        data-testid="Tag__711967" />
                    </span>
                  )}
                </TableCell>
                <TableCell data-testid={`period-status-${period.id}`}>
                  <Tag
                    variant={PERIOD_STATUS_VARIANTS[period.status] ?? 'neutral'}
                    label={ui(PERIOD_STATUS_LABEL_KEYS[period.status] ?? period.status)}
                    data-testid="Tag__711967" />
                </TableCell>
                <TableCell className="text-right" data-testid="TableCell__711967">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={`period-openclose-${period.id}`}
                    onClick={() => openClosePeriod(period.id)}
                    disabled={periodPending}
                  >
                    {ui('openClosePeriod')}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ProcessParamDialog
        open={!!dialogPeriodId}
        onOpenChange={(next) => { if (!next) setDialogPeriodId(null); }}
        process={PERIOD_OPEN_CLOSE_PROCESS}
        onConfirm={handleDialogConfirm}
        data-testid="ProcessParamDialog__711967" />
    </div>
  );
}
