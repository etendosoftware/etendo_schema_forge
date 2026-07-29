/**
 * Pure helpers and presentational fragments extracted from DetailView.jsx (T31).
 *
 * These were all defined at DetailView's module scope, taking explicit params and
 * holding no component state. They lived there only because that is where they
 * grew: 60 of them were exported without a single importer, and the rest were
 * exported so tests could reach them. Moving them here reclaims ~1.6k lines from
 * the god component without changing a line of behaviour.
 *
 * DetailView.jsx re-exports the names its test suites import, so no test needed
 * editing for this move (R1).
 */
import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { AddLineButton } from '@/components/ui/add-line-button.jsx';
import { X, MoreVertical, Check, Save, Printer, Mail, Trash2, Loader2, Lock, Undo2 } from 'lucide-react';
import PaymentLifecycleConfirmModal from '@/windows/custom/shared/PaymentLifecycleConfirmModal';
import { useEntity } from '@/hooks/useEntity';
import { useMenuLabel, useUI } from '@/i18n';
import DocumentTotalsPanel from './DocumentTotalsPanel.jsx';
import BalanceFooterPanel from './BalanceFooterPanel.jsx';
import { computeBalance } from '@/lib/balanceTotals';
import LinesSelectionBar from './LinesSelectionBar.jsx';
import { evalTabReadOnly } from './evalTabReadOnly.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { formatAmount } from '@/lib/formatAmount.js';
import { isDeleteVisibleForRecord } from '@/utils/recordActions.js';
import DocumentStatusPill from './DocumentStatusPill.jsx';
import { Dialog } from '@/components/ui/dialog.jsx';
import { buildCalloutFormState, roundAmounts } from '@/lib/lineFieldChange.js';
import { toast } from 'sonner';

/**
 * Evaluate a simple Etendo display-logic expression (@Field@='Value') against record data.
 * Returns true (visible) if the expression cannot be parsed or if the field is missing from data.
 */
export function sidePanelWrapperCls(hasSidePanel, linesLayout) {
  // Stack the side panel below the content on narrow viewports (e.g. when the
  // devtools console is open) and only place it beside the content once there
  // is room (lg+). A rigid side-by-side row would otherwise overlap the
  // header/lines when the panel can't shrink.
  if (hasSidePanel) return 'flex flex-col lg:flex-row items-stretch gap-0 min-h-full';
  if (linesLayout === 'inlineEditable') return 'flex flex-col';
  return '';
}

export function evalDisplayLogicRaw(expr, data) {
  if (!expr) return true;
  const clauses = [...expr.matchAll(/@(\w+)@\s*(!?=)\s*'([^']*)'/g)];
  if (clauses.length === 0) return true;
  return clauses.every(([, fieldRef, op, expected]) => {
    const key = fieldRef[0].toLowerCase() + fieldRef.slice(1);
    if (!(key in (data || {}))) return true; // field absent → default visible
    const rawVal = data[key];
    // Normalize boolean API values to Etendo string equivalents (true→'Y', false→'N')
    const boolAsYN = rawVal ? 'Y' : 'N';
    const actual = typeof rawVal === 'boolean' ? boolAsYN : String(rawVal ?? '');
    return op === '=' ? actual === expected : actual !== expected;
  });
}

/**
 * Collapsible section that hides itself entirely when children render as null.
 */
export function CollapsibleSection({ title, children }) {
  const ref = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    // Check for actual form fields — wrapper divs always render even when
    // EntityForm returns null, so we must look for real input elements.
    if (ref.current) {
      const hasFields = ref.current.querySelector(
        'input, select, textarea, [role="combobox"], [role="spinbutton"]'
      ) !== null;
      setEmpty(!hasFields);
    }
  });

  if (empty) return <div ref={ref} className="hidden">{children}</div>;

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground py-1 select-none list-none flex items-center gap-1">
        <svg className="h-4 w-4 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        {title}
      </summary>
      <div className="pt-2" ref={ref}>
        {children}
      </div>
    </details>
  );
}

/**
 * Compute the padding classes for the main detail content column.
 *
 * Combinations:
 *  - `hasSidebar` true → reserved space for the right side panel (pr-2 inline,
 *    pl-6 pr-2 classic).
 *  - `hasSidebar` false, variant `'panel'` → standalone Panel tab (pr-6 inline,
 *    px-6 classic).
 *  - `hasSidebar` false, variant `'content'` → form content card (no padding
 *    inline because the inner card supplies its own, px-6 classic).
 *
 * Extracted from inline JSX to avoid the nested-ternary anti-pattern Sonar
 * S3358 was flagging inside the className templates.
 */
export function detailContentPadding(linesLayout, hasSidebar, variant, compact = false, paddingXOverride = null) {
  const isInline = linesLayout === 'inlineEditable';
  if (hasSidebar) return (isInline || compact) ? 'px-2 pb-2' : 'pr-2';
  if (variant === 'panel') return isInline ? 'pr-6' : (paddingXOverride ?? 'px-6');
  return isInline ? '' : (paddingXOverride ?? 'px-6');
}

/**
 * Resolve the `onRowClick` handler for a secondary-tab table.
 *
 * Priority:
 *  1. `customAddModal` tabs (e.g. Dirección) → click opens the popup editor.
 *  2. Tabs with a `Form` AND a non-inline layout → click selects the row for
 *     the side-panel form.
 *  3. Inline-editable tabs → no row click handler. Editing happens in place via
 *     the pencil action; opening a side panel would defeat that UX.
 */
export function resolveSecondaryRowClickHandler(st, { openCustomModal, openSecondaryLine, linesLayout }) {
  if (st.customAddModal) return openCustomModal;
  if (st.Form && linesLayout !== 'inlineEditable') return openSecondaryLine;
  return undefined;
}

/**
 * Run the add-line action for a secondary tab and surface any rejection.
 *
 * `customAddModal` tabs open the popup editor; the rest toggle the inline
 * add-line row. Both handlers are async — if their promise rejects we log the
 * failure (with the offending tab key) instead of swallowing it silently.
 *
 * @returns {Promise} the (already error-handled) promise, so callers/tests can await it.
 */
export function runAddLineAction(st, { handleCustomModalAddClick, handleSecondaryAddLineToggle }) {
  const run = st.customAddModal
    ? handleCustomModalAddClick(st.key)
    : handleSecondaryAddLineToggle(st.key);
  return run.catch((err) => {
    console.error(`Add line action failed for tab '${st.key}':`, err);
  });
}

export function deriveTaxRateFromGross(gross, lineConfig, selectedLine) {
  if (gross <= 0) return null;
  const disc = lineConfig.discountField ? (parseFloat(String(selectedLine[lineConfig.discountField] ?? '')) || 0) : 0;
  const net = parseFloat(String(selectedLine.lineNetAmount ?? '')) || 0;
  if (net > 0) {
    // Etendo stores LINENETAMT = qty × listPrice (before discount).
    // Adjust by discount to get the actual taxable base before deriving the tax rate.
    const taxableNet = disc > 0 ? net * (1 - disc / 100) : net;
    return (gross / taxableNet - 1) * 100;
  }
  const qty = parseFloat(String(selectedLine[lineConfig.qtyField] ?? '')) || 0;
  const price = parseFloat(String(selectedLine[lineConfig.priceField] ?? selectedLine.unitPrice ?? '')) || 0;
  const lineNet = qty * price * (1 - disc / 100);
  if (lineNet > 0) return (gross / lineNet - 1) * 100;
  return null;
}

export function normalizePatchFieldValues(patchEdits, fieldValues) {
  for (const [k, v] of Object.entries(patchEdits)) {
    if (k.endsWith('$_identifier')) continue;
    // NEO Headless PATCH expects camelCase API keys, not DB column names.
    // Always use k (the API key) as the field name.
    // Convert numeric strings to numbers for BigDecimal compatibility.
    // Only strip when the value is already in standard format (no commas).
    // Comma removal is skipped to avoid locale corruption (e.g. Spanish "10,50" = 10.5).
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
      fieldValues[k] = parseFloat(v);
    } else {
      fieldValues[k] = v;
    }
  }
}

export function applyCalloutFieldUpdates(updates, ctx) {
  const { data, triggerField, userTouchedRef, appliedFields, hook, api, catalogs } = ctx;
  for (const [key, entry] of Object.entries(updates)) {
    // Skip empty callout values if the field already has a non-empty value
    // (e.g., callout clears warehouse but defaults already set it)
    const currentVal = data[key];
    const userHasValue = currentVal !== '' && currentVal != null;
    if ((entry.value === '' || entry.value == null) && userHasValue) {
      continue;
    }
    // Protect user-touched fields from being overwritten by collateral updates
    // coming from a callout triggered by a different field. The trigger field
    // itself always wins (it was just changed by the user).
    if (key !== triggerField && userTouchedRef.current.has(key) && userHasValue) {
      continue;
    }
    appliedFields.set(key, entry.value);
    hook.handleChange(key, entry.value);
    handleEntryIdentifierChange(entry, hook, key, api, catalogs);
  }
}

