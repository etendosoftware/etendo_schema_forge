// ETP-4557 — the single app-shell adapter over the declarative validation engine
// (`@etendosoftware/app-shell-core/lib/validation`, ETP-4556). Form save, form blur,
// inline-grid add/edit and the import review queue all decide validity HERE, so one
// contract produces one error code for one value regardless of the flow.
//
// What this module owns (and the engine deliberately does not):
//   - building engine field descriptors from runtime field configs, including the flat
//     `maxLength`/`min` keys generated forms carry when no `validation` object is present;
//   - the temporary field-name inference (engine `inferFormatConstraints`) for email/web/phone,
//     until the pipeline emits real `format` constraints — see TEMP note on `toDescriptor`;
//   - code → i18n descriptor mapping (`{ key, params }`), shared by every presentation;
//   - the native-control attributes (`maxLength`, `min`, `max`, `inputMode`).
// It never mutates data and contains no window-specific branch.
import * as engine from '@etendosoftware/app-shell-core/lib/validation/index.js';

const { validateRecord, ERROR_CODES, inferFormatConstraints } = engine;

// `describeValidationError` ships with the next app-shell-core release (ETP-4557). Until the pinned
// version has it, a namespace import keeps module loading safe (a missing named export would throw
// at link time and break every suite that loads this file against the published package) and this
// mirror is used. REMOVE the fallback when `package.json` is bumped to that release.
function fallbackDescribe(error) {
  if (!error) return null;
  switch (error.code) {
    case ERROR_CODES.MAX_LENGTH: return { key: 'fieldMaxLengthError', params: { maxLength: error.max } };
    case ERROR_CODES.MIN_LENGTH: return { key: 'fieldMinLengthError', params: { minLength: error.min } };
    case ERROR_CODES.MINIMUM: return { key: 'fieldMinValueError', params: { min: error.min } };
    case ERROR_CODES.MAXIMUM: return { key: 'fieldMaxValueError', params: { max: error.max } };
    case ERROR_CODES.REQUIRED: return { key: 'importErrorRequiredGeneric', params: {} };
    case ERROR_CODES.DISALLOWED_SCHEME: return { key: 'websiteInsecureUrl', params: {} };
    case ERROR_CODES.INVALID_FORMAT:
      if (error.format === 'email') return { key: 'sendModalInvalidEmail', params: {} };
      if (error.format === 'phone') return { key: 'phoneInvalidChars', params: {} };
      if (error.format === 'url') return { key: 'websiteInsecureUrl', params: {} };
      return { key: 'fieldInvalidValue', params: {} };
    default: return { key: 'fieldInvalidValue', params: {} };
  }
}
const describeValidationError = engine.describeValidationError ?? fallbackDescribe;

export { ERROR_CODES };

// Fixed-prefix fields (ETP-4749, e.g. "https://" chip) store only the suffix; the engine must
// see the full value, exactly as the old per-format helpers reconstructed it.
function withInputPrefix(field, value) {
  return field?.inputPrefix && value != null && String(value).trim() !== ''
    ? field.inputPrefix + String(value)
    : value;
}

/**
 * Engine descriptor for a runtime field config.
 * @param {object} field runtime field config (`key`, `column`, `type`, `maxLength`, `min`, `validation`).
 * @returns {{name:string, key:string, column:string, type:string, validation:object}} descriptor for `validateRecord`.
 *
 * Precedence: an explicit `field.validation` always wins; flat `maxLength` / `min` fill the gaps
 * (legacy generated forms). Flat `max` is NOT promoted: the app silently clamps it on blur/save
 * (clampNumericFieldMax) and that behaviour is unchanged — only a declared `validation.maximum`
 * blocks. `required` is never evaluated here: required-field handling keeps its own path
 * (getMissingRequiredFields, which understands conditional visibility/read-only).
 *
 * TEMP: email/web/phone formats are still inferred from the field name via the engine's
 * compat adapter. Remove `inferFormatConstraints` here once contracts declare `format`.
 */
export function toDescriptor(field) {
  const declared = (field?.validation && typeof field.validation === 'object') ? { ...field.validation } : {};
  delete declared.required;
  const validation = {};
  if (field?.maxLength != null) validation.maxLength = Number(field.maxLength);
  if (field?.min != null) validation.minimum = Number(field.min);
  const inferred = inferFormatConstraints(field);
  const merged = { ...validation, ...(inferred || {}), ...declared };
  return {
    name: field?.key,
    key: field?.key,
    column: field?.column,
    type: field?.type,
    validation: merged,
  };
}

