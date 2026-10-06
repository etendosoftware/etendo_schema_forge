// ETP-5597 — Modelo 349 "Identificador de la declaración anterior" (AEAT FormerStatement)
// validation, kept in its own module (instead of fiscalModelsUtils.js) so the many page tests
// that vi.mock fiscalModelsUtils.js with an explicit factory keep exercising the real rule.
//
// Single source of truth for BOTH places that gate a substitutive 349 on the identifier:
// FileGenModal ("Generar fichero 349", FmOverlays.jsx) and FmModel349Page's
// "Registrar/Presentar" button + handler. Changing the rule here changes both.

/** AEAT length of the former-declaration identifier. */
export const FORMER_STATEMENT_LENGTH = 13;

const FORMER_STATEMENT_RE = /^\d{13}$/;

/**
 * True when `value`, once trimmed, is exactly 13 digits. Anything else (empty, null, shorter,
 * longer, letters or punctuation) is invalid.
 */
export function isValidFormerStatement(value) {
  return FORMER_STATEMENT_RE.test(String(value ?? '').trim());
}

/** Strips every non-digit character — the banner input only accepts digits. */
export function sanitizeFormerStatementInput(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, FORMER_STATEMENT_LENGTH);
}
