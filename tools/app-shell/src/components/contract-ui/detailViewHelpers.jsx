/**
 * Extracted from DetailView.jsx via ast-refactor.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button.jsx';
import {Trash2} from 'lucide-react';
import {toast} from 'sonner';
import PaymentLifecycleConfirmModal from '@/windows/custom/shared/PaymentLifecycleConfirmModal';
import DocumentTotalsPanel from './DocumentTotalsPanel.jsx';
import BalanceFooterPanel from './BalanceFooterPanel.jsx';
import SelectionToolbar from './SelectionToolbar.jsx';
import {computeBalance} from '@/lib/balanceTotals';
import {resolveIdentifier} from '@/lib/resolveIdentifier.js';
import {roundAmounts} from '@/lib/lineFieldChange.js';
import {getCatalogOptions} from '@/lib/selectorCatalog.js';
import {deleteSelectedChildRows, toastBatchDeleteOutcome} from '@/lib/batchDelete.js';
import DocumentStatusPill from './DocumentStatusPill.jsx';
// Re-exported (not defined here) so this file's own React-component-heavy import
// graph (PaymentLifecycleConfirmModal et al.) doesn't get pulled into callers —
// like DataTable.jsx's inline-toggle error handling — that only need this one
// pure helper. Canonical implementation lives in `@/lib/backendErrors.js`.
export {parseBackendErrorMessage} from '@/lib/backendErrors.js';

export function sidePanelWrapperCls(hasSidePanel, linesLayout) {
  // Stack the side panel below the content on narrow viewports (e.g. when the
  // devtools console is open) and only place it beside the content once there
  // is room (lg+). A rigid side-by-side row would otherwise overlap the
  // header/lines when the panel can't shrink.
  if (hasSidePanel) return 'flex flex-col lg:flex-row items-stretch gap-0 min-h-full';
  if (linesLayout === 'inlineEditable') return 'flex flex-col';
  return '';
}

/**
 * Evaluate a simple Etendo display-logic expression (@Field@='Value') against record data.
 * Returns true (visible) if the expression cannot be parsed or if the field is missing from data.
 */
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

export /**
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

/**
 * `fields` (addLineFields entry list, `{ key, column, ... }`) is optional so
 * existing callers/tests that don't have field metadata handy keep the prior
 * blanket numeric-string coercion. When provided, `_ID`-backed columns are
 * left as strings — see buildRowValueCoercer for the full rationale (ETP-4886).
 */
export function normalizePatchFieldValues(patchEdits, fieldValues, fields) {
  const coerce = buildRowValueCoercer(fields);
  for (const [k, v] of Object.entries(patchEdits)) {
    if (k.endsWith('$_identifier')) continue;
    // NEO Headless PATCH expects camelCase API keys, not DB column names.
    // Always use k (the API key) as the field name.
    fieldValues[k] = coerce(v, k);
  }
}

/**
 * ETP-4772 race-condition guard: returns true when a callout response for
 * `key` is stale — i.e. the field's generation (bumped on every genuine
 * write, whether a user edit or a previously-applied callout) has moved on
 * since THIS specific callout request was dispatched. This means a newer
 * edit/dispatch for `key` happened in the meantime and this older response
 * must not clobber it.
 *
 * Applies uniformly regardless of whether `key` is the trigger field or a
 * collateral update — staleness is about the field's own timeline, not
 * about which field caused the callout.
 *
 * `dispatchSnapshot`/`fieldGenerationRef` are optional: callers that don't
 * wire generation tracking (e.g. existing unit tests constructing ctx by
 * hand) get a no-op here, preserving prior behavior.
 */
export function isStaleCalloutResponse(key, dispatchSnapshot, fieldGenerationRef) {
  if (!dispatchSnapshot || !fieldGenerationRef) return false;
  const dispatchGen = dispatchSnapshot[key] ?? 0;
  const currentGen = fieldGenerationRef.current?.[key] ?? 0;
  return dispatchGen !== currentGen;
}

