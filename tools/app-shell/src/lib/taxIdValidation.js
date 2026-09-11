// ETP-5190 — format + check-digit validation for a Spanish tax identifier.
//
// The MIRROR of `com.etendoerp.go/src/com/etendoerp/go/common/SpanishTaxIdValidator.java`,
// which is the binding one. This module exists so the user is told before the round trip
// instead of after it; both must accept and reject exactly the same values, so any change here
// is a change there too (and vice versa). Its own tests assert the shared cases.
//
// The user sets its own fiscal identifier at exactly two points, and both are covered:
//   1. the signup wizard's "NIF" field, and
//   2. the Organización window, where they come back to edit it.
// (1) lives in the published `@etendosoftware/etendo-go-core` `CompanyStep`, which takes no
// validator from `config` — so in the browser only (2) is guarded here; the signup value is
// refused server-side by `parseOnboardingRequest`. Adding a client-side check to the wizard
// means a change to that package, not to this repo.
//
// NOT gated on country, unlike the Java side (which gates on the org's `C_Country`). The two
// cannot disagree today: `OnboardingPage.jsx` hardcodes `countryCodes: ['ES']` and
// `fiscalIdType: 'NIF'`, so every GO tenant is Spanish, and the Organización window has no ISO
// code to gate on anyway — only a country LABEL derived from the address identifier. The day GO
// ships a second country, this module needs the gate too; until then adding one would mean
// inventing a country code the screen does not have.
//
// Return contract matches `recipientEdits.js`'s `getEmailFieldError`/`getWebsiteFieldError`:
// `(field, value) => i18nKey | null`. An empty value is always valid — requiredness is the
// `required` mechanism's job, and on this window `getMissingRequiredFields` already owns it.

/** Company (CIF): a letter of entity type, 7 digits, and a control digit or letter. */
const CIF_PATTERN = /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/;

/** Natural person (DNI/NIF): 8 digits and a control letter. */
const PERSON_PATTERN = /^\d{8}[A-Z]$/;

/** Foreign resident (NIE): X, Y or Z, 7 digits and a control letter. */
const NIE_PATTERN = /^[XYZ]\d{7}[A-Z]$/;

/** CIF control characters, indexed by the computed control digit. */
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

/** DNI/NIE control letters, indexed by `number % 23`. */
const PERSON_CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

const PERSON_MODULUS = 23;

export const TAX_ID_FORMAT_ERROR_KEY = 'taxIdInvalidFormat';
export const TAX_ID_CHECK_DIGIT_ERROR_KEY = 'taxIdInvalidCheckDigit';

/**
 * Uppercases and strips whitespace and the separators people paste in (`.` and `-`), so
 * "b-12345678" is judged as "B12345678" rather than rejected on punctuation whose problem the
 * user cannot see. Same normalization as the Java side.
 */
export function normalizeTaxId(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return '';
  return raw.replace(/[\s.-]/g, '').toUpperCase();
}

/**
 * The CIF check character, Luhn-like: odd-positioned digits doubled and their own digits
 * summed, even-positioned ones added as they are. BOTH representations of the control
 * character are accepted (the digit, and its letter) because which one an entity uses depends
 * on the leading letter — dropping either half would reject real CIFs.
 */
function isValidCif(taxId) {
  const digits = taxId.slice(1, 8);
  let sumEven = 0;
  let sumOdd = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sumOdd += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sumEven += digit;
    }
  }
  const control = (10 - ((sumEven + sumOdd) % 10)) % 10;
  const provided = taxId[8];
  return provided === String(control) || provided === CIF_CONTROL_LETTERS[control];
}

/** The DNI/NIE control letter: the 8-digit number modulo 23, indexed into the letter table. */
function isValidPersonControlLetter(taxId, numericPart) {
  const expected = PERSON_CONTROL_LETTERS[Number(numericPart) % PERSON_MODULUS];
  return taxId[taxId.length - 1] === expected;
}

/**
 * Validates a Spanish tax identifier.
 *
 * All three shapes are accepted, and that matters: the signup wizard offers `businessType`
 * company / freelancer, and an autónomo has a personal DNI rather than a company CIF —
 * accepting only the CIF form would reject every freelancer in the product.
 *
 * @param {unknown} value the value as typed
 * @returns {string|null} the i18n key of the reason it was rejected, or `null` when acceptable
 *   (which includes an empty value)
 */
export function getTaxIdError(value) {
  const taxId = normalizeTaxId(value);
  if (taxId === '') {
    // Blank is acceptable; a value made ENTIRELY of the separators normalization strips
    // ("---", "...") is not. Without this it would normalize to empty and be waved through,
    // and on the Organización window the required-field check passes it too (its own test is
    // `!String(v).trim()`), so "---" would have been stored as a NIF.
    return String(value ?? '').trim() === '' ? null : TAX_ID_FORMAT_ERROR_KEY;
  }
  if (CIF_PATTERN.test(taxId)) {
    return isValidCif(taxId) ? null : TAX_ID_CHECK_DIGIT_ERROR_KEY;
  }
  if (PERSON_PATTERN.test(taxId)) {
    return isValidPersonControlLetter(taxId, taxId.slice(0, 8))
      ? null : TAX_ID_CHECK_DIGIT_ERROR_KEY;
  }
  if (NIE_PATTERN.test(taxId)) {
    // X/Y/Z stand in for a leading 0/1/2 before the modulus is taken.
    const prefix = 'XYZ'.indexOf(taxId[0]);
    return isValidPersonControlLetter(taxId, `${prefix}${taxId.slice(1, 8)}`)
      ? null : TAX_ID_CHECK_DIGIT_ERROR_KEY;
  }
  return TAX_ID_FORMAT_ERROR_KEY;
}

/**
 * Field-descriptor form, matching `recipientEdits.js`'s validators so a call site can chain
 * them all the same way.
 *
 * @param {{key?: string}} field the field descriptor; only tax-ID-named fields are checked
 * @param {unknown} value the value as typed
 * @returns {string|null} an i18n key, or `null`
 */
export function getTaxIdFieldError(field, value) {
  if (!isTaxIdField(field)) return null;
  return getTaxIdError(value);
}

/**
 * A field is tax-ID-format-validated when its key contains a "taxid" token
 * (case-insensitive) — covering `taxID`, `TaxID` and `fiscalIdValue`'s eventual descriptor.
 * Deliberately narrow: `taxIdType` and `taxCategory` must NOT match, so the token is checked
 * as a whole word-ish prefix rather than as any substring containing "tax".
 */
export function isTaxIdField(field) {
  const key = String(field?.key ?? field?.columnName ?? '').toLowerCase();
  return key === 'taxid' || key === 'fiscalidvalue';
}
