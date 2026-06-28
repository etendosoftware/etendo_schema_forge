import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FIELD_HEIGHT, ROW_GAP_Y, LABEL_GAP } from '@/components/ui/formDensity';
import { PillToggle } from '@/components/PillToggle';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { useLabel, useLocaleSwitch, useMenuLabel, useUI } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { ImageField } from './ImageField.jsx';
import ProductSearchDrawer from './ProductSearchDrawer.jsx';
import { CreateContactContext } from './CreateContactContext.js';
import { PartnerAddressPicker } from './PartnerAddressPicker.jsx';
import { CurrencyRatePicker } from './CurrencyRatePicker.jsx';
import { SelectorChip } from './SelectorChip.jsx';
import { SelectorInput } from './SelectorInput.jsx';
import { CreatableSearchSelect } from './CreatableSearchSelect.jsx';
import { InlineCreateSelector } from './InlineCreateSelector.jsx';

function buildSelectPlaceholder(ui, label) {
  return `${ui('selectLabelPrefix')} ${label}...`;
}

function evalReadOnlyLogic(field, data) {
  if (typeof field?.readOnlyLogic !== 'function') return false;
  try {
    return !!field.readOnlyLogic(data ?? {});
  } catch (err) {
    console.error(`[readOnlyLogic] field='${field.key}' threw:`, err, '| record:', data);
    return false;
  }
}

function evalDisplayLogic(field, data) {
  if (typeof field?.displayLogic !== 'function') return true;
  try {
    return !!field.displayLogic(data ?? {});
  } catch (err) {
    console.error(`[displayLogic] field='${field.key}' threw:`, err, '| record:', data);
    return true;
  }
}

function buildSearchPlaceholder(ui, label) {
  return `${ui('searchLabelPrefix')} ${label}...`;
}

/** Resolve an i18n key to its label (falling back to the key), or undefined when absent. */
function resolveUiKey(ui, key) {
  return key ? (ui(key) ?? key) : undefined;
}

/**
 * Resolve the grid utility classes for an EntityForm container.
 * Extracted from a nested ternary to satisfy Sonar S3358 — the three branches
 * (override via `cols`, horizontal header form, vertical line form) have
 * distinct visual contracts and should read as independent statements.
 */
function resolveGridClass(cols, layout) {
  if (cols) return 'grid';
  if (layout === 'horizontal') return `grid grid-cols-2 gap-x-5 ${ROW_GAP_Y} md:grid-cols-4`;
  return 'grid grid-cols-2 gap-3 md:grid-cols-3';
}

/**
 * Button that opens the ProductSearchDrawer popup for fields with popup: true.
 */
function PopupSearchInput({ field, value, displayValue, onChange, label, selectorUrl, selectorContext, token }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const displayText = displayValue || (value ? value : '');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`field-${field.key}`}
        className={`w-full ${FIELD_HEIGHT} text-sm rounded-lg border border-[#D1D4DB] bg-white p-2 text-left flex items-center gap-2 shadow-[0px_1px_2px_rgba(18,18,23,0.05)] hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors`}
      >
        <Search
          className="h-4 w-4 text-muted-foreground shrink-0"
          data-testid={"Search__" + field.id} />
        {displayText ? (
          <span className="truncate text-foreground">{displayText}</span>
        ) : (
          <span className="truncate text-muted-foreground">{buildSearchPlaceholder(ui, label)}</span>
        )}
      </button>
      <ProductSearchDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onChange(item.id, item.label || item.name); setOpen(false); }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={label}
        data-testid={"ProductSearchDrawer__" + field.id} />
    </>
  );
}

/**
 * Dropdown selector for FK fields with many options (inputMode: search).
 * Supports both static catalog data (mock) and server-side filtering via API.
 */