export function applyOneComboEntry(key, combo, ctx) {
  const { data, userTouchedRef, appliedFields, hook } = ctx;
  let selectedVal = combo.selected;
  let selectedLabel = combo._identifier;
  // Auto-select first entry if no explicit selection (e.g., BP address combo)
  if (selectedVal == null && Array.isArray(combo.entries) && combo.entries.length > 0) {
    selectedVal = combo.entries[0].id;
    selectedLabel = combo.entries[0].identifier || combo.entries[0]._identifier;
  }
  if (selectedVal == null) return;
  // Protect user-touched fields from collateral combo updates
  const currentVal = data[key];
  const userHasValue = currentVal !== '' && currentVal != null;
  if (userTouchedRef.current.has(key) && userHasValue) return;
  appliedFields.set(key, selectedVal);
  hook.handleChange(key, selectedVal);
  if (selectedLabel) {
    hook.handleChange(key + '$_identifier', selectedLabel);
  }
}

export function applyCalloutComboUpdates(combos, ctx) {
  const { triggerField } = ctx;
  for (const [key, combo] of Object.entries(combos)) {
    // Never override the field the user just changed via its own combo response.
    // The callout may refresh the list of options for that field, but the user's
    // explicit selection must always win — auto-selecting the first entry would
    // silently revert their choice (e.g., NC → FAC on invoice doc type).
    if (key === triggerField) continue;
    applyOneComboEntry(key, combo, ctx);
  }
}

/**
 * Folds the selector item's top-level fields into the callout snapshot:
 * maps standardPrice to gross/net price keys based on isTaxIncluded, and
 * exposes every other scalar field as a `${fieldKey}_${name}` context key
 * (without overwriting one the snapshot already has).
 */
export function mergeSelectorContextFields(selectedItem, snapshot, fieldKey) {
  for (const [topField, topVal] of Object.entries(selectedItem)) {
    if (topField === 'id' || topField === '_aux' || topField === 'label'
        || topField === 'name' || topField === 'searchKey'
        || typeof topVal === 'object' || topVal === null) continue;
    if (topField === 'standardPrice' && topVal != null) {
      const isGross = selectedItem.isTaxIncluded !== false;
      if (isGross) {
        snapshot.grossUnitPrice = topVal;
        snapshot.grossListPrice = topVal;
      } else {
        snapshot.unitPrice = topVal;
        snapshot.listPrice = topVal;
      }
      continue;
    }
    const ctxKey = `${fieldKey}_${topField}`;
    if (!(ctxKey in snapshot)) snapshot[ctxKey] = topVal;
  }
}

/**
 * Folds the selector item's `_aux` suffixed values (e.g. _PSTD, _PLIM, _UOM)
 * into the callout snapshot, keyed as `${fieldKey}${suffix}`.
 */
export function mergeSelectorAuxFields(selectedItem, snapshot, fieldKey) {
  if (selectedItem._aux) {
    for (const [suffix, auxVal] of Object.entries(selectedItem._aux)) {
      snapshot[fieldKey + suffix] = auxVal;
    }
  }
}

/**
 * Applies an optimistic local update to a child row after a successful PATCH,
 * folding in the callout-derived values (incl. $_identifier keys for FK
 * outputs like tax$_identifier) so the row UI reflects the full snapshot
 * without a refetch.
 */
export function applyLocalChildRowUpdate(derivedUpdates, fieldKey, payloadValue, fieldValues, opts, hook, row) {
  const localUpdate = {...derivedUpdates, [fieldKey]: payloadValue};
  if (fieldValues.unitPrice !== undefined) localUpdate.unitPrice = fieldValues.unitPrice;
  if (opts?.identifier !== undefined) {
    localUpdate[fieldKey + '$_identifier'] = opts.identifier;
  }
  hook.handleUpdateChild?.(row.id, localUpdate);
}

/**
 * Seeds the PATCH body from a cleaned row, coercing each value and skipping
 * `$_identifier` keys and internal markers/metadata (_identifier, _entityName,
 * $ref, id) that are not valid persisted fields.
 */
export function collectRowFieldValues(cleanRow, fieldValues, coerce) {
  for (const [k, v] of Object.entries(cleanRow)) {
    if (k.endsWith('$_identifier')) continue;
    // Skip internal markers and metadata that aren't valid fields.
    if (k === '_identifier' || k === '_entityName' || k === '$ref' || k === 'id') continue;
    fieldValues[k] = coerce(v);
  }
}

/**
 * Builds the className for a secondary tab's content wrapper, disabling pointer
 * events when the view is embedded (read-only) inside another detail view.
 */
export function getSecondaryTabContentClassName(secondaryTabContentPaddingT, embedded) {
  return `${secondaryTabContentPaddingT} flex flex-col gap-3${embedded ? ' pointer-events-none' : ''}`;
}

/**
 * Returns the inline-lines table ref for a secondary tab when the lines layout
 * is `inlineEditable`, otherwise undefined (no ref wiring for read-only tables).
 */
export function getSecondaryLinesTableRef(linesLayout, getSecondaryInlineLinesRef, st) {
  return linesLayout === 'inlineEditable' ? getSecondaryInlineLinesRef(st.key) : undefined;
}

/**
 * Returns the `onEditRow` handler for a secondary tab: tabs that use a custom
 * add/edit modal open the popup editor; other tabs edit in place (undefined).
 */
export function getSecondaryEditRowHandler(st, setCustomModalState) {
  return st.customAddModal
      ? (row) => setCustomModalState({key: st.key, rowId: row.id})
      : undefined;
}

/**
 * Returns the `onSelectionChange` handler for a secondary tab when the lines
 * layout is `inlineEditable` (tracks selected rows per tab), otherwise undefined.
 */
export function getSecondarySelectionChangeHandler(linesLayout, setSecondarySelectedRows, st) {
  return linesLayout === 'inlineEditable'
      ? (rows) => setSecondarySelectedRows(prev => ({...prev, [st.key]: rows}))
      : undefined;
}

export function getSecondaryRowUpdateHandler(st, linesLayout, ctx) {
  const { api, apiBaseUrl, secondaryHooks, stIdx, token, ui, extractErrorMessage, isDocumentReadOnly, hook } = ctx;
  return !st.customAddModal && linesLayout === 'inlineEditable' && !isDocumentReadOnly ? async (row, fieldKey, value, opts) => {
    const childUrl = api?.crud?.[st.key]?.detailUrl?.replace('{id}', row.id)
        || `${apiBaseUrl}/${st.key}/${row.id}`;
    const includesIdentifier = opts?.identifier !== undefined;
    const optimistic = includesIdentifier
        ? {[fieldKey]: value, [`${fieldKey}$_identifier`]: opts.identifier}
        : {[fieldKey]: value};
    // Snapshot the previous values so we can revert on failure.
    const previous = includesIdentifier
        ? {[fieldKey]: row[fieldKey], [`${fieldKey}$_identifier`]: row[`${fieldKey}$_identifier`]}
        : {[fieldKey]: row[fieldKey]};
    secondaryHooks[stIdx]?.handleUpdateChild?.(row.id, optimistic);
    let res;
    try {
      res = await fetch(childUrl, {
        method: 'PATCH',
        headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), 'Content-Type': 'application/json'},
        body: JSON.stringify({[fieldKey]: value}),
      });
    } catch (err) {
      secondaryHooks[stIdx]?.handleUpdateChild?.(row.id, previous);
      toast.error(err?.message || ui('networkError'));
      throw err;
    }
    if (res.ok) {
      const updated = await res.json().catch(() => null);
      // Server response wins over the optimistic cache when present
      // — keeps any callout-driven fields the backend computed.
      // NEO wraps the saved record in {response:{data:[...]}}.
      const serverRow = updated?.response?.data?.[0] ?? null;
      if (serverRow) secondaryHooks[stIdx]?.handleUpdateChild?.(row.id, serverRow);
      // ETP-4029: editing rate/foreignAmount here also updates the invoice
      // header's hidden eTGOCurrencyRate on the backend (reverse sync — see
      // InvoiceExchangeRateHandler). Without this, the header's currency-rate
      // picker keeps showing the stale value until a manual reload.
      // refreshHeaderTotals is the same lightweight, non-disruptive header
      // refresh already used after primary-line edits — it re-GETs the header
      // and merges in only the fields the user hasn't touched, so any of the
      // user's own in-progress unsaved header edits survive untouched.
      //
      // clearUserChangedKey('eTGOCurrencyRate') runs first, and ONLY for this
      // one field: if the user had earlier edited the rate via the header's
      // own CurrencyRatePicker in this same visit (already saved), that edit
      // permanently marks eTGOCurrencyRate as "user changed" for the rest of
      // the session (see useEntity.handleChange) — refreshHeaderTotals would
      // then refuse to overwrite it, leaving the header stuck on the old
      // value even though the tab's edit just persisted a newer one. This is
      // a narrow, deliberate exception for this specific cross-surface sync;
      // see the full rationale on clearUserChangedKey's definition.
      if (st.key === 'exchangeRates' && hook?.selected?.id) {
        hook.clearUserChangedKey('eTGOCurrencyRate');
        hook.refreshHeaderTotals(hook.selected.id);
      }
    } else {
      secondaryHooks[stIdx]?.handleUpdateChild?.(row.id, previous);
      const msg = await extractErrorMessage(res);
      toast.error(msg || ui('networkError'));
      throw new Error(msg || 'PATCH failed');
    }
  } : undefined;
}

