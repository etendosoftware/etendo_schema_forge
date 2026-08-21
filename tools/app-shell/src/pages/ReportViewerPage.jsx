import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Printer, FileDown, FileSpreadsheet, Loader2, X, ChevronDown, Info, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import ProductSearchDrawer from '@/components/contract-ui/ProductSearchDrawer.jsx';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect.jsx';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';

// Etendo context path prefix (e.g. "/etendo" in production, "" in local dev where
// Vite proxies /sws/* directly). Same logic as auth/api.js detectBaseUrl().
function getEtendoBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env.VITE_API_BASE || '';
}
const ETENDO_BASE = getEtendoBase();

// Static skeleton placeholders shown while a report renders — fixed-length, never reordered.
const SKELETON_COLUMN_WIDTHS = [40, 15, 15, 15, 15, 15].map((w, i) => ({ id: i, w }));
const SKELETON_ROWS = Array.from({ length: 8 }, (_, r) => ({ id: r }));

// Purely decorative mini report-page preview shown above each card — a
// NARROWER "page" (card surface, shadowed), horizontally centered with
// visible margin on both sides, sitting inside a muted frame — so it reads
// as "a document floating in a preview area", not content stretched edge to
// edge. Left/right insets are deliberately much bigger than top/bottom (a
// portrait-ish page inside a landscape frame), unlike a plain `inset-*` on
// all sides. Inside: two stacked title bars + a couple of short metadata
// lines top-right, a thin divider, then a handful of lines of varying width
// (a couple bolder ones standing in for section bands) laid out with
// `justify-between` — so, unlike a plain `space-y-*` stack of fixed-height
// bars, they spread across whatever height the body actually gets and keep
// reaching toward the bottom of the page instead of clumping at the top with
// blank space below. Colors are the same semantic tokens the file's own
// "report ready" loading skeleton further down already uses for this exact
// two-tone bar pattern (`border-subtle` for the darker tone, `muted` for the
// lighter one) — see semanticThemeUsage.test.js, which forbids raw palette
// literals in application UI outside its documented exceptions. Proportions
// otherwise match the Figma "Card With Image Tags" component's Imagen layer
// (313:180 aspect). It never reflects a report's real columns/content.
function ReportCardPreview() {
  return (
    <div
      className="relative w-full aspect-[313/180] rounded-lg bg-muted overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      <div className="absolute left-[16%] right-[16%] top-3 bottom-3 rounded bg-card shadow-sm p-2.5 overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="h-2 w-16 rounded bg-border-subtle" />
            <div className="h-1.5 w-11 rounded bg-border-subtle" />
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
            <div className="h-1 w-7 rounded bg-muted" />
            <div className="h-1 w-5 rounded bg-muted" />
          </div>
        </div>
        <div className="border-t border-border-subtle mt-1.5 mb-1.5 shrink-0" />
        <div className="flex-1 flex flex-col justify-between">
          <div className="h-1.5 w-full rounded bg-border-subtle" />
          <div className="h-1 w-full rounded bg-muted" />
          <div className="h-1 w-[92%] rounded bg-muted" />
          <div className="h-1 w-full rounded bg-muted" />
          <div className="h-1.5 w-full rounded bg-border-subtle" />
          <div className="h-1 w-[88%] rounded bg-muted" />
          <div className="h-1 w-full rounded bg-muted" />
          <div className="h-1 w-[95%] rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

// Matches the Figma "Card With Image Tags" component's proportions (radii,
// spacing, type scale) — see the CSS the design handed off for every layer —
// but through this app's semantic theme tokens rather than the design's raw
// hex values, per semanticThemeUsage.test.js (no undocumented palette
// literals in application UI): card surface + border, muted frame, and
// foreground/muted-foreground text, all resolved from the current theme
// instead of Figma's light-mode-only colors.
function ReportCard({ report, onRun }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const reportTitle = report.title?.[locale] || report.title?.en_US || report.title?.es_ES || report.id;
  return (
    <button
      onClick={() => onRun(report)}
      className="flex flex-col items-stretch w-full p-1 rounded-xl border border-border bg-card shadow-sm hover:border-primary/30 hover:shadow-md transition-all text-left overflow-hidden"
    >
      <ReportCardPreview data-testid="ReportCardPreview__3c998a" />
      <div className="flex flex-col items-stretch gap-1 p-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg bg-card border border-input shadow-sm">
            <FileText className="h-5 w-5 text-muted-foreground" data-testid="FileText__3c998a" />
          </div>
          <h3 className="text-base font-medium text-foreground min-w-0 truncate">{reportTitle}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {report.type === 'grouped-listing' ? ui('Grouped Report') : ui('Listing Report')}
          {report.orientation === 'landscape' ? ` — ${ui('Landscape')}` : ''}
        </p>
        <div className="flex gap-2 flex-wrap pt-1">
          {(report.outputs || []).map(o => (
            <span key={o} className="inline-flex items-center px-2 py-1 rounded-lg bg-muted text-xs font-normal text-muted-foreground uppercase">{o}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

// Single-select popup modal — used for fields with inputStyle: 'popup-single'.
const SELECTOR_PAGE_SIZE = 30;

function SelectorPopup({ open, onClose, onSelect, selector, title, extraParams = {} }) {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(''); setOptions([]); setOffset(0); setHasMore(false); setFocusIdx(-1); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const fetchPage = useCallback((q, off, append) => {
    const extra = Object.entries(extraParams).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const params = `q=${encodeURIComponent(q)}&limit=${SELECTOR_PAGE_SIZE}&offset=${off}${extra ? '&' + extra : ''}`;
    return fetch(`${ETENDO_BASE}/sws/report-selectors/${selector}?${params}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : (data?.items ?? []);
        const more = Array.isArray(data) ? false : (data?.hasMore ?? false);
        if (append) {
          setOptions(prev => [...prev, ...items]);
        } else {
          setOptions(items);
        }
        setHasMore(more);
        setOffset(off + items.length);
        setFocusIdx(-1);
      });
  }, [selector, extraParams]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setOptions([]);
    setOffset(0);
    setHasMore(false);
    const t = setTimeout(() => {
      fetchPage(query, 0, false).catch(() => setOptions([])).finally(() => setLoading(false));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, selector, open, extraParams]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        setLoadingMore(true);
        fetchPage(query, offset, true).catch(() => {}).finally(() => setLoadingMore(false));
      }
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, offset, query, fetchPage]);

  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && focusIdx >= 0 && options[focusIdx]) { onSelect(options[focusIdx]); onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30" onMouseDown={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-96 max-h-[480px] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="text-sm font-semibold">{title}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" data-testid="X__3c998a" /></button>
        </div>
        <div className="px-4 py-2 border-b border-border/20">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`${ui('Search')}...`}
            className="w-full h-8 px-2 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-auto py-1">
          {loading && <div className="flex justify-center py-6 text-muted-foreground text-xs">{ui('loading')}</div>}
          {!loading && options.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-xs">{ui('noResults')}</div>
          )}
          {options.map((o, idx) => (
            <button
              key={o.id}
              onClick={() => { onSelect(o); onClose(); }}
              className={['w-full text-left px-4 py-2 text-sm truncate', idx === focusIdx ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'].join(' ')}
            >
              {o.name}
            </button>
          ))}
          <div ref={sentinelRef} className="py-1 flex justify-center">
            {loadingMore && <span className="text-xs text-muted-foreground">{ui('loadingMore')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Dropdown / search-as-you-type selector.
// minLength=0 → shows all options on focus (used for small catalogs like org, accounting schema).
export function getSelectorPlaceholderLabel(multi, selectedItems, label, displayText) {
  if (multi) {
    if (selectedItems.length > 0) {
      return `${selectedItems.length} selected`;
    } else {
      return `Search ${label || 'Product'}...`;
    }
  } else {
    return displayText || `Search ${label || 'Product'}...`;
  }
}

export function getSelectedItems(multi, selected, value, displayValue) {
  if (value || displayValue) {
    if (!multi) {
      return [{id: value, name: displayValue}];
    }
    return selected;
  }
  if (multi) {
    return selected;
  }
  return [];
}

export function getProductSelectorUrl(productSelectorParams) {
  return productSelectorParams.toString()
      ? `${ETENDO_BASE}/sws/report-selectors/product?${productSelectorParams.toString()}`
      : `${ETENDO_BASE}/sws/report-selectors/product`;
}

export function getSelectorLabelClassName(selectedItems, displayText) {
  return `block truncate whitespace-nowrap ${selectedItems.length > 0 || displayText ? 'text-foreground' : 'text-muted-foreground'}`;
}

export function getSelectorButtonTitle(multi, selectedItems, displayText) {
  return multi && selectedItems.length > 0 ? selectedItems.map(s => s.name).join(', ') : (displayText || '');
}

export function applyProductSelectorScopeParams(selectedOrgId, productSelectorParams, roleOrgIds, selectedWarehouseId) {
  if (selectedOrgId) productSelectorParams.set('selectedOrgId', selectedOrgId);
  if (roleOrgIds && roleOrgIds.length > 0) productSelectorParams.set('roleOrgIds', roleOrgIds.join(','));
  if (selectedWarehouseId) productSelectorParams.set('warehouseIds', selectedWarehouseId);
}

// minLength=2 (default) → search-as-you-type (used for accounts, etc.).
function SearchInput({ selector, value, displayValue, onChange, multi, minLength = 2, fullWidth = false, hasError = false, token, label, selectedOrgId, roleOrgIds, selectedWarehouseId, extraParams = {} }) {
  const ui = useUI();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState([]); // [{id, name}]
  const ref = useRef(null);
  const touched = useRef(false); // prevent auto-fetch on mount
  const extraParamsRef = useRef(extraParams);
  useEffect(() => { extraParamsRef.current = extraParams; });

  const buildUrl = useCallback((q) => {
    const extra = Object.entries(extraParamsRef.current)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return `${ETENDO_BASE}/sws/report-selectors/${selector}?q=${encodeURIComponent(q)}${extra ? '&' + extra : ''}`;
  }, [selector]); // selector-only dep: extraParams read from ref at call time

  const useDrawerSearch = selector === 'product';
  const showDropdownArrow = selector === 'warehouse' && !multi;
  const inputWidthClass = fullWidth ? 'w-full' : 'w-44';

  const normalizeOptions = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  };

  const fetchOptions = useCallback((q) => {
    const params = new URLSearchParams({ q });
    if (selector === 'warehouse') {
      if (selectedOrgId) params.set('selectedOrgId', selectedOrgId);
      if (roleOrgIds && roleOrgIds.length > 0) params.set('roleOrgIds', roleOrgIds.join(','));
    }
    fetch(`${ETENDO_BASE}/sws/report-selectors/${selector}?${params.toString()}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
      .then(r => r.json())
      .then(data => { setOptions(normalizeOptions(data)); setOpen(true); })
      .catch(() => setOptions([]));
  }, [selector, selectedOrgId, roleOrgIds]);

  useEffect(() => {
    if (!touched.current) return;
    if (query.length < minLength) { if (minLength > 0) setOptions([]); return; }
    const t = setTimeout(() => fetchOptions(query), 300);
    return () => clearTimeout(t);
  }, [query, minLength, fetchOptions]);

  const handleFocus = () => {
    touched.current = true;
    if (minLength === 0) fetchOptions(query);
    else if (options.length) setOpen(true);
  };

  const handleChange = (e) => {
    touched.current = true;
    setQuery(e.target.value);
    setOpen(true);
    if (!multi && !e.target.value) onChange('', '');
  };

  useEffect(() => {
    if (!multi) return;
    if (!value) {
      setSelected([]);
      return;
    }
    const ids = String(value).split(',').map(s => s.trim()).filter(Boolean);
    const currentById = new Map(selected.map(s => [s.id, s.name]));
    const next = ids.map((id) => ({ id, name: currentById.get(id) || id }));
    setSelected(next);
  }, [multi, value]);

  const addItem = (item) => {
    if (multi) {
      const next = [...selected, item].filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);
      setSelected(next);
      onChange(next.map(s => s.id).join(','), next.map(s => s.name).join(' | '));
      setQuery('');
      setOpen(false);
    } else {
      const nextLabel = item.label || item.name || '';
      onChange(item.id, nextLabel);
      setQuery(nextLabel);
      setOpen(false);
    }
  };

  const removeItem = (id) => {
    const next = selected.filter(s => s.id !== id);
    setSelected(next);
    onChange(next.map(s => s.id).join(','), next.map(s => s.name).join(' | '));
  };


  const selectedIds = new Set(selected.map(s => s.id));

  if (useDrawerSearch) {
    const displayText = displayValue || '';
    const productSelectorParams = new URLSearchParams();
    applyProductSelectorScopeParams(selectedOrgId, productSelectorParams, roleOrgIds, selectedWarehouseId);
    const productSelectorUrl = getProductSelectorUrl(productSelectorParams);

    const selectedItems = getSelectedItems(multi, selected, value, displayValue);

    const handleDrawerSelect = (item) => {
      const normalized = {
        id: item.id,
        name: item.label || item.name || item.searchKey || item.id,
      };
      if (multi) {
        const next = [...selected, normalized].filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);
        setSelected(next);
        onChange(next.map(s => s.id).join(','), next.map(s => s.name).join(' | '));
      } else {
        onChange(normalized.id, normalized.name);
      }
    };

    return (
      <div className={inputWidthClass}>
        <div className="flex items-center h-8 border border-border rounded-md bg-card overflow-hidden focus-within:ring-1 focus-within:ring-primary/30">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex-1 h-full px-2 text-sm text-left focus:outline-none min-w-0"
            title={getSelectorButtonTitle(multi, selectedItems, displayText)}
          >
            <span className={getSelectorLabelClassName(selectedItems, displayText)}>
              {getSelectorPlaceholderLabel(multi, selectedItems, label, displayText)}
            </span>
          </button>
          {((multi && selectedItems.length > 0) || (!multi && (value || displayValue))) && (
            <button
              type="button"
              onClick={() => {
                if (multi) setSelected([]);
                onChange('', '');
              }}
              className="shrink-0 h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center"
              aria-label={`Clear ${label || 'product'}`}
            >
              <X className="h-3.5 w-3.5" data-testid="X__3c998a" />
            </button>
          )}
        </div>
        <ProductSearchDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSelect={(item) => {
            if (multi && selected.some(s => s.id === item.id)) {
              removeItem(item.id);
            } else {
              handleDrawerSelect(item);
            }
          }}
          selectorUrl={productSelectorUrl}
          token={token}
          title={label || 'Product'}
          keepOpenOnSelect={multi}
          selectedIds={selectedItems.map(s => s.id)}
          data-testid="ProductSearchDrawer__3c998a" />
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {multi && selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selected.map(s => (
            <span key={s.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
              {s.name}
              <button onClick={() => removeItem(s.id)} className="ml-0.5 hover:text-destructive">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className={`relative ${inputWidthClass}`}>
        <input
          type="text"
          value={multi ? query : (query || displayValue || '')}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={label ? `Search ${label}…` : ui('searchPlaceholder')}
          className={`h-8 px-2 text-sm rounded-md bg-card focus:outline-none focus:ring-1 w-full border ${hasError ? 'border-destructive ring-destructive/30' : 'border-border focus:ring-primary/30'} ${showDropdownArrow ? 'pr-7' : ''}`}
        />
        {showDropdownArrow && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(prev => !prev)}
            className="absolute right-1 top-1.5 h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center"
            aria-label={`Toggle ${label || 'selector'} options`}
          >
            <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown__3c998a" />
          </button>
        )}
        {multi && selected.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setSelected([]); onChange('', ''); }}
            className="absolute right-7 top-1.5 h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center"
            aria-label={`Clear ${label || 'selector'}`}
          >
            <X className="h-3.5 w-3.5" data-testid="X__3c998a" />
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full max-h-48 overflow-auto rounded-lg border bg-card shadow-lg py-1">
          {options.filter(o => !selectedIds.has(o.id)).map(o => (
            <button key={o.id} onClick={() => addItem(o)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 truncate">{o.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Multi-select popup: shows selected tags + a "+" button that opens a modal with
// a searchable list and checkboxes. Used for Business Partner, Product, Project.
function PopupMultiSelector({ selector, label, onChange, value = '', displayValue = '' }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [pending, setPending] = useState([]); // selection inside modal (not yet confirmed)
  // [{id, name}] committed to the report. Seeded once from `value`/`displayValue`
  // (the same comma / ", "-joined shape `confirm()` below writes into params/
  // `_display_<name>`) — without this, a deep-linked report (ETP-4898's "Open in
  // new tab" drill-down button, or any future one) renders correctly server-side
  // but this field shows empty chips, because this component otherwise never
  // reads its initial selection from props.
  const [confirmed, setConfirmed] = useState(() => {
    if (!value) return [];
    const ids = value.split(',').filter(Boolean);
    const names = displayValue ? displayValue.split(', ') : [];
    return ids.map((id, i) => ({ id, name: names[i] || id }));
  });
  // Frozen at openModal() time — "what was confirmed as of the last OK". Options matching
  // this snapshot float to the top of the list. Deliberately NOT derived from `pending`, so
  // checking a brand-new item mid-session doesn't make it jump up until the next reopen.
  const [openSnapshotIds, setOpenSnapshotIds] = useState(() => new Set());
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`${ETENDO_BASE}/sws/report-selectors/${selector}?q=${encodeURIComponent(query)}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
        .then(r => r.json())
        .then(data => setOptions(Array.isArray(data) ? data : (data?.items ?? [])))
        .catch(() => setOptions([]));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, open, selector]);

  const openModal = () => {
    setPending([...confirmed]);
    setOpenSnapshotIds(new Set(confirmed.map(s => s.id)));
    setQuery('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const orderedOptions = useMemo(() => (
    [...options].sort((a, b) =>
      (openSnapshotIds.has(b.id) ? 1 : 0) - (openSnapshotIds.has(a.id) ? 1 : 0)
    )
  ), [options, openSnapshotIds]);

  const toggleItem = (item) => {
    const exists = pending.some(s => s.id === item.id);
    setPending(exists ? pending.filter(s => s.id !== item.id) : [...pending, item]);
  };

  const confirm = () => {
    setConfirmed(pending);
    onChange(pending.map(s => s.id).join(','), pending.map(s => s.name).join(', '));
    setOpen(false);
  };

  const removeConfirmed = (id) => {
    const next = confirmed.filter(s => s.id !== id);
    setConfirmed(next);
    onChange(next.map(s => s.id).join(','), next.map(s => s.name).join(', '));
  };

  const clearAll = () => {
    setConfirmed([]);
    onChange('', '');
  };

  const MAX_VISIBLE_TAGS = 3;
  const visibleTags = confirmed.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = confirmed.length - MAX_VISIBLE_TAGS;

  return (
    <>
      <div className="flex flex-col gap-1">
        {confirmed.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-0.5">
            {visibleTags.map(s => (
              <span key={s.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                {s.name}
                <button onClick={() => removeConfirmed(s.id)} className="ml-0.5 hover:text-destructive">&times;</button>
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium">
                {ui('andNMore', { n: hiddenCount })}
              </span>
            )}
            <button
              onClick={clearAll}
              className="text-[10px] text-muted-foreground hover:text-destructive underline underline-offset-2 ml-1"
            >
              {ui('clearAll')}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={openModal}
          className="h-8 px-3 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted/50 flex items-center gap-1.5 text-muted-foreground"
        >
          <span className="text-sm font-bold leading-none">+</span>
          {confirmed.length === 0 ? label : ui('editSelection')}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-card rounded-xl shadow-2xl w-[480px] max-h-[560px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h3 className="text-sm font-semibold">{ui('selectLabelPrefix')} {label}</h3>
              <button onClick={() => setOpen(false)} className="text-lg leading-none text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <div className="px-4 py-2 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`${ui('Search')}...`}
                className="w-full h-8 px-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 overflow-auto">
              {options.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                  {query.length > 0 ? ui('noResults') : ui('loading')}
                </p>
              ) : (
                orderedOptions.map(o => {
                  const isSelected = pending.some(s => s.id === o.id);
                  return (
                    <label key={o.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(o)}
                        className="w-4 h-4 accent-primary shrink-0"
                      />
                      <span className="text-sm truncate">{o.name}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-muted/20">
              <span className="text-xs text-muted-foreground">{ui('selected', { count: pending.length })}</span>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="h-8 px-3 text-xs rounded-md border border-border hover:bg-muted/50">{ui('cancel')}</button>
                <button onClick={confirm} className="h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Single-select modal: shows a button with the current value, opens a modal with
// a search input and a clickable list. Single click selects and closes immediately.
function SingleSelectModal({ selector, label, value, displayValue, onChange, hasError = false, extraParams = {} }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const inputRef = useRef(null);
  const extraParamsRef = useRef(extraParams);
  useEffect(() => { extraParamsRef.current = extraParams; });

  useEffect(() => {
    if (!open) return;
    const extra = Object.entries(extraParamsRef.current)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `${ETENDO_BASE}/sws/report-selectors/${selector}?q=${encodeURIComponent(query)}${extra ? '&' + extra : ''}`;
    const t = setTimeout(() => {
      fetch(url).then(r => r.json()).then(setOptions).catch(() => setOptions([]));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, open, selector]);

  const openModal = () => {
    setQuery('');
    setOptions([]);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const selectItem = (item) => {
    onChange(item.id, item.name);
    setOpen(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange('', '');
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`w-full h-9 px-3 text-sm rounded-md border bg-card hover:bg-muted/50 flex items-center justify-between gap-2 ${hasError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border'}`}
      >
        <span className={`truncate ${displayValue ? 'text-foreground' : 'text-muted-foreground'}`}>
          {displayValue || `Select ${label}...`}
        </span>
        {displayValue && (
          <span onClick={clear} className="text-muted-foreground hover:text-destructive shrink-0 text-base leading-none">&times;</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-card rounded-xl shadow-2xl w-[420px] max-h-[500px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h3 className="text-sm font-semibold">{label}</h3>
              <button onClick={() => setOpen(false)} className="text-lg leading-none text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <div className="px-4 py-2 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={ui('searchPlaceholder')}
                className="w-full h-8 px-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 overflow-auto">
              {options.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                  {query.length > 0 ? 'No results' : 'Loading...'}
                </p>
              ) : (
                options.map(o => (
                  <button
                    key={o.id}
                    onClick={() => selectItem(o)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 truncate ${value === o.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                  >
                    {o.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const SIDEBAR_SECTIONS = [
  { key: 'primary', labelKey: 'reportScope' },
  { key: 'dimensions', labelKey: 'refineDimensions' },
  { key: 'options', labelKey: 'displayOptions' },
];

// A parameter can be required outright (`p.required`) or only conditionally,
// when another parameter currently holds a given value (`p.requiredIf: {param,
// equals}` — e.g. Profit & Loss's "Reference Year", only mandatory while
// "Compare To" is toggled on, ETP-4899). Both the sidebar's live asterisk and
// the shared `validateRequired()` (sidebar submit + top-bar format buttons)
// read this same helper, so they never drift apart.
function isParamRequired(p, params) {
  return !!p.required || !!(p.requiredIf && params[p.requiredIf.param] === p.requiredIf.equals);
}

// Same conditional idea as `isParamRequired`, but for visibility: a param with
// `visibleIf: {param, equals}` only renders while that other param currently
// holds the given value (e.g. Profit & Loss's Reference Year/From/To Reference
// Date only make sense — and only show — once "Compare To" is toggled on,
// ETP-4899). A param with no `visibleIf` is always visible (subject to the
// existing static `hidden` flag, checked separately).
function isParamVisible(p, params) {
  return !p.visibleIf || params[p.visibleIf.param] === p.visibleIf.equals;
}

// Reports whose contract declares its own `sections` (id + label) use the
// collapsible accordion below. Reports without one keep the legacy flat
// primary/dimensions/options layout untouched — migrate them one at a time
// by adding a `sections` array to their report-contract.json (ETP-4898).
function ReportSidebar({ report, params, onChange, onSubmit, onReset, loading, resetKey, token, selectedOrgId, roleOrgIds, errors, setErrors }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [displayValues, setDisplayValues] = useState({});
  const [popup, setPopup] = useState(null); // { name, selector, label } for popup-single
  const useAccordion = Array.isArray(report.sections) && report.sections.length > 0;
  // Independent open/closed state per section — several can be expanded at once,
  // unlike a classic single-open accordion.
  const [openSections, setOpenSections] = useState(() => ({ [report.sections?.[0]?.id]: true }));

  useEffect(() => {
    setOpenSections({ [report.sections?.[0]?.id]: true });
  }, [report.id]);

  useEffect(() => {
    setDisplayValues({});
    setErrors({});
  }, [resetKey]);

  const handleChange = (name, value) => {
    if (errors[name] && value) setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    onChange(name, value);
  };

  const grouped = {};
  for (const p of report.parameters || []) {
    if (p.hidden || !isParamVisible(p, params)) continue;
    const sec = p.section || 'primary';
    if (!grouped[sec]) grouped[sec] = [];
    grouped[sec].push(p);
  }

  // Each renderXParam below owns exactly one `p.type` branch that renderParam
  // used to inline — pure extraction (ETP-4898/Sonar cognitive complexity),
  // no behavior change. They stay as closures alongside renderParam so they
  // keep direct access to the same component state/handlers (params, errors,
  // handleChange, displayValues, setPopup, token, selectedOrgId, roleOrgIds,
  // report, ui, locale, resetKey) instead of threading a dozen props through.

  // Multi-select popup (checkboxes)
  const renderSearchPopupParam = (p, { label, labelEl }) => (
    <div key={`${p.name}-${resetKey}`}>
      {labelEl}
      <PopupMultiSelector
        key={`${p.name}-${resetKey}`}
        selector={p.selector}
        label={label}
        value={params[p.name] || ''}
        displayValue={params['_display_' + p.name] || ''}
        onChange={(id, name) => { handleChange(p.name, id); handleChange('_display_' + p.name, name); }}
        data-testid="PopupMultiSelector__3c998a" />
    </div>
  );

  // Single-select popup modal
  const renderSearchPopupSingleParam = (p, { label, labelEl, hasError, errorBorder }) => {
    const display = displayValues[p.name] || params['_display_' + p.name] || '';
    return (
      <div key={p.name}>
        {labelEl}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
            const extra = {};
            if (p.dependsOn) {
              const paramKey = p.selector === 'account' ? 'selectedAcctSchemaId' : 'selectedOrgId';
              extra[paramKey] = params[p.dependsOn] || '';
            }
            setPopup({ name: p.name, selector: p.selector, label, extraParams: extra });
          }}
            className={`flex-1 h-9 px-3 text-sm border rounded-md bg-card hover:bg-muted/50 text-left truncate text-muted-foreground ${errorBorder}`}
          >
            {display || <span className="opacity-50">{ui('selectPlaceholder')}</span>}
          </button>
          {display && (
            <button
              type="button"
              onClick={() => { handleChange(p.name, ''); handleChange('_display_' + p.name, ''); setDisplayValues(prev => ({ ...prev, [p.name]: '' })); }}
              className="h-9 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
            ><X className="h-3.5 w-3.5" data-testid="X__3c998a" /></button>
          )}
        </div>
        {hasError && <p className="text-[10px] text-destructive mt-1">{ui('required')}</p>}
      </div>
    );
  };

  // Inline search dropdown (default)
  const renderSearchInlineParam = (p, { label, labelEl, hasError }) => (
    <div key={p.name}>
      {labelEl}
      <SearchInput
        selector={p.selector}
        value={params[p.name] || ''}
        displayValue={displayValues[p.name] || params['_display_' + p.name] || ''}
        onChange={(id, name) => {
          handleChange(p.name, id);
          handleChange('_display_' + p.name, name);
          setDisplayValues(prev => ({ ...prev, [p.name]: name }));
        }}
        multi={p.multi}
        minLength={p.inputStyle === 'dropdown' ? 0 : 2}
        fullWidth
        hasError={hasError}
        token={token}
        label={label}
        selectedOrgId={selectedOrgId}
        roleOrgIds={roleOrgIds}
        selectedWarehouseId={params.M_Warehouse_ID || ''}
        data-testid="SearchInput__3c998a" />
      {hasError && <p className="text-[10px] text-destructive mt-1">{ui('required')}</p>}
    </div>
  );

  const renderSearchParam = (p, ctx) => {
    if (p.inputStyle === 'popup') return renderSearchPopupParam(p, ctx);
    if (p.inputStyle === 'popup-single') return renderSearchPopupSingleParam(p, ctx);
    return renderSearchInlineParam(p, ctx);
  };

  const renderSelectParam = (p, { label, labelEl }) => {
    const resolvedOptions = p.options ?? (() => {
      // groupByValue is the deliberate opt-in marker for "usable as a Group By
      // option" — filtering on it alone is robust across section-naming schemes
      // (legacy 'dimensions', or a report's own 'sections' ids like 'dimensiones').
      const base = { value: '', label: ui('none') };
      const fromDimensions = (report.parameters || [])
        .filter(d => d.groupByValue)
        .map(d => ({ value: d.groupByValue, label: d.label?.[locale] || d.label?.en_US || d.name }));
      return [base, ...fromDimensions];
    })();
    const resolveOptLabel = (o) => (o.label && typeof o.label === 'object' ? (o.label[locale] || o.label.en_US) : o.label);
    // No "None" row: the base/empty entry (value '') is dropped from the list entirely —
    // clearing a selection is done via the chip's "×" (CreatableSearchSelect's clearable
    // behavior), not via a pinned empty option.
    const staticOpts = resolvedOptions
      .filter(o => o.value !== '')
      .map(o => ({ id: o.value, name: resolveOptLabel(o) }));
    const selectedOpt = staticOpts.find(o => o.id === (params[p.name] || ''));
    return (
      <div key={p.name}>
        {labelEl}
        <CreatableSearchSelect
          field={{ key: p.name, required: p.required }}
          value={params[p.name] || ''}
          displayValue={selectedOpt ? selectedOpt.name : ''}
          onChange={(id) => handleChange(p.name, id)}
          resolvedLabel={label}
          staticOptions={staticOpts}
          placeholderOverride={ui('selectPlaceholder')}
          data-testid="CreatableSearchSelect__3c998a" />
      </div>
    );
  };

  const renderToggleParam = (p, { label }) => {
    const isOn = params[p.name] === 'true';
    return (
      <div key={p.name} className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <button
          type="button"
          onClick={() => handleChange(p.name, isOn ? 'false' : 'true')}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${isOn ? 'bg-foreground' : 'bg-muted'}`}
          role="switch"
          aria-checked={isOn}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform ${isOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    );
  };

  const renderBooleanParam = (p, { label }) => (
    <div key={p.name} className="flex items-start gap-2.5 p-3 rounded-lg border border-border/40 bg-muted/20 cursor-pointer"
      onClick={() => handleChange(p.name, params[p.name] === 'true' ? 'false' : 'true')}
    >
      <input
        type="checkbox"
        checked={params[p.name] === 'true'}
        onChange={e => handleChange(p.name, e.target.checked ? 'true' : 'false')}
        onClick={e => e.stopPropagation()}
        className="mt-0.5 w-4 h-4 accent-primary shrink-0"
      />
      <div>
        <div className="text-xs font-medium text-foreground">{label}</div>
        {p.description && <div className="text-[10px] text-muted-foreground mt-0.5">{p.description}</div>}
      </div>
    </div>
  );

  const renderDateParam = (p, { labelEl, hasError, errorBorder }) => (
    <div key={p.name}>
      {labelEl}
      <DateField
        value={params[p.name] || ''}
        onChange={(iso) => handleChange(p.name, iso)}
        className={errorBorder}
        data-testid="DateField__3c998a" />
      {hasError && <p className="text-[10px] text-destructive mt-1">{ui('required')}</p>}
    </div>
  );

  // number, text
  const renderTextParam = (p, { labelEl, hasError, errorBorder }) => (
    <div key={p.name}>
      {labelEl}
      <input
        type={p.type === 'number' ? 'number' : 'text'}
        value={params[p.name] || ''}
        onChange={e => handleChange(p.name, e.target.value)}
        className={`w-full h-9 px-2 text-sm rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 border ${errorBorder}`}
      />
      {hasError && <p className="text-[10px] text-destructive mt-1">{ui('required')}</p>}
    </div>
  );

  const renderParam = (p) => {
    const label = p.label?.[locale] || p.label?.en_US || p.name;
    const hasError = !!errors[p.name];
    const labelEl = (
      <label className="block text-xs font-medium text-foreground mb-1.5">
        {label}{isParamRequired(p, params) && <span className="text-destructive ml-0.5">*</span>}
      </label>
    );
    const errorBorder = hasError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border';
    const ctx = { label, hasError, labelEl, errorBorder };

    if (p.type === 'search') return renderSearchParam(p, ctx);
    if (p.type === 'select') return renderSelectParam(p, ctx);
    if (p.type === 'toggle') return renderToggleParam(p, ctx);
    if (p.type === 'boolean') return renderBooleanParam(p, ctx);
    if (p.type === 'date') return renderDateParam(p, ctx);
    return renderTextParam(p, ctx);
  };

  // Renders params in the exact order the contract declares them (ETP-4899 —
  // previously every date param was hoisted to the top of the section
  // regardless of declared order, e.g. Profit & Loss's "Year" always landed
  // BELOW "Starting/Ending Date" even though the contract lists it first).
  // Adjacent date params still pair up into the 2-column grid — just wherever
  // that run actually falls in the declared order, not forced to the front.
  const renderSection = (sec, sectionParams) => {
    const blocks = [];
    let i = 0;
    while (i < sectionParams.length) {
      if (sectionParams[i].type === 'date') {
        const run = [];
        while (i < sectionParams.length && sectionParams[i].type === 'date') {
          run.push(sectionParams[i]);
          i++;
        }
        blocks.push(
          <div key={`date-run-${run[0].name}`} className={run.length >= 2 ? 'grid grid-cols-2 gap-2' : ''}>
            {run.map(renderParam)}
          </div>
        );
      } else {
        blocks.push(renderParam(sectionParams[i]));
        i++;
      }
    }
    return <div className="space-y-3">{blocks}</div>;
  };

  return (
    <div className="flex flex-col h-full">
      {popup && (
        <SelectorPopup
          open
          onClose={() => setPopup(null)}
          selector={popup.selector}
          title={popup.label}
          extraParams={popup.extraParams || {}}
          onSelect={(item) => {
            handleChange(popup.name, item.id);
            handleChange('_display_' + popup.name, item.name);
            setDisplayValues(prev => ({ ...prev, [popup.name]: item.name }));
            setPopup(null);
          }}
          data-testid="SelectorPopup__3c998a" />
      )}
      <div className="p-2 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {ui('customizeReport')}
          <Info className="h-3.5 w-3.5 text-muted-foreground" data-testid="Info__3c998a" />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{ui('customizeReportHint')}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {useAccordion ? (
          report.sections.map(({ id, label }) => {
            // A section with no parameters yet still renders (header + empty
            // body) instead of disappearing — a contract may declare a
            // section ahead of the fields that will populate it later.
            const sectionParams = grouped[id] || [];
            const isOpen = !!openSections[id];
            const sectionLabel = label?.[locale] || label?.en_US || id;
            return (
              <div key={id} className="border-b border-border/30">
                <button
                  type="button"
                  onClick={() => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))}
                  className={`w-full flex items-center justify-between px-2 py-3 text-left text-xs font-semibold transition-colors ${
                    isOpen ? 'bg-accent-highlight text-accent-highlight-foreground' : 'bg-card text-foreground hover:bg-muted/40'
                  }`}
                >
                  {sectionLabel}
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} data-testid="ReportSectionChevron__3c998a" />
                </button>
                {isOpen && <div className="px-2 py-2">{renderSection(id, sectionParams)}</div>}
              </div>
            );
          })
        ) : (
          <div className="px-4 py-4 space-y-6">
            {SIDEBAR_SECTIONS.map(({ key, labelKey }) => {
              const sectionParams = grouped[key];
              if (!sectionParams?.length) return null;
              return (
                <div key={key}>
                  <h4 className="text-xs font-semibold text-foreground mb-3">{ui(labelKey)}</h4>
                  {renderSection(key, sectionParams)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="p-2 border-t border-border/30 flex gap-2 shrink-0">
        <button
          onClick={onReset}
          disabled={loading}
          className="flex-1 h-10 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
        >
          {ui('resetFilters')}
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 h-10 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? ui('running') : ui('runReport')}
        </button>
      </div>
    </div>
  );
}

function DrillDownViewer({ report, token, baseParams, bpId, targetReportId, extraParams = {} }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { locale } = useLocaleSwitch();
  const ui = useUI();

  const reportId = targetReportId || report.id;
  const drillParams = { ...baseParams, ...(bpId ? { bPartnerId: bpId, showDetails: 'true' } : {}), ...extraParams };

  const writeToIframe = (html) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.src = 'about:blank';
    iframe.onload = () => {
      try { const d = iframe.contentDocument; d.open(); d.write(html); d.close(); } catch { /* */ }
      iframe.onload = null;
    };
  };

  const fetchFormat = useCallback(async (format) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ format, params: drillParams, locale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Render failed: ${res.status}`);
      }
      if (format === 'html' || format === 'preview') {
        writeToIframe(await res.text());
      } else if (format === 'pdf') {
        iframeRef.current.src = URL.createObjectURL(await res.blob());
      } else {
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a'); a.href = url; a.download = `${report.id}-detail.${format}`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, token, bpId, locale]);

  useEffect(() => { fetchFormat('preview'); }, [fetchFormat]);

  // Opens the same render, but as a standalone report page in a new tab —
  // its own sidebar/toolbar, not the read-only modal preview (ETP-4898).
  // Same-origin navigation: the JWT lives in localStorage, so the new tab is
  // already authenticated on load, no token needs to travel through the URL.
  const openFullReport = useCallback(() => {
    const basePath = window.location.pathname.replace(/\/[^/]*$/, ''); // same pattern as the invoice iframe (below)
    const qs = new URLSearchParams();
    qs.set('report', reportId);
    qs.set('category', 'finance');
    // Only forward filled-in values — an empty/undefined one would otherwise
    // stringify as the literal "undefined" and needlessly override the target
    // report's own default for that parameter.
    for (const [key, value] of Object.entries(drillParams)) {
      if (value !== undefined && value !== null && value !== '') qs.set(key, value);
    }
    window.open(`${window.location.origin}${basePath}/report-viewer?${qs.toString()}`, '_blank');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, JSON.stringify(drillParams)]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex items-center gap-2 px-1">
        {[{ id: 'pdf', labelKey: 'PDF', icon: FileDown }, { id: 'xlsx', labelKey: 'Excel', icon: FileSpreadsheet }, { id: 'csv', labelKey: 'CSV', icon: FileText }].map(f => (
          <button key={f.id} onClick={() => fetchFormat(f.id)} disabled={loading}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50">
            <f.icon className="h-3.5 w-3.5" />{ui(f.labelKey)}
          </button>
        ))}
        <button onClick={openFullReport}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50">
          <ExternalLink className="h-3.5 w-3.5" data-testid="ExternalLink__3c998a" />{ui('openFullReport')}
        </button>
      </div>
      <div className="flex-1 bg-card rounded-lg border border-border/30 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__3c998a" /><span>{ui('loadingDetails')}</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm px-8 text-center">{error}</div>
        )}
        <iframe ref={iframeRef} title={ui('detailReport')} className="w-full h-full border-0" />
      </div>
    </div>
  );
}

function ReportViewer({ report, onBack, token, selectedOrgId, roleOrgIds, categoryFilter }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const previewHtmlRef = useRef('');
  // Tracks "a render has actually completed", independent of previewHtmlRef
  // (which only ever holds HTML — 'preview' format). Clicking PDF/Excel/CSV
  // directly, before ever generating the HTML preview, used to leave this
  // condition permanently false, so the "ready to go" skeleton stayed stuck
  // ON TOP of the iframe (an absolutely-positioned overlay always paints
  // above the statically-positioned iframe) even after the PDF/file rendered
  // successfully behind it.
  const [hasGenerated, setHasGenerated] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [drillDownBp, setDrillDownBp] = useState(null);
  const [drillDownAccount, setDrillDownAccount] = useState(null);
  const { locale } = useLocaleSwitch();
  const tMenu = useMenuLabel();
  const ui = useUI();
  // Same URL state ReportViewerPage already reads for `report`/`category` — a
  // second useSearchParams() call is fine (React Router just re-reads the
  // current URL), used here to let a deep-link pre-fill the sidebar's filter
  // values (e.g. the "open in new tab" drill-down button, ETP-4898).
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'aging-drilldown' && e.data.bpId) {
        setDrillDownBp({ id: e.data.bpId, name: e.data.bpName || '' });
      } else if (e.data?.type === 'trial-balance-drilldown' && e.data.accountId) {
        setDrillDownAccount({ id: e.data.accountId, name: e.data.accountName || '', value: e.data.accountValue || '' });
      } else if (e.data?.type === 'navigate-invoice' && e.data.invoiceId) {
        // Opens the invoice in a real new tab instead of an embedded modal —
        // the document window (sales-invoice/purchase-invoice) is decided by
        // the report's own template.hbs (docWindow in the postMessage), never
        // hardcoded here, since this handler is shared by every report.
        const docWindow = e.data.docWindow || 'sales-invoice';
        const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
        window.open(`${window.location.origin}${basePath}/${docWindow}/${e.data.invoiceId}`, '_blank');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const getDefaultParams = useCallback(() => {
    const defaults = {};
    for (const p of report.parameters || []) {
      if (p.default === '__TODAY__') {
        defaults[p.name] = new Date().toISOString().split('T')[0];
      } else if (p.default === '__FIRST_OF_PREV_MONTH__') {
        const now = new Date();
        defaults[p.name] = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      } else if (p.default === '__FIRST_OF_YEAR__') {
        defaults[p.name] = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      } else if (p.default !== undefined && p.default !== null && p.default !== false) {
        defaults[p.name] = String(p.default);
      } else {
        defaults[p.name] = '';
      }
      // A deep-link query-string value (e.g. the "open in new tab" drill-down
      // button, ETP-4898) overrides the contract default for that same
      // parameter name — this is what lets a new tab land pre-filled instead
      // of resetting to the report's plain defaults.
      if (searchParams.has(p.name)) {
        defaults[p.name] = searchParams.get(p.name);
      }
      // Search/popup params (fromAccountId, bPartnerId, etc.) render their
      // human label from `_display_<name>` (see renderSearchPopupSingleParam/
      // renderSearchInlineParam/renderSearchPopupParam below), never from the
      // raw id/code — carry that companion key too, or the field shows the
      // right filter with an empty-looking "Seleccionar..." placeholder.
      const displayKey = '_display_' + p.name;
      if (searchParams.has(displayKey)) {
        defaults[displayKey] = searchParams.get(displayKey);
      }
    }
    if ('orgId' in defaults) {
      defaults.orgId = searchParams.get('orgId') || selectedOrgId || '';
    }
    return defaults;
  }, [report, selectedOrgId, searchParams]);

  const [params, setParams] = useState(getDefaultParams);
  // Lifted from ReportSidebar (ETP-4899): the top bar's PDF/Excel/CSV buttons call
  // renderReport() directly, bypassing ReportSidebar's own "Generate Report" button —
  // so validation has to live here too, shared by both entry points, or the top bar
  // buttons silently send an incomplete request straight to the backend (which then
  // fails server-side, e.g. NEO 400 "dateFrom and dateTo are required", instead of the
  // sidebar showing its usual red "Required" boxes).
  const [errors, setErrors] = useState({});
  const validateRequired = useCallback(() => {
    const newErrors = {};
    for (const p of report.parameters || []) {
      if (p.hidden) continue;
      if (isParamRequired(p, params) && !params[p.name]) newErrors[p.name] = true;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [report, params]);

  useEffect(() => {
    if (!(report.parameters || []).some(p => p.name === 'orgId')) return;
    setParams(prev => {
      const nextOrgId = selectedOrgId || '';
      if ((prev.orgId || '') === nextOrgId) return prev;
      return { ...prev, orgId: nextOrgId, _display_orgId: '' };
    });
  }, [report, selectedOrgId]);

  // Auto-load defaults for params marked with autoDefault: true.
  // Params with dependsOn are loaded in a second pass, after their dependency is resolved.
  // Extracted so "Limpiar filtros" can re-run it too — getDefaultParams() has no literal
  // default for these (that's the whole point of autoDefault), so a plain reset blanked
  // them out (e.g. Moneda) instead of restoring the auto-loaded value.
  const loadAutoDefaults = useCallback(() => {
    const autoParams = (report.parameters || []).filter(p => p.autoDefault && p.selector && p.name !== 'orgId');
    if (!autoParams.length) return;
    Promise.all(
      autoParams.map(p => {
        // currencyId's autoDefault must follow the ACTIVE ORGANIZATION's currency
        // (ad_org.c_currency_id, same field /organization shows as "Moneda"), not just
        // the client's base currency — a multi-org client can have orgs in different
        // currencies. report-api.js's 'currency' selector already prefers the org's
        // currency in its ORDER BY when selectedOrgId is passed; without it, it falls
        // back to the client's base currency.
        const orgParam = (p.selector === 'currency' && selectedOrgId)
          ? `&selectedOrgId=${encodeURIComponent(selectedOrgId)}`
          : '';
        return fetch(`${ETENDO_BASE}/sws/report-selectors/${p.selector}?q=${orgParam}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
          .then(r => r.json())
          .then(data => { const rows = Array.isArray(data) ? data : (data.items || []); return rows[0] ? { name: p.name, id: rows[0].id, display: rows[0].name } : null; })
          .catch(() => null);
      })
    ).then(results => {
      const updates = {};
      for (const r of results) {
        if (!r) continue;
        updates[r.name] = r.id;
        updates['_display_' + r.name] = r.display;
      }
      if (Object.keys(updates).length) setParams(prev => ({ ...prev, ...updates }));
    });
  }, [report, selectedOrgId]);

  useEffect(() => { loadAutoDefaults(); }, [loadAutoDefaults]);

  const writeToIframe = (html) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.src = 'about:blank';
    iframe.onload = () => {
      try { const d = iframe.contentDocument; d.open(); d.write(html); d.close(); } catch { /* */ }
      iframe.onload = null;
    };
  };

  const renderReport = useCallback(async (format) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ format, params, locale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Render failed: ${res.status}`);
      }
      if (format === 'html' || format === 'preview') {
        const html = await res.text();
        previewHtmlRef.current = html;
        writeToIframe(html);
        setHasGenerated(true);
      } else if (format === 'pdf') {
        const blob = await res.blob();
        iframeRef.current.src = URL.createObjectURL(blob);
        setHasGenerated(true);
      } else {
        // Excel/CSV are pure downloads — they never touch the iframe, so the
        // "ready to go" hint stays exactly as informative as before.
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.id}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [report.id, token, params, locale]);

  // No auto-render on mount — wait for user to click Run Report... UNLESS the
  // page was opened via a deep-link that carries real filter values (e.g. the
  // drill-down modal's "Open in new tab" button, ETP-4898) rather than just
  // `?report=`/`?category=` (the plain report-list/favorites navigation).
  // Those already have a filled-in sidebar, so re-running "Generar informe"
  // manually would be redundant friction. Fires once, and waits for any
  // autoDefault-driven param (still loading async above) to land first.
  const isDeepLinked = useMemo(() => {
    for (const key of searchParams.keys()) {
      if (key !== 'report' && key !== 'category') return true;
    }
    return false;
  }, [searchParams]);
  const autoRunFiredRef = useRef(false);
  useEffect(() => {
    if (!isDeepLinked || autoRunFiredRef.current) return;
    const missingRequired = (report.parameters || []).some(p => p.required && !p.hidden && !params[p.name]);
    if (missingRequired) return;
    autoRunFiredRef.current = true;
    renderReport('html');
  }, [isDeepLinked, params, report.parameters, renderReport]);

  const handlePrint = () => {
    if (iframeRef.current?.contentDocument?.body?.innerHTML) {
      iframeRef.current.contentWindow.print();
    } else if (previewHtmlRef.current) {
      const w = window.open('', '_blank', 'width=1200,height=800');
      w.document.open(); w.document.write(previewHtmlRef.current); w.document.close();
      w.onload = () => { w.print(); w.close(); };
    }
  };

  const handleReset = () => {
    setParams(getDefaultParams());
    setResetKey(k => k + 1);
    loadAutoDefaults();
  };

  const { toggleFavorite, isFavorite } = useFavorites();
  const title = report.title?.[locale] || report.title?.en_US || report.title?.es_ES || report.id;
  const categoryLabel = categoryFilter && CATEGORY_LABELS[categoryFilter]
    ? tMenu(CATEGORY_LABELS[categoryFilter].en)
    : null;
  const breadcrumb = [categoryLabel, tMenu('Reports'), title].filter(Boolean).join(' / ');
  const favKey = categoryFilter
    ? `report-viewer?category=${categoryFilter}&report=${report.id}`
    : `report-viewer?report=${report.id}`;
  const favActive = isFavorite(favKey);

  const favLabel = report.title?.en_US || report.title?.en || report.id;
  const favLabels = report.title && typeof report.title === 'object' ? report.title : undefined;
  useSetPageMeta({ title, breadcrumb, onBack, onAddToFavorites: () => toggleFavorite(favKey, favLabel, favLabels), isFavorite: favActive }, [favActive]);

  const DOWNLOAD_FORMATS = [
    { id: 'pdf', labelKey: 'PDF', icon: FileDown },
    { id: 'xlsx', labelKey: 'Excel', icon: FileSpreadsheet },
    { id: 'csv', labelKey: 'CSV', icon: FileText },
  ];

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col">
        {/* ===== Top bar: Cancel + format actions — spans sidebar + content ===== */}
        <div className="flex items-center justify-between px-2 py-2 bg-card border-b border-border/30 shrink-0">
          <Button
            variant="outline"
            className="h-9 px-3 rounded-lg bg-card border border-[hsl(var(--border-control))] text-[hsl(var(--foreground))] text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
            data-testid="action-cancel"
            onClick={onBack}
          >
            {ui('cancel')}
          </Button>
          <div className="flex items-center gap-1">
            {DOWNLOAD_FORMATS.map(fmt => {
              const Icon = fmt.icon;
              return (
                <button key={fmt.id} onClick={() => { if (validateRequired()) renderReport(fmt.id); }} disabled={loading}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted/50 disabled:opacity-40">
                  <Icon className="h-3.5 w-3.5" data-testid="Icon__3c998a" />{ui(fmt.labelKey)}
                </button>
              );
            })}
            <div className="w-px h-6 bg-border/50 mx-1" />
            <button onClick={handlePrint} disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Printer className="h-3.5 w-3.5" data-testid="Printer__3c998a" />{ui('print')}
            </button>
          </div>
        </div>

        {/* ===== Content: sidebar + right panel ===== */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar */}
          <div className="w-[300px] shrink-0 flex flex-col border-r border-border/30 bg-card overflow-hidden">
            <ReportSidebar
              report={report}
              params={params}
              onChange={(name, value) => setParams(prev => ({ ...prev, [name]: value }))}
              onSubmit={() => { if (validateRequired()) renderReport('html'); }}
              onReset={handleReset}
              loading={loading}
              resetKey={resetKey}
              token={token}
              selectedOrgId={selectedOrgId}
              roleOrgIds={roleOrgIds}
              errors={errors}
              setErrors={setErrors}
              data-testid="ReportSidebar__3c998a" />
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-muted">
          {/* Report iframe */}
          <div className="flex-1 overflow-hidden pt-4 pr-0 pb-0 pl-4">
            <div className="bg-card rounded-lg shadow-sm h-full overflow-hidden relative border border-border/30">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__3c998a" /><span>{ui('renderingReport')}</span>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/90 z-10 text-destructive text-sm px-8 text-center">{error}</div>
              )}
              {!loading && !error && !hasGenerated && (
                <div className="absolute inset-0 overflow-hidden">
                  {/* Skeleton table background */}
                  <div className="p-6 opacity-30 pointer-events-none select-none blur-[2px]">
                    <div className="h-4 w-48 bg-muted rounded mb-6" />
                    <div className="space-y-0">
                      <div className="grid grid-cols-6 gap-3 pb-2 border-b border-border-subtle mb-1">
                        {SKELETON_COLUMN_WIDTHS.map(col => (
                          <div key={col.id} className="h-3 bg-muted rounded" style={{ width: `${col.w}%` }} />
                        ))}
                      </div>
                      {SKELETON_ROWS.map(row => (
                        <div key={row.id} className="grid grid-cols-6 gap-3 py-2.5 border-b border-border-subtle">
                          {SKELETON_COLUMN_WIDTHS.map(col => (
                            <div key={col.id} className="h-3 rounded" style={{ width: `${col.w}%`, background: row.id % 2 === 0 ? 'hsl(var(--border-subtle))' : 'hsl(var(--muted))' }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Centered message */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-base font-semibold text-foreground mb-1">{ui('reportReadyTitle')}</p>
                      <p className="text-sm text-muted-foreground">{ui('reportReadyHint')}</p>
                    </div>
                  </div>
                </div>
              )}
              <iframe ref={iframeRef} title={ui('report')} className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      </div>
      </div>
      {/* end h-full flex flex-col */}
      <Dialog
        open={!!drillDownBp}
        onOpenChange={(o) => !o && setDrillDownBp(null)}
        data-testid="Dialog__3c998a">
        <DialogContent
          className="max-w-5xl w-[85vw] h-[70vh] flex flex-col gap-3 p-4"
          data-testid="DialogContent__3c998a">
          <DialogHeader className="shrink-0" data-testid="DialogHeader__3c998a">
            <DialogTitle data-testid="DialogTitle__3c998a">{drillDownBp?.name}{ui('detailsSuffix')}</DialogTitle>
          </DialogHeader>
          {drillDownBp && (
            <DrillDownViewer
              report={report}
              token={token}
              baseParams={params}
              bpId={drillDownBp.id}
              data-testid="DrillDownViewer__3c998a" />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!drillDownAccount}
        onOpenChange={(o) => !o && setDrillDownAccount(null)}
        data-testid="Dialog__3c998a">
        <DialogContent
          className="max-w-5xl w-[85vw] h-[70vh] flex flex-col gap-3 p-4"
          data-testid="DialogContent__3c998a">
          <DialogHeader className="shrink-0" data-testid="DialogHeader__3c998a">
            <DialogTitle data-testid="DialogTitle__3c998a">{drillDownAccount?.value} — {drillDownAccount?.name}</DialogTitle>
          </DialogHeader>
          {drillDownAccount && (
            <DrillDownViewer
              report={report}
              token={token}
              baseParams={params}
              targetReportId="report-general-ledger"
              extraParams={{
                fromAccountId: drillDownAccount.value,
                toAccountId: drillDownAccount.value,
                // Same "code - name" shape the account popup selector itself stores
                // (report-api.js's `account` selector SELECTs `value || ' - ' || name`
                // as its label) — without this, "Open in new tab" lands with the
                // right filter values but an empty-looking "Desde/A la cuenta" field.
                _display_fromAccountId: `${drillDownAccount.value} - ${drillDownAccount.name}`,
                _display_toAccountId: `${drillDownAccount.value} - ${drillDownAccount.name}`,
              }}
              data-testid="DrillDownViewer__3c998a" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const CATEGORY_LABELS = {
  purchases: { en: 'Purchases', es: 'Compras' },
  finance: { en: 'Finance', es: 'Finanzas' },
  sales: { en: 'Sales', es: 'Ventas' },
  inventory: { en: 'Inventory', es: 'Inventario' },
  other: { en: 'Other', es: 'Otros' },
};

function ReportList({ reports, loading, searchQuery, setSearchQuery, categoryFilter, selectReport, locale, localeLangKey }) {
  const tMenu = useMenuLabel();
  const ui = useUI();
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = categoryFilter ? `report-viewer?category=${categoryFilter}` : 'report-viewer';
  const favActive = isFavorite(favKey);

  const categoryBreadcrumb = categoryFilter && CATEGORY_LABELS[categoryFilter]
    ? tMenu(CATEGORY_LABELS[categoryFilter].en)
    : null;
  const breadcrumb = categoryBreadcrumb ? `${categoryBreadcrumb} / ${tMenu('Reports')}` : null;

  useSetPageMeta({
    title: tMenu('Reports'),
    breadcrumb,
    onAddToFavorites: () => toggleFavorite(favKey, 'Reports'),
    isFavorite: favActive,
  }, [favActive]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = reports.filter(r => {
    const matchesCategory = !categoryFilter || r.category === categoryFilter;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;
    const title = (r.title?.[locale] || r.title?.en_US || r.title?.es_ES || r.id || '').toLowerCase();
    return title.includes(normalizedQuery);
  });

  const grouped = {};
  for (const r of filtered) {
    const cat = r.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  }

  let reportListContent;
  if (loading) {
    reportListContent = (
      <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__3c998a" /> {ui('loading')}
      </div>
    );
  } else if (filtered.length === 0) {
    reportListContent = (
      <div className="text-center text-muted-foreground py-12">
        <FileText
          className="h-10 w-10 mx-auto mb-3 opacity-30"
          data-testid="FileText__3c998a" />
        <p>{ui('noResults')}</p>
      </div>
    );
  } else {
    reportListContent = (
      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, catReports]) => (
          <div key={cat}>
            {!categoryFilter && Object.keys(grouped).length > 1 && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat]?.[localeLangKey] || cat}
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {catReports.map(r => (
                <ReportCard
                  key={r.id}
                  report={r}
                  onRun={selectReport}
                  data-testid="ReportCard__3c998a" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
      {reportListContent}
    </div>
  );
}

export default function ReportViewerPage() {
  const { token, selectedRole, selectedOrg } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale } = useLocaleSwitch();
  const localeLangKey = locale === 'es_ES' ? 'es' : 'en';
  const categoryFilter = searchParams.get('category');
  const reportId = searchParams.get('report');

  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedReport = reportId ? reports.find(r => r.id === reportId) : null;

  const selectReport = (report) => {
    const params = new URLSearchParams(searchParams);
    params.set('report', report.id);
    setSearchParams(params);
  };

  const clearReport = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('report');
    setSearchParams(params);
  };

  if (selectedReport) {
    return (
      <ReportViewer
        report={selectedReport}
        onBack={clearReport}
        token={token}
        selectedOrgId={selectedOrg?.id || null}
        roleOrgIds={(selectedRole?.orgList || []).map(o => o.id).filter(Boolean)}
        categoryFilter={categoryFilter}
        data-testid="ReportViewer__3c998a" />
    );
  }

  return (
    <ReportList
      reports={reports}
      loading={loading}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      categoryFilter={categoryFilter}
      selectReport={selectReport}
      locale={locale}
      localeLangKey={localeLangKey}
      data-testid="ReportList__3c998a" />
  );
}
