import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Inbox, X, ChevronDown, Check } from 'lucide-react';
import { FieldHighlight } from '@/components/inspector/FieldHighlight.jsx';
import { useLabel, useUI, useLocale } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { getStatusBadgeProps, getStatusDotColor, statusLabel } from '@/lib/statusBadge.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { formatAmount } from '@/lib/formatAmount.js';
import ProductSearchDrawer from './ProductSearchDrawer.jsx';

/**
 * Compact inline combobox for search-type FK fields in rapid line entry.
 * Text input with filtered dropdown — lightweight alternative to full SearchInput.
 */
function InlineSearchCombo({ field, value, options, onChange, onKeyDown, placeholder, inputRef, selectorUrl, selectorContext, token }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [serverResults, setServerResults] = useState(null);
  const displayValue = options.find(o => o.id === value);

  // Server-side search with debounce
  const fetchTimer = useRef(null);
  const fetchServerResults = useCallback((q) => {
    if (!selectorUrl || !token || !q.trim()) { setServerResults(null); return; }
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => {
      fetch(buildUrlWithParams(selectorUrl, { ...selectorContext, q: q.trim() }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.items) setServerResults(data.items.map(it => ({ id: it.id, name: it.label || it.name, ...it })));
        })
        .catch(() => {});
    }, 300);
  }, [selectorUrl, selectorContext, token]);

  const filtered = useMemo(() => {
    if (serverResults) return serverResults.slice(0, 20);
    if (!query) return options.slice(0, 15);
    const q = query.toLowerCase();
    return options.filter(o => {
      const name = o.name || o.label || o._identifier || '';
      return name.toLowerCase().includes(q);
    }).slice(0, 15);
  }, [query, options, serverResults]);

  const handleSelect = (opt) => {
    setQuery(opt.name || opt.label || opt._identifier || '');
    onChange(opt.id, opt.name || opt.label || opt._identifier || '', opt);
    setOpen(false);
    setServerResults(null);
  };

  // Sync display when value is set externally
  useEffect(() => {
    if (displayValue && !query) {
      setQuery(displayValue.name || displayValue.label || displayValue._identifier || '');
    }
  }, [value]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setServerResults(null);
          fetchServerResults(e.target.value);
          // Clear ID when typing (user is searching, not committed yet)
          if (value) onChange('', '');
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          // Let Enter/Escape propagate to the row handler only if dropdown is closed
          if (e.key === 'Enter' && open && filtered.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            handleSelect(filtered[0]);
            return;
          }
          onKeyDown?.(e);
        }}
        placeholder={placeholder}
        className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 pr-6 focus:ring-2 focus:ring-primary focus:outline-none"
      />
      <ChevronDown className="absolute right-1.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 bottom-full left-0 mb-0.5 bg-white border rounded-md shadow-lg max-h-40 overflow-auto min-w-[200px] w-max">
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 cursor-pointer whitespace-nowrap"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
            >
              {opt.name || opt.label || opt._identifier || opt.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Return a colored dot class based on whether a date is past, future, or today.
 * Green = future (not yet due), Red = past (overdue), null = today or empty.
 */
function getDateDotColor(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateValue);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return null;
  return d > today ? 'bg-emerald-500' : 'bg-red-500';
}

/**
 * Loading skeleton that mimics a table layout.
 */