/**
 * Build the add / save-line / delete handlers for a secondary table tab.
 * Extracted verbatim from the SecondaryTableTab call site so the logic is
 * unit-testable without a replica. Called once per tab per render with the
 * current render's values, preserving the original closure-over-render-scope
 * behavior of the former inline closures.
 *
 * @param {object} deps
 * @param {object} deps.st - current secondary tab descriptor
 * @param {number} deps.stIdx - current secondary tab index
 * @param {object} deps.api - resolved API config (for crud detail URLs)
 * @param {string} deps.apiBaseUrl - base URL for NEO Headless requests
 * @param {string} [deps.token] - bearer token
 * @param {object} deps.secondaryHooks - per-tab child entity hooks
 * @param {Function} deps.ui - i18n label resolver
 * @param {Function} deps.extractErrorMessage - response error extractor
 * @param {Function} deps.confirmDelete - delete confirmation prompt
 * @param {object} deps.secondaryInlineLinesRefs - refs to inline line tables
 * @param {object} deps.selectedSecondaryLine - currently open secondary line
 * @param {object} deps.secondaryLineEdits - pending edits for the open line
 * @param {object} deps.secondarySelectedRows - selected rows per tab key
 * @param {Function} deps.setAddingSecondaryLine
 * @param {Function} deps.setSavingSecondaryLine
 * @param {Function} deps.setSelectedSecondaryLine
 * @param {Function} deps.setSecondaryLineEdits
 * @param {Function} deps.setSecondaryLineEditColumns
 * @param {Function} deps.setSecondaryDeleting
 * @param {Function} deps.setSecondarySelectedRows
 * @returns {{onAdd: Function, onSaveLine: Function, onDelete: Function}}
 */
export function buildSecondaryLineHandlers(deps) {
  const {
    st, stIdx, api, apiBaseUrl, token, secondaryHooks, ui,
    extractErrorMessage, confirmDelete, secondaryInlineLinesRefs,
    selectedSecondaryLine, secondaryLineEdits, secondarySelectedRows,
    setAddingSecondaryLine, setSavingSecondaryLine, setSelectedSecondaryLine,
    setSecondaryLineEdits, setSecondaryLineEditColumns, setSecondaryDeleting,
    setSecondarySelectedRows,
  } = deps;

  const onAdd = async (lineData) => {
    const entryKeys = new Set(st.addLineFields.entry.map(f => f.key));
    const filtered = {};
    for (const [k, v] of Object.entries(lineData)) {
      if (entryKeys.has(k)) filtered[k] = v;
    }
    const result = await secondaryHooks[stIdx]?.handleAddChild?.(filtered);
    if (result) setAddingSecondaryLine(prev => ({...prev, [st.key]: false}));
    return result;
  };

  const onSaveLine = async () => {
    setSavingSecondaryLine(true);
    try {
      const secUrl = `${apiBaseUrl}/${st.key}/${selectedSecondaryLine.id}`;
      const fieldValues = {};
      for (const [k, v] of Object.entries(secondaryLineEdits)) {
        if (k.endsWith('$_identifier')) continue;
        // NEO Headless PATCH expects camelCase API keys, not DB column names.
        // Always use k (the API key) as the field name.
        // Convert numeric strings to numbers for BigDecimal compatibility.
        // Only strip when the value is already in standard format (no commas).
        // Comma removal is skipped to avoid locale corruption (e.g. Spanish "10,50" = 10.5).
        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
          fieldValues[k] = parseFloat(v);
        } else {
          fieldValues[k] = v;
        }
      }
      const res = await fetch(secUrl, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
        body: JSON.stringify(fieldValues),
      });
      if (res.ok) {
        // Server response wins over the local edits: it carries
        // callout-computed fields (e.g. the recalculated foreignAmount
        // on an exchange-rate row) that the edited values don't have.
        // NEO wraps the saved record in {response:{data:[...]}}.
        const updated = await res.json().catch(() => null);
        const serverValues = updated?.response?.data?.[0] ?? null;
        setSelectedSecondaryLine(prev => ({...prev, ...secondaryLineEdits, ...(serverValues ?? {})}));
        // Refresh the grid row cache so the list reflects the saved and
        // derived values without having to reopen the record.
        secondaryHooks[stIdx]?.handleUpdateChild?.(selectedSecondaryLine.id, serverValues ?? secondaryLineEdits);
        setSecondaryLineEdits(null);
        setSecondaryLineEditColumns({});
        toast.success('Record saved');
      } else {
        toast.error(await extractErrorMessage(res));
      }
    } catch (err) {
      toast.error(err.message || 'Network error');
    } finally {
      setSavingSecondaryLine(false);
    }
  };

  const onDelete = async () => {
    if (!(await confirmDelete())) return;
    setSecondaryDeleting(prev => ({...prev, [st.key]: true}));
    const rows = secondarySelectedRows[st.key] ?? [];
    try {
      const results = await Promise.allSettled(
          rows.map(row => {
            const childUrl = api?.crud?.[st.key]?.detailUrl?.replace('{id}', row.id)
                || `${apiBaseUrl}/${st.key}/${row.id}`;
            return fetch(childUrl, {
              method: 'DELETE',
              headers: {...(token ? {Authorization: `Bearer ${token}`} : {})},
            }).then(res => ({res, row}));
          })
      );
      let deleted = 0;
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.res.ok) {
          secondaryHooks[stIdx]?.handleDeleteChild?.(result.value.row.id);
          if (selectedSecondaryLine?._tabKey === st.key && selectedSecondaryLine?.id === result.value.row.id) {
            setSelectedSecondaryLine(null);
          }
          deleted++;
        }
      }
      secondaryInlineLinesRefs.current[st.key]?.current?.clearSelection?.();
      setSecondarySelectedRows(prev => ({...prev, [st.key]: []}));
      if (deleted > 0) toast.success(ui('recordsDeleted', {count: deleted}));
      const failed = results.length - deleted;
      if (failed > 0) toast.error(ui('recordsCouldNotBeDeleted', {count: failed}));
    } catch (err) {
      toast.error(err.message || ui('networkError'));
    } finally {
      setSecondaryDeleting(prev => ({...prev, [st.key]: false}));
    }
  };

  return { onAdd, onSaveLine, onDelete };
}

export function SecondaryFormTab(props) {
  return <div className="flex-1 min-w-0">
    <props.st.Form
        data={props.data ?? {}}
        readOnly={!props.hook.editing}
        onChange={props.onChange}
        entity={props.st.key}
        catalogs={props.catalogs}
        token={props.token}
        apiBaseUrl={props.apiBaseUrl}
        selectorContext={props.selectorContextByEntity[props.st.key]}
        labelOverrides={props.labelOverrides}
    />
  </div>;
}

export function SecondaryPanelTab(props) {
  return <div className="flex-1 min-w-0">
    <props.st.Panel
        parentId={props.data?.id}
        token={props.token}
        apiBaseUrl={props.apiBaseUrl}
        onCount={props.onCount}
    />
  </div>;
}

