import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useLabel, useLocaleSwitch } from '@/i18n';
import { FieldHighlight } from '@/components/inspector/FieldHighlight.jsx';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { ImageField } from './ImageField.jsx';
import ProductSearchDrawer from './ProductSearchDrawer.jsx';

/**
 * Button that opens the ProductSearchDrawer popup for fields with popup: true.
 */
function PopupSearchInput({ field, value, displayValue, onChange, label, selectorUrl, token }) {
  const [open, setOpen] = useState(false);
  const displayText = displayValue || (value ? value : '');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`field-${field.key}`}
        className="w-full h-10 text-sm rounded-md border border-input bg-background px-3 text-left flex items-center gap-2 hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors"
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        {displayText ? (
          <span className="truncate text-foreground">{displayText}</span>
        ) : (
          <span className="truncate text-muted-foreground">Search {label}...</span>
        )}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onChange(item.id, item.label || item.name); setOpen(false); }}
        selectorUrl={selectorUrl}
        token={token}
        title={label}
      />
    </>
  );
}

/**
 * Dropdown selector for FK fields with many options (inputMode: search).
 * Supports both static catalog data (mock) and server-side filtering via API.
 */
function SearchInput({ entityName, field, value, displayValue, onChange, catalogs, resolvedLabel, selectorUrl, selectorContext, token }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(displayValue || value || '');
  const [serverResults, setServerResults] = useState(null);
  const [fetching, setFetching] = useState(false);
  // Tracks whether the user is actively typing so the sync effect doesn't fight keystrokes.
  const isEditingRef = useRef(false);
  const debounceRef = useRef(null);

  React.useEffect(() => {
    // Only sync from outside when the user is NOT actively editing.
    // This prevents the parent state update (triggered by onChange while typing)
    // from immediately reverting the input text.
    if (!isEditingRef.current) {
      setQuery(displayValue || value || '');
    }
  }, [value, displayValue]);

  // When a selectorUrl is configured, always use server search — ignore local catalog.
  // Mock catalog data is only a fallback for when no server is available (e.g. mock mode).
  const catalogOptions = selectorUrl ? null : catalogs?.[field.reference];

  // If we have an initial value but no label yet (and no catalog), try to fetch the single record
  React.useEffect(() => {
    if (!value || displayValue || isEditingRef.current) return;
    // Try local catalog
    const localOptions = getCatalogOptions(catalogs, entityName, field);
    const local = localOptions.find(opt => opt.id === value);
    if (local) { setQuery(local.name || value); return; }
    // Try server selector with ?id=
    if (!selectorUrl || !token) return;
    fetch(buildUrlWithParams(selectorUrl, { ...selectorContext, id: value }), {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const match = (data?.items || []).find(i => i.id === value);
        if (match) {
          setQuery(match.label || match.name || value);
          // Don't auto-select here, just set display text to avoid loop
        }
      })
      .catch(() => { });
  }, [value, displayValue, selectorUrl, selectorContext, token, catalogs, entityName, field]);

  // Server-side search triggered on typing or on focus (empty query = load initial options).
  const triggerServerSearch = (searchQuery) => {
    if (catalogOptions || !selectorUrl || !token) return;

    // Build params: include q only when the user has typed enough to filter
    const params = { ...selectorContext };
    if (searchQuery && searchQuery.length >= 2) params.q = searchQuery.trim();

    setFetching(true);
    fetch(buildUrlWithParams(selectorUrl, params), {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setServerResults((data.items || []).map(item => ({
            id: item.id,
            name: item.label || item.name || item.id,
            ...item
          })));
        }
      })
      .catch(() => { })
      .finally(() => setFetching(false));
  };

  // Local fallback: filter the pre-loaded catalog (used when selectorUrl not available)
  const localOptions = getCatalogOptions(catalogs, entityName, field);
  const filtered = useMemo(() => {
    // Server results take priority when available
    if (serverResults !== null) return serverResults.slice(0, 20);
    // When a real API selector is configured, don't show mock locals — wait for user to type
    if (selectorUrl) return [];
    if (!query || query.length === 0) return localOptions.slice(0, 10);
    const q = query.toLowerCase();
    return localOptions.filter(opt => opt.name.toLowerCase().includes(q)).slice(0, 10);
  }, [serverResults, query, localOptions, selectorUrl]);

  const handleSelect = (opt) => {
    isEditingRef.current = false; // Finished editing
    setQuery(opt.name);
    setOpen(false);
    
    // Pass full record as 3rd arg so auxiliary fields (like M_PriceList_ID) can be mapped
    // by the parent Form (if the schema defines mapped column suffixes).
    onChange(opt.id, opt.name, opt);
  };

  const handleClear = () => {
    isEditingRef.current = false;
    setQuery('');
    setServerResults(null);
    setOpen(false);
    onChange('', '');
  };

  // If field is mandatory but value is empty, or if we have a value, don't show clear unless value exists
  const hasSelection = value != null && value !== '';

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={field.key}
          name={field.key}
          data-testid={`field-${field.key}`}
          type="text"
          placeholder={`Search ${resolvedLabel}...`}
          value={query}
          onChange={(e) => {
            isEditingRef.current = true;
            const newQuery = e.target.value;
            setQuery(newQuery);
            if (!open) setOpen(true);
            
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              triggerServerSearch(newQuery);
            }, 300);
          }}
          onFocus={() => {
            setOpen(true);
            // Always load options on focus when none are cached yet (covers empty/cleared field)
            if (!catalogOptions && !serverResults) {
              triggerServerSearch(query);
            }
          }}
          onBlur={() => {
            // Delay closing so click events on dropdown items can fire first
            isEditingRef.current = false;
            setTimeout(() => setOpen(false), 200);
          }}
          className="pl-8 pr-8 focus:ring-2 focus:ring-primary focus:outline-none"
          required={field.required}
          autoComplete="off"
        />
        {hasSelection && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
            className="absolute right-2 top-2 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            tabIndex={-1}
            aria-label="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              data-testid={`option-${opt.id}`}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
              onMouseDown={() => handleSelect(opt)}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
      {open && query.length > 0 && fetching && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg">
          <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
        </div>
      )}
      {open && query.length > 0 && !fetching && filtered.length === 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No results for "{query}"
          </div>
        </div>
      )}
    </div>
  );
}

