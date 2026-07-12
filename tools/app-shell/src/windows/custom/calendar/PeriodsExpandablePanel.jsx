import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? [];
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

export default function PeriodsExpandablePanel({ data, token, apiBaseUrl }) {
  const ui = useUI();
  const [periods, setPeriods] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [documentsByPeriod, setDocumentsByPeriod] = useState({});

  useEffect(() => {
    if (!data?.id) return;
    fetchJson(`${apiBaseUrl}/calendar/periodControl?year=${data.id}`, token).then(setPeriods);
  }, [data?.id, apiBaseUrl, token]);

  const toggleExpand = useCallback(async (periodId) => {
    if (expandedId === periodId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(periodId);
    if (!documentsByPeriod[periodId]) {
      const docs = await fetchJson(`${apiBaseUrl}/calendar/documents?parentId=${periodId}`, token);
      setDocumentsByPeriod((prev) => ({ ...prev, [periodId]: docs }));
    }
  }, [expandedId, documentsByPeriod, apiBaseUrl, token]);

  const openClosePeriod = useCallback((periodId) => {
    postAction(`${apiBaseUrl}/calendar/periodControl/${periodId}/action/openClose`, token);
  }, [apiBaseUrl, token]);

  const openCloseDocument = useCallback((documentId) => {
    postAction(`${apiBaseUrl}/calendar/documents/${documentId}/action/openClose`, token);
  }, [apiBaseUrl, token]);

  return (
    <div data-testid="periods-expandable-panel">
      {periods.map((period) => (
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
            >
              {ui('openClosePeriod')}
            </button>
          </div>
          {expandedId === period.id && (
            <div className="pl-8" data-testid={`period-documents-${period.id}`}>
              {(documentsByPeriod[period.id] || []).map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1">{doc.documentCategory}</span>
                  <span data-testid={`document-status-${doc.id}`}>{doc.periodStatus}</span>
                  <button
                    type="button"
                    data-testid={`document-openclose-${doc.id}`}
                    onClick={() => openCloseDocument(doc.id)}
                  >
                    {ui('openCloseDocument')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
