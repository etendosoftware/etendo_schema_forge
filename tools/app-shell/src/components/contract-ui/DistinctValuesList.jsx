import { useEffect, useRef } from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * Shared dropdown list used by filters that pick one value out of the set of
 * distinct values for a field (status selector, advanced-filter value picker).
 *
 * Renders:
 *   - A search input wired to `distinct.search` / `distinct.setSearch`.
 *   - An optional "all / any" row (when `allLabel` is non-null) that calls
 *     `onSelect(null)` — callers treat null as "clear this filter".
 *   - One row per merged code; active row gets a check mark.
 *   - An IntersectionObserver sentinel that invokes `distinct.loadMore()` as
 *     the user scrolls near the bottom, so the dropdown behaves like an
 *     infinite list instead of a single large page.
 *
 * Merge policy between in-memory codes and backend pagination lives in the
 * parent; this component just renders what it's given.
 */
export function DistinctValuesList({
  activeCode,
  allLabel,
  codes,
  labelFor,
  distinct,
  onSelect,
  searchPlaceholder,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !distinct.hasMore || distinct.loadingMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) distinct.loadMore();
    }, { root: node.parentElement, rootMargin: '32px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [distinct.hasMore, distinct.loadingMore, distinct.loadMore, distinct.values.length]);

  return (
    <div className="flex flex-col">
      <div className="p-2 border-b border-border">
        <input
          type="text"
          value={distinct.search}
          onChange={(e) => distinct.setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-8 px-2 text-sm rounded-md border border-border bg-white focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="max-h-72 overflow-auto py-1">
        {allLabel && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
          >
            <span className="w-4 shrink-0">
              {!activeCode && <Check className="h-3.5 w-3.5" data-testid="Check__55c679" />}
            </span>
            <span className="flex-1 truncate">{allLabel}</span>
          </button>
        )}
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
          >
            <span className="w-4 shrink-0">
              {activeCode === code && <Check className="h-3.5 w-3.5" data-testid="Check__55c679" />}
            </span>
            <span className="flex-1 truncate">{labelFor(code)}</span>
          </button>
        ))}
        {distinct.loading && codes.length === 0 && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__55c679" />
          </div>
        )}
        {!distinct.loading && codes.length === 0 && (
          <div className="px-3 py-3 text-sm text-muted-foreground text-center">
            {distinct.search ? '—' : ''}
          </div>
        )}
        {distinct.hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-2">
            {distinct.loadingMore && (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                data-testid="Loader2__55c679" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DistinctValuesList;