/**
 * Validate ONE field value. Returns every engine error for it (empty array when valid).
 * @param {object} field runtime field config.
 * @param {*} value current value (the `inputPrefix`, if any, is prepended before validating).
 * @param {{hasPrevious?:boolean, previous?:*}} [opts] legacy policy: with `hasPrevious`, a value equal to `previous` is skipped.
 * @returns {Array<{code:string}>} engine errors, possibly empty.
 * `previous`, when supplied with `hasPrevious`, applies the legacy policy: an unchanged value is
 * not re-validated (see docs/validation-engine.md, "Unchanged legacy-invalid policy").
 */
export function getFieldErrors(field, value, { hasPrevious = false, previous } = {}) {
  const descriptor = toDescriptor(field);
  if (!descriptor.name) return [];
  const effective = withInputPrefix(field, value);
  const { errors } = validateRecord({
    fields: [descriptor],
    values: { [descriptor.name]: effective },
    operation: 'update',
    options: hasPrevious ? { previousValues: { [descriptor.name]: withInputPrefix(field, previous) } } : {},
  });
  return [...(errors[descriptor.name] || [])];
}

/**
 * Engine error → i18n descriptor, through the engine's shared mapper (also used by import).
 * @param {{code:string}} error engine error.
 * @returns {{key:string, params:object}|null} i18n key plus interpolation params.
 */
export function toErrorDescriptor(error) {
  return describeValidationError(error);
}

/**
 * First error for a value as an i18n descriptor, or null when valid.
 * @param {object} field runtime field config.
 * @param {*} value current value.
 * @param {{hasPrevious?:boolean, previous?:*}} [opts] see `getFieldErrors`.
 * @returns {{key:string, params:object, code:string}|null}
 */
export function getFieldError(field, value, opts) {
  const [first] = getFieldErrors(field, value, opts);
  return first ? { ...toErrorDescriptor(first), code: first.code } : null;
}

/**
 * Record-level pass over `fields` (visible/editable filtering is the caller's, because the
 * conditional-visibility predicates live in lib/requiredFields.js).
 * @param {Array<object>} fields runtime field configs to validate.
 * @param {object} values record values keyed by `field.key`.
 * @param {{loaded?:object|null}} [opts] the loaded record; a value equal to it is skipped (null on create).
 * @returns {{key:string, errorKey:string, errorParams:object, code:string}|null} first violation, in the shape the useEntity save gates use.
 */
export function getFirstViolation(fields, values, { loaded } = {}) {
  for (const f of fields) {
    const hasPrevious = loaded != null && Object.prototype.hasOwnProperty.call(loaded, f.key);
    const err = getFieldError(f, values?.[f.key], { hasPrevious, previous: loaded?.[f.key] });
    if (err) return { key: f.key, errorKey: err.key, errorParams: err.params, code: err.code };
  }
  return null;
}

/**
 * Native control attributes derived from the contract: `maxLength` (flat or declared), `min`/`max`
 * (`min`: declared validation first, flat config second; `max`: declared only), `inputMode` for the email/phone/url formats,
 * and `aria-invalid` / `aria-describedby` when `error` is set.
 * @param {object} field runtime field config.
 * @param {*} [error] truthy when the field currently has an inline error.
 * @returns {object} props to spread on the native control.
 * `type` already comes from the contract
 * through EntityForm's getInputType, so it is not overridden here. Only declared constraints produce an attribute.
 */
export function getNativeInputProps(field, error) {
  const v = (field?.validation && typeof field.validation === 'object') ? field.validation : {};
  const props = {};
  const maxLength = v.maxLength ?? field?.maxLength;
  if (maxLength != null) props.maxLength = maxLength;
  const min = v.minimum ?? field?.min;
  if (min != null) props.min = min;
  // Only a DECLARED maximum becomes a native `max`: the flat `max` is a silent clamp, and a native
  // attribute would let the browser's own constraint validation block or tooltip it.
  if (v.maximum != null) props.max = v.maximum;
  const format = toDescriptor(field).validation.format;
  if (format === 'email') props.inputMode = 'email';
  else if (format === 'phone') props.inputMode = 'tel';
  else if (format === 'url') props.inputMode = 'url';
  // Error association: the message element rendered by EntityForm is `error-<key>-msg`.
  if (error) {
    props['aria-invalid'] = true;
    props['aria-describedby'] = `error-${field.key}-msg`;
  }
  return props;
}

