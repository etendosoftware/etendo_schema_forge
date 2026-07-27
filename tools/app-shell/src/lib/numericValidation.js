// Generic numeric field validation, driven declaratively by the field config
// (decisions.json → contract → FieldDef). Shared by the inline blur feedback in
// EntityForm and the hard save-block gate in useEntity.js, so both call sites can
// never drift. ETP-4542.
//
// A field opts into validation purely through its config:
//   - `min`      → value must be >= min (reuses the existing `fieldMinValueError`).
//   - `integer`  → when `true`, decimals are rejected. DEFAULT (flag absent or
//                  false) accepts decimals, so this is fully backwards-compatible:
//                  fields that declare neither `min` nor `integer` never validate.
//
// Emptiness is intentionally NOT handled here — that is the `required` mechanism's
// job. An empty/null value is always considered valid by this helper so it never
// duplicates or fights the required-field semantics.

/**
 * Validate a single numeric value against a field's declarative constraints.
 *
 * Returns a descriptor `{ key, params }` (not a bare string) so the caller can
 * interpolate the i18n message: `ui(result.key, result.params)`. The `params`
 * object carries the interpolation values a message needs — `fieldMinValueError`
 * ships `{ min }` so the toast can read "Value must be at least 1" instead of
 * the imprecise "Value cannot be negative" (0 is not negative). `fieldIntegerError`
 * needs no params, so it returns an empty `params` object for a uniform shape.
 *
 * @param {{ min?: number, integer?: boolean }} field - the field config.
 * @param {*} value - the current value.
 * @returns {{ key: string, params: object }|null} the FIRST failing i18n error
 *   descriptor (key + interpolation params), or null when valid.
 */
export function getNumericFieldError(field, value) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    // A non-numeric value only fails when an integer constraint is declared;
    // otherwise leave it to the browser number input / backend to reject.
    return field?.integer === true ? { key: 'fieldIntegerError', params: {} } : null;
  }
  if (field?.min != null && num < field.min) {
    return { key: 'fieldMinValueError', params: { min: field.min } };
  }
  if (field?.integer === true && !Number.isInteger(num)) {
    return { key: 'fieldIntegerError', params: {} };
  }
  return null;
}

/**
 * Stable sonner toast `id` for a numeric-field violation, shared by both call
 * sites that can report the SAME field's error almost simultaneously: the
 * on-blur toast in EntityForm and the save-gate toast in useEntity.js. When a
 * user clicks "Save" without leaving the invalid input first, the browser
 * fires `blur` (→ EntityForm's toast) immediately before the click's
 * `onClick` (→ useEntity's save gate) — two toasts, same message, milliseconds
 * apart. Passing this same `id` to both `toast.error(...)` calls lets sonner
 * dedupe them (the second call replaces the first) instead of stacking two
 * identical toasts. Genuinely separate actions (blur-only, or save-only)
 * still each get their own toast — dedup only collapses same-id calls that
 * land while the previous toast is still visible. ETP-4542.
 *
 * @param {string} key - the field key.
 * @returns {string} a stable id, e.g. "numeric-field-usableLifeMonths".
 */
export function numericFieldToastId(key) {
  return `numeric-field-${key}`;
}
