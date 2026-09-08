// Max-length validation for the free-text fields the Cuenta Financiera modals write.
//
// WHY THIS EXISTS: these modals hand-roll their inputs instead of going through
// EntityForm, so none of the generic field validation reaches them. Until ETP-5140 a
// description longer than its AD column simply travelled to the backend, where Core's
// StringPropertyValidator rejected it and the user got the failure as a 400 (PSD-23).
// The message is translated (backendErrors.js `matchFieldTooLong`, ETP-4984), but a
// round-trip to learn about a limit the UI already knows is the wrong shape — the field
// reports it before the request leaves.
//
// Same `{ key, params } | null` contract as its two siblings, `getNumericFieldError`
// (lib/numericValidation.js) and `getContactsTextFieldError`
// (components/contract-ui/contactsFieldValidation.js): an i18n key plus interpolation
// params, decoupled from display, rendered by the caller as `ui(err.key, err.params)`.
//
// Unlike contactsFieldValidation this module carries NO window gate. It does not need
// one: it validates nothing on its own, the caller passes the limit explicitly, so
// importing it somewhere else can only do what that call site asks for.

// The AD columns' real database lengths, transcribed from
// artifacts/financial-account/contract.json →
// frontendContract.entities.<entity>.fields[].validation.maxLength.
// Read from the contract, never guessed: the contract is what the backend enforces, so a
// number invented here would either reject valid input or let an invalid value through.
export const FINANCIAL_ACCOUNT_FIELD_LIMITS = {
  transactionDescription: 255,     // entities.transaction.description
  statementLineDescription: 2000,  // entities.bankStatementLines.description
  statementLineReference: 30,      // entities.bankStatementLines.referenceNo
};

/**
 * Validate one free-text value against an AD column length.
 *
 * An empty value is always valid — emptiness is the `required` mechanism's job, exactly
 * as in getNumericFieldError, so this helper never fights it. A null/undefined limit is
 * also valid, so a call site that has no limit for a field degrades to "no validation"
 * rather than throwing.
 *
 * @param {*} value - the current value; cast to string, so a numeric input is measured
 *   by its rendered length (what the backend will actually store).
 * @param {number} [limit] - the column's max length.
 * @returns {{ key: string, params: { maxLength: number } }|null} the i18n error
 *   descriptor, or null when valid.
 */
export function getMaxLengthError(value, limit) {
  if (limit == null) return null;
  const s = String(value ?? '');
  if (s === '') return null;
  return s.length > limit ? { key: 'fieldMaxLengthError', params: { maxLength: limit } } : null;
}