/**
 * Map a backend structured validation payload (`{ fieldErrors: [{ field, code, ...params }] }` or
 * `{ errors: { field: [{code}] } }`) onto `{ [fieldKey]: { key, params } }`. Anything without a
 * recognised code is dropped: the raw backend message is never surfaced here, so SQL / stack text
 * cannot reach the inline error.
 * @param {object} payload parsed response body.
 * @returns {Object<string,{key:string, params:object}>} i18n descriptor per field key.
 */
export function mapBackendFieldErrors(payload) {
  const out = {};
  const entries = [];
  const body = payload?.error ?? payload;
  if (Array.isArray(body?.fieldErrors)) {
    for (const e of body.fieldErrors) entries.push([e?.field, e]);
  } else if (body?.errors && typeof body.errors === 'object') {
    for (const [field, list] of Object.entries(body.errors)) {
      if (Array.isArray(list) && list[0]) entries.push([field, list[0]]);
    }
  }
  for (const [field, e] of entries) {
    if (typeof field !== 'string' || !field || !ERROR_CODES[e?.code]) continue;
    if (!out[field]) out[field] = toErrorDescriptor(e);
  }
  return out;
}

/**
 * Localized message for a failed response carrying structured validation codes, or null when the
 * body has none we recognise (the caller then falls back to its generic path). Reads a CLONE, so
 * the original body stays available. Raw backend text is never returned.
 * @param {Response} res failed response.
 * @param {Function} ui translator.
 * @returns {Promise<string|null>} localized message or null.
 */
export async function structuredBackendMessage(res, ui) {
  try {
    const mapped = mapBackendFieldErrors(await res.clone().json());
    const first = Object.values(mapped)[0];
    return first ? ui(first.key, first.params) : null;
  } catch {
    return null;
  }
}

// A backend message that looks like an internal detail (SQL, JDBC/Hibernate, Java stack frames,
// exception class names) must never reach the user. Everything else is a business message the
// backend meant to show and keeps the existing translation path.
const INTERNAL_DETAIL_RE = new RegExp([
  String.raw`\bat [\w$.]+\([\w$.]+:\d+\)`,
  String.raw`\b(?:jdbc|hibernate|stack ?trace)\b`,
  // PostgreSQL / Oracle server text.
  String.raw`\bviolates (?:unique|not-null|foreign key|check) constraint\b`,
  String.raw`\bORA-\d+\b`,
  // PostgreSQL in Spanish (lc_messages=es): "viola la llave foránea", "viola la restricción", etc.
  String.raw`\bviola (?:la )?(?:llave|restricci[oó]n)\b|\bvalor (?:duplicado|nulo) en\b`,
  String.raw`\bduplicate key value\b|\bnull value in column\b|\bcould not execute (?:statement|query)\b`,
].join('|'), 'i');
// Case-SENSITIVE, as the servers emit them: upper-case PostgreSQL labels with the colon, and upper-case
// SQL keywords. "Error: select a warehouse", "Cannot delete a line from an order" and "see the detail"
// are business text and must not match.
const SERVER_TEXT_RE = new RegExp([
  String.raw`^\s*(?:ERROR|FATAL|PANIC):`,
  String.raw`\b(?:DETAIL|HINT|SQLSTATE):`,
  String.raw`\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(?:FROM|INTO|SET|WHERE)\b`,
].join('|'));
// Case-SENSITIVE: a Java class name (`ConstraintViolationException`, `org.hibernate.…`) — an
// ordinary lower-case "network error" must not match.
const JAVA_CLASS_RE = /\b[A-Z]\w*Exception\b|\b(?:org|java|javax|com)\.[a-z][\w.]*\.[A-Z]\w+/;

/**
 * The message to show for a failed save: the localized generic one when `msg` leaks internals.
 * @param {string} msg candidate message.
 * @param {Function} [ui] translator; without it the English fallback is used.
 * @returns {string} `msg` when ordinary, otherwise the generic message.
 */
export function safeBackendMessage(msg, ui) {
  if (typeof msg !== 'string' || msg.trim() === '') return msg;
  if (!(INTERNAL_DETAIL_RE.test(msg) || SERVER_TEXT_RE.test(msg) || JAVA_CLASS_RE.test(msg) || msg.length > 600)) return msg;
  const generic = typeof ui === 'function' ? ui('backendGenericError') : null;
  return generic && generic !== 'backendGenericError' ? generic : 'The operation could not be completed. Please try again.';
}