/**
 * Marks `key` as having just received a genuine new value (user edit or
 * applied callout write), advancing its generation counter so any
 * still-in-flight OLDER callout response targeting this field can be
 * recognized as stale when it eventually arrives.
 */
export function bumpFieldGeneration(key, fieldGenerationRef) {
  if (!fieldGenerationRef) return;
  fieldGenerationRef.current[key] = (fieldGenerationRef.current[key] || 0) + 1;
}

export function applyCalloutFieldUpdates(updates, ctx) {
  const { data, triggerField, userTouchedRef, appliedFields, hook, api, catalogs, dispatchSnapshot, fieldGenerationRef } = ctx;
  for (const [key, entry] of Object.entries(updates)) {
    // Discard responses that arrived after a newer edit/dispatch already
    // moved this field on — see isStaleCalloutResponse. Checked BEFORE the
    // trigger-field-always-wins rule below: staleness is a property of the
    // response itself, not of who triggered it.
    if (isStaleCalloutResponse(key, dispatchSnapshot, fieldGenerationRef)) {
      continue;
    }
    // Skip empty callout values if the field already has a non-empty value
    // (e.g., callout clears warehouse but defaults already set it)
    const currentVal = data[key];
    const userHasValue = currentVal !== '' && currentVal != null;
    if ((entry.value === '' || entry.value == null) && userHasValue) {
      continue;
    }
    // Protect user-touched fields from being overwritten by collateral updates
    // coming from a callout triggered by a different field. The trigger field
    // itself always wins (it was just changed by the user) — as long as the
    // response is not stale per the check above.
    if (key !== triggerField && userTouchedRef.current.has(key) && userHasValue) {
      continue;
    }
    appliedFields.set(key, entry.value);
    hook.handleChange(key, entry.value);
    handleEntryIdentifierChange(entry, hook, key, api, catalogs);
    bumpFieldGeneration(key, fieldGenerationRef);
  }
}

export function applyOneComboEntry(key, combo, ctx) {
  const { data, userTouchedRef, appliedFields, hook, dispatchSnapshot, fieldGenerationRef } = ctx;
  if (isStaleCalloutResponse(key, dispatchSnapshot, fieldGenerationRef)) return;
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
  bumpFieldGeneration(key, fieldGenerationRef);
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
    fieldValues[k] = coerce(v, k);
  }
}

/**
 * ETP-4886 — builds a `coerce(value, key)` function for the inline-line PATCH
 * flow (DetailView's `buildInlineRowUpdateHandler`). NEO Headless expects
 * numeric-looking strings coerced to Number for BigDecimal/Integer columns,
 * but every `_ID` column is ALWAYS a string by repo convention (see
 * CLAUDE.md "Etendo AD Database Conventions") even when its value looks
 * numeric — e.g. `attributeSetValue` (backed by `M_AttributeSetInstance_ID`)
 * uses the sentinel `"0"` for "no attribute set". Blindly regex-coercing that
 * to `Number 0` makes NEO reject the PATCH with 400 (it expects a
 * JSONObject/string there, not a number).
 *
 * `fields` is the addLineFields entry list (`{ key, column, ... }`); each
 * field's `column` is the real AD DB column backing it, which is the most
 * reliable signal already available on the field object — `type` there is
 * the UI widget type (e.g. many genuinely numeric fields like `unitPrice` or
 * `discount` render as `type: 'text'`), so it can't be used to distinguish
 * IDs from amounts. A key with no matching field (not in `fields`) falls
 * back to the original numeric-looking heuristic to avoid regressing any
 * coercion path this fix doesn't have field metadata for.
 */
