import { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, ListChecks } from 'lucide-react';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';
import { toast } from 'sonner';
import { useUI, getStoredLocale } from '@/i18n';
import { Tag } from '@/components/ui/tag';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ProcessParamDialog } from '@/components/contract-ui/ProcessParamDialog';
import { useBulkActionToast } from '@/hooks/useBulkActionToast.js';

// Same color mapping as artifacts/open-close-period-control/decisions.json's
// periodControl.status / documents.periodStatus enumVariants — kept in sync manually
// since this is a custom component, not generator-driven output.
const PERIOD_STATUS_VARIANTS = { O: 'green', N: 'neutral', C: 'neutral', P: 'red', M: 'orange' };
const DOCUMENT_STATUS_VARIANTS = { O: 'green', N: 'neutral', C: 'red', P: 'red' };

// openClose is not a simple toggle — it's a required 3-state choice (Open/Closed/Permanently
// closed). The backend (PeriodOpenCloseHandler / PeriodControlDocOpenCloseHandler) rejects a
// request with no `fieldValues.openClose` (400 "Missing required parameter: openClose").
// These mirror, key-for-key and option-for-option, the `params` already declared in
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
const DOCUMENT_OPEN_CLOSE_PROCESS = { label: 'Open Close Document', params: OPEN_CLOSE_PARAMS };

// periodControl's LIST endpoint goes through NEO's generic DefaultJsonDataService (classic
// Openbravo datasource), which does NOT support arbitrary `fieldName=value` query params — a
// plain `?year=<id>` is silently ignored and returns ALL periods across every year unfiltered
// (confirmed live). The classic Openbravo `criteria` JSON-array param is the real mechanism.
function yearCriteria(yearId) {
  return `criteria=${encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: yearId }]))}`;
}

// This panel's raw fetch()/postAction calls sent no Accept-Language header at all, unlike
// useEntity.js's buildHeaders() (used by the rest of the app) — added here for parity and
// because NeoAuthenticator.java's applyRequestLanguage() does read it and call
// OBContext.getOBContext().setLanguage(...) for the request. BUT this was verified live (not
// assumed) to NOT actually be sufficient on its own: with the header correctly sent as es_ES
// (confirmed via captured network requests), periodControl/documents — served through NEO's
// generic DefaultJsonDataService (classic Openbravo datasource) — still returned English
// $_identifier values. The logged-in test user's own ad_user.default_ad_language is en_US in
// this DB, which is the more likely actual authority for that datasource's identifier
// resolution, not the per-request OBContext language. So $_identifier can't be relied on for
// localization here — see PERIOD_STATUS_LABEL_KEYS / DOCUMENT_STATUS_LABEL_KEYS /
// DOCUMENT_CATEGORY_LABEL_KEYS below for the actual fix (client-side enumLabels, same
// convention DataTable.cellRenderers.jsx's renderEnumCell already uses everywhere else). The
// header is still sent since it's correct for other things (e.g. AD_Message translations) and
// doesn't hurt. `getStoredLocale()` (from @/i18n, app-shell-core's useLocaleState.js) is the
// canonical "read the active locale outside of React" helper already published for exactly
// this use case — reused here instead of duplicating useEntity.js's own localStorage read.
function buildLocaleHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Accept-Language': getStoredLocale(),
  };
}