function SearchInput({ entityName, field, value, displayValue, onChange, catalogs, resolvedLabel, selectorUrl, selectorContext, token }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(displayValue || value || '');
  const [serverResults, setServerResults] = useState(null);
  const [fetching, setFetching] = useState(false);
  // When a value is selected, the field renders as a chip (Figma spec).
  // editingIntent flips to true when the user clicks the chip to switch back to
  // typing mode, and resets after a fresh selection / clear.
  const [editingIntent, setEditingIntent] = useState(false);
  // Tracks whether the user is actively typing so the sync effect doesn't fight keystrokes.
  const isEditingRef = useRef(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  // Optional "Create contact" capability injected by custom windows via context.
  const createCtx = React.useContext(CreateContactContext);
  const canCreate = !!createCtx && createCtx.fieldKey === field.key;

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
  const searchContextKey = JSON.stringify(selectorContext ?? {});
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
  }, [value, displayValue, selectorUrl, searchContextKey, token, catalogs, entityName, field]);

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
    setEditingIntent(false);
    setQuery(opt.name);
    setOpen(false);

    // Pass full record as 3rd arg so auxiliary fields (like M_PriceList_ID) can be mapped
    // by the parent Form (if the schema defines mapped column suffixes).
    onChange(opt.id, opt.name, opt);
  };

  const handleClear = () => {
    isEditingRef.current = false;
    setEditingIntent(false);
    setQuery('');
    setServerResults(null);
    setOpen(false);
    onChange('', '');
  };

  // If field is mandatory but value is empty, or if we have a value, don't show clear unless value exists
  const hasSelection = value != null && value !== '';
  // Chip mode: a selected value renders as the Figma tag/chip; clicking the chip
  // body flips editingIntent so the user can type to search again.
  const showChip = hasSelection && !editingIntent && field.clearable !== false;
  const handleChipClick = () => {
    setEditingIntent(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const createBtn = canCreate ? (
    <button
      type="button"
      data-testid={`action-create-${field.key}`}
      className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-blue-50 border-b border-border/40 transition-colors"
      style={{ color: '#202452' }}
      onMouseDown={e => { e.preventDefault(); setOpen(false); createCtx.onOpen(query, handleSelect); }}
    >
      + {ui('createContact')}
    </button>
  ) : null;

  return (
    /*
      Single wrapper that doubles as the visual "field" element (border + shadow
      + bg live here, like SelectTrigger) AND as the popup anchor (relative for
      the absolute-positioned dropdowns below). The inner <input> is borderless
      and transparent so DevTools highlights this same wrapper as the field box
      — matching the SelectorInput inspector experience.
    */
    <div
      className={`relative flex ${FIELD_HEIGHT} w-full items-center rounded-lg border border-[#D1D4DB] bg-transparent shadow-[0px_1px_2px_rgba(18,18,23,0.05)] pl-2 pr-2 gap-1 focus-within:ring-2 focus-within:ring-primary`}
      onClick={showChip ? handleChipClick : undefined}
    >
      {showChip ? (
        <SelectorChip
          label={displayValue || query}
          onClick={handleChipClick}
          onClear={handleClear}
          clearAriaLabel={ui('clear')}
          testId={`field-${field.key}-chip`}
          clearable={field.clearable !== false}
          data-testid={"SelectorChip__" + field.id} />
      ) : (
        <input
          ref={inputRef}
          id={field.key}
          name={field.key}
          data-testid={`field-${field.key}`}
          type="text"
          placeholder={buildSearchPlaceholder(ui, resolvedLabel)}
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
            setTimeout(() => {
              setOpen(false);
              // If the user clicked away without picking a new option, revert to chip mode
              // so the previously-selected value stays visible (no destructive cancel).
              if (hasSelection) setEditingIntent(false);
            }, 200);
          }}
          className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none py-2 text-sm placeholder:text-[#6C6C89]"
          required={field.required}
          autoComplete="off"
        />
      )}
      {fetching ? (
        <Loader2
          className="h-4 w-4 text-[#828FA3] animate-spin shrink-0 ml-auto"
          data-testid={"Loader2__" + field.id} />
      ) : (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (showChip) { handleChipClick(); return; }
            if (open) {
              setOpen(false);
            } else {
              setOpen(true);
              inputRef.current?.focus();
              if (!catalogOptions && !serverResults) triggerServerSearch(query);
            }
          }}
          className="shrink-0 ml-auto flex items-center"
        >
          <ChevronDown
            className="h-4 w-4 text-[#828FA3]"
            data-testid={"ChevronDown__" + field.id} />
        </button>
      )}
      {open && (canCreate || filtered.length > 0) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          {createBtn}
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              data-testid={`option-${field.key}-${opt.id}`}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
              onMouseDown={() => handleSelect(opt)}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
      {open && query.length > 0 && !fetching && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          {createBtn}
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {ui('noResultsFor')} &ldquo;{query}&rdquo;
          </div>
        </div>
      )}
      {open && !query && !fetching && canCreate && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg">
          {createBtn}
        </div>
      )}
    </div>
  );
}

// SelectorInput moved to './SelectorInput.jsx' to be reused by both the form view
// here and the inline add-row in DataTable.

/**
 * Dependent Select for FK fields that require a parent context.
 * Re-fetches options whenever the parent value changes.
 */