const SELECTOR_PAGE = 50;

/**
 * Dropdown selector for FK fields with few options (inputMode: selector).
 * Fetches options from the server with lazy pagination triggered by scrolling.
 * Falls back to catalog when no selectorUrl is provided.
 */
function SelectorInput({ entityName, field, value, displayValue, onChange, catalogs, resolvedLabel, selectorUrl, token }) {
  const catalogOptions = getCatalogOptions(catalogs, entityName, field);
  const [serverOptions, setServerOptions] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const offsetRef = useRef(0);

  const fetchPage = useCallback((offset) => {
    if (!selectorUrl || !token || loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    fetch(`${selectorUrl}?limit=${SELECTOR_PAGE}&offset=${offset}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const items = data?.items ?? data?.response?.data ?? (Array.isArray(data) ? data : null);
        if (items) {
          const mapped = items.map(i => ({ id: i.id, name: i.label ?? i.name ?? i.id }));
          setServerOptions(prev => offset === 0 ? mapped : [...(prev ?? []), ...mapped]);
          offsetRef.current = offset + items.length;
          if (items.length < SELECTOR_PAGE) { setHasMore(false); hasMoreRef.current = false; }
        }
        loadingRef.current = false;
      })
      .catch(() => { loadingRef.current = false; });
  }, [selectorUrl, token]);

  // Load first page when selectorUrl/token available
  useEffect(() => {
    if (!selectorUrl || !token) return;
    offsetRef.current = 0;
    hasMoreRef.current = true;
    setHasMore(true);
    setServerOptions(null);
    fetchPage(0);
  }, [selectorUrl, token, fetchPage]);

  // Callback ref: fires when SelectContent mounts (dropdown opens) — attaches scroll listener
  const contentCallbackRef = useCallback((node) => {
    if (!node || !selectorUrl) return;
    // Radix renders [data-radix-select-viewport] as the actual scrollable element
    const viewport = node.querySelector('[data-radix-select-viewport]') ?? node;
    viewport.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      if (scrollHeight - scrollTop - clientHeight < 100) fetchPage(offsetRef.current);
    }, { passive: true });
  }, [fetchPage, selectorUrl]);

  const baseOptions = serverOptions ?? catalogOptions;
  const hasValue = value && baseOptions.some(opt => opt.id === value);
  const options = (!hasValue && value && displayValue)
    ? [{ id: value, name: displayValue }, ...baseOptions]
    : baseOptions;

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const opt = options.find(o => o.id === val);
        onChange(val, opt?.name, opt);
      }}
      required={field.required}
    >
      <SelectTrigger id={field.key} data-testid={`field-${field.key}`} className="focus:ring-2 focus:ring-primary">
        <SelectValue placeholder={`Select ${resolvedLabel}...`} />
      </SelectTrigger>
      <SelectContent ref={contentCallbackRef}>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id} data-testid={`option-${field.key}-${opt.id}`}>{opt.name}</SelectItem>
        ))}
        {hasMore && selectorUrl && (
          <div className="py-1 text-center text-xs text-muted-foreground select-none pointer-events-none">Loading…</div>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Dependent Select for FK fields that require a parent context.
 * Re-fetches options whenever the parent value changes.
 */
function DependentSelect({ field, value, displayValue, onChange, catalogs, formData, resolvedLabel, selectorUrl, selectorContext, token }) {
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const parentKey = field.dependsOn?.field;
  const parentValue = formData?.[parentKey];

  React.useEffect(() => {
    if (!parentValue || !selectorUrl || !token) {
      setDynamicOptions([]);
      return;
    }

    setLoading(true);
    const url = buildUrlWithParams(selectorUrl, {
      ...selectorContext,
      [field.dependsOn?.filterKey]: parentValue,
    });
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.items) {
          const items = data.items.map(i => ({ id: i.id, name: i.label || i.name || i.id, ...i }));
          setDynamicOptions(items);
          // Auto-select first option if current value is empty or not in the new options
          // (e.g., BP changed → old address no longer valid)
          const currentValid = value && items.some(i => i.id === value);
          if (!currentValid && items.length > 0) {
            onChange(items[0].id, items[0].name);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [parentValue, selectorUrl, selectorContext, token, field.dependsOn?.filterKey]);

  // If the current value isn't in options (real data from existing record), add it
  const hasValue = value && dynamicOptions.some(opt => opt.id === value);
  const options = (!hasValue && value && displayValue)
    ? [...dynamicOptions, { id: value, name: displayValue }]
    : dynamicOptions;

  // Auto-clear dependent field if parent is cleared
  React.useEffect(() => {
    if (!parentValue && value) {
      onChange('', '');
    }
  }, [parentValue, value]);

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const opt = options.find(o => o.id === val);
        onChange(val, opt?.name, opt);
      }}
      required={field.required}
      disabled={(!parentValue && !value) || loading}
    >
      <SelectTrigger id={field.key} data-testid={`field-${field.key}`} className="focus:ring-2 focus:ring-primary">
        <SelectValue
          placeholder={loading ? 'Loading...' : (parentValue ? `Select ${resolvedLabel}...` : `Select ${field.dependsOn?.field} first`)}
        />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id} data-testid={`option-${field.key}-${opt.id}`}>{opt.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Form field that opens a ProductSearchDrawer for lookup-enabled search fields.
 */
function LookupFormField({ field, value, displayValue, selectorUrl, token, resolvedLabel, onChange }) {
  const [open, setOpen] = useState(false);
  const display = displayValue || value || '';
  return (
    <>
      <button
        type="button"
        data-testid={`field-${field.key}`}
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm text-left hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors"
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        {display ? (
          <span className="flex-1 truncate text-foreground">{display}</span>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">Search {resolvedLabel}...</span>
        )}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          onChange(item.id, item.label || item.name || item._identifier || '', item);
          setOpen(false);
        }}
        selectorUrl={selectorUrl}
        token={token}
        title={resolvedLabel}
      />
    </>
  );
}

/**
 * Generic Entity Form component.
 * Layouts: 'horizontal' (grid-based edit form) | 'vertical' (stack-based sidebar)
 * 
 * Props:
 *  - fields: Array<{ key, label, type, required, reference, inputMode, dependsOn }>
 *  - data: object with current field values
 *  - onChange: (fieldKey, value) => void
 *  - catalogs: Record<string, Array<{ id, name, ... }>> for FK reference data
 *  - displayLogic: { readOnly: { fieldName: bool }, visibility: { fieldName: bool } }
 */
export function EntityForm({ entity, fields = [], data, onChange, catalogs, layout, cols, section, excludeFields = [], displayLogic, api, token, apiBaseUrl, selectorContext = {}, readOnly: formReadOnly = false }) {
  const t = useLabel();
  const { locale } = useLocaleSwitch();
  let displayFields;
  if (section) {
    // When filtering by section, include all fields (editable + readOnly) for that section
    displayFields = fields.filter(f => f.section === section && !excludeFields.includes(f.key));
  } else if (layout === 'horizontal') {
    displayFields = fields.filter(f => !f.readOnly);
  } else {
    displayFields = fields;
  }

  // Apply visibility from evaluate-display (hide fields where visibility === false).
  // Only honor the evaluate-display result if the field itself declares a displayLogic
  // in its contract definition. Fields without displayLogic have a static visibility
  // decision that evaluate-display must not override (prevents AD displayLogic bugs
  // from incorrectly hiding fields like businessPartner).
  // Fields with a function-based displayLogic are handled entirely client-side (second
  // filter below) and must NOT be removed here — the server result is irrelevant for them.
  if (displayLogic?.visibility && Object.keys(displayLogic.visibility).length > 0) {
    displayFields = displayFields.filter(f =>
      typeof f.displayLogic === 'function' || !f.displayLogic || displayLogic.visibility[f.key] !== false
    );
  }

  // Apply function-based displayLogic evaluated client-side against current data.
  // This mirrors the readOnlyLogic pattern and handles fields like customer/vendor
  // tabs where visibility depends on a sibling checkbox value (no server round-trip needed).
  displayFields = displayFields.filter(f =>
    typeof f.displayLogic !== 'function' || !!f.displayLogic(data ?? {})
  );

  if (displayFields.length === 0) return null;

  const gridClass = cols
    ? 'grid'
    : (layout === 'horizontal'
      ? 'grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3'
      : 'grid grid-cols-2 gap-3 md:grid-cols-3');
  const gridStyle = cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 } : undefined;

  // If there's an image field, pin it to the right — rest of fields render in a 3-col grid on the left
  const imageField = displayFields.find(f => f.type === 'image');
  const fieldsToRender = imageField ? displayFields.filter(f => f.type !== 'image') : displayFields;

  const renderField = (f) => {
    // Resolution order: per-window AD_Field label (most specific) → global locale by column → camelCase key
    const label = t(f.column) ?? f.label ?? f.key;
    // Field is read-only if statically declared, dynamically set by evaluate-display, or readOnlyLogic evaluates to true
    const isReadOnly = formReadOnly
      || f.readOnly
      || displayLogic?.readOnly?.[f.key] === true
      || (typeof f.readOnlyLogic === 'function' && !!f.readOnlyLogic(data ?? {}));
    const displayValue = resolveIdentifier(data, f.key) ?? data?.[f.key] ?? '';
    if (f.type === 'checkbox') {
      return (
        <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
          <div className="flex items-center gap-2 pt-6">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!data?.[f.key]}
              disabled={isReadOnly}
              id={f.key}
              data-testid={`field-${f.key}`}
              onClick={() => !isReadOnly && onChange?.(f.key, !data?.[f.key], f.column)}
              className={[
                'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                !!data?.[f.key]
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent',
              ].join(' ')}
            >
              {!!data?.[f.key] && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <Label htmlFor={f.key} className="text-sm text-foreground font-medium cursor-pointer">
              {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
            </Label>
          </div>
        </FieldHighlight>
      );
    }
    if (f.type === 'dependent') {
      if (isReadOnly) {
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label htmlFor={f.key} className="text-sm text-muted-foreground font-medium">
                {label}
              </Label>
              <Input value={resolveIdentifier(data, f.key) || data?.[f.key] || ''} disabled className="bg-muted/50" />
            </div>
          </FieldHighlight>
        );
      }
      return (
        <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
          <div className="space-y-1.5">
            <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
              {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
            </Label>
            <DependentSelect
              field={f}
              value={data?.[f.key] ?? ''}
              displayValue={data?.[f.key + '$_identifier']}
              onChange={(val, label) => {
                onChange?.(f.key, val, f.column);
                if (label) onChange?.(f.key + '$_identifier', label);
              }}
              catalogs={catalogs}
              formData={data}
              resolvedLabel={label}
              selectorUrl={apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${f.column}` : null}
              selectorContext={selectorContext}
              token={token}
            />
          </div>
        </FieldHighlight>
      );
    }
    if (f.type === 'selector') {
      if (isReadOnly) {
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label htmlFor={f.key} className="text-sm text-muted-foreground font-medium">
                {label}
              </Label>
              <Input value={resolveIdentifier(data, f.key) || data?.[f.key] || ''} disabled className="bg-muted/50" />
            </div>
          </FieldHighlight>
        );
      }
      return (
        <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
          <div className="space-y-1.5">
            <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
              {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
            </Label>
            <SelectorInput
              entityName={entity}
              field={f}
              value={data?.[f.key] ?? ''}
              displayValue={resolveIdentifier(data, f.key)}
              onChange={(val, label, auxData) => {
                onChange?.(f.key, val, f.column);
                if (label) onChange?.(f.key + '$_identifier', label);
                if (auxData) {
                  for (const [suffix, auxVal] of Object.entries(auxData)) {
                    if (suffix === '_aux' && auxVal && typeof auxVal === 'object') {
                      for (const [auxSuffix, auxSuffixVal] of Object.entries(auxVal)) {
                        onChange?.(f.key + auxSuffix, auxSuffixVal);
                      }
                    } else {
                      onChange?.(f.key + suffix, auxVal);
                    }
                  }
                }
              }}
              catalogs={catalogs}
              resolvedLabel={label}
              selectorUrl={apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${f.column}` : null}
              token={token}
            />
          </div>
        </FieldHighlight>
      );
    }
    if (f.type === 'search') {
      if (isReadOnly) {
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label htmlFor={f.key} className="text-sm text-muted-foreground font-medium">
                {label}
              </Label>
              <Input value={resolveIdentifier(data, f.key) || data?.[f.key] || ''} disabled className="bg-muted/50" />
            </div>
          </FieldHighlight>
        );
      }
      const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${f.column}` : null;
      const searchOnChange = (val, lbl, auxData) => {
        onChange?.(f.key, val, f.column);
        if (lbl) onChange?.(f.key + '$_identifier', lbl);
        if (auxData) {
          for (const [suffix, auxVal] of Object.entries(auxData)) {
            if (suffix === '_aux' && auxVal && typeof auxVal === 'object') {
              for (const [auxSuffix, auxSuffixVal] of Object.entries(auxVal)) {
                onChange?.(f.key + auxSuffix, auxSuffixVal);
              }
            } else {
              onChange?.(f.key + suffix, auxVal);
            }
          }
        }
      };
      // Popup fields open a full ProductSearchDrawer instead of inline dropdown
      if (f.popup) {
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground font-medium">
                {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
              </Label>
              <PopupSearchInput
                field={f}
                value={data?.[f.key] ?? ''}
                displayValue={data?.[f.key + '$_identifier']}
                onChange={(val, lbl) => {
                  onChange?.(f.key, val, f.column);
                  if (lbl) onChange?.(f.key + '$_identifier', lbl);
                }}
                label={label}
                selectorUrl={selectorUrl}
                token={token}
              />
            </div>
          </FieldHighlight>
        );
      }
      // Lookup fields open a full ProductSearchDrawer instead of inline dropdown
      if (f.lookup) {
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
              </Label>
              <LookupFormField
                field={f}
                value={data?.[f.key] ?? ''}
                displayValue={data?.[f.key + '$_identifier']}
                selectorUrl={selectorUrl}
                token={token}
                resolvedLabel={label}
                onChange={searchOnChange}
              />
            </div>
          </FieldHighlight>
        );
      }
      return (
        <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
          <div className="space-y-1.5">
            <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
              {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
            </Label>
            <SearchInput
              entityName={entity}
              field={f}
              value={data?.[f.key] ?? ''}
              displayValue={data?.[f.key + '$_identifier']}
              onChange={searchOnChange}
              catalogs={catalogs}
              resolvedLabel={label}
              selectorUrl={selectorUrl}
              selectorContext={selectorContext}
              token={token}
            />
          </div>
        </FieldHighlight>
      );
    }
    if (f.type === 'select' && f.options?.length) {
      return (
        <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
          <div className="space-y-1.5">
            <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
              {label}{f.required && !isReadOnly ? <span className="text-red-500 ml-0.5">*</span> : ''}
            </Label>
            <Select
              value={data?.[f.key] ?? ''}
              onValueChange={(val) => onChange?.(f.key, val, f.column)}
              disabled={isReadOnly}
              required={f.required}
            >
              <SelectTrigger id={f.key} data-testid={`field-${f.key}`} className="focus:ring-2 focus:ring-primary">
                <SelectValue placeholder={`Select ${label}...`} />
              </SelectTrigger>
              <SelectContent>
                {f.options.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FieldHighlight>
      );
    }
    if (f.type === 'textarea') {
      return (
        <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
          <div className="space-y-1.5 h-full flex flex-col">
            <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
              {label}{f.required && !isReadOnly ? <span className="text-red-500 ml-0.5">*</span> : ''}
            </Label>
            <textarea
              id={f.key}
              name={f.key}
              data-testid={`field-${f.key}`}
              rows={4}
              value={isReadOnly ? displayValue : (data?.[f.key] ?? '')}
              onChange={(e) => onChange?.(f.key, e.target.value, f.column)}
              disabled={isReadOnly}
              className={[
                'flex w-full rounded-md border border-input px-3 py-2 text-sm shadow-sm',
                'placeholder:text-muted-foreground resize-none flex-1 min-h-[96px]',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                isReadOnly ? 'bg-muted/50 cursor-default' : 'bg-background',
              ].join(' ')}
            />
          </div>
        </FieldHighlight>
      );
    }
    const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
    return (
      <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
        <div className="space-y-1.5">
          <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
            {label}{f.required && !isReadOnly ? <span className="text-red-500 ml-0.5">*</span> : ''}
          </Label>
          <Input
            id={f.key}
            name={f.key}
            data-testid={`field-${f.key}`}
            type={inputType}
            value={isReadOnly ? displayValue : (data?.[f.key] ?? '')}
            onChange={(e) => onChange?.(f.key, e.target.value, f.column)}
            className={isReadOnly ? 'bg-muted/50' : 'focus:ring-2 focus:ring-primary focus:outline-none'}
            required={f.required && !isReadOnly}
            disabled={isReadOnly}
          />
        </div>
      </FieldHighlight>
    );
  };

  if (imageField) {
    const imgLabel = imageField.label ?? t(imageField.column) ?? imageField.key;
    const imgReadOnly = formReadOnly
      || imageField.readOnly
      || displayLogic?.readOnly?.[imageField.key] === true
      || (typeof imageField.readOnlyLogic === 'function' && !!imageField.readOnlyLogic(data ?? {}));
    return (
      <div className="flex gap-6 items-start">
        <div className={`flex-1 min-w-0 ${gridClass}`} style={gridStyle}>
          {fieldsToRender.map(renderField)}
        </div>
        <div className="shrink-0 w-56">
          <Label className="text-sm text-foreground font-medium block mb-1.5">{imgLabel}</Label>
          <ImageField
            imageId={data?.[imageField.key] ?? ''}
            onChange={(newId) => onChange?.(imageField.key, newId, imageField.column)}
            token={token}
            apiBaseUrl={apiBaseUrl}
            readOnly={imgReadOnly}
            fieldKey={imageField.key}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={gridClass} style={gridStyle}>
      {displayFields.map(renderField)}
    </div>
  );
}
