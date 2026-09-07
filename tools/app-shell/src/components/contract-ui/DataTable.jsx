import React, { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Inbox, X, Trash2, Copy, Loader2, Pencil, Check, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { useLabel, useUI, useLocale, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { applyCalloutUpdates } from '@/lib/applyCalloutUpdates.js';
import { columnMinWidthPx, columnFlex, isLineGridColumn } from '@/lib/linesColumnWidth.js';
import { CHEVRON_COLUMN_WIDTH } from './InlineLinesPanel.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CELL_RENDERERS } from './DataTable.cellRenderers.jsx';
import { resolveFkNavigation } from './fkNavigation.js';
import { getEmailFieldError, getPhoneFieldError, getWebsiteFieldError } from './recipientEdits.js';
import { getContactsTextFieldError, filterContactsInputValue } from './contactsFieldValidation.js';
import { isCapabilityVisible } from '@/lib/capabilityVisibility.js';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { parseBackendErrorMessage, translateBackendError } from '@/lib/backendErrors.js';

// Extracts grow flag and basis (px) from a columnFlex() shorthand string.
function flexSpec(col, idx) {
  const [g, , b] = columnFlex(col, idx).split(' ');
  return { grow: parseInt(g, 10), basis: parseInt(b, 10) };
}

// Reproduces flexbox's exact width formula for `flex-grow: 1` columns when
// mirrored into an HTML `<table style="table-layout: fixed">` colgroup.
// Flexbox distributes leftover space EQUALLY among growing items ON TOP OF
// each item's own basis (own basis + leftover/N). But a width-less <col> in
// a fixed-layout table splits the leftover space equally while IGNORING each
// column's own basis — so two grow columns with different bases (e.g. 192px
// vs 224px) render as EQUAL width in the table, even though the real flex
// rows always keep them a fixed 32px apart. This calc() expression restores
// that per-column basis so both layouts match pixel-for-pixel.
function growColumnWidth(basisPx, fixedTotalPx, growCount) {
  if (!growCount) return undefined;
  return `calc((100% - ${fixedTotalPx}px) / ${growCount} + ${basisPx}px)`;
}
import { SelectorInput } from './SelectorInput.jsx';
import { InlineSearchCombo } from './InlineSearchCombo.jsx';
import { ComputedFreshnessHint } from './ComputedFreshnessHint.jsx';
import { PillToggle } from '@/components/PillToggle';
import RowQuickActions from './RowQuickActions.jsx';
import { trackSearchResultSelected } from '@/lib/productUsageTelemetry.js';
import { LOOKUP_DRAWERS } from './lookupDrawers.js';

import { apiFetch } from '@/auth/api.js';
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
 *
 * ETP-5039: every mapped target is reported through the optional `markTouched`
 * callback. A value the user selected in the lookup drawer is an explicit user
 * choice, so a callout fired by the same selection (e.g. the product callout
 * returning the default locator) must not overwrite it — see
 * `applyCalloutUpdates`, which skips touched fields and their `$_identifier`
 * companions.
 *
 * @param {object}   field        Field whose `onSelectMappings` are applied
 * @param {object}   item         Item selected in the lookup
 * @param {Function} handleChange (key, value) row-state setter
 * @param {Function} [markTouched] (key) called for every mapped target field
 */
export function applyOnSelectMappings(field, item, handleChange, markTouched) {
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
    markTouched?.(m.to);
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
  // Radix primitives that render via a DismissableLayer with
  // disableOutsidePointerEvents (e.g. <Select>, <Dialog>) set
  // document.body.style.pointerEvents = 'none' while open, so a click meant
  // for an underlying field never reaches it — the browser resolves the
  // event target to <html> instead. That target matches none of the
  // selectors below (it isn't a descendant of the listbox/dialog), so
  // without this check it reads as "genuinely outside, nothing touched" and
  // wrongly discards the row. Treat any click while such a layer is active
  // as belonging to that layer, regardless of what element it resolves to.
  if (document.body.style.pointerEvents === 'none') return true;
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

// Exported (ETP-4830) so window-scoped topbar/header controls that need the exact
// same PATCH + optimistic-update + error-toast behavior as a grid inline toggle
// (e.g. `windows/custom/user/index.jsx`'s detail-header "Activo" Switch) can reuse
// it instead of re-implementing the request/rollback/toast logic. Generic by
// design already — every dependency is passed in as a param, none are closed over
// component state — so exporting adds no coupling.
export async function runInlineToggleRequest({
  apiBaseUrl, entity, row, col, token, checked,
  toggleKey, setOptimisticToggles, setSavingToggles, onDataMutated, ui,
}) {
  setOptimisticToggles(prev => ({ ...prev, [toggleKey]: checked }));
  setSavingToggles(prev => ({ ...prev, [toggleKey]: true }));
  try {
    const res = await apiFetch(`${apiBaseUrl}/${entity}/${row.id}`, {
      method: 'PATCH',
      baseUrl: '',
      token,
      body: JSON.stringify({ [col.key]: checked }),
    });
    if (!res.ok) {
      const raw = await parseBackendErrorMessage(res);
      throw new Error(translateBackendError(raw ?? `Error ${res.status}`, ui));
    }
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

// Format guard for the inline add-row (email + phone + website, plus the
// Contacts-only text-field checks). Empty is valid (these fields are optional —
// never made required); only a non-empty malformed value is flagged. Returns
// `{ key, params }` (never a bare string) so a parameterized message like
// `fieldMaxLengthError` can interpolate correctly; the email/phone/website
// helpers return a plain key string, wrapped here into the same shape for a
// uniform call site. ETP-5031 added the website check (previously missing here
// even though the form already validated it) and the Contacts text-field gate.
function getFieldFormatError(f, valuesRef, specName) {
  const v = valuesRef.current[f.key];
  const emailErr = getEmailFieldError(f, v);
  if (emailErr) return { key: emailErr, params: {} };
  const phoneErr = getPhoneFieldError(f, v);
  if (phoneErr) return { key: phoneErr, params: {} };
  const websiteErr = getWebsiteFieldError(f, v);
  if (websiteErr) return { key: websiteErr, params: {} };
  return getContactsTextFieldError(specName, f, v);
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

// Human-readable label for a picked lookup item, trying the common shapes in
// priority order (label > name > _identifier).
function resolveLookupItemLabel(item) {
  return item.label || item.name || item._identifier;
}

// Conditional visibility: a field with `displayIf` is hidden while its
// controlling sibling field is falsy (not 'Y'/true/'true').
function isColumnHidden(field, values) {
  if (!field?.displayIf) return false;
  const ctrlVal = values[field.displayIf];
  return !(ctrlVal === true || ctrlVal === 'Y' || ctrlVal === 'true');
}

function isStaticSelectField(field) {
  return field.type === 'select' && field.options?.length;
}

/**
 * Renders the inline-add-row cell for a `selector` field. Always uses the
 * searchable <InlineSearchCombo>, preloaded with the catalog's options (if any)
 * and backed by the selector URL for server-side search / lazy loading —
 * mirroring the `search`-type add-row cell and the header's unified selector.
 */
function renderSelectorCell({
  catalogs, entity, field, apiBaseUrl, col, values, touchedFieldsRef,
  handleChange, handleFieldChange, handleKeyDown, isFirst, firstInputRef,
  fieldLabel, selectorContext, token,
}) {
  const allOptions = getCatalogOptions(catalogs, entity, field);
  const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
  // Exclude the option equal to the current value of a sibling field on this add-line row
  // (e.g. newStorageBin can't equal storageBin). Applies to both the preloaded catalog and
  // any server-side search results.
  const excludeId = field.excludeValueOf ? (values[field.excludeValueOf] ?? null) : null;
  const options = excludeId != null ? allOptions.filter(o => o.id !== excludeId) : allOptions;

  if (options.length === 0 && !selectorUrl) {
    return (
      <TableCell
        key={col.key}
        className="py-1 px-2"
        data-testid={"TableCell__" + field.id} />
    );
  }

  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
      <InlineSearchCombo
        field={field}
        value={values[field.key] ?? ''}
        displayLabel={values[field.key + '$_identifier'] || ''}
        options={options}
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

// Two-decimal display formatter for amount/price inputs. Pure (only reads `raw`),
// kept at module scope so it doesn't count against renderInputCell's complexity.
function formatTwoDecimals(raw) {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
  return Number.isFinite(n) ? n.toFixed(2) : raw;
}

function renderInputCell({
  field, col, values, invalidFields, isFirst, firstInputRef,
  handleFieldChange, handleKeyDown, fieldLabel, specName,
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
    // ETP-5031 — Contacts phone-like fields never even display a disallowed
    // character (filtered at keystroke time), so this happens before the
    // partial-number-pattern gate below. No-op for every window/field this
    // doesn't apply to — filterContactsInputValue returns the raw value unchanged.
    const raw = filterContactsInputValue(specName, field, e.target.value);
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
        className={`w-full h-8 text-sm rounded-md border bg-card px-2 focus:ring-2 focus:outline-none${isNumeric ? ' text-right tabular-nums' : ''}${invalidFields.has(field.key) ? ' border-destructive focus:ring-destructive' : ' border-input focus:ring-primary'}`}
      />
    </TableCell>
  );
}

// Renders the derived (contract-computed, non-editable) cell shown when a column
// has no matching editable field — a read-only display of the callout result.
function renderDerivedAddCell(col, values) {
  const rawVal = values[col.key];
  const identVal = values[col.key + '$_identifier'];
  const isNumericDerived = NUMERIC_FIELD_TYPES.has(col.type);
  const isTwoDecimalDerived = col.type === 'amount' || col.type === 'price';
  const displayVal = formatDerivedCellValue(identVal, rawVal, isTwoDecimalDerived);
  return (
    <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className={`text-muted-foreground text-sm${getNumericCellAlignClass(isNumericDerived)}`}>
      {displayOrDash(displayVal)}
    </TableCell>
  );
}

// Renders the interactive control for an editable inline-add field, dispatching
// on its type (lookup, search, static select, selector, boolean, or plain input).
function renderInlineAddFieldControl(col, field, isFirst, fieldLabel, {
  values, firstInputRef, selectorContext, token, apiBaseUrl, entity, catalogs,
  handleChange, handleFieldChange, handleKeyDown, touchedFieldsRef, invalidFields, locale, specName,
}) {
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
            handleChange(field.key + '$_identifier', resolveLookupItemLabel(item));
            handleFieldChange(field.key, item.id, item);
            applyOnSelectMappings(field, item, handleChange, (key) => touchedFieldsRef.current.add(key));
          }}
          onKeyDown={handleKeyDown}
          title={lookupTitle}
          drawerKey={drawerKey}
          data-testid="LookupField__eb5261" />
      </TableCell>
    );
  }
  if (field.type === 'search') {
    const options = getCatalogOptions(catalogs, entity, field);
    const selectorUrl = buildSelectorUrl(apiBaseUrl, entity, field);
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
            className="w-full h-8 text-sm bg-card focus:ring-2 focus:ring-primary"
          >
            <SelectValue placeholder={field.label ?? field.key} data-testid="SelectValue__eb5261" />
          </SelectTrigger>
          <SelectContent data-testid="SelectContent__eb5261">
            {!field.required && <SelectItem value="__empty__" data-testid="SelectItem__eb5261">&nbsp;</SelectItem>}
            {field.options.map(opt => (
              // ETP-4685 — each option carries a per-locale `labels` map (same shape
              // the form view already resolves) alongside the raw AD `label`; prefer
              // it or this always shows the raw English name regardless of locale.
              (<SelectItem key={opt.value} value={opt.value} data-testid="SelectItem__eb5261">{opt.labels?.[locale] ?? opt.label}</SelectItem>)
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    );
  }
  if (field.type === 'selector') {
    return renderSelectorCell({
      catalogs, entity, field, apiBaseUrl, col, values, touchedFieldsRef,
      handleChange, handleFieldChange, handleKeyDown, isFirst, firstInputRef,
      fieldLabel, selectorContext, token,
    });
  }
  if (field.type === 'checkbox' || field.type === 'boolean') {
    const checked = values[field.key] === true || values[field.key] === 'Y' || values[field.key] === 'true';
    return (
      <TableCell key={col.key} data-testid={`inline-add-cell-${col.key}`} className="py-1 px-2">
        <PillToggle
          checked={checked}
          onCheckedChange={(next) => {
            touchedFieldsRef.current.add(field.key);
            handleFieldChange(field.key, next);
          }}
          data-testid={`inline-add-field-${field.key}`} />
      </TableCell>
    );
  }
  return renderInputCell({
    field, col, values, invalidFields, isFirst, firstInputRef,
    handleFieldChange, handleKeyDown, fieldLabel, specName,
  });
}

function renderInlineAddCell(col, ctx) {
  const { fieldMap, values, t, locale, firstInputCtx } = ctx;
  const field = fieldMap[col.key];
  const fieldLabel = getFieldLabel(field, t, col, locale);
  if (isColumnHidden(field, values)) {
    return <TableCell key={col.key} aria-hidden="true" data-testid={`inline-add-cell-${col.key}`} />;
  }
  if (!field) {
    return renderDerivedAddCell(col, values);
  }
  const isFirst = !firstInputCtx.assigned;
  if (isFirst) firstInputCtx.assigned = true;
  return renderInlineAddFieldControl(col, field, isFirst, fieldLabel, ctx);
}

/**
 * Inline editable row rendered at the bottom of the table for rapid line entry.
 * Controlled by the `addRow` prop on DataTable.
 */
// Stable empty seed: a fresh `{}` default would change identity every render and
// make buildEmpty's effect re-run, wiping in-progress input. Share one frozen ref.
const EMPTY_SEED = {};

// First pass of buildEmpty: seed every field with its literal default, the
// auto-computed lineNo, or '' when neither applies.
function buildFieldDefaults(fields, defaultLineNo) {
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
  return empty;
}

// Seed display-only (non-editable) columns — e.g. a parent-derived currency —
// so they render their value immediately instead of "—" until the row is saved.
// Editable fields are never overwritten; the seed only fills keys with no input.
function applyDisplaySeed(empty, seedValues, fieldMap) {
  for (const [key, val] of Object.entries(seedValues)) {
    if (!fieldMap[key]) empty[key] = val;
  }
  return empty;
}

// HandleDefaults: fill EMPTY editable fields from backend-resolved line
// defaults (e.g. a macro default like @DESCRIPTION1@ → the parent's value).
// Fill-empties-only: never override a literal default, the client lineNo, a
// display seed, or a field opted out via skipDefault.
function applyResolvedFieldDefaults(empty, resolvedDefaults, fieldMap) {
  for (const [key, val] of Object.entries(resolvedDefaults)) {
    if (key.endsWith('$_identifier')) continue; // handled by applyResolvedIdentifiers
    const f = fieldMap[key];
    if (!f || f.skipDefault) continue;
    const cur = empty[key];
    if ((cur == null || cur === '') && val != null && val !== '') {
      empty[key] = val;
    }
  }
  return empty;
}

// Companion `<key>$_identifier` labels (e.g. country$_identifier: "Spain") have no
// entry in `fieldMap` — they're display text for a selector field, not a field of
// their own — so applyResolvedFieldDefaults always skips them. Without this, a
// selector/search field resolved from resolvedDefaults (e.g. country: "106") renders
// a chip with a working Clear button but an EMPTY label, because InlineSearchCombo's
// `displayLabel` reads `values[field.key + '$_identifier']` and finds nothing. Only
// seed the identifier when its base field actually received ITS value from
// resolvedDefaults (not from a literal decisions.json defaultValue or a seeded
// display column) so a stale label never gets attached to an unrelated value.
function applyResolvedIdentifiers(empty, resolvedDefaults, fieldMap) {
  for (const [key, val] of Object.entries(resolvedDefaults)) {
    if (!key.endsWith('$_identifier')) continue;
    const baseKey = key.slice(0, -'$_identifier'.length);
    const f = fieldMap[baseKey];
    if (!f || f.skipDefault) continue;
    if (empty[baseKey] === resolvedDefaults[baseKey] && val != null && val !== '') {
      empty[key] = val;
    }
  }
  return empty;
}

const InlineAddRow = forwardRef(function InlineAddRow({ columns, fields, onAdd, onCancel, data, catalogs, onFieldChange, onValuesChange, selectable, hasDeleteColumn, hasCloneColumn, hoverRowActions, hoverRowHasDelete, hasQuickActionsColumn, token, apiBaseUrl, entity, specName, selectorContext, seedValues = EMPTY_SEED, resolvedDefaults = EMPTY_SEED, ilpHasNoAmountCol = false, ilpTrailing = false, labelOverrides, convertOptimisticPrice, hasDimensionsPanel = false }, ref) {
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
    let empty = buildFieldDefaults(fields, defaultLineNo);
    empty = applyDisplaySeed(empty, seedValues, fieldMap);
    empty = applyResolvedFieldDefaults(empty, resolvedDefaults, fieldMap);
    empty = applyResolvedIdentifiers(empty, resolvedDefaults, fieldMap);
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
      // Interpolate the offending field's `min` so the message is precise
      // ("Value must be at least 1") rather than the imprecise negative wording.
      toast.error(ui('fieldMinValueError', { min: belowMin[0].min }));
      const firstInvalid = belowMin[0];
      const inputEl = document.querySelector(`[data-testid="field-${firstInvalid.key}"]`);
      inputEl?.focus?.({ preventScroll: true });
      return Promise.resolve(false);
    }
    // Format validation (email + phone) — mirrors the required/min checks: flag the
    // cell (red border via invalidFields), toast the specific error, focus, and block
    // the commit. Empty stays valid, so an untouched optional field never blocks the row.
    const formatInvalid = fields
      .map(f => ({ f, err: getFieldFormatError(f, valuesRef, specName) }))
      .filter(({ err }) => err !== null);
    if (formatInvalid.length > 0) {
      setInvalidFields(new Set(formatInvalid.map(({ f }) => f.key)));
      toast.error(ui(formatInvalid[0].err.key, formatInvalid[0].err.params));
      const firstInvalid = formatInvalid[0].f;
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
        // Reset for next rapid entry — recompute lineNo. Reuses buildEmpty() (single
        // source of truth for the macro-defaultValue guard, resolvedDefaults fill and
        // its $_identifier companion pass) instead of re-deriving field defaults here —
        // a prior duplicated loop applied `f.defaultValue` unconditionally, so an
        // unresolved AD macro token (e.g. '@COUNTRYDEF@') on a selector/search field
        // would leak into the next line's value, and resolvedDefaults (with its
        // identifier labels) was never reapplied at all.
        const nums = [...(data || []).map(r => Number(r.lineNo) || 0), Number(valuesRef.current.lineNo) || 0];
        const nextLineNo = Math.max(...nums) + 10;
        const next = buildEmpty();
        next.lineNo = nextLineNo;

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
  }, [data, fields, onAdd, onCancel, ui, buildEmpty]);

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
    // Listen for `pointerdown` (not `mousedown`): elements that call
    // preventDefault() on pointerdown — e.g. Radix SelectTrigger and the header
    // selector controls — suppress the browser's compatibility mouse events for
    // that interaction, so a `mousedown` listener would never fire on the FIRST
    // click on such a control and the new line would silently not be saved.
    // `pointerdown` itself is never suppressed. Mirrors the identical fix in
    // InlineLinesPanel.jsx (flush-pending-edit-on-outside-pointerdown).
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
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
      updateSnapshotWithSelectedItem(selectedItem, snapshot, handleChange, touchedFieldsRef, key, convertOptimisticPrice);
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
  }, [handleChange, onFieldChange, values, fieldMap, convertOptimisticPrice]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // Mutable flag shared into renderInlineAddCell so only the FIRST rendered input
  // gets the autofocus ref. An object (not a bare boolean) so the callee can flip it.
  const firstInputCtx = { assigned: false };

  return (
    <TableRow ref={rowRef} data-testid="inline-add-row" className="bg-status-info/50 border-t-2 border-primary/20">
      {/* ETP-4735 — matches the leading CHEVRON_COLUMN_WIDTH <col> renderLinesColgroup
          reserves when hasDimensionsPanel. A <col> alone doesn't reserve visual space —
          table column widths/positions are driven by the actual cells present in a row,
          so without this empty cell every cell after it (product, movementQuantity, …)
          renders one column-slot too far left relative to InlineLinesPanel's rows above. */}
      {hasDimensionsPanel && <TableCell aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableCell__eb5261" />}
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
      {columns.map(col => renderInlineAddCell(col, {
        fieldMap, values, t, locale, firstInputCtx, firstInputRef,
        selectorContext, token, apiBaseUrl, entity, catalogs,
        handleChange, handleFieldChange, handleKeyDown,
        touchedFieldsRef, invalidFields, specName,
      }))}
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
    if (Number.isFinite(n)) {
      displayVal = n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
    }
  }
  return displayVal;
}

function updateSnapshotWithSelectedItem(selectedItem, snapshot, handleChange, touchedFieldsRef, key, convertOptimisticPrice) {
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
      // Apply the header's currency conversion (if any) up front so the price never
      // renders in the org base currency for a beat before the callout corrects it.
      const priceVal = convertOptimisticPrice ? convertOptimisticPrice(topVal) : topVal;
      const isGross = selectedItem?.isTaxIncluded !== false;
      if (isGross) {
        snapshot['grossUnitPrice'] = priceVal;
        handleChange('grossUnitPrice', priceVal);
        snapshot['grossListPrice'] = priceVal;
        handleChange('grossListPrice', priceVal);
        touchedFieldsRef.current.add('grossUnitPrice');
        touchedFieldsRef.current.add('grossListPrice');
      } else {
        snapshot['unitPrice'] = priceVal;
        handleChange('unitPrice', priceVal);
        snapshot['listPrice'] = priceVal;
        handleChange('listPrice', priceVal);
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
        // Marks "nothing picked yet" the way Radix's own triggers do. The
        // button's text is its PLACEHOLDER while empty ("Producto"), so
        // anything reading the rendered text as the current value — the
        // walkthrough's `targetValue` gate, an e2e assertion — would read a
        // placeholder as a filled field. Presence of the attribute is the
        // signal; its value is deliberately empty.
        {...(value ? {} : { 'data-placeholder': '' })}
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
        className={`w-full h-8 text-sm rounded-md border bg-card px-2 text-left flex items-center gap-2 focus:ring-2 focus:outline-none transition-colors${isInvalid ? ' border-destructive focus:ring-destructive' : ' border-input hover:border-primary/50 focus:ring-primary'}`}
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

/**
 * `rowHoverStyle` picks how a clickable row reacts to hover:
 *   - `tint` (default) tints the background, the behaviour every grid has today.
 *   - `elevated` lifts the row instead — an opaque background plus a drop shadow
 *     and `z-10`, so the shadow spills over the neighbouring row separators. Used
 *     by card-like lists (Accounts) where the row reads as a raised surface.
 * Selection always wins over hover, in both styles.
 */
function getRowClassName({
  onRowClick, onNavigate, isChecked, selectedRowBg, selectedId, row, isSelectedLine,
  rowHoverStyle = 'tint',
}) {
  const clickable = onRowClick || onNavigate;
  const elevated = rowHoverStyle === 'elevated';
  // `bg-card` is what makes the drop shadow readable, but it competes with the
  // selection backgrounds below on the same CSS property (Tailwind resolves that
  // by stylesheet order, not by class order), so only opt in when no selection
  // state is painting the row.
  const selectionPainted = isChecked || isSelectedLine || (selectedId != null && row.id === selectedId);
  let hoverClass;
  if (isSelectedLine) {
    hoverClass = 'hover:bg-muted';
  } else if (!clickable) {
    hoverClass = '';
  } else if (elevated) {
    hoverClass = 'hover:z-10 hover:bg-card hover:shadow-lg';
  } else {
    hoverClass = 'hover:bg-muted/50';
  }
  return [
    'h-12 group/row',
    elevated ? 'relative transition-shadow' : 'transition-colors',
    elevated && !selectionPainted ? 'bg-card' : '',
    clickable ? 'cursor-pointer' : 'cursor-default',
    isChecked ? selectedRowBg : '',
    selectedId != null && row.id === selectedId ? 'bg-primary/10' : '',
    isSelectedLine ? 'bg-muted ring-1 ring-focus-ring' : '',
    hoverClass,
  ].filter(Boolean).join(' ');
}

// Sums the pixel widths reserved in the fixed-layout <colgroup> for the
// selection checkbox column and every row-action slot (hover actions, legacy
// delete/clone, quick actions), mirroring the 40px/48px/160px slots rendered
// by InlineLinesPanel and the row-action cells in the table body. Extracted
// from a single chained sum of ternaries so each conditional slot keeps its
// own branch instead of adding flat complexity to the caller.
function computeActionColsWidthPx({
  selectable, ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled,
  onCloneRow, quickActionsEnabled, ilpHasNoAmountCol, hasDimensionsPanel,
}) {
  const showHoverActions = !ilpTrailing && hoverRowActions;
  const showHoverDelete = showHoverActions && onDeleteRow;
  const showLegacyDelete = !ilpTrailing && !hoverRowActions && legacyDeleteEnabled;
  const showLegacyClone = !ilpTrailing && !hoverRowActions && onCloneRow && !quickActionsEnabled;
  const showQuickActions = !ilpTrailing && quickActionsEnabled;

  // ETP-4735's leading CHEVRON_COLUMN_WIDTH <col> (see renderLinesColgroup) is a
  // real, literal-pixel column too — omitting it here would leave growColumnWidth()
  // computing grow columns as if that 44px were still free, overflowing the table
  // by 44px in every hasDimensionsPanel window (table-layout: fixed doesn't clamp
  // <col> widths back down to the table's own 100%).
  return oneIfTrue(hasDimensionsPanel) * CHEVRON_COLUMN_WIDTH
    + oneIfTrue(selectable) * 40
    + oneIfTrue(showHoverActions) * 40
    + oneIfTrue(showHoverDelete) * 40
    + oneIfTrue(showLegacyDelete) * 40
    + oneIfTrue(showLegacyClone) * 40
    + oneIfTrue(showQuickActions) * 40
    + oneIfTrue(ilpHasNoAmountCol) * 160
    + oneIfTrue(ilpTrailing) * 48;
}

/**
 * Renders the <colgroup> that drives column widths in add-row-only mode
 * (hideHeader=true), mirroring InlineLinesPanel's flex layout with fixed
 * pixel widths for flex-grow:0 columns and calc()-based widths (via
 * growColumnWidth) for flex-grow:1 columns — see growColumnWidth() above for
 * why grow columns can't be left width-less. Returns null when the table
 * renders its own header instead (table-layout: fixed then drives widths via
 * the real <TableHead> cells). Extracted from DataTable's render body so this
 * mode's branching doesn't add nesting to the parent's complexity.
 *
 * ETP-4735 — when the entity has a dimensionsPanel column, InlineLinesPanel's rows
 * reserve a leading CHEVRON_COLUMN_WIDTH slot (expand-chevron) before the checkbox.
 * This colgroup must reserve the identical slot so the add-row's inputs land under
 * the same columns as the rows above instead of drifting left by that width.
 */
export function renderLinesColgroup({
  hideHeader, selectable, visibleColumns, colFlexSpecs, fixedColsTotalPx, growCount,
  ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow,
  quickActionsEnabled, ilpHasNoAmountCol, hasDimensionsPanel,
}) {
  if (!hideHeader) return null;
  return (
    <colgroup>
      {hasDimensionsPanel && <col style={{ width: CHEVRON_COLUMN_WIDTH }} />}
      {selectable && <col style={{ width: 40 }} />}
      {visibleColumns.map((col, colIdx) => {
        const { grow, basis } = colFlexSpecs[colIdx];
        return grow === 0
          ? <col key={col.key} style={{ width: basis }} />
          : <col key={col.key} style={{ width: growColumnWidth(basis, fixedColsTotalPx, growCount) }} />;
      })}
      {/* In inlineEditable add-row mode (ilpTrailing), all row actions live
          inside InlineLinesPanel's 160px action slot — never add separate
          action cols here or the flex columns shrink by 40px. */}
      {!ilpTrailing && hoverRowActions && <col style={{ width: 40 }} />}
      {!ilpTrailing && hoverRowActions && onDeleteRow && <col style={{ width: 40 }} />}
      {!ilpTrailing && !hoverRowActions && legacyDeleteEnabled && <col style={{ width: 40 }} />}
      {!ilpTrailing && !hoverRowActions && onCloneRow && !quickActionsEnabled && <col style={{ width: 40 }} />}
      {!ilpTrailing && quickActionsEnabled && <col style={{ width: 40 }} />}
      {ilpHasNoAmountCol && <col style={{ width: 160 }} />}
      {ilpTrailing && <col style={{ width: 48 }} />}
    </colgroup>
  );
}

/**
 * Renders the header for a `multiField` column as N independently sortable
 * segments joined by `col.partSeparator` (default ' & '). Each segment sorts on
 * its own `part.key` (a real NEO field), reusing the same none→asc→desc→clear
 * cycle as any other column via `onSort(part.key)`. The direction arrow shows
 * only on the currently active part (single active part at a time).
 */
function renderMultiFieldHeaderCell(col, { sortColumn, sortDirection, onSort, locale, t, headStyle }) {
  const separator = col.partSeparator ?? ' & ';
  return (
    <TableHead
      key={col.key}
      data-testid={`column-header-${col.key}`}
      // `col.headClass` is honoured here for the same reason the single-label branch below
      // honours it: a window that pins column widths (financial-account's Figma layout) must
      // keep them when the header gains segments. Dropping it silently collapsed the column
      // to auto width, which no Product test caught because Product declares no headClass.
      className={['align-middle', col.headClass || ''].filter(Boolean).join(' ')}
      style={headStyle}
    >
      <span className="inline-flex items-center text-xs leading-4 font-semibold text-text-primary tracking-normal">
        {col.parts.map((part, partIdx) => {
          const partLabel = resolveColumnLabel(part, locale, t);
          const partSorted = sortColumn === part.key;
          const partSortable = onSort && part.sortable !== false;
          const arrow = partSorted
            ? <span className="text-primary/70 pointer-events-none ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>
            : null;
          return (
            <span key={part.key} className="inline-flex items-center">
              {partIdx > 0 && (
                <span className="mx-0.5 font-normal text-text-primary/40 select-none">{separator}</span>
              )}
              {partSortable ? (
                <button
                  type="button"
                  data-testid={`column-header-sort-${part.key}`}
                  className="inline-flex items-center cursor-pointer select-none transition-colors bg-transparent border-0 p-0 font-semibold text-inherit"
                  onClick={() => onSort(part.key)}
                >
                  {partLabel}
                  {arrow}
                </button>
              ) : (
                <span
                  data-testid={`column-header-sort-${part.key}`}
                  className="inline-flex items-center"
                >
                  {partLabel}
                  {arrow}
                </span>
              )}
            </span>
          );
        })}
      </span>
    </TableHead>
  );
}

/**
 * Renders a single sortable column header cell, including the sort-direction
 * arrow. Extracted from the `visibleColumns.map(...)` callback in DataTable's
 * header row so its onSort/isSorted branching lives in its own function.
 */
function renderColumnHeaderCell(col, colIdx, { sortColumn, sortDirection, onSort, linesLayout, locale, t }) {
  const colLabel = resolveColumnLabel(col, locale, t);
  const isSorted = sortColumn === col.key;
  const isSortable = col.sortable !== false;
  const headStyle = linesLayout === 'inlineEditable'
    ? { minWidth: columnMinWidthPx(col, colIdx) }
    : undefined;
  // `multiField` columns expose N constituent fields as independently
  // sortable header segments (e.g. "Identifier & Name"); each part cycles the
  // sort on its own NEO field key. Non-multiField columns keep the single-label
  // branch below untouched.
  if (Array.isArray(col.parts) && col.parts.length > 0) {
    return renderMultiFieldHeaderCell(col, { sortColumn, sortDirection, onSort, locale, t, headStyle });
  }
  const sortArrowClass = NUMERIC_FIELD_TYPES.has(col.type)
    ? 'left-0 -translate-x-full pr-0.5'
    : 'right-0 translate-x-full pl-0.5';
  return (
    <TableHead
      key={col.key}
      data-testid={`column-header-${col.key}`}
      className={[
        'align-middle',
        NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right' : '',
        // Opt-in fixed-width / per-column header styling. Needed by list windows
        // whose design pins column widths (e.g. financial-account's Figma layout,
        // where the "Cuenta" header must align with the row avatar). Absent =
        // unchanged auto layout, so every existing window is unaffected.
        col.headClass || '',
      ].filter(Boolean).join(' ')}
      style={headStyle}
    >
      {onSort && isSortable ? (
        <button
          type="button"
          className={`relative inline-block text-xs leading-4 font-semibold text-text-primary tracking-normal cursor-pointer select-none transition-colors bg-transparent border-0 p-0 ${NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right' : 'text-left'}`}
          onClick={() => onSort(col.key)}
        >
          <span className="inline-flex items-center gap-1 align-middle">
            {colLabel}
            {col.computed?.mode === 'stored' && <ComputedFreshnessHint computed={col.computed} data-testid="ComputedFreshnessHint__eb5261" />}
          </span>
          {isSorted && (
            <span className={`absolute top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none ${sortArrowClass}`}>{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
          )}
        </button>
      ) : (
        <span className={`relative inline-block text-xs leading-4 font-semibold text-text-primary tracking-normal${NUMERIC_FIELD_TYPES.has(col.type) ? ' text-right' : ''}`}>
          <span className="inline-flex items-center gap-1 align-middle">
            {colLabel}
            {col.computed?.mode === 'stored' && <ComputedFreshnessHint computed={col.computed} data-testid="ComputedFreshnessHint__eb5261" />}
          </span>
          {isSorted && (
            <span className={`absolute top-1/2 -translate-y-1/2 text-primary/70 pointer-events-none ${sortArrowClass}`}>{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
          )}
        </span>
      )}
    </TableHead>
  );
}

// Shared delete-click handler for both the hover-actions delete button and
// the legacy delete button: marks the row as "deleting" for the spinner,
// awaits the caller's onDeleteRow, then always clears the flag. Extracted
// so the try/finally bookkeeping isn't duplicated (and doesn't add nested
// complexity) in each button's onClick in TableDataRow.
async function handleDeleteRowClick(row, onDeleteRow, setDeletingRows) {
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
}

/**
 * Renders a single data row: the selection checkbox, visible-column cells,
 * row-action cells (hover edit/delete, or legacy delete/clone), and the
 * quick-actions overlay cell. Extracted from the `filteredData.map(...)` body
 * that used to live inside `DataTable` so per-row branching does not nest
 * inside — and inflate — the parent component's cognitive complexity.
 */
function TableDataRow({
  row,
  idx,
  selectable,
  isRowSelectable,
  isChecked,
  toggleRow,
  visibleColumns,
  trailingHoverColumn,
  renderCellValue,
  onRowClick,
  onNavigate,
  selectedRowBg,
  selectedId,
  selectedRowId,
  rowHoverStyle,
  editingRowId,
  handleRowActivation,
  hoverRowActions,
  onSaveRow,
  onCancelEdit,
  onEditRow,
  onDeleteRow,
  deletingRows,
  setDeletingRows,
  ui,
  legacyDeleteEnabled,
  onCloneRow,
  quickActionsEnabled,
  rowQuickActions,
  entity,
  apiBaseUrl,
  token,
  hasDimensionsPanel = false,
}) {
  const isSelectedLine = selectedRowId != null && row.id === selectedRowId;
  const rowDisabled = isRowSelectable && !isRowSelectable(row);

  return (
    <TableRow
      role="row"
      data-testid={`row-${row.id ?? idx}`}
      data-row-status={row.documentStatus}
      onClick={() => {
        if (editingRowId === row.id) return;
        handleRowActivation(row, idx);
      }}
      className={getRowClassName({
        onRowClick, onNavigate, isChecked, selectedRowBg, selectedId, row, isSelectedLine, rowHoverStyle,
      })}
    >
      {/* ETP-4735 — see the matching comment on InlineAddRow's leading cell. */}
      {hasDimensionsPanel && <TableCell aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableCell__eb5261" />}
      {selectable && (
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
      )}
      {visibleColumns.map(col => {
        const isTrailingHover = trailingHoverColumn != null && col === trailingHoverColumn;
        return (
          <TableCell
            key={col.key}
            data-testid={`cell-${row.id ?? idx}-${col.key}`}
            data-value={row[col.key] ?? ''}
            className={[
              'text-sm',
              NUMERIC_FIELD_TYPES.has(col.type) ? 'text-right tabular-nums' : '',
              // Opt-in per-column cell styling, the body-side counterpart of
              // `col.headClass` (see renderColumnHeaderCell). Lets a window pin a
              // column's width so header and cells stay aligned. Absent = unchanged.
              col.cellClass || '',
            ].filter(Boolean).join(' ')}
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
                className="h-8 w-8 flex items-center justify-center rounded-full text-[var(--status-success-fg)] hover:bg-[var(--status-success-bg)] transition-all"
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
                className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))] transition-all"
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
                  className="h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))] transition-all"
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
                    await handleDeleteRowClick(row, onDeleteRow, setDeletingRows);
                  }}
                  className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 h-8 w-8 flex items-center justify-center rounded-full text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)] transition-all"
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
                  await handleDeleteRowClick(row, onDeleteRow, setDeletingRows);
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
                  className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 flex items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80 transition-all"
                  style={{ width: 26, height: 26 }}
                  aria-label={ui('cloneOrderBtn')}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" data-testid="Copy__eb5261" />
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-medium text-primary-foreground bg-foreground rounded whitespace-nowrap opacity-0 group-hover/clonebtn:opacity-100 pointer-events-none transition-opacity z-10">
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
            hideDeleteButton={rowQuickActions.hideDeleteButton}
            readOnly={rowQuickActions.readOnly}
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
}

/**
 * Renders the table body content: the shared empty-state row when there is
 * no data (and no active add-row), otherwise one `TableDataRow` per visible
 * record. Extracted so the empty/rows branch and the per-row nesting it used
 * to wrap don't count against DataTable's own cognitive complexity.
 */
function renderTableRows({
  hideDataRows, filteredData, addRow, colSpan, hasActiveFilter, data, selectedRows,
  ...rowProps
}) {
  if (hideDataRows) return null;
  if (filteredData.length === 0 && !addRow?.active) {
    return (
      <TableRow data-empty-state="" data-testid="TableRow__eb5261">
        <TableCell colSpan={colSpan} className="p-0" data-testid="TableCell__eb5261">
          <EmptyState
            hasFilter={hasActiveFilter}
            totalCount={data.length}
            data-testid="EmptyState__eb5261" />
        </TableCell>
      </TableRow>
    );
  }
  return filteredData.map((row, idx) => (
    <TableDataRow
      key={row.id ?? idx}
      row={row}
      idx={idx}
      isChecked={selectedRows.has(row.id)}
      {...rowProps}
      data-testid="TableDataRow__eb5261"
    />
  ));
}

/**
 * Renders the footer row showing per-column totals (currently only `amount`
 * columns) plus the matching row-action spacer cells. Returns null when
 * there is nothing to total or the caller opted out via `showFooterTotals`.
 * Extracted so its column-mapping branches don't nest inside DataTable.
 */
function renderFooterRow({
  totals, showFooterTotals, selectable, visibleColumns, filteredData,
  hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled,
  hasDimensionsPanel = false,
}) {
  if (!totals || !showFooterTotals) return null;
  return (
    <TableFooter data-testid="TableFooter__eb5261">
      <TableRow className="font-medium" data-testid="TableRow__eb5261">
        {/* ETP-4735 — see the matching comment on InlineAddRow's leading cell. */}
        {hasDimensionsPanel && <TableCell aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableCell__eb5261" />}
        {selectable && <TableCell data-testid="TableCell__eb5261" />}
        {visibleColumns.map((col) => (
          <TableCell
            key={col.key}
            className={col.type === 'amount' ? 'tabular-nums text-right font-semibold' : ''}
            data-testid="TableCell__eb5261">
            {col.type === 'amount'
              ? formatCurrency(filteredData[0]?.['currency$_identifier'], totals[col.key])
              : ''}
          </TableCell>
        ))}
        {renderRowActionFooterCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled)}
        {quickActionsEnabled && <TableCell data-testid="TableCell__eb5261" />}
      </TableRow>
    </TableFooter>
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
  // ETP-5075 — router navigate, for FK columns in the fkNavigation registry. Passed in
  // rather than pulled from useNavigate() so DataTable stays Router-agnostic (same reason
  // onNavigate is a prop); absent ⇒ no cell is clickable.
  navigate,
  selectedRowId,
  selectedId,
  rowHoverStyle = 'tint',
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
   *     hideDeleteButton?: boolean,          // unconditional Delete opt-out (window.hideDeleteButton)
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
  // ETP-4656 — partial bulk-delete outcome: bump `deselectTrigger` with the ids
  // of the rows that succeeded (`deselectRowIds`) so only those drop out of the
  // internal selection Set, leaving the failed rows checked. A dedicated pair
  // instead of overloading `clearSelectionTrigger` (which always clears
  // everything) so existing full-clear callers stay untouched.
  deselectTrigger = 0,
  deselectRowIds = [],
  hideHeader = false,
  hideDataRows = false,
}) {
  const t = useLabel(labelOverrides);
  const tMenu = useMenuLabel();
  const ui = useUI();
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  // ETP-4520 — capability map for visibleWhenCapability-gated columns (below).
  const capabilities = useCapabilitiesSafe();
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

  useEffect(() => {
    if (!deselectTrigger || !deselectRowIds?.length) return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      deselectRowIds.forEach((id) => next.delete(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deselectTrigger]);

  const [optimisticToggles, setOptimisticToggles] = useState({});
  const [savingToggles, setSavingToggles] = useState({});
  const [deletingRows, setDeletingRows] = useState({});

  // Track add-row live values so displayIf-controlled columns can auto-hide
  // their headers when neither any saved row nor the add-row activates them.
  const [addRowValues, setAddRowValues] = useState({});
  useEffect(() => { if (!addRow?.active) setAddRowValues({}); }, [addRow?.active]);

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

  // Build a map of { columnKey → controllerKey } from addLineFields displayIf entries.
  // addRow.fields is the entry array directly (set by DetailView as addLineFields.entry).
  const displayIfControllers = useMemo(() => {
    const map = {};
    for (const f of (addRow?.fields ?? [])) {
      if (f.displayIf) map[f.key] = f.displayIf;
    }
    return map;
  }, [addRow?.fields]);

  // ETP-4735 — a `dimensionsPanel` column is never a real grid column: InlineLinesPanel
  // excludes it too and instead renders its own leading expand-chevron + sub-row UX (see
  // hasDimensionsPanel there). DataTable previously had no equivalent exclusion, so its
  // add-row-only companion table (rendered under InlineLinesPanel when addRow.active) rendered
  // a real ~120px placeholder cell for it — both cluttering the row and, via
  // growColumnWidth()'s fixedColsTotalPx, shrinking the grow column ahead of it (e.g. product),
  // shifting every column after it (e.g. movementQuantity) out of alignment with the rows above.
  const hasDimensionsPanel = useMemo(
    () => (columns || []).some(c => c.type === 'dimensionsPanel'),
    [columns]
  );

  const visibleColumns = useMemo(() => {
    // ETP-4803 — drop columns that never render as a grid column in either
    // lines renderer (e.g. `dimensionsPanel`) BEFORE any other filter. This
    // must mirror InlineLinesPanel's own `visibleColumns` exactly, since
    // DataTable's hidden `hideHeader` colgroup replicates that flex layout's
    // math — a phantom column here desyncs `growColumnWidth()` for every
    // subsequent column in the inline add-row form.
    let base = columns.filter(isLineGridColumn);
    // Start from explicit hiddenColumns prop
    base = hiddenColumns.length > 0 ? base.filter(col => !hiddenColumns.includes(col.key)) : base;
    // Auto-hide columns whose controlling field (displayIf) is inactive in ALL
    // saved rows AND in the current add-row values.
    if (Object.keys(displayIfControllers).length > 0) {
      const isTruthy = (v) => v === true || v === 'Y' || v === 'true';
      base = base.filter(col => {
        const ctrl = displayIfControllers[col.key];
        if (!ctrl) return true;
        const anyDataRow = (data ?? []).some(row => isTruthy(row[ctrl]));
        const addRowActive = isTruthy(addRowValues[ctrl]);
        return anyDataRow || addRowActive;
      });
    }
    // ETP-4520 — drop columns gated by a capability the current role doesn't
    // hold (e.g. `posted` on sales-invoice/purchase-invoice, restricted to
    // "showAccountingFields"). Absent visibleWhenCapability ⇒ always kept.
    base = base.filter(col => isCapabilityVisible(capabilities, col.visibleWhenCapability));
    return base;
  }, [columns, hiddenColumns, displayIfControllers, data, addRowValues, capabilities]);

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
      setOptimisticToggles, setSavingToggles, onDataMutated, ui,
    });
  }, [apiBaseUrl, entity, onDataMutated, token, ui]);

  const renderCellValue = (row, col) => {
    if (typeof col.render === 'function') return col.render(row, { entity, token, apiBaseUrl });

    const { display, rawValue, toggleKey } = resolveCellDisplay(row, col, optimisticToggles, displayCatalogMaps);
    const renderer = CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default;
    // ETP-5075 — wrap at the dispatch point, not inside each renderer, so a navigable FK
    // column works whatever cell type it resolves to. Fails closed: no registry entry, no
    // resolvable id, or no `navigate` prop (DataTable is deliberately Router-agnostic) all
    // fall through to the renderer's own output, untouched.
    const navigateTo = navigate ? resolveFkNavigation(col.column, row) : null;
    const rendered = renderer({
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
      token,
      apiBaseUrl,
    });
    if (!navigateTo) return rendered;
    return (
      // stopPropagation is load-bearing: without it the row's own onNavigate/onRowClick
      // also fires and wins, sending the user to this window's record instead.
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); navigate(navigateTo); }}
        className="inline-flex items-center gap-1 text-left underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
        data-testid={`fk-link-${col.key}`}>
        {rendered}
        <ArrowUpRight className="h-3 w-3 shrink-0" data-testid="ArrowUpRight__eb5261" />
      </button>
    );
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
  // ETP-5030 — InlineLinesPanel's `computeRowClassName` mirrors the `bg-primary/5` literal for tab grids; keep the two in sync.
  const selectedRowBg = hoverRowActions ? 'bg-[hsl(var(--muted))]' : 'bg-primary/5';

  // In inlineEditable add-row mode (hideHeader=true), the DataTable only renders
  // the new-line form while InlineLinesPanel owns the existing rows. InlineLinesPanel
  // always appends a 48px right spacer, plus a 160px action slot when no amount column
  // exists. Mirror those here so flexible columns grow to the same width in both.
  const ilpHasNoAmountCol = hideHeader && linesLayout === 'inlineEditable'
    && !visibleColumns.some(c => c.type === 'amount');
  const ilpTrailing = hideHeader && linesLayout === 'inlineEditable';

  // Precompute the flex specs once so the colgroup below can both build the
  // fixed/grow <col> widths AND feed growColumnWidth() the totals it needs
  // (sum of every fixed-width slot + count of growing columns) — see the
  // colgroup comment for why growing columns can't just be left width-less.
  const colFlexSpecs = hideHeader ? visibleColumns.map((col, colIdx) => flexSpec(col, colIdx)) : [];
  const growCount = colFlexSpecs.filter((s) => s.grow > 0).length;
  const fixedColsBasisPx = colFlexSpecs.filter((s) => s.grow === 0).reduce((sum, s) => sum + s.basis, 0);
  const fixedColsTotalPx = fixedColsBasisPx + computeActionColsWidthPx({
    selectable, ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled,
    onCloneRow, quickActionsEnabled, ilpHasNoAmountCol, hasDimensionsPanel,
  });

  return (
    <div className="space-y-0">
      {/*
        `overflow-y-visible` next to `overflow-x-auto` is computed as `auto` by the CSS
        spec, so this wrapper does clip vertically. With `rowHoverStyle="elevated"` the
        hovered row's `shadow-lg` reaches ~22px below it (10px offset + 15px blur - 3px
        spread); for the LAST row that lands past the table and got clipped away, which
        read as "hover doesn't work on the last row". Overflow clips at the PADDING box,
        so 24px of bottom padding gives the shadow room inside the visible area.
      */}
      <div
        className={[
          linesLayout === 'inlineEditable' ? '[&>div]:!overflow-visible' : 'overflow-x-auto overflow-y-visible',
          rowHoverStyle === 'elevated' ? 'pb-6' : '',
        ].filter(Boolean).join(' ')}
      >
        <Table style={getTableContainerStyle(hideHeader)} data-testid="Table__eb5261">
          {/* When hideHeader is true (add-row-only mode), a <colgroup> drives column
              widths — see renderLinesColgroup() above for the full rationale. */}
          {renderLinesColgroup({
            hideHeader, selectable, visibleColumns, colFlexSpecs, fixedColsTotalPx, growCount,
            ilpTrailing, hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow,
            quickActionsEnabled, ilpHasNoAmountCol, hasDimensionsPanel,
          })}
          <TableHeader
            className={linesLayout === 'inlineEditable' ? 'sticky top-0 z-20 bg-card' : ''}
            aria-hidden={hideHeader || undefined}
            style={hideHeader ? { display: 'none' } : undefined}
            data-testid="TableHeader__eb5261">
            <TableRow className="border-b border-border/40" data-testid="TableRow__eb5261">
              {/* ETP-4735 — mirrors the leading chevron cell added to InlineAddRow/TableDataRow
                  below: keeps this table's own header self-consistent with its body whenever a
                  dimensionsPanel column is present (only actually exercised in hideHeader mode,
                  where InlineLinesPanel's rows are what this table's add-row must align with —
                  see renderLinesColgroup's leading <col>). */}
              {hasDimensionsPanel && <TableHead aria-hidden="true" style={{ width: CHEVRON_COLUMN_WIDTH }} data-testid="TableHead__eb5261" />}
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
              {visibleColumns.map((col, colIdx) => renderColumnHeaderCell(col, colIdx, { sortColumn, sortDirection, onSort, linesLayout, locale, t }))}
              {renderRowActionHeaderCells(hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled)}
              {quickActionsEnabled && <TableHead className="w-10 px-2" aria-hidden="true" data-testid="TableHead__eb5261" />}
            </TableRow>
          </TableHeader>
          <TableBody data-testid="TableBody__eb5261">
            {renderTableRows({
              hideDataRows, filteredData, addRow, colSpan, hasActiveFilter, data, selectedRows,
              selectable, isRowSelectable, toggleRow, visibleColumns, trailingHoverColumn,
              renderCellValue, onRowClick, onNavigate, selectedRowBg, selectedId, selectedRowId,
              rowHoverStyle,
              editingRowId, handleRowActivation, hoverRowActions, onSaveRow, onCancelEdit,
              onEditRow, onDeleteRow, deletingRows, setDeletingRows, ui, legacyDeleteEnabled,
              onCloneRow, quickActionsEnabled, rowQuickActions, entity, apiBaseUrl, token,
              hasDimensionsPanel,
            })}
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
                onValuesChange={(vals) => { setAddRowValues(vals ?? {}); addRow.onValuesChange?.(vals); }}
                seedValues={addRow.seedValues}
                resolvedDefaults={addRow.resolvedDefaults}
                convertOptimisticPrice={addRow.convertOptimisticPrice}
                selectable={selectable}
                hasDeleteColumn={!hoverRowActions && legacyDeleteEnabled}
                hasCloneColumn={!hoverRowActions && !!onCloneRow && !quickActionsEnabled}
                hoverRowActions={hoverRowActions}
                hoverRowHasDelete={hoverRowActions && !!onDeleteRow}
                hasQuickActionsColumn={quickActionsEnabled}
                token={token}
                apiBaseUrl={apiBaseUrl}
                entity={entity}
                specName={specName}
                selectorContext={selectorContext}
                ilpHasNoAmountCol={ilpHasNoAmountCol}
                ilpTrailing={ilpTrailing}
                labelOverrides={labelOverrides}
                hasDimensionsPanel={hasDimensionsPanel}
                data-testid="InlineAddRow__eb5261" />
            )}
          </TableBody>
          {renderFooterRow({
            totals, showFooterTotals, selectable, visibleColumns, filteredData,
            hoverRowActions, onDeleteRow, legacyDeleteEnabled, onCloneRow, quickActionsEnabled,
            hasDimensionsPanel,
          })}
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
