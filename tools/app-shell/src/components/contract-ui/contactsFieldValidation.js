// ETP-5031 — text-field validation SCOPED to the Contacts (GO) window only.
// Deliberately window-specific: unlike recipientEdits.js's email/phone/website
// heuristics (which apply repo-wide by field-name pattern), this module guards a
// fixed set of Contacts text fields against exceeding the AD column's real
// database length and against control/HTML-like characters — a class of bug that
// only ever showed up on this window's free-text inputs. `getContactsTextFieldError`
// gates on `windowName !== 'contacts'` as its very first check, so importing this
// module into a shared call site (EntityForm, useEntity, DataTable,
// InlineLinesPanel) can never affect any other window.
//
// Same return contract as `getNumericFieldError` (tools/app-shell/src/lib/numericValidation.js):
// `{ key, params } | null` — an i18n key + interpolation params, decoupled from
// display. Empty values are always valid; emptiness is the `required` mechanism's job.

// field.key -> the AD column's real database length, read directly from
// artifacts/contacts/contract.json (entities.businessPartner.fields / entities.contact.fields
// → validation.maxLength) for every editable text-type field visible in
// BusinessPartnerForm.jsx / ContactForm.jsx. Keys are the runtime `field.key`
// (camelCase, derived from the AD column — e.g. column 'EM_Etgo_Email' -> key
// 'etgoEmail'), confirmed against the generated form files, not guessed.
export const CONTACTS_TEXT_FIELD_LIMITS = {
  // businessPartner entity
  name: 60,
  etgoFirstname: 60,
  etgoLastname: 60,
  taxID: 20,
  etgoWeb: 60,
  etgoEmail: 60,
  etgoPhone: 60,
  // contact entity
  firstName: 60,
  lastName: 60,
  email: 255,
  phone: 40,
  position: 40,
  comments: 2000,
};

// Rejects ASCII control characters (except the normal editing ones: tab, newline,
// carriage return) and HTML/script-like markup. The `<`/`>` check alone already
// covers the `<script>` injection case without attempting full HTML sanitization —
// this is a charset guard, not a sanitizer.
//
// Checked via char codes rather than a regex literal — SonarQube's control-character
// rule (javascript:S6324) flags a raw control-character range inside ANY regex, even
// a deliberate charset guard like this one, because it can't distinguish "matching
// control chars on purpose" from "an unsanitized control char leaked into a pattern".
// A numeric char-code loop expresses the exact same guard without a regex Sonar has
// to second-guess.
const ALLOWED_CONTROL_CODES = new Set([9, 10, 13]); // tab, LF, CR

function hasControlChar(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f && !ALLOWED_CONTROL_CODES.has(code)) return true;
  }
  return false;
}

const HTML_LIKE_RE = /[<>]/;

export function hasUnsafeChars(value) {
  const s = String(value ?? '');
  return hasControlChar(s) || HTML_LIKE_RE.test(s);
}

/**
 * Returns the i18n error descriptor for a Contacts text field+value, or null
 * when valid. ALWAYS returns null for any window other than 'contacts' — this
 * is the gate that keeps the validation scoped to this single window, checked
 * before anything else.
 *
 * @param {string} windowName - the current window's kebab-case spec name.
 * @param {{ key?: string }} field - the field config.
 * @param {*} value - the current value.
 * @returns {{ key: string, params: object }|null}
 */
export function getContactsTextFieldError(windowName, field, value) {
  if (windowName !== 'contacts') return null;

  const key = field?.key;
  const limit = CONTACTS_TEXT_FIELD_LIMITS[key];
  if (limit == null) return null;

  const s = String(value ?? '');
  if (s === '') return null;

  if (s.length > limit) {
    return { key: 'fieldMaxLengthError', params: { maxLength: limit } };
  }
  if (hasUnsafeChars(s)) {
    return { key: 'fieldInvalidCharacters', params: {} };
  }
  return null;
}

// A field is phone-format-restricted when its key/column contains a "phone"
// token — mirrors `isPhoneField` from recipientEdits.js exactly (same regex),
// duplicated here rather than imported so this module stays a single,
// self-contained gate: everything that decides what Contacts blocks or
// filters lives in one file. Kept private — callers use `filterContactsInputValue`.
function isPhoneLikeField(field) {
  if (!field) return false;
  const textLike = field.type == null || field.type === 'text' || field.type === 'string' || field.type === 'tel';
  if (!textLike) return false;
  return /phone/i.test(String(field.key ?? '')) || /phone/i.test(String(field.column ?? ''));
}

// Charset a phone-like field accepts, kept in lockstep with `isValidPhone`
// (recipientEdits.js): digits, +, (, ), -, ., and whitespace. Any other
// character a phone field's format check would reject anyway, so stripping
// it at keystroke time can never let through something the save-time format
// check would otherwise flag — it only makes the rejection immediate.
const PHONE_DISALLOWED_CHARS_RE = /[^\d+()\-.\s]/g;

// ETP-5031 follow-up — Organization's "Teléfono" (OrganizationPage.jsx, a fully
// hand-built page that never touches EntityForm/useEntity, so it can't be
// reached through `windowName === 'contacts'` gating at all) needed the exact
// same keystroke filter, for the exact same AD column (EM_Etgo_Phone). Rather
// than widen the Contacts gate to quietly also cover an unrelated window — the
// gate's whole point is that importing this module elsewhere is a no-op unless
// explicitly opted in — this pure, ungated primitive is exported so a call site
// OUTSIDE Contacts (which already knows it wants phone filtering, because it is
// the one choosing to call it) can opt in explicitly. `filterContactsInputValue`
// below is just this plus the Contacts auto-detection/gate on top.
export function filterPhoneCharacters(value) {
  return String(value ?? '').replace(PHONE_DISALLOWED_CHARS_RE, '');
}

/**
 * Filters a keystroke-level input value for a Contacts field, or returns it
 * unchanged. ALWAYS returns `value` unchanged for any window other than
 * 'contacts' — same scoping gate as `getContactsTextFieldError`. For a
 * phone-like field inside Contacts, strips every character outside the
 * allowed phone charset so the browser input never displays it in the first
 * place (stronger UX than the save-time toast: the disallowed character
 * simply never appears, rather than typing it and being rejected later).
 *
 * @param {string} windowName - the current window's kebab-case spec name.
 * @param {{ key?: string, column?: string, type?: string }} field - the field config.
 * @param {*} value - the raw input value (e.g. `e.target.value`).
 * @returns {string} the (possibly filtered) value.
 */
export function filterContactsInputValue(windowName, field, value) {
  const s = String(value ?? '');
  if (windowName !== 'contacts') return s;
  if (isPhoneLikeField(field)) {
    return filterPhoneCharacters(s);
  }
  return s;
}