export function secondaryTabEmptyState({ ui, onAddLineClick, addLineLabel }) {
  return (
    <div style={{ margin: '24px 16px', padding: '32px 24px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} data-testid="secondary-tab-empty-state">
      <div style={{ width: 40, height: 40, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>{ui('noRecordsYet')}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui('createNewRecord')}</span>
      <button type="button" onClick={onAddLineClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', cursor: 'pointer' }}>
        + {addLineLabel}
      </button>
    </div>
  );
}

export function secondaryDetailSidebar(props) {
  if (!(props.st.Form && !props.st.Panel && (props.selectedSecondaryLine?._tabKey === props.st.key || props.closingSecondaryLine))) {
    return null;
  }
  return (
    <div
        className={`w-[48rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${props.closingSecondaryLine ? "sidebar-slide-out" : "sidebar-slide-in"}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">{props.detailPanelTitle}</span>
        <button
            onClick={props.onCloseDetailPanel}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" data-testid="X__fa3275" />
        </button>
      </div>
      <props.st.Form
          data={props.secondaryLineEdits ?? props.selectedSecondaryLine}
          readOnly={!props.hook.editing}
          onChange={props.onChange}
          entity={props.st.key}
          catalogs={props.catalogs}
          token={props.token}
          apiBaseUrl={props.apiBaseUrl}
          selectorContext={props.selectorContextByEntity[props.st.key]}
          excludeFields={props.st.excludeFields ?? []}
          labelOverrides={props.labelOverrides}
      />
      {props.hook.editing && (props.secondaryLineEdits || props.selectedSecondaryLine?.id) && (
          <div className="flex gap-2 mt-4">
            {props.secondaryLineEdits && (
                <>
                  <button
                      disabled={props.savingLine}
                      onClick={props.onSaveLine}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {props.savingLine ? props.loadingLabel : props.saveLabel}
                  </button>
                  <button
                      onClick={props.onDiscardLine}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                  >
                    {props.discardLabel}
                  </button>
                </>
            )}
            {(props.crud?.[props.st.key]?.delete ?? true) && props.selectedSecondaryLine?.id && (
                <button
                    disabled={props.savingLine}
                    onClick={props.onDeleteLine}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                >
                  <Trash2 className="h-4 w-4" data-testid="Trash2__fa3275" />
                  {props.deleteLabel}
                </button>
            )}
          </div>
      )}
    </div>
  );
}

export function secondaryAddLineBar(props) {
  if (!((props.st.addLineFields?.entry?.length > 0 || props.st.customAddModal) && props.hook.editing)) {
    return null;
  }
  return (
    // Wrapper measured by the secondary selection bar — its
    // `position: fixed` portal overlays exactly this region.
    // Mirrors the primary header-lines add-button wrapper (shared
    // getAddLineWrapperClassName/Style helpers) so both paths get the
    // same top border, vertical spacing and padding — keeps alignment
    // consistent across primary and secondary tabs.
    // Always `relative` (never sticky): the child-tab add-line button
    // must stay in flow below the table. getAddLineWrapperClassName's
    // sticky bottom-0 variant is only correct for the tall PRIMARY
    // header-lines area — applying it here makes the button overlap the
    // last table row when the scroll container is resized.
    <div
      ref={props.secondaryAddLineWrapperRef}
      className="relative"
      // No borderTop: the child table already renders its own bottom
      // border, so the primary path's top divider would double up here.
      // noTopPadding: keep the button snug under the table (no vertical
      // gap above it) while preserving horizontal alignment.
      style={getAddLineWrapperStyle(props.linesLayout, { withBorder: false, noTopPadding: true })}
    >
      {/* alignSelf:flex-start keeps this span from being stretched by
          the flex-column parent — otherwise data-inline-add-portal would
          cover the whole bar and the outside-click save would never fire. */}
      <span data-inline-add-portal="true" style={{ alignSelf: 'flex-start' }}>
        <AddLineButton
          onClick={props.onAddLineClick}
          label={props.addLineLabel}
          hideChevron={props.hideChevron}
          data-testid="AddLineButton__fa3275" />
      </span>
      {props.linesLayout === "inlineEditable" && (props.crud?.[props.st.key]?.delete ?? true) && (
          <LinesSelectionBar
            visible={props.secondaryBarVisible[props.st.key] ?? false}
            closing={props.secondaryBarClosing[props.st.key] ?? false}
            barRect={props.secondaryBarRects[props.st.key]}
            count={(props.secondarySelectedRows[props.st.key] ?? []).length}
            selectedLabel={props.selectedLabel}
            totalLabel={null}
            deleting={props.secondaryDeleting[props.st.key] ?? false}
            deleteTitle={props.deleteLabel}
            closeTitle={props.closeTitle}
            compact
            onDelete={props.onDelete}
            onClose={props.onClose}
            data-testid="LinesSelectionBar__fa3275" />
      )}
    </div>
  );
}

export function SecondaryTableTab(props) {
  // Evaluates the tab's own readOnlyLogic (if declared) against the current
  // header record — independent of the document-wide isDocumentReadOnly, which
  // only governs the primary lines table. Most tabs declare no readOnlyLogic
  // and this stays false, preserving today's behavior everywhere else.
  const tabReadOnly = evalTabReadOnly(props.st, props.hook.selected);
  const secondaryChildren = props.secondaryHooks[props.stIdx]?.children ?? [];
  const isAddingThis = props.addingSecondaryLine?.[props.st.key] ?? false;
  const hasAddFields = (props.st.addLineFields?.entry?.length ?? 0) > 0;
  const showEmptyState = secondaryChildren.length === 0 && !isAddingThis
    && props.hook.editing && hasAddFields && !props.st.customAddModal && !tabReadOnly;
  if (showEmptyState) {
    return secondaryTabEmptyState({ ui: props.ui, onAddLineClick: props.onAddLineClick, addLineLabel: props.addLineLabel });
  }
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <props.st.Table
              ref={getSecondaryLinesTableRef(props.linesLayout, props.secondaryInlineLinesRef, props.st)}
              data={props.secondaryHooks[props.stIdx]?.children ?? []}
              entity={props.st.key}
              token={props.token}
              apiBaseUrl={props.apiBaseUrl}
              labelOverrides={props.labelOverrides}
              selectorContext={props.selectorContextByEntity[props.st.key]}
              linesLayout={props.linesLayout}
              isDocumentReadOnly={tabReadOnly}
              onRowClick={resolveSecondaryRowClickHandler(props.st, {
                openCustomModal: props.openCustomModal,
                openSecondaryLine: props.openSecondaryLine,
                linesLayout: props.linesLayout,
              })}
              // Pencil action for customAddModal tabs (Dirección) opens
              // the popup editor — rows are not editable in place.
              onEditRow={getSecondaryEditRowHandler(props.st, props.setCustomModalState)}
              selectedRowId={props.selectedSecondaryLine?._tabKey === props.st.key ? props.selectedSecondaryLine?.id : undefined}
              onSelectionChange={getSecondarySelectionChangeHandler(props.linesLayout, props.setSecondarySelectedRows, props.st)}
              onDeleteRow={(props.enableSecondaryRowDelete || (props.linesLayout === 'inlineEditable' && !props.st.customAddModal)) && !tabReadOnly && (props.crud?.[props.st.key]?.delete ?? true) ? props.onDeleteRow : undefined}
              // Inline edit save for secondary-tab rows. Fires when a
              // cell loses focus while in edit mode. Optimistic flow:
              // we update the local cache FIRST so the Radix Select
              // (and read-mode label) reflect the new pick instantly,
              // then PATCH the server and roll back if it rejects.
              onUpdateRow={getSecondaryRowUpdateHandler(props.st, props.linesLayout, {
                api: props.api,
                apiBaseUrl: props.apiBaseUrl,
                secondaryHooks: props.secondaryHooks,
                stIdx: props.stIdx,
                token: props.token,
                ui: props.ui,
                extractErrorMessage: props.extractErrorMessage,
                isDocumentReadOnly: tabReadOnly,
                hook: props.hook,
              })}
              addRow={props.st.addLineFields?.entry?.length > 0 && !tabReadOnly ? {
                ref: props.secondaryAddRowRef,
                active: props.addingSecondaryLine[props.st.key] ?? false,
                fields: props.st.addLineFields.entry,
                onAdd: props.onAdd,
                onCancel: props.onCancel,
                catalogs: props.catalogs,
                seedValues: props.secondaryAddRowSeed,
                resolvedDefaults: props.secondaryChildDefaults,
              } : undefined}
          />
        </div>
        {secondaryDetailSidebar(props)}
      </div>
      {!tabReadOnly && secondaryAddLineBar(props)}
    </>
  );
}

export function getSaveButtonLabel(savingLine, ui) {
  return savingLine ? ui('loading') : ui('save');
}

export function getSelectedLinesTotalLabel(bottomSection, selectedChildRows, lineConfig, data) {
  return bottomSection?.showLineTotals !== false ? (() => {
    const total = selectedChildRows.reduce((acc, row) => {
      const v = parseFloat(String(row?.[lineConfig.grossField] ?? row?.lineGrossAmount ?? 0));
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
    const formatted = total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const curr = data?.['currency$_identifier'] || '';
    return curr ? `${formatted} ${curr}` : formatted;
  })() : null;
}

export function getChildSaveButtonLabel(savingChild, ui) {
  return savingChild ? ui('loading') : ui('save');
}

export function getAddLineWrapperClassName(linesLayout) {
  return linesLayout === 'inlineEditable' ? 'sticky bottom-0 bg-card z-10' : 'relative';
}

export function getAddLineWrapperStyle(linesLayout, { withBorder = true, noTopPadding = false } = {}) {
  const inline = linesLayout === 'inlineEditable';
  const padY = inline ? 8 : 10;
  const padX = inline ? 8 : 16;
  // Default keeps the original symmetric padding (numeric 8 for inlineEditable,
  // '10px 16px' otherwise) so the primary path is byte-for-byte unchanged.
  // noTopPadding drops ONLY the top so the add-button sits snug under the child
  // table, while horizontal padding still aligns it with table content.
  let padding;
  if (noTopPadding) {
    padding = `0 ${padX}px ${padY}px`;
  } else if (inline) {
    padding = padY;
  } else {
    padding = `${padY}px ${padX}px`;
  }
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    // The top border separates the lines from the add-button in the primary
    // header-lines path. Secondary/child tabs already have the table's own
    // bottom border, so they pass withBorder:false to avoid a double divider.
    ...(withBorder ? { borderTop: '0.5px solid var(--color-border-tertiary, hsl(var(--border-subtle)))' } : {}),
    padding
  };
}

export function resolveCanAddLines(addLineGuard, data, requiredHeaderFields, children = []) {
  if (addLineGuard) {
    return addLineGuard(data, children);
  } else if (Array.isArray(requiredHeaderFields) && requiredHeaderFields.length > 0) {
    return requiredHeaderFields.every((k) => {
      const v = data?.[k];
      return v != null && v !== '' && !(typeof v === 'string' && v.trim() === '');
    });
  } else {
    return true;
  }
}

export async function parseBackendErrorMessage(res) {
  let raw;
  try {
    const data = await res.json();
    // NEO Headless top-level format: { error: { message, status } }
    if (data?.error?.message) raw = data.error.message;
    else {
      // Etendo JsonDataService format: { response: { error: { message } | string } }
      const err = data?.response?.error;
      if (err?.message) raw = err.message;
      else if (typeof err === 'string') raw = err;
      else if (data?.message) raw = data.message;
    }
  } catch {
    // Ignore non-JSON error bodies.
  }
  return raw;
}

export function getDocumentIds(recordId) {
  return recordId ? [recordId] : [];
}

export function resolveSidebarContent(sidebarContent, data) {
  return typeof sidebarContent === 'function' ? sidebarContent(data) : sidebarContent;
}

export function renderSidePanel(sidePanel, data, recordId, token, apiBaseUrl, api, isNew) {
  return typeof sidePanel === 'function'
      ? React.createElement(sidePanel, {recordId: data?.id || recordId, data, token, apiBaseUrl, api, isNew})
      : sidePanel;
}

export function getNotesRowClassName(embedded) {
  return `flex items-start gap-3 px-4 py-2.5${embedded ? ' pointer-events-none' : ''}`;
}

export function getDocsRowClassName(embedded) {
  return `flex items-start gap-3 px-4 py-2.5 border-b border-border/30${embedded ? ' pointer-events-none' : ''}`;
}

export function getAddLineMenuActions(getLineMenuActions, data, extraActionsRef, ui) {
  return getLineMenuActions
      ? getLineMenuActions({data, importRef: extraActionsRef}).map(a => ({
        ...a,
        label: typeof a.label === 'string' ? (ui(a.label) || a.label) : a.label,
      }))
      : undefined;
}

export function getInlineEditableShrinkClassName(linesLayout) {
  return linesLayout === 'inlineEditable' ? 'shrink-0' : '';
}

export function getOthersTabClassName(embedded) {
  return `pt-5${embedded ? ' pointer-events-none' : ''}`;
}

export function getCustomLinesTabClassName(embedded) {
  return `pt-3${embedded ? ' pointer-events-none' : ''}`;
}

export function getSidebarSlideClassName(isClosingLine) {
  return isClosingLine ? 'sidebar-slide-out' : 'sidebar-slide-in';
}

export function getLinesToolbarClassName(linesLayout, toolbarPaddingX, toolbarBorderBottom) {
  return `flex items-center justify-between ${linesLayout === 'inlineEditable' ? 'p-2' : toolbarPaddingX + ' py-2'}${toolbarBorderBottom || linesLayout === 'inlineEditable' ? ' border-b border-[hsl(var(--border-subtle))]' : ''}`;
}

export function getLineMenuActionsRef(getLineMenuActions, extraActionsRef) {
  return getLineMenuActions ? extraActionsRef : undefined;
}

export function getWindowTitle(breadcrumb, tMenu, windowName) {
  return breadcrumb
      ? tMenu(breadcrumb.split(' / ').at(-1).trim()) || breadcrumb.split(' / ').at(-1).trim()
      : tMenu(windowName) || windowName || '';
}

export function getRecordTitle(isNew, ui, data, titleField) {
  return isNew
      ? ui('newRecord')
      : `${resolveIdentifier(data, titleField) || data._identifier || data.id || ''}`;
}

export function getFullBreadcrumb(breadcrumb, tMenu, title, windowTitle) {
  const titleSuffix = title ? ` / ${title}` : '';
  return breadcrumb
      ? `${breadcrumb.split(' / ').map(s => tMenu(s.trim())).join(' / ')}${titleSuffix}`
      : windowTitle;
}

export function getOnAddToFavorites(favKey, toggleFavorite, entityLabel, breadcrumb, windowName) {
  return favKey ? () => toggleFavorite(favKey, entityLabel || breadcrumb?.split(' / ').at(-1).trim() || windowName) : undefined;
}

export function getLinesContainerClassName(linesLayout, embedded) {
  return `${linesLayout === 'inlineEditable' ? '' : 'pt-3 '}flex items-start gap-4${embedded ? ' pointer-events-none' : ''}`;
}

export function buildInlineRowUpdateHandler({ linesLayout, isDocumentReadOnly, api, detailEntity, apiBaseUrl, hook, handleLineFieldChange, prepareLineForPost, token, extractErrorMessage, ui }) {
  return linesLayout === 'inlineEditable' && !isDocumentReadOnly ? async (row, fieldKey, value, opts) => {
    // Inline autosave with callout chain. NEO Headless expects API keys
    // (camelCase), an unwrapped body, and numeric strings coerced for
    // BigDecimal — mirrors the side-panel save at line ~1750. When a
    // trigger field changes (e.g., product), `handleLineFieldChange`
    // populates `derivedUpdates` with all callout-driven fields (price,
    // tax, description, etc.) so they can be PATCHed in one shot.
    const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
        || `${apiBaseUrl}/${detailEntity}/${row.id}`;
    const coerce = (v) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : v);
    const payloadValue = coerce(value);

    // Build the row snapshot the callout sees: existing row + the change.
    // Strip null/empty inherited keys that the parent has set (e.g.
    // businessPartner, priceList on OrderLine). buildCalloutFormState
    // by contract does NOT overwrite a row value with the header's,
    // so without this prune the callout would receive
    // businessPartner=null and NEO returns listPrice=0. The addRow
    // flow doesn't hit this because it starts from an empty values
    // object, but existing rows include denormalized parent keys.
    const headerSnapshot = hook.editing || hook.selected || {};
    const cleanRow = {...row};
    for (const k of Object.keys(headerSnapshot)) {
      const v = cleanRow[k];
      if (v === null || v === undefined || v === '') {
        delete cleanRow[k];
      }
    }
    const snapshot = {...cleanRow, [fieldKey]: payloadValue};
    if (opts?.identifier !== undefined) {
      snapshot[fieldKey + '$_identifier'] = opts.identifier;
    }
    // Mirror DataTable's selector-aux merge (lines 468–512). The
    // selector item carries `_aux` (product_PSTD, _PLIM, _UOM, _CURR)
    // and top-level fields (standardPrice, isTaxIncluded, currency)
    // that the callout needs to compute the price. Without this, the
    // callout has no access to the price-list metadata and returns 0.
    const selectedItem = opts?.selectedItem;
    if (selectedItem && typeof selectedItem === 'object') {
      mergeSelectorAuxFields(selectedItem, snapshot, fieldKey);
      mergeSelectorContextFields(selectedItem, snapshot, fieldKey);
    }

    // Run callout (no-op for fields without one). Captures derived fields
    // through the applyUpdates callback so we can fold them into the PATCH.
    let derivedUpdates = {};
    try {
      await handleLineFieldChange(fieldKey, payloadValue, snapshot, (updates) => {
        derivedUpdates = {...updates};
      });
    } catch {
      // Callout is best-effort; PATCH continues with the user-typed value only.
    }

    // PATCH body: send the full row + derived + change. NEO Headless
    // doesn't reliably recompute derived fields (lineGrossAmount,
    // standardPrice) when only a partial body arrives — observed
    // when changing product to one with a different price. The
    // side-panel save (line ~1750) sends the whole row for the same
    // reason, so we mirror that here for parity.
    const fieldValues = {};
    // 1. Start from the cleaned row (skips already-null inherited keys).
    collectRowFieldValues(cleanRow, fieldValues, coerce);
    // 2. Overlay derived fields from the callout (incl. lineGrossAmount,
    //    standardPrice, unitPrice, listPrice).
    for (const [k, v] of Object.entries(derivedUpdates)) {
      if (k.endsWith('$_identifier')) continue;
      fieldValues[k] = coerce(v);
    }
    // 3. The user-changed field always wins (last-write).
    fieldValues[fieldKey] = payloadValue;

    // Derive unitPrice (PriceActual) = listPrice × (1 - discount/100).
    // Without this the backend keeps the pre-discount PriceActual and
    // confirmed totals don't match the discounted lineNetAmount we just
    // computed — matches the side-panel save flow.
    prepareLineForPost(fieldValues);

    const res = await fetch(childUrl, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      body: JSON.stringify(fieldValues),
    });
    if (res.ok) {
      applyLocalChildRowUpdate(derivedUpdates, fieldKey, payloadValue, fieldValues, opts, hook, row);
      // Server response wins over the optimistic cache when present —
      // picks up trigger-computed fields (e.g. etgoQtydiff) that only
      // exist after the DB flush, mirroring the secondary-tab handler
      // above (line ~425). NEO wraps the saved record in
      // {response:{data:[...]}}.
      const updated = await res.json().catch(() => null);
      const serverRow = updated?.response?.data?.[0] ?? null;
      if (serverRow) hook.handleUpdateChild?.(row.id, serverRow);
    } else {
      const msg = await extractErrorMessage(res);
      toast.error(msg || ui('networkError'));
      throw new Error(msg || 'PATCH failed');
    }
  } : undefined;
}

export function buildDeleteRowHandler({ api, detailEntity, isDocumentReadOnly, confirmDelete, apiBaseUrl, token, hook, selectedLine, setSelectedLine, ui, extractErrorMessage }) {
  return (api?.crud?.[detailEntity]?.delete ?? true) && !isDocumentReadOnly ? async (row) => {
    if (!(await confirmDelete())) return;
    try {
      const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
          || `${apiBaseUrl}/${detailEntity}/${row.id}`;
      const res = await fetch(childUrl, {
        method: 'DELETE',
        headers: {...(token ? {Authorization: `Bearer ${token}`} : {})},
      });
      if (res.ok) {
        hook.handleDeleteChild(row.id);
        if (selectedLine?.id === row.id) setSelectedLine(null);
        toast.success(ui('recordDeleted'));
      } else {
        toast.error(await extractErrorMessage(res));
      }
    } catch (err) {
      toast.error(err.message || ui('networkError'));
    }
  } : undefined;
}

export function getDeleteChildButtonLabel(deletingChildren, ui) {
  return deletingChildren ? ui('loading') : ui('delete');
}

export function buildLineRowClickHandler(DetailForm, linesLayout, setSelectedLine) {
  return DetailForm && linesLayout !== 'inlineEditable' ? (row) => {
    const line = {...row};
    roundAmounts(line);
    setSelectedLine(line);
  } : undefined;
}

export function getSqBtnSize(toolbarButtonSize) {
  return toolbarButtonSize === 'default' ? 'h-10 w-10' : 'h-9 w-9';
}

export function getSaveBtnCls(toolbarButtonSize) {
  return toolbarButtonSize === 'default' ? 'h-10 gap-2' : 'gap-1.5';
}

// Normalizes boolean-ish status values (true/'Y' -> 'true', false/'N' -> 'false') so
// windows whose statusField is a boolean flag (e.g. goods-movements' `processed`) can
// declare completedStatuses as string literals, matching the precedent in statusBadge.js.
export function normalizeStatusValue(value) {
  if (value === true || value === 'Y') return 'true';
  if (value === false || value === 'N') return 'false';
  return value;
}

export function getDraftModeCompleted(draftMode, _headerData, isProcessed, statusField) {
  const statusValue = _headerData?.[statusField || 'documentStatus'];
  return Boolean(
      draftMode?.enabled && (
          Array.isArray(draftMode.completedStatuses)
              ? draftMode.completedStatuses.includes(normalizeStatusValue(statusValue))
              : (isProcessed || _headerData?.documentStatus === 'CO')
      )
  );
}

export function getDocumentReadOnly(lockWhenProcessed, _headerData) {
  return lockWhenProcessed && (_headerData?.processed === true || _headerData?.processed === 'Y');
}

export function insertLinesTab(detailLabel, detailEntity, hook, detailTabIndex, tabs) {
  const linesTab = {key: 'lines', label: detailLabel || detailEntity || 'Lines', count: hook.children?.length || 0};
  if (typeof detailTabIndex === 'number' && detailTabIndex >= 0 && detailTabIndex <= tabs.length) {
    tabs.splice(detailTabIndex, 0, linesTab);
  } else {
    tabs.unshift(linesTab);
  }
}

export function customTabKey(ct) {
  return `custom:${ct.key}`;
}

/**
 * Builds the initial tab list (secondary tabs + lines/customLines + inline custom tabs).
 * Extracted from DetailView so its branch logic does not count toward the component's
 * cognitive complexity. `Others` is appended later via pushOthers.
 */
export function buildInitialTabs(p) {
  const tabs = [];
  p.secondaryTabs.forEach((st, i) => {
    const secondaryChildCount = !st.isFormTab ? (p.secondaryHooks[i]?.children?.length ?? null) : null;
    const childCount = st.Panel ? (p.panelCounts[st.key] ?? null) : secondaryChildCount;
    const label = (st.labelKey && p.ui(st.labelKey)) || st.label;
    tabs.push({ key: st.key, label, count: childCount });
  });
  if (p.DetailTable) {
    insertLinesTab(p.detailLabel, p.detailEntity, p.hook, p.detailTabIndex, tabs);
  } else if (p.CustomLines) {
    tabs.unshift({ key: 'customLines', label: p.customLinesLabel, count: p.customLinesCount ?? null });
  }
  // Append 'tab' placement custom items after lines/secondary tabs but before Others.
  // Items may pass `labelKey` to resolve a generic i18n label via useUI() instead of a
  // hardcoded string in `label`. A tab-placement custom component may opt out of being
  // shown entirely by calling `onVisibilityChange(false)` (see customTabVisibility state
  // in DetailView) — until it does, it defaults to visible so every other consumer of
  // `customTabs` keeps behaving exactly as before.
  if (!p.customTabsAfterBottom) {
    p.tabCustomTabs.forEach(ct => {
      if (p.customTabVisibility[ct.key] === false) return;
      const resolvedLabel = ct.labelKey ? p.ui(ct.labelKey) : ct.label;
      tabs.push({ key: customTabKey(ct), label: resolvedLabel, count: p.customTabCounts[ct.key] ?? null });
    });
  }
  return tabs;
}

export function renderExtraActionButtons(extraActions, data, hook, saveBtnCls) {
  return (typeof extraActions === 'function' ? extraActions({
    data,
    children: hook.children
  }) : extraActions).map((action, i) => (
      action.visible !== false && (
          <Button
            key={action.key || i}
            variant="outline"
            size="default"
            className={`${action.className || ''} ${saveBtnCls}`.trim()}
            onClick={action.onClick}
            data-testid="Button__fa3275">
            {action.label}
          </Button>
      )
  ));
}

export function getDetailContentContainerClassName({
  linesLayout,
  sidePanel,
  sidebarContent,
  sidebarAboveTabsOnly,
  compactSidebarPadding,
  primaryTabs,
  activePrimaryTab,
  formScrollPaddingX = null,
  contentOverflow = 'auto',
} = {}) {
  const defaultOverflowCls = contentOverflow === 'hidden' ? 'overflow-hidden' : 'overflow-auto pb-2';
  const overflowCls = linesLayout === 'inlineEditable' ? 'flex flex-col overflow-y-auto' : defaultOverflowCls;
  return `flex-1 min-h-0 min-w-0 ${overflowCls} ${detailContentPadding(linesLayout, !!(sidePanel || (sidebarContent && !sidebarAboveTabsOnly)), 'content', compactSidebarPadding, formScrollPaddingX)}${primaryTabs && activePrimaryTab !== 'general' ? ' hidden' : ''}`;
}

export function getLinesTabsSectionClassName(linesLayout) {
  return linesLayout === 'inlineEditable' ? 'mt-1 flex flex-col relative' : 'mt-2';
}

export function getSecondaryTabEntityKey(secondaryTabs, index) {
  return (secondaryTabs[index]?.isFormTab || secondaryTabs[index]?.Panel) ? null : (secondaryTabs[index]?.key ?? null);
}

export function renderNotesField(notesFocused, data, notesField, handleChangeWithCallout, handleNotesSave, setNotesFocused, ui) {
  return notesFocused ? (
      <textarea
          value={data[notesField] || ''}
          onChange={(e) => handleChangeWithCallout(notesField, e.target.value)}
          onBlur={() => {
            handleNotesSave(data[notesField]);
            setNotesFocused(false);
          }}
          placeholder={ui('description')}
          rows={3}
          autoFocus
          className="w-full text-xs bg-transparent px-2 py-0.5 resize-none focus:outline-none placeholder:text-muted-foreground/40"
      />
  ) : (
      <div
          tabIndex={0}
          role="textbox"
          onClick={() => setNotesFocused(true)}
          onFocus={() => setNotesFocused(true)}
          className="w-full text-xs px-2 py-0.5 cursor-text min-h-[1.5rem] whitespace-pre-wrap break-words text-foreground/80"
      >
        {data[notesField] || <span className="text-muted-foreground/40">{ui('description')}</span>}
      </div>
  );
}

export function computeIsDirty(hook, addingLine, addingSecondaryLine, lineEdits, additionalDirtyState) {
  return hook.isDirtyHeader
      || addingLine
      || Object.values(addingSecondaryLine).some(Boolean)
      || (lineEdits != null && Object.keys(lineEdits).length > 0)
      || (additionalDirtyState === true);
}

export function hasRecordForRoute(isNew, hook, recordId) {
  return isNew
      || (hook.selected?.id && String(hook.selected.id) === String(recordId));
}

export function isLoadingRecordForRoute(hook, isNew, recordId) {
  return hook.loading && !hasRecordForRoute(isNew, hook, recordId);
}

export function resolveHideMoreMenu(hideMoreMenu, data) {
  return typeof hideMoreMenu === 'function' ? hideMoreMenu({ data }) : hideMoreMenu;
}

export function pushOthers(showOthers, tabs, othersLabel, ui) {
  if (showOthers === true) {
    tabs.push({key: 'others', label: othersLabel || ui('others')});
  }
}

export function renderEmbeddedStatusPill(statusField, data, statusEnumLabels) {
  return statusField && data[statusField] ? (
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border/30">
        <DocumentStatusPill
          status={data[statusField]}
          enumLabels={statusEnumLabels}
          data-testid="DocumentStatusPill__fa3275" />
      </div>
  ) : null;
}

export function shouldShowLinesEmptyState(hook, addingLine, LinesEmptyState, isDocumentReadOnly) {
  return hook.children.length === 0 && !addingLine && LinesEmptyState && hook.editing && !isDocumentReadOnly;
}

export function getTabsBarStyle(tabsBarRight, tabsBarRightDivider) {
  return tabsBarRight && tabsBarRightDivider ? {paddingRight: `calc(${tabsBarRightDivider} + 24px)`} : undefined;
}

export function getTabsBarClassName(tabsBarPaddingX, tabsBarRightDivider) {
  return `flex items-center gap-1 ${tabsBarPaddingX} py-2 shrink-0${tabsBarRightDivider ? ' relative' : ''}`;
}

// ETP-4479 — windows where a plain header DELETE fails once the record has
// ever been referenced (FK constraints); the NEO action reactivates and
// removes it server-side instead. Hardcoded here (not decisions.json-driven)
// because the decisions.json -> generator wiring for this is not published
// in schema_forge_core; do not add a decisions.json field for this without
// first confirming the generator support ships.
export const WINDOW_DELETE_ACTIONS = {
  'payment-in': 'eTPRRemovePayment',
  'payment-out': 'eTPRRemovePayment',
};

// ETP-4500 — same rationale/hardcoding constraint as WINDOW_DELETE_ACTIONS above: these
// windows show the rich Reactivar/Eliminar cartel (conditional Conciliación/Asiento items)
// instead of the generic delete confirmation Dialog. `dir` feeds the cobro/pago wording.
export const WINDOW_DELETE_CONFIRM_MODALS = {
  'payment-in': { Component: PaymentLifecycleConfirmModal, dir: 'in' },
  'payment-out': { Component: PaymentLifecycleConfirmModal, dir: 'out' },
};

export function isDeleteButtonVisible({
  isNew,
  recordId,
  data,
  statusField,
  hideDeleteWhenComplete,
  isProcessed,
  deleteAction,
  hideDeleteButton = false,
}) {
  // hideDeleteButton is an explicit, unconditional "never show delete here"
  // signal (e.g. Amortization) — it wins over everything else, including the
  // deleteAction lifecycle bypass below.
  if (hideDeleteButton) return false;
  // ETP-4479 — a deleteAction-backed delete is safe at any lifecycle stage
  // (the action reactivates server-side before removing), so it ignores
  // hideDeleteWhenComplete/isProcessed and only hides for the voided status.
  if (deleteAction) {
    return !isNew && recordId && data?.[statusField] !== 'RPVOID';
  }
  return !isNew && recordId && isDeleteVisibleForRecord({
    record: data,
    statusField,
    hideDeleteWhenComplete
  }) && !(hideDeleteWhenComplete && isProcessed);
}

export function renderPrimaryTabButtons(primaryTabsVariant, primaryTabs, setActivePrimaryTab, activePrimaryTab, tMenu) {
  return primaryTabsVariant === 'pill' ? (
      <div className="inline-flex items-center gap-1 p-1 h-10 rounded-xl bg-muted">
        {primaryTabs.map(tab => (
            <button
                key={tab.key}
                onClick={() => setActivePrimaryTab(tab.key)}
                className={activePrimaryTab === tab.key
                  ? 'h-8 px-4 text-sm font-medium rounded-lg transition-all bg-card text-text-primary shadow-sm'
                  : 'h-8 px-4 text-sm font-medium rounded-lg transition-all text-text-secondary'}
            >
              {tMenu(tab.label)}
            </button>
        ))}
      </div>
  ) : (
      primaryTabs.map(tab => (
          <button
              key={tab.key}
              onClick={() => setActivePrimaryTab(tab.key)}
              className={[
                'relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border',
                activePrimaryTab === tab.key
                    ? 'bg-card border-border-control shadow-sm text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary',
              ].join(' ')}
          >
            {tMenu(tab.label)}
          </button>
      ))
  );
}

export function resolveHeaderContent(headerContent, data) {
  return typeof headerContent === 'function' ? headerContent(data) : headerContent;
}

export function isBulkDeleteBarVisible(linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows) {
  return linesLayout !== 'inlineEditable' && (api?.crud?.[detailEntity]?.delete ?? true) && !isDocumentReadOnly && selectedChildRows.length > 0;
}

export function isCustomPrimaryTabActive(primaryTabs, activePrimaryTab) {
  return primaryTabs && activePrimaryTab !== 'general';
}

export function getDetailContentClassName(sidePanel, linesLayout) {
  return `${sidePanel ? 'flex-1 min-w-0' : 'max-w-full'} ${linesLayout === 'inlineEditable' ? 'flex flex-col' : 'space-y-2'}`;
}

export function canDeleteSelectedLine(api, detailEntity, selectedLine, isDocumentReadOnly) {
  return (api?.crud?.[detailEntity]?.delete ?? true) && selectedLine?.id && !isDocumentReadOnly;
}

export function shouldShowLineActionButtons(hook, lineEdits, selectedLine) {
  return hook.editing && (lineEdits || selectedLine?.id);
}

export function shouldShowDetailFormSidebar(linesLayout, DetailForm, selectedLine, isClosingLine) {
  return linesLayout !== 'inlineEditable' && DetailForm && (selectedLine || isClosingLine);
}

export function isInitialChildrenLoading(hook) {
  return hook.childrenLoading && hook.children.length === 0;
}

export function canShowAddLineArea(hook, isDocumentReadOnly, allEntryFields, DetailExtraActions, canAddLines) {
  return hook.editing && !isDocumentReadOnly && (allEntryFields.length > 0 || DetailExtraActions) && canAddLines;
}

export function shouldShowInlineDeleteSelectionBar(linesLayout, api, detailEntity) {
  return linesLayout === 'inlineEditable' && (api?.crud?.[detailEntity]?.delete ?? true);
}

/**
 * Balance gate for double-entry windows (decisions.json window.balanceFooter).
 * Computes the live balance and the two block flags used to disable Save / Confirm.
 * Extracted from the DetailView body to keep its cognitive complexity low.
 * - blockSaveForBalance: Save stays disabled until Σ debit === Σ credit.
 * - blockCompleteForBalance: Completion is stricter — must balance AND carry a
 *   non-zero amount (a 0=0 draft is "balanced" but must not be completable).
 */
export function computeBalanceGate({ balanceFooter, children, pendingLineValues, lineEdits, selectedLine }) {
  const balanceEditingLine = lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine;
  const balanceState = balanceFooter
    ? computeBalance(children, pendingLineValues, balanceEditingLine, balanceFooter)
    : null;
  const blockSaveForBalance = !!balanceFooter && balanceState != null && !balanceState.isBalanced;
  const blockCompleteForBalance = !!balanceFooter && balanceState != null
    && (!balanceState.isBalanced || !balanceState.hasAmounts);
  return { balanceState, blockSaveForBalance, blockCompleteForBalance };
}

/**
 * Save / Confirm toolbar buttons for draftMode windows (Save Draft + Confirm).
 * Extracted from the DetailView footer IIFE to keep cognitive complexity low.
 * All identifiers are destructured with the SAME names used inside the component
 * so closure-equivalent logic and the dirty-state regression substrings stay intact.
 */
export function renderDraftModeSaveActions({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  draftMode, blockSaveForBalance, blockCompleteForBalance, setShowProcessingModal,
}) {
  return (
    <>
      <Button variant="outline" size="default" className={`${saveBtnCls} bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]`} data-testid="action-save-draft" disabled={hook.isSaving || !isDirty || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        const saved = await hook.handleSave(data);
        if (saved?.id && isNew) {
          hook.primeSaved?.(saved);
          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" color="hsl(var(--muted-foreground))" data-testid="Save__fa3275" />}
        {ui('save')}
      </Button>
      <Button size="default" className={saveBtnCls} data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance || (draftMode.disableWhenEmpty === true && !hook.childrenLoading && hook.children.length === 0)} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        if (typeof draftMode.onConfirm === 'function') { draftMode.onConfirm(); return; }
        const showProcessing = Boolean(draftMode.processingModal);
        if (showProcessing) setShowProcessingModal(true);
        try {
          const saved = await hook.handleSaveAndProcess(draftMode);
          if (saved) {
            if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
            if (onAfterSave) {
              navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
            } else if (saved.id && isNew) {
              hook.primeSaved?.(saved);
              navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
            } else if (saved.id) {
              hook.fetchById?.(saved.id);
            }
          }
        } finally {
          if (showProcessing) setShowProcessingModal(false);
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
        {ui(draftMode.label) || draftMode.label || ui('process')}
      </Button>
    </>
  );
}

export async function handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook }) {
  if (!saved) return;
  if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
  if (onAfterSave) {
    navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
  } else if (saved.id && isNew) {
    hook.primeSaved?.(saved);
    navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
  }
}

/**
 * Save (+ optional Confirm) toolbar buttons for a brand-new (unsaved) record.
 * Extracted from the DetailView footer IIFE. New-record Save is never gated by
 * !isDirty — only by isDocumentReadOnly, isSaving and blockSaveForBalance.
 */
export function renderNewRecordSaveActions({
  hook, flushPendingLines, data, isNew, navigate, windowName,
  ui, tMenu, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  isDocumentReadOnly, isProcessed, draftMode, blockSaveForBalance, blockCompleteForBalance,
}) {
  return (
    <>
      <Button size="default" className={saveBtnCls} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        const saved = await hook.handleSave(data);
        if (saved?.id && isNew) {
          if (onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
          hook.primeSaved?.(saved);
          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" data-testid="Save__fa3275" />}
        {ui('save')}
      </Button>
      {!isProcessed && hook.children.length > 0 && (
        <Button size="default" className={saveBtnCls} data-testid="action-complete" disabled={hook.isSaving || blockCompleteForBalance} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : undefined} onClick={async () => {
          if (!(await flushPendingLines())) return;
          const saved = await hook.handleSaveAndProcess(draftMode);
          await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook });
        }}>
          {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
          {ui(draftMode.label) || tMenu(draftMode.label) || ui('process')}
        </Button>
      )}
    </>
  );
}

/**
 * Single Save toolbar button for an existing (already-persisted) record.
 * Extracted from the DetailView footer IIFE. Gated by isDocumentReadOnly,
 * isSaving, !isDirty and blockSaveForBalance.
 */
export function renderExistingRecordSaveAction({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  isDocumentReadOnly, blockSaveForBalance,
}) {
  return (
    <Button variant="outline" size="default" className={`${saveBtnCls} bg-card border-[hsl(var(--border-control))] text-[hsl(var(--foreground))]`} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
      if (!(await flushPendingLines())) return;
      const saved = await hook.handleSave(data);
      await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook });
    }}>
      {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" color="hsl(var(--muted-foreground))" data-testid="Save__fa3275" />}
      {ui('save')}
    </Button>
  );
}

/**
 * Dispatches the footer Save/Confirm action block by record state. Extracted to
 * module level so the branch logic does not count toward DetailView's cognitive
 * complexity. All values arrive via the `params` object built in DetailView.
 */
export function renderSaveActions(params) {
  if (params.draftMode?.enabled) return renderDraftModeSaveActions(params);
  if (params.isNew) return renderNewRecordSaveActions(params);
  return renderExistingRecordSaveAction(params);
}

export function renderTotalsBlock({ balanceFooter, children, pendingLine, editingLine, lineConfig, formatAmount, currency, summary, isDocumentReadOnly, totalDiscountPct, onTotalDiscountChange }) {
  if (balanceFooter) {
    return (
      <BalanceFooterPanel
        lines={children}
        pendingLine={pendingLine}
        editingLine={editingLine}
        config={balanceFooter}
        formatAmount={formatAmount}
        currency={currency}
        data-testid="BalanceFooterPanel__fa3275" />
    );
  }
  const subtotalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('summed') || f.key.toLowerCase().includes('totallines') || f.key.toLowerCase().includes('lineamount')));
  const totalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('grand') || (f.key.toLowerCase().includes('total') && !f.key.toLowerCase().includes('line'))));
  if (!subtotalField && !totalField) return null;
  return (
    <DocumentTotalsPanel
      lines={children}
      pendingLine={pendingLine}
      editingLine={editingLine}
      lineConfig={lineConfig}
      formatAmount={formatAmount}
      currency={currency}
      readOnly={isDocumentReadOnly}
      totalDiscountPct={totalDiscountPct}
      onTotalDiscountChange={onTotalDiscountChange}
      data-testid="DocumentTotalsPanel__fa3275" />
  );
}

export function isDetailBulkBarVisible(linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows, detailProcesses) {
  return isBulkDeleteBarVisible(linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows)
    || (detailProcesses.length > 0 && selectedChildRows.length > 0 && linesLayout !== 'inlineEditable');
}

export function resolveDetailRows(selectedChildRows, selectedLine) {
  if (selectedChildRows.length > 0) return selectedChildRows;
  return selectedLine ? [selectedLine] : [];
}

export function makeCloseDialogHandler(setter) {
  return open => { if (!open) setter(null); };
}

export async function executeDetailProcessImpl(process, paramValues, explicitRows, {
  selectedChildRows, api, detailEntity, apiBaseUrl, token, hook, ui,
  setSelectedChildRows, setExecutingDetailProcess,
}) {
  const rows = explicitRows || selectedChildRows;
  const fieldValues = {};
  for (const p of (process.params ?? [])) {
    if (p.hidden) fieldValues[p.key] = p.value;
  }
  Object.assign(fieldValues, paramValues);
  setExecutingDetailProcess(true);
  try {
    const results = await Promise.allSettled(
      rows.map(row => {
        const url = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
          || `${apiBaseUrl}/${detailEntity}/${row.id}`;
        return fetch(`${url}/action/${process.columnName ?? process.name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ fieldValues }),
        }).then(res => ({ res, row }));
      })
    );
    let ok = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.res.ok) ok++;
    }
    setSelectedChildRows([]);
    if (ok > 0) {
      toast.success(ui('processCompletedCount', { count: ok }) !== 'processCompletedCount'
        ? ui('processCompletedCount', { count: ok })
        : `${process.label || process.name}: ${ok} record(s) processed`);
      hook.fetchById?.(hook.selected?.id);
      hook.refresh?.();
    }
    const failed = results.length - ok;
    if (failed > 0) toast.error(`${failed} record(s) failed`);
  } catch (err) {
    toast.error(err?.message || 'Network error');
  } finally {
    setExecutingDetailProcess(false);
  }
}

