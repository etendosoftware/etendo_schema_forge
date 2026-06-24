import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { AddLineButton } from '@/components/ui/add-line-button.jsx';
import { X, MoreVertical, Check, Save, List, Printer, Mail, Trash2, Loader2, Shield } from 'lucide-react';
import { AttachmentIcon } from '@/components/attachments/AttachmentIcon';
import { PricingIcon, WarehouseProductsIcon } from '@/components/ui/custom-icons';

const TAB_ICONS = {
  'custom:attachments': AttachmentIcon,
  'custom:sif': Shield,
  'custom:pricing': PricingIcon,
  'products': WarehouseProductsIcon,
};

function TabStripButton({
  iconKey, label, count, isActive, onClick,
  paddingY = 'py-2.5', showHoverLine = false, indicatorCls, tMenu, testId,
}) {
  const defaultCls = 'absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full';
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={[
        `${showHoverLine ? 'group ' : ''}flex items-center gap-2 px-4 ${paddingY} text-sm font-medium transition-colors relative`,
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {React.createElement(TAB_ICONS[iconKey] ?? List, { className: 'h-4 w-4' })}
      {tMenu(label)}
      {count != null && (
        <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs rounded-full bg-muted text-muted-foreground">
          {count}
        </span>
      )}
      {showHoverLine ? (
        <span className={[
          'absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-colors',
          isActive ? 'bg-foreground' : 'bg-transparent group-hover:bg-muted-foreground/30',
        ].join(' ')} />
      ) : (
        isActive && <span className={indicatorCls || defaultCls} />
      )}
    </button>
  );
}
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useCatalogs } from '@/hooks/useCatalogs';
import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import { useCallout } from '@/hooks/useCallout';
import { useCurrency } from '@/hooks/useCurrency';
import { useLineGrossAmount, ORDER_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useMenuLabel, useUI } from '@/i18n';
import { translateBackendError } from '@/lib/backendErrors.js';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import { SummaryBar } from './SummaryBar.jsx';
import DocumentTotalsPanel from './DocumentTotalsPanel.jsx';
import BalanceFooterPanel from './BalanceFooterPanel.jsx';
import { resolveTotalDiscountPct } from '@/lib/documentTotals';
import { computeBalance } from '@/lib/balanceTotals';
import LinesSelectionBar from './LinesSelectionBar.jsx';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import {
  buildCalloutFormState, extractAuxValues, normalizeCalloutQty,
  normalizeCalloutResponse, applyQtyZeroGuard, roundAmounts,
  resolveSnapshotIdentifiers,
} from '@/lib/lineFieldChange.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { formatAmount } from '@/lib/formatAmount.js';
import { useRegisterWindowContext } from '@/components/CurrentWindowContext';
import { matchOcrDocType } from '@/components/copilot/ocr/ocrDocTypes';
import { isDeleteVisibleForRecord } from '@/utils/recordActions.js';
import { buildHeaderSelectorContext, buildLineSelectorContext } from '@/lib/selectorContext.js';
import DocumentStatusPill from './DocumentStatusPill.jsx';

const LazyOcrInlineUploader = lazy(() => import('@/components/copilot/ocr/OcrInlineUploader.jsx'));

/**
 * Evaluate a simple Etendo display-logic expression (@Field@='Value') against record data.
 * Returns true (visible) if the expression cannot be parsed or if the field is missing from data.
 */
function sidePanelWrapperCls(hasSidePanel, linesLayout) {
  // Stack the side panel below the content on narrow viewports (e.g. when the
  // devtools console is open) and only place it beside the content once there
  // is room (lg+). A rigid side-by-side row would otherwise overlap the
  // header/lines when the panel can't shrink.
  if (hasSidePanel) return 'flex flex-col lg:flex-row items-start gap-0';
  if (linesLayout === 'inlineEditable') return 'flex flex-col';
  return '';
}

