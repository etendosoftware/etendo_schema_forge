import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2, Check } from 'lucide-react';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useCurrency } from '@/hooks/useCurrency.jsx';
import { useUI } from '@/i18n';

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
  onDeselect,
  selectorUrl,
  token,
  title = null,
  imageEntityUrl,
  keepOpenOnSelect = false,
  selectedIds = [],
  selectorContext = {},
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
  const activeItemRef = useRef(null);
  const fetchTimer = useRef(null);
  const abortRef = useRef(null);
  const ui = useUI();
  const sessionCurrency = useCurrency();
  const currency = selectorContext?.priceCurrency ?? selectorContext?.currency ?? sessionCurrency;
  const resolvedTitle = title ?? ui('product');
  const selectorContextRef = useRef(selectorContext);
  // Tracks the raw server-side offset (total rows consumed), independent of dedup count.
  const rawOffsetRef = useRef(0);

  // Keep selectorContextRef in sync without affecting doFetch's deps
  useEffect(() => { selectorContextRef.current = selectorContext; }, [selectorContext]);

  // Fetch all product image IDs once when modal opens, keyed by searchKey
  const neoBaseUrl = selectorUrl ? selectorUrl.replace(/\/[^/]+\/[^/]+\/selectors\/.*$/, '') : '';
  const resolvedImageUrl = imageEntityUrl || (neoBaseUrl ? `${neoBaseUrl}/product/product` : null);
  const fetchAllImages = useCallback(() => {
    if (!resolvedImageUrl || !token) return;
    fetch(`${resolvedImageUrl}?_startRow=0&_endRow=500`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const rows = data?.response?.data || [];
        const map = {};
        for (const row of rows) {
          if (row.image) {
            if (row.searchKey) map[row.searchKey] = row.image;
            if (row.id) map[row.id] = row.image;
          }
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
      const params = { ...selectorContextRef.current, limit: PAGE_SIZE, offset };
      if (q) params.q = q.trim();
      fetch(buildUrlWithParams(selectorUrl, params), {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const raw = data?.items || [];
          // Deduplicate by searchKey (product code) — prefer warehouse-specific rows (with
          // actual stock data) over generic rows (warehouse: null, _QTY: "0").
          const seenKeys = new Map(); // key → index in items array
          const items = [];
          for (const item of raw) {
            const key = item.searchKey || item.id;
            if (seenKeys.has(key)) {
              const idx = seenKeys.get(key);
              if (!items[idx].warehouse && item.warehouse) {
                items[idx] = item; // Replace generic row with warehouse-specific row
              }
            } else {
              seenKeys.set(key, items.length);
              items.push(item);
            }
          }
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

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Scroll active item into view when navigating with arrow keys.
  useEffect(() => {
    if (activeIdx >= 0 && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  // Infinite scroll — uses rawOffsetRef so offset is correct even after dedup shrinks visible count.
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      doFetch(query, rawOffsetRef.current, true);
    }
  }, [loadingMore, hasMore, query, doFetch]);

  const handleSelect = (item) => {
    const alreadySelected = selectedIds.includes(item.id);
    if (alreadySelected) {
      setSelectedId(null);
      onSelect(item);
      return;
    }
    setSelectedId(item.id);
    setTimeout(() => {
      onSelect(item);
      if (!keepOpenOnSelect) onClose();
    }, 120);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); inputRef.current?.focus(); setActiveIdx(prev => Math.min(prev + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); inputRef.current?.focus(); setActiveIdx(prev => Math.max(prev - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx]); }
  };

  const getName = (item) => item.label || item.name || item._identifier || item.id;
  const getCode = (item) => item.searchKey || item.code || item.value || null;
  const getPrice = (item) => {
    const p = item.standardPrice || item.listPrice || item.price;
    if (p == null) return null;
    const num = typeof p === 'number' ? p : parseFloat(p);
    if (isNaN(num)) return String(p);
    return currency ? formatCurrency(currency, num) : num.toFixed(2);
  };
  const getImageId = (item) => item.image || null;
  const getImage = (item) => item.imageUrl || item.imageurl || null;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
        <div
          data-testid="product-search-drawer"
          className="w-full max-w-xl bg-background rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          style={{ maxHeight: '65vh' }}
          role="dialog"
          aria-modal="true"
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search
              className="h-4 w-4 text-muted-foreground shrink-0"
              data-testid="Search__2e8824" />
            <input
              ref={inputRef}
              data-testid="product-search-input"
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); doFetch(e.target.value, 0); }}
              placeholder={`${ui('searchLabelPrefix')} ${resolvedTitle}...`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {(loading || loadingMore) && <Loader2
              className="h-4 w-4 text-muted-foreground animate-spin shrink-0"
              data-testid="Loader2__2e8824" />}
            <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" data-testid="X__2e8824" />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto" ref={listRef} onScroll={handleScroll}>
            {loading && results.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2
                  className="h-6 w-6 text-muted-foreground animate-spin"
                  data-testid="Loader2__2e8824" />
              </div>
            )}

            {!loading && results.length === 0 && query.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">{ui('productSearchNoResults', { query })}</p>
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
                  const isSelected = selectedId === item.id || selectedIds.includes(item.id);

                  return (
                    <li key={item.id} ref={isActive ? activeItemRef : null}>
                      <button
                        type="button"
                        data-testid={`product-search-option-${item.id}`}
                        onClick={() => handleSelect(item)}
                        className={`w-full text-left px-4 py-2 transition-colors cursor-pointer flex items-center gap-3 border-l-2 ${
                          isActive
                            ? `border-primary ${isSelected ? 'bg-primary/20' : 'bg-primary/10'}`
                            : `border-transparent ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`
                        }`}
                      >
                        <Avatar
                          name={name}
                          id={item.id}
                          imageUrl={image}
                          imageId={getImageId(item) || imageMap[item.searchKey] || imageMap[item.id]}
                          neoBaseUrl={neoBaseUrl}
                          token={token}
                          data-testid="Avatar__2e8824" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          {code && <p className="text-xs text-muted-foreground">{code}</p>}
                        </div>
                        {price && (
                          <span className="text-sm tabular-nums text-muted-foreground shrink-0">{price}</span>
                        )}
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary shrink-0" data-testid="Check__2e8824" />
                        )}
                      </button>
                    </li>
                  );
                })}
                {loadingMore && (
                  <li className="flex items-center justify-center py-3">
                    <Loader2
                      className="h-4 w-4 text-muted-foreground animate-spin"
                      data-testid="Loader2__2e8824" />
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div className="px-4 py-1.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{ui('productSearchCount', { count: results.length })}</span>
              <span className="flex items-center gap-2">
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↑↓</kbd> {ui('productSearchNavigate')}
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↵</kbd> {ui('productSearchSelect')}
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">esc</kbd> {ui('productSearchClose')}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
