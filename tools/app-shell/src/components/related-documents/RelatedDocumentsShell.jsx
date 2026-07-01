import { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Shared shell for RelatedDocuments components. Handles:
 *   - Loading state (spinner + "loading…" text).
 *   - Empty state ("No related documents" muted text).
 *   - Optional refresh affordance — when `onRefresh` is provided a small
 *     circular-arrow icon is rendered to the right of the chips/empty text and
 *     a refresh callback fires on click.
 *
 * Per-window RelatedDocuments components own the data fetching and the
 * `refreshKey` state; this shell only renders the surrounding UI so every
 * window stays visually consistent.
 */
export default function RelatedDocumentsShell({ loading, onRefresh, children }) {
  const ui = useUI();
  // Local short-lived spin state. Guarantees the user sees the icon rotate
  // on click even when the per-window refetch resolves synchronously (e.g.
  // there's nothing related to fetch and `loading` flips back to false in
  // the same tick). The animation runs for ~500ms regardless of how fast
  // the parent's loading state cycles.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timeoutRef = useRef(null);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const handleRefreshClick = () => {
    if (typeof onRefresh === 'function') onRefresh();
    setIsRefreshing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsRefreshing(false), 500);
  };

  const refreshBtn = onRefresh ? (
    <button
      type="button"
      onClick={handleRefreshClick}
      title={ui('refresh')}
      className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`w-3.5 h-3.5 ${loading || isRefreshing ? 'animate-spin' : ''}`}
      >
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
      </svg>
    </button>
  ) : null;

  if (loading) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__7b605d" />
          {ui('loading')}
        </span>
        {refreshBtn}
      </div>
    );
  }

  // Children can be a single node, an array of nodes, or a mix of arrays
  // produced by multiple `.map(...)` calls — e.g.
  // `<Shell>{orders.map(...)}{invoices.map(...)}</Shell>` yields
  // `[[], []]` when both source arrays are empty. Flat-deep + filter Boolean
  // captures the actual rendered count regardless of nesting.
  let flatChildren;
  if (Array.isArray(children)) {
    flatChildren = children.flat(Infinity).filter(Boolean);
  } else if (children) {
    flatChildren = [children];
  } else {
    flatChildren = [];
  }
  const hasChildren = flatChildren.length > 0;

  if (!hasChildren) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground/50">{ui('noRelatedDocuments')}</span>
        {refreshBtn}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {children}
      {refreshBtn}
    </div>
  );
}
