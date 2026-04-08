import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Printer, FileDown, FileSpreadsheet, Eye, Loader2, X, ArrowLeft, ChevronDown, Search, MoreVertical, Plus, Bell, Sparkles, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import ProductSearchDrawer from '@/components/contract-ui/ProductSearchDrawer.jsx';
import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';
import { UserAvatarButton, UserContextSwitcher } from '@/components/UserContextSwitcher.jsx';

const FORMATS = [
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'pdf', label: 'PDF', icon: FileDown },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { id: 'csv', label: 'CSV', icon: FileText },
];

function ReportCard({ report, onRun }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const reportTitle = report.title?.[locale] || report.title?.en_US || report.title?.es_ES || report.id;
  return (
    <button
      onClick={() => onRun(report)}
      className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-white hover:border-primary/30 hover:shadow-md transition-all text-left w-full"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <FileText className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{reportTitle}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {report.type === 'grouped-listing' ? ui('Grouped Report') : ui('Listing Report')}
          {report.orientation === 'landscape' ? ` — ${ui('Landscape')}` : ''}
        </p>
        <div className="flex gap-1 mt-2">
          {(report.outputs || []).map(o => (
            <span key={o} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-medium">{o}</span>
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
    return fetch(`/api/report-selectors/${selector}?${params}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-96 max-h-[480px] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="text-sm font-semibold">{title}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-2 border-b border-border/20">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`${ui('Search')}...`}
            className="w-full h-8 px-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
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
            {loadingMore && <span className="text-xs text-muted-foreground">Loading more...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Dropdown / search-as-you-type selector.
// minLength=0 → shows all options on focus (used for small catalogs like org, accounting schema).
// minLength=2 (default) → search-as-you-type (used for accounts, etc.).
function SearchInput({ selector, value, displayValue, onChange, multi, minLength = 2, fullWidth = false, hasError = false, token, label, selectedOrgId, roleOrgIds, selectedWarehouseId, extraParams = {} }) {
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
    return `/api/report-selectors/${selector}?q=${encodeURIComponent(q)}${extra ? '&' + extra : ''}`;
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
    fetch(`/api/report-selectors/${selector}?${params.toString()}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
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
    if (selectedOrgId) productSelectorParams.set('selectedOrgId', selectedOrgId);
    if (roleOrgIds && roleOrgIds.length > 0) productSelectorParams.set('roleOrgIds', roleOrgIds.join(','));
    if (selectedWarehouseId) productSelectorParams.set('warehouseIds', selectedWarehouseId);
    const productSelectorUrl = productSelectorParams.toString()
      ? `/api/report-selectors/product?${productSelectorParams.toString()}`
      : '/api/report-selectors/product';

    const selectedItems = multi
      ? selected
      : ((value || displayValue) ? [{ id: value, name: displayValue }] : []);

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
        <div className="flex items-center h-8 border border-border rounded-md bg-white overflow-hidden focus-within:ring-1 focus-within:ring-primary/30">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex-1 h-full px-2 text-sm text-left focus:outline-none min-w-0"
            title={multi && selectedItems.length > 0 ? selectedItems.map(s => s.name).join(', ') : (displayText || '')}
          >
            <span className={`block truncate whitespace-nowrap ${selectedItems.length > 0 || displayText ? 'text-foreground' : 'text-muted-foreground'}`}>
              {multi
                ? (selectedItems.length > 0 ? `${selectedItems.length} selected` : `Search ${label || 'Product'}...`)
                : (displayText || `Search ${label || 'Product'}...`)}
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
              <X className="h-3.5 w-3.5" />
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
        />
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
          placeholder={`${ui('searchPlaceholder')}`}
          className={`h-8 px-2 text-sm rounded-md bg-white focus:outline-none focus:ring-1 w-full border ${hasError ? 'border-destructive ring-destructive/30' : 'border-border focus:ring-primary/30'} ${showDropdownArrow ? 'pr-7' : ''}`}
        />
        {showDropdownArrow && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(prev => !prev)}
            className="absolute right-1 top-1.5 h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center"
            aria-label={`Toggle ${label || 'selector'} options`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
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
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full max-h-48 overflow-auto rounded-lg border bg-white shadow-lg py-1">
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
function PopupMultiSelector({ selector, label, onChange }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [pending, setPending] = useState([]); // selection inside modal (not yet confirmed)
  const [confirmed, setConfirmed] = useState([]); // [{id, name}] committed to the report
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/report-selectors/${selector}?q=${encodeURIComponent(query)}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
        .then(r => r.json())
        .then(data => setOptions(Array.isArray(data) ? data : (data?.items ?? [])))
        .catch(() => setOptions([]));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, open, selector]);

  const openModal = () => {
    setPending([...confirmed]);
    setQuery('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

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
                +{hiddenCount} more
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
          className="h-8 px-3 text-xs font-medium rounded-md border border-border bg-white hover:bg-muted/50 flex items-center gap-1.5 text-muted-foreground"
        >
          <span className="text-sm font-bold leading-none">+</span>
          {confirmed.length === 0 ? label : ui('editSelection')}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[560px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h3 className="text-sm font-semibold">Select {label}</h3>
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
                options.map(o => {
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
              <span className="text-xs text-muted-foreground">{pending.length} selected</span>
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
    const url = `/api/report-selectors/${selector}?q=${encodeURIComponent(query)}${extra ? '&' + extra : ''}`;
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
        className={`w-full h-9 px-3 text-sm rounded-md border bg-white hover:bg-muted/50 flex items-center justify-between gap-2 ${hasError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border'}`}
      >
        <span className={`truncate ${displayValue ? 'text-foreground' : 'text-muted-foreground'}`}>
          {displayValue || `Select ${label}...`}
        </span>
        {displayValue && (
          <span onClick={clear} className="text-muted-foreground hover:text-destructive shrink-0 text-base leading-none">&times;</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[500px] flex flex-col">
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
                placeholder="Search..."
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
  { key: 'primary', label: 'reportScope' },
  { key: 'dimensions', label: 'refineDimensions' },
  { key: 'options', label: 'displayOptions' },
];

function ReportSidebar({ report, params, onChange, onSubmit, onReset, loading, resetKey, token, selectedOrgId, roleOrgIds }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [displayValues, setDisplayValues] = useState({});
  const [errors, setErrors] = useState({});
  const [popup, setPopup] = useState(null); // { name, selector, label } for popup-single

  useEffect(() => {
    setDisplayValues({});
    setErrors({});
  }, [resetKey]);

  const handleChange = (name, value) => {
    if (errors[name] && value) setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    onChange(name, value);
  };

  const handleSubmit = () => {
    const newErrors = {};
    for (const p of report.parameters || []) {
      if (p.required && !params[p.name]) newErrors[p.name] = true;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) onSubmit();
  };

  const grouped = {};
  for (const p of report.parameters || []) {
    if (p.hidden) continue;
    const sec = p.section || 'primary';
    if (!grouped[sec]) grouped[sec] = [];
    grouped[sec].push(p);
  }

  const renderParam = (p) => {
    const label = p.label?.[locale] || p.label?.en_US || p.name;
    const hasError = !!errors[p.name];
    const labelEl = (
      <label className="block text-xs font-medium text-foreground mb-1.5">
        {label}{p.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
    );
    const errorBorder = hasError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border';

    if (p.type === 'search') {
      // Multi-select popup (checkboxes)
      if (p.inputStyle === 'popup') {
        return (
          <div key={`${p.name}-${resetKey}`}>
            {labelEl}
            <PopupMultiSelector
              key={`${p.name}-${resetKey}`}
              selector={p.selector}
              label={label}
              onChange={(id, name) => { handleChange(p.name, id); handleChange('_display_' + p.name, name); }}
            />
          </div>
        );
      }

      // Single-select popup modal
      if (p.inputStyle === 'popup-single') {
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
                className={`flex-1 h-9 px-3 text-sm border rounded-md bg-white hover:bg-muted/50 text-left truncate text-muted-foreground ${errorBorder}`}
              >
                {display || <span className="opacity-50">{ui('selectPlaceholder')}</span>}
              </button>
              {display && (
                <button
                  type="button"
                  onClick={() => { handleChange(p.name, ''); handleChange('_display_' + p.name, ''); setDisplayValues(prev => ({ ...prev, [p.name]: '' })); }}
                  className="h-9 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                ><X className="h-3.5 w-3.5" /></button>
              )}
            </div>
            {hasError && <p className="text-[10px] text-destructive mt-1">Required</p>}
          </div>
        );
      }

      // Inline search dropdown (default)
      return (
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
          />
          {hasError && <p className="text-[10px] text-destructive mt-1">Required</p>}
        </div>
      );
    }

    if (p.type === 'select') {
      const resolvedOptions = p.options ?? (() => {
        const base = { value: '', label: report.groups?.[0]?.label?.en_US || 'Account' };
        const fromDimensions = (report.parameters || [])
          .filter(d => d.section === 'dimensions' && d.groupByValue)
          .map(d => ({ value: d.groupByValue, label: d.label?.en_US || d.name }));
        return [base, ...fromDimensions];
      })();
      return (
        <div key={p.name}>
          {labelEl}
          <select
            value={params[p.name] || ''}
            onChange={e => handleChange(p.name, e.target.value)}
            className={`w-full h-9 px-2 text-sm rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary/30 border ${errorBorder}`}
          >
            {resolvedOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }

    if (p.type === 'boolean') {
      return (
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
    }

    // date, number, text
    return (
      <div key={p.name}>
        {labelEl}
        <input
          type={p.type === 'date' ? 'date' : p.type === 'number' ? 'number' : 'text'}
          value={params[p.name] || ''}
          onChange={e => handleChange(p.name, e.target.value)}
          className={`w-full h-9 px-2 text-sm rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary/30 border ${errorBorder}`}
        />
        {hasError && <p className="text-[10px] text-destructive mt-1">Required</p>}
      </div>
    );
  };

  const renderSection = (sec, sectionParams) => {
    const dateParams = sectionParams.filter(p => p.type === 'date');
    const otherParams = sectionParams.filter(p => p.type !== 'date');
    return (
      <div className="space-y-3">
        {dateParams.length > 0 && (
          <div className={dateParams.length >= 2 ? 'grid grid-cols-2 gap-2' : ''}>
            {dateParams.map(renderParam)}
          </div>
        )}
        {otherParams.map(renderParam)}
      </div>
    );
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
        />
      )}

      <div className="px-4 pt-4 pb-3 border-b border-border/30 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{ui('reportBuilder')}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-6">
          {SIDEBAR_SECTIONS.map(({ key, label }) => {
            const sectionParams = grouped[key];
            if (!sectionParams?.length) return null;
            return (
              <div key={key}>
                <h4 className="text-xs font-semibold text-foreground mb-3">{ui(label)}</h4>
                {renderSection(key, sectionParams)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-5 pt-3 border-t border-border/30 space-y-2 shrink-0">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-10 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? ui('running') : ui('runReport')}
        </button>
        <button
          onClick={onReset}
          disabled={loading}
          className="w-full h-9 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
        >
          {ui('resetFilters')}
        </button>
      </div>
    </div>
  );
}

function DrillDownViewer({ report, token, baseParams, bpId, targetReportId, extraParams = {} }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        body: JSON.stringify({ format, params: drillParams }),
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
  }, [report.id, token, bpId]);

  useEffect(() => { fetchFormat('preview'); }, [fetchFormat]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex items-center gap-2 px-1">
        {[{ id: 'preview', label: 'Preview', icon: Eye }, { id: 'pdf', label: 'PDF', icon: FileDown }, { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet }].map(f => (
          <button key={f.id} onClick={() => fetchFormat(f.id)} disabled={loading}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50">
            <f.icon className="h-3.5 w-3.5" />{f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 bg-white rounded-lg border border-border/30 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /><span>Loading details...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm px-8 text-center">{error}</div>
        )}
        <iframe ref={iframeRef} title="Detail Report" className="w-full h-full border-0" />
      </div>
    </div>
  );
}

function ReportViewer({ report, onBack, token, selectedOrgId, roleOrgIds, categoryFilter }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recordCount, setRecordCount] = useState(null);
  const previewHtmlRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [drillDownBp, setDrillDownBp] = useState(null);
  const [drillDownAccount, setDrillDownAccount] = useState(null);
  const [invoicePopup, setInvoicePopup] = useState(null);
  const [showUserContext, setShowUserContext] = useState(false);
  const { locale } = useLocaleSwitch();
  const localeLangKey = locale === 'es_ES' ? 'es' : 'en';
  const tMenu = useMenuLabel();
  const ui = useUI();

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'aging-drilldown' && e.data.bpId) {
        setDrillDownBp({ id: e.data.bpId, name: e.data.bpName || '' });
      } else if (e.data?.type === 'trial-balance-drilldown' && e.data.accountId) {
        setDrillDownAccount({ id: e.data.accountId, name: e.data.accountName || '', value: e.data.accountValue || '' });
      } else if (e.data?.type === 'navigate-invoice' && e.data.invoiceId) {
        setInvoicePopup({ id: e.data.invoiceId });
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
      } else if (p.default !== undefined && p.default !== null && p.default !== false) {
        defaults[p.name] = String(p.default);
      } else {
        defaults[p.name] = '';
      }
    }
    return defaults;
  }, [report]);

  const [params, setParams] = useState(getDefaultParams);

  // Auto-load defaults for params marked with autoDefault: true.
  // Params with dependsOn are loaded in a second pass, after their dependency is resolved.
  useEffect(() => {
    const autoParams = (report.parameters || []).filter(p => p.autoDefault && p.selector);
    if (!autoParams.length) return;
    Promise.all(
      autoParams.map(p =>
        fetch(`/api/report-selectors/${p.selector}?q=`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('sf_auth_token') || ''}` } })
          .then(r => r.json())
          .then(rows => (rows[0] ? { name: p.name, id: rows[0].id, display: rows[0].name } : null))
          .catch(() => null)
      )
    ).then(results => {
      const updates = {};
      for (const r of results) {
        if (!r) continue;
        updates[r.name] = r.id;
        updates['_display_' + r.name] = r.display;
      }
      if (Object.keys(updates).length) setParams(prev => ({ ...prev, ...updates }));
    });
  }, [report]);

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
        body: JSON.stringify({ format, params }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Render failed: ${res.status}`);
      }
      if (format === 'html' || format === 'preview') {
        const html = await res.text();
        previewHtmlRef.current = html;
        const rowMatch = html.match(/(\d+) records/);
        if (rowMatch) setRecordCount(parseInt(rowMatch[1], 10));
        writeToIframe(html);
      } else if (format === 'pdf') {
        const blob = await res.blob();
        iframeRef.current.src = URL.createObjectURL(blob);
      } else {
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
  }, [report.id, token, params]);

  // No auto-render on mount — wait for user to click Run Report

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
  };

  const title = report.title?.[locale] || report.title?.en_US || report.title?.es_ES || report.id;
  const categoryLabel = categoryFilter && CATEGORY_LABELS[categoryFilter]
    ? tMenu(CATEGORY_LABELS[categoryFilter].en)
    : null;
  const breadcrumb = [categoryLabel, tMenu('Reports'), title].filter(Boolean).join(' / ');
  const DOWNLOAD_FORMATS = [
    { id: 'html', label: 'preview', icon: Eye },
    { id: 'pdf', label: 'PDF', icon: FileDown },
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
    { id: 'csv', label: 'CSV', icon: FileText },
  ];

  return (
    <>
      <div className="h-full flex flex-col">
        {/* ===== Main header ===== */}
        <div className="px-6 pt-3 pb-3 shrink-0">
          <div className="flex items-center gap-4">
            {/* Left: back + title + menu */}
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                <button onClick={onBack} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="text-xl font-bold text-foreground">{title}</h1>
                <button className="text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              {breadcrumb && (
                <p className="text-sm text-muted-foreground mt-0.5 pl-10">{breadcrumb}</p>
              )}
            </div>

            {/* Center: global search */}
            <div className="flex-1 flex justify-center">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={ui('searchPlaceholder')}
                  readOnly
                  tabIndex={-1}
                  className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none transition-colors cursor-default"
                />
                <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              </div>
            </div>

            {/* Right: action icons */}
            <div className="flex items-center gap-1 shrink-0">
              <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                <Sparkles className="h-4 w-4" />
              </button>
              <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                <Bell className="h-4 w-4" />
              </button>
              <LocaleSwitcher />
              <UserAvatarButton isOpen={showUserContext} onClick={() => setShowUserContext(v => !v)} />
              {showUserContext && <UserContextSwitcher onClose={() => setShowUserContext(false)} />}
            </div>
          </div>
        </div>

        {/* ===== Content: sidebar + right panel ===== */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar */}
          <div className="w-72 shrink-0 flex flex-col border-r border-border/30 bg-white overflow-hidden">
            <ReportSidebar
              report={report}
              params={params}
              onChange={(name, value) => setParams(prev => ({ ...prev, [name]: value }))}
              onSubmit={() => renderReport('html')}
              onReset={handleReset}
              loading={loading}
              resetKey={resetKey}
              token={token}
              selectedOrgId={selectedOrgId}
              roleOrgIds={roleOrgIds}
            />
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {/* Format actions bar */}
            <div className="flex items-center justify-between px-5 py-2 bg-white border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {recordCount != null && !loading && <span>{ui('recordsFound').replace('{count}', recordCount)}</span>}
              </div>
              <div className="flex items-center gap-1">
                {DOWNLOAD_FORMATS.map(fmt => {
                  const Icon = fmt.icon;
                  return (
                    <button key={fmt.id} onClick={() => renderReport(fmt.id)} disabled={loading}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border bg-white text-foreground hover:bg-muted/50 disabled:opacity-40">
                      <Icon className="h-3.5 w-3.5" />{ui(fmt.label)}
                    </button>
                  );
                })}
                <div className="w-px h-6 bg-border/50 mx-1" />
                <button onClick={handlePrint} disabled={loading}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Printer className="h-3.5 w-3.5" />{ui('print')}
                </button>
              </div>
            </div>

          {/* Report iframe */}
          <div className="flex-1 overflow-hidden p-4">
            <div className="bg-white rounded-lg shadow-sm h-full overflow-hidden relative border border-border/30">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span>Rendering report...</span>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10 text-destructive text-sm px-8 text-center">{error}</div>
              )}
              {!loading && !error && !previewHtmlRef.current && (
                <div className="absolute inset-0 overflow-hidden">
                  {/* Skeleton table background */}
                  <div className="p-6 opacity-30 pointer-events-none select-none blur-[2px]">
                    <div className="h-4 w-48 bg-slate-200 rounded mb-6" />
                    <div className="space-y-0">
                      <div className="grid grid-cols-6 gap-3 pb-2 border-b border-slate-200 mb-1">
                        {[40, 15, 15, 15, 15, 15].map((w, i) => (
                          <div key={i} className="h-3 bg-slate-300 rounded" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                      {Array.from({ length: 8 }).map((_, r) => (
                        <div key={r} className="grid grid-cols-6 gap-3 py-2.5 border-b border-slate-100">
                          {[40, 15, 15, 15, 15, 15].map((w, i) => (
                            <div key={i} className="h-3 rounded" style={{ width: `${w}%`, background: r % 2 === 0 ? '#e2e8f0' : '#edf2f7' }} />
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
              <iframe ref={iframeRef} title="Report" className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      </div>
      </div>
      {/* end h-full flex flex-col */}

      <Dialog open={!!drillDownBp} onOpenChange={(o) => !o && setDrillDownBp(null)}>
        <DialogContent className="max-w-5xl w-[85vw] h-[70vh] flex flex-col gap-3 p-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>{drillDownBp?.name} — Details</DialogTitle>
          </DialogHeader>
          {drillDownBp && (
            <DrillDownViewer
              report={report}
              token={token}
              baseParams={params}
              bpId={drillDownBp.id}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!drillDownAccount} onOpenChange={(o) => !o && setDrillDownAccount(null)}>
        <DialogContent className="max-w-5xl w-[85vw] h-[70vh] flex flex-col gap-3 p-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>{drillDownAccount?.value} — {drillDownAccount?.name}</DialogTitle>
          </DialogHeader>
          {drillDownAccount && (
            <DrillDownViewer
              report={report}
              token={token}
              baseParams={params}
              targetReportId="report-general-ledger"
              extraParams={{ fromAccountId: drillDownAccount.value, toAccountId: drillDownAccount.value }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoicePopup} onOpenChange={(o) => !o && setInvoicePopup(null)}>
        <DialogContent className="max-w-5xl w-[85vw] h-[80vh] p-0 overflow-hidden">
          {invoicePopup && (
            <iframe
              src={`${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/purchase-invoice/${invoicePopup.id}?embedded=1`}
              title="Invoice"
              className="w-full h-full border-0"
            />
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

export default function ReportViewerPage() {
  const { token, selectedRole, selectedOrg } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserContext, setShowUserContext] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const tMenu = useMenuLabel();
  const ui = useUI();
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
      />
    );
  }

  // Group reports by category, optionally filtering
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

  const categoryTitle = categoryFilter && CATEGORY_LABELS[categoryFilter]
    ? CATEGORY_LABELS[categoryFilter].es
    : null;

  const categoryBreadcrumb = categoryFilter && CATEGORY_LABELS[categoryFilter]
    ? tMenu(CATEGORY_LABELS[categoryFilter].en)
    : null;
  const breadcrumb = categoryBreadcrumb ? `${categoryBreadcrumb} / ${tMenu('Reports')}` : null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-3 pb-3">
        <div className="flex items-center gap-4">
          {/* Left: title + menu */}
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{tMenu('Reports')}</h1>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
            {breadcrumb && (
              <p className="text-sm text-muted-foreground mt-0.5">{breadcrumb}</p>
            )}
          </div>

          {/* Center: global search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={ui('searchPlaceholder')}
                className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
              />
              <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1 shrink-0">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <LocaleSwitcher />
            <UserAvatarButton isOpen={showUserContext} onClick={() => setShowUserContext(v => !v)} />
            {showUserContext && <UserContextSwitcher onClose={() => setShowUserContext(false)} />}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading reports...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No reports found</p>
            <p className="text-xs mt-1">No reports configured yet</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            {Object.entries(grouped).map(([cat, catReports]) => (
              <div key={cat}>
                {!categoryFilter && Object.keys(grouped).length > 1 && (
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {CATEGORY_LABELS[cat]?.[localeLangKey] || cat}
                  </h2>
                )}
                <div className="grid gap-3">
                  {catReports.map(r => (
                    <ReportCard key={r.id} report={r} onRun={selectReport} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
