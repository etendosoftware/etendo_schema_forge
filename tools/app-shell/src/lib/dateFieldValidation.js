// Generic date-field validation, driven declaratively by the field config
// (decisions.json `minDate` → contract → FieldDef). Shared by the inline blur
// feedback in EntityForm and the hard save-block gate in useEntity.js, so both call
// sites can never drift. The date-only sibling of numericValidation.js (ETP-6148).
//
// A field opts in through `minDate`:
//   - `'today'`      → the value must be today or later, in the user's LOCAL calendar;
//   - `'YYYY-MM-DD'` → the value must be that day or later.
// A field without `minDate` never validates, so no existing window changes.
//
// Dates are compared as `yyyy-MM-dd` strings, never through `new Date(string)`: a
// date-only string parsed that way is UTC midnight and reads as the previous day
// west of UTC (see lib/dateOnly.js).
//
// Emptiness is NOT handled here — that is the `required` mechanism's job.

import { formatCalendarDate, parseCalendarDate, todayCalendarISO } from './dateOnly.js';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether a `yyyy-MM-dd` string names a real calendar day (so `2026-13-45` does not). */
function isRealIsoDate(str) {
  const m = ISO_DATE_RE.exec(str);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** The `yyyy-MM-dd` of a calendar Date, from its local getters. */
function toCalendarISO(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A date-only value (`yyyy-MM-dd`, a longer ISO timestamp, or a Date) as `yyyy-MM-dd`, or null. */
function toCalendarKey(raw) {
  const date = parseCalendarDate(raw);
  return date ? toCalendarISO(date) : null;
}

/**
 * The `yyyy-MM-dd` a field's `minDate` stands for, or null when it declares none (or an
 * unusable one — including an impossible day such as `2026-13-45` — which is ignored rather
 * than blocking the user).
 *
 * @param {string|undefined|null} minDate - `'today'` or a `yyyy-MM-dd` date.
 * @param {Date} [reference] - "now", injectable for tests.
 * @returns {string|null}
 */
export function resolveMinDate(minDate, reference = new Date()) {
  if (minDate == null || minDate === '') return null;
  if (minDate === 'today') return todayCalendarISO(reference);
  return typeof minDate === 'string' && isRealIsoDate(minDate) ? minDate : null;
}

/**
 * Validate a date-only value against a field's `minDate`.
 *
 * Only a NEW value is checked: when the value is the one the record was loaded with,
 * it passes even if it is already in the past, so an existing record keeps opening and
 * saving its other fields. A new record has no loaded value, so every value is new.
 *
 * Returns a descriptor `{ key, params }` (same shape as getNumericFieldError) so the
 * caller renders `ui(result.key, result.params)`: `fieldMinDateError` ("cannot be earlier
 * than today") for `'today'`, `fieldMinDateBeforeError` with `{ min }` (the date formatted
 * in `options.locale`) for a fixed date.
 *
 * @param {{ minDate?: string }} field - the field config.
 * @param {*} value - the current value.
 * @param {*} [originalValue] - the value the record was loaded with (undefined on create).
 * @param {{ locale?: string, reference?: Date }} [options] - display locale of `{ min }`
 *   (browser default when absent) and "now" (injectable for tests).
 * @returns {{ key: string, params: object }|null}
 */
export function getDateFieldError(field, value, originalValue, { locale, reference = new Date() } = {}) {
  const min = resolveMinDate(field?.minDate, reference);
  if (!min) return null;
  if (value === '' || value == null) return null;
  const current = toCalendarKey(value);
  if (!current) return null;
  if (originalValue != null && originalValue !== '' && toCalendarKey(originalValue) === current) {
    return null;
  }
  if (current >= min) return null;
  return field.minDate === 'today'
    ? { key: 'fieldMinDateError', params: {} }
    : { key: 'fieldMinDateBeforeError', params: { min: formatCalendarDate(min, locale) } };
}

/**
 * Stable sonner toast `id` for a date-field violation, shared by the EntityForm blur
 * toast and the useEntity save-gate toast so a Save clicked right after the input loses
 * focus shows one toast, not two (same reasoning as numericFieldToastId).
 *
 * @param {string} key - the field key.
 * @returns {string}
 */
export function dateFieldToastId(key) {
  return `date-field-${key}`;
}