function TableSkeleton({ columns }) {
  return (
    <div className="space-y-2">
      {/* Header skeleton */}
      <div className="flex gap-3 px-2">
        {columns.map(col => (
          <Skeleton key={col.key} className="h-4 flex-1" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-2">
          {columns.map(col => (
            <Skeleton key={col.key} className="h-8 flex-1" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state shown when the table has no data (or all rows are filtered out).
 */
function EmptyState({ hasFilter, totalCount }) {
  const ui = useUI();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Inbox className="h-10 w-10 mb-3 opacity-40" />
      {hasFilter ? (
        <>
          <p className="text-sm font-medium">{ui('noMatchingRecords')}</p>
          <p className="text-xs mt-1">{ui('adjustFilters')}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{ui('noRecordsYet')}</p>
          <p className="text-xs mt-1">{ui('createNewRecord')}</p>
        </>
      )}
    </div>
  );
}

/**
 * Inline editable row rendered at the bottom of the table for rapid line entry.
 * Controlled by the `addRow` prop on DataTable.
 */
function InlineAddRow({ columns, fields, onAdd, onCancel, data, catalogs, onFieldChange, selectable, token, apiBaseUrl, entity, selectorContext }) {
  const t = useLabel();
  const ui = useUI();
  const fieldMap = useMemo(() => {
    const map = {};
    for (const f of fields) map[f.key] = f;
    return map;
  }, [fields]);

  // Auto-compute lineNo default
  const defaultLineNo = useMemo(() => {
    const nums = (data || []).map(r => Number(r.lineNo) || 0);
    return (nums.length > 0 ? Math.max(...nums) : 0) + 10;
  }, [data]);

  const buildEmpty = useCallback(() => {
    const empty = {};
    for (const f of fields) {
      empty[f.key] = f.key === 'lineNo' ? defaultLineNo : '';
    }
    return empty;
  }, [fields, defaultLineNo]);

  const [values, setValues] = useState(buildEmpty);
  const firstInputRef = useRef(null);

  // Reset values when fields or data change
  useEffect(() => {
    setValues(buildEmpty());
  }, [buildEmpty]);

  // Auto-focus first input when row appears
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleChange = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const handleConfirm = async () => {
    const result = await onAdd(values);
    if (result === false || result == null) {
      return;
    }
    // Reset for next rapid entry — recompute lineNo
    const nums = [...(data || []).map(r => Number(r.lineNo) || 0), Number(values.lineNo) || 0];
    const nextLineNo = Math.max(...nums) + 10;
    const next = {};
    for (const f of fields) {
      next[f.key] = f.key === 'lineNo' ? nextLineNo : '';
    }
    // Clear any $_identifier companion values
    for (const key of Object.keys(values)) {
      if (key.includes('$_identifier') && !(key in next)) {
        next[key] = '';
      }
    }
    setValues(next);
    // Re-focus first input for rapid entry
    setTimeout(() => firstInputRef.current?.focus(), 0);
  };

  // Wrap handleChange to also notify parent (for callout triggering)
  const handleFieldChange = useCallback((key, val, selectedItem) => {
    // Build a snapshot of current + new values for the callout formState
    const snapshot = { ...values, [key]: val };
    handleChange(key, val);
    // Store _aux data from selector items as auxiliaryValues (e.g., product_UOM, product_PSTD)
    if (selectedItem?._aux) {
      for (const [suffix, auxVal] of Object.entries(selectedItem._aux)) {
        snapshot[key + suffix] = auxVal;
        handleChange(key + suffix, auxVal);
      }
    }
    // Also fire top-level display fields from selectedItem (mirrors EntityForm behavior).
    // Skips structural/object fields; fires e.g. product_uOM = "Unit" for identifier resolution.
    if (selectedItem && typeof selectedItem === 'object') {
      for (const [topField, topVal] of Object.entries(selectedItem)) {
        if (topField === 'id' || topField === '_aux' || topField === 'label'
            || topField === 'name' || topField === 'searchKey'
            || typeof topVal === 'object' || topVal === null) continue;
        const ctxKey = `${key}_${topField}`;
        if (!(ctxKey in snapshot)) {
          snapshot[ctxKey] = topVal;
          handleChange(ctxKey, topVal);
        }
      }
    }
    // Notify parent for callout execution — pass computed snapshot (not stale React state)
    onFieldChange?.(key, val, snapshot, (updates) => {
      // Callback to apply callout results to the inline row
      for (const [field, value] of Object.entries(updates)) {
        handleChange(field, value);
      }
    });
  }, [handleChange, onFieldChange, values]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  let firstInputAssigned = false;

  return (
    <TableRow className="bg-blue-50/50 border-t-2 border-primary/20">
      {/* Accept / Cancel buttons */}
      {selectable && (
        <TableCell className="w-10 px-1">
          <div className="flex gap-0.5">
            <button type="button" onClick={() => { void handleConfirm(); }} title="Add (Enter)"
              className="h-7 w-7 flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onCancel} title={ui('cancelEsc')}
              className="h-7 w-7 flex items-center justify-center rounded text-red-500 hover:bg-red-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </TableCell>
      )}
      {columns.map(col => {
        const field = fieldMap[col.key];
        if (!field) {
          // Show callout-derived values if available, otherwise dash.
          // Prefer $_identifier (human-readable) over raw ID for FK fields.
          const rawVal = values[col.key];
          const identVal = values[col.key + '$_identifier'];
          const displayVal = identVal || rawVal;
          return (
            <TableCell key={col.key} className="text-muted-foreground text-sm">
              {displayVal != null && displayVal !== '' ? displayVal : '\u2014'}
            </TableCell>
          );
        }
        const isFirst = !firstInputAssigned;
        if (isFirst) firstInputAssigned = true;

        // Lookup fields: click to open search modal (no inline combo)
        if (field.type === 'search' && field.lookup) {
          const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${field.column}` : null;
          const displayLabel = values[field.key + '$_identifier'] || '';
          return (
            <TableCell key={col.key} className="py-1 px-2">
              <LookupField
                value={displayLabel}
                placeholder={t(field.column) ?? field.label ?? field.key}
                selectorUrl={selectorUrl}
                token={token}
                inputRef={isFirst ? firstInputRef : undefined}
                onSelect={(item) => {
                  handleChange(field.key + '$_identifier', item.label || item.name || item._identifier);
                  handleFieldChange(field.key, item.id, item);
                }}
                onKeyDown={handleKeyDown}
                title={t(field.column) ?? field.label ?? field.key}
              />
            </TableCell>
          );
        }

        // Search fields render as compact combobox (text input + filtered dropdown)
        if (field.type === 'search') {
          const options = getCatalogOptions(catalogs, entity, field);
          const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${field.column}` : null;
          return (
            <TableCell key={col.key} className="py-1 px-2">
              <InlineSearchCombo
                field={field}
                value={values[field.key] ?? ''}
                options={options}
                inputRef={isFirst ? firstInputRef : undefined}
                placeholder={t(field.column) ?? field.label ?? field.key}
                onChange={(id, label, selectedItem) => {
                  handleChange(field.key + '$_identifier', label);
                  handleFieldChange(field.key, id, selectedItem);
                }}
                onKeyDown={handleKeyDown}
                selectorUrl={selectorUrl}
                selectorContext={selectorContext}
                token={token}
              />
            </TableCell>
          );
        }

        // Select fields with inline static options array
        if (field.type === 'select' && field.options?.length) {
          return (
            <TableCell key={col.key} className="py-1 px-2">
              <select
                ref={isFirst ? firstInputRef : undefined}
                value={values[field.key] ?? ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="" disabled hidden>{field.label ?? field.key}</option>
                {field.options.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </TableCell>
          );
        }

        // Selector fields render as native <select> dropdowns (few options)
        if (field.type === 'selector') {
          const options = getCatalogOptions(catalogs, entity, field);
          if (options.length === 0) {
            return <TableCell key={col.key} className="py-1 px-2" />;
          }
          return (
            <TableCell key={col.key} className="py-1 px-2">
              <select
                ref={isFirst ? firstInputRef : undefined}
                value={values[field.key] ?? ''}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const opt = options.find(o => o.id === selectedId);
                  if (opt) {
                    handleChange(field.key + '$_identifier', opt.name || opt.label || opt._identifier || '');
                  }
                  handleFieldChange(field.key, selectedId, opt);
                }}
                onKeyDown={handleKeyDown}
                className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="" disabled hidden>{t(field.column) ?? field.label ?? field.key}</option>
                {options.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.name || opt.label || opt._identifier || opt.id}</option>
                ))}
              </select>
            </TableCell>
          );
        }

        return (
          <TableCell key={col.key} className="py-1 px-2">
            <input
              ref={isFirst ? firstInputRef : undefined}
              type={field.type === 'number' ? 'number' : 'text'}
              inputMode={field.inputMode}
              value={values[field.key] ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t(field.column) ?? field.label ?? field.key}
              required={field.required}
              className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/**
 * Inline field that shows selected value and opens modal on click/focus.
 */
function LookupField({ value, placeholder, selectorUrl, token, onSelect, onKeyDown, inputRef, title }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  // Forward ref so parent can focus this field
  useEffect(() => {
    if (inputRef) inputRef.current = btnRef.current;
  }, [inputRef]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
          else if (onKeyDown) onKeyDown(e);
        }}
        className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 text-left flex items-center gap-2 hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {value ? (
          <span className="truncate text-foreground">{value}</span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onSelect(item); setOpen(false); }}
        selectorUrl={selectorUrl}
        token={token}
        title={title ? `Search ${title}` : undefined}
      />
    </>
  );
}

/**
 * Small button that opens the ProductSearchDrawer for lookup-enabled fields.
 */
function LookupButton({ selectorUrl, token, onSelect, title }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 w-8 flex items-center justify-center rounded border border-input hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={`Search ${title || ''}`}
      >
        <Search className="h-3.5 w-3.5" />
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onSelect(item); setOpen(false); }}
        selectorUrl={selectorUrl}
        token={token}
        title={title ? `Search ${title}` : undefined}
      />
    </>
  );
}

/**
 * Generic data table driven by column/filter declarations.
 *
 * Props:
 *  - columns: Array<{ key, label, type }>  (type can be 'string' | 'amount' | 'status')
 *  - filters: string[] of column keys that are searchable
 *  - data: array of row objects
 *  - onRowSelect: (row) => void
 *  - onNavigate: (row) => void — when provided, clicking a row calls onNavigate instead of onRowSelect
 *  - selectedId: string | number
 *  - compact: boolean (reserved for narrower layout)
 *  - loading: boolean (shows skeleton when true)
 *  - addRow: { active, fields, onAdd, onCancel, catalogs, onFieldChange } — inline add row config
 */
export function DataTable({ entity, columns = [], filters = [], data = [], onRowSelect, onNavigate, onRowClick, selectedRowId, selectedId, compact, loading, addRow, selectable = true, isRowSelectable, onSelectionChange, sortColumn, sortDirection, onColumnsReady, token, apiBaseUrl, showFooterTotals = true, selectorContext }) {
  const t = useLabel();
  const ui = useUI();
  const dictionary = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Report columns to parent (e.g., ListView sort popover)
  useEffect(() => {
    if (onColumnsReady && columns.length > 0) {
      onColumnsReady(columns);
    }
  }, [columns, onColumnsReady]);

  const hasColumnFilter = useMemo(() => Object.values(columnFilters).some(v => v), [columnFilters]);
  const hasActiveFilter = searchQuery.length > 0 || hasColumnFilter;

  const filteredData = useMemo(() => {
    let result = data;
    // Global search (existing behaviour)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row =>
        filters.some(key => {
          const val = resolveIdentifier(row, key);
          return String(val ?? '').toLowerCase().includes(q);
        })
      );
    }
    // Per-column filters (AND logic)
    for (const [key, query] of Object.entries(columnFilters)) {
      if (!query) continue;
      const q = query.toLowerCase();
      result = result.filter(row => {
        const val = resolveIdentifier(row, key);
        return String(val ?? '').toLowerCase().includes(q);
      });
    }
    return result;
  }, [data, filters, searchQuery, columnFilters]);

  const amountColumns = useMemo(
    () => columns.filter(col => col.type === 'amount'),
    [columns]
  );

  const totals = useMemo(() => {
    if (amountColumns.length === 0) return null;
    const sums = {};
    for (const col of amountColumns) {
      sums[col.key] = filteredData.reduce((sum, row) => sum + (Number(row[col.key]) || 0), 0);
    }
    return sums;
  }, [filteredData, amountColumns]);

  const renderCellValue = (row, col) => {
    // Custom render function takes priority
    if (typeof col.render === 'function') return col.render(row);
    const display = resolveIdentifier(row, col.key);
    // Link styling on first string column
    if (col === columns[0] && col.type === 'string') {
      const pill = col.pill;
      const pillLabel = pill && pill.when(row) ? pill.label : null;
      return (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-blue-600">{display}</span>
          {pillLabel && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${pill.className || 'bg-gray-50 text-gray-600 border-gray-200'}`} style={{ borderWidth: '0.5px' }}>
              {pillLabel}
            </span>
          )}
        </span>
      );
    }
    if (col.type === 'enum') {
      const raw = row[col.key];
      const label = col.enumLabels?.[raw] ?? raw;
      if (col.display === 'dot') {
        const dotColor = getStatusDotColor(raw);
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
            {label}
          </span>
        );
      }
      const badgeProps = getStatusBadgeProps(raw);
      return <Badge {...badgeProps}>{label}</Badge>;
    }
    if (col.type === 'status') {
      const raw = row[col.key];
      const label = col.enumLabels?.[raw] ?? statusLabel(raw, dictionary);
      if (col.display === 'dot') {
        const dotColor = getStatusDotColor(raw);
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
            {label}
          </span>
        );
      }
      const badgeProps = getStatusBadgeProps(raw);
      if (badgeProps.variant === 'outline' && !badgeProps.className) {
        return <span className="text-sm text-muted-foreground">{label}</span>;
      }
      return <Badge {...badgeProps}>{label}</Badge>;
    }
    if (col.type === 'percent') {
      const val = Number(row[col.key]);
      const pct = isNaN(val) ? 0 : val;
      const color = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200';
      const textColor = pct >= 100 ? 'text-emerald-700' : pct > 0 ? 'text-amber-700' : 'text-slate-400';
      return (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className={`text-xs tabular-nums ${textColor}`}>{pct}%</span>
        </div>
      );
    }
    if (col.type === 'boolean') {
      const val = row[col.key];
      if (col.badge) {
        const trueLabel  = col.badgeLabels?.true  ?? ui('statusComplete');
        const falseLabel = col.badgeLabels?.false ?? ui('statusInProcess');
        if (val === true || val === 'Y') return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            {trueLabel}
          </span>
        );
        if (val === false || val === 'N') return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {falseLabel}
          </span>
        );
      }
      if (val === true || val === 'Y') return <span className="text-emerald-600">{ui('yes')}</span>;
      if (val === false || val === 'N') return <span className="text-slate-400">{ui('no')}</span>;
      return <span className="text-slate-300">&mdash;</span>;
    }
    if (col.type === 'date') {
      const dotColor = getDateDotColor(row[col.key]);
      const raw = row[col.key];
      // Parse date-only strings (yyyy-MM-dd) as local to avoid timezone shift
      const parsed = raw ? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00') : new Date(raw)) : null;
      const formatted = parsed && !isNaN(parsed) ? parsed.toLocaleDateString() : '\u2014';
      return (
        <span className="inline-flex items-center gap-1.5">
          {formatted}
          {dotColor && <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />}
        </span>
      );
    }
    if (col.type === 'amount') {
      return <span className="tabular-nums">{formatAmount(row[col.key], row['currency$_identifier'])}</span>;
    }
    // Truncate long display values
    const val = display;
    if (typeof val === 'string' && val.length > 30) {
      return <span className="block max-w-[200px] truncate" title={val}>{val}</span>;
    }
    return val;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton columns={columns.length > 0 ? columns : [{ key: '_1' }, { key: '_2' }, { key: '_3' }]} />
      </div>
    );
  }

  const allSelected = filteredData.length > 0 && selectedRows.size === filteredData.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const selectableData = isRowSelectable ? filteredData.filter(isRowSelectable) : filteredData;

  const toggleAll = (e) => {
    e.stopPropagation();
    if (allSelected) {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    } else {
      const allIds = new Set(selectableData.map(r => r.id));
      setSelectedRows(allIds);
      onSelectionChange?.(selectableData);
    }
  };

  const toggleRow = (e, row) => {
    e.stopPropagation();
    if (isRowSelectable && !isRowSelectable(row)) return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      onSelectionChange?.(filteredData.filter(r => next.has(r.id)));
      return next;
    });
  };

  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className="space-y-0">
      <div className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/40 bg-muted/30">
              {selectable && (
                <TableHead className="w-10 px-3 align-top" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    />
                    {hasColumnFilter && (
                      <button
                        onClick={() => setColumnFilters({})}
                        title={ui('clearAllFilters')}
                        className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </TableHead>
              )}
              {columns.map(col => {
                const colLabel = t(col.column) ?? col.label ?? col.key;
                const isSorted = sortColumn === col.key;
                const isRight = col.type === 'amount';
                return (
                  <TableHead key={col.key} className={`align-top ${isRight ? 'text-right' : ''}`}>
                    <div className={`flex flex-col gap-1.5 pb-2 ${isRight ? 'items-end' : ''}`}>
                      <span className="text-xs font-medium text-muted-foreground/70 tracking-wide">
                        <FieldHighlight entityName={entity} fieldName={col.key}>
                          {colLabel}
                          {isSorted && (
                            <span className="ml-1 text-primary/70">{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
                          )}
                        </FieldHighlight>
                      </span>
                      <div className="relative w-full">
                        <input
                          type="text"
                          value={columnFilters[col.key] || ''}
                          onChange={e => setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                          placeholder={ui('filter')}
                          className={[
                            'w-full h-6 rounded border bg-background/80 px-2 text-xs text-foreground',
                            'placeholder:text-muted-foreground/35 transition-colors',
                            'focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40',
                            columnFilters[col.key]
                              ? 'border-primary/40 bg-primary/5 pr-6'
                              : 'border-border/35',
                            isRight ? 'text-right' : '',
                          ].filter(Boolean).join(' ')}
                        />
                        {columnFilters[col.key] && (
                          <button
                            onClick={() => setColumnFilters(prev => ({ ...prev, [col.key]: '' }))}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 && !addRow?.active ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="p-0">
                  <EmptyState hasFilter={hasActiveFilter} totalCount={data.length} />
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row, idx) => {
                const isChecked = selectedRows.has(row.id);
                const isSelectedLine = row.id === selectedRowId;
                return (
                  <TableRow
                    key={row.id ?? idx}
                    data-testid={`row-${row.id ?? idx}`}
                    onClick={() => {
                      if (onRowClick) onRowClick(row);
                      else if (onNavigate) onNavigate(row);
                      else onRowSelect?.(row);
                    }}
                    className={[
                      'transition-colors h-12',
                      (onRowClick || onNavigate) ? 'cursor-pointer' : 'cursor-default',
                      isChecked ? 'bg-primary/5' : '',
                      row.id === selectedId ? 'bg-primary/10' : '',
                      isSelectedLine ? 'bg-zinc-700 text-white' : '',
                      isSelectedLine ? 'hover:bg-zinc-600' : (onRowClick || onNavigate) ? 'hover:bg-muted/50' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {selectable && (() => {
                      const rowDisabled = isRowSelectable && !isRowSelectable(row);
                      return (
                        <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={rowDisabled}
                            onChange={(e) => toggleRow(e, row)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                            style={rowDisabled ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
                          />
                        </TableCell>
                      );
                    })()}
                    {columns.map(col => (
                      <TableCell key={col.key} className={col.type === 'amount' ? 'text-right' : ''}>
                        {renderCellValue(row, col)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
            {addRow?.active && (
              <InlineAddRow
                columns={columns}
                fields={addRow.fields}
                onAdd={addRow.onAdd}
                onCancel={addRow.onCancel}
                data={data}
                catalogs={addRow.catalogs}
                onFieldChange={addRow.onFieldChange}
                  selectable={selectable}
                  token={token}
                  apiBaseUrl={apiBaseUrl}
                  entity={entity}
                  selectorContext={selectorContext}
                />
              )}
          </TableBody>
          {totals && showFooterTotals && (
            <TableFooter>
              <TableRow className="font-medium">
                {selectable && <TableCell />}
                {columns.map((col, idx) => (
                  <TableCell key={col.key} className={col.type === 'amount' ? 'tabular-nums text-right font-semibold' : ''}>
                    {col.type === 'amount'
                      ? formatAmount(totals[col.key], filteredData[0]?.['currency$_identifier'])
                      : ''}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {addRow?.active && (
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Enter to add &middot; Esc to cancel
        </p>
      )}
    </div>
  );
}
