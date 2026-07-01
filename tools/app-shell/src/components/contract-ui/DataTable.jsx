import React, { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Inbox, X, ChevronDown, Trash2, Copy, Loader2, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useLabel, useUI, useLocale, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';
import { formatAmount } from '@/lib/formatAmount.js';
import { applyCalloutUpdates } from '@/lib/applyCalloutUpdates.js';
import { columnMinWidthPx, columnFlex } from '@/lib/linesColumnWidth.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CELL_RENDERERS } from './DataTable.cellRenderers.jsx';

// Extracts grow flag and basis (px) from a columnFlex() shorthand string.
function flexSpec(col, idx) {
  const [g, , b] = columnFlex(col, idx).split(' ');
  return { grow: parseInt(g, 10), basis: parseInt(b, 10) };
}
import { SelectorInput } from './SelectorInput.jsx';
import { InlineSearchCombo } from './InlineSearchCombo.jsx';
import RowQuickActions from './RowQuickActions.jsx';
import { trackSearchResultSelected } from '@/lib/productUsageTelemetry.js';
import { LOOKUP_DRAWERS } from './lookupDrawers.js';

/**
 * Resolve a value from an object using a dotted path (e.g. `_aux._LOC`).
 */
function getByPath(obj, path) {
  if (obj == null || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/**
 * Apply a field's declarative `onSelectMappings` after a lookup selection.
 * Each mapping copies a value from the selected `item` into another field on
 * the row, optionally with a display label resolved from one of several keys.
 * Replaces window-specific branches like `if (entity === 'internalConsumptionLine')`
 * with metadata declared in the contract.
 */
export function applyOnSelectMappings(field, item, handleChange) {
  const mappings = field?.onSelectMappings;
  if (!Array.isArray(mappings) || mappings.length === 0) return;
  for (const m of mappings) {
    if (!m?.from || !m.to) continue;
    const value = getByPath(item, m.from);
    if (value == null) continue;
    const labelKeys = getLabelArray(m);
    let label;
    for (const key of labelKeys) {
      const v = getByPath(item, key);
      if (v != null && v !== '') { label = v; break; }
    }
    handleChange(`${m.to}$_identifier`, label == null ? value : label);
    handleChange(m.to, value);
  }
}

/**
 * Get an array of label keys from a mapping object.
 */
function getLabelArray(m) {
  if (Array.isArray(m.labelFrom)) {
    return m.labelFrom;
  }
  return m.labelFrom ? [m.labelFrom] : [];
}

/**
 * Build display-override maps for every column whose contract field declares
 * `displayFromCatalog: true`. For each such column we read its add-row catalog
 * options and produce a `Map<optionId, optionLabel>`, used by `renderCellValue`
 * to swap a raw FK id for its catalog label (e.g. show warehouse name instead
 * of locator id). Without the flag, no map is built and nothing changes.
 */
export function buildDisplayCatalogMaps(visibleColumns, addRow, entity) {
  const out = new Map();
  const fields = addRow?.fields || [];
  const catalogs = addRow?.catalogs;
  if (!entity || !catalogs || fields.length === 0) return out;
  for (const col of visibleColumns) {
    const field = fields.find(f => f.key === col.key);
    if (!field?.displayFromCatalog) continue;
    const options = getCatalogOptions(catalogs, entity, field);
    if (!options || options.length === 0) continue;
    const map = new Map();
    for (const opt of options) {
      if (!opt?.id) continue;
      map.set(String(opt.id), opt.name || opt.label || opt._identifier || String(opt.id));
    }
    if (map.size > 0) out.set(col.key, map);
  }
  return out;
}


const INLINE_ADD_IGNORED_PORTAL_SELECTORS = [
  '[role="dialog"]',
  '[data-inline-add-portal="true"]',
  '[role="listbox"]',
  '[data-radix-popper-content-wrapper]',
];

function isClickInsideIgnoredPortal(target) {
  if (!(target instanceof Element)) return false;
  return INLINE_ADD_IGNORED_PORTAL_SELECTORS.some(sel => target.closest(sel));
}

function applyLocalSearch(rows, filters, searchQuery) {
  if (!searchQuery) return rows;
  const q = searchQuery.toLowerCase();
  return rows.filter(row =>
    filters.some(key => String(resolveIdentifier(row, key) ?? '').toLowerCase().includes(q)),
  );
}

async function runInlineToggleRequest({
  apiBaseUrl, entity, row, col, token, checked,
  toggleKey, setOptimisticToggles, setSavingToggles, onDataMutated,
}) {
  setOptimisticToggles(prev => ({ ...prev, [toggleKey]: checked }));
  setSavingToggles(prev => ({ ...prev, [toggleKey]: true }));
  try {
    const res = await fetch(`${apiBaseUrl}/${entity}/${row.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ [col.key]: checked }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    onDataMutated?.();
  } catch (error) {
    setOptimisticToggles(prev => {
      const next = { ...prev };
      delete next[toggleKey];
      return next;
    });
    toast.error(error?.message || 'Failed to update record');
  } finally {
    setSavingToggles(prev => {
      const next = { ...prev };
      delete next[toggleKey];
      return next;
    });
  }
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
          <Skeleton key={col.key} className="h-4 flex-1" data-testid="Skeleton__eb5261" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-2">
          {columns.map(col => (
            <Skeleton
              key={col.key}
              className="h-8 flex-1"
              style={{ opacity: 1 - i * 0.15 }}
              data-testid="Skeleton__eb5261" />
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
      <Inbox className="h-10 w-10 mb-3 opacity-40" data-testid="Inbox__eb5261" />
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

const NUMERIC_FIELD_TYPES = new Set(['number', 'integer', 'decimal', 'quantity', 'amount']);

function isMissingRequired(f, valuesRef, fields = []) {
  if (!f.required) return false;
  // A boolean/checkbox always carries a valid value (false = deliberately
  // unchecked), so it can never be "missing". Mirrors the header guard in
  // useEntity.handleSave and stops a required checkbox left off (e.g. a journal
  // line's Open Items) from blocking the row.
  if (f.type === 'checkbox' || f.type === 'boolean') return false;
  const hasVal = (key) => {
    const v = valuesRef.current[key];
    return !(v == null || v === '' || (typeof v === 'string' && v.trim() === ''));
  };
  if (hasVal(f.key)) return false;
  // clearsField forms a mutually-exclusive group (e.g. a journal line is a debit
  // OR a credit, never both). The requirement is "one of the group", so the empty
  // member must not be flagged while a sibling it clears — or that clears it —
  // carries a value.
  if (f.clearsField && hasVal(f.clearsField)) return false;
  for (const g of fields) {
    if (g.clearsField === f.key && hasVal(g.key)) return false;
  }
  return true;
}

function isBelowMin(f, valuesRef) {
  if (f.min === undefined) return false;
  const v = valuesRef.current[f.key];
  if (v == null || v === '') return false;
  return !isNaN(Number(v)) && Number(v) < f.min;
}

function buildSelectorUrl(apiBaseUrl, entity, field) {
  return apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${field.column}` : null;
}

function displayOrDash(displayVal) {
  return displayVal != null && displayVal !== '' ? displayVal : '—';
}

function getNumericCellAlignClass(isNumeric) {
  return isNumeric ? ' text-right tabular-nums' : '';
}

function resolveNumericInputMode(field, isNumeric) {
  let numericInputMode = field.inputMode;
  if (!numericInputMode && isNumeric) {
    numericInputMode = field.type === 'integer' ? 'numeric' : 'decimal';
  }
  return numericInputMode;
}

function formatNumericInputValue(isTwoDecimal, rawValue, formatTwoDecimals) {
  return isTwoDecimal && rawValue !== '' && rawValue != null
    ? formatTwoDecimals(rawValue)
    : (rawValue ?? '');
}

function isLookupSearchField(field) {
  return field.type === 'search' && field.lookup;
}

function isStaticSelectField(field) {
  return field.type === 'select' && field.options?.length;
}

/**
 * Renders the inline-add-row cell for a `selector` field. When the catalog has
 * pre-loaded options it shows a Radix <Select>; otherwise it falls back to the
 * lazy-loading <InlineSearchCombo> backed by the selector URL.
 */
function renderSelectorCell({
  catalogs, entity, field, apiBaseUrl, col, values, touchedFieldsRef,
  handleChange, handleFieldChange, handleKeyDown, isFirst, firstInputRef,
  fieldLabel, selectorContext, token,
}) {
  const allOptions = getCatalogOptions(catalogs, entity, field);
  const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
  // Exclude the option equal to the current value of a sibling field on this add-line row
  // (e.g. newStorageBin can't equal storageBin). Applies to both the URL-backed combo and
  // the preloaded-catalog dropdown.
  const excludeId = field.excludeValueOf ? (values[field.excludeValueOf] ?? null) : null;
  const options = excludeId != null ? allOptions.filter(o => o.id !== excludeId) : allOptions;

  if (options.length === 0) {
    if (!selectorUrl) return (
      <TableCell
        key={col.key}
        className="py-1 px-2"
        data-testid={"TableCell__" + field.id} />
    );
    return (
      <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
        <InlineSearchCombo
          field={field}
          value={values[field.key] ?? ''}
          displayLabel={values[field.key + '$_identifier'] || ''}
          options={[]}
          onChange={(id, label, selectedItem) => {
            touchedFieldsRef.current.add(field.key);
            handleChange(field.key + '$_identifier', label || '');
            handleFieldChange(field.key, id, selectedItem);
          }}
          onKeyDown={handleKeyDown}
          inputRef={isFirst ? firstInputRef : undefined}
          placeholder={fieldLabel}
          selectorUrl={selectorUrl}
          selectorContext={selectorContext}
          excludeId={excludeId}
          token={token}
          data-testid={"InlineSearchCombo__" + field.id} />
      </TableCell>
    );
  }
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <Select
        value={values[field.key] || undefined}
        onValueChange={(val) => {
          if (val === '__empty__') {
            handleChange(field.key + '$_identifier', '');
            handleFieldChange(field.key, '', null);
            return;
          }
          const opt = options.find(o => o.id === val);
          if (opt) {
            handleChange(field.key + '$_identifier', opt.name || opt.label || opt._identifier || '');
          }
          handleFieldChange(field.key, val, opt);
        }}
        data-testid={"Select__" + field.id}>
        <SelectTrigger
            ref={isFirst ? firstInputRef : undefined}
            data-testid={`inline-add-field-${field.key}`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleKeyDown(e);
            }}
            className="w-full h-8 text-sm bg-white focus:ring-2 focus:ring-primary"
        >
          <SelectValue placeholder={fieldLabel} data-testid={"SelectValue__" + field.id} />
        </SelectTrigger>
        <SelectContent data-testid={"SelectContent__" + field.id}>
          <SelectItem value="__empty__" data-testid={"SelectItem__" + field.id}>&nbsp;</SelectItem>
          {options.map(opt => (
              <SelectItem key={opt.id} value={opt.id} data-testid={"SelectItem__" + field.id}>{opt.name || opt.label || opt._identifier || opt.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TableCell>
  );
}

// Two-decimal display formatter for amount/price inputs. Pure (only reads `raw`),
// kept at module scope so it doesn't count against renderInputCell's complexity.
function formatTwoDecimals(raw) {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
  return Number.isFinite(n) ? n.toFixed(2) : raw;
}

function renderInputCell({
  field, col, values, invalidFields, isFirst, firstInputRef,
  handleFieldChange, handleKeyDown, fieldLabel,
}) {
  const isNumeric = NUMERIC_FIELD_TYPES.has(field.type);
  const isTwoDecimal = field.type === 'amount' || field.type === 'price';
  // Numeric `inputMode` only for numeric fields — integers get the digits-only
  // on-screen keyboard, the rest the decimal pad (Sonar S3358: flat conditional).
  const numericInputMode = resolveNumericInputMode(field, isNumeric);
  const displayValue = formatNumericInputValue(isTwoDecimal, values[field.key], formatTwoDecimals);
  // Unambiguous partial-number patterns: no two adjacent unbounded `\d*`, so no
  // super-linear backtracking (ReDoS-safe). Integer -> digits; decimal -> digits
  // then an optional `.digits` group. Raw strings are kept while typing so
  // in-progress decimals ("1.") survive; numeric coercion happens at commit.
  const partialPattern = field.type === 'integer' ? /^-?\d*$/ : /^-?\d*(?:\.\d*)?$/;
  const onChange = (e) => {
    const raw = e.target.value;
    if (!isNumeric || raw === '' || partialPattern.test(raw)) {
      handleFieldChange(field.key, raw);
    }
  };
  const onBlur = isNumeric
    ? () => {
        const raw = values[field.key];
        if (raw === '' || raw == null) {
          // Empty numeric → restore defaultValue (or min) so the POST body never
          // omits the field and lets the backend apply a wrong implicit default.
          if (field.defaultValue !== undefined) handleFieldChange(field.key, String(field.defaultValue));
          else if (field.min !== undefined) handleFieldChange(field.key, String(field.min));
          return;
        }
        const num = Number(raw);
        if (isNaN(num)) return;
        if (field.max !== undefined && num > field.max) handleFieldChange(field.key, String(field.max));
        if (field.min !== undefined && num < field.min) handleFieldChange(field.key, String(field.min));
      }
    : undefined;
  // Always type="text" — numeric type renders spinner buttons; the numeric
  // on-screen keyboard is preserved via inputMode.
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <input
        data-testid={`inline-add-field-${field.key}`}
        ref={isFirst ? firstInputRef : undefined}
        type="text"
        inputMode={numericInputMode}
        value={displayValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={fieldLabel}
        required={field.required}
        className={`w-full h-8 text-sm rounded-md border bg-white px-2 focus:ring-2 focus:outline-none${isNumeric ? ' text-right tabular-nums' : ''}${invalidFields.has(field.key) ? ' border-red-500 focus:ring-red-500' : ' border-input focus:ring-primary'}`}
      />
    </TableCell>
  );
}

/**
 * Inline editable row rendered at the bottom of the table for rapid line entry.
 * Controlled by the `addRow` prop on DataTable.
 */
// Stable empty seed: a fresh `{}` default would change identity every render and
// make buildEmpty's effect re-run, wiping in-progress input. Share one frozen ref.
const EMPTY_SEED = {};

const InlineAddRow = forwardRef(function InlineAddRow({ columns, fields, onAdd, onCancel, data, catalogs, onFieldChange, onValuesChange, selectable, hasDeleteColumn, hasCloneColumn, hoverRowActions, hoverRowHasDelete, hasQuickActionsColumn, token, apiBaseUrl, entity, selectorContext, seedValues = EMPTY_SEED, resolvedDefaults = EMPTY_SEED, ilpHasNoAmountCol = false, ilpTrailing = false, labelOverrides }, ref) {
  const t = useLabel(labelOverrides);
  const ui = useUI();
  const { locale } = useLocaleSwitch();
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
      if (f.key === 'lineNo') {
        empty[f.key] = defaultLineNo;
      } else if (f.defaultValue !== undefined && !/^@[^@]+@$/.test(String(f.defaultValue))) {
        empty[f.key] = f.defaultValue;
      } else {
        empty[f.key] = '';
      }
    }
    // Seed display-only (non-editable) columns — e.g. a parent-derived currency —
    // so they render their value immediately instead of "—" until the row is saved.
    // Editable fields are never overwritten; the seed only fills keys with no input.
    for (const [key, val] of Object.entries(seedValues)) {
      if (!fieldMap[key]) empty[key] = val;
    }
    // HandleDefaults: fill EMPTY editable fields from backend-resolved line
    // defaults (e.g. a macro default like @DESCRIPTION1@ → the parent's value).
    // Fill-empties-only: never override a literal default, the client lineNo, a
    // display seed, or a field opted out via skipDefault.
    for (const [key, val] of Object.entries(resolvedDefaults)) {
      const f = fieldMap[key];
      if (!f || f.skipDefault) continue;
      const cur = empty[key];
      if ((cur == null || cur === '') && val != null && val !== '') {
        empty[key] = val;
      }
    }
    return empty;
  }, [fields, defaultLineNo, seedValues, fieldMap, resolvedDefaults]);

  const [values, setValues] = useState(buildEmpty);
  const [isSaving, setIsSaving] = useState(false);
  const [invalidFields, setInvalidFields] = useState(new Set());
  const firstInputRef = useRef(null);
  const rowRef = useRef(null);
  const touchedFieldsRef = useRef(new Set());
  const inflightRef = useRef(null);
  const valuesRef = useRef(null);
  const pendingCalloutsRef = useRef([]);

  // Keep valuesRef in sync on every render so submitLine never reads a stale closure.
  valuesRef.current = values;

  // Reset values when fields or data change
  useEffect(() => {
    const empty = buildEmpty();
    valuesRef.current = empty;
    pendingCalloutsRef.current = [];
    setValues(empty);
    touchedFieldsRef.current = new Set();
  }, [buildEmpty]);

  // Notify parent on every values change so it can compute live totals (pendingLine).
  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  // Auto-focus first input when row appears. preventScroll avoids the browser's
  // instant snap-to-input scroll, leaving the parent's smooth scroll animation
  // (DetailView linesScrollRef) free to run without being preempted.
  useEffect(() => {
    firstInputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleChange = (key, val) => {
    valuesRef.current = { ...valuesRef.current, [key]: val };
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const submitLine = useCallback(({ closeAfterSave = false } = {}) => {
    // Dedupe concurrent submits: outside-click + parent flushPendingLines can fire
    // in the same tick; both callers must observe the same outcome.
    if (inflightRef.current) return inflightRef.current;
    // Validate required fields BEFORE entering the in-flight state — a missing
    // value should leave the row open for the user to complete. Reads from the
    // valuesRef so an in-flight callout cannot mask a still-empty user field.
    const missing = fields.filter(f => isMissingRequired(f, valuesRef, fields));
    if (missing.length > 0) {
      setInvalidFields(new Set(missing.map(f => f.key)));
      toast.error(ui('requiredFieldsMissing'));
      const firstMissing = missing[0];
      const inputEl = document.querySelector(`[data-testid="field-${firstMissing.key}"]`);
      inputEl?.focus?.({ preventScroll: true });
      return Promise.resolve(false);
    }
    // Clamp any above-max values before validation so submitLine is consistent
    // with the onBlur autocorrect (guards the mousedown-before-blur race).
    for (const f of fields) {
      if (f.max === undefined) continue;
      const num = Number(valuesRef.current[f.key]);
      if (!isNaN(num) && num > f.max) valuesRef.current = { ...valuesRef.current, [f.key]: String(f.max) };
    }
    const belowMin = fields.filter(f => isBelowMin(f, valuesRef));
    if (belowMin.length > 0) {
      setInvalidFields(new Set(belowMin.map(f => f.key)));
      toast.error(ui('fieldMinValueError'));
      const firstInvalid = belowMin[0];
      const inputEl = document.querySelector(`[data-testid="field-${firstInvalid.key}"]`);
      inputEl?.focus?.({ preventScroll: true });
      return Promise.resolve(false);
    }
    setIsSaving(true);
    const run = (async () => {
      try {
        // Wait for any in-flight callouts (e.g. product → taxRate → lineGrossAmount)
        // before reading values. Without this, pressing Enter immediately after
        // selecting a product would POST with taxRate=null and lineGrossAmount=0.
        if (pendingCalloutsRef.current.length > 0) {
          await Promise.all(pendingCalloutsRef.current);
        }
        // Read from ref (always current) instead of the stale `values` closure.
        const coercedValues = coerceFieldValues(valuesRef, fields);

        const result = await onAdd(coercedValues);
        if (result === false || result == null) {
          return false;
        }
        if (closeAfterSave) {
          onCancel();
          return true;
        }
        // Reset for next rapid entry — recompute lineNo
        const nums = [...(data || []).map(r => Number(r.lineNo) || 0), Number(valuesRef.current.lineNo) || 0];
        const nextLineNo = Math.max(...nums) + 10;
        const next = {};
        for (const f of fields) {
          if (f.key === 'lineNo') {
            next[f.key] = nextLineNo;
          } else if (f.defaultValue === undefined) {
            next[f.key] = '';
          } else {
            next[f.key] = f.defaultValue;
          }
        }
        // Clear any $_identifier companion values
        for (const key of Object.keys(valuesRef.current)) {
          if (key.includes('$_identifier') && !(key in next)) {
            next[key] = '';
          }
        }
        // Re-apply seeded display values so a parent-derived column (e.g. currency)
        // stays populated for the next rapid entry instead of resetting to "—".
        // Runs after the $_identifier clearing loop so seeded identifiers survive.
        for (const [key, val] of Object.entries(seedValues)) {
          if (!fieldMap[key]) next[key] = val;
        }

        valuesRef.current = next;
        setValues(next);
        touchedFieldsRef.current = new Set();
        // Re-focus first input for rapid entry
        setTimeout(() => firstInputRef.current?.focus({ preventScroll: true }), 0);
        return true;
      } finally {
        inflightRef.current = null;
        setIsSaving(false);
      }
    })();
    inflightRef.current = run;
    return run;
  }, [data, fields, onAdd, onCancel, ui, seedValues, fieldMap]);

  // Enter → confirm without closing (rapid entry). Outside-click / parent flush close.
  const handleConfirm = useCallback(() => submitLine({ closeAfterSave: false }), [submitLine]);

  // Expose imperative flush for parent (e.g. auto-commit pending line on header Save).
  // If no field has been touched, silently cancel. Otherwise confirm and return success.
  useImperativeHandle(ref, () => ({
    flush: async ({ closeAfterSave = true } = {}) => {
      if (inflightRef.current) {
        return (await inflightRef.current) !== false;
      }
      if (touchedFieldsRef.current.size === 0) {
        onCancel();
        return true;
      }
      const ok = await submitLine({ closeAfterSave });
      return ok !== false;
    },
    setFieldValues: (updates) => {
      setValues(prev => ({ ...prev, ...updates }));
    },
  }), [onCancel, submitLine]);

  // Auto-commit when the user clicks outside the row (mirrors the green-check behavior).
  // Skips clicks inside the row itself, inside any open dialog/drawer (role="dialog"),
  // and inside whitelisted portals (combo dropdown marked with data-inline-add-portal).
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rowRef.current?.contains(target)) return;
      // Skip whitelisted portals: open dialog/drawer, inline-add combo portal, and
      // Radix Select dropdowns (rendered outside the row via portal). Treating
      // these as part of the row prevents silent saves when the user is still
      // interacting with a popover/listbox (e.g. switching the tax).
      if (isClickInsideIgnoredPortal(target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (inflightRef.current) return;
      if (touchedFieldsRef.current.size === 0) {
        onCancel();
      } else {
        submitLine({ closeAfterSave: true }).catch((err) => {
          // Errors are surfaced to the user via toast inside onAdd; log for diagnostics.
          console.error('Failed to submit inline line on outside click:', err);
        });
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onCancel, submitLine]);

  // Wrap handleChange to also notify parent (for callout triggering)
  const handleFieldChange = useCallback((key, val, selectedItem) => {
    touchedFieldsRef.current.add(key);
    setInvalidFields(prev => {
      if (!prev.has(key)) return prev;
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
    // Build a snapshot of current + new values for the callout formState
    const snapshot = { ...values, [key]: val };
    handleChange(key, val);
    // Mutual-exclusion: zero the paired field when a non-zero value is entered (e.g. debit ↔ credit).
    // Use '0' not '' so the sibling still passes required-field validation.
    // Gate on a FINITE non-zero value: renderInputCell permits partial numeric
    // input ('-', '.', '-.') where Number(val) is NaN — without the isFinite
    // check the paired field would be cleared mid-typing.
    const clearsKey = fieldMap[key]?.clearsField;
    const clearsNumVal = Number(val);
    if (clearsKey && val !== '' && val !== null && val !== undefined
        && Number.isFinite(clearsNumVal) && clearsNumVal !== 0) {
      handleChange(clearsKey, '0');
      snapshot[clearsKey] = '0';
    }
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
      updateSnapshotWithSelectedItem(selectedItem, snapshot, handleChange, touchedFieldsRef, key);
    }
    // Notify parent for callout execution — pass computed snapshot (not stale React state).
    // applyUpdates updates valuesRef synchronously so submitLine always reads the latest
    // values even if React hasn't re-rendered yet when Enter is pressed.
    const calloutPromise = onFieldChange?.(key, val, snapshot, (updates, forceFields = new Set()) => {
      // Don't let the callout overwrite the field being typed: a cascade can echo
      // it back normalized (e.g. rate "11." -> 11), erasing in-progress decimals.
      const derived = { ...updates };
      delete derived[key];
      const next = applyCalloutUpdates(valuesRef.current, derived, forceFields, key, touchedFieldsRef.current);
      valuesRef.current = next;
      setValues(next);
    });
    if (calloutPromise instanceof Promise) {
      pendingCalloutsRef.current.push(calloutPromise);
      calloutPromise.finally(() => {
        pendingCalloutsRef.current = pendingCalloutsRef.current.filter(p => p !== calloutPromise);
      });
    }
  }, [handleChange, onFieldChange, values, fieldMap]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  let firstInputAssigned = false;

  return (
    <TableRow ref={rowRef} data-testid="inline-add-row" className="bg-blue-50/50 border-t-2 border-primary/20">
      {/* Saving spinner — aligned with selection checkbox column (empty when idle). */}
      {selectable && (
        <TableCell className="w-10 px-1" data-testid="TableCell__eb5261">
          <div className="flex items-center justify-center h-7">
            {isSaving && <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-label="Saving line"
              data-testid="Loader2__eb5261" />}
          </div>
        </TableCell>
      )}
      {columns.map(col => {
        const field = fieldMap[col.key];
        const fieldLabel = getFieldLabel(field, t, col, locale);
        if (!field) {
          // Show callout-derived values if available, otherwise dash.
          // Prefer $_identifier (human-readable) over raw ID for FK fields.
          const rawVal = values[col.key];
          const identVal = values[col.key + '$_identifier'];
          const isNumericDerived = NUMERIC_FIELD_TYPES.has(col.type);
          const isTwoDecimalDerived = col.type === 'amount' || col.type === 'price';
          let displayVal = formatDerivedCellValue(identVal, rawVal, isTwoDecimalDerived);
          return (
            <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className={`text-muted-foreground text-sm${(getNumericCellAlignClass(isNumericDerived))}`}>
              {displayOrDash(displayVal)}
            </TableCell>
          );
        }
        const isFirst = !firstInputAssigned;
        if (isFirst) firstInputAssigned = true;

        // Lookup fields: click to open search modal (no inline combo)
        if (isLookupSearchField(field)) {
          const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
          const displayLabel = values[field.key + '$_identifier'] || '';
          const drawerKey = field.lookupDrawer || 'default';
          const lookupTitle = field.lookupTitle || fieldLabel;
          return (
            <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
              <LookupField
                value={displayLabel}
                fieldKey={field.key}
                placeholder={fieldLabel}
                selectorUrl={selectorUrl}
                selectorContext={selectorContext}
                token={token}
                inputRef={isFirst ? firstInputRef : undefined}
                isInvalid={invalidFields.has(field.key)}
                onSelect={(item) => {
                  touchedFieldsRef.current.add(field.key);
                  handleChange(field.key + '$_identifier', item.label || item.name || item._identifier);
                  handleFieldChange(field.key, item.id, item);
                  // Declarative auto-fill from the contract — see field.onSelectMappings.
                  applyOnSelectMappings(field, item, handleChange);
                }}
                onKeyDown={handleKeyDown}
                title={lookupTitle}
                drawerKey={drawerKey}
                data-testid="LookupField__eb5261" />
            </TableCell>
          );
        }

        // Search fields render as compact combobox (text input + filtered dropdown)
        if (field.type === 'search') {
          const options = getCatalogOptions(catalogs, entity, field);
          const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
          // Declarative exclusion: drop the live value of a sibling field from this
          // selector (e.g. To Currency must differ from the document/From Currency).
          const excludeId = field.excludeValueOf ? (values[field.excludeValueOf] ?? null) : null;
          return (
            <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
              <InlineSearchCombo
                field={field}
                value={values[field.key] ?? ''}
                displayLabel={values[field.key + '$_identifier'] || ''}
                options={options}
                excludeId={excludeId}
                inputRef={isFirst ? firstInputRef : undefined}
                placeholder={fieldLabel}
                onChange={(id, label, selectedItem) => {
                  touchedFieldsRef.current.add(field.key);
                  handleChange(field.key + '$_identifier', label);
                  handleFieldChange(field.key, id, selectedItem);
                }}
                onKeyDown={handleKeyDown}
                selectorUrl={selectorUrl}
                selectorContext={selectorContext}
                token={token}
                data-testid="InlineSearchCombo__eb5261" />
            </TableCell>
          );
        }

        // Select fields with inline static options array
        if (isStaticSelectField(field)) {
          return (
            <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
              <Select
                value={values[field.key] || undefined}
                onValueChange={(val) => handleFieldChange(field.key, val === '__empty__' ? '' : val)}
                required={field.required}
                data-testid="Select__eb5261">
                <SelectTrigger
                  ref={isFirst ? firstInputRef : undefined}
                  data-testid={`inline-add-field-${field.key}`}
                  onKeyDown={(e) => { if (e.key === 'Escape') handleKeyDown(e); }}
                  className="w-full h-8 text-sm bg-white focus:ring-2 focus:ring-primary"
                >
                  <SelectValue placeholder={field.label ?? field.key} data-testid="SelectValue__eb5261" />
                </SelectTrigger>
                <SelectContent data-testid="SelectContent__eb5261">
                  {!field.required && <SelectItem value="__empty__" data-testid="SelectItem__eb5261">&nbsp;</SelectItem>}
                  {field.options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} data-testid="SelectItem__eb5261">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          );
        }

        // Selector fields render as native <select> dropdowns (few options).
        // When catalog options are not pre-loaded, render the shared SelectorInput
        // (Radix-based dropdown that lazy-loads from the selector URL). It does NOT
        // accept free-text typing — the user has to pick from the list, matching the
        // form-mode UX. Mirrors the InlineAddRow behavior for the line tax field.
        if (field.type === 'selector') {
          return renderSelectorCell({
            catalogs, entity, field, apiBaseUrl, col, values, touchedFieldsRef,
            handleChange, handleFieldChange, handleKeyDown, isFirst, firstInputRef,
            fieldLabel, selectorContext, token,
          });
        }

        return renderInputCell({
          field, col, values, invalidFields, isFirst, firstInputRef,
          handleFieldChange, handleKeyDown, fieldLabel,
        });
      })}
      {/* Skip action cells in inlineEditable add-row mode — actions belong to
          InlineLinesPanel's 160px slot, not to separate columns here. */}
      {!ilpTrailing && (hoverRowActions ? (
        <>
          <TableCell className="w-10" data-testid="TableCell__eb5261" />
          {hoverRowHasDelete && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
        </>
      ) : (
        <>
          {hasDeleteColumn && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
          {hasCloneColumn && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
        </>
      ))}
      {!ilpTrailing && hasQuickActionsColumn && <TableCell className="w-10" data-testid="TableCell__eb5261" />}
      {ilpHasNoAmountCol && <TableCell aria-hidden="true" data-testid="TableCell__eb5261" />}
      {ilpTrailing && <TableCell aria-hidden="true" data-testid="TableCell__eb5261" />}
    </TableRow>
  );
});

function getFieldLabel(field, t, col, locale) {
  const f = field ?? col;
  const pinned = f?.labels?.[locale] ?? f?.labels?.en_US;
  if (pinned) return pinned;
  return field ? (t(field.column) ?? field.label ?? field.key) : (t(col.column) ?? col.label ?? col.key);
}

function formatDerivedCellValue(identVal, rawVal, isTwoDecimalDerived) {
  let displayVal = identVal || rawVal;
  if (isTwoDecimalDerived && displayVal != null && displayVal !== '') {
    const n = typeof displayVal === 'string' ? Number.parseFloat(displayVal) : displayVal;
    if (Number.isFinite(n)) displayVal = n.toFixed(2);
  }
  return displayVal;
}

function updateSnapshotWithSelectedItem(selectedItem, snapshot, handleChange, touchedFieldsRef, key) {
  for (const [topField, topVal] of Object.entries(selectedItem)) {
    if (topField === 'id' || topField === '_aux' || topField === 'label'
      || topField === 'name' || topField === 'searchKey'
      || typeof topVal === 'object' || topVal === null) continue;
    // Price from the document's price list. Mapping depends on price list type:
    //   - Gross list (isTaxIncluded=true): standardPrice is the gross price → grossUnitPrice
    //   - Net list   (isTaxIncluded=false): standardPrice is the net price   → unitPrice
    // Mark the target field as touched so the callout does not overwrite it (some callouts
    // look up the price themselves and may return a different value from another price list).
    if (topField === 'standardPrice' && topVal != null) {
      const isGross = selectedItem?.isTaxIncluded !== false;
      if (isGross) {
        snapshot['grossUnitPrice'] = topVal;
        handleChange('grossUnitPrice', topVal);
        snapshot['grossListPrice'] = topVal;
        handleChange('grossListPrice', topVal);
        touchedFieldsRef.current.add('grossUnitPrice');
        touchedFieldsRef.current.add('grossListPrice');
      } else {
        snapshot['unitPrice'] = topVal;
        handleChange('unitPrice', topVal);
        snapshot['listPrice'] = topVal;
        handleChange('listPrice', topVal);
        touchedFieldsRef.current.add('unitPrice');
        touchedFieldsRef.current.add('listPrice');
      }
      continue;
    }
    const ctxKey = `${key}_${topField}`;
    if (!(ctxKey in snapshot)) {
      // Keep display hints only in the callout snapshot.
      // Persisting these transient keys in row state can leak them into POST payloads.
      snapshot[ctxKey] = topVal;
    }
  }
}

function resolveNumericFieldValue(f, val) {
  if (val === '' || val == null) {
    if (f.defaultValue !== undefined) return f.defaultValue;
    if (f.min !== undefined) return f.min;
    return val;
  }
  const raw = String(val);
  const parsed = f.type === 'integer' ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  return Number.isNaN(parsed) ? val : parsed;
}

function coerceFieldValues(valuesRef, fields) {
  const coercedValues = { ...valuesRef.current };
  for (const f of fields) {
    if (!NUMERIC_FIELD_TYPES.has(f.type)) continue;
    coercedValues[f.key] = resolveNumericFieldValue(f, coercedValues[f.key]);
  }
  return coercedValues;
}

/**
 * Inline field that shows selected value and opens modal on click/focus.
 */
function LookupField({ value, fieldKey, placeholder, selectorUrl, selectorContext, token, onSelect, onKeyDown, inputRef, title, drawerKey = 'default', isInvalid }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const Drawer = LOOKUP_DRAWERS[drawerKey] || LOOKUP_DRAWERS.default;

  // Forward ref so parent can focus this field
  useEffect(() => {
    if (inputRef) inputRef.current = btnRef.current;
  }, [inputRef]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid={fieldKey ? `inline-add-field-${fieldKey}` : undefined}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          // Once a value is selected, Enter should bubble up so the row's
          // handleKeyDown can save the line. Space still re-opens the picker
          // for re-selection.
          if (e.key === 'Enter' && value) {
            if (onKeyDown) onKeyDown(e);
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
          else if (onKeyDown) onKeyDown(e);
        }}
        className={`w-full h-8 text-sm rounded-md border bg-white px-2 text-left flex items-center gap-2 focus:ring-2 focus:outline-none transition-colors${isInvalid ? ' border-red-500 focus:ring-red-500' : ' border-input hover:border-primary/50 focus:ring-primary'}`}
      >
        <Search
          className="h-3.5 w-3.5 text-muted-foreground shrink-0"
          data-testid="Search__eb5261" />
        {value ? (
          <span className="truncate text-foreground">{value}</span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          onSelect(item);
          setOpen(false);
          // Restore focus to the field button so keyboard users do not lose
          // tab position after the picker closes (Enter then saves the row).
          setTimeout(() => btnRef.current?.focus(), 0);
        }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={title || undefined}
        data-testid="Drawer__eb5261" />
    </>
  );
}

/**
 * Small button that opens the default product lookup drawer for lookup-enabled fields.
 */
function LookupButton({ selectorUrl, selectorContext, token, onSelect, title }) {
  const [open, setOpen] = useState(false);
  const DefaultDrawer = LOOKUP_DRAWERS.default;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 w-8 flex items-center justify-center rounded border border-input hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={title || ''}
      >
        <Search className="h-3.5 w-3.5" data-testid="Search__eb5261" />
      </button>
      <DefaultDrawer
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onSelect(item); setOpen(false); }}
        selectorUrl={selectorUrl}
        selectorContext={selectorContext}
        token={token}
        title={title || undefined}
        data-testid="ProductSearchDrawer__eb5261" />
    </>
  );
}

function computeSelectionState(filteredData, selectedRows, isRowSelectable) {
  const allSelected = filteredData.length > 0 && selectedRows.size === filteredData.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const selectableData = isRowSelectable ? filteredData.filter(isRowSelectable) : filteredData;
  return { allSelected, someSelected, selectableData };
}

function oneIfTrue(bool) {
  return bool ? 1 : 0;
}

function getTableContainerStyle(hideHeader) {
  return hideHeader ? { tableLayout: 'fixed', width: '100%' } : undefined;
}

function renderRowActionHeaderCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled) {
  return hoverRowActions ? (
    <>
      <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />
      {onDeleteRow && <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />}
    </>
  ) : (
    <>
      {legacyDeleteEnabled && <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />}
      {onCloneRow && !quickActionsEnabled && <TableHead className="w-10 px-2" data-testid="TableHead__eb5261" />}
    </>
  );
}

function renderRowActionFooterCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled) {
  return hoverRowActions ? (
    <>
      <TableCell data-testid="TableCell__eb5261" />
      {onDeleteRow && <TableCell data-testid="TableCell__eb5261" />}
    </>
  ) : (
    <>
      {legacyDeleteEnabled && <TableCell data-testid="TableCell__eb5261" />}
      {onCloneRow && !quickActionsEnabled && <TableCell data-testid="TableCell__eb5261" />}
    </>
  );
}

function isQuickActionsEnabled(rowQuickActions) {
  return !!rowQuickActions && rowQuickActions.enabled !== false;
}

function getRowClassName(onRowClick, onNavigate, isChecked, selectedRowBg, selectedId, row, isSelectedLine) {
  let hoverClass;
  if (isSelectedLine) {
    hoverClass = 'hover:bg-slate-300/80';
  } else {
    hoverClass = (onRowClick || onNavigate) ? 'hover:bg-muted/50' : '';
  }
  return [
    'transition-colors h-12 group/row',
    (onRowClick || onNavigate) ? 'cursor-pointer' : 'cursor-default',
    isChecked ? selectedRowBg : '',
    selectedId != null && row.id === selectedId ? 'bg-primary/10' : '',
    isSelectedLine ? 'bg-slate-200/90 ring-1 ring-slate-300' : '',
    hoverClass,
  ].filter(Boolean).join(' ');
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
 *  - onDeleteRow: (row) => void — when provided, renders a per-row delete button (trash icon)
 *      that appears on row hover and on keyboard focus. Invoked with the row object; click
 *      propagation is stopped so it does not trigger row selection or navigation.
 */
export function DataTable({
  entity,
  specName,
  columns = [],
  filters = [],
  data = [],
  onRowSelect,
  onNavigate,
  onRowClick,
  selectedRowId,
  selectedId,
  compact,
  loading,
  addRow,
  selectable = true,
  isRowSelectable,
  onSelectionChange,
  sortColumn,
  sortDirection,
  onSort,
  onColumnsReady,
  token,
  apiBaseUrl,
  showFooterTotals = true,
  selectorContext,
  onDataMutated,
  labelOverrides,
  onDeleteRow,
  onCloneRow,
  /**
   * Row Quick Actions overlay (ETP-3914 slice 2).
   * Optional. When provided and `enabled !== false`, renders a hover-revealed
   * overlay anchored to the right edge of each row, mirroring DetailView toolbar
   * actions. Independent of `onDeleteRow` / `onCloneRow` — those continue to work
   * for legacy callers that have not migrated yet.
   *
   * Shape (all keys optional except `enabled`):
   *   {
   *     enabled?: boolean,                  // defaults to true when object is present
   *     editMode?: 'navigate' | 'inline',   // forwarded from decisions.json (slice 3)
   *     onEdit?: (row) => void,
   *     onClone?: (row) => void,
   *     onEmail?: (row) => void,
   *     onDelete?: (row) => void,
   *     menuActions?: Array<MenuAction>,    // forwarded to RowQuickActions' kebab
   *     documentPreview?: boolean | object, // truthy ⇒ show Email button
   *     statusField?: string,
   *     hideDeleteWhenComplete?: boolean,
   *     onMenuActionExecuted?: (action, result) => void,
   *     // Per-action overrides from decisions.json → window.rowQuickActions.actions.
   *     // Keyed by canonical name ('edit', 'duplicate', 'email', 'delete') or processKey.
   *     // Each entry: { show: boolean | 'fixed' | 'kebab', visibleWhen?: string }
   *     actions?: Record<string, { show?: boolean|'fixed'|'kebab', visibleWhen?: string }>,
   *   }
   */
  rowQuickActions,
  onFilterChange,
  onClearAllFilters,
  columnFilters = {},
  rowFilter,
  hiddenColumns = [],
  linesLayout,
  hoverRowActions = false,
  onEditRow = null,
  editingRowId = null,
  onSaveRow = null,
  onCancelEdit = null,
  clearSelectionTrigger = 0,
  hideHeader = false,
  hideDataRows = false,
}) {
  const t = useLabel(labelOverrides);
  const tMenu = useMenuLabel();
  const ui = useUI();
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale.replace('_', '-'), { year: 'numeric', month: '2-digit', day: '2-digit' }),
    [locale]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());

  useEffect(() => {
    if (!clearSelectionTrigger) return;
    setSelectedRows(new Set());
  }, [clearSelectionTrigger]);

  const [optimisticToggles, setOptimisticToggles] = useState({});
  const [savingToggles, setSavingToggles] = useState({});
  const [deletingRows, setDeletingRows] = useState({});

  useEffect(() => {
    setOptimisticToggles({});
    setSavingToggles({});
    setDeletingRows({});
  }, [data]);

  // Report columns to parent (e.g., ListView sort popover)
  useEffect(() => {
    if (onColumnsReady && columns.length > 0) {
      onColumnsReady(columns);
    }
  }, [columns, onColumnsReady]);

  const hasColumnFilter = useMemo(() => Object.values(columnFilters).some(v => v), [columnFilters]);
  const hasActiveFilter = searchQuery.length > 0 || hasColumnFilter;

  const filteredData = useMemo(() => {
    // If onFilterChange is provided, column filters/sort are handled by the backend;
    // skip local search loop. Otherwise apply it client-side.
    const searched = onFilterChange ? data : applyLocalSearch(data, filters, searchQuery);
    // Row-level predicate (e.g. numeric conditions like outstandingAmount > 0)
    // is always applied locally — the backend cannot evaluate arbitrary JS predicates.
    return rowFilter ? searched.filter(rowFilter) : searched;
  }, [data, filters, searchQuery, onFilterChange, rowFilter]);

  const visibleColumns = useMemo(
    () => hiddenColumns.length > 0 ? columns.filter(col => !hiddenColumns.includes(col.key)) : columns,
    [columns, hiddenColumns]
  );

  const amountColumns = useMemo(
    () => visibleColumns.filter(col => col.type === 'amount'),
    [visibleColumns]
  );

  // ETP-3914 — Mirror InlineLinesPanel: when the quick-actions overlay is enabled,
  // the last visible column's value is hidden on row hover so the floating action
  // icons visually take its place (no layout shift). Unlike InlineLinesPanel — which
  // looks specifically for a trailing `amount` column — headers can end in any type
  // (status, date, etc.), so we always pick the last visible column.
  const trailingHoverColumn = useMemo(() => {
    const enabled = isQuickActionsEnabled(rowQuickActions);
    if (!enabled || visibleColumns.length === 0) return null;
    return visibleColumns[visibleColumns.length - 1];
  }, [visibleColumns, rowQuickActions]);

  const displayCatalogMaps = useMemo(
    () => buildDisplayCatalogMaps(visibleColumns, addRow, entity),
    [visibleColumns, entity, addRow?.fields, addRow?.catalogs],
  );

  const totals = useMemo(() => {
    if (amountColumns.length === 0) return null;
    const sums = {};
    for (const col of amountColumns) {
      sums[col.key] = filteredData.reduce((sum, row) => sum + (Number(row[col.key]) || 0), 0);
    }
    return sums;
  }, [filteredData, amountColumns]);

  const handleInlineToggle = useCallback(async (row, col, checked) => {
    if (!apiBaseUrl || !entity || !row?.id || !token) {
      toast.error('Inline toggle is not available in this context');
      return;
    }
    await runInlineToggleRequest({
      apiBaseUrl, entity, row, col, token, checked,
      toggleKey: `${row.id}:${col.key}`,
      setOptimisticToggles, setSavingToggles, onDataMutated,
    });
  }, [apiBaseUrl, entity, onDataMutated, token]);

  const renderCellValue = (row, col) => {
    if (typeof col.render === 'function') return col.render(row, { entity, token, apiBaseUrl });

    const { display, rawValue, toggleKey } = resolveCellDisplay(row, col, optimisticToggles, displayCatalogMaps);
    const renderer = CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default;
    return renderer({
      row,
      col,
      display,
      rawValue,
      toggleKey,
      visibleColumns,
      tMenu,
      dictionary,
      savingToggles,
      handleInlineToggle,
      locale,
      t,
      ui,
      dateFormatter,
    });
  };

  const handleRowActivation = useCallback((row, idx) => {
    if (hasActiveFilter) {
      trackSearchResultSelected({
        entity,
        specName,
        source: hasColumnFilter ? 'table_filter' : 'table_search',
        type: hasColumnFilter ? 'filter' : 'search',
        position: idx + 1,
      });
    }
    if (onRowClick) onRowClick(row);
    else if (onNavigate) onNavigate(row);
    else onRowSelect?.(row);
  }, [entity, specName, hasActiveFilter, hasColumnFilter, onRowClick, onNavigate, onRowSelect]);

  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton
          columns={visibleColumns.length > 0 ? visibleColumns : [{ key: '_1' }, { key: '_2' }, { key: '_3' }]}
          data-testid="TableSkeleton__eb5261" />
      </div>
    );
  }
  const { allSelected, someSelected, selectableData } = computeSelectionState(filteredData, selectedRows, isRowSelectable);

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

  const quickActionsEnabled = isQuickActionsEnabled(rowQuickActions);
  const legacyDeleteEnabled = !!onDeleteRow && (hoverRowActions || !quickActionsEnabled);
  const deleteCol = oneIfTrue(legacyDeleteEnabled);
  const cloneCol = oneIfTrue(onCloneRow && !quickActionsEnabled);
  const quickActionsCol = oneIfTrue(quickActionsEnabled);
  const actionCols = hoverRowActions ? 1 + deleteCol : deleteCol + cloneCol;
  const colSpan = visibleColumns.length + oneIfTrue(selectable) + actionCols + quickActionsCol;
  const selectedRowBg = hoverRowActions ? 'bg-[#F5F7F9]' : 'bg-primary/5';

  // In inlineEditable add-row mode (hideHeader=true), the DataTable only renders
  // the new-line form while InlineLinesPanel owns the existing rows. InlineLinesPanel
  // always appends a 48px right spacer, plus a 160px action slot when no amount column
  // exists. Mirror those here so flexible columns grow to the same width in both.
  const ilpHasNoAmountCol = hideHeader && linesLayout === 'inlineEditable'
    && !visibleColumns.some(c => c.type === 'amount');
  const ilpTrailing = hideHeader && linesLayout === 'inlineEditable';

  return (
    <div className="space-y-0">
      <div className={linesLayout === 'inlineEditable' ? '[&>div]:!overflow-visible' : 'overflow-x-auto overflow-y-visible'}>
        <Table style={getTableContainerStyle(hideHeader)} data-testid="Table__eb5261">
          {/* When hideHeader is true (add-row-only mode), a <colgroup> drives column
              widths with the same fixed/auto split used by InlineLinesPanel's flex
              layout. Fixed-size columns (flex-grow: 0) get explicit pixel widths;
              flexible columns (flex-grow: 1) get no width so the browser shares
              remaining space equally — matching flex's equal-grow distribution.
              table-layout: fixed makes the browser honour those col widths exactly. */}
          {hideHeader && (
            <colgroup>
              {selectable && <col style={{ width: 40 }} />}
              {visibleColumns.map((col, colIdx) => {
                const { grow, basis } = flexSpec(col, colIdx);
                return grow === 0
                  ? <col key={col.key} style={{ width: basis }} />
                  : <col key={col.key} />;
              })}
              {/* In inlineEditable add-row mode (ilpTrailing), all row actions
                  live inside InlineLinesPanel's 160px action slot — never add
                  separate action cols here or the flex columns shrink by 40px. */}
              {!ilpTrailing && hoverRowActions && <col style={{ width: 40 }} />}
              {!ilpTrailing && hoverRowActions && onDeleteRow && <col style={{ width: 40 }} />}
              {!ilpTrailing && !hoverRowActions && legacyDeleteEnabled && <col style={{ width: 40 }} />}
              {!ilpTrailing && !hoverRowActions && onCloneRow && !quickActionsEnabled && <col style={{ width: 40 }} />}
              {!ilpTrailing && quickActionsEnabled && <col style={{ width: 40 }} />}
              {ilpHasNoAmountCol && <col style={{ width: 160 }} />}
              {ilpTrailing && <col style={{ width: 48 }} />}
            </colgroup>
          )}
          <TableHeader
            className={linesLayout === 'inlineEditable' ? 'sticky top-0 z-20 bg-white' : ''}
            aria-hidden={hideHeader || undefined}
            style={hideHeader ? { display: 'none' } : undefined}
            data-testid="TableHeader__eb5261">
            <TableRow className="border-b border-border/40" data-testid="TableRow__eb5261">
              {selectable && (
                <TableHead
                  className="w-10 px-3 align-middle"
                  onClick={(e) => e.stopPropagation()}
                  data-testid="TableHead__eb5261">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    onClick={(e) => e.stopPropagation()}
                    data-testid="Checkbox__eb5261" />
                </TableHead>
              )}
              {visibleColumns.map((col, colIdx) => {
                const colLabel = resolveColumnLabel(col, locale, t);
                const isSorted = sortColumn === col.key;
                const isSortable = col.sortable !== false;
                const headStyle = linesLayout === 'inlineEditable'
                  ? { minWidth: columnMinWidthPx(col, colIdx) }
                  : undefined;
                const sortArrowClass = NUMERIC_FIELD_TYPES.has(col.type)
                  ? 'left-0 -translate-x-full pr-0.5'
                  : 'right-0 translate-x-full pl-0.5';
                return (
                  <TableHead
                    key={col.key}
                    data-testid={`column-header-${col.key}`}
                    className={['align-middle', NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right' : ''].filter(Boolean).join(' ')}
                    style={headStyle}
                  >
                    {onSort && isSortable ? (
                      <button
                        type="button"
                        className={`relative inline-block text-xs leading-4 font-semibold text-text-primary tracking-normal cursor-pointer select-none transition-colors bg-transparent border-0 p-0 ${NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right' : 'text-left'}`}
                        onClick={() => onSort(col.key)}
                      >
                        {colLabel}
                        {isSorted && (
                          <span className={`absolute top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none ${sortArrowClass}`}>{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
                        )}
                      </button>
                    ) : (
                      <span className={`relative inline-block text-xs leading-4 font-semibold text-text-primary tracking-normal${NUMERIC_FIELD_TYPES.has(col.type) ? ' text-right' : ''}`}>
                        {colLabel}
                        {isSorted && (
                          <span className={`absolute top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none ${sortArrowClass}`}>{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
                        )}
                      </span>
                    )}
                  </TableHead>
                );
              })}
              {renderRowActionHeaderCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled)}
              {quickActionsEnabled && <TableHead className="w-10 px-2" aria-hidden="true" data-testid="TableHead__eb5261" />}
            </TableRow>
          </TableHeader>
          <TableBody data-testid="TableBody__eb5261">
            {!hideDataRows && (filteredData.length === 0 && !addRow?.active ? (
              <TableRow data-empty-state="" data-testid="TableRow__eb5261">
                <TableCell colSpan={colSpan} className="p-0" data-testid="TableCell__eb5261">
                  <EmptyState
                    hasFilter={hasActiveFilter}
                    totalCount={data.length}
                    data-testid="EmptyState__eb5261" />
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row, idx) => {
                const isChecked = selectedRows.has(row.id);
                const isSelectedLine = selectedRowId != null && row.id === selectedRowId;
                return (
                  <TableRow
                    key={row.id ?? idx}
                    role="row"
                    data-testid={`row-${row.id ?? idx}`}
                    data-row-status={row.documentStatus}
                    onClick={() => {
                      if (editingRowId === row.id) return;
                      handleRowActivation(row, idx);
                    }}
                    className={getRowClassName(onRowClick, onNavigate, isChecked, selectedRowBg, selectedId, row, isSelectedLine)}
                  >
                    {selectable && (() => {
                      const rowDisabled = isRowSelectable && !isRowSelectable(row);
                      return (
                        <TableCell
                          className="w-10 px-3"
                          onClick={(e) => e.stopPropagation()}
                          data-testid="TableCell__eb5261">
                          <Checkbox
                            checked={isChecked}
                            disabled={rowDisabled}
                            onChange={(e) => toggleRow(e, row)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid="Checkbox__eb5261" />
                        </TableCell>
                      );
                    })()}
                    {visibleColumns.map(col => {
                      const isTrailingHover = trailingHoverColumn != null && col === trailingHoverColumn;
                      return (
                        <TableCell
                          key={col.key}
                          data-testid={`cell-${row.id ?? idx}-${col.key}`}
                          data-value={row[col.key] ?? ''}
                          className={['text-sm', NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right tabular-nums' : ''].filter(Boolean).join(' ')}
                        >
                          {isTrailingHover ? (
                            <span className="block transition-opacity group-hover/row:opacity-0 group-focus-within/row:opacity-0">
                              {renderCellValue(row, col)}
                            </span>
                          ) : (
                            renderCellValue(row, col)
                          )}
                        </TableCell>
                      );
                    })}
                    {hoverRowActions ? (
                      <>
                        <TableCell
                          className="w-10 px-2"
                          onClick={(e) => e.stopPropagation()}
                          data-testid="TableCell__eb5261">
                          {editingRowId === row.id ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onSaveRow?.(); }}
                              className="h-8 w-8 flex items-center justify-center rounded-full text-[#17663A] hover:bg-[#EEFBF4] transition-all"
                              aria-label={ui('save')}
                            >
                              <Check className="h-5 w-5" aria-hidden="true" data-testid="Check__eb5261" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onEditRow) { onEditRow(row); }
                                else { handleRowActivation(row, idx); }
                              }}
                              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 h-8 w-8 flex items-center justify-center rounded-full text-[#828FA3] hover:bg-[#F5F7F9] transition-all"
                              aria-label={ui('edit')}
                            >
                              <Pencil className="h-5 w-5" aria-hidden="true" data-testid="Pencil__eb5261" />
                            </button>
                          )}
                        </TableCell>
                        {onDeleteRow && (
                          <TableCell
                            className="w-10 px-2"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="TableCell__eb5261">
                            {editingRowId === row.id ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onCancelEdit?.(); }}
                                className="h-8 w-8 flex items-center justify-center rounded-full text-[#828FA3] hover:bg-[#F5F7F9] transition-all"
                                aria-label={ui('cancel')}
                              >
                                <X className="h-5 w-5" aria-hidden="true" data-testid="X__eb5261" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!!deletingRows[row.id]}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const deleteKey = row.id;
                                  setDeletingRows(prev => ({ ...prev, [deleteKey]: true }));
                                  try { await onDeleteRow(row); }
                                  finally {
                                    setDeletingRows(prev => {
                                      const next = { ...prev };
                                      delete next[deleteKey];
                                      return next;
                                    });
                                  }
                                }}
                                className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 h-8 w-8 flex items-center justify-center rounded-full text-[#D50B3E] hover:bg-[#FEF0F4] transition-all"
                                aria-label={ui('deleteRowTooltip')}
                                data-testid={`row-delete-${row.id}`}
                              >
                                {deletingRows[row.id]
                                  ? <Loader2
                                  className="h-5 w-5 animate-spin"
                                  aria-hidden="true"
                                  data-testid="Loader2__eb5261" />
                                  : <Trash2 className="h-5 w-5" aria-hidden="true" data-testid="Trash2__eb5261" />}
                              </button>
                            )}
                          </TableCell>
                        )}
                      </>
                    ) : (
                      <>
                        {legacyDeleteEnabled && (
                          <TableCell
                            className="w-10 px-2"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="TableCell__eb5261">
                            <button
                              type="button"
                              disabled={!!deletingRows[row.id]}
                              onClick={async () => {
                                const deleteKey = row.id;
                                setDeletingRows(prev => ({ ...prev, [deleteKey]: true }));
                                try {
                                  await onDeleteRow(row);
                                } finally {
                                  setDeletingRows(prev => {
                                    const next = { ...prev };
                                    delete next[deleteKey];
                                    return next;
                                  });
                                }
                              }}
                              className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title={ui('deleteRowTooltip')}
                              aria-label={ui('deleteRowTooltip')}
                              data-testid={`row-delete-${row.id}`}
                            >
                              {deletingRows[row.id] ? <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                                data-testid="Loader2__eb5261" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" data-testid="Trash2__eb5261" />}
                            </button>
                          </TableCell>
                        )}
                        {onCloneRow && !quickActionsEnabled && (
                          <TableCell
                            className="w-10 px-2"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="TableCell__eb5261">
                            <div className="relative group/clonebtn flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => onCloneRow(row)}
                                className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
                                style={{ width: 26, height: 26 }}
                                aria-label={ui('cloneOrderBtn')}
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" data-testid="Copy__eb5261" />
                              </button>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-medium text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover/clonebtn:opacity-100 pointer-events-none transition-opacity z-10">
                                {ui('cloneOrderBtn')}
                              </div>
                            </div>
                          </TableCell>
                        )}
                      </>
                    )}
                    {quickActionsEnabled && (
                      <TableCell
                        className="w-10 px-2 relative"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="TableCell__eb5261">
                        <RowQuickActions
                          row={row}
                          entity={entity}
                          apiBaseUrl={apiBaseUrl}
                          token={token}
                          documentPreview={rowQuickActions.documentPreview}
                          sendDocument={rowQuickActions.sendDocument}
                          menuActions={rowQuickActions.menuActions}
                          hideDeleteWhenComplete={rowQuickActions.hideDeleteWhenComplete}
                          statusField={rowQuickActions.statusField}
                          onEdit={rowQuickActions.onEdit}
                          onClone={rowQuickActions.onClone}
                          onEmail={rowQuickActions.onEmail}
                          onDelete={rowQuickActions.onDelete}
                          onMenuActionExecuted={rowQuickActions.onMenuActionExecuted}
                          actionsConfig={rowQuickActions.actions}
                          data-testid="RowQuickActions__eb5261" />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ))}
            {addRow?.active && (
              <InlineAddRow
                ref={addRow.ref}
                columns={visibleColumns}
                fields={addRow.fields}
                onAdd={addRow.onAdd}
                onCancel={addRow.onCancel}
                data={data}
                catalogs={addRow.catalogs}
                onFieldChange={addRow.onFieldChange}
                onValuesChange={addRow.onValuesChange}
                seedValues={addRow.seedValues}
                resolvedDefaults={addRow.resolvedDefaults}
                selectable={selectable}
                hasDeleteColumn={!hoverRowActions && legacyDeleteEnabled}
                hasCloneColumn={!hoverRowActions && !!onCloneRow && !quickActionsEnabled}
                hoverRowActions={hoverRowActions}
                hoverRowHasDelete={hoverRowActions && !!onDeleteRow}
                hasQuickActionsColumn={quickActionsEnabled}
                token={token}
                apiBaseUrl={apiBaseUrl}
                entity={entity}
                selectorContext={selectorContext}
                ilpHasNoAmountCol={ilpHasNoAmountCol}
                ilpTrailing={ilpTrailing}
                labelOverrides={labelOverrides}
                data-testid="InlineAddRow__eb5261" />
            )}
          </TableBody>
          {totals && showFooterTotals && (
            <TableFooter data-testid="TableFooter__eb5261">
              <TableRow className="font-medium" data-testid="TableRow__eb5261">
                {selectable && <TableCell data-testid="TableCell__eb5261" />}
                {visibleColumns.map((col, idx) => (
                  <TableCell
                    key={col.key}
                    className={col.type === 'amount' ? 'tabular-nums text-right font-semibold' : ''}
                    data-testid="TableCell__eb5261">
                    {col.type === 'amount'
                      ? formatAmount(totals[col.key], filteredData[0]?.['currency$_identifier'])
                      : ''}
                  </TableCell>
                ))}
                {renderRowActionFooterCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled)}
                {quickActionsEnabled && <TableCell data-testid="TableCell__eb5261" />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {addRow?.active && (
        <p className="text-xs text-muted-foreground mt-1 text-center">
          {ui('inlineAddHint')}
        </p>
      )}
    </div>
  );
}
function resolveCellDisplay(row, col, optimisticToggles, displayCatalogMaps) {
  const toggleKey = `${row.id}:${col.key}`;
  const rawValue = Object.hasOwn(optimisticToggles, toggleKey)
    ? optimisticToggles[toggleKey]
    : row[col.key];
  let display = resolveIdentifier(row, col.key);
  const displayMap = displayCatalogMaps.get(col.key);
  if (displayMap) {
    const fkId = row?.[col.key];
    if (fkId != null) {
      const mapped = displayMap.get(String(fkId));
      if (mapped) display = mapped;
    }
  }
  return { display, rawValue, toggleKey };
}
