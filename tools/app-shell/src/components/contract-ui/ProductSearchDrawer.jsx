import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';

const PAGE_SIZE = 30;

const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
];

function getColor(id) {
  let hash = 0;
  for (let i = 0; i < (id || '').length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function Avatar({ name, id, imageUrl, imageId, neoBaseUrl, token }) {
  const [src, setSrc] = useState(imageUrl || null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    if (src || !imageId || !neoBaseUrl || !token) return;
    let cancelled = false;
    fetch(`${neoBaseUrl}/image/${imageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [imageId, neoBaseUrl, token, src]);

  // Revoke object URL only on unmount
  useEffect(() => {
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  if (src) {
    return <img src={src} alt={name} className="w-11 h-11 rounded-lg object-cover shrink-0" />;
  }
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 ${getColor(id)}`}>
      {initial}
    </div>
  );
}

export default function ProductSearchDrawer({
  open,
  onClose,
  onSelect,
  selectorUrl,
  token,
  title = 'Search Product',
  imageEntityUrl,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [imageMap, setImageMap] = useState({});
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const fetchTimer = useRef(null);
  const abortRef = useRef(null);
  // Tracks the raw server-side offset (total rows consumed), independent of dedup count.
  const rawOffsetRef = useRef(0);

  // Fetch all product image IDs once when modal opens, keyed by searchKey
  const neoBaseUrl = selectorUrl ? selectorUrl.replace(/\/[^/]+\/[^/]+\/selectors\/.*$/, '') : '';
  const resolvedImageUrl = imageEntityUrl || (neoBaseUrl ? `${neoBaseUrl}/product/product` : null);
  const fetchAllImages = useCallback(() => {
    if (!resolvedImageUrl || !token) return;
    fetch(`${resolvedImageUrl}?_limit=500`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const rows = data?.response?.data || [];
        const map = {};
        for (const row of rows) {
          if (row.searchKey && row.image) map[row.searchKey] = row.image;
        }
        setImageMap(map);
      })
      .catch(() => {});
  }, [resolvedImageUrl, token]);

  const doFetch = useCallback((q, offset = 0, append = false) => {
    if (!append) {
      clearTimeout(fetchTimer.current);
      if (abortRef.current) abortRef.current.abort();
      rawOffsetRef.current = 0;
    }
    if (!selectorUrl || !token) { setResults([]); setLoading(false); return; }

    if (append) setLoadingMore(true);
    else setLoading(true);

    const delay = q && !append ? 300 : 0;
    fetchTimer.current = setTimeout(() => {
      const controller = new AbortController();
      if (!append) abortRef.current = controller;
      const params = { limit: PAGE_SIZE, offset };
      if (q) params.q = q.trim();
      fetch(buildUrlWithParams(selectorUrl, params), {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const raw = data?.items || [];
          const seenKeys = new Set();
          const items = raw.filter(item => {
            // Deduplicate by searchKey (product code) — selectors may return one row per
            // attribute set instance, all sharing the same product code.
            const key = item.searchKey || item.id;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
          });
          // Advance the raw server offset so scroll-based pagination is correct even after dedup.
          rawOffsetRef.current = offset + raw.length;
          if (append) {
            setResults(prev => {
              const existingIds = new Set(prev.map(i => i.id));
              return [...prev, ...items.filter(i => !existingIds.has(i.id))];
            });
          } else {
            setResults(items);
            setActiveIdx(-1);
          }
          const stillHasMore = data?.hasMore ?? false;
          setHasMore(stillHasMore);
          setTotalCount(data?.totalCount ?? items.length);
          setLoading(false);
          setLoadingMore(false);
          // Auto-waterfall: dedup may shrink the visible count far below PAGE_SIZE.
          // Keep fetching until we have at least 15 visible results or no more data.
          if (items.length < 15 && stillHasMore) {
            doFetch(q, rawOffsetRef.current, true);
          }
        })
        .catch(err => {
          if (err.name !== 'AbortError') { if (!append) setResults([]); setLoading(false); setLoadingMore(false); }
        });
    }, delay);
  }, [selectorUrl, token]);

  // Load initial products when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setSelectedId(null);
      setActiveIdx(-1);
      setImageMap({});
      setTimeout(() => inputRef.current?.focus(), 50);
      doFetch('', 0);
      fetchAllImages();
    }
  }, [open, doFetch]);

  useEffect(() => () => {
    clearTimeout(fetchTimer.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // Infinite scroll — uses rawOffsetRef so offset is correct even after dedup shrinks visible count.
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      doFetch(query, rawOffsetRef.current, true);
    }
  }, [loadingMore, hasMore, query, doFetch]);

  const handleSelect = (item) => {
    setSelectedId(item.id);
    setTimeout(() => { onSelect(item); onClose(); }, 120);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(prev => Math.min(prev + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(prev => Math.max(prev - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx]); }
  };

  const getName = (item) => item.label || item.name || item._identifier || item.id;
  const getCode = (item) => item.searchKey || item.code || item.value || null;
  const getPrice = (item) => {
    const p = item.standardPrice || item.listPrice || item.price;
    if (p == null) return null;
    return typeof p === 'number' ? p.toFixed(2) : String(p);
  };
  const getImageId = (item) => item.image || null;
  const getImage = (item) => item.imageUrl || item.imageurl || null;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
        <div
          className="w-full max-w-xl bg-background rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: '65vh' }}
          role="dialog"
          aria-modal="true"
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); doFetch(e.target.value, 0); }}
              onKeyDown={handleKeyDown}
              placeholder={`${title}...`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {(loading || loadingMore) && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />}
            <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={handleScroll}>
            {loading && results.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              </div>
            )}

            {!loading && results.length === 0 && query.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No results for "{query}"</p>
              </div>
            )}

            {results.length > 0 && (
              <ul className="py-1">
                {results.map((item, i) => {
                  const name = getName(item);
                  const code = getCode(item);
                  const price = getPrice(item);
                  const image = getImage(item);
                  const isActive = i === activeIdx;
                  const isSelected = selectedId === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`w-full text-left px-4 py-2 transition-colors cursor-pointer flex items-center gap-3 ${
                          isSelected ? 'bg-primary/10'
                          : isActive ? 'bg-muted'
                          : 'hover:bg-muted/50'
                        }`}
                      >
                        <Avatar name={name} id={item.id} imageUrl={image} imageId={getImageId(item) || imageMap[item.searchKey]} neoBaseUrl={neoBaseUrl} token={token} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          {code && <p className="text-xs text-muted-foreground">{code}</p>}
                        </div>
                        {price && (
                          <span className="text-sm tabular-nums text-muted-foreground shrink-0">{price}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
                {loadingMore && (
                  <li className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div className="px-4 py-1.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{results.length}{totalCount > results.length ? ` of ${totalCount}` : ''} product{totalCount !== 1 ? 's' : ''}</span>
              <span className="flex items-center gap-2">
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↑↓</kbd> navigate
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↵</kbd> select
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">esc</kbd> close
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
