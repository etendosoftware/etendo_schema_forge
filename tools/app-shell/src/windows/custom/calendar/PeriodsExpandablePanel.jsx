import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
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

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

  if (periods === undefined) {
    return <div data-testid="periods-expandable-panel-loading" className="p-4 text-sm text-muted-foreground">{ui('loading')}</div>;
  }
  if (periods === null) {
    return <div data-testid="periods-expandable-panel-error" className="p-4 text-sm text-destructive">{ui('periodsLoadError')}</div>;
  }

  return (
    <div data-testid="periods-expandable-panel">
      {periods.map((period) => {
        const periodPending = !!pendingActions[`period-${period.id}`];
        return (
          <div key={period.id} className="border-b">
            <div className="flex items-center gap-2 py-2 px-3">
              <button
                type="button"
                data-testid={`period-row-expand-${period.id}`}
                onClick={() => toggleExpand(period.id)}
                aria-label={ui('expandPeriod')}
              >
                {expandedId === period.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <span className="flex-1">{period.name}</span>
              <span data-testid={`period-status-${period.id}`}>
                <Tag
                  variant={PERIOD_STATUS_VARIANTS[period.status] ?? 'neutral'}
                  label={period.status$_identifier ?? period.status}
                />
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
            {expandedId === period.id && (
              <div className="pl-8" data-testid={`period-documents-${period.id}`}>
                {documentsError[period.id] && (
                  <div
                    data-testid={`period-documents-error-${period.id}`}
                    className="text-sm text-destructive py-1.5"
                  >
                    {ui('documentsLoadError')}
                  </div>
                )}
                {selectedDocIds.size > 0 && (
                  <div
                    className="flex items-center justify-between gap-2 py-1.5"
                    data-testid={`document-bulk-bar-${period.id}`}
                  >
                    <span role="status" className="text-sm font-semibold" data-testid="document-selection-count">
                      {ui('selected').replace('{count}', String(selectedDocIds.size))}
                    </span>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      data-testid={`document-bulk-openclose-${period.id}`}
                      onClick={() => openCloseSelectedDocuments(period.id)}
                      disabled={!!pendingActions[`bulk-${period.id}`]}
                    >
                      {ui('bulkOpenCloseDocuments')} ({selectedDocIds.size})
                    </Button>
                  </div>
                )}
                {(documentsByPeriod[period.id] || []).map((doc) => {
                  const docPending = !!pendingActions[`document-${doc.id}`];
                  return (
                    <div key={doc.id} className="flex items-center gap-2 py-1.5">
                      <Checkbox
                        checked={selectedDocIds.has(doc.id)}
                        onChange={() => toggleDocSelection(doc.id)}
                        data-testid={`document-select-${doc.id}`}
                      />
                      <span className="flex-1">{doc.documentCategory$_identifier ?? doc.documentCategory}</span>
                      <span data-testid={`document-status-${doc.id}`}>
                        <Tag
                          variant={DOCUMENT_STATUS_VARIANTS[doc.periodStatus] ?? 'neutral'}
                          label={doc.periodStatus$_identifier ?? doc.periodStatus}
                        />
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
      />
    </div>
  );
}