// The actual fix for the untranslated labels: client-side enumLabels dictionaries resolved via
// ui()/tMenu (dictionary.genericLabels), exactly like DataTable.cellRenderers.jsx's
// renderEnumCell() does for every other enum/status column in the app — NOT server
// $_identifier strings (see the note above for why those can't be trusted here). All three
// dictionaries below were generated directly from the real AD_Ref_List/AD_Ref_List_Trl values
// already captured in artifacts/open-close-period-control/schema-raw.json (enumValues[].name /
// enumValues[].labels.es_ES) — copied from the DB's own real translations, not hand-guessed —
// so DOCUMENT_CATEGORY_LABEL_KEYS' 41 codes are accurate despite being a large, tedious set to
// hand-translate from scratch.
const PERIOD_STATUS_LABEL_KEYS = {
  N: 'calendarPeriodStatusAllNeverOpened',
  O: 'calendarPeriodStatusAllOpened',
  C: 'calendarPeriodStatusAllClosed',
  P: 'calendarPeriodStatusAllPermanentlyClosed',
  M: 'calendarPeriodStatusMixed',
};
const DOCUMENT_STATUS_LABEL_KEYS = {
  N: 'calendarDocStatusNeverOpened',
  O: 'calendarDocStatusOpen',
  C: 'calendarDocStatusClosed',
  P: 'calendarDocStatusPermanentlyClosed',
};
const DOCUMENT_CATEGORY_LABEL_KEYS = {
  '---': 'calendarDocCategoryNew',
  APC: 'calendarDocCategoryApCreditMemo',
  API: 'calendarDocCategoryApInvoice',
  APP: 'calendarDocCategoryApPayment',
  APPP: 'calendarDocCategoryApPaymentProposal',
  ARC: 'calendarDocCategoryArCreditMemo',
  ARI: 'calendarDocCategoryArInvoice',
  ARF: 'calendarDocCategoryArProFormaInvoice',
  ARR: 'calendarDocCategoryArReceipt',
  ARRP: 'calendarDocCategoryArReceivableProposal',
  ARI_RM: 'calendarDocCategoryArReturnMaterialInvoice',
  AMZ: 'calendarDocCategoryAmortization',
  CMB: 'calendarDocCategoryBankStatement',
  BSF: 'calendarDocCategoryBankStatementFile',
  CMC: 'calendarDocCategoryCashJournal',
  CAD: 'calendarDocCategoryCostAdjustment',
  DPM: 'calendarDocCategoryDebtPaymentManagement',
  DDB: 'calendarDocCategoryDoubtfulDebt',
  FAT: 'calendarDocCategoryFinancialAccountTransaction',
  GLD: 'calendarDocCategoryGlDocument',
  GLJ: 'calendarDocCategoryGlJournal',
  IAU: 'calendarDocCategoryInventoryAmountUpdate',
  LDC: 'calendarDocCategoryLandedCost',
  LCC: 'calendarDocCategoryLandedCostCost',
  OBCVAT_MS: 'calendarDocCategoryManualCashVatSettlement',
  MXI: 'calendarDocCategoryMatchInvoice',
  MXP: 'calendarDocCategoryMatchPo',
  MMS: 'calendarDocCategoryMaterialDelivery',
  MIC: 'calendarDocCategoryMaterialInternalConsumption',
  MMM: 'calendarDocCategoryMaterialMovement',
  MMI: 'calendarDocCategoryMaterialPhysicalInventory',
  MMP: 'calendarDocCategoryMaterialProduction',
  MMR: 'calendarDocCategoryMaterialReceipt',
  CMA: 'calendarDocCategoryPaymentAllocation',
  PPR: 'calendarDocCategoryPaymentProposal',
  PJI: 'calendarDocCategoryProjectIssue',
  POO: 'calendarDocCategoryPurchaseOrder',
  POR: 'calendarDocCategoryPurchaseRequisition',
  REC: 'calendarDocCategoryReconciliation',
  SOO: 'calendarDocCategorySalesOrder',
  STT: 'calendarDocCategorySettlement',
  STM: 'calendarDocCategorySettlementManual',
  WRE: 'calendarDocCategoryWorkRequirement',
};

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: buildLocaleHeaders(token) });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const body = await res.json();
  // periodControl's LIST goes through NEO's generic DefaultJsonDataService (classic Openbravo
  // datasource), which wraps rows as { response: { data: [...] } } — NOT a flat { data: [...] }.
  // Match useEntity.js's exact fallback (data?.response?.data ?? (Array.isArray(data) ? data : []))
  // so a genuinely flat array response (e.g. a future custom handler) still works too.
  return body?.response?.data ?? (Array.isArray(body) ? body : []);
}