export function buildRowValueCoercer(fields) {
  const fieldsByKey = new Map((fields || []).map(f => [f.key, f]));
  const isIdColumn = (key) => /_ID$/i.test(fieldsByKey.get(key)?.column || '');
  return (v, key) => (
      typeof v === 'string' && !isIdColumn(key) && /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : v
  );
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
  // ETP-4836 — the subtitle + "add" CTA only make sense when the tab actually
  // supports manual row creation (st.addLineFields configured). Tabs whose rows
  // are entirely backend-managed (e.g. invoices' Exchange Rates, auto-created by
  // AbstractInvoiceHeaderHandler) still get the "no records" illustration instead
  // of a blank area, just without an action that would do nothing.
  const canAdd = Boolean(onAddLineClick);
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
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: canAdd ? 4 : 0 }}>{ui('noRecordsYet')}</span>
      {canAdd && (
        <>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui('createNewRecord')}</span>
          <button type="button" onClick={onAddLineClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', cursor: 'pointer' }}>
            + {addLineLabel}
          </button>
        </>
      )}
    </div>
  );
}

export function getSaveButtonLabel(savingLine, ui) {
  return savingLine ? ui('loading') : ui('save');
}

export function getChildSaveButtonLabel(savingChild, ui) {
  return savingChild ? ui('loading') : ui('save');
}

