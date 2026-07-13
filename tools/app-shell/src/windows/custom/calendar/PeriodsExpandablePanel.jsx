import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

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

async function postAction(url, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
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

  useEffect(() => {
    if (!parentId) return;
    setPeriods(undefined);
    fetchJson(`${apiBaseUrl}/periodControl?${yearCriteria(parentId)}`, token)
      .then(setPeriods)
      .catch(() => setPeriods(null));
  }, [parentId, apiBaseUrl, token]);

  const toggleExpand = useCallback(async (periodId) => {
    if (expandedId === periodId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(periodId);
    if (!documentsByPeriod[periodId]) {
      try {
        const docs = await fetchJson(`${apiBaseUrl}/documents?parentId=${periodId}`, token);
        setDocumentsByPeriod((prev) => ({ ...prev, [periodId]: docs }));
        setDocumentsError((prev) => ({ ...prev, [periodId]: false }));
      } catch {
        setDocumentsError((prev) => ({ ...prev, [periodId]: true }));
      }
    }
  }, [expandedId, documentsByPeriod, apiBaseUrl, token]);

  const runAction = useCallback(async (key, url) => {
    setPendingActions((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
    try {
      await postAction(url, token);
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setPendingActions((prev) => ({ ...prev, [key]: false }));
    }
  }, [token, ui]);

  const openClosePeriod = useCallback((periodId) => {
    runAction(`period-${periodId}`, `${apiBaseUrl}/periodControl/${periodId}/action/openClose`);
  }, [apiBaseUrl, runAction]);

  const openCloseDocument = useCallback((documentId) => {
    runAction(`document-${documentId}`, `${apiBaseUrl}/documents/${documentId}/action/openClose`);
  }, [apiBaseUrl, runAction]);

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
              <span data-testid={`period-status-${period.id}`}>{period.status}</span>
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
                {(documentsByPeriod[period.id] || []).map((doc) => {
                  const docPending = !!pendingActions[`document-${doc.id}`];
                  return (
                    <div key={doc.id} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1">{doc.documentCategory}</span>
                      <span data-testid={`document-status-${doc.id}`}>{doc.periodStatus}</span>
                      <button
                        type="button"
                        data-testid={`document-openclose-${doc.id}`}
                        onClick={() => openCloseDocument(doc.id)}
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
    </div>
  );
}
