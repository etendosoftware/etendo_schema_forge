/**
 * ETP-6148 — SEPA creditor identifier (AT-02), validated client-side so a typed value gets an
 * inline error before the round-trip. A faithful mirror of com.etendoerp.go `SepaCreditorId`
 * (normalize / validate / computeCheckDigits): keep the two in lockstep. THE SERVER IS THE SOURCE
 * OF TRUTH: it refuses the same values with the same `messageKeys`, and this module only spares the
 * round-trip.
 *
 * Layout: country (2 letters) + check digits (2) + business code (3, letters or digits) + national
 * identifier (1–28 letters or digits), at most 35 characters. The check digits are ISO 7064 MOD
 * 97-10 over `nationalId + country + "00"` (letters A=10 … Z=35), `98 - (n mod 97)` zero-padded; the
 * business code is NOT part of the computation. The comparison is against the recomputed digits, not
 * a `mod 97 == 1` test, exactly as the backend does.
 */

const CI_FORMAT = /^[A-Z]{2}\d{2}[A-Z\d]{3}[A-Z\d]{1,28}$/;

/** Reason codes, named after the backend's message keys. */
export const SEPA_CREDITOR_ID_ERRORS = Object.freeze({
  blank: 'ETGO_SepaCreditorIdRequired',
  invalidFormat: 'ETGO_SepaCreditorIdInvalidFormat',
  invalidCheckDigits: 'ETGO_SepaCreditorIdInvalidCheckDigits',
});

/** The inline-error i18n key of each reason (blank has none: an empty field is «not typed yet»). */
const ERROR_KEYS = Object.freeze({
  [SEPA_CREDITOR_ID_ERRORS.invalidFormat]: 'sepaCreditorIdInvalidFormat',
  [SEPA_CREDITOR_ID_ERRORS.invalidCheckDigits]: 'sepaCreditorIdInvalidCheckDigits',
});

/** Strips everything but letters and digits and upper-cases (SepaCreditorId.normalize). */
export function normalizeCreditorId(raw) {
  return String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** `98 - (nationalId + country + "00" mod 97)`, two digits (SepaCreditorId.computeCheckDigits). */
export function computeCreditorCheckDigits(country, nationalId) {
  const rearranged = `${nationalId}${country}00`;
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  const check = 98 - remainder;
  return check < 10 ? `0${check}` : String(check);
}

/**
 * @param {string} raw - what the user typed
 * @returns {{ normalized: string, error: string|null, expectedCheckDigits: string|null }}
 *   `error` is one of {@link SEPA_CREDITOR_ID_ERRORS}, or null when valid
 */
export function validateCreditorId(raw) {
  const normalized = normalizeCreditorId(raw);
  if (!normalized) return { normalized, error: SEPA_CREDITOR_ID_ERRORS.blank, expectedCheckDigits: null };
  if (!CI_FORMAT.test(normalized)) {
    return { normalized, error: SEPA_CREDITOR_ID_ERRORS.invalidFormat, expectedCheckDigits: null };
  }
  const expected = computeCreditorCheckDigits(normalized.slice(0, 2), normalized.slice(7));
  if (expected !== normalized.slice(2, 4)) {
    return { normalized, error: SEPA_CREDITOR_ID_ERRORS.invalidCheckDigits, expectedCheckDigits: expected };
  }
  return { normalized, error: null, expectedCheckDigits: null };
}

/** The inline error key for a typed creditor id, or null (empty is not an error: nothing typed yet). */
export function creditorIdErrorKey(value) {
  const { normalized, error } = validateCreditorId(value);
  if (!normalized || !error) return null;
  return ERROR_KEYS[error] ?? ERROR_KEYS[SEPA_CREDITOR_ID_ERRORS.invalidFormat];
}
