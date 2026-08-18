/**
 * Shared visibility predicates for record-level actions (toolbar + row quick actions).
 *
 * These utilities centralize the gate rules that previously lived inline in
 * DetailView.jsx and RowQuickActions.jsx, so both surfaces stay in lockstep.
 */

/**
 * Document statuses that always allow Delete. Records in any other status are
 * considered "completed/posted/closed/voided" and Delete is hidden when the
 * window opts into the `hideDeleteWhenComplete` policy.
 *
 * - 'DR'   = Draft
 * - 'RPAP' = Pending payment approval (transient pre-completion state used by
 *            some Etendo flows; treated as draft-like for delete purposes).
 */
export const DELETABLE_DOC_STATUSES = ['DR', 'RPAP', 'N'];

/**
 * Returns true when the Delete action should be visible for a record.
 *
 * Mirrors the gate at DetailView.jsx ~line 1076 and the row quick actions
 * overlay. Pure function, no React, safe to call from anywhere.
 *
 * @param {object}  opts
 * @param {object}  opts.record                 The row / form record.
 * @param {?string} opts.statusField            Field name carrying the document status (e.g. 'documentStatus').
 * @param {boolean} opts.hideDeleteWhenComplete When false, Delete is always visible.
 * @param {boolean} opts.hideDeleteButton       When true, Delete is ALWAYS hidden, regardless of
 *                                              record state or status. Unconditional per-window
 *                                              opt-out (decisions.json → window.hideDeleteButton).
 *                                              Defaults to false → zero behavior change when unset.
 * @returns {boolean}
 */
export function isDeleteVisibleForRecord({ record, statusField, hideDeleteWhenComplete, hideDeleteButton = false }) {
  if (hideDeleteButton) return false;
  if (!hideDeleteWhenComplete) return true;
  if (!statusField) return true;
  const status = record?.[statusField];
  if (status == null || status === '') return true;
  // Some windows (e.g. physical-inventory, goods-movements) use a boolean
  // `processed` field as their statusField instead of a string document-status
  // code. `false` (not yet processed) is draft-like and deletable; `true`
  // (processed) is not. Handled ahead of the string-code check below so the
  // existing DR/RPAP/N behavior for code-based windows stays untouched.
  if (typeof status === 'boolean') return status === false;
  return DELETABLE_DOC_STATUSES.includes(status);
}

/**
 * Evaluate a row-level `visibleWhen` expression against record data.
 *
 * Reuses the Etendo display-logic syntax (`@Field@='Value'`, optional AND-chained clauses,
 * `!=` supported) that DetailView already uses via `evalDisplayLogicRaw`. Boolean API values
 * are normalized to Etendo string equivalents (`true` → 'Y', `false` → 'N').
 *
 * - Missing expression  → true   (no gate, visible by default)
 * - Unparseable clauses → true   (fail-open; same policy as DetailView — nothing to gate on)
 * - Field absent in row → false  (ETP-4717 — fail-CLOSED: a gate that references a field the
 *   row doesn't carry can't be evaluated, so the safe default is to hide the action rather than
 *   show it unconditionally. Applies to both `=` and `!=` clauses equally — an unevaluable
 *   clause never counts as satisfied.)
 *
 * Kept here (not duplicated from DetailView) so generic surfaces can share a single
 * evaluator without pulling in the heavy DetailView module.
 *
 * @param {?string} expr  Display-logic expression (Etendo `@Field@='Value'` syntax).
 * @param {object}  row   Record data.
 * @returns {boolean}
 */
export function evalRowVisibleWhen(expr, row) {
  if (!expr) return true;
  const clauses = [...String(expr).matchAll(/@(\w+)@\s*(!?=)\s*'([^']*)'/g)];
  if (clauses.length === 0) return true;
  return clauses.every(([, fieldRef, op, expected]) => {
    const key = fieldRef[0].toLowerCase() + fieldRef.slice(1);
    if (!(key in (row || {}))) return false;
    const rawVal = row[key];
    let actual;
    if (typeof rawVal === 'boolean') actual = rawVal ? 'Y' : 'N';
    else actual = String(rawVal ?? '');
    return op === '=' ? actual === expected : actual !== expected;
  });
}
