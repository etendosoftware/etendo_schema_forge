// Inline-lines (`linesLayout: 'inlineEditable'`) write handlers handed to InlineLinesPanel's
// `onUpdateRow` by DetailView.
//
// ETP-5692 — `buildInlineRowUpdateHandler` moved here VERBATIM from DetailView.jsx (which keeps
// re-exporting it, so every suite importing it from 'DetailView.jsx' is untouched) to make room
// for its completed-document counterpart, `buildCompletedLineFieldUpdateHandler`, below.
import { toast } from 'sonner';
// Plain module: the core subpath, never the `@/auth/api.js` barrel (docs/request-policy.md).
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import {
  applyLocalChildRowUpdate, applySelectedItemMappings, buildRowValueCoercer, collectRowFieldValues,
  mergeSelectorAuxFields, mergeSelectorContextFields, preserveGridReadOnlyValues, pruneInheritedParentKeys,
} from './detailViewHelpers.jsx';

export function buildInlineRowUpdateHandler({ linesLayout, isDocumentReadOnly, api, detailEntity, apiBaseUrl, hook, handleLineFieldChange, prepareLineForPost, token, extractErrorMessage, ui, fields, lineFields, raiseRowSaveConflict }) {
  return linesLayout === 'inlineEditable' && !isDocumentReadOnly ? async (row, fieldKey, value, opts) => {
    // Inline autosave with callout chain. NEO Headless expects API keys (camelCase), an unwrapped body,
    // and numeric strings coerced for BigDecimal — mirrors the side-panel save at line ~1750. `coerce`
    // (ETP-4886) skips `_ID` columns via buildRowValueCoercer: they're always strings even when
    // numeric-looking (e.g. attributeSetValue's "0" sentinel), so PATCHing them as a Number 400s.
    // Trigger fields (e.g. product) populate `derivedUpdates` with callout-driven fields (price, tax,
    // description) PATCHed in one shot via `handleLineFieldChange`.
    const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id) || `${apiBaseUrl}/${detailEntity}/${row.id}`;
    const coerce = buildRowValueCoercer(fields);
    const payloadValue = coerce(value, fieldKey);

    // Build the row snapshot the callout sees: existing row (minus the parent's null/empty
    // inherited keys — see pruneInheritedParentKeys) + the change.
    const headerSnapshot = hook.editing || hook.selected || {};
    const cleanRow = pruneInheritedParentKeys(row, headerSnapshot);
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
      fieldValues[k] = coerce(v, k);
    }
    // 3. The user-changed field always wins (last-write).
    fieldValues[fieldKey] = payloadValue;
    // 4. Declarative onSelectMappings for the field just picked (ETP-5037) — see
    // applySelectedItemMappings in detailViewHelpers.jsx.
    applySelectedItemMappings(fieldKey, selectedItem, fields, fieldValues, derivedUpdates, coerce);

    // Derive unitPrice (PriceActual) = listPrice × (1 - discount/100).
    // Without this the backend keeps the pre-discount PriceActual and
    // confirmed totals don't match the discounted lineNetAmount we just
    // computed — matches the side-panel save flow.
    prepareLineForPost(fieldValues);

    const res = await apiFetch(childUrl, {
      method: 'PATCH',
      body: JSON.stringify(fieldValues),
      token, baseUrl: '',
    });
    if (res.ok) {
      applyLocalChildRowUpdate(derivedUpdates, fieldKey, payloadValue, fieldValues, opts, hook, row);
      // Server response wins over the optimistic cache when present —
      // picks up trigger-computed fields (e.g. etgoQtydiff) that only
      // exist after the DB flush, mirroring the secondary-tab handler
      // above (line ~425). NEO wraps the saved record in
      // {response:{data:[...]}}.
      const updated = await res.json().catch(() => null);
      const serverRow = preserveGridReadOnlyValues(row, updated?.response?.data?.[0] ?? null, lineFields ?? fields); // ETP-5319: don't let this null a readOnly grid column — see the helper's doc.
      // ETP-4751 — pass the raw response ROOT (`updated`) as the exemption-cause signal source:
      // InvoiceLineHandler stamps exemptionCauseWarning/exemptionCauseAutoFilled at the response
      // root, not on the nested line row (`serverRow`), so a line EDIT that turns a line exempt
      // still surfaces the SIF warning toast.
      if (serverRow) hook.handleUpdateChild?.(row.id, serverRow, undefined, updated);
    } else {
      // ETP-5073 / DOC-04: a concurrency conflict gets the shared dialog, with the same
      // "discard and refresh" button the sidebar and the header offer — the inline grid used to
      // report it as a plain toast, which said what happened but left the user to find the reload.
      // Asked first so it reads the CLONED body before extractErrorMessage consumes the original.
      const raised = await raiseRowSaveConflict?.(res, row.id);
      const msg = await extractErrorMessage(res);
      if (!raised) toast.error(msg || ui('networkError'));
      // The throw is what stops InlineLinesPanel from claiming the row was saved, but its catch
      // also toasts — so every inline failure used to surface TWICE (identical text, two stacked
      // toasts). `userNotified` tells it the user has already been told, here by the toast above
      // or by the conflict dialog.
      throw Object.assign(new Error(msg || 'PATCH failed'), { userNotified: true });
    }
  } : undefined;
}

