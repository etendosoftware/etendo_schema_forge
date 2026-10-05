import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { CHIP_ICONS, CHIP_COLORS, STATUS_KEYS } from '@/components/related-documents/constants.jsx';
import { DOCUMENT_CHIP_TYPES } from '@/components/related-documents/docChipTypes.jsx';
import { StatusTag } from '@/components/ui/status-tag';
import { formatAmount } from '@/components/related-documents/helpers.js';
import { useRelatedDocuments } from '@/components/related-documents/useRelatedDocuments.js';

function SectionCard({ title, onRefresh, isRefreshing, children }) {
  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
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
      <div className="bg-card rounded-xl border border-border-subtle overflow-hidden px-4 py-2">
        {children}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex justify-between items-center py-2">
      <div className="h-3.5 w-24 bg-muted rounded animate-pulse" />
      <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
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
      // One line always (ETP-5527): the title and amount are never cut; when the row is too
      // narrow, the status tag is what shrinks, with an ellipsis and the full text on hover.
      className="flex justify-between items-center py-2 w-full text-left hover:bg-muted rounded -mx-1 px-1 transition-colors"
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className={`shrink-0 ${CHIP_COLORS[cfg.iconKey] ?? 'text-muted-foreground'}`}>
          {CHIP_ICONS[cfg.iconKey]}
        </span>
        <span className="text-sm font-medium text-foreground whitespace-nowrap">{label}</span>
        {amountStr && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{amountStr}</span>
        )}
      </div>
      {statusCode && (
        <span className="flex justify-end min-w-0 ml-2" title={statusLabel}>
          {/* StatusTag renders its label as a text node of an inline-flex span, where an
              ellipsis cannot apply; the label is wrapped in its own truncating span. */}
          <StatusTag
            status={statusCode}
            label={<span className="truncate min-w-0">{statusLabel}</span>}
            className="max-w-full min-w-0"
            data-testid="StatusTag__685328" />
        </span>
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
 *   definition   related-documents definition (SALES_RELATED_DOCS entry) — ETP-5527.
 *                When set it REPLACES specs/fetchExtra: the card lists exactly what the
 *                form's RelatedDocuments section lists for the same record.
 *   record       with `definition` only: the detail record, when the caller already has
 *                it. Omit it and the card loads the detail record itself — list rows
 *                lack the fields the backend injects on the detail GET only.
 */
export default function RelatedDocumentsCard({ documentId, token, apiBaseUrl, specs = [], fetchExtra, docsRefreshSignal, definition, record }) {
  const ui = useUI();
  const navigate = useNavigate();
  const [legacyItems, setLegacyItems] = useState([]);
  const [legacyLoading, setLegacyLoading] = useState(!definition);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const related = useRelatedDocuments({
    definition: definition ?? null,
    id: documentId,
    record,
    token,
    apiBaseUrl,
    refreshSignal: docsRefreshSignal,
  });

  useEffect(() => {
    if (definition) return;
    if (!documentId || specs.length === 0) { setLegacyLoading(false); return; }
    setLegacyLoading(true);
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
        setLegacyItems([...specResults.flat(), ...extraResults]);
      })
      .finally(() => setLegacyLoading(false));
  }, [documentId, token, apiBaseUrl, refreshKey, docsRefreshSignal, definition]);

  if (!documentId || (!definition && specs.length === 0)) return null;

  const items = definition ? related.items : legacyItems;
  const loading = definition ? related.loading : legacyLoading;
  // With a definition, refreshing only makes sense when it has fetched sources (same rule
  // as RelatedDocumentsSection); a record-only one (e.g. return material receipt) has
  // nothing to refetch. The legacy specs path always offers it, as before.
  const refreshable = !definition || (definition.sources ?? []).some(s => typeof s.fetch === 'function');

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (definition) related.refresh();
    else setRefreshKey(k => k + 1);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <SectionCard
      title={ui('previewCardRelatedDocuments')}
      onRefresh={refreshable ? handleRefresh : undefined}
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