/**
 * Full-page detail view for a single entity record.
 * Two-zone layout: gray top bar + white content card with rounded corner.
 *
 * `customTabs` accepts items of shape:
 *   { key, label, Component, placement = 'footer', props = {} }
 *
 * - placement: 'footer' (default) -> renders as a chip row in the bottom Docs section
 *   (legacy behavior; component receives layout="chips").
 * - placement: 'tab' -> renders as a first-class tab next to lines/secondaryTabs.
 *   The component always mounts but receives `isActive` so it can lazy-load data
 *   the first time it becomes visible.
 *
 * In both cases the component receives `{ recordId, data, token, apiBaseUrl, api, onChange }`
 * plus any keys declared in the optional `props` object.
 *
 * `onChange(field, value)` is `hook.handleChange` — it writes straight into the shared
 * `editing` state (the same state the header form uses), so any edit made by a custom
 * tab is picked up automatically by the next header save (no per-field persistence
 * needed, no separate save button required). This prop is additive/optional — custom
 * tabs that don't use it are unaffected.
 *
 * 'tab' placement items also receive an `onVisibilityChange(visible: boolean)` callback
 * (mirroring `onCountChange`). The tab defaults to visible and stays that way unless the
 * component calls `onVisibilityChange(false)` — e.g. to hide itself entirely when it has
 * nothing to show for the current record. Calling `onVisibilityChange(true)` afterwards
 * (e.g. once the underlying data changes) restores it. Components that never call it are
 * unaffected — the tab is always shown, so this is fully backwards compatible.
 */
