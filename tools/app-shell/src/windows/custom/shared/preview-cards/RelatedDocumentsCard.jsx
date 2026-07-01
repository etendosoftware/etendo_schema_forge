import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { CHIP_ICONS, CHIP_COLORS, STATUS_KEYS } from '@/components/related-documents/constants.jsx';
import { DOCUMENT_CHIP_TYPES } from '@/components/related-documents/docChipTypes.jsx';
import { StatusTag } from '@/components/ui/status-tag';
import { formatAmount } from '@/components/related-documents/helpers.js';

function SectionCard({ title, onRefresh, isRefreshing, children }) {
  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden px-4 py-2">
        {children}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex justify-between items-center py-2">
      <div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" />
      <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
    </div>
  );
}

function DocRow({ type, doc, ui, navigate }) {
  const cfg = DOCUMENT_CHIP_TYPES[type];
  if (!cfg) return null;

  const titleValue = doc[cfg.titleField] ?? (cfg.titleFallbackField ? doc[cfg.titleFallbackField] : doc.id);
  const amount = cfg.amountField ? doc[cfg.amountField] : undefined;
  const currency = cfg.currencyField ? doc[cfg.currencyField] : undefined;
  const statusCode = cfg.statusField ? doc[cfg.statusField] : undefined;
  const statusKey = statusCode ? STATUS_KEYS[statusCode] : undefined;
  const statusLabel = statusKey ? ui(statusKey) : statusCode;

  const label = ui(cfg.titleKey, { number: titleValue });
  const amountStr = amount != null ? formatAmount(amount, currency) : null;

  return (
    <button
      type="button"
      onClick={() => navigate(`${cfg.routePrefix}/${doc.id}`)}
      className="flex justify-between items-center py-2 w-full text-left hover:bg-gray-50 rounded -mx-1 px-1 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 ${CHIP_COLORS[cfg.iconKey] ?? 'text-gray-400'}`}>
          {CHIP_ICONS[cfg.iconKey]}
        </span>
        <span className="text-sm font-medium text-gray-900 truncate">{label}</span>
        {amountStr && (
          <span className="text-xs text-gray-400 tabular-nums shrink-0">{amountStr}</span>
        )}
      </div>
      {statusCode && (
        <StatusTag status={statusCode} label={statusLabel} data-testid="StatusTag__685328" />
      )}
    </button>
  );
}

/**
 * RelatedDocumentsCard — shows related documents for a preview panel.
 *
 * Props:
 *   documentId   string   — parent record ID
 *   token        string
 *   apiBaseUrl   string
 *   specs        Array<{ key, type, fetch: async(id, token, base) => row[] }>
 *   fetchExtra   async(id, token, base) => Array<{ type, doc }> — optional chained fetch
 */
export default function RelatedDocumentsCard({ documentId, token, apiBaseUrl, specs = [], fetchExtra }) {
  const ui = useUI();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  useEffect(() => {
    if (!documentId || specs.length === 0) { setLoading(false); return; }
    setLoading(true);
    const specPromises = specs.map(s =>
      s.fetch(documentId, token, apiBaseUrl)
        .then(rows => rows.map(doc => ({ type: s.type, doc })))
        .catch(() => [])
    );
    const extraPromise = fetchExtra
      ? fetchExtra(documentId, token, apiBaseUrl).catch(() => [])
      : Promise.resolve([]);
    Promise.all([Promise.all(specPromises), extraPromise])
      .then(([specResults, extraResults]) => {
        setItems([...specResults.flat(), ...extraResults]);
      })
      .finally(() => setLoading(false));
  }, [documentId, token, apiBaseUrl, refreshKey]);

  if (!documentId || specs.length === 0) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(k => k + 1);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <SectionCard
      title={ui('previewCardRelatedDocuments')}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing || loading}
      data-testid="SectionCard__685328">
      {loading && (
        <>
          <SkeletonRow data-testid="SkeletonRow__685328" />
          <SkeletonRow data-testid="SkeletonRow__685328" />
          <SkeletonRow data-testid="SkeletonRow__685328" />
        </>
      )}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground/50 py-2">{ui('noRelatedDocuments')}</p>
      )}
      {!loading && items.length > 0 && items.map(({ type, doc }) => (
        <DocRow
          key={`${type}-${doc.id}`}
          type={type}
          doc={doc}
          ui={ui}
          navigate={navigate}
          data-testid="DocRow__685328" />
      ))}
    </SectionCard>
  );
}