export function getAddLineWrapperClassName(linesLayout) {
  return linesLayout === 'inlineEditable' ? 'sticky bottom-0 bg-card z-10' : 'relative';
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

export function getDocumentIds(recordId) {
  return recordId ? [recordId] : [];
}

// ETP-5052: display-only merge exposing whether the master record currently has
// child lines to HEADER field `readOnlyLogicJs` expressions (e.g. `"!!record.hasLines"`
// on Physical Inventory's `warehouse`), so a header field can lock once count/detail
// lines exist and unlock again once the last one is removed. `children` is guarded
// (not every window's `hook.children` is an array — header-only windows have none).
// NEVER feed the returned object into a save/PUT payload: `handleSave` (useEntity.js)
// builds the request from `editing` state directly, never from this merge, so the
// synthetic `hasLines` key never reaches the backend.
export function buildHeaderFormData(data, children) {
  return { ...data, hasLines: Array.isArray(children) && children.length > 0 };
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

export function getDeleteChildButtonLabel(deletingChildren, ui) {
  return deletingChildren ? ui('loading') : ui('delete');
}

/**
 * Bulk-action toolbar for classic (non-inlineEditable) lines tables: delete +
 * detail-process buttons for the currently selected rows.
 *
 * ETP-4972 — was the standalone `LinesBulkActionBar.jsx`, an inline
 * `sticky top-0` bar (removed). Now rendered inside a viewport-fixed
 * `SelectionToolbar`, reusing the primary tab's `selectionBarVisible`/
 * `selectionBarClosing` lifecycle: this bar and the inlineEditable
 * LinesSelectionBar/SelectionToolbar path are mutually exclusive by
 * `linesLayout` (see isBulkDeleteBarVisible vs shouldShowInlineDeleteSelectionBar),
 * so they never compete for the same state.
 *
 * The process-button styling uses the pill's own theme-invariant
 * `--floating-toolbar-fg` token instead of `border-primary`/`text-primary`:
 * `--primary` collapses to nearly the same dark navy as the pill background
 * in light theme, which made those buttons unreadable.
 */
export function renderDetailBulkActionBar({
  visible, closing, linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows,
  detailProcesses, ui, executingDetailProcess, setDetailParamDialogProcess, executeDetailProcessImpl,
  detailProcessDeps, tMenu, deletingChildren, setDeletingChildren, confirmDelete, apiBaseUrl, token,
  hook, selectedLine, setSelectedLine, setSelectedChildRows,
}) {
  return (
    <SelectionToolbar
      visible={visible}
      closing={closing}
      onClose={() => setSelectedChildRows([])}
      closeTitle={ui('close')}
      data-testid="SelectionToolbar__7c75ad">
      <span className="text-sm font-medium">{ui('selected', {count: selectedChildRows.length})}</span>
      <div className="flex items-center gap-2">
        {detailProcesses.map(p => (
          <button
            key={p.name}
            disabled={executingDetailProcess}
            onClick={() => {
              if (p.params?.some(param => !param.hidden)) {
                setDetailParamDialogProcess({...p, _rows: [...selectedChildRows]});
              } else {
                executeDetailProcessImpl(p, {}, undefined, detailProcessDeps);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--floating-toolbar-fg)/0.3)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)] disabled:opacity-50"
            data-testid="Button__detail-process"
          >
            {executingDetailProcess ? ui('loading') : (tMenu(p.label) || p.label)}
          </button>
        ))}
        {/* ETP-4972 — icon-only, no visible label: applied Figma instance has
            this button's Button Text property set to false. */}
        {isBulkDeleteBarVisible(linesLayout, api, detailEntity, isDocumentReadOnly, selectedChildRows) && (
          <button
            disabled={deletingChildren}
            title={getDeleteChildButtonLabel(deletingChildren, ui)}
            aria-label={getDeleteChildButtonLabel(deletingChildren, ui)}
            onClick={async () => {
              if (!(await confirmDelete())) return;
              setDeletingChildren(true);
              try {
                const {succeeded, failed} = await deleteSelectedChildRows({
                  selectedChildRows, api, detailEntity, apiBaseUrl, token,
                });
                for (const row of succeeded) {
                  hook.handleDeleteChild(row.id);
                  if (selectedLine?.id === row.id) setSelectedLine(null);
                }
                setSelectedChildRows([]);
                toastBatchDeleteOutcome(ui, {succeeded, failed, total: selectedChildRows.length});
              } catch (err) {
                toast.error(err.message || ui('networkError'));
              } finally {
                setDeletingChildren(false);
              }
            }}
            className="inline-flex items-center justify-center rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            data-testid="detail-bulk-delete-button"
          >
            <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__7c75ad" />
          </button>
        )}
      </div>
    </SelectionToolbar>
  );
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

const SECONDARY_DEFAULT_WEIGHT = 99;
const CUSTOM_DEFAULT_WEIGHT = 999;
const LINES_DEFAULT_WEIGHT = -1;

/**
 * Computes the lines tab's (weight, insertionIndex) sort key (ETP-4415).
 * `detailTabOrder` (new, preferred) is used directly as the weight when set,
 * with no special insertionIndex handling needed. Otherwise `detailTabIndex`
 * (legacy) is converted to an equivalent key that reproduces its old
 * splice-position semantics EXACTLY, including when neighboring secondaryTabs
 * share the same (default) weight — which they usually do, since untouched
 * secondaryTabs all default to SECONDARY_DEFAULT_WEIGHT. Matching a neighbor's
 * weight and using a fractional insertionIndex strictly between the two
 * neighbors' positions (idx - 0.5) places lines at the exact splice point
 * regardless of whether the neighbors' weights tie or differ. Any invalid
 * value (unset, negative, out of range) falls back to LINES_DEFAULT_WEIGHT,
 * matching the old `insertLinesTab`'s unshift fallback.
 */
function computeLinesEntryKey(detailTabOrder, detailTabIndex, secondaryEntries) {
  if (typeof detailTabOrder === 'number') return { weight: detailTabOrder, insertionIndex: -0.5 };
  const isValidSpliceIndex = typeof detailTabIndex === 'number'
    && detailTabIndex >= 0
    && detailTabIndex <= secondaryEntries.length;
  if (!isValidSpliceIndex) return { weight: LINES_DEFAULT_WEIGHT, insertionIndex: -0.5 };
  const after = secondaryEntries[detailTabIndex];
  const before = secondaryEntries[detailTabIndex - 1];
  const weight = after?.weight ?? before?.weight ?? LINES_DEFAULT_WEIGHT;
  return { weight, insertionIndex: detailTabIndex - 0.5 };
}

/**
 * Builds the initial tab list (secondary tabs + lines/customLines + inline custom
 * tabs) as a single weighted sort (ETP-4415) instead of the old fixed group
 * concatenation. Every entry gets a numeric weight (secondaryTabs/customTabs
 * default to their pre-ETP-4415 group position; a window opts into cross-group
 * reordering via `tabOrder` on any entry, or `detailTabOrder`/`detailTabIndex`
 * for the lines tab). Ties keep insertion order (stable sort). Visibility is
 * filtered BEFORE sorting so a hidden custom tab never affects tiebreaks.
 * `Others` is appended later via pushOthers.
 */
export function buildInitialTabs(p) {
  const secondaryEntries = p.secondaryTabs.map((st, i) => {
    const secondaryChildCount = !st.isFormTab ? (p.secondaryHooks[i]?.children?.length ?? null) : null;
    const childCount = st.Panel ? (p.panelCounts[st.key] ?? null) : secondaryChildCount;
    const label = (st.labelKey && p.ui(st.labelKey)) || st.label;
    return {
      tab: { key: st.key, label, count: childCount },
      weight: st.tabOrder ?? SECONDARY_DEFAULT_WEIGHT,
      insertionIndex: i,
    };
  });

  const entries = [...secondaryEntries];

  if (p.DetailTable) {
    const linesTab = { key: 'lines', label: p.detailLabel || p.detailEntity || 'Lines', count: p.hook.children?.length || 0 };
    entries.push({ tab: linesTab, ...computeLinesEntryKey(p.detailTabOrder, p.detailTabIndex, secondaryEntries) });
  } else if (p.CustomLines) {
    entries.push({
      tab: { key: 'customLines', label: p.customLinesLabel, count: p.customLinesCount ?? null },
      weight: LINES_DEFAULT_WEIGHT,
      insertionIndex: -0.5,
    });
  }

  // Append 'tab' placement custom items — a tab-placement custom component may opt
  // out of being shown entirely by calling `onVisibilityChange(false)` (see
  // customTabVisibility state in DetailView); until it does, it defaults to visible.
  // customTabsAfterBottom suppresses this group from the sorted list entirely — those
  // tabs render in a separate strip below bottomSection instead (see F21 in
  // schema_forge_core's validate-pipeline.js, which flags a tabOrder set in that mode).
  // Custom entries get an insertionIndex well past any secondaryTabs/lines index so a
  // weight tie against them (e.g. an explicit custom tabOrder matching a secondary's
  // default) resolves after secondaryTabs/lines, matching customs' default position.
  if (!p.customTabsAfterBottom) {
    p.tabCustomTabs.forEach((ct, i) => {
      if (p.customTabVisibility[ct.key] === false) return;
      const resolvedLabel = ct.labelKey ? p.ui(ct.labelKey) : ct.label;
      entries.push({
        tab: { key: customTabKey(ct), label: resolvedLabel, count: p.customTabCounts[ct.key] ?? null },
        weight: ct.tabOrder ?? CUSTOM_DEFAULT_WEIGHT,
        insertionIndex: 10000 + i,
      });
    });
  }

  entries.sort((a, b) => a.weight - b.weight || a.insertionIndex - b.insertionIndex);
  return entries.map(e => e.tab);
}

export function renderExtraActionButtons(extraActions, data, hook, saveBtnCls) {
  return (typeof extraActions === 'function' ? extraActions({
    data,
    children: hook.children,
    // ETP-4999 — matches `topbarExtra`'s own `onRefresh` exactly (DetailView.jsx),
    // so an `extraActions` entry can refresh the record after a side-effecting
    // action (e.g. resend-invitation) the same way a `topbarExtra` component can.
    onRefresh: () => hook.fetchById?.(data?.id),
  }) : extraActions).map((action, i) => (
      action.visible !== false && (
          <Button
            key={action.key || i}
            variant="outline"
            size="default"
            className={`${action.className || ''} ${saveBtnCls}`.trim()}
            onClick={action.onClick}
            disabled={!!action.disabled}
            data-testid="Button__fa3275">
            {action.label}
          </Button>
      )
  ));
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

export function getTabsBarStyle(tabsBarRight, tabsBarRightDivider) {
  return tabsBarRight && tabsBarRightDivider ? {paddingRight: `calc(${tabsBarRightDivider} + 24px)`} : undefined;
}

export function getTabsBarClassName(tabsBarPaddingX, tabsBarRightDivider) {
  return `flex items-center gap-1 ${tabsBarPaddingX} py-2 shrink-0${tabsBarRightDivider ? ' relative' : ''}`;
}

/**
 * Tailwind classes for a header process button, keyed by `p.style` (+ `salesTheme`/`isPrimary`).
 *
 * `ghost-danger` (the Reactivar/Undo button): full-opacity `--destructive` border and an explicit
 * `hover:text` pin were restored here after ETP-4554 ("Migrate shared theme styles") diluted the
 * border to `--destructive/0.3` — the pre-token version was a solid light pink-red, not an
 * alpha-reduced one — and never pinned a hover text color, leaving the base `Button` outline variant's own
 * `hover:text-accent-foreground` free to win on hover and turn the label gray instead of staying
 * red like Figma shows (found while verifying ETP-4797).
 */
export function getButtonClass(salesTheme, p, isPrimary) {
  if (p.style === 'ghost-danger') {
    return 'bg-card border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)] hover:text-[hsl(var(--destructive))]';
  }
  if (salesTheme) {
    if (p.style === 'destructive') {
      return 'border-status-warning-border bg-status-warning text-status-warning-foreground hover:bg-status-warning';
    } else {
      if (isPrimary) {
        return 'bg-status-warning text-foreground hover:bg-status-warning border-transparent font-medium';
      } else {
        return 'border-status-success-border bg-status-success text-status-success-foreground hover:bg-status-success';
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

export // ETP-4479 — windows where a plain header DELETE fails once the record has
// ever been referenced (FK constraints); the NEO action reactivates and
// removes it server-side instead. Hardcoded here (not decisions.json-driven)
// because the decisions.json -> generator wiring for this is not published
// in schema_forge_core; do not add a decisions.json field for this without
// first confirming the generator support ships.
const WINDOW_DELETE_ACTIONS = {
  'payment-in': 'eTPRRemovePayment',
  'payment-out': 'eTPRRemovePayment',
};

export // ETP-4500 — same rationale/hardcoding constraint as WINDOW_DELETE_ACTIONS above: these
// windows show the rich Reactivar/Eliminar cartel (conditional Conciliación/Asiento items)
// instead of the generic delete confirmation Dialog. `dir` feeds the cobro/pago wording.
const WINDOW_DELETE_CONFIRM_MODALS = {
  'payment-in': { Component: PaymentLifecycleConfirmModal, dir: 'in' },
  'payment-out': { Component: PaymentLifecycleConfirmModal, dir: 'out' },
};

export // ETP-4797 — same rationale/hardcoding constraint as WINDOW_DELETE_ACTIONS above: no
// decisions.json field exists yet for "suppress the primary status pill for a given enum value",
// so this stays a hardcoded windowName lookup instead. RPPC ("Payment Cleared") already gets its
// own badge — PaymentConciliadoBadge, wired as this window's topbarExtra — which shows "Conciliado"
// with a link to the matched bank transaction. Showing the generic status pill (e.g. "Cobro
// depositado") next to it duplicated the same fact under two different labels; this set hides the
// generic pill for exactly that one status so "Conciliado" is the only status indicator on screen.
const WINDOW_HIDE_STATUS_PILL_FOR = {
  'payment-in': new Set(['RPPC']),
  'payment-out': new Set(['RPPC']),
};

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

export function shouldShowDetailFormSidebar(linesLayout, DetailForm, selectedLine, isClosingLine) {
  return linesLayout !== 'inlineEditable' && DetailForm && (selectedLine || isClosingLine);
}

export function isInitialChildrenLoading(hook) {
  return hook.childrenLoading && hook.children.length === 0;
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

export function resolveProcessLabel(p, data) {
  if (p.labelToggle && data?.[p.labelToggle.field] === p.labelToggle.equals) {
    return p.labelToggle.label;
  }
  return p.label;
}

/**
 * Renders the window's `processConfirmModal` for the process awaiting confirmation.
 *
 * The slot is just "render this component" — nothing forces a modal to call `onConfirm`. A window
 * can therefore replace a process button's behaviour outright by rendering something that does its
 * own work and closes, which is how the payment windows swap the yes/no Confirmar dialog for the
 * editable payment modal. `apiBaseUrl` and `onRefresh` exist for exactly that case: a modal that
 * acts on its own needs to reach the API and to refresh the record afterwards, since it never goes
 * through `handleProcess`. Modals that only confirm ignore both.
 */
export function renderProcessConfirmModal(
  process, Modal, onConfirm, onClose, record, apiBaseUrl, onRefresh) {
  if (!process || !Modal) return null;
  return React.createElement(Modal, { process, onConfirm, onClose, record, apiBaseUrl, onRefresh });
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

export function applyProductCalloutPriceAdjustments(field, result, lineConfig) {
  if (field !== 'product') return;
  if (result.standardPrice != null && (result.listPrice == null || Number(result.listPrice) === 0)) {
    result.listPrice = result.standardPrice;
  }
  if (lineConfig.discountField) {
    result[lineConfig.discountField] = 0;
  }
}

export function applyProductCurrencyConversion(field, result, rowValues, lineConfig, activeCurrencyConversion, currencyIdentifier, computeLineGrossAmount) {
  if (field !== 'product' || !activeCurrencyConversion) return;
  const {rate, toCurrency} = activeCurrencyConversion;
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
    // The earlier 'product' callout pass already latched result.lineNetAmount onto the
    // UNCONVERTED price (see calculateLineNetAmount / deriveNetFromProductChange). Clear it
    // here so computeLineGrossAmount's null-guard recomputes it from the converted price
    // instead of silently skipping the sync (its guard only fires when lineNetAmount is
    // null/0). Without this, lineNetAmount stays stale while grossAmount/grossField are
    // correctly forced to the converted value — an inconsistent line that the backend
    // persists using the stale net, producing a wrong (sometimes negative) tax total.
    result.lineNetAmount = null;
    computeLineGrossAmount(lineConfig.priceField, convertedPrice, result, {
      ...rowValues,
      ...result,
      [lineConfig.priceField]: convertedPrice,
    });
  }
}

export function resolveTaxIdentifier(result, rowValues, hook) {
  if (!result['tax$_identifier']) {
    const effectiveTaxId = result.tax ?? rowValues.tax;
    if (effectiveTaxId) {
      const ref = (hook.children || []).find(l => l.tax === effectiveTaxId && l['tax$_identifier']);
      if (ref) result['tax$_identifier'] = ref['tax$_identifier'];
    }
  }
}

export function calculateLineNetAmount(result, field, lineConfig, value, rowValues) {
  if (result.lineNetAmount == null && (field === lineConfig.qtyField || field === lineConfig.priceField || field === 'product')) {
    const qty = field === lineConfig.qtyField ? (parseFloat(value) || 0)
        : (parseFloat(String(rowValues[lineConfig.qtyField] ?? '')) || 0);
    const price = field === lineConfig.priceField ? (parseFloat(value) || 0)
        : (parseFloat(String(result[lineConfig.priceField] ?? rowValues[lineConfig.priceField] ?? '')) || 0);
    if (qty > 0 && price > 0) result.lineNetAmount = String(qty * price);
  }
}

export function canUseCachedTaxRate(taxFactor, taxId, taxRateCacheRef) {
  return taxFactor === null && taxId && taxRateCacheRef.current[taxId] != null;
}

export function isPositiveNumeric(calloutRate) {
  return !isNaN(calloutRate) && calloutRate > 0;
}

export function calculateNetUnitPrice(result, taxRateCacheRef, hook) {
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
 * Originally defined in DetailView.jsx; moved here (R1: no test was edited — DetailView.jsx
 * re-exports it) because that file is growth-guarded (see .claude/hooks/check-detailview-growth.mjs).
 *
 * @returns {Promise<boolean>} true → proceed with the process; false → abort silently.
 */
export async function maybeSaveBeforeProcess({ saveBeforeProcesses, isDirty, handleSave }) {
  if (!saveBeforeProcesses || !isDirty) return true;
  const saved = await handleSave?.({ silent: true });
  return !!saved?.id;
}

/**
 * ETP-4940: unconditional (no per-window opt-in — unlike maybeSaveBeforeProcess above)
 * "save before confirm" gate for draftMode windows whose `draftMode.onConfirm` is a
 * custom callback (e.g. dispatches a DOM event that opens the window's own confirm
 * modal — sales-order, purchase-order, sales-quotation, goods-receipt, goods-shipment
 * all do this). That callback fully bypasses `hook.handleSaveAndProcess` (which already
 * calls `handleSave` first for the non-custom draftMode path), so without this gate a
 * header edit made right before clicking Confirm — without clicking Save first — was
 * silently discarded: the document confirmed with the previously-persisted value.
 * No-op when there is nothing pending (`isDirty` false, the same signal that drives the
 * Save Draft button). On save failure, `handleSave` has already surfaced the error
 * (toast / field errors) — this returns false so the caller aborts instead of opening
 * the confirm modal on stale data.
 *
 * @returns {Promise<boolean>} true → proceed to draftMode.onConfirm(); false → abort.
 */
export async function maybeSaveBeforeConfirm({ isDirty, handleSave }) {
  if (!isDirty) return true;
  const saved = await handleSave?.({ silent: true });
  return !!saved?.id;
}
/**
 * ETP-4830 / ETP-5002 — keeps the `'new'` route's `editing` state honest.
 *
 * ETP-4830's need is real: `useEntity()` lives INSIDE `DetailView`, so navigating from an
 * existing record straight to `'new'` (no stop at the list route) does not remount it, and
 * a fully-populated OTHER record stays in `editing` on what the route considers a blank
 * page. That record's real `id` then leaks into `data`, which is how the user window
 * rendered its interactive role editor for a user that was never saved.
 *
 * But the predicate it shipped — `isNew && (!editing || editing.id)` — conflated "editing
 * is stale" with "editing has an id", and that cost duplicated documents (ETP-5002).
 * `isNew` stays true across the gap between `handleSave` writing the persisted record into
 * `editing` and the `navigate()` to `/{window}/{id}` committing. On that render the guard
 * fired MID-SAVE, wiping `editing` and opening a fresh creation session; the caller went on
 * working and persisted a SECOND record. `sales-order-happy-path` created two orders,
 * confirmed the first (`documentAction` 200) and left the UI showing the second, whose
 * status pill legitimately still read "Borrador" — the backend was never wrong. The
 * `assets` flow lost a required numeric the same way and got a 400 from `processAsset`.
 *
 * So the reset keys off ARRIVING at the `'new'` route, not off any render while sitting on
 * it: only a `recordId` that actually changed can be carrying a record left over from
 * before. Once we are already on `'new'`, an id appearing in `editing` is our own save
 * landing and must be left alone. Tracked with a ref rather than `location.state.justSaved`
 * because the navigation has not happened yet at the moment this has to decide.
 *
 * Lives here rather than inline in DetailView.jsx so the reasoning is testable on its own
 * and does not add to that file's guarded line budget
 * (`.claude/hooks/check-detailview-growth.mjs`).
 */
export function shouldResetEditingForNewRoute({ isNew, editing, arrivedFromAnotherRecord }) {
  if (!isNew) return false;
  // No editing state at all — a genuinely fresh mount on the creation route.
  if (!editing) return true;
  // A persisted record we did NOT just create here: stale leftover, clear it.
  return Boolean(arrivedFromAnotherRecord && editing.id);
}

/** Reactive wrapper: calls `handleNew()` exactly when {@link shouldResetEditingForNewRoute} says to. */
export function useNewRouteEditingReset({ isNew, recordId, editing, handleNew }) {
  const prevRecordIdRef = useRef(recordId);
  useEffect(() => {
    const arrivedFromAnotherRecord = prevRecordIdRef.current !== recordId;
    prevRecordIdRef.current = recordId;
    if (shouldResetEditingForNewRoute({ isNew, editing, arrivedFromAnotherRecord })) handleNew();
  }, [isNew, recordId, editing, handleNew]);
}
