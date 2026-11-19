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

// Lower-case aliases some previews/hooks receive instead of the DocStatus code.
const ALIASES = Object.freeze({ draft: 'DR', complete: 'CO', completed: 'CO' });

/**
 * Normalizes a raw status to its code.
 * @param {string|{id?: string, value?: string}|null|undefined} status code, `{id}`/`{value}` ref, or alias
 * @returns {string|null} e.g. 'DR', 'CO'; `null` when absent
 */
export function docStatusCode(status) {
  const raw = status && typeof status === 'object' ? (status.id ?? status.value ?? null) : (status ?? null);
  return typeof raw === 'string' && raw in ALIASES ? ALIASES[raw] : raw;
}

/** @param {*} status raw status (see docStatusCode) @returns {boolean} true for a draft (DR) */
export const isDraftStatus = (status) => docStatusCode(status) === DOC_STATUS.DRAFT;
/** @param {*} status raw status (see docStatusCode) @returns {boolean} true for a completed (CO) document */
export const isCompletedStatus = (status) => docStatusCode(status) === DOC_STATUS.COMPLETED;
/** @param {*} status raw status (see docStatusCode) @returns {boolean} true for a voided (VO) document */
export const isVoidedStatus = (status) => docStatusCode(status) === DOC_STATUS.VOIDED;
/** @param {*} status raw status (see docStatusCode) @returns {boolean} true for a not-approved (UE) document */
export const isNotApprovedStatus = (status) => docStatusCode(status) === DOC_STATUS.NOT_APPROVED;
/**
 * The single home of "editable only in draft": use this wherever the question is "can the user
 * edit this document", so a rule change (e.g. UE/IP) lands here. Use isDraftStatus for lifecycle
 * checks (print exclusion, PDF caching).
 * @param {*} status raw status (see docStatusCode) @returns {boolean}
 */
export const isEditableStatus = (status) => isDraftStatus(status);