/**
 * ETP-5692 — `onUpdateRow` for a document whose lines are locked by completion
 * (`isDocumentReadOnly` from the processed lock, where `buildInlineRowUpdateHandler` returns
 * `undefined`), when `draftMode.editableLineFieldsWhenCompleted` keeps some line fields editable.
 *
 * Fail-closed, in the spirit of saveActions.jsx's `buildCompletedFieldsGate`:
 *  - `canEditField(row, fieldKey)` (see lib/completedLineEdits.js) is asked again here, so a
 *    caller that bypassed InlineLinesPanel's own gate still cannot write a field outside the list
 *    (or one its readOnlyLogic locks — e.g. a dimension while the document is posted);
 *  - the PATCH carries ONLY that field. Unlike the draft-time handler it never resends the row,
 *    never runs the callout chain and never recomputes prices (`prepareLineForPost`): on a
 *    processed line the backend triggers reject any change to the locked columns, so a
 *    full-row body could fail on a rounding difference the user never made.
 *
 * Returns `undefined` when `canEditField` is absent, so DetailView can chain it after
 * `buildInlineRowUpdateHandler` with `??`.
 */
export function buildCompletedLineFieldUpdateHandler({ canEditField, api, detailEntity, apiBaseUrl, hook, token, extractErrorMessage, ui, fields, lineFields, raiseRowSaveConflict }) {
  if (typeof canEditField !== 'function') return undefined;
  return async (row, fieldKey, value, opts) => {
    if (!canEditField(row, fieldKey)) {
      const msg = ui('actionFailed');
      toast.error(msg);
      throw Object.assign(new Error(msg), { userNotified: true });
    }
    const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id) || `${apiBaseUrl}/${detailEntity}/${row.id}`;
    const payloadValue = buildRowValueCoercer(fields)(value, fieldKey);
    const res = await apiFetch(childUrl, {
      method: 'PATCH',
      body: JSON.stringify({ [fieldKey]: payloadValue }),
      token, baseUrl: '',
    });
    if (res.ok) {
      applyLocalChildRowUpdate({}, fieldKey, payloadValue, {}, opts, hook, row);
      const updated = await res.json().catch(() => null);
      const serverRow = preserveGridReadOnlyValues(row, updated?.response?.data?.[0] ?? null, lineFields ?? fields);
      if (serverRow) hook.handleUpdateChild?.(row.id, serverRow, undefined, updated);
      return;
    }
    const raised = await raiseRowSaveConflict?.(res, row.id);
    const msg = await extractErrorMessage(res);
    if (!raised) toast.error(msg || ui('networkError'));
    throw Object.assign(new Error(msg || 'PATCH failed'), { userNotified: true });
  };
}