function evalDisplayLogicRaw(expr, data) {
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
import { cn } from '@/lib/utils.js';
import DocumentPrintDrawer from './DocumentPrintDrawer.jsx';
import { toast } from 'sonner';

/**
 * Collapsible section that hides itself entirely when children render as null.
 */
function CollapsibleSection({ title, children }) {
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
function detailContentPadding(linesLayout, hasSidebar, variant, compact = false, paddingXOverride = null) {
  const isInline = linesLayout === 'inlineEditable';
  if (hasSidebar) return (isInline || compact) ? 'px-2 pb-2' : 'pl-6 pr-2';
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
function resolveSecondaryRowClickHandler(st, { openCustomModal, openSecondaryLine, linesLayout }) {
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

function deriveTaxRateFromGross(gross, lineConfig, selectedLine) {
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

function applyOneComboEntry(key, combo, ctx) {
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
  const { api, apiBaseUrl, secondaryHooks, stIdx, token, ui, extractErrorMessage } = ctx;
  return !st.customAddModal && linesLayout === 'inlineEditable' ? async (row, fieldKey, value, opts) => {
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

export function SecondaryTableTab(props) {
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
              onDeleteRow={(props.enableSecondaryRowDelete || (props.linesLayout === 'inlineEditable' && !props.st.customAddModal)) && (props.crud?.[props.st.key]?.delete ?? true) ? props.onDeleteRow : undefined}
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
              })}
              addRow={props.st.addLineFields?.entry?.length > 0 ? {
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
        {props.st.Form && !props.st.Panel && (props.selectedSecondaryLine?._tabKey === props.st.key || props.closingSecondaryLine) && (
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
                  excludeFields={props.st.key === "contact" ? ["active"] : []}
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
        )}
      </div>
      {(props.st.addLineFields?.entry?.length > 0 || props.st.customAddModal) && props.hook.editing && (
          // Wrapper measured by the secondary selection bar — its
          // `position: fixed` portal overlays exactly this region.
          (<div ref={props.secondaryAddLineWrapperRef} className="relative">
            <span data-inline-add-portal="true">
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
          </div>)
      )}
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
  return linesLayout === 'inlineEditable' ? 'sticky bottom-0 bg-white z-10' : 'relative';
}

export function getAddLineWrapperStyle(linesLayout) {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
    padding: linesLayout === 'inlineEditable' ? 8 : '10px 16px'
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

function getSidebarSlideClassName(isClosingLine) {
  return isClosingLine ? 'sidebar-slide-out' : 'sidebar-slide-in';
}

function getLinesToolbarClassName(linesLayout, toolbarPaddingX, toolbarBorderBottom) {
  return `flex items-center justify-between ${linesLayout === 'inlineEditable' ? 'p-2' : toolbarPaddingX + ' py-2'}${toolbarBorderBottom || linesLayout === 'inlineEditable' ? ' border-b border-[#E8EAEF]' : ''}`;
}

function getLineMenuActionsRef(getLineMenuActions, extraActionsRef) {
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

function getSqBtnSize(toolbarButtonSize) {
  return toolbarButtonSize === 'default' ? 'h-10 w-10' : 'h-9 w-9';
}

function getSaveBtnCls(toolbarButtonSize) {
  return toolbarButtonSize === 'default' ? 'h-10 gap-2' : 'gap-1.5';
}

function getDraftModeCompleted(draftMode, _headerData, isProcessed) {
  return Boolean(
      draftMode?.enabled && (
          Array.isArray(draftMode.completedStatuses)
              ? draftMode.completedStatuses.includes(_headerData?.documentStatus)
              : (isProcessed || _headerData?.documentStatus === 'CO')
      )
  );
}

function getDocumentReadOnly(lockWhenProcessed, _headerData) {
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

function customTabKey(ct) {
  return `custom:${ct.key}`;
}

/**
 * Builds the initial tab list (secondary tabs + lines/customLines + inline custom tabs).
 * Extracted from DetailView so its branch logic does not count toward the component's
 * cognitive complexity. `Others` is appended later via pushOthers.
 */
function buildInitialTabs(p) {
  const tabs = [];
  p.secondaryTabs.forEach((st, i) => {
    const secondaryChildCount = !st.isFormTab ? (p.secondaryHooks[i]?.children?.length ?? null) : null;
    const childCount = st.Panel ? (p.panelCounts[st.key] ?? null) : secondaryChildCount;
    tabs.push({ key: st.key, label: st.label, count: childCount });
  });
  if (p.DetailTable) {
    insertLinesTab(p.detailLabel, p.detailEntity, p.hook, p.detailTabIndex, tabs);
  } else if (p.CustomLines) {
    tabs.unshift({ key: 'customLines', label: p.customLinesLabel, count: p.customLinesCount ?? null });
  }
  // Append 'tab' placement custom items after lines/secondary tabs but before Others.
  // Items may pass `labelKey` to resolve a generic i18n label via useUI() instead of a
  // hardcoded string in `label`.
  if (!p.customTabsAfterBottom) {
    p.tabCustomTabs.forEach(ct => {
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
  const defaultOverflowCls = contentOverflow === 'hidden' ? 'overflow-hidden pb-2' : 'overflow-auto pb-2';
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

export function isDeleteButtonVisible(isNew, recordId, data, statusField, hideDeleteWhenComplete, isProcessed) {
  return !isNew && recordId && isDeleteVisibleForRecord({
    record: data,
    statusField,
    hideDeleteWhenComplete
  }) && !(hideDeleteWhenComplete && isProcessed);
}

export function renderPrimaryTabButtons(primaryTabsVariant, primaryTabs, setActivePrimaryTab, activePrimaryTab, tMenu) {
  return primaryTabsVariant === 'pill' ? (
      <div className="inline-flex items-center gap-1 p-1 h-10 rounded-xl" style={{background: '#F5F7F9'}}>
        {primaryTabs.map(tab => (
            <button
                key={tab.key}
                onClick={() => setActivePrimaryTab(tab.key)}
                className="h-8 px-4 text-sm font-medium rounded-lg transition-all"
                style={
                  activePrimaryTab === tab.key
                      ? {
                        background: '#FFFFFF',
                        color: '#121217',
                        boxShadow: '0px 1px 3px rgba(18,18,23,0.10), 0px 1px 2px rgba(18,18,23,0.06)'
                      }
                      : {color: '#121217'}
                }
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
                    ? 'bg-white border-gray-200 shadow-sm text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
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
function renderDraftModeSaveActions({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  draftMode, blockSaveForBalance, blockCompleteForBalance,
}) {
  return (
    <>
      <Button variant="outline" size="default" className={`${saveBtnCls} bg-white border-[#D1D4DB] text-[#121217]`} data-testid="action-save-draft" disabled={hook.isSaving || !isDirty || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        const saved = await hook.handleSave(data);
        if (saved?.id && isNew) {
          hook.primeSaved?.(saved);
          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
        }
      }}>
        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Save className="h-3.5 w-3.5" color="#64748B" data-testid="Save__fa3275" />}
        {ui('save')}
      </Button>
      <Button size="default" className={saveBtnCls} data-testid="action-save" disabled={hook.isSaving || blockCompleteForBalance || (draftMode.disableWhenEmpty === true && !hook.childrenLoading && hook.children.length === 0)} title={blockCompleteForBalance ? ui('journalUnbalancedCompleteBlocked') : undefined} onClick={async () => {
        if (!(await flushPendingLines())) return;
        if (typeof draftMode.onConfirm === 'function') { draftMode.onConfirm(); return; }
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
function renderNewRecordSaveActions({
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
function renderExistingRecordSaveAction({
  hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
  ui, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
  isDocumentReadOnly, blockSaveForBalance,
}) {
  return (
    <Button size="default" className={saveBtnCls} data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty || blockSaveForBalance} title={blockSaveForBalance ? ui('journalUnbalancedSaveBlocked') : undefined} onClick={async () => {
      if (!(await flushPendingLines())) return;
      const saved = await hook.handleSave(data);
      await handlePostSaveNavigation(saved, { isNew, onAfterCreate, onAfterSave, navigate, windowName, token, apiBaseUrl, hook });
    }}>
      {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__fa3275" /> : <Check className="h-3.5 w-3.5" data-testid="Check__fa3275" />}
      {ui('save')}
    </Button>
  );
}

/**
 * Dispatches the footer Save/Confirm action block by record state. Extracted to
 * module level so the branch logic does not count toward DetailView's cognitive
 * complexity. All values arrive via the `params` object built in DetailView.
 */
function renderSaveActions(params) {
  if (params.draftMode?.enabled) return renderDraftModeSaveActions(params);
  if (params.isNew) return renderNewRecordSaveActions(params);
  return renderExistingRecordSaveAction(params);
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
 * In both cases the component receives `{ recordId, data, token, apiBaseUrl, api }`
 * plus any keys declared in the optional `props` object.
 */
export function DetailView({
  entity,
  detailEntity,
  Form,
  DetailTable,
  DetailForm,
  summary = [],
  statusField,
  extraBadges = [],
  processes = [],
  addLineFields = { entry: [], derived: [] },
  catalogs: staticCatalogs,
  api,
  entityLabel,
  detailLabel,
  detailTabIndex,
  titleField = 'documentNo',
  windowName,
  recordId,
  token,
  apiBaseUrl,
  breadcrumb,
  secondaryTabs = [],
  formFooter = null,
  draftMode = null,
  headerContent = null,
  headerExtra = null,
  customTabs = [],
  documentPreview,
  notesField,
  extraActions = [],
  menuActions = [],
  customMenuContent = null,
  hideDeleteWhenComplete = false,
  customTabsAfterBottom = false,
  hidePrint = false,
  hideSaveStatuses = [],
  hideMoreMenu = false,
  hideMoreDetails = false,
  noHeaderBorder = false,
  toolbarBorderBottom = false,
  compactSidebarPadding = false,
  whiteFormBackground = false,
  hideFormCard = false,
  tabsBarRightDivider = null,
  tabsBarRight = null,
  tabsBarAfter = null,
  hideTopBar = false,
  CustomLines = null,
  customLinesLabel = 'Invoices',
  sidePanel = null,
  sidePanelStyle = null,
  sidebarAboveTabsOnly = false,
  afterTotals = null,
  bottomSection = null,
  balanceFooter = null,
  linesEmptyState = null,
  topbarExtra = null,
  topbarRight = null,
  statusFieldLabel = null,
  statusEnumLabels = null,
  salesTheme = false,
  sidebarContent = null,
  othersLabel = null,
  primaryTabs = null,
  contentBg = 'bg-white',
  lineConfig = ORDER_LINE_CONFIG,
  lockWhenProcessed = true,
  addLineGuard = null,
  requiredHeaderFields = null,
  showDetailFooterTotals = undefined,
  onAfterSave,
  onAfterCreate,
  additionalDirtyState = false,
  labelOverrides,
  enableSecondaryRowDelete = false,
  sidebarClassName = 'w-96 shrink-0 overflow-y-auto pt-2 pl-0 pr-4 pb-5',
  linesLayout = 'classic',
  autoSaveOnBlur = false,
  toolbarPaddingX = 'px-6',
  tabsBarPaddingX = 'px-6',
  formScrollPaddingX = null,
  contentOverflow = 'auto',
  formCardPadding = 'p-6',
  toolbarButtonSize = 'sm',
  primaryTabsVariant = 'default',
  refetchAfterSave = false,
  secondaryTabsPaddingY = 'py-2.5',
  secondaryTabsShowHoverLine = false,
  tabsSeparator = false,
  hideAddLineChevron = false,
  addLineButtonPaddingX = '',
  formScrollPaddingB = 'pb-6',
  secondaryTabContentPaddingT = 'pt-3',
  transformRecord = null,
  selectorPriceCurrency = null,
}) {
  // DetailView never needs the parent list: on `/new` there is no record to match, and on
  // `/:id` the currentItem shortcut only helps when we arrived from ListView (items already
  // in memory from the other hook instance). On a direct URL hit `items` is empty anyway and
  // the effect falls through to fetchById. Skipping the list fetch unconditionally drops one
  // wasted GET per direct-URL navigation.
  const hook = useEntity(entity, detailEntity, { token, apiBaseUrl, skipListFetch: true, refetchAfterSave });
  // Session-level currency fallback. NEO Headless doesn't return
  // `currency$_identifier` on every line endpoint (only on the header), so we
  // back-fill it generically here. Windows that already get it from the
  // backend or that don't show amount columns are unaffected (the spread
  // preserves any existing value). Removes the need for per-window
  // `*LinesTable` wrappers that were doing the same thing manually.
  const sessionCurrencyCode = useCurrency();
  const enrichedChildren = useMemo(() => {
    if (!Array.isArray(hook.children)) return hook.children;
    if (!sessionCurrencyCode) return hook.children;
    return hook.children.map(row => (
      row && row['currency$_identifier'] == null
        ? { ...row, 'currency$_identifier': sessionCurrencyCode }
        : row
    ));
  }, [hook.children, sessionCurrencyCode]);
  const LinesEmptyState = linesEmptyState ?? bottomSection?.linesEmptyState ?? null;
  const DetailExtraActions = bottomSection?.detailExtraActions ?? null;
  // Optional function (NOT a hook) that returns menu actions for the
  // "+ Añadir línea" dropdown. When present, the chevron menu is populated
  // from this and the visible inline "DetailExtraActions" link is suppressed
  // — the actions ref-controls the same modal so no functionality is lost.
  const getLineMenuActions = bottomSection?.lineMenuActions ?? null;
  const extraActionsRef = useRef(null);
  // Static hooks for up to 4 secondary tabs (React rules forbid dynamic hook calls).
  // Secondary hooks only consume child-level state (children, handleAddChild, handleDeleteChild,
  // handleSelect) — never the parent list. skipListFetch avoids refetching the parent entity
  // list once per hook (which would otherwise cause N+1 identical GETs on mount).
  const secondaryHook0 = useEntity(entity, getSecondaryTabEntityKey(secondaryTabs, 0), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHook1 = useEntity(entity, getSecondaryTabEntityKey(secondaryTabs, 1), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHook2 = useEntity(entity, getSecondaryTabEntityKey(secondaryTabs, 2), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHook3 = useEntity(entity, getSecondaryTabEntityKey(secondaryTabs, 3), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHooks = [secondaryHook0, secondaryHook1, secondaryHook2, secondaryHook3];
  const parentRecordId = hook.selected?.id ?? recordId ?? hook.editing?.id ?? null;
  // "From" currency for secondary-tab inline add-rows. The parent document's
  // currency is a read-only column on those tabs (e.g. exchange rates), so the
  // inline add-row has no input to populate it and it renders "—" until the POST
  // sets it. Seed it from the header so it shows immediately. Depend on the scalar
  // values (not the header object) so the seed keeps a stable identity and does
  // not reset the open add-row on every parent re-render.
  const headerCurrencyId = (hook.selected ?? hook.editing)?.currency ?? null;
  const headerCurrencyLabel = (hook.selected ?? hook.editing)?.['currency$_identifier'] ?? sessionCurrencyCode ?? null;
  const secondaryAddRowSeed = useMemo(() => {
    if (headerCurrencyId == null && headerCurrencyLabel == null) return undefined;
    const seed = {};
    if (headerCurrencyId != null) seed.currency = headerCurrencyId;
    if (headerCurrencyLabel != null) seed['currency$_identifier'] = headerCurrencyLabel;
    return seed;
  }, [headerCurrencyId, headerCurrencyLabel]);

  // HandleDefaults: once the parent record is known, fetch backend-resolved
  // defaults for NEW lines so the add-row can pre-fill editable fields (e.g. a
  // line description defaulting to the parent's via @DESCRIPTION1@). An entity can
  // opt out via decisions.json `handlesDefaults: false` (surfaced on api.crud).
  const primaryHandlesDefaults = api?.crud?.[detailEntity]?.handlesDefaults !== false;
  const primaryFetchChildDefaults = hook.fetchChildDefaults;
  useEffect(() => {
    if (!primaryHandlesDefaults || !parentRecordId) return;
    primaryFetchChildDefaults?.(parentRecordId);
  }, [primaryHandlesDefaults, parentRecordId, primaryFetchChildDefaults]);

  const handleFieldBlur = useCallback(() => {
    if (!hook.editing || !hook.selected) return;
    const hasChanges = Object.entries(hook.editing).some(
      ([key, value]) => key !== 'id' && value !== hook.selected[key]
    );
    if (hasChanges) hook.handleSave();
  }, [hook]);
  // Depend on the single scalar the memo reads from editing/selected, not the whole objects.
  // Keeps original semantics: prefer editing when present (even if priceList is null), else selected.
  const priceListId = (hook.editing || hook.selected)?.priceList ?? null;
  // Stringify secondary-tab keys so the memo is immune to the `secondaryTabs = []` default
  // recreating a new array reference on every render.
  const secondaryTabKeysStr = secondaryTabs.map(t => t?.key ?? '').join('|');

  // HandleDefaults for secondary detail tabs: same as the primary, per-tab entity.
  useEffect(() => {
    if (!parentRecordId) return;
    secondaryTabKeysStr.split('|').forEach((key, i) => {
      if (!key || api?.crud?.[key]?.handlesDefaults === false) return;
      secondaryHooks[i]?.fetchChildDefaults?.(parentRecordId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentRecordId, secondaryTabKeysStr]);

  const selectorContextByEntity = useMemo(() => {
    const category = api?.window?.category;
    const next = {};

    if (entity) {
      next[entity] = buildHeaderSelectorContext(category);
    }

    if (!parentRecordId) return next;

    if (detailEntity) {
      const headerSnapshot = hook.selected ?? hook.editing;
      const currency = headerSnapshot?.['currency$_identifier'] ?? sessionCurrencyCode ?? null;
      const priceCurrency = selectorPriceCurrency === 'org' ? sessionCurrencyCode : null;
      next[detailEntity] = {
        ...buildLineSelectorContext({
          windowCategory: category,
          parentId: parentRecordId,
          headerRecord: {
            ...headerSnapshot,
            priceList: priceListId,
          },
        }),
        ...(currency ? { currency } : {}),
        ...(priceCurrency ? { priceCurrency } : {}),
      };
    }

    for (const key of secondaryTabKeysStr.split('|').filter(Boolean)) {
      next[key] = { parentId: parentRecordId };
    }
    return next;
  }, [entity, detailEntity, parentRecordId, secondaryTabKeysStr, priceListId, api, hook.selected, hook.editing, sessionCurrencyCode, selectorPriceCurrency]);
  const { catalogs, catalogsLoaded } = useCatalogs(api, token, apiBaseUrl, staticCatalogs);
  const displayLogic = useDisplayLogic(entity, hook.editing, { token, apiBaseUrl });
  const { calloutResult, calloutLoading, executeCallout } = useCallout(entity, { token, apiBaseUrl });
  const docAction = useDocumentAction({ apiBaseUrl, entity, token });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';
  const tMenu = useMenuLabel();
  const ui = useUI();
  const [addingLine, setAddingLine] = useState(false);
  // Live snapshot of the in-progress add-row values — updated on every keystroke
  // so DocumentTotalsPanel can compute real-time totals before the line is saved.
  const [pendingLineValues, setPendingLineValues] = useState(null);
  const [addingSecondaryLine, setAddingSecondaryLine] = useState({});
  const [forceOpenImport, setForceOpenImport] = useState(false);
  // Imperative handles to in-progress inline add rows so we can commit them
  // before header save (mirrors clicking the green check on an editing line).
  const primaryAddRowRef = useRef(null);
  // Bumped after rapid-entry flush so the scroll-to-bottom effect re-runs even
  // though addingLine stays true (state didn't change → effect wouldn't refire).
  const [addLineScrollNonce, setAddLineScrollNonce] = useState(0);
  const linesScrollRef = useRef(null);
  const bottomSectionRef = useRef(null);
  const secondaryAddRowRefs = useRef({});
  const getSecondaryAddRowRef = useCallback((key) => {
    if (!secondaryAddRowRefs.current[key]) {
      secondaryAddRowRefs.current[key] = { current: null };
    }
    return secondaryAddRowRefs.current[key];
  }, []);
  // Per-tab refs powering the selection bar in secondary inline-editable tabs.
  // Mirrors `addLineWrapperRef` + `inlineLinesRef` from the primary lines flow,
  // one entry per tab key so each tab measures and clears independently.
  const secondaryAddLineWrapperRefs = useRef({});
  const getSecondaryAddLineWrapperRef = useCallback((key) => {
    if (!secondaryAddLineWrapperRefs.current[key]) {
      secondaryAddLineWrapperRefs.current[key] = { current: null };
    }
    return secondaryAddLineWrapperRefs.current[key];
  }, []);
  const secondaryInlineLinesRefs = useRef({});
  const getSecondaryInlineLinesRef = useCallback((key) => {
    if (!secondaryInlineLinesRefs.current[key]) {
      secondaryInlineLinesRefs.current[key] = { current: null };
    }
    return secondaryInlineLinesRefs.current[key];
  }, []);
  // Imperative ref to InlineLinesPanel — only attached when linesLayout==='inlineEditable'.
  // Used by flushPendingLines so the global "Guardar" closes any open inline-edit row
  // (firing the focused input's blur → autosave PATCH) before the parent record saves.
  const inlineLinesRef = useRef(null);
  const flushPendingLines = useCallback(async () => {
    if (linesLayout === 'inlineEditable' && inlineLinesRef.current?.flushPendingEdits) {
      await inlineLinesRef.current.flushPendingEdits();
    }
    if (addingLine && primaryAddRowRef.current?.flush) {
      const ok = await primaryAddRowRef.current.flush({ closeAfterSave: true });
      if (ok === false) return false;
    }
    for (const [tabKey, active] of Object.entries(addingSecondaryLine)) {
      if (!active) continue;
      const handle = secondaryAddRowRefs.current[tabKey]?.current;
      if (handle?.flush) {
        const ok = await handle.flush({ closeAfterSave: true });
        if (ok === false) return false;
      }
    }
    return true;
  }, [addingLine, addingSecondaryLine, linesLayout]);

  // ── Ordered save helper ────────────────────────────────────────────────────
  //
  // Always flush any open add-row before saving the header so the parent record
  // sees the committed line state. If flushPendingLines reports a failure
  // (e.g. validation), the save is aborted and returns null.
  const flushAndSave = useCallback(async (data) => {
    if (!(await flushPendingLines())) return null;
    return hook.handleSave(data);
  }, [hook, flushPendingLines]);

  const [customModalState, setCustomModalState] = useState({ key: null, rowId: null });
  const [activeTab, setActiveTab] = useState(0);

  // Document-level read-only: when processed===true, the entire record (including lines) is read-only.
  const _headerData = hook.selected ?? hook.editing;

  // Register this detail view with the current-window context so the Copilot
  // widget can auto-attach the current record when opened. Memoized so the
  // hook's JSON.stringify signature work stays stable across renders.
  const _detailTabTitle = tMenu(entityLabel) || entityLabel || entity;
  const _isFormEditing = Boolean(hook.editing);
  const _windowContextInfo = useMemo(() => (
    _headerData ? {
      spec: windowName,
      tabTitle: _detailTabTitle,
      selectedRecords: [_headerData],
      formValues: hook.editing || null,
      isFormEditing: _isFormEditing,
    } : null
  ), [_headerData, windowName, _detailTabTitle, hook.editing, _isFormEditing]);
  useRegisterWindowContext(_windowContextInfo);
  const isDocumentReadOnly = getDocumentReadOnly(lockWhenProcessed, _headerData);
  const isProcessed = _headerData?.processed === true || _headerData?.processed === 'Y';
  // When draftMode declares an explicit completedStatuses array, only those documentStatus
  // values hide the Save/Confirm pair. This lets windows like sales-quotation keep the
  // pair visible during intermediate processed states (UE) while still hiding it in
  // terminal states (CA, ETGO_CI, CL, VO).
  const isDraftModeCompleted = getDraftModeCompleted(draftMode, _headerData, isProcessed);
  const sqBtnSize = getSqBtnSize(toolbarButtonSize);
  const saveBtnCls = getSaveBtnCls(toolbarButtonSize);
  const [showPrint, setShowPrint] = useState(false);
  // showNotes state removed — notes panel is always visible in side-by-side layout
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Promise-based confirm for line/child deletions; replaces native window.confirm
  // so the dialog matches the styled "Eliminar registro" modal used elsewhere.
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(null);
  const confirmDelete = useCallback(
    () => new Promise((resolve) => setPendingDeleteConfirm({ resolve })),
    [],
  );
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const handledOpenAddLineRef = useRef(false);
  const handledOpenSecondaryLineRef = useRef(false);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);
  const [directFetched, setDirectFetched] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [selectedChildRows, setSelectedChildRows] = useState([]);
  const [selectionBarVisible, setSelectionBarVisible] = useState(false);
  const [selectionBarClosing, setSelectionBarClosing] = useState(false);
  // Per secondary-tab selection state — same shape as the primary lines bar,
  // keyed by tab key. Only the active tab measures and renders its bar.
  const [secondarySelectedRows, setSecondarySelectedRows] = useState({});
  const [secondaryBarVisible, setSecondaryBarVisible] = useState({});
  const [secondaryBarClosing, setSecondaryBarClosing] = useState({});
  const [secondaryBarRects, setSecondaryBarRects] = useState({});
  const [secondaryDeleting, setSecondaryDeleting] = useState({});
  // Position of the AddLineButton wrapper in viewport coordinates. Drives the
  // portal-rendered selection bar so its downward shadow always renders OUTSIDE
  // the linesScrollRef's overflow-auto clipping boundary, regardless of how
  // many rows are in the table.
  const addLineWrapperRef = useRef(null);
  const [barRect, setBarRect] = useState(null);
  useEffect(() => {
    if (!selectionBarVisible) return;
    const el = addLineWrapperRef.current;
    const scrollEl = linesScrollRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBarRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (scrollEl) ro.observe(scrollEl);
    }
    const events = ['scroll', 'resize'];
    events.forEach(e => window.addEventListener(e, measure, true));
    return () => {
      ro?.disconnect();
      events.forEach(e => window.removeEventListener(e, measure, true));
    };
  }, [selectionBarVisible, linesLayout]);
  // When the bottom section (Docs/Notes/Totals) grows because the user expanded
  // an inner block (e.g., "Añadir descuento total"), the lines area shrinks via
  // flex-1, and rows previously at the bottom of the visible scroll get covered.
  // We compensate by scrolling the lines container by the delta, keeping the
  // same content visible.
  useEffect(() => {
    if (linesLayout !== 'inlineEditable') return;
    const bottomEl = bottomSectionRef.current;
    const scrollEl = linesScrollRef.current;
    if (!bottomEl || !scrollEl || typeof ResizeObserver === 'undefined') return;
    let prevHeight = bottomEl.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const nextHeight = bottomEl.getBoundingClientRect().height;
      const delta = nextHeight - prevHeight;
      if (delta > 1) {
        // Bottom panel grew → lines viewport shrank by `delta` from the bottom.
        // Scroll DOWN by `delta` so the rows that were at the bottom of view
        // remain visible (top rows scroll out instead of bottom ones being
        // hidden behind the now-taller panel).
        const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
        scrollEl.scrollTop = Math.min(maxScroll, scrollEl.scrollTop + delta);
      }
      prevHeight = nextHeight;
    });
    ro.observe(bottomEl);
    return () => ro.disconnect();
  }, [linesLayout]);

  // When the user opens the inline add-line row (inlineEditable mode), scroll the
  // lines container to the bottom with a long, eased animation so the user can
  // visually follow the scroll instead of seeing a sudden jump.
  useEffect(() => {
    if (linesLayout !== 'inlineEditable' || !addingLine) return;
    const el = linesScrollRef.current;
    if (!el) return;
    let rafId = 0;
    let cancelled = false;
    const startScroll = () => {
      const startTop = el.scrollTop;
      const targetTop = el.scrollHeight - el.clientHeight;
      const distance = targetTop - startTop;
      if (distance <= 1) return;
      // If the user was already near the bottom (within one row of the new add
      // row), just snap instantly — animating a few px feels jittery.
      if (distance <= 60) {
        el.scrollTop = targetTop;
        return;
      }
      const duration = 300;
      const startTime = performance.now();
      // easeOutCubic — quick start, slow gentle finish.
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        if (cancelled) return;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        el.scrollTop = startTop + distance * ease(progress);
        if (progress < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    };
    // Wait two frames so the inline-add row is mounted and its height included
    // in scrollHeight before we compute the target offset.
    rafId = requestAnimationFrame(() => { rafId = requestAnimationFrame(startScroll); });
    return () => { cancelled = true; cancelAnimationFrame(rafId); };
  }, [addingLine, linesLayout, addLineScrollNonce]);

  // Selection toolbar lifecycle: mount on first select, keep mounted with a
  // slide-out animation while count drops to 0, then unmount.
  useEffect(() => {
    if (selectedChildRows.length > 0) {
      setSelectionBarVisible(true);
      setSelectionBarClosing(false);
      return;
    }
    if (selectionBarVisible) {
      setSelectionBarClosing(true);
      const t = setTimeout(() => {
        setSelectionBarVisible(false);
        setSelectionBarClosing(false);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [selectedChildRows.length, selectionBarVisible]);
  // Per-tab close-animation timeouts. Kept in a ref so the lifecycle effect
  // below doesn't have to depend on visibility state (which would cancel its
  // own scheduled close on the next re-render).
  const secondaryBarTimeoutRef = useRef({});
  // Mirrors the primary lifecycle, but iterates secondary tabs. Each tab's
  // bar mounts when its selection becomes non-empty and slides out 250ms
  // after the selection is cleared.
  useEffect(() => {
    for (const st of secondaryTabs) {
      const tabKey = st.key;
      const rows = secondarySelectedRows[tabKey] ?? [];
      if (rows.length > 0) {
        if (secondaryBarTimeoutRef.current[tabKey]) {
          clearTimeout(secondaryBarTimeoutRef.current[tabKey]);
          delete secondaryBarTimeoutRef.current[tabKey];
        }
        setSecondaryBarVisible(prev => (prev[tabKey] ? prev : { ...prev, [tabKey]: true }));
        setSecondaryBarClosing(prev => (prev[tabKey] ? { ...prev, [tabKey]: false } : prev));
      } else if (!secondaryBarTimeoutRef.current[tabKey]) {
        setSecondaryBarClosing(prev => ({ ...prev, [tabKey]: true }));
        secondaryBarTimeoutRef.current[tabKey] = setTimeout(() => {
          setSecondaryBarVisible(prev => ({ ...prev, [tabKey]: false }));
          setSecondaryBarClosing(prev => ({ ...prev, [tabKey]: false }));
          delete secondaryBarTimeoutRef.current[tabKey];
        }, 250);
      }
    }
  }, [secondarySelectedRows, secondaryTabs]);
  // Flush any pending secondary-bar close timeouts on unmount so they can't
  // fire a setState after teardown (which throws "window is not defined" once
  // the test/jsdom environment is gone).
  useEffect(() => {
    const timeouts = secondaryBarTimeoutRef.current;
    return () => {
      for (const key of Object.keys(timeouts)) {
        clearTimeout(timeouts[key]);
        delete timeouts[key];
      }
    };
  }, []);
  // Measure each visible secondary tab's add-line wrapper so its bar can be
  // portaled with `position: fixed`. Only the active tab actually mounts its
  // wrapper (inactive tabs unmount their content), so refs from other tabs
  // resolve to null and are skipped naturally.
  useEffect(() => {
    const cleanups = [];
    for (const st of secondaryTabs) {
      if (!secondaryBarVisible[st.key]) continue;
      const el = secondaryAddLineWrapperRefs.current[st.key]?.current;
      if (!el) continue;
      const measure = () => {
        const r = el.getBoundingClientRect();
        setSecondaryBarRects(prev => ({
          ...prev,
          [st.key]: { top: r.top, left: r.left, width: r.width, height: r.height },
        }));
      };
      measure();
      let ro = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      }
      const events = ['scroll', 'resize'];
      events.forEach(e => window.addEventListener(e, measure, true));
      cleanups.push(() => {
        ro?.disconnect();
        events.forEach(e => window.removeEventListener(e, measure, true));
      });
    }
    return () => cleanups.forEach(fn => fn());
  }, [secondaryBarVisible, secondaryTabs]);
  // Clear secondary-tab selection state when the active tab changes. The
  // InlineLinesPanel resets its internal checkboxes on unmount, so we mirror
  // that here so the bar doesn't outlive the row checks.
  useEffect(() => {
    setSecondarySelectedRows({});
    setSecondaryBarVisible({});
    setSecondaryBarClosing({});
  }, [activeTab]);
  const [deletingChildren, setDeletingChildren] = useState(false);
  const [lineEdits, setLineEdits] = useState(null);
  const [lineEditColumns, setLineEditColumns] = useState({});

  // Save button is enabled only when there are pending changes. Four sources:
  // 1. Header fields diverged from last saved state (hook.isDirtyHeader)
  // 2. Primary inline add-row is open and partially filled
  // 3. A secondary tab add-row is open
  // 4. A line sidebar edit has unsaved field changes
  // additionalDirtyState lets custom windows inject extra dirty sources via prop.
  const isDirty =
    computeIsDirty(hook, addingLine, addingSecondaryLine, lineEdits, additionalDirtyState);
  const [savingLine, setSavingLine] = useState(false);
  const [isClosingLine, setIsClosingLine] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [savingChild, setSavingChild] = useState(false);

  const closeLine = useCallback(() => {
    setIsClosingLine(true);
    setTimeout(() => {
      setSelectedLine(null);
      setLineEdits(null);
      setLineEditColumns({});
      setIsClosingLine(false);
    }, 250);
  }, []);

  const [selectedSecondaryLine, setSelectedSecondaryLine] = useState(null);
  const [secondaryLineEdits, setSecondaryLineEdits] = useState(null);
  const [secondaryLineEditColumns, setSecondaryLineEditColumns] = useState({});
  const [savingSecondaryLine, setSavingSecondaryLine] = useState(false);
  const [isClosingSecondaryLine, setIsClosingSecondaryLine] = useState(false);
  const [secondaryDeleteConfirm, setSecondaryDeleteConfirm] = useState(null);

  const extractErrorMessage = useCallback(async (res) => {
    let raw = await parseBackendErrorMessage(res);
    return translateBackendError(raw ?? `Error ${res.status}`, ui);
  }, [ui]);

  const closeSecondaryLine = useCallback(() => {
    setIsClosingSecondaryLine(true);
    setTimeout(() => {
      setSelectedSecondaryLine(null);
      setSecondaryLineEdits(null);
      setSecondaryLineEditColumns({});
      setIsClosingSecondaryLine(false);
    }, 250);
  }, []);

  // Track fields whose values were set by a callout response, keyed by field with
  // the applied value, so we only skip the echo (same value) and not genuine edits.
  const calloutAppliedRef = useRef(new Map());
  // Active conversion rate (org base currency → header currency) for the SAVED state of
  // the order. Set by the sync effect below whenever the saved currency differs from
  // the org base currency. Used by handleLineFieldChange to convert pricelist prices on
  // newly added lines. Conversion only applies to lines added AFTER the order's currency
  // has been saved — there is no longer real-time conversion of unsaved lines on currency
  // change (ETP-4027 simplification).
  const activeCurrencyConversionRef = useRef(null);
  // Track fields the user has manually changed in this record session — protected
  // from being overwritten by callouts triggered from other fields.
  const userTouchedRef = useRef(new Set());
  // Reset session-scoped refs when the record context changes (new record / different existing record).
  useEffect(() => {
    userTouchedRef.current = new Set();
    calloutAppliedRef.current = new Map();
    activeCurrencyConversionRef.current = null;
  }, [recordId]);

  // Sync activeCurrencyConversionRef with the SAVED state of the order: whenever
  // hook.selected.currency changes (typically after a save), re-evaluate whether
  // conversion is needed. Lines added afterwards inherit this rate via
  // handleLineFieldChange. There is no real-time conversion on unsaved currency changes.
  useEffect(() => {
    if (recordId === 'new') return;
    const docCurrencyId = hook.selected?.currency;
    const orderDate = hook.selected?.orderDate;
    if (!docCurrencyId || !orderDate || !apiBaseUrl || !token) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const neoBase = apiBaseUrl.replace(/\/[^/]+$/, '');
        const sessionRes = await fetch(`${neoBase}/session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!sessionRes.ok || cancelled) return;
        const session = await sessionRes.json();
        const orgCurrencyId = session?.currencyId;
        if (!orgCurrencyId) return;
        if (orgCurrencyId === docCurrencyId) {
          // Saved currency matches org currency — no conversion needed.
          activeCurrencyConversionRef.current = null;
          return;
        }

        // If the order has a per-order rate override, use it directly without
        // fetching validate-exchange-rate. This reflects the user's confirmed rate
        // (set via CurrencyRatePicker) and avoids a redundant network call.
        const overrideRate = hook.selected?.eTGOCurrencyRate != null
          ? parseFloat(hook.selected.eTGOCurrencyRate)
          : null;
        if (overrideRate && overrideRate > 0) {
          activeCurrencyConversionRef.current = {
            baseCurrency: orgCurrencyId,
            toCurrency: docCurrencyId,
            rate: overrideRate,
          };
          return;
        }

        const rateRes = await fetch(
          `${neoBase}/validate-exchange-rate?fromCurrency=${encodeURIComponent(orgCurrencyId)}&toCurrency=${encodeURIComponent(docCurrencyId)}&date=${encodeURIComponent(orderDate)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!rateRes.ok || cancelled) {
          activeCurrencyConversionRef.current = null;
          return;
        }
        const rateData = await rateRes.json();
        if (cancelled) return;
        if (rateData?.hasRate && rateData.rate) {
          activeCurrencyConversionRef.current = {
            baseCurrency: orgCurrencyId,
            toCurrency: docCurrencyId,
            rate: rateData.rate,
          };
        } else {
          // No rate available — clear stale ref. The dropdown-change validator
          // normally blocks selecting a currency without a rate, but the saved
          // state may still get here through other paths.
          activeCurrencyConversionRef.current = null;
        }
      } catch {
        activeCurrencyConversionRef.current = null;
      }
    })();
    return () => { cancelled = true; };
  }, [recordId, hook.selected?.currency, hook.selected?.eTGOCurrencyRate, hook.selected?.orderDate, apiBaseUrl, token]);
  // Guard: fire default callouts only once per new-record session
  const defaultCalloutsTriggeredRef = useRef(false);
  // Cache for tax rates fetched from the selector (keyed by tax ID).
  // Avoids repeated API calls when the same tax appears on multiple lines.
  const taxRateCacheRef = useRef({});
  // Balance state for double-entry windows (decisions.json window.balanceFooter).
  // blockSaveForBalance disables the save action until Σ debit === Σ credit.
  const { blockSaveForBalance, blockCompleteForBalance } = computeBalanceGate({
    balanceFooter,
    children: hook.children,
    pendingLineValues,
    lineEdits,
    selectedLine,
  });
  const { computeLineGrossAmount, resolveTaxFactor, prepareLineForPost } = useLineGrossAmount(taxRateCacheRef, hook.children, lineConfig);
  // Batching refs for the sidebar onChange: product selector fires multiple synchronous
  // onChange calls (product, product$_identifier, unitPrice/grossUnitPrice). Without
  // batching each fires its own callout with a stale/incomplete snapshot. We accumulate
  // all synchronous calls and fire one handleLineFieldChange with the full snapshot.
  const sidebarCalloutBatchRef = useRef(null);
  const sidebarCalloutTimerRef = useRef(null);

  // When a sidebar line is selected, seed taxRateCacheRef from its saved values so that
  // subsequent priceField / qtyField changes can resolve taxFactor via source 2 (cache)
  // without needing a network round-trip.
  useEffect(() => {
    if (!selectedLine) return;
    const taxId = selectedLine.tax;
    if (!taxId || taxRateCacheRef.current[taxId] != null) return;
    const gross = parseFloat(String(selectedLine[lineConfig.grossField] ?? selectedLine.grossAmount ?? selectedLine.lineGrossAmount ?? '')) || 0;
    const rate = deriveTaxRateFromGross(gross, lineConfig, selectedLine);
    if (rate != null && rate >= 0) {
      taxRateCacheRef.current[taxId] = rate;
    }
  }, [selectedLine, lineConfig]);

  const isNew = recordId === 'new';
  const currentItem = useMemo(() => {
    if (isNew) return null;
    return hook.items.find(item => String(item.id) === String(recordId)) || null;
  }, [hook.items, recordId, isNew]);

  useEffect(() => {
    if (isNew && !hook.editing) {
      hook.handleNew();
    }
  }, [isNew, hook.editing, hook.handleNew]);

  // Auto-open add-line form after header auto-save navigation (openAddLine flag in route state).
  useEffect(() => {
    if (!location.state?.openAddLine || isNew || !hook.editing) {
      handledOpenAddLineRef.current = false;
      return;
    }
    if (handledOpenAddLineRef.current) return;
    handledOpenAddLineRef.current = true;
    setAddingLine(true);
    setEditingChild(null);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openAddLine, isNew, hook.editing, navigate, location.pathname]);

  // Auto-open import modal after header auto-save navigation (openImportModal flag in route state).
  const handledOpenImportRef = useRef(false);
  useEffect(() => {
    if (!location.state?.openImportModal || isNew || !hook.editing) {
      handledOpenImportRef.current = false;
      return;
    }
    if (handledOpenImportRef.current) return;
    handledOpenImportRef.current = true;
    setForceOpenImport(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openImportModal, isNew, hook.editing, navigate, location.pathname]);

  // Save header first (if new), then open add-line form.
  const handleAddLineClick = useCallback(async () => {
    if (isNew) {
      const saved = await hook.handleSave();
      if (!saved?.id) return;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openAddLine: true, justSaved: saved },
      });
      return;
    }
    if (addingLine && primaryAddRowRef.current?.flush) {
      await primaryAddRowRef.current.flush({ closeAfterSave: false });
      // The outside-click handler (mousedown capture) fires before this click
      // handler and may have already submitted the row with closeAfterSave:true,
      // calling onCancel() and closing the form. Ensure the form is (re)opened
      // for the next line regardless of which path flush took.
      setAddingLine(true);
      setEditingChild(null);
      // Force the scroll-to-bottom effect to re-run — addingLine stayed true so
      // React won't refire the effect on its own.
      setAddLineScrollNonce(n => n + 1);
      return;
    }
    setAddingLine(prev => !prev);
    setEditingChild(null);
  }, [isNew, hook, navigate, windowName, addingLine]);

  // Save header first (if new → navigate with flag; if existing → save in place), then open import modal.
  const handleImportClick = useCallback(async () => {
    if (isNew) {
      const saved = await hook.handleSave();
      if (!saved?.id) return false;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openImportModal: true, justSaved: saved },
      });
      return false;
    }
    await hook.handleSave();
    return true;
  }, [isNew, hook, navigate, windowName]);

  const handleSecondaryAddLineToggle = useCallback(async (tabKey) => {
    const targetTab = secondaryTabs.find(st => st.key === tabKey);
    if (!targetTab) return;
    if (isNew && targetTab.requireSavedRecord) {
      const saved = await hook.handleSave();
      if (!saved?.id) return;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openSecondaryTab: tabKey, openAddSecondaryLine: true, justSaved: saved },
      });
      return;
    }
    setAddingSecondaryLine(prev => ({ ...prev, [tabKey]: !prev[tabKey] }));
    setSelectedSecondaryLine(null);
  }, [secondaryTabs, isNew, hook, navigate, windowName]);

  const handleCustomModalAddClick = useCallback(async (tabKey) => {
    const targetTab = secondaryTabs.find(st => st.key === tabKey);
    if (!targetTab) return;
    if (isNew && targetTab.requireSavedRecord) {
      const saved = await hook.handleSave();
      if (!saved?.id) return;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openSecondaryTab: tabKey, openAddSecondaryLine: true, justSaved: saved },
      });
      return;
    }
    setCustomModalState({ key: tabKey, rowId: null });
  }, [secondaryTabs, isNew, hook, navigate, windowName]);

  // Resolve $_identifier for default FK values.
  // NOTE: Mandatory defaults are now handled by the backend (NeoDefaultsService).
  // The frontend only ensures that if a value exists (from a default or callout),
  // we resolve its $_identifier from the catalogs so it displays correctly.
  useEffect(() => {
    if (!isNew || !hook.editing || !catalogsLoaded || !api?.selectors) return;
    for (const sel of api.selectors) {
      const val = hook.editing[sel.field];
      if (!val) continue;
      // Value is set but no identifier — resolve it from loaded catalog
      if (hook.editing[sel.field + '$_identifier']) continue;
      const options = getCatalogOptions(catalogs, sel.entity, sel);
      if (!Array.isArray(options) || options.length === 0) continue;
      const match = options.find(o => o.id === val);
      if (match) {
        hook.handleChange(sel.field + '$_identifier', match.label || match.name || match._identifier);
      }
    }
  }, [isNew, hook.editing, catalogsLoaded, catalogs, api]);

  // After defaults load for a new record, fire callouts for non-dependent selector fields
  // so the callout chain runs (e.g. businessPartner → priceList, paymentTerms).
  // This mirrors what classic Etendo does when opening a blank document.
  useEffect(() => {
    if (!isNew) { defaultCalloutsTriggeredRef.current = false; return; }
    if (defaultCalloutsTriggeredRef.current) return;
    if (!hook.editing || !api?.selectors) return;
    // Wait until defaults have actually arrived (editing is non-empty)
    const hasDefaults = Object.values(hook.editing).some(v => v != null && v !== '');
    if (!hasDefaults) return;

    defaultCalloutsTriggeredRef.current = true;

    // Trigger callouts for primary (non-dependent) selector fields that have default values.
    // 'dependent' selectors (e.g. partnerAddress) are derived by other callouts — skip them.
    const triggers = (api.selectors || [])
      .filter(s => s.entity === entity && s.inputMode !== 'dependent' && hook.editing[s.field]);

    // Stagger calls by (i * executeCallout.debounceMs + buffer) so each result settles
    // before the next callout fires. The backend is idempotent: returns {} for fields
    // with no registered callout, so it is safe to call for every selector field.
    const STAGGER_MS = 400; // > useCallout debounce (300ms)
    const editingSnapshot = { ...hook.editing };
    triggers.forEach(({ field }, i) => {
      setTimeout(() => {
        const value = editingSnapshot[field];
        if (value) executeCallout(field, value, editingSnapshot);
      }, i * STAGGER_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, hook.editing, api, entity]);

  useEffect(() => {
    setDirectFetched(false);
  }, [recordId]);

  useEffect(() => {
    if (isNew || !recordId) return;
    // Skip the post-save fetchById round-trip: when the save handlers navigate
    // /new → /:id they stash the saved record in location.state.justSaved and
    // prime the hook via primeSaved() so selected/editing already match recordId.
    // See docs/plans/sales-order-save-performance.md (Etapa 1.2).
    const justSaved = location.state?.justSaved;
    if (
      justSaved?.id
      && String(justSaved.id) === String(recordId)
      && String(hook.selected?.id) === String(justSaved.id)
    ) {
      setDirectFetched(true);
      // Fetch children even on the justSaved fast-path — the header is already
      // primed but children (e.g. auto-created accounting lines) must be loaded.
      hook.fetchChildren?.(recordId);
      // One-shot: clear the marker so a manual reload of /:id still fetches.
      navigate(location.pathname, {
        replace: true,
        state: { ...location.state, justSaved: undefined },
      });
      return;
    }
    if (currentItem && (!hook.selected || String(hook.selected.id) !== String(recordId))) {
      hook.handleSelect(currentItem);
      setDirectFetched(false);
      return;
    }
    if (!currentItem && !hook.loading && !directFetched) {
      setDirectFetched(true);
      hook.fetchById(recordId);
    }
    // `navigate` and `location` are stable refs from react-router v6 and are
    // intentionally omitted from the dep list to avoid re-running on every
    // navigation tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem, directFetched, hook.fetchById, hook.fetchChildren, hook.handleSelect, hook.loading, hook.selected, isNew, recordId]);

  // Reset selected line when the parent record changes
  useEffect(() => {
    setSelectedLine(null);
  }, [hook.selected?.id]);

  // Sync all secondary hooks with the selected parent record
  useEffect(() => {
    if (!hook.selected?.id) return;
    secondaryHooks.forEach((sh, i) => {
      if (secondaryTabs[i]) sh.handleSelect(hook.selected);
    });
  }, [hook.selected?.id]);

  // Apply callout results to the form when they arrive
  useEffect(() => {
    if (!calloutResult) return;
    const { updates, combos, triggerField } = calloutResult;
    const appliedFields = new Map();
    const ctx = { data, triggerField, userTouchedRef, appliedFields, hook, api, catalogs };

    if (updates) {
      applyCalloutFieldUpdates(updates, ctx);
    }
    if (combos) {
      applyCalloutComboUpdates(combos, ctx);
    }

    // Mark these fields so the next onChange doesn't re-trigger callout
    calloutAppliedRef.current = appliedFields;

    // Currency change validation is handled inside handleChangeWithCallout (synchronous
    // dropdown-change path). The callout response handler intentionally no longer applies
    // any conversion to pending lines — under the simplified ETP-4027 model, conversion
    // only applies to lines added AFTER the saved currency change.
  }, [calloutResult]);

  // Wrapped onChange that triggers callout for user-initiated FK changes
  const handleChangeWithCallout = useCallback((field, value) => {
    // Capture the previous currency BEFORE hook.handleChange updates state, so we can
    // revert the dropdown if the rate check fails. The closure preserves the old
    // hook.editing reference, but capturing explicitly keeps intent clear.
    const previousCurrency = field === 'currency' ? hook.editing?.currency : null;

    hook.handleChange(field, value);

    // Skip companion/auxiliary fields — they don't have callouts
    if (field.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(field)) return;

    // Mark this field as user-touched so subsequent collateral callout updates
    // from other triggers cannot overwrite the user's choice.
    userTouchedRef.current.add(field);

    // If this field was just set by a callout response to THIS exact value, it's
    // the echo of the callout write — skip to avoid a re-trigger loop. A different
    // value means the user genuinely edited it → let the callout run.
    if (calloutAppliedRef.current.has(field)) {
      const appliedVal = calloutAppliedRef.current.get(field);
      calloutAppliedRef.current.delete(field);
      if (String(appliedVal) === String(value)) return;
    }

    // Only trigger callout for meaningful value changes (not empty/typing artifacts).
    // Skip partial search text — only trigger when value looks like an Etendo ID
    // (32-char hex UUID or legacy numeric ID) or a numeric/amount value (integer or decimal).
    if (!value || value === '') return;
    if (!/^[0-9A-Fa-f]{32}$/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;

    // Currency change validation (ETP-4027 simplified model): if no conversion rate
    // exists between the org base currency and the newly selected currency for the
    // order date, revert the dropdown to the previous value and surface an error.
    // Skipped when the new currency equals the org currency (no rate needed) and when
    // there is no previous currency yet (initial set, e.g. defaults).
    if (field === 'currency' && previousCurrency && previousCurrency !== value && apiBaseUrl && token) {
      const orderDate = hook.selected?.orderDate ?? hook.editing?.orderDate;
      if (orderDate) {
        const neoBase = apiBaseUrl.replace(/\/[^/]+$/, '');
        (async () => {
          const revert = () => {
            toast.error(ui('noConversionRateError', { date: orderDate }));
            hook.handleChange('currency', previousCurrency);
          };
          try {
            const sessionRes = await fetch(`${neoBase}/session`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!sessionRes.ok) { revert(); return; }
            const session = await sessionRes.json();
            const orgCurrencyId = session?.currencyId;
            // No rate needed when changing TO the org currency — that's just removing
            // the conversion. Allow without validation.
            if (!orgCurrencyId || orgCurrencyId === value) return;
            const rateRes = await fetch(
              `${neoBase}/validate-exchange-rate?fromCurrency=${encodeURIComponent(orgCurrencyId)}&toCurrency=${encodeURIComponent(value)}&date=${encodeURIComponent(orderDate)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!rateRes.ok) { revert(); return; }
            const rateData = await rateRes.json();
            if (!rateData?.hasRate || !rateData.rate) { revert(); return; }
            // Rate exists — change stays. The sync effect on hook.selected.currency
            // will pick it up after the user saves the header.
          } catch {
            revert();
          }
        })();
      }
    }

    // Trigger callout — the backend returns empty if no callout is registered
    executeCallout(field, value, hook.editing);
  }, [hook.handleChange, hook.editing, hook.selected, executeCallout, apiBaseUrl, token, ui]);

  // Execute callout for child entity (line-level) fields and apply results via callback.
  // Merges parent header data into formState so callouts have full context (e.g., priceList).
  const handleLineFieldChange = useCallback(async (field, value, rowValues, applyUpdates) => {
    if (!field || (value == null || value === '') || !token || !apiBaseUrl || !detailEntity) return;
    if (field.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(field)) return;

    // These fields are computed client-side — no callout needed.
    // Derived from lineConfig so order, invoice, and future window types all share the same guard.
    const clientSideFieldList = [lineConfig.qtyField, lineConfig.priceField, lineConfig.discountField].filter(Boolean);
    const CLIENT_SIDE_FIELDS = new Set(clientSideFieldList);
    if (CLIENT_SIDE_FIELDS.has(field)) {
      const result = {};
      computeLineGrossAmount(field, value, result, rowValues);
      applyUpdates?.(result, new Set());
      return;
    }

    try {
      const headerData = hook.editing || hook.selected || {};
      const formState = buildCalloutFormState(rowValues, headerData);
      const auxiliaryValues = extractAuxValues(formState);
      const formStateForCallout = normalizeCalloutQty(formState);
      const payload = {
        field,
        value,
        formState: formStateForCallout,
        ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
      };
      const res = await fetch(`${apiBaseUrl}/${detailEntity}/callout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const calloutData = await res.json();
      const result = normalizeCalloutResponse(calloutData, rowValues);

      applyProductCalloutPriceAdjustments(field, result, lineConfig);

      // Resolve missing $_identifier from loaded catalogs for FK fields returned by callout
      // (e.g., callout sets uOM='100' but server omits the display name)
      populateIdentifierFields(api, result, detailEntity, catalogs);
      resolveSnapshotIdentifiers(result, field, rowValues);

      // Tax-included price lists: SL_Order_Product sets grossUnitPrice (price with tax) but
      // omits netUnitPrice (net price). Derive it from the tax factor so the backend receives
      // a valid netUnitPrice instead of null/0 at save time.
      calculateNetUnitPrice(result, taxRateCacheRef, hook);
      applyQtyZeroGuard(result, rowValues);
      // Fallback: when callout returns no lineNetAmount (e.g. SL_Invoice_Amt throws
      // PriceAdjustment exception for products without standard cost), compute qty × price.
      // Uses lineConfig fields so orders, invoices, and future window types all benefit.
      calculateLineNetAmount(result, field, lineConfig, value, rowValues);
      computeLineGrossAmount(field, value, result, rowValues);

      // Resolve tax$_identifier from existing lines if callout didn't include it.
      resolveTaxIdentifier(result, rowValues, hook);
      // forceCalloutFields: explicit opt-in list declared per field in decisions.json.
      // Only those fields bypass the touched-guard when this field triggers a callout.
      // No other window or field is affected unless it declares forceCalloutFields.
      const triggerFieldDef = (addLineFields?.entry ?? []).find(f => f.key === field);
      const forceFields = new Set(triggerFieldDef?.forceCalloutFields ?? []);
      if (field === 'product' && lineConfig.discountField) forceFields.add(lineConfig.discountField);
      // Apply active currency conversion: converts prices added after a header currency
      // change so each new line reflects the order header's currency, not the pricelist's.
      applyProductCurrencyConversion(
        field, result, rowValues, lineConfig,
        activeCurrencyConversionRef.current,
        hook.selected?.['currency$_identifier'] ?? hook.editing?.['currency$_identifier'],
        computeLineGrossAmount,
      );
      roundAmounts(result);
      applyUpdates?.(result, forceFields);


    } catch {
      // Callout is best-effort
    }
  }, [token, apiBaseUrl, detailEntity, hook.editing, hook.selected, catalogs, api, addLineFields, computeLineGrossAmount, resolveTaxFactor]);

  const data = transformRecord
    ? transformRecord(hook.editing || currentItem || {})
    : (hook.editing || currentItem || {});

  // Send total-discount percentage to the backend on blur. Also mirror the
  // saved value into the editing state so subsequent form saves don't overwrite
  // it with the stale data snapshot. Toast confirms persistence to the user.
  const handleTotalDiscountChange = useCallback(async (pct) => {
    const currentId = data?.id || recordId;
    if (!currentId || isNew) return;
    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/${currentId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ etgoTotalDiscount: pct }),
      });
      if (!res.ok) {
        toast.error(await extractErrorMessage(res));
        return;
      }
      hook.handleChange?.('etgoTotalDiscount', pct);
      toast.success(ui('totalDiscountSaved'));
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    }
  }, [data?.id, recordId, isNew, apiBaseUrl, entity, token, hook, ui, extractErrorMessage]);

  const handleNotesSave = useCallback(async (value) => {
    const currentId = data?.id || recordId;
    if (!currentId || isNew || !notesField) return;
    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/${currentId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [notesField]: value }),
      });
      if (!res.ok) {
        toast.error(await extractErrorMessage(res));
        return;
      }
      hook.handleChange?.(notesField, value);
      toast.success(ui('noteSaved'));
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    }
  }, [data?.id, recordId, isNew, notesField, apiBaseUrl, entity, token, hook, ui, extractErrorMessage]);

  // Guard that controls whether "+ Add Lines" is shown.
  // 1. Explicit `addLineGuard` from the window wins (business-specific rules).
  // 2. Otherwise, fall back to the generic "all required header fields must
  //    be filled" check using `requiredHeaderFields` (emitted by the
  //    pipeline). This matches the UX where the add-lines button only
  //    appears once the header form is complete.
  // 3. Otherwise (no metadata at all), allow.
  let canAddLines = resolveCanAddLines(addLineGuard, data, requiredHeaderFields, hook.children ?? []);
  const windowTitle = getWindowTitle(breadcrumb, tMenu, windowName);
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = windowName || windowTitle;
  const favActive = isFavorite(favKey);

  const title = getRecordTitle(isNew, ui, data, titleField);
  const fullBreadcrumb = getFullBreadcrumb(breadcrumb, tMenu, title, windowTitle);

  useSetPageMeta({
    title: title || windowTitle,
    breadcrumb: fullBreadcrumb,
    onAddToFavorites: getOnAddToFavorites(favKey, toggleFavorite, entityLabel, breadcrumb, windowName),
    isFavorite: favActive,
  }, [favActive, title]);

  const allEntryFields = addLineFields.entry ?? [];
  const hiddenEntryDefaults = addLineFields.hidden ?? [];
  const editableChildFields = allEntryFields.filter(f => f.type === 'number' || f.type === 'amount');

  const [panelCounts, setPanelCounts] = useState({});
  useEffect(() => { setPanelCounts({}); }, [parentRecordId]);

  // Split customTabs by placement: 'footer' (default) keeps the existing chip rendering,
  // 'tab' promotes the item to a first-class tab next to secondaryTabs. The footer block
  // and the main tab strip therefore consume disjoint slices of customTabs and never
  // double-render the same entry.
  const footerCustomTabs = customTabs.filter(ct => (ct?.placement ?? 'footer') === 'footer');
  const tabCustomTabs = customTabs.filter(ct => ct?.placement === 'tab');
  const [customTabCounts, setCustomTabCounts] = useState({});
  const [customLinesCount, setCustomLinesCount] = useState(null);
  const [activeCustomBelowTab, setActiveCustomBelowTab] = useState(0);
  // Reuse the secondaryTabs/lines/others activeTab state for custom tabs by prefixing
  // their keys with `custom:` so they cannot collide with secondaryTabs/lines/others/customLines.

  // Build tabs: child entity lines + secondary tabs + custom 'tab' placement + "Others"
  const tabs = buildInitialTabs({
    secondaryTabs, secondaryHooks, panelCounts, DetailTable, detailLabel, detailEntity,
    hook, detailTabIndex, CustomLines, customLinesLabel, customLinesCount,
    customTabsAfterBottom, tabCustomTabs, ui, customTabCounts,
  });

  // When primaryTabs is in use, skip auto-adding Others (handled by a primary tab)
  const [showOthers, setShowOthers] = useState(primaryTabs ? false : null);
  const [activePrimaryTab, setActivePrimaryTab] = useState(primaryTabs?.[0]?.key ?? 'general');
  const [notesFocused, setNotesFocused] = useState(false);

  const othersRef = useRef(null);

  useEffect(() => {
    if (showOthers === null && othersRef.current) {
      // Check if the hidden probe rendered any DOM content
      setShowOthers(othersRef.current.childElementCount > 0);
    }
  });

  pushOthers(showOthers, tabs, othersLabel, ui);

  const isCustomTabActive = tabCustomTabs.some(ct => tabs[activeTab]?.key === customTabKey(ct));

  const renderCustomTabPanels = (resolveIsActive) => tabCustomTabs.map((ct, idx) => {
    const TabComponent = ct.Component;
    const isActive = resolveIsActive(ct, idx);
    const updateCustomTabCount = (count) => setCustomTabCounts(prev => {
      if (prev[ct.key] === count) return prev;
      return { ...prev, [ct.key]: count };
    });
    return (
      <div
        key={customTabKey(ct)}
        className={`p-2 flex flex-col gap-3${embedded ? ' pointer-events-none' : ''}`}
        style={isActive ? undefined : { display: 'none' }}
      >
        <TabComponent
          recordId={data?.id || recordId}
          data={data}
          token={token}
          apiBaseUrl={apiBaseUrl}
          api={api}
          isActive={isActive}
          onCountChange={updateCustomTabCount}
          {...(ct.props || {})}
          data-testid="TabComponent__fa3275" />
      </div>
    );
  });

  useEffect(() => {
    const targetTabKey = location.state?.openSecondaryTab;
    if (!targetTabKey || isNew || !hook.editing) {
      handledOpenSecondaryLineRef.current = false;
      return;
    }
    if (handledOpenSecondaryLineRef.current) return;
    handledOpenSecondaryLineRef.current = true;
    const nextTabIndex = tabs.findIndex(tab => tab.key === targetTabKey);
    if (nextTabIndex >= 0) {
      setActiveTab(nextTabIndex);
    }
    if (location.state?.openAddSecondaryLine) {
      const targetSecondaryTab = secondaryTabs.find(st => st.key === targetTabKey);
      if (targetSecondaryTab?.customAddModal) {
        setCustomModalState({ key: targetTabKey, rowId: null });
      } else {
        setAddingSecondaryLine(prev => ({ ...prev, [targetTabKey]: true }));
        setSelectedSecondaryLine(null);
      }
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openSecondaryTab, location.state?.openAddSecondaryLine, isNew, hook.editing, navigate, location.pathname, tabs, secondaryTabs]);

  // Only black out the whole window when we actually don't have the record yet.
  // A list refresh (hook.loading for the side list) or any unrelated background
  // fetch must not wipe out a form the user was interacting with.

  if (isLoadingRecordForRoute(hook, isNew, recordId)) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {ui('loading')}
      </div>
    );
  }

  const saveActionParams = {
    hook, isDirty, flushPendingLines, data, isNew, navigate, windowName,
    ui, tMenu, onAfterCreate, onAfterSave, token, apiBaseUrl, saveBtnCls,
    isDocumentReadOnly, isProcessed, draftMode, blockSaveForBalance, blockCompleteForBalance,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="detail-view" data-doc-status={_headerData?.documentStatus}>
      {/* Content card with rounded top-left corner */}
      <div className={`flex-1 flex flex-col ${contentBg} rounded-tl-2xl overflow-hidden min-h-0`}>
        {/* Action bar: Cancel + status | actions + save */}
        {embedded ? renderEmbeddedStatusPill(statusField, data, statusEnumLabels) : (
        <div className={getLinesToolbarClassName(linesLayout, toolbarPaddingX, toolbarBorderBottom)}>
          <div className="flex items-center gap-3">
            <Button
              className="h-10 px-3 rounded-lg bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] text-[#121217] text-sm font-medium hover:bg-[#F5F7F9] transition-colors"
              data-testid="action-cancel"
              onClick={() => navigate(`/${windowName}`)}
            >
              {ui('cancel')}
            </Button>
            {statusField && data[statusField] != null && (
              <DocumentStatusPill
                status={data[statusField]}
                enumLabels={statusEnumLabels}
                data-testid="DocumentStatusPill__fa3275" />
            )}
            {extraBadges.map(b => {
              const when = b.when !== undefined ? b.when : true;
              const show = when ? !!data[b.key] : !data[b.key];
              if (!show) return null;
              if (b.hideWhenStatus?.includes(data[statusField])) return null;
              const cls = b.style === 'warning'
                ? 'ml-1 border-amber-300 bg-amber-50 text-amber-700'
                : 'ml-1 bg-blue-600 hover:bg-blue-700 border-transparent text-white';
              const variant = b.style === 'warning' ? 'outline' : 'default';
              return (
                <Badge
                  key={`${b.key}-${when}`}
                  variant={variant}
                  className={cls}
                  data-testid="Badge__fa3275">
                  {b.label}
                </Badge>
              );
            })}
            {topbarExtra && (() => {
              const TopbarExtraComponent = topbarExtra;
              return (
                <TopbarExtraComponent
                  data={data}
                  recordId={data?.id || recordId}
                  token={token}
                  apiBaseUrl={apiBaseUrl}
                  api={api}
                  onProcess={hook.handleProcess}
                  onRefresh={() => hook.fetchById?.(data?.id || recordId)}
                  data-testid="TopbarExtraComponent__fa3275" />
              );
            })()}
          </div>

            <div className="flex items-center gap-2">
              {/* Topbar right slot (e.g. payment status badge) */}
              {topbarRight && (() => {
                const TopbarRightComponent = topbarRight;
                return (
                  <TopbarRightComponent
                    data={data}
                    recordId={data?.id || recordId}
                    token={token}
                    apiBaseUrl={apiBaseUrl}
                    api={api}
                    onProcess={hook.handleProcess}
                    onRefresh={() => hook.fetchById?.(data?.id || recordId)}
                    data-testid="TopbarRightComponent__fa3275" />
                );
              })()}
              {/* Send / Print document — uses DocumentPrintDrawer.
                  Icon unified with RowQuickActions (envelope/Mail) so the same
                  "send document" affordance looks identical in detail and list views. */}
              {documentPreview && !isNew && recordId && (
                <button
                  onClick={() => setShowPrint(true)}
                  className="flex items-center justify-center p-[7px] rounded-md bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_0px_#1212170D] text-muted-foreground hover:bg-[#F1F5F9] hover:text-foreground transition-colors"
                  title={ui('sendPreview')}
                  data-testid="action-document-preview"
                >
                  <Mail className="h-[15px] w-[15px]" data-testid="Mail__fa3275" />
                </button>
              )}
              {/* Print document — shown when documentPreview is not provided */}
              {!documentPreview && !hidePrint && !isNew && recordId && (
                <button
                  onClick={() => setShowPrint(true)}
                  className={`${sqBtnSize} flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors`}
                  title={ui('print')}
                >
                  <Printer className="h-4 w-4" data-testid="Printer__fa3275" />
                </button>
              )}
              {/* Delete record — hidden when hideDeleteWhenComplete and status matches or record is processed */}
              {isDeleteButtonVisible(isNew, recordId, data, statusField, hideDeleteWhenComplete, isProcessed) && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className={`${sqBtnSize} flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors`}
                  title={ui('delete')}
                  data-testid="action-delete"
                >
                  <Trash2 className="h-4 w-4" data-testid="Trash2__fa3275" />
                </button>
              )}
              {/* More actions */}
              {!resolveHideMoreMenu(hideMoreMenu, data) && <div className="relative" ref={moreMenuRef}>
                <button
                  data-testid="action-more"
                  onClick={() => setShowMoreMenu(v => !v)}
                  className={`${sqBtnSize} flex items-center justify-center rounded-md bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_0px_#1212170D] text-muted-foreground hover:bg-[#F1F5F9] hover:text-foreground transition-colors`}
                >
                  <MoreVertical className="h-[15px] w-[15px]" data-testid="MoreVertical__fa3275" />
                </button>
                {showMoreMenu && (() => {
                  const resolvedActions = typeof menuActions === 'function'
                    ? menuActions({ data, status: data?.[statusField] })
                    : menuActions;
                  const visibleActions = resolvedActions.filter(a => a.visible !== false);
                  if (visibleActions.length === 0 && !customMenuContent) return null;
                  return (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 bg-white py-2 min-w-[148px]"
                      style={{
                        borderRadius: '8px',
                        boxShadow:
                          '0px 0px 0px 1px rgba(18,18,23,0.1), 0px 24px 48px rgba(18,18,23,0.03), 0px 10px 18px rgba(18,18,23,0.03), 0px 5px 8px rgba(18,18,23,0.04), 0px 2px 4px rgba(18,18,23,0.04)',
                      }}
                    >
                      {visibleActions.map((action, i) => {
                        const ActionIcon = action.icon;
                        return (
                          <button
                            key={action.key || i}
                            type="button"
                            disabled={docAction.loading}
                            onClick={async () => {
                              setShowMoreMenu(false);
                              if (action.documentAction) {
                                const currentId = data?.id || recordId;
                                try {
                                  await docAction.execute(currentId, action.documentAction);
                                  const msg = (action.successKey ? ui(action.successKey) : action.successMessage) || ui('actionCompleted');
                                  toast.success(msg);
                                  hook.fetchById?.(currentId);
                                } catch (err) {
                                  toast.error(err.message);
                                }
                                return;
                              }
                              if (action.columnName) {
                                hook.handleProcess?.({ columnName: action.columnName, name: action.key });
                              } else if (action.onClick) {
                                action.onClick();
                              }
                            }}
                            className={`w-full text-left px-2 py-1 text-sm leading-6 transition-colors flex items-center gap-2 ${action.destructive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-foreground hover:bg-secondary'
                              } ${docAction.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400 }}
                          >
                            {ActionIcon && (
                              <ActionIcon
                                className="h-4 w-4 flex-shrink-0 ml-1"
                                style={{ color: action.destructive ? undefined : '#828FA3' }}
                                data-testid="ActionIcon__fa3275" />
                            )}
                            <span className={ActionIcon ? 'pl-1' : ''}>
                              {action.labelKey ? ui(action.labelKey) : action.label}
                            </span>
                          </button>
                        );
                      })}
                      {customMenuContent && (() => {
                        const CustomMenuContent = customMenuContent;
                        return (
                          <CustomMenuContent
                            data={data}
                            recordId={data?.id || recordId}
                            token={token}
                            apiBaseUrl={apiBaseUrl}
                            onClose={() => setShowMoreMenu(false)}
                            onRefresh={() => hook.fetchById?.(data?.id || recordId)}
                            data-testid="CustomMenuContent__fa3275" />
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>}
              {/* Extra action buttons from page */}
              {renderExtraActionButtons(extraActions, data, hook, saveBtnCls)}
              {/* Process buttons — only shown for existing records, evaluated locally or by server visibility */}
              {!isNew && processes
                .filter(p => p.displayLogicRaw
                  ? evalDisplayLogicRaw(p.displayLogicRaw, data)
                  : displayLogic?.visibility?.[p.name] !== false)
                .filter(p => !p.requiresLines || hook.children.length > 0)
                .map(p => {
                  const isPrimary = p.style === 'positive';
                  const btnClass = getButtonClass(salesTheme, p, isPrimary);
                  return (
                    <Button
                      key={p.name}
                      variant={isPrimary ? 'default' : 'outline'}
                      size="default"
                      className={`${btnClass} ${saveBtnCls}`.trim()}
                      onClick={() => {
                        for (const g of (p.requiresFieldMax ?? [])) {
                          const condOk = !g.conditionalOnField || data?.[g.conditionalOnField] === g.conditionalValue;
                          if (condOk && Number(data?.[g.field] ?? 0) > Number(g.max)) {
                            toast.error(ui(g.errorKey));
                            return;
                          }
                        }
                        hook.handleProcess?.(p);
                      }}
                      data-testid="Button__fa3275">
                      {tMenu(p.label)}
                    </Button>
                  );
                })}

              {!hideSaveStatuses.includes(_headerData?.documentStatus) && !isDraftModeCompleted
                && renderSaveActions(saveActionParams)}
            </div>
          </div>
        )}


        {/* Scrollable content + optional sidebarContent (full-height independent column) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Content column: tab bar (shrink-0) + scrollable form area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Primary tab bar (General / Additional Info / etc.) */}
            {primaryTabs && (
              <div
                className={getTabsBarClassName(tabsBarPaddingX, tabsBarRightDivider)}
                style={getTabsBarStyle(tabsBarRight, tabsBarRightDivider)}
              >
                {tabsBarRightDivider && (
                  <div className="absolute top-0 bottom-0 w-px bg-[#E8EAEF] pointer-events-none" style={{ left: `calc(100% - ${tabsBarRightDivider})` }} />
                )}
                {renderPrimaryTabButtons(primaryTabsVariant, primaryTabs, setActivePrimaryTab, activePrimaryTab, tMenu)}
                {tabsBarAfter && (() => {
                  const TabsBarAfterComponent = tabsBarAfter;
                  return (
                    <div className="ml-2 flex-shrink-0">
                      <TabsBarAfterComponent
                        data={data}
                        recordId={data?.id || recordId}
                        token={token}
                        apiBaseUrl={apiBaseUrl}
                        api={api}
                        data-testid="TabsBarAfterComponent__fa3275" />
                    </div>
                  );
                })()}
                {tabsBarRight && (() => {
                  const TabsBarRightComponent = tabsBarRight;
                  return (
                    <div className="ml-auto flex-shrink-0">
                      <TabsBarRightComponent
                        data={data}
                        recordId={data?.id || recordId}
                        token={token}
                        apiBaseUrl={apiBaseUrl}
                        api={api}
                        data-testid="TabsBarRightComponent__fa3275" />
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Non-general primary tab: show Panel fullscreen */}
            {isCustomPrimaryTabActive(primaryTabs, activePrimaryTab) ? (() => {
              const activeTab = primaryTabs.find(t => t.key === activePrimaryTab);
              return activeTab?.Panel ? (
                <div className={`flex-1 overflow-auto pb-6 min-w-0 ${detailContentPadding(linesLayout, !!(sidePanel || sidebarContent), 'panel', compactSidebarPadding, formScrollPaddingX)}`}>
                  <activeTab.Panel entity={entity} data={data} token={token} apiBaseUrl={apiBaseUrl} catalogs={catalogs} api={api} editing={hook.editing} onChange={handleChangeWithCallout} />
                </div>
              ) : null;
            })() : null}
            <div className={getDetailContentContainerClassName({ linesLayout, sidePanel, sidebarContent, sidebarAboveTabsOnly, compactSidebarPadding, primaryTabs, activePrimaryTab, formScrollPaddingX, contentOverflow })}>
              {resolveHeaderContent(headerContent, data)}
              {(() => {
                const slotProps = {
                  data,
                  isNew,
                  entity,
                  recordId: data?.id || recordId,
                  token,
                  apiBaseUrl,
                  api,
                  detailEntity,
                  onFieldChange: handleChangeWithCallout,
                  onSave: async () => {
                    const saved = await flushAndSave(data);
                    if (saved?.id && isNew) {
                      hook.primeSaved?.(saved);
                    }
                    return saved;
                  },
                  onAddChild: hook.handleAddChild,
                  onRefresh: (parentId = data?.id || recordId) => {
                    if (!parentId) return;
                    hook.fetchChildren?.(parentId);
                    hook.fetchById?.(parentId);
                  },
                  onRefreshChildren: () => hook.fetchChildren?.(data?.id || recordId),
                };
                const ocrDocType = matchOcrDocType(location.pathname);
                return (
                  <>
                    {headerExtra && (
                      typeof headerExtra === 'function'
                        ? headerExtra(slotProps)
                        : headerExtra
                    )}
                    {!headerExtra && !sidePanel && ocrDocType && (
                      <Suspense fallback={null} data-testid="Suspense__fa3275">
                        <LazyOcrInlineUploader
                          {...slotProps}
                          docTypeId={ocrDocType.id}
                          data-testid="LazyOcrInlineUploader__fa3275" />
                      </Suspense>
                    )}
                  </>
                );
              })()}
              <div className={sidePanelWrapperCls(!!sidePanel, linesLayout)}>
                <div className={getDetailContentClassName(sidePanel, linesLayout)}>

                  {/* Form section — conditionally wrapped with sidebar when sidebarAboveTabsOnly */}
                  {(() => {
                    const formSection = (
                      <>
                        {/* Principal + collapsed fields wrapped in a card */}
                        <div className={`${hideFormCard ? 'hidden' : ''}${noHeaderBorder ? '' : ' rounded-2xl border border-gray-200/70 bg-white shadow-sm'}${whiteFormBackground ? ' bg-white [&_input]:bg-white [&_textarea]:bg-white [&_textarea:disabled]:!bg-white [&_textarea:disabled]:opacity-50' : ''}${embedded ? ' pointer-events-none' : ''}`}>
                          <div className={linesLayout === 'inlineEditable' ? 'p-2' : formCardPadding}>
                            <Form
                              entity={entity}
                              data={data}
                              onChange={handleChangeWithCallout}
                              catalogs={catalogs}
                              layout="horizontal"
                              section="principal"
                              displayLogic={{ readOnly: displayLogic?.readOnly ?? {}, visibility: {} }}
                              api={api}
                              token={token}
                              apiBaseUrl={apiBaseUrl}
                              selectorContext={selectorContextByEntity[entity]}
                              labelOverrides={labelOverrides}
                              registerFields={hook.registerFields}
                              fieldErrors={hook.fieldErrors}
                              onFieldBlur={autoSaveOnBlur ? handleFieldBlur : undefined}
                              data-testid="Form__fa3275" />
                          </div>

                          {/* Collapsible secondary header fields (hidden if no collapsed fields or sidebarContent) */}
                          {!hideMoreDetails && !sidebarContent && (
                            <CollapsibleSection title={ui('moreDetails')} data-testid="CollapsibleSection__fa3275">
                              <div className={`px-6 pb-6${embedded ? ' pointer-events-none' : ''}`}>
                                <Form
                                  entity={entity}
                                  data={data}
                                  onChange={handleChangeWithCallout}
                                  catalogs={catalogs}
                                  layout="horizontal"
                                  section="collapsed"
                                  excludeFields={notesField ? [notesField] : []}
                                  displayLogic={displayLogic}
                                  api={api}
                                  token={token}
                                  apiBaseUrl={apiBaseUrl}
                                  selectorContext={selectorContextByEntity[entity]}
                                  labelOverrides={labelOverrides}
                                  registerFields={hook.registerFields}
                                  fieldErrors={hook.fieldErrors}
                                  onFieldBlur={autoSaveOnBlur ? handleFieldBlur : undefined}
                                  data-testid="Form__fa3275" />
                              </div>
                            </CollapsibleSection>
                          )}
                        </div>

                        {/* Form footer: inline content below form, above tabs */}
                        {formFooter && (
                          <div className={embedded ? 'pointer-events-none' : ''}>
                            {React.createElement(formFooter, { data, entity, onChange: handleChangeWithCallout, catalogs, api, token, apiBaseUrl, editing: hook.editing })}
                          </div>
                        )}
                      </>
                    );
                    if (sidebarAboveTabsOnly && sidebarContent) {
                      return (
                        <div className={`flex items-stretch${tabsSeparator ? ' border-b border-[#E8EAEF]' : ''}`}>
                          <div className="flex-1 min-w-0 space-y-2">{formSection}</div>
                          <div className={sidebarClassName}>{sidebarContent(data)}</div>
                        </div>
                      );
                    }
                    return formSection;
                  })()}

                  {/* Tabs: child entities + Others */}
                  {tabs.length > 0 && (
                    <div className={getLinesTabsSectionClassName(linesLayout)}>
                      <div className={`flex items-center justify-between border-b border-border/50 ${(getInlineEditableShrinkClassName(linesLayout))}`}>
                        <div className="flex items-center gap-0">
                          {tabs.map((tab, idx) => {
                            const tabIndicatorCls = linesLayout === 'inlineEditable'
                              ? 'absolute bottom-0 left-0 right-0 h-[2px] bg-foreground'
                              : 'absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full';
                            return (
                              <TabStripButton
                                key={tab.key}
                                iconKey={tab.key}
                                label={tab.label}
                                count={tab.count}
                                isActive={activeTab === idx}
                                onClick={() => { setActiveTab(idx); setSelectedLine(null); setSelectedSecondaryLine(null); }}
                                paddingY={secondaryTabsPaddingY}
                                showHoverLine={secondaryTabsShowHoverLine}
                                indicatorCls={tabIndicatorCls}
                                tMenu={tMenu}
                                testId={`tab-${tab.key}`}
                                data-testid="TabStripButton__fa3275" />
                            );
                          })}
                        </div>
                      </div>

                      {/* Tab content: Lines.
                    The lines wrapper flows naturally — no internal scroll, no
                    flex-1 height capture. All rows render, the bottom section
                    follows beneath them, and the outer inline-editable column
                    (line 1806 — overflow-y-auto) provides the single vertical
                    scroll for the whole document. `linesScrollRef` is still
                    attached so legacy effects that probe its bounding box keep
                    working; with no overflow on this wrapper they become
                    no-ops on the lines side. */}
                      <div ref={linesScrollRef}>
                        {tabs[activeTab]?.key === 'lines' && DetailTable && (() => {
                          // Only show the loading spinner on INITIAL load (no children yet).
                          // Subsequent refetches (e.g., after PATCH on a child) keep the table
                          // mounted to preserve transient state like InlineLinesPanel's
                          // editingRowId — otherwise editing mode is silently dropped on every
                          // autosave round-trip.
                          if (isInitialChildrenLoading(hook)) {
                            return (
                              <div className="flex items-center justify-center py-10 text-muted-foreground">
                                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              </div>
                            );
                          }
                          if (shouldShowLinesEmptyState(hook, addingLine, LinesEmptyState, isDocumentReadOnly)) {
                            return (
                              <LinesEmptyState
                                data={data}
                                onAddLine={handleAddLineClick}
                                canAddLine={canAddLines}
                                recordId={data?.id || recordId}
                                token={token}
                                apiBaseUrl={apiBaseUrl}
                                onRefresh={() => {
                                  hook.fetchChildren?.(data?.id || recordId);
                                  hook.fetchById?.(data?.id || recordId);
                                }}
                                onSave={handleImportClick}
                                forceOpen={forceOpenImport}
                                onForceOpenHandled={() => setForceOpenImport(false)}
                                data-testid="LinesEmptyState__fa3275" />
                            );
                          }
                          return (
                            <div className={getLinesContainerClassName(linesLayout, embedded)}>
                              {/* Table + add button */}
                              <div className="flex-1 min-w-0">
                                {/* Bulk delete bar (classic only) */}
                                {isBulkDeleteBarVisible(linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows) && (
                                  <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-lg bg-muted/60 border border-border/40">
                                    <span className="text-sm font-medium text-foreground">
                                      {ui('selected', { count: selectedChildRows.length })}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        disabled={deletingChildren}
                                        onClick={async () => {
                                          if (!(await confirmDelete())) return;
                                          setDeletingChildren(true);
                                          try {
                                            const results = await Promise.allSettled(
                                              selectedChildRows.map(row => {
                                                const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
                                                  || `${apiBaseUrl}/${detailEntity}/${row.id}`;
                                                return fetch(childUrl, {
                                                  method: 'DELETE',
                                                  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                                }).then(res => ({ res, row }));
                                              })
                                            );
                                            let deleted = 0;
                                            for (const result of results) {
                                              if (result.status === 'fulfilled' && result.value.res.ok) {
                                                hook.handleDeleteChild(result.value.row.id);
                                                if (selectedLine?.id === result.value.row.id) setSelectedLine(null);
                                                deleted++;
                                              }
                                            }
                                            setSelectedChildRows([]);
                                            if (deleted > 0) toast.success(ui('recordsDeleted', { count: deleted }));
                                            const failed = results.length - deleted;
                                            if (failed > 0) toast.error(ui('recordsCouldNotBeDeleted', { count: failed }));
                                          } catch (err) {
                                            toast.error(err.message || ui('networkError'));
                                          } finally {
                                            setDeletingChildren(false);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__fa3275" />
                                        {getDeleteChildButtonLabel(deletingChildren, ui)}
                                      </button>
                                    </div>
                                  </div>
                                )}
                                <DetailTable
                                  ref={inlineLinesRef}
                                  data={enrichedChildren}
                                  entity={detailEntity}
                                  token={token}
                                  apiBaseUrl={apiBaseUrl}
                                  linesLayout={linesLayout}
                                  isDocumentReadOnly={isDocumentReadOnly}
                                  onRowClick={buildLineRowClickHandler(DetailForm, linesLayout, setSelectedLine)}
                                  selectedRowId={selectedLine?.id}
                                  onSelectionChange={setSelectedChildRows}
                                  showFooterTotals={showDetailFooterTotals ?? !summary.some(f => f.type === 'amount')}
                                  selectorContext={selectorContextByEntity[detailEntity]}
                                  hiddenColumns={[]}
                                  onUpdateRow={buildInlineRowUpdateHandler({ linesLayout, isDocumentReadOnly, api, detailEntity, apiBaseUrl, hook, handleLineFieldChange, prepareLineForPost, token, extractErrorMessage, ui })}
                                  onDeleteRow={buildDeleteRowHandler({ api, detailEntity, isDocumentReadOnly, confirmDelete, apiBaseUrl, token, hook, selectedLine, setSelectedLine, ui, extractErrorMessage })}
                                  addRow={{
                                    ref: primaryAddRowRef,
                                    active: addingLine,
                                    fields: allEntryFields,
                                    resolvedDefaults: hook.childDefaults,
                                    onAdd: async (lineData) => {
                                      // Send all values: entry fields + callout-derived values (tax, prices, uOM, etc.).
                                      // handleAddChild filters out internal keys (_identifier, _aux, CURSOR_FIELD, etc.)
                                      // Also include hidden entry defaults (e.g., fields with predefined values).
                                      for (const hiddenField of hiddenEntryDefaults) {
                                        if (!(hiddenField.key in lineData)) {
                                          if (hiddenField.fromParent) {
                                            lineData[hiddenField.key] = _headerData?.[hiddenField.fromParent];
                                          } else if (hiddenField.fromSibling != null) {
                                            lineData[hiddenField.key] = hook.children?.[0]?.[hiddenField.fromSibling];
                                          } else {
                                            lineData[hiddenField.key] = hiddenField.value;
                                          }
                                        }
                                      }
                                      // Derive unitPrice = listPrice × (1-discount/100) before POST.
                                      // For invoice config (priceField='unitPrice') this is a no-op.
                                      prepareLineForPost(lineData);
                                      setPendingLineValues(null);
                                      return hook.handleAddChild?.(lineData);
                                    },
                                    onCancel: () => { setAddingLine(false); setPendingLineValues(null); },
                                    catalogs,
                                    onFieldChange: handleLineFieldChange,
                                    onValuesChange: setPendingLineValues,
                                  }}
                                  data-testid="DetailTable__fa3275" />

                                {/* Inline edit form for selected child row (when no DetailForm) */}
                                {!DetailForm && editingChild && editableChildFields.length > 0 && (
                                  <div className="mt-3 p-4 border rounded-lg bg-muted/20">
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
                                      {editableChildFields.map(f => (
                                        <div key={f.key} className="flex flex-col gap-1">
                                          <label className="text-xs font-medium text-muted-foreground">{f.label || f.key}</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={editingChild[f.key] ?? ''}
                                            onChange={e => setEditingChild(prev => ({ ...prev, [f.key]: e.target.value }))}
                                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        disabled={savingChild}
                                        onClick={async () => {
                                          setSavingChild(true);
                                          try {
                                            const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', editingChild.id)
                                              || `${apiBaseUrl}/${detailEntity}/${editingChild.id}`;
                                            const fieldValues = {};
                                            for (const f of editableChildFields) {
                                              fieldValues[f.column] = editingChild[f.key];
                                            }
                                            const res = await fetch(childUrl, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                              body: JSON.stringify({ fieldValues }),
                                            });
                                            if (res.ok) {
                                              hook.handleUpdateChild(editingChild.id, editableChildFields.reduce((acc, f) => ({ ...acc, [f.key]: editingChild[f.key] }), {}));
                                              setEditingChild(null);
                                            }
                                          } finally { setSavingChild(false); }
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                      >
                                        {getChildSaveButtonLabel(savingChild, ui)}
                                      </button>
                                      <button
                                        onClick={() => setEditingChild(null)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                                      >
                                        {ui('cancel')}
                                      </button>
                                      <button
                                        disabled={savingChild}
                                        onClick={async () => {
                                          if (!(await confirmDelete())) return;
                                          setSavingChild(true);
                                          try {
                                            const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', editingChild.id)
                                              || `${apiBaseUrl}/${detailEntity}/${editingChild.id}`;
                                            const res = await fetch(childUrl, {
                                              method: 'DELETE',
                                              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                            });
                                            if (res.ok) { hook.handleDeleteChild(editingChild.id); setEditingChild(null); }
                                          } finally { setSavingChild(false); }
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                                      >
                                        {ui('delete')}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {canShowAddLineArea(hook, isDocumentReadOnly, allEntryFields, DetailExtraActions, canAddLines) && (
                                  <div
                                    ref={addLineWrapperRef}
                                    className={getAddLineWrapperClassName(linesLayout)}
                                    style={getAddLineWrapperStyle(linesLayout)}
                                  >
                                    {allEntryFields.length > 0 && (
                                      // alignSelf:flex-start keeps this span from being stretched by
                                      // the flex-column parent — otherwise data-inline-add-portal would
                                      // cover the whole 1840px bar and the outside-click save would never fire.
                                      (<span data-inline-add-portal="true" style={{ alignSelf: 'flex-start' }}>
                                        <AddLineButton
                                          onClick={handleAddLineClick}
                                          label={ui('addLine')}
                                          menuActions={getAddLineMenuActions(getLineMenuActions, data, extraActionsRef, ui)}
                                          data-testid="AddLineButton__fa3275" />
                                      </span>)
                                    )}
                                    {DetailExtraActions && (
                                      <DetailExtraActions
                                        ref={getLineMenuActionsRef(getLineMenuActions, extraActionsRef)}
                                        hideTrigger={!!getLineMenuActions}
                                        data={data}
                                        recordId={data?.id || recordId}
                                        token={token}
                                        apiBaseUrl={apiBaseUrl}
                                        onRefresh={() => {
                                          hook.fetchChildren?.(data?.id || recordId);
                                          hook.fetchById?.(data?.id || recordId);
                                        }}
                                        onSave={handleImportClick}
                                        forceOpen={forceOpenImport}
                                        onForceOpenHandled={() => setForceOpenImport(false)}
                                        data-testid="DetailExtraActions__fa3275" />
                                    )}
                                    {/* Selection toolbar — portaled to document.body so the
                              downward shadow renders OUTSIDE the linesScrollRef's
                              overflow-auto clipping boundary even when scroll is
                              engaged (many rows). Positioned via fixed coords from
                              `barRect`, measured off `addLineWrapperRef`. */}
                                    {shouldShowInlineDeleteSelectionBar(linesLayout, api, detailEntity) && (
                                      <LinesSelectionBar
                                        visible={selectionBarVisible}
                                        closing={selectionBarClosing}
                                        barRect={barRect}
                                        count={selectedChildRows.length}
                                        selectedLabel={ui('selected', { count: selectedChildRows.length })}
                                        totalLabel={getSelectedLinesTotalLabel(bottomSection, selectedChildRows, lineConfig, data)}
                                        deleting={deletingChildren}
                                        deleteTitle={ui('delete')}
                                        closeTitle={ui('close')}
                                        onDelete={async () => {
                                          if (!(await confirmDelete())) return;
                                          setDeletingChildren(true);
                                          try {
                                            const results = await Promise.allSettled(
                                              selectedChildRows.map(row => {
                                                const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
                                                  || `${apiBaseUrl}/${detailEntity}/${row.id}`;
                                                return fetch(childUrl, {
                                                  method: 'DELETE',
                                                  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                                }).then(res => ({ res, row }));
                                              })
                                            );
                                            let deleted = 0;
                                            for (const result of results) {
                                              if (result.status === 'fulfilled' && result.value.res.ok) {
                                                hook.handleDeleteChild(result.value.row.id);
                                                if (selectedLine?.id === result.value.row.id) setSelectedLine(null);
                                                deleted++;
                                              }
                                            }
                                            inlineLinesRef.current?.clearSelection?.();
                                            setSelectedChildRows([]);
                                            if (deleted > 0) toast.success(ui('recordsDeleted', { count: deleted }));
                                            const failed = results.length - deleted;
                                            if (failed > 0) toast.error(ui('recordsCouldNotBeDeleted', { count: failed }));
                                          } catch (err) {
                                            toast.error(err.message || ui('networkError'));
                                          } finally {
                                            setDeletingChildren(false);
                                          }
                                        }}
                                        onClose={() => {
                                          inlineLinesRef.current?.clearSelection?.();
                                          setSelectedChildRows([]);
                                        }}
                                        data-testid="LinesSelectionBar__fa3275" />
                                    )}
                                  </div>
                                )}
                              </div>
                              {/* Right sidebar: line detail form. Suppressed in inlineEditable mode —
                        edit happens inside the row via InlineLinesPanel. */}
                              {shouldShowDetailFormSidebar(linesLayout, DetailForm, selectedLine, isClosingLine) && (
                                <div className={`w-[48rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${(getSidebarSlideClassName(isClosingLine))}`}>
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-foreground">{ui('entityDetail', { label: tMenu(detailLabel || 'Line') })}</span>
                                    <button
                                      onClick={closeLine}
                                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" data-testid="X__fa3275" />
                                    </button>
                                  </div>
                                  <DetailForm
                                    data={lineEdits ?? selectedLine}
                                    readOnly={!hook.editing || isProcessed}
                                    onChange={(key, val, column) => {
                                      setLineEdits(prev => ({ ...(prev ?? selectedLine), [key]: val }));
                                      if (column) setLineEditColumns(prev => ({ ...prev, [key]: column }));
                                      // Batch all synchronous onChange calls from a single product
                                      // selection (product, product$_identifier, unitPrice/grossUnitPrice)
                                      // into ONE handleLineFieldChange with a complete snapshot.
                                      // This mirrors how DataTable builds its snapshot before the callout.
                                      if (!sidebarCalloutBatchRef.current) {
                                        sidebarCalloutBatchRef.current = {
                                          base: lineEdits ?? selectedLine ?? {},
                                          changes: {},
                                          primaryField: key,
                                          primaryVal: val,
                                        };
                                      }
                                      sidebarCalloutBatchRef.current.changes[key] = val;
                                      clearTimeout(sidebarCalloutTimerRef.current);
                                      sidebarCalloutTimerRef.current = setTimeout(() => {
                                        const batch = sidebarCalloutBatchRef.current;
                                        sidebarCalloutBatchRef.current = null;
                                        if (!batch) return;
                                        const rowSnapshot = { ...batch.base, ...batch.changes };
                                        handleLineFieldChange(
                                          batch.primaryField, batch.primaryVal,
                                          rowSnapshot,
                                          (updates) => setLineEdits(prev => ({ ...(prev ?? selectedLine), ...updates })),
                                        );
                                      }, 0);
                                    }}
                                    entity={detailEntity}
                                    catalogs={catalogs}
                                    token={token}
                                    apiBaseUrl={apiBaseUrl}
                                    selectorContext={selectorContextByEntity[detailEntity]}
                                    labelOverrides={labelOverrides}
                                    data-testid="DetailForm__fa3275" />
                                  {shouldShowLineActionButtons(hook, lineEdits, selectedLine) && (
                                    <div className="flex gap-2 mt-4">
                                      {lineEdits && !isDocumentReadOnly && (
                                        <>
                                          <button
                                            disabled={savingLine}
                                            onClick={async () => {
                                              setSavingLine(true);
                                              try {
                                                const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', selectedLine.id)
                                                  || `${apiBaseUrl}/${detailEntity}/${selectedLine.id}`;
                                                // Derive unitPrice = listPrice × (1-discount/100) before PATCH.
                                                // Merge with selectedLine so listPrice/discount are always available.
                                                const patchData = { ...(selectedLine ?? {}), ...lineEdits };
                                                prepareLineForPost(patchData);
                                                const patchEdits = { ...lineEdits };
                                                if (patchData.unitPrice !== undefined) patchEdits.unitPrice = patchData.unitPrice;
                                                const fieldValues = {};
                                                normalizePatchFieldValues(patchEdits, fieldValues);
                                                const res = await fetch(childUrl, {
                                                  method: 'PATCH',
                                                  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                                  body: JSON.stringify(fieldValues),
                                                });
                                                if (res.ok) {
                                                  setLineEdits(null);
                                                  setLineEditColumns({});
                                                  toast.success('Record saved');
                                                  // Always refresh from persisted record — backend may recompute
                                                  // derived fields (lineNetAmount, discounts) on save.
                                                  try {
                                                    const freshRes = await fetch(childUrl, {
                                                      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                                    });
                                                    if (freshRes.ok) {
                                                      const freshJson = await freshRes.json();
                                                      const freshLine = freshJson?.response?.data?.[0] ?? freshJson;
                                                      if (freshLine?.id) {
                                                        hook.handleUpdateChild(selectedLine.id, freshLine);
                                                        setSelectedLine(prev => ({ ...prev, ...freshLine }));
                                                      }
                                                    } else {
                                                      hook.handleUpdateChild(selectedLine.id, fieldValues);
                                                      setSelectedLine(prev => ({ ...prev, ...fieldValues }));
                                                    }
                                                  } catch (_) {
                                                    hook.handleUpdateChild(selectedLine.id, fieldValues);
                                                    setSelectedLine(prev => ({ ...prev, ...fieldValues }));
                                                  }
                                                } else {
                                                  toast.error(await extractErrorMessage(res));
                                                }
                                              } catch (err) {
                                                toast.error(err.message || 'Network error');
                                              } finally { setSavingLine(false); }
                                            }}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                          >
                                            {getSaveButtonLabel(savingLine, ui)}
                                          </button>
                                          <button
                                            onClick={() => setLineEdits(null)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                                          >
                                            {ui('discard')}
                                          </button>
                                        </>
                                      )}
                                      {canDeleteSelectedLine(api, detailEntity, selectedLine, isDocumentReadOnly) && (
                                        <button
                                          disabled={savingLine}
                                          onClick={async () => {
                                            if (!(await confirmDelete())) return;
                                            setSavingLine(true);
                                            try {
                                              const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', selectedLine.id)
                                                || `${apiBaseUrl}/${detailEntity}/${selectedLine.id}`;
                                              const res = await fetch(childUrl, {
                                                method: 'DELETE',
                                                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                              });
                                              if (res.ok) {
                                                hook.handleDeleteChild(selectedLine.id);
                                                toast.success('Record deleted');
                                                closeLine();
                                              } else {
                                                toast.error(await extractErrorMessage(res));
                                              }
                                            } catch (err) {
                                              toast.error(err.message || 'Network error');
                                            } finally { setSavingLine(false); }
                                          }}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                                        >
                                          <Trash2 className="h-4 w-4" data-testid="Trash2__fa3275" />
                                          {ui('delete')}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Tab content: CustomLines (replaces standard lines table) */}
                        {tabs[activeTab]?.key === 'customLines' && CustomLines && (
                          <div className={getCustomLinesTabClassName(embedded)}>
                            <CustomLines
                              recordId={data?.id || recordId}
                              data={data}
                              status={data?.[statusField]}
                              token={token}
                              apiBaseUrl={apiBaseUrl}
                              api={api}
                              editing={hook.editing}
                              catalogs={catalogs}
                              entity={detailEntity}
                              onCountChange={(n) => setCustomLinesCount(n)}
                              onRefresh={() => { hook.fetchChildren?.(data?.id || recordId); hook.fetchById?.(data?.id || recordId); }}
                              isNew={isNew}
                              onSave={async () => {
                                const saved = await hook.handleSave(data);
                                if (saved?.id && isNew) {
                                  hook.primeSaved?.(saved);
                                  navigate(`/${windowName}/${saved.id}`, { replace: true, state: { openAddLine: true } });
                                }
                                return saved;
                              }}
                              data-testid="CustomLines__fa3275" />
                          </div>
                        )}

                        {/* Tab content: secondary child entity tabs (or form-only tabs) */}
                        {secondaryTabs.map((st, stIdx) => {
                          const isActiveTab = tabs[activeTab]?.key === st.key;
                          // Panel tabs are always mounted so their onCount fires eagerly (counts appear without clicking).
                          // Non-Panel tabs stay lazy to avoid unnecessary data fetches.
                          if (!isActiveTab && !st.Panel) return false;
                          const secondaryLineHandlers = buildSecondaryLineHandlers({
                            st, stIdx, api, apiBaseUrl, token, secondaryHooks, ui,
                            extractErrorMessage, confirmDelete, secondaryInlineLinesRefs,
                            selectedSecondaryLine, secondaryLineEdits, secondarySelectedRows,
                            setAddingSecondaryLine, setSavingSecondaryLine, setSelectedSecondaryLine,
                            setSecondaryLineEdits, setSecondaryLineEditColumns, setSecondaryDeleting,
                            setSecondarySelectedRows,
                          });
                          return (
                          <div key={st.key} style={!isActiveTab ? { display: 'none' } : undefined} className={getSecondaryTabContentClassName(secondaryTabContentPaddingT, embedded)}>
                            {(() => {
                              if (st.isFormTab) return (
                              <SecondaryFormTab data={data} hook={hook} onChange={(key, val, column) => {
                                setSecondaryLineEdits(prev => ({...(prev ?? {}), [key]: val}));
                                if (column) setSecondaryLineEditColumns(prev => ({...prev, [key]: column}));
                              }} st={st} catalogs={catalogs} token={token} apiBaseUrl={apiBaseUrl}
                                                selectorContextByEntity={selectorContextByEntity}
                                                labelOverrides={labelOverrides}
                                                data-testid="SecondaryFormTab__fa3275" />
                            );
                              if (st.Panel) return (
                              <SecondaryPanelTab st={st} data={data} token={token} apiBaseUrl={apiBaseUrl}
                                                 onCount={(n) => setPanelCounts(prev => ({...prev, [st.key]: n}))}
                                                 data-testid="SecondaryPanelTab__fa3275" />
                            );
                              return (
                              <SecondaryTableTab
                                st={st}
                                stIdx={stIdx}
                                linesLayout={linesLayout}
                                secondaryInlineLinesRef={getSecondaryInlineLinesRef}
                                secondaryHooks={secondaryHooks}
                                token={token}
                                apiBaseUrl={apiBaseUrl}
                                selectorContextByEntity={selectorContextByEntity}
                                catalogs={catalogs}
                                api={api}
                                crud={api?.crud}
                                ui={ui}
                                hook={hook}
                                labelOverrides={labelOverrides}
                                extractErrorMessage={extractErrorMessage}
                                enableSecondaryRowDelete={enableSecondaryRowDelete}
                                selectedSecondaryLine={selectedSecondaryLine}
                                secondaryLineEdits={secondaryLineEdits}
                                closingSecondaryLine={isClosingSecondaryLine}
                                addingSecondaryLine={addingSecondaryLine}
                                savingLine={savingSecondaryLine}
                                secondaryAddRowRef={getSecondaryAddRowRef(st.key)}
                                secondaryAddRowSeed={secondaryAddRowSeed}
                                secondaryChildDefaults={secondaryHooks[stIdx]?.childDefaults}
                                secondaryAddLineWrapperRef={getSecondaryAddLineWrapperRef(st.key)}
                                hideChevron={hideAddLineChevron}
                                secondaryBarVisible={secondaryBarVisible}
                                secondaryBarClosing={secondaryBarClosing}
                                secondaryBarRects={secondaryBarRects}
                                secondaryDeleting={secondaryDeleting}
                                secondarySelectedRows={secondarySelectedRows}
                                setSecondarySelectedRows={setSecondarySelectedRows}
                                setCustomModalState={setCustomModalState}
                                detailPanelTitle={ui('entityDetail', {label: tMenu(st.label)})}
                                addLineLabel={ui('addEntity', {label: tMenu(st.label)})}
                                selectedLabel={ui('selected', {count: (secondarySelectedRows[st.key] ?? []).length})}
                                loadingLabel={ui('loading')}
                                saveLabel={ui('save')}
                                discardLabel={ui('discard')}
                                deleteLabel={ui('delete')}
                                closeTitle={ui('close')}
                                openCustomModal={(row) => setCustomModalState({key: st.key, rowId: row.id})}
                                openSecondaryLine={(row) => {
                                  setSelectedSecondaryLine({...row, _tabKey: st.key});
                                  setSecondaryLineEdits(null);
                                }}
                                onDeleteRow={(row) => setSecondaryDeleteConfirm({tabKey: st.key, tabIndex: stIdx, id: row.id})}
                                onCloseDetailPanel={closeSecondaryLine}
                                onChange={(key, val, column) => {
                                  setSecondaryLineEdits(prev => ({...(prev ?? selectedSecondaryLine), [key]: val}));
                                  if (column) setSecondaryLineEditColumns(prev => ({...prev, [key]: column}));
                                }}
                                onAdd={secondaryLineHandlers.onAdd}
                                onCancel={() => setAddingSecondaryLine(prev => ({...prev, [st.key]: false}))}
                                onAddLineClick={() => runAddLineAction(st, {
                                  handleCustomModalAddClick,
                                  handleSecondaryAddLineToggle,
                                })}
                                onSaveLine={secondaryLineHandlers.onSaveLine}
                                onDiscardLine={() => setSecondaryLineEdits(null)}
                                onDeleteLine={() => setSecondaryDeleteConfirm({tabKey: st.key, tabIndex: stIdx, id: selectedSecondaryLine.id})}
                                onDelete={secondaryLineHandlers.onDelete}
                                onClose={() => {
                                  secondaryInlineLinesRefs.current[st.key]?.current?.clearSelection?.();
                                  setSecondarySelectedRows(prev => ({...prev, [st.key]: []}));
                                }}
                                data-testid="SecondaryTableTab__fa3275" />
                            );
                            })()}
                          </div>
                          );
                        })}

                        {/* Tab content: Others (secondary header fields) */}
                        {tabs[activeTab]?.key === 'others' && (
                          <div className={getOthersTabClassName(embedded)}>
                            <Form
                              entity={entity}
                              data={data}
                              onChange={handleChangeWithCallout}
                              catalogs={catalogs}
                              layout="horizontal"
                              section="other"
                              displayLogic={displayLogic}
                              api={api}
                              token={token}
                              apiBaseUrl={apiBaseUrl}
                              selectorContext={selectorContextByEntity[entity]}
                              labelOverrides={labelOverrides}
                              fieldErrors={hook.fieldErrors}
                              data-testid="Form__fa3275" />
                          </div>
                        )}

                        {/* Tab content: custom tabs with placement='tab'. We always mount the
                    component (so it can manage its own internal state and not lose
                    scroll/pagination on tab switches) but hide inactive ones via
                    display:none and pass `isActive` so the component can defer its
                    first fetch until it actually becomes visible. */}
                        {!customTabsAfterBottom && renderCustomTabPanels((ct) => tabs[activeTab]?.key === customTabKey(ct))}

                      </div>

                    </div>
                  )}

                  {/* Hidden probe: detect if Others form has content (outside tabs block so it fires even when tabs is empty) */}
                  {showOthers === null && (
                    <div ref={othersRef} className="hidden">
                      <Form
                        entity={entity}
                        data={data}
                        onChange={() => { }}
                        catalogs={catalogs}
                        section="other"
                        data-testid="Form__fa3275" />
                    </div>
                  )}

                  {/* Simple entity (no child): full form only */}
                  {!DetailTable && !isCustomTabActive && (
                    <>
                      {summary.length > 0 && (
                        <div className="mt-1">
                          <SummaryBar fields={summary} data={data} data-testid="SummaryBar__fa3275" />
                        </div>
                      )}
                    </>
                  )}

                  {/* Bottom section: hidden when a custom tab (Adjuntos, etc.) is active.
                In inlineEditable mode the wrapper is shrink-0 so it stays fixed
                at the bottom while the lines area scrolls in the middle. */}
                  <div ref={bottomSectionRef} className={getInlineEditableShrinkClassName(linesLayout)}>
                    {!isCustomTabActive && (bottomSection ? (() => {
                      const BottomComponent = bottomSection;
                      return (
                        <BottomComponent
                          recordId={data?.id || recordId}
                          data={data}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                          api={api}
                          summary={summary}
                          notesField={notesField}
                          onFieldChange={handleChangeWithCallout}
                          notesFocused={notesFocused}
                          setNotesFocused={setNotesFocused}
                          lines={hook.children}
                          pendingLine={pendingLineValues}
                          editingLine={lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine}
                          lineConfig={lineConfig}
                          totalDiscountPct={Number(data?.etgoTotalDiscount ?? 0)}
                          onTotalDiscountChange={handleTotalDiscountChange}
                          onNotesSave={handleNotesSave}
                          data-testid="BottomComponent__fa3275" />
                      );
                    })() : (
                      <>
                        {/* Totals block: BalanceFooterPanel for double-entry windows, else DocumentTotalsPanel */}
                        {balanceFooter ? (
                          <BalanceFooterPanel
                            lines={hook.children}
                            pendingLine={pendingLineValues}
                            editingLine={lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine}
                            config={balanceFooter}
                            formatAmount={formatAmount}
                            currency={data['currency$_identifier']}
                            data-testid="BalanceFooterPanel__fa3275" />
                        ) : (() => {
                          const subtotalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('summed') || f.key.toLowerCase().includes('totallines') || f.key.toLowerCase().includes('lineamount')));
                          const totalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('grand') || (f.key.toLowerCase().includes('total') && !f.key.toLowerCase().includes('line'))));
                          if (!subtotalField && !totalField) return null;
                          const currency = data['currency$_identifier'];
                          return (
                            <DocumentTotalsPanel
                              lines={hook.children}
                              pendingLine={pendingLineValues}
                              editingLine={lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine}
                              lineConfig={lineConfig}
                              formatAmount={formatAmount}
                              currency={currency}
                              readOnly={isDocumentReadOnly}
                              totalDiscountPct={resolveTotalDiscountPct(data, hook.children)}
                              onTotalDiscountChange={handleTotalDiscountChange}
                              data-testid="DocumentTotalsPanel__fa3275" />
                          );
                        })()}

                        {/* After-totals slot (e.g. payment footer) */}
                        {afterTotals && (() => {
                          const AfterTotalsComponent = afterTotals;
                          return (
                            <AfterTotalsComponent
                              recordId={data?.id || recordId}
                              data={data}
                              token={token}
                              apiBaseUrl={apiBaseUrl}
                              api={api}
                              data-testid="AfterTotalsComponent__fa3275" />
                          );
                        })()}

                        {/* Footer: Related Docs + Notes */}
                        {(footerCustomTabs.length > 0 || !!notesField) && (
                          <div className="mt-1 bg-muted/20 border-t border-border/40" style={{ borderTopWidth: '0.5px' }}>
                            {footerCustomTabs.length > 0 && (
                              <div className={getDocsRowClassName(embedded)} style={{ borderBottomWidth: '0.5px' }}>
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-0.5 shrink-0 w-24">{ui('docs')}</span>
                                <div className="flex-1">
                                  {footerCustomTabs.map(ct => {
                                    const TabComponent = ct.Component;
                                    return (
                                      <TabComponent
                                        key={ct.key}
                                        recordId={data?.id || recordId}
                                        data={data}
                                        token={token}
                                        apiBaseUrl={apiBaseUrl}
                                        api={api}
                                        layout="chips"
                                        {...(ct.props || {})}
                                        data-testid="TabComponent__fa3275" />
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {notesField && (
                              <div className={getNotesRowClassName(embedded)}>
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1.5 shrink-0 w-24">{ui('notes')}</span>
                                <div data-testid="notes-textarea" className={`flex-1 flex flex-col border border-border/40 rounded bg-white transition-all py-1.5`} style={{ borderWidth: '0.5px' }}>
                                  {renderNotesField(notesFocused, data, notesField, handleChangeWithCallout, handleNotesSave, setNotesFocused, ui)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ))}

                    {/* customTabsAfterBottom: custom tabs rendered below the bottomSection */}
                    {customTabsAfterBottom && tabCustomTabs.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center border-b border-border/50">
                          {tabCustomTabs.map((ct, idx) => {
                            const isActive = activeCustomBelowTab === idx;
                            return (
                              <TabStripButton
                                key={customTabKey(ct)}
                                iconKey={customTabKey(ct)}
                                label={ct.labelKey ? ui(ct.labelKey) : ct.label}
                                count={customTabCounts[ct.key]}
                                isActive={isActive}
                                onClick={() => setActiveCustomBelowTab(idx)}
                                tMenu={tMenu}
                                testId={`tab-${customTabKey(ct)}`}
                                data-testid="TabStripButton__fa3275" />
                            );
                          })}
                        </div>
                        <div>
                          {renderCustomTabPanels((ct, idx) => activeCustomBelowTab === idx)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {sidePanel && (
                  <div
                    className="w-full max-w-full shrink-0 self-stretch border-t lg:border-t-0 lg:w-[280px] lg:border-l border-gray-200 pt-3 lg:pt-0 pl-0 lg:pl-3 pr-0 lg:pr-3"
                    style={sidePanelStyle}
                  >
                    {renderSidePanel(sidePanel, data, recordId, token, apiBaseUrl, api, isNew)}
                  </div>
                )}
              </div>
            </div>
          </div>{/* end content column wrapper */}
          {sidebarContent && !sidebarAboveTabsOnly && (
            <div className={sidebarClassName}>
              {resolveSidebarContent(sidebarContent, data)}
            </div>
          )}
        </div>
      </div>
      <DocumentPrintDrawer
        open={showPrint}
        onClose={() => setShowPrint(false)}
        windowName={windowName}
        documentIds={getDocumentIds(recordId)}
        token={token}
        data-testid="DocumentPrintDrawer__fa3275" />
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        data-testid="Dialog__fa3275">
        <DialogContent className="max-w-sm" data-testid="DialogContent__fa3275">
          <DialogHeader data-testid="DialogHeader__fa3275">
            <DialogTitle data-testid="DialogTitle__fa3275">{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__fa3275">
              {ui('deleteConfirmMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="DialogFooter__fa3275">
            <DialogClose asChild data-testid="DialogClose__fa3275">
              <Button variant="outline" size="sm" data-testid="Button__fa3275">{ui('cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              data-testid="action-delete-confirm"
              onClick={async () => {
                setShowDeleteConfirm(false);
                await hook.handleDelete();
                navigate(`/${windowName}`);
              }}
            >
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(secondaryDeleteConfirm)}
        onOpenChange={(open) => { if (!open) setSecondaryDeleteConfirm(null); }}
        data-testid="Dialog__fa3275">
        <DialogContent className="max-w-sm" data-testid="DialogContent__fa3275">
          <DialogHeader data-testid="DialogHeader__fa3275">
            <DialogTitle data-testid="DialogTitle__fa3275">{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__fa3275">
              {ui('deleteConfirmMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="DialogFooter__fa3275">
            <DialogClose asChild data-testid="DialogClose__fa3275">
              <Button variant="outline" size="sm" data-testid="Button__fa3275">{ui('cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!secondaryDeleteConfirm) return;
                setSavingSecondaryLine(true);
                try {
                  const secUrl = `${apiBaseUrl}/${secondaryDeleteConfirm.tabKey}/${secondaryDeleteConfirm.id}`;
                  const res = await fetch(secUrl, {
                    method: 'DELETE',
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  });
                  if (res.ok) {
                    secondaryHooks[secondaryDeleteConfirm.tabIndex]?.handleDeleteChild(secondaryDeleteConfirm.id);
                    toast.success('Record deleted');
                    setSecondaryDeleteConfirm(null);
                    closeSecondaryLine();
                  } else {
                    toast.error(await extractErrorMessage(res));
                  }
                } catch (err) {
                  toast.error(err.message || 'Network error');
                } finally {
                  setSavingSecondaryLine(false);
                }
              }}
              data-testid="Button__fa3275">
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingDeleteConfirm)}
        onOpenChange={(open) => {
          if (!open && pendingDeleteConfirm) {
            pendingDeleteConfirm.resolve(false);
            setPendingDeleteConfirm(null);
          }
        }}
        data-testid="Dialog__fa3275">
        <DialogContent className="max-w-sm" data-testid="DialogContent__fa3275">
          <DialogHeader data-testid="DialogHeader__fa3275">
            <DialogTitle data-testid="DialogTitle__fa3275">{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__fa3275">{ui('deleteConfirmMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="DialogFooter__fa3275">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pendingDeleteConfirm?.resolve(false);
                setPendingDeleteConfirm(null);
              }}
              data-testid="Button__fa3275">
              {ui('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                pendingDeleteConfirm?.resolve(true);
                setPendingDeleteConfirm(null);
              }}
              data-testid="Button__fa3275">
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {secondaryTabs.map((st, idx) => {
        if (!st.customAddModal) return null;
        const CustomModal = st.customAddModal;
        return (
          <CustomModal
            key={st.key}
            open={customModalState.key === st.key}
            onClose={() => setCustomModalState({ key: null, rowId: null })}
            onSaved={() => {
              secondaryHooks[idx]?.handleSelect(hook.selected ?? hook.editing);
              setCustomModalState({ key: null, rowId: null });
            }}
            rowId={customModalState.key === st.key ? customModalState.rowId : null}
            bpId={parentRecordId}
            apiBase={apiBaseUrl}
            token={token}
            selectorContext={selectorContextByEntity[st.key] ?? {}}
            data-testid="CustomModal__fa3275" />
        );
      })}
    </div>
  );
}
function handleEntryIdentifierChange(entry, hook, key, api, catalogs) {
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

function applyProductCalloutPriceAdjustments(field, result, lineConfig) {
  if (field !== 'product') return;
  if (result.standardPrice != null && (result.listPrice == null || Number(result.listPrice) === 0)) {
    result.listPrice = result.standardPrice;
  }
  if (lineConfig.discountField) {
    result[lineConfig.discountField] = 0;
  }
}

function applyProductCurrencyConversion(field, result, rowValues, lineConfig, activeCurrencyConversion, currencyIdentifier, computeLineGrossAmount) {
  if (field !== 'product' || !activeCurrencyConversion) return;
  const { rate, toCurrency } = activeCurrencyConversion;
  result.currency = toCurrency;
  if (currencyIdentifier) {
    result['currency$_identifier'] = currencyIdentifier;
  }
  const rawPrice = parseFloat(String(result[lineConfig.priceField] ?? 0));
  if (rawPrice > 0 && rate !== 1) {
    const convertedPrice = parseFloat((rawPrice * rate).toFixed(2));
    result[lineConfig.priceField] = convertedPrice;
    if (result.standardPrice != null) result.standardPrice = convertedPrice;
    if (result.unitPrice != null) result.unitPrice = convertedPrice;
    if (result.listPrice != null) result.listPrice = convertedPrice;
    computeLineGrossAmount(lineConfig.priceField, convertedPrice, result, {
      ...rowValues,
      ...result,
      [lineConfig.priceField]: convertedPrice,
    });
  }
}

function resolveTaxIdentifier(result, rowValues, hook) {
  if (!result['tax$_identifier']) {
    const effectiveTaxId = result.tax ?? rowValues.tax;
    if (effectiveTaxId) {
      const ref = (hook.children || []).find(l => l.tax === effectiveTaxId && l['tax$_identifier']);
      if (ref) result['tax$_identifier'] = ref['tax$_identifier'];
    }
  }
}

function calculateLineNetAmount(result, field, lineConfig, value, rowValues) {
  if (result.lineNetAmount == null && (field === lineConfig.qtyField || field === lineConfig.priceField || field === 'product')) {
    const qty = field === lineConfig.qtyField ? (parseFloat(value) || 0)
      : (parseFloat(String(rowValues[lineConfig.qtyField] ?? '')) || 0);
    const price = field === lineConfig.priceField ? (parseFloat(value) || 0)
      : (parseFloat(String(result[lineConfig.priceField] ?? rowValues[lineConfig.priceField] ?? '')) || 0);
    if (qty > 0 && price > 0) result.lineNetAmount = String(qty * price);
  }
}

function calculateNetUnitPrice(result, taxRateCacheRef, hook) {
  if (result.grossUnitPrice != null && result.netUnitPrice == null) {
    const taxId = result.tax;
    let taxFactor = null;
    const calloutRate = parseFloat(String(result.taxRate ?? ''));
    if (isPositiveNumeric(calloutRate)) taxFactor = 1 + calloutRate / 100;
    if (canUseCachedTaxRate(taxFactor, taxId, taxRateCacheRef)) {
      taxFactor = 1 + taxRateCacheRef.current[taxId] / 100;
    }
    if (taxFactor === null && taxId) {
      const ref = (hook.children || []).find(l => l.tax === taxId &&
        parseFloat(String(l.grossAmount ?? '')) > 0 &&
        parseFloat(String(l.lineNetAmount ?? '')) > 0
      );
      if (ref) taxFactor = parseFloat(String(ref.grossAmount)) / parseFloat(String(ref.lineNetAmount));
    }
    const gross = Number(result.grossUnitPrice);
    result.netUnitPrice = taxFactor != null && taxFactor > 1
      ? parseFloat((gross / taxFactor).toFixed(6))
      : gross;
  }
}

function canUseCachedTaxRate(taxFactor, taxId, taxRateCacheRef) {
  return taxFactor === null && taxId && taxRateCacheRef.current[taxId] != null;
}

function isPositiveNumeric(calloutRate) {
  return !isNaN(calloutRate) && calloutRate > 0;
}

function populateIdentifierFields(api, result, detailEntity, catalogs) {
  if (api?.selectors) {
    for (const key of Object.keys(result)) {
      if (key.includes('$_identifier')) continue;
      if (result[key + '$_identifier']) continue;
      const selConfig = api.selectors.find(s => s.field === key && s.entity === detailEntity);
      if (!selConfig) continue;
      const opts = getCatalogOptions(catalogs, detailEntity, selConfig);
      const match = opts.find(o => o.id === result[key]);
      if (match) result[key + '$_identifier'] = match.label || match.name || match._identifier || '';
    }
  }
}

function getButtonClass(salesTheme, p, isPrimary) {
  if (salesTheme) {
    if (p.style === 'destructive') {
      return 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100';
    } else {
      if (isPrimary) {
        return 'bg-amber-400 text-black hover:bg-amber-500 border-transparent font-medium';
      } else {
        return 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
      }
    }
  } else {
    if (p.style === 'destructive') {
      return 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20';
    } else {
      return '';
    }
  }
}