export function hasUnsavedEdits(editing, selected) {
  if (!editing || !selected) return false;
  return Object.entries(editing).some(([k, v]) => k !== 'id' && v !== selected[k]);
}

export function mergeLineEdits(lineEdits, selectedLine) {
  return lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine;
}

export function dispatchProcessAction(p, { processConfirmModal, setConfirmProcess, setParamDialogProcess, handleProcess }) {
  if ((p.style === 'ghost-danger' || p.confirmModal) && processConfirmModal) { setConfirmProcess(p); }
  else if (p.params?.some(param => !param.hidden)) { setParamDialogProcess(p); }
  else { handleProcess?.(p); }
}

/**
 * ETP-4542: opt-in "save before running a process" gate. Only windows that pass
 * `saveBeforeProcesses` participate; every other window keeps the previous behavior
 * (returns true immediately, no save). When the form has pending changes (`isDirty`,
 * the same signal that drives the Save button), the changes are persisted silently
 * (`{ silent: true }` suppresses the success toast) BEFORE the process flow opens, so
 * the process runs on fresh data. On save failure — required missing, ETP-4542 numeric
 * violation, or a backend error — `handleSave` has already surfaced the error and returns
 * a record without an id; this returns false so the caller aborts without opening the
 * confirm modal, param dialog, or firing the process POST.
 *
 * @returns {Promise<boolean>} true → proceed with the process; false → abort silently.
 */
