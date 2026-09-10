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
 * Clamp a numeric value to a field's declared `max`. Unlike getNumericFieldError,
 * this does not report a violation — it silently corrects the value. A no-op when
 * `field.max` is not declared, when the value is empty, or when it is already <= max.
 *
 * @param {{ max?: number }} field - the field config.
 * @param {*} value - the current value.
 * @returns {*} the clamped value (as a string) or the original value unchanged.
 */
export function clampNumericFieldMax(field, value) {
  if (field?.max == null) return value;
  if (value === '' || value == null) return value;
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > field.max ? String(field.max) : value;
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

/**
 * ETP-5002 — the set of save-blocking error toasts currently on screen, by stable id.
 *
 * Needed because ETP-4830 gave the post-save success toast a FIXED id
 * (`RECORD_SAVE_TOAST_ID`). A stable id buys atomic replacement — which is exactly what
 * killed the User window's dismiss-then-add race — but it COSTS front-of-stack promotion:
 * sonner treats `create()` with an existing id as an in-place UPDATE, so the success toast
 * refreshes an older entry instead of jumping to the front. When a save-blocking error
 * toast is newer, that error keeps `data-front="true"` and the user who just fixed the
 * value and saved successfully is still staring at the error.
 *
 * The two properties are genuinely in tension, so rather than drop the id (reopening
 * ETP-4830's race) the success path clears the errors it is superseding. Only ids WE
 * minted are dismissed — never a bare `toast.dismiss()`, which would also wipe unrelated
 * backend messages and reintroduce the very cross-timer race ETP-4830 documented.
 */
const pendingSaveBlockToastIds = new Set();

/** Remember a save-blocking error toast so a later successful save can clear it. */
export function trackSaveBlockToast(id) {
    if (id) pendingSaveBlockToastIds.add(id);
}

/**
 * Dismiss every tracked save-blocking error toast. Safe to call when none are pending.
 * `dismiss` is injected (rather than importing sonner here) to keep this module free of
 * UI dependencies, matching the rest of the file.
 */
export function dismissSaveBlockToasts(dismiss) {
    if (pendingSaveBlockToastIds.size === 0) return;
    for (const id of pendingSaveBlockToastIds) dismiss?.(id);
    pendingSaveBlockToastIds.clear();
}

/** Test seam: forget all tracked ids without touching the UI. */
export function resetSaveBlockToastTracking() {
    pendingSaveBlockToastIds.clear();
}
