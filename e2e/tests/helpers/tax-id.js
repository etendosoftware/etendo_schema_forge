/**
 * Generates syntactically VALID Spanish CIFs for E2E fixtures — a plain string like
 * `B-${Date.now()}` looks unique but is not a real tax ID, and since ETP-5031 both the
 * frontend (`tools/app-shell/src/lib/taxIdValidation.js`) and the backend
 * (`com.etendoerp.go`'s `SpanishTaxIdValidator.java`, via `BusinessPartnerHandler.validateTaxId()`)
 * reject it with a 400 when the Business Partner's "Clave NIF país residencia" is NIF.
 *
 * This is a STANDALONE PORT of the CIF check-digit algorithm in
 * `tools/app-shell/src/lib/taxIdValidation.js`'s private `isValidCif()` — that function is not
 * exported, so it cannot be imported here. Keep both in sync if the algorithm ever changes; the
 * shared behavioral contract is covered by that module's own tests (and the Java mirror's).
 *
 * CIF shape: 1 letter of entity type + 7 digits + 1 control character (digit OR letter, both
 * valid for the same 7 digits — which one a real entity uses depends on the leading letter, but
 * either representation passes validation).
 */

/** CIF control characters, indexed by the computed control digit — same table as taxIdValidation.js. */
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

/**
 * Computes the CIF control digit (0-9) for 7 digits, Luhn-like: odd-positioned digits doubled
 * and their own digits summed, even-positioned ones added as-is.
 *
 * @param {string} sevenDigits exactly 7 numeric characters
 * @returns {string} the control digit, as a single decimal character
 */
export function cifControlDigit(sevenDigits) {
  if (!/^\d{7}$/.test(sevenDigits)) {
    throw new Error(`cifControlDigit expects exactly 7 digits, got "${sevenDigits}"`);
  }
  let sumEven = 0;
  let sumOdd = 0;
  for (let i = 0; i < sevenDigits.length; i += 1) {
    const digit = Number(sevenDigits[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sumOdd += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sumEven += digit;
    }
  }
  const control = (10 - ((sumEven + sumOdd) % 10)) % 10;
  return String(control);
}

/**
 * Builds a syntactically and check-digit valid CIF from an entity-type letter and 7 digits.
 * Uses the digit form of the control character (also valid: `CIF_CONTROL_LETTERS[control]`).
 *
 * @param {string} letter one of `[ABCDEFGHJKLMNPQRSUVW]`
 * @param {string} sevenDigits exactly 7 numeric characters
 * @returns {string} a 9-character valid CIF, e.g. "B12345674"
 */
export function generateValidCif(letter, sevenDigits) {
  return `${letter}${sevenDigits}${cifControlDigit(sevenDigits)}`;
}

/**
 * Convenience for E2E fixtures: a valid CIF ("B" + digits) unique per test run, derived from a
 * seed (typically `Date.now()`) plus an optional salt to keep several fixtures in the same run
 * distinct from one another (e.g. one per imported row).
 *
 * The seed is truncated to its last 6 digits and the salt (0-9) becomes the 7th digit, mirroring
 * how the previous placeholder fixtures encoded per-row uniqueness — only now followed by a real
 * check digit instead of a bare trailing index.
 *
 * @param {number|string} seed a value that changes per test run, e.g. `Date.now()`
 * @param {number} [salt] 0-9, to distinguish multiple fixtures derived from the same seed
 * @returns {string} a 9-character valid CIF
 */
export function uniqueValidCif(seed, salt = 0) {
  const sevenDigits = `${String(seed).slice(-6)}${salt % 10}`;
  return generateValidCif('B', sevenDigits);
}