function DependentSelect({ field, value, displayValue, onChange, catalogs, formData, resolvedLabel, selectorUrl, selectorContext, token }) {
  const ui = useUI();
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const parentKey = field.dependsOn?.field;
  const parentValue = formData?.[parentKey];
  // Compare selectorContext by content, not by reference. DetailView recreates the
  // context object on every editing mutation even when values are identical, which
  // would otherwise refetch options on every callout cascade.
  const contextKey = JSON.stringify(selectorContext ?? {});

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
          // ETP-3894: when the parent changes and the previous value is no longer in
          // the new options list, auto-select the first available option (FIC parity —
          // the user explicitly chose the parent, so filling the dependent is helpful).
          // If no options exist and the field had a stale value, clear it.
          const noAutoSelect = field.dependsOn?.noAutoSelect;
          const currentValid = value && items.some(i => i.id === value);
          if (!currentValid) {
            if (!noAutoSelect && items.length > 0) {
              onChange(items[0].id, items[0].name);
            } else if (value) {
              onChange('', '');
            }
          }
        }
      })
      .catch(() => {
        setDynamicOptions([]);
      })
      .finally(() => setLoading(false));
  }, [parentValue, selectorUrl, contextKey, token, field.dependsOn?.filterKey]);

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
      value={value || '__empty__'}
      onValueChange={(val) => {
        if (val === '__empty__') {
          onChange('', '', null);
          return;
        }
        const opt = options.find(o => o.id === val);
        onChange(val, opt?.name, opt);
      }}
      required={field.required}
      disabled={(!parentValue && !value) || loading}
      data-testid={"Select__" + field.id}>
      <SelectTrigger id={field.key} data-testid={`field-${field.key}`} className="focus:ring-2 focus:ring-primary">
        <SelectValue
          placeholder={loading ? ui('loading') : (parentValue ? buildSelectPlaceholder(ui, resolvedLabel) : ui('selectParentFirst'))}
          data-testid={"SelectValue__" + field.id} />
        {loading && <Loader2
          className="h-4 w-4 text-muted-foreground animate-spin ml-auto mr-1"
          data-testid={"Loader2__" + field.id} />}
      </SelectTrigger>
      <SelectContent data-testid={"SelectContent__" + field.id}>
        {!field.required && <SelectItem value="__empty__" data-testid={"SelectItem__" + field.id}>&nbsp;</SelectItem>}
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
function LookupFormField({ field, value, displayValue, selectorUrl, selectorContext, token, resolvedLabel, onChange }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const display = displayValue || value || '';
  return (
    <>
      <button
        type="button"
        data-testid={`field-${field.key}`}
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 ${FIELD_HEIGHT} rounded-lg border border-[#D1D4DB] bg-white p-2 text-sm text-left shadow-[0px_1px_2px_rgba(18,18,23,0.05)] hover:border-primary/50 focus:ring-2 focus:ring-primary focus:outline-none transition-colors`}
      >
        <Search
          className="h-4 w-4 text-muted-foreground shrink-0"
          data-testid={"Search__" + field.id} />
        {display ? (
          <span className="flex-1 truncate text-foreground">{display}</span>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">{buildSearchPlaceholder(ui, resolvedLabel)}</span>
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
        selectorContext={selectorContext}
        token={token}
        title={resolvedLabel}
        data-testid={"ProductSearchDrawer__" + field.id} />
    </>
  );
}

function applyLookupAuxData(auxData, isGross, onChange, f) {
  for (const [suffix, auxVal] of Object.entries(auxData)) {
    // Price from the document's price list. Mapping depends on price list type:
    //   - Gross list (isTaxIncluded=true): standardPrice is the gross price → grossUnitPrice
    //   - Net list   (isTaxIncluded=false): standardPrice is the net price   → unitPrice
    if (suffix === 'standardPrice' && auxVal != null) {
      if (isGross) {
        onChange?.('grossUnitPrice', auxVal);
      } else {
        // Mirror InlineAddRow: for net price lists, standardPrice is the net price →
        // populate both unitPrice and listPrice so sidebar and add-row behave identically.
        onChange?.('unitPrice', auxVal);
        onChange?.('listPrice', auxVal);
      }
    } else if (suffix === '_aux' && auxVal && typeof auxVal === 'object') {
      for (const [auxSuffix, auxSuffixVal] of Object.entries(auxVal)) {
        onChange?.(f.key + auxSuffix, auxSuffixVal);
      }
    } else {
      onChange?.(f.key + suffix, auxVal);
    }
  }
}

function renderSelectField(f, data, label, isReadOnly, onChange, ctx) {
  const { ui, tMenu, optionalSuffix = false } = ctx;
  let selectValue;
  if (f.valueType === 'boolean') {
    if (data?.[f.key] === true || data?.[f.key] === 'Y' || data?.[f.key] === 'true') {
      selectValue = 'true';
    } else {
      if (data?.[f.key] === false || data?.[f.key] === 'N' || data?.[f.key] === 'false') {
        selectValue = 'false';
      } else {
        selectValue = '';
      }
    }
  } else {
    selectValue = data?.[f.key] ?? '';
  }
  return (
    <div key={f.key} className={LABEL_GAP}>
      <Label
        htmlFor={f.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
      </Label>
      <Select
        value={selectValue || '__empty__'}
        onValueChange={(val) => {
          if (val === '__empty__') {
            onChange?.(f.key, '', f.column);
            return;
          }
          onChange?.(f.key, f.valueType === 'boolean' ? val === 'true' : val, f.column);
        }}
        disabled={isReadOnly}
        required={f.required}
        data-testid="Select__a8d626">
        <SelectTrigger id={f.key} data-testid={`field-${f.key}`} className="bg-white focus:ring-2 focus:ring-primary">
          <SelectValue
            placeholder={buildSelectPlaceholder(ui, label)}
            data-testid="SelectValue__a8d626" />
        </SelectTrigger>
        <SelectContent data-testid="SelectContent__a8d626">
          {!f.required && <SelectItem value="__empty__" data-testid="SelectItem__a8d626">&nbsp;</SelectItem>}
          {f.options.map(opt => (
              <SelectItem key={opt.value} value={opt.value} data-testid="SelectItem__a8d626">{tMenu(opt.label)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PopupSearchField(props) {
  return (
    <div className={LABEL_GAP}>
      <Label
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {props.label}{props.f.required ? <span className="text-red-500 ml-0.5">*</span> : ""}
      </Label>
      <PopupSearchInput
        field={props.f}
        value={props.data?.[props.f.key] ?? ""}
        displayValue={props.data?.[props.f.key + "$_identifier"]}
        onChange={props.onChange}
        label={props.label}
        selectorUrl={props.selectorUrl}
        selectorContext={props.selectorContext}
        token={props.token}
        data-testid="PopupSearchInput__a8d626" />
    </div>
  );
}

function getCheckboxStateClass(checked) {
  return checked
      ? 'bg-primary text-primary-foreground'
      : 'bg-transparent';
}

function requiredAsterisk(f) {
  return f.required ? <span className="text-red-500 ml-0.5">*</span> : '';
}

/**
 * Trailing marker rendered after a field label.
 * Required fields get a red asterisk; otherwise, when `optionalSuffix` is enabled
 * for the form (Figma list-modal style), a muted "(opcional)" suffix is shown.
 * Generic + opt-in: forms that don't pass `optionalSuffix` keep the old behaviour
 * (asterisk only). The suffix text comes from the i18n `optional` key.
 */
function labelMarker(f, isReadOnly, optionalSuffix, ui) {
  if (f.required && !isReadOnly) return <span className="text-[#F53D6B] ml-0.5">*</span>;
  if (optionalSuffix && !isReadOnly) {
    return <span className="ml-1 font-normal text-[#6C6C89]">({ui('optional')})</span>;
  }
  return '';
}

/**
 * Helper text rendered below a field input (e.g. "Menor número = mayor prioridad").
 * `f.help` is an i18n key resolved via useUI; raw strings are passed through so the
 * component stays usable with literal copy too.
 */
function FieldHelp({ field, ui }) {
  if (!field?.help) return null;
  const text = ui(field.help) ?? field.help;
  return <p className="text-sm leading-6 text-[#6C6C89]" data-testid={`help-${field.key}`}>{text}</p>;
}

function formatReadOnlyDisplayValue(f, isReadOnly, rawDisplayValue) {
  if (!(f.type === 'number' && isReadOnly && Number.isFinite(Number(rawDisplayValue)))) {
    return rawDisplayValue;
  }
    return parseFloat(Number(rawDisplayValue).toFixed(10));
}

function buildSearchSelectorUrl(apiBaseUrl, entity, f, apiSelectorEntry) {
  return apiBaseUrl ? (() => {
    const base = `${apiBaseUrl}/${entity}/selectors/${f.column}`;
    if (apiSelectorEntry?.url?.includes('?')) {
      return `${base}?${apiSelectorEntry.url.split('?')[1]}`;
    }
    return base;
  })() : null;
}

function requiredAsteriskIfEditable(f, isReadOnly) {
  return f.required && !isReadOnly ? <span className="text-red-500 ml-0.5">*</span> : '';
}

function getInputStateClass(isReadOnly) {
  return isReadOnly ? 'bg-muted/50' : 'bg-white focus:ring-2 focus:ring-primary focus:outline-none';
}

function DependentFkField(props) {
  return (
    <div className={LABEL_GAP}>
      <Label
        htmlFor={props.f.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {props.label}{requiredAsterisk(props.f)}
      </Label>
      {props.f.column === "C_BPartner_Location_ID" ? (
          <PartnerAddressPicker
            field={props.f}
            value={props.data?.[props.f.key] ?? ""}
            displayValue={props.data?.[props.f.key + "$_identifier"]}
            onChange={props.onChange}
            formData={props.data}
            resolvedLabel={props.label}
            selectorUrl={props.selectorUrl}
            selectorContext={props.selectorContext}
            token={props.token}
            apiBaseUrl={props.apiBaseUrl}
            data-testid="PartnerAddressPicker__a8d626" />
      ) : (
          <DependentSelect
            field={props.f}
            value={props.data?.[props.f.key] ?? ""}
            displayValue={props.data?.[props.f.key + "$_identifier"]}
            onChange={props.onChange}
            catalogs={props.catalogs}
            formData={props.data}
            resolvedLabel={props.label}
            selectorUrl={props.selectorUrl}
            selectorContext={props.selectorContext}
            token={props.token}
            data-testid="DependentSelect__a8d626" />
      )}
    </div>
  );
}

function buildDependentSelectorUrl(apiBaseUrl, entity, f) {
  return apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${f.column}` : null;
}

// Selector URL for a pure-dropdown FK field. Always computed from apiBaseUrl so the
// full server path is included; appends query params from the api.selectors entry
// (e.g. ?isSOTrx=Y) when present.
function buildEntitySelectorUrl(apiBaseUrl, entity, f, api) {
  if (!apiBaseUrl) return null;
  const entry = api?.selectors?.find(s => s.entity === entity && s.field === f.key);
  const base = `${apiBaseUrl}/${entity}/selectors/${f.column}`;
  return entry?.url?.includes('?') ? `${base}?${entry.url.split('?')[1]}` : base;
}

// Propagate a selector's aux payload onto sibling form fields. `_aux` nests an
// object of extra suffix→value pairs; any other key is a direct suffix write.
function applySelectorAuxData(auxData, onChange, f) {
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

function isSelectFieldWithOptions(f) {
  return f.type === 'select' && f.options?.length;
}

function getInputType(f) {
  return f.type === 'number' ? 'number' : 'text';
}


function getFieldValue(isReadOnly, displayValue, data, f) {
  return isReadOnly ? displayValue : (data?.[f.key] ?? '');
}

function getReadOnlyBgClass(isReadOnly) {
  return isReadOnly ? 'bg-muted/50 cursor-default' : 'bg-white';
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
export function EntityForm({ entity, fields = [], data, onChange, catalogs, layout, cols, section, excludeFields = [], displayLogic, api, token, apiBaseUrl, selectorContext = {}, readOnly: formReadOnly = false, onFieldBlur, savingField = null, labelOverrides, registerFields, fieldErrors, optionalSuffix = false }) {
  const t = useLabel(labelOverrides ?? api?.labelOverrides);
  const tMenu = useMenuLabel();
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const effectiveSelectorContext = useMemo(() => selectorContext ?? {}, [selectorContext]);
  const visibleBaseFields = fields.filter(f => !excludeFields.includes(f.key));
  let displayFields;
  if (section) {
    // When filtering by section, include all fields (editable + readOnly) for that section
    displayFields = visibleBaseFields.filter(f => f.section === section);
  } else if (layout === 'horizontal') {
    displayFields = visibleBaseFields.filter(f => !f.readOnly);
  } else {
    displayFields = visibleBaseFields;
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
  displayFields = displayFields.filter(f => evalDisplayLogic(f, data));

  // Stable ID unique to this EntityForm instance. Used as the Map key in useEntity's
  // formFieldsRef so multiple EntityForms on the same screen accumulate rather than
  // overwrite each other.
  const formId = React.useId();

  // Register only the currently visible fields with useEntity so handleSave validates
  // what the user can actually see and fill — not hidden fields controlled by displayLogic.
  // Cleanup removes this form's entry when the component unmounts (e.g. conditional blocks).
  React.useEffect(() => {
    if (typeof registerFields !== 'function') return;
    registerFields(displayFields, formId);
    return () => registerFields(null, formId);
  // displayFields is recomputed on every render; the effect intentionally re-runs
  // whenever visibility changes so the validation set stays in sync with the form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerFields, formId, data, displayLogic, fields, excludeFields, section, layout]);

  if (displayFields.length === 0) return null;

  const gridClass = resolveGridClass(cols, layout);
  const gridStyle = cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 } : undefined;

  // If there's an image field (not inline), pin it to the right — rest of fields render in a 3-col grid on the left
  const imageField = displayFields.find(f => f.type === 'image' && !f.inline);
  const fieldsToRender = imageField ? displayFields.filter(f => f.type !== 'image' || f.inline) : displayFields;

  // FK-style field renderers hoisted out of renderField to keep its cognitive
  // complexity low. They close over the EntityForm scope; per-field values
  // (f, label, isReadOnly) are passed in.
  const renderReadOnlyFk = (f, label) => (
    <div key={f.key} data-testid={`field-${f.key}`} className={LABEL_GAP}>
      <Label
        htmlFor={f.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {label}
      </Label>
      <Input
        id={f.key}
        name={f.key}
        value={resolveIdentifier(data, f.key) || data?.[f.key] || ''}
        disabled
        data-testid="Input__a8d626" />
    </div>
  );

  // Opt-in (decisions: `searchSelect: true`): the searchable combobox instead of the
  // plain pick-only dropdown. When the field also declares `allowCreate` + create target,
  // render the create-capable variant whose "+ create" action opens a name-only modal
  // (e.g. match-rule transaction type → ETGO_Transaction_Type). Only reached for editable
  // fields (renderSelectorField returns early when read-only).
  const renderSearchSelectField = (f, label, selectorOnChange, selectorUrl) => {
    const commonProps = {
      field: f,
      value: data?.[f.key] ?? '',
      displayValue: resolveIdentifier(data, f.key),
      onChange: selectorOnChange,
      formData: data,
      resolvedLabel: label,
      selectorUrl,
      selectorContext: effectiveSelectorContext,
      token,
      emptyOptionLabel: resolveUiKey(ui, f.emptyOptionLabelKey),
    };
    const canCreate = !!(f.allowCreate && f.createSpec && f.createEntity && apiBaseUrl);
    const createTitle = f.createTitleKey
      ? resolveUiKey(ui, f.createTitleKey)
      : (resolveUiKey(ui, f.createLabelKey) ?? '');
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, false, optionalSuffix, ui)}
        </Label>
        {canCreate ? (
          <InlineCreateSelector
            {...commonProps}
            apiBaseUrl={apiBaseUrl}
            createSpec={f.createSpec}
            createEntity={f.createEntity}
            createLabel={resolveUiKey(ui, f.createLabelKey)}
            createTitle={createTitle}
            namePlaceholder={resolveUiKey(ui, f.createNamePlaceholderKey)}
            data-testid="InlineCreateSelector__a8d626" />
        ) : (
          <CreatableSearchSelect {...commonProps} data-testid="CreatableSearchSelect__a8d626" />
        )}
      </div>
    );
  };

  const renderSelectorField = (f, label, isReadOnly) => {
    if (isReadOnly) return renderReadOnlyFk(f, label);
    const selectorOnChange = (val, lbl, auxData) => {
      onChange?.(f.key, val, f.column);
      if (lbl) onChange?.(f.key + '$_identifier', lbl);
      else if (!val) onChange?.(f.key + '$_identifier', '');
      if (auxData) applySelectorAuxData(auxData, onChange, f);
    };
    const selectorUrl = buildEntitySelectorUrl(apiBaseUrl, entity, f, api);
    if (f.searchSelect) {
      return renderSearchSelectField(f, label, selectorOnChange, selectorUrl);
    }
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
        </Label>
        <SelectorInput
          entityName={entity}
          field={f}
          value={data?.[f.key] ?? ''}
          displayValue={resolveIdentifier(data, f.key)}
          onChange={selectorOnChange}
          catalogs={catalogs}
          resolvedLabel={label}
          selectorUrl={selectorUrl}
          selectorContext={effectiveSelectorContext}
          token={token}
          data-testid="SelectorInput__a8d626" />
      </div>
    );
  };

  const renderSearchField = (f, label, isReadOnly) => {
    if (isReadOnly) return renderReadOnlyFk(f, label);
    const apiSelectorEntry = api?.selectors?.find(s => s.entity === entity && s.field === f.key);
    const selectorUrl = buildSearchSelectorUrl(apiBaseUrl, entity, f, apiSelectorEntry);
    const searchOnChange = (val, lbl, auxData) => {
      onChange?.(f.key, val, f.column);
      if (lbl) onChange?.(f.key + '$_identifier', lbl);
      else if (!val) onChange?.(f.key + '$_identifier', '');
      if (auxData) {
        const isGross = auxData.isTaxIncluded !== false;
        applyLookupAuxData(auxData, isGross, onChange, f);
      }
    };
    if (f.popup) {
      return (
        <PopupSearchField
          key={f.key}
          label={label}
          f={f}
          data={data}
          onChange={(val, lbl) => {
            onChange?.(f.key, val, f.column);
            if (lbl) onChange?.(f.key + '$_identifier', lbl);
          }}
          selectorUrl={selectorUrl}
          selectorContext={effectiveSelectorContext}
          token={token}
          data-testid="PopupSearchField__a8d626" />
      );
    }
    if (f.lookup) {
      return (
        <div key={f.key} className={LABEL_GAP}>
          <Label
            htmlFor={f.key}
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">
            {label}{requiredAsterisk(f)}
          </Label>
          <LookupFormField
            field={f}
            value={data?.[f.key] ?? ''}
            displayValue={data?.[f.key + '$_identifier']}
            selectorUrl={selectorUrl}
            selectorContext={effectiveSelectorContext}
            token={token}
            resolvedLabel={label}
            onChange={searchOnChange}
            data-testid="LookupFormField__a8d626" />
        </div>
      );
    }
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{requiredAsterisk(f)}
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
          selectorContext={effectiveSelectorContext}
          token={token}
          data-testid="SearchInput__a8d626" />
      </div>
    );
  };

  // Enum/list field (`type: 'select'` with options) opted into the searchable combobox:
  // local-filtered static options, no API call. Read-only renders a plain disabled input.
  const renderStaticCreatableSelect = (f, label, isReadOnly) => {
    const selOpt = f.options.find(o => o.value === (data?.[f.key] ?? ''));
    if (isReadOnly) {
      return (
        <div key={f.key} data-testid={`field-${f.key}`} className={LABEL_GAP}>
          <Label
            htmlFor={f.key}
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">{label}</Label>
          <Input
            id={f.key}
            name={f.key}
            value={selOpt ? tMenu(selOpt.label) : ''}
            disabled
            data-testid="Input__a8d626" />
        </div>
      );
    }
    const staticOpts = f.options.map(o => ({ id: o.value, name: tMenu(o.label) }));
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
        </Label>
        <CreatableSearchSelect
          field={f}
          value={data?.[f.key] ?? ''}
          displayValue={selOpt ? tMenu(selOpt.label) : ''}
          onChange={(id) => onChange?.(f.key, id, f.column)}
          resolvedLabel={label}
          staticOptions={staticOpts}
          data-testid="CreatableSearchSelect__a8d626" />
      </div>
    );
  };

  // Date field (DateField wrapper).
  const renderDateField = (f, label, isReadOnly) => (
    <div key={f.key} className={LABEL_GAP}>
      <Label
        htmlFor={f.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {label}{requiredAsteriskIfEditable(f, isReadOnly)}
      </Label>
      <DateField
        id={f.key}
        name={f.key}
        data-testid={`field-${f.key}`}
        value={data?.[f.key] ?? ''}
        onChange={(iso) => onChange?.(f.key, iso, f.column)}
        onBlur={() => onFieldBlur?.(f.key)}
        disabled={isReadOnly || savingField === f.key}
        required={f.required && !isReadOnly}
      />
    </div>
  );

  // Default single-line text/number input (the fall-through renderer).
  const renderInputField = (f, label, isReadOnly, displayValue) => (
    <div key={f.key} className={LABEL_GAP}>
      <Label
        htmlFor={f.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__a8d626">
        {label}{labelMarker(f, isReadOnly, optionalSuffix, ui)}
      </Label>
      <Input
        id={f.key}
        name={f.key}
        data-testid={`field-${f.key}`}
        type={getInputType(f)}
        value={getFieldValue(isReadOnly, displayValue, data, f)}
        onChange={(e) => onChange?.(f.key, e.target.value, f.column)}
        onBlur={() => onFieldBlur?.(f.key)}
        placeholder={!isReadOnly ? resolveUiKey(ui, f.placeholderKey) : undefined}
        className={getInputStateClass(isReadOnly)}
        required={f.required && !isReadOnly}
        disabled={isReadOnly || savingField === f.key}
      />
    </div>
  );

  // Multi-line text field. `rows` controls height; absent rows gets a min-height.
  const renderTextareaField = (f, label, isReadOnly, displayValue) => {
    const rowCount = f.rows ?? 4;
    const minHeightClass = f.rows ? '' : ' min-h-[96px]';
    const placeholder = !isReadOnly ? resolveUiKey(ui, f.placeholderKey) : undefined;
    return (
      <div key={f.key} className={LABEL_GAP}>
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium"
          data-testid="Label__a8d626">
          {label}{requiredAsteriskIfEditable(f, isReadOnly)}
        </Label>
        <textarea
          id={f.key}
          name={f.key}
          data-testid={`field-${f.key}`}
          rows={rowCount}
          value={getFieldValue(isReadOnly, displayValue, data, f)}
          onChange={(e) => onChange?.(f.key, e.target.value, f.column)}
          onBlur={() => onFieldBlur?.(f.key)}
          placeholder={placeholder}
          disabled={isReadOnly}
          className={[
            'flex w-full rounded-lg border border-[#D1D4DB] p-2 text-sm shadow-[0px_1px_2px_rgba(18,18,23,0.05)]',
            `placeholder:text-muted-foreground resize-none${minHeightClass}`,
            'focus:outline-none focus:ring-2 focus:ring-primary',
            'disabled:bg-muted/50 disabled:cursor-not-allowed',
            getReadOnlyBgClass(isReadOnly),
          ].join(' ')}
        />
      </div>
    );
  };

  // Dependent FK selector: options filtered by a parent field's value.
  const renderDependentField = (f, label, isReadOnly) => {
    if (isReadOnly) return renderReadOnlyFk(f, label);
    const fieldSelectorUrl = buildDependentSelectorUrl(apiBaseUrl, entity, f);
    const fieldOnChange = (val, lbl) => {
      onChange?.(f.key, val, f.column);
      if (lbl) onChange?.(f.key + '$_identifier', lbl);
      else if (!val) onChange?.(f.key + '$_identifier', '');
    };
    return (
      <DependentFkField
        key={f.key}
        f={f}
        label={label}
        data={data}
        onChange={fieldOnChange}
        selectorUrl={fieldSelectorUrl}
        selectorContext={effectiveSelectorContext}
        token={token}
        apiBaseUrl={apiBaseUrl}
        catalogs={catalogs}
        data-testid="DependentFkField__a8d626" />
    );
  };

  // YESNO checkbox. Values arrive as boolean true, 'Y' or 'true' (checked), or
  // false/'N'/'false'/null/undefined (unchecked) — plain `!!value` is wrong (`!!'N'` is true).
  const renderCheckboxField = (f, label, isReadOnly) => {
    const checked = data?.[f.key] === true || data?.[f.key] === 'Y' || data?.[f.key] === 'true';
    return (
      <div key={f.key} className="flex items-center gap-2 pt-6">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          disabled={isReadOnly}
          id={f.key}
          data-testid={`field-${f.key}`}
          onClick={() => !isReadOnly && onChange?.(f.key, !checked, f.column)}
          className={[
            'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
            'flex items-center justify-center',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            getCheckboxStateClass(checked),
          ].join(' ')}
        >
          {checked && (
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
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium cursor-pointer"
          data-testid="Label__a8d626">
          {label}
        </Label>
      </div>
    );
  };

  // A boolean field flagged `toggle` (grid cellType 'toggle') renders as the shared PillToggle
  // switch in its form position — same control as the grid, instead of a plain checkbox.
  const renderToggleField = (f, label, isReadOnly) => {
    const checked = data?.[f.key] === true || data?.[f.key] === 'Y' || data?.[f.key] === 'true';
    return (
      <div key={f.key} className="flex items-center gap-2 pt-6">
        <PillToggle
          checked={checked}
          disabled={isReadOnly}
          onCheckedChange={(next) => !isReadOnly && onChange?.(f.key, next, f.column)}
          id={f.key}
          data-testid={`field-${f.key}`} />
        <Label
          htmlFor={f.key}
          className="text-sm text-foreground font-medium cursor-pointer"
          data-testid="Label__a8d626">
          {label}
        </Label>
      </div>
    );
  };

  const renderField = (f) => {
    // Resolution order: per-window labels dict (locale-pinned) → AD_Field label → camelCase key
    const label = f.labels?.[locale] ?? f.labels?.en_US ?? t(f.column) ?? f.label ?? f.key;
    // Field is read-only if statically declared, dynamically set by evaluate-display, or readOnlyLogic evaluates to true
    const isReadOnly = formReadOnly
      || f.readOnly
      || displayLogic?.readOnly?.[f.key] === true
      || evalReadOnlyLogic(f, data);
    const rawDisplayValue = resolveIdentifier(data, f.key) ?? data?.[f.key] ?? '';
    // Strip floating-point noise (e.g. 243.20999999999998 → 243.21) for read-only number fields.
    // toFixed(10) preserves up to 10 significant decimal places while eliminating IEEE 754 drift.
    const displayValue = formatReadOnlyDisplayValue(f, isReadOnly, rawDisplayValue);
    if (f.type === 'checkbox' && f.toggle) {
      return renderToggleField(f, label, isReadOnly);
    }
    if (f.type === 'checkbox') {
      return renderCheckboxField(f, label, isReadOnly);
    }
    if (f.type === 'dependent') {
      return renderDependentField(f, label, isReadOnly);
    }
    if (f.type === 'selector') {
      // Currency selector on order header: use CurrencyRatePicker for searchable rate display
      if (
        f.column === 'C_Currency_ID' &&
        (entity === 'header' || entity === 'quotation') &&
        /\/(sales-order|purchase-order|sales-quotation)(\/|$)/.test(apiBaseUrl || '')
      ) {
        const isRateReadOnly = formReadOnly || f.readOnly || displayLogic?.readOnly?.[f.key] === true || evalReadOnlyLogic(f, data);
        return (
          <CurrencyRatePicker
            key={f.key}
            field={f}
            value={data?.[f.key] ?? ''}
            displayValue={resolveIdentifier(data, f.key)}
            onChange={onChange}
            formData={data}
            resolvedLabel={label}
            token={token}
            apiBaseUrl={apiBaseUrl}
            entityPath={entity}
            isReadOnly={isRateReadOnly}
            data-testid="CurrencyRatePicker__a8d626" />
        );
      }
      return renderSelectorField(f, label, isReadOnly);
    }
    if (f.type === 'search') {
      return renderSearchField(f, label, isReadOnly);
    }
    if (f.type === 'select' && f.options?.length && f.searchSelect) {
      return renderStaticCreatableSelect(f, label, isReadOnly);
    }
    if (isSelectFieldWithOptions(f)) {
      return renderSelectField(f, data, label, isReadOnly, onChange, { ui, tMenu, optionalSuffix });
    }
    if (f.type === 'textarea') {
      return renderTextareaField(f, label, isReadOnly, displayValue);
    }
    if (f.type === 'date') {
      return renderDateField(f, label, isReadOnly);
    }
    return renderInputField(f, label, isReadOnly, displayValue);
  };

  // ETP-3894: append an inline error message under any field whose key appears in
  // fieldErrors. Uses cloneElement so we don't have to thread the prop through every
  // branch in renderField — the wrapper <div key={f.key}> already exists for each.
  const renderFieldWithError = (f) => {
    const SPAN_CLASS = { 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' };
    const spanClass = f.span ? (SPAN_CLASS[f.span] ?? '') : '';

    if (f.type === 'image') {
      const label = t(f.column) ?? f.label ?? f.key;
      const isReadOnly = formReadOnly || f.readOnly || displayLogic?.readOnly?.[f.key] === true || evalReadOnlyLogic(f, data);
      const imageClass = [`${LABEL_GAP} row-span-2 flex flex-col`, spanClass].filter(Boolean).join(' ');
      return (
        <div key={f.key} className={imageClass}>
          <Label
            className="text-sm text-foreground font-medium"
            data-testid="Label__a8d626">{label}</Label>
          <ImageField
            imageId={data?.[f.key] ?? ''}
            onChange={(newId) => onChange?.(f.key, newId, f.column)}
            token={token}
            apiBaseUrl={apiBaseUrl}
            readOnly={isReadOnly}
            fieldKey={f.key}
            stretch
            data-testid="ImageField__a8d626" />
        </div>
      );
    }

    let node = renderField(f);
    const err = fieldErrors?.[f.key];

    // Append the field help text (if any) inside the field wrapper, below the input.
    // Done centrally here so every field branch gets help support without per-branch edits.
    if (f.help && React.isValidElement(node)) {
      const existing = node.props.children;
      node = React.cloneElement(
        node,
        { className: `${node.props.className ?? ''}`.trim() },
        existing,
        <FieldHelp key="__help" field={f} ui={ui} data-testid="FieldHelp__a8d626" />,
      );
    }

    if (err && React.isValidElement(node)) {
      const existing = node.props.children;
      node = React.cloneElement(
        node,
        { className: `${node.props.className ?? ''}`.trim() },
        existing,
        React.createElement(
          'p',
          { key: '__err', role: 'alert', className: 'text-xs text-red-500 mt-0.5', 'data-testid': `error-${f.key}` },
          err
        )
      );
    }

    if (spanClass && React.isValidElement(node)) {
      return React.cloneElement(node, { className: `${node.props.className ?? ''} ${spanClass}`.trim() });
    }

    return node;
  };

  if (imageField) {
    const imgLabel = imageField.label ?? t(imageField.column) ?? imageField.key;
    const imgReadOnly = formReadOnly
      || imageField.readOnly
      || displayLogic?.readOnly?.[imageField.key] === true
      || evalReadOnlyLogic(imageField, data);
    return (
      <div className="flex gap-6 items-stretch">
        <div className={`flex-1 min-w-0 ${gridClass}`} style={gridStyle}>
          {fieldsToRender.map(renderFieldWithError)}
        </div>
        <div className="shrink-0 w-64 flex flex-col">
          <ImageField
            imageId={data?.[imageField.key] ?? ''}
            onChange={(newId) => onChange?.(imageField.key, newId, imageField.column)}
            token={token}
            apiBaseUrl={apiBaseUrl}
            readOnly={imgReadOnly}
            fieldKey={imageField.key}
            label={imgLabel}
            stretch
            data-testid="ImageField__a8d626" />
        </div>
      </div>
    );
  }

  return (
    <div className={gridClass} style={gridStyle}>
      {displayFields.map(renderFieldWithError)}
    </div>
  );
}