export async function maybeSaveBeforeProcess({ saveBeforeProcesses, isDirty, handleSave }) {
  if (!saveBeforeProcesses || !isDirty) return true;
  const saved = await handleSave?.({ silent: true });
  return !!saved?.id;
}

export function resolveProcessLabel(p, data) {
  if (p.labelToggle && data?.[p.labelToggle.field] === p.labelToggle.equals) {
    return p.labelToggle.label;
  }
  return p.label;
}

export function renderProcessConfirmModal(process, Modal, onConfirm, onClose, record) {
  if (!process || !Modal) return null;
  return React.createElement(Modal, { process, onConfirm, onClose, record });
}

export function resolveStatusPrefix(key, translate) {
  return key ? translate(key) : undefined;
}

export function handleEntryIdentifierChange(entry, hook, key, api, catalogs) {
  if (entry._identifier) {
    hook.handleChange(key + '$_identifier', entry._identifier);
  } else if (entry.value && api?.selectors) {
    // Callout returned an ID without _identifier — resolve from loaded catalogs
    const sel = api.selectors.find(s => s.field === key);
    if (sel) {
      const options = getCatalogOptions(catalogs, sel.entity, sel);
      const match = Array.isArray(options) && options.find(o => o.id === entry.value);
      if (match) {
        hook.handleChange(key + '$_identifier', match.label || match.name || match._identifier);
      }
    }
  }
}