async function postAction(url, token, fieldValues) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...buildLocaleHeaders(token), 'Content-Type': 'application/json' },
    // Matches useEntity.js's handleProcess body shape exactly — the backend reads the chosen
    // value via context.getRequestBody().optJSONObject("fieldValues").optString("openClose").
    body: JSON.stringify({ fieldValues }),
  });
  if (!res.ok) throw new Error(`Action failed: ${res.status}`);
  return res.json();
}

export default function PeriodsExpandablePanel({ parentId, token, apiBaseUrl }) {
  const ui = useUI();
  // Three distinct states, not just null vs array (same convention as AccountingPanel):
  // `undefined` = loading, `null` = the request failed, an array = loaded (possibly empty).
  const [periods, setPeriods] = useState(undefined);
  const [expandedId, setExpandedId] = useState(null);
  const [documentsByPeriod, setDocumentsByPeriod] = useState({});
  const [documentsError, setDocumentsError] = useState({});
  // Per-action pending flags keyed by `period-{id}` / `document-{id}` — disables the
  // triggering button while its request is in flight, guarding against double-submission
  // on rapid double-click (matching CloseYearConfirmModal's `submitting` pattern).
  const [pendingActions, setPendingActions] = useState({});
  // Which row's open/close dialog is currently open, if any: { kind: 'period'|'document'|
  // 'bulk-documents', id?, ids?, periodId }. Clicking "Abrir/Cerrar Periodo"/"Abrir/Cerrar
  // Documento" no longer fires the POST directly — openClose is a required 3-state choice,
  // not a toggle, so the choice must be collected first.
  const [dialogTarget, setDialogTarget] = useState(null);
  // Selected document ids within the currently expanded period only — a Set, not keyed by
  // period, since only one period can be expanded (and therefore have selectable rows) at a
  // time; cleared whenever the expanded period changes (see toggleExpand).
  const [selectedDocIds, setSelectedDocIds] = useState(() => new Set());
  const { showResult: showBulkResult } = useBulkActionToast();

  // Fetches (or re-fetches) the periods list without touching the loading/error state — used
  // both by the mount effect (which resets to `undefined` itself first, below) and, silently,
  // to refresh the aggregate status badge right after a period action succeeds. A stale badge
  // left showing the pre-action status until a manual F5 was the exact bug being fixed here.
  const loadPeriods = useCallback(async () => {
    if (!parentId) return;
    try {
      const data = await fetchJson(`${apiBaseUrl}/periodControl?${yearCriteria(parentId)}`, token);
      setPeriods(data);
    } catch {
      setPeriods(null);
    }
  }, [parentId, apiBaseUrl, token]);

  useEffect(() => {
    if (!parentId) return;
    setPeriods(undefined);
    loadPeriods();
  }, [parentId, apiBaseUrl, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetches (or re-fetches) one period's documents — used both by toggleExpand (first expand)
  // and, silently, to refresh a document row's status right after a document action succeeds.
  // Reused rather than duplicated so "initial load" and "post-action refresh" can never drift.
  const loadDocumentsForPeriod = useCallback(async (periodId) => {
    try {
      const docs = await fetchJson(`${apiBaseUrl}/documents?parentId=${periodId}`, token);
      setDocumentsByPeriod((prev) => ({ ...prev, [periodId]: docs }));
      setDocumentsError((prev) => ({ ...prev, [periodId]: false }));
    } catch {
      setDocumentsError((prev) => ({ ...prev, [periodId]: true }));
    }
  }, [apiBaseUrl, token]);

  const toggleExpand = useCallback(async (periodId) => {
    // Selection only ever applies to the currently expanded period's rows — collapsing or
    // switching to a different period must never leave a stale, invisible selection behind.
    setSelectedDocIds(new Set());
    if (expandedId === periodId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(periodId);
    if (!documentsByPeriod[periodId]) {
      await loadDocumentsForPeriod(periodId);
    }
  }, [expandedId, documentsByPeriod, loadDocumentsForPeriod]);

  const toggleDocSelection = useCallback((documentId) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }, []);

  const runAction = useCallback(async (key, url, fieldValues, onSuccess) => {
    setPendingActions((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
    try {
      await postAction(url, token, fieldValues);
      // Targeted refetch of just the affected data (never a full page reload) so the status
      // badge reflects the new value immediately, instead of staying stale until a manual F5.
      await onSuccess?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setPendingActions((prev) => ({ ...prev, [key]: false }));
    }
  }, [token, ui]);

  // Opens the shared ProcessParamDialog instead of firing the request directly — the actual
  // POST happens in handleDialogConfirm once the user picks Open/Closed/Permanently closed.
  const openClosePeriod = useCallback((periodId) => {
    setDialogTarget({ kind: 'period', id: periodId });
  }, []);

  // periodId is captured at click time (not read from `expandedId` at confirm time) so the
  // refresh always targets the period the document actually belongs to, even in the (currently
  // unreachable, since the dialog overlay blocks background interaction, but not worth relying
  // on that) case where the expanded row changed while the dialog was open.
  const openCloseDocument = useCallback((documentId, periodId) => {
    setDialogTarget({ kind: 'document', id: documentId, periodId });
  }, []);

  const openCloseSelectedDocuments = useCallback((periodId) => {
    setDialogTarget({ kind: 'bulk-documents', ids: Array.from(selectedDocIds), periodId });
  }, [selectedDocIds]);

  // Fires one POST per selected document (NEO's openClose action is per-record — there is no
  // batched backend endpoint) via Promise.allSettled, exactly like BulkDocumentAction.jsx's own
  // fan-out technique, but targeting our own endpoint/body shape (BulkDocumentAction is hard-
  // coded to POST {apiBaseUrl}/{entity}/{id}/action/documentAction with { docAction } — the
  // classic DocAction shape, not openClose's { fieldValues: { openClose } } — so it isn't
  // reusable as-is here; see PeriodsExpandablePanel's own postAction). Reuses
  // useBulkActionToast's `showResult` for the ok/failed summary toast instead of
  // BulkDocumentAction's sessionStorage-plus-window.location.reload() pattern, since staying on
  // the same page (no reload) is the exact anti-pattern already fixed for the single-row case.
  const runBulkDocumentAction = useCallback(async (ids, periodId, fieldValues) => {
    const key = `bulk-${periodId}`;
    setPendingActions((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    try {
      const outcomes = await Promise.allSettled(
        ids.map((id) => postAction(`${apiBaseUrl}/documents/${id}/action/openClose`, token, fieldValues))
      );
      const failed = outcomes.filter((o) => o.status === 'rejected');
      const ok = ids.length - failed.length;
      showBulkResult({ ok, failed });
      setSelectedDocIds(new Set());
      // Same lesson as the single-document fix: both the documents list AND the period's own
      // aggregate status must be refreshed, not just the former.
      await Promise.all([loadDocumentsForPeriod(periodId), loadPeriods()]);
    } finally {
      setPendingActions((prev) => ({ ...prev, [key]: false }));
    }
  }, [apiBaseUrl, token, showBulkResult, loadDocumentsForPeriod, loadPeriods]);

  const handleDialogConfirm = useCallback((paramValues) => {
    if (!dialogTarget) return;
    const { kind, id, ids, periodId } = dialogTarget;
    setDialogTarget(null);
    if (kind === 'period') {
      runAction(`period-${id}`, `${apiBaseUrl}/periodControl/${id}/action/openClose`, paramValues, loadPeriods);
    } else if (kind === 'bulk-documents') {
      runBulkDocumentAction(ids, periodId, paramValues);
    } else {
      // A document's own status changing can flip its parent period's aggregate status too
      // (e.g. "All Opened" -> "Mixed" once one document type differs from the rest — the
      // same N/O/C/P/M rollup semantics as the period's own enumVariants) — so both the
      // documents list AND the periods list must be refreshed, not just the former.
      runAction(
        `document-${id}`,
        `${apiBaseUrl}/documents/${id}/action/openClose`,
        paramValues,
        () => Promise.all([loadDocumentsForPeriod(periodId), loadPeriods()])
      );
    }
  }, [dialogTarget, apiBaseUrl, runAction, runBulkDocumentAction, loadPeriods, loadDocumentsForPeriod]);

  const dialogProcess = (dialogTarget?.kind === 'document' || dialogTarget?.kind === 'bulk-documents')
    ? DOCUMENT_OPEN_CLOSE_PROCESS
    : PERIOD_OPEN_CLOSE_PROCESS;

  // Pins the expanded period (plus its document list / bulk-action bar, which live in the same
  // DOM subtree — reordering the array carries them along with no separate logic needed) to the
  // top of the rendered list, so scrolling or other periods never push it out of view. A stable
  // partition — expanded entry first, everything else keeping its exact existing relative
  // order — not a new sort: `periodControl`'s LIST fetch above has no explicit `_sortBy`/sort
  // param today, so introducing one here would risk silently changing the non-expanded periods'
  // order instead of merely reordering around the pinned one. Only one period can ever be
  // expanded at a time (`expandedId`), so at most one entry ever moves.
  const orderedPeriods = useMemo(() => {
    if (!Array.isArray(periods) || !expandedId) return periods;
    const expanded = periods.find((p) => p.id === expandedId);
    if (!expanded) return periods;
    return [expanded, ...periods.filter((p) => p.id !== expandedId)];
  }, [periods, expandedId]);

  if (periods === undefined) {
    return <div data-testid="periods-expandable-panel-loading" className="p-4 text-sm text-muted-foreground">{ui('loading')}</div>;
  }
  if (periods === null) {
    return <div data-testid="periods-expandable-panel-error" className="p-4 text-sm text-destructive">{ui('periodsLoadError')}</div>;
  }

  return (
    <div data-testid="periods-expandable-panel">
      {orderedPeriods.map((period) => {
        const periodPending = !!pendingActions[`period-${period.id}`];
        const isExpanded = expandedId === period.id;
        return (
          <div key={period.id} className="border-b">
            {/* This wrapper (row + bulk bar, when visible) is the sticky unit — kept together
                so they scroll-pin as one block. It only needs `sticky` while THIS period is
                expanded (only the expanded/pinned period, always rendered first per the
                array-reordering fix above, has a long document list worth pinning against —
                collapsed rows never need it and must never compete for the same top-0 slot).
                `bg-card` prevents the scrolling document rows from showing through underneath. */}
            <div className={isExpanded ? 'sticky top-0 z-10 bg-card' : undefined}>
              <div className="flex items-center gap-2 py-2 px-3">
                <button
                  type="button"
                  data-testid={`period-row-expand-${period.id}`}
                  onClick={() => toggleExpand(period.id)}
                  aria-label={ui('expandPeriod')}
                >
                  {isExpanded ? <ChevronDown size={16} data-testid="ChevronDown__711967" /> : <ChevronRight size={16} data-testid="ChevronRight__711967" />}
                </button>
                <span className="flex-1" data-testid={`period-name-${period.id}`}>{period.name}</span>
                <span data-testid={`period-status-${period.id}`}>
                  <Tag
                    variant={PERIOD_STATUS_VARIANTS[period.status] ?? 'neutral'}
                    label={ui(PERIOD_STATUS_LABEL_KEYS[period.status] ?? period.status)}
                    data-testid="Tag__711967" />
                </span>
                <button
                  type="button"
                  data-testid={`period-openclose-${period.id}`}
                  onClick={() => openClosePeriod(period.id)}
                  disabled={periodPending}
                >
                  {ui('openClosePeriod')}
                </button>
              </div>
              {/* ETP-4972 — this bar was an in-flow row, never migrated to the
                  floating SelectionToolbar used everywhere else a checkbox
                  list has a bulk action. Keeps a visible text label (unlike
                  Print/Clone/kebab elsewhere): Ale (design) confirmed
                  icon-only is fine only for universally-recognized actions —
                  this same checklist icon means something different in
                  BulkDocumentAction.jsx (Confirmar/Procesado masivo), so on
                  its own it isn't reliably meaningful. No "(count)" suffix —
                  the pill's own counter segment already shows it. */}
              {isExpanded && (
                <SelectionToolbar
                  visible={selectedDocIds.size > 0}
                  onClose={() => setSelectedDocIds(new Set())}
                  closeTitle={ui('close')}
                  data-testid={`document-bulk-bar-${period.id}`}
                >
                  <span role="status" className="text-sm font-medium" data-testid="document-selection-count">
                    {ui('selected').replace('{count}', String(selectedDocIds.size))}
                  </span>
                  <button
                    type="button"
                    title={ui('bulkOpenCloseDocuments')}
                    data-testid={`document-bulk-openclose-${period.id}`}
                    onClick={() => openCloseSelectedDocuments(period.id)}
                    disabled={!!pendingActions[`bulk-${period.id}`]}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] disabled:opacity-50"
                  >
                    <ListChecks className="h-3.5 w-3.5" data-testid="ListChecks__periodsBulkBar" />
                    {ui('bulkOpenCloseDocuments')}
                  </button>
                </SelectionToolbar>
              )}
            </div>
            {isExpanded && (
              <div className="pl-8" data-testid={`period-documents-${period.id}`}>
                {documentsError[period.id] && (
                  <div
                    data-testid={`period-documents-error-${period.id}`}
                    className="text-sm text-destructive py-1.5"
                  >
                    {ui('documentsLoadError')}
                  </div>
                )}
                {(documentsByPeriod[period.id] || []).map((doc) => {
                  const docPending = !!pendingActions[`document-${doc.id}`];
                  return (
                    // ETP-5030 — the document row had no selection feedback at
                    // all. Background only: nothing behind these rows paints
                    // one (the `pl-8` list container and the outer `border-b`
                    // wrapper are both transparent — the sticky `bg-card` is on
                    // the period header, a sibling above, not an ancestor), so
                    // the tint has nothing to compete with. No padding or
                    // margin is added, so selecting a row shifts no layout.
                    <div
                      key={doc.id}
                      className={`flex items-center gap-2 py-1.5${selectedDocIds.has(doc.id) ? ' bg-primary/5' : ''}`}
                    >
                      <Checkbox
                        checked={selectedDocIds.has(doc.id)}
                        onChange={() => toggleDocSelection(doc.id)}
                        data-testid={`document-select-${doc.id}`}
                      />
                      <span className="flex-1">{ui(DOCUMENT_CATEGORY_LABEL_KEYS[doc.documentCategory] ?? doc.documentCategory)}</span>
                      <span data-testid={`document-status-${doc.id}`}>
                        <Tag
                          variant={DOCUMENT_STATUS_VARIANTS[doc.periodStatus] ?? 'neutral'}
                          label={ui(DOCUMENT_STATUS_LABEL_KEYS[doc.periodStatus] ?? doc.periodStatus)}
                          data-testid="Tag__711967" />
                      </span>
                      <button
                        type="button"
                        data-testid={`document-openclose-${doc.id}`}
                        onClick={() => openCloseDocument(doc.id, period.id)}
                        disabled={docPending}
                      >
                        {ui('openCloseDocument')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <ProcessParamDialog
        open={!!dialogTarget}
        onOpenChange={(next) => { if (!next) setDialogTarget(null); }}
        process={dialogProcess}
        onConfirm={handleDialogConfirm}
        data-testid="ProcessParamDialog__711967" />
    </div>
  );
}
