/**
 * ETP-5692 — `draftMode.editableLineFieldsWhenCompleted` (string[]): the line-level
 * counterpart of `draftMode.keepSaveWhenCompletedFields`.
 *
 * On a document whose lines are locked by completion (DetailView's processed lock,
 * `isDocumentReadOnly`), the line fields named here stay editable and savable — each
 * through a one-field PATCH (inlineLineUpdateHandlers.js →
 * `buildCompletedLineFieldUpdateHandler`). Every other line field stays read-only.
 *
 * Each named field is STILL subject to its own `readOnlyLogic`, evaluated against the line
 * merged over the header record (`{ ...header, ...line }`): a line field's AD logic routinely
 * references a HEADER column the line table does not have — `@Posted@='Y'` on an invoice line's
 * project / cost center — which Etendo resolves from the parent tab's context. The line's own
 * keys win; the header only fills the keys the line lacks.
 *
 * Fail-closed throughout, like saveActions.jsx's `buildCompletedFieldsGate`: a key outside
 * the list, a key the window's line fields do not declare, or a `readOnlyLogic` that throws,
 * all mean NOT editable.
 *
 * Plain module (no JSX, no `@/` imports) so plain `node --test` can load it.
 */

/** The declared allowlist, or `[]` when absent / malformed. */
export function resolveEditableLineFieldsWhenCompleted(draftMode) {
  const list = draftMode?.editableLineFieldsWhenCompleted;
  return Array.isArray(list) ? list.filter((key) => typeof key === 'string' && key !== '') : [];
}

function isLockedByOwnLogic(field, record) {
  if (field.readOnly === true) return true;
  if (typeof field.readOnlyLogic !== 'function') return false;
  try {
    return Boolean(field.readOnlyLogic(record));
  } catch {
    return true;
  }
}

/**
 * Builds the `(row, fieldKey) => boolean` "may this line field be edited although the
 * document is locked by completion?" predicate, or `null` when the feature does not apply
 * (the lines are not locked by completion, or the window declares no allowlist).
 *
 * @param {object}   params
 * @param {object}   params.draftMode           the window's draftMode object
 * @param {boolean}  params.lockedByCompletion  true only for the processed lock — never for a
 *                                              window-wide read-only (no-write-access) role
 * @param {object}   params.headerRecord        current header record (logic context fallback)
 * @param {object[]} params.lineFields          the line form's field descriptors (readOnlyLogic)
 */
export function buildCompletedLineFieldGate({ draftMode, lockedByCompletion, headerRecord, lineFields }) {
  const allowed = resolveEditableLineFieldsWhenCompleted(draftMode);
  if (!lockedByCompletion || allowed.length === 0) return null;
  const fieldsByKey = new Map((lineFields || []).filter(Boolean).map((f) => [f.key, f]));
  return (row, fieldKey) => {
    if (!allowed.includes(fieldKey)) return false;
    const field = fieldsByKey.get(fieldKey);
    if (!field) return false;
    return !isLockedByOwnLogic(field, { ...(headerRecord || {}), ...(row || {}) });
  };
}
