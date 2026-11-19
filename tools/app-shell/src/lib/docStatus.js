/**
 * Single source of truth for the document lifecycle (docStatus) checks.
 *
 *   DR draft -> CO completed -> VO voided (UE = not approved / in-progress edge).
 *
 * "Editable only in draft" is a business rule: never re-check it with a raw
 * `=== 'DR'` / `=== 'CO'` literal in a component — use these helpers so a new
 * edge status changes behaviour in one place. Enforced by test/no-raw-doc-status.test.js.
 */

export const DOC_STATUS = Object.freeze({
  DRAFT: 'DR',
  COMPLETED: 'CO',
  VOIDED: 'VO',
  NOT_APPROVED: 'UE',
});

/** Normalizes a raw status (string, `{id}` / `{value}` ref, null) to its code. */
export function docStatusCode(status) {
  if (status && typeof status === 'object') return status.id ?? status.value ?? null;
  return status ?? null;
}

export const isDraftStatus = (status) => docStatusCode(status) === DOC_STATUS.DRAFT;
export const isCompletedStatus = (status) => docStatusCode(status) === DOC_STATUS.COMPLETED;
export const isVoidedStatus = (status) => docStatusCode(status) === DOC_STATUS.VOIDED;
/** The only editable state is draft. */
export const isEditableStatus = isDraftStatus;
