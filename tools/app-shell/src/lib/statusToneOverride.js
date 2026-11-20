import { getStatusTone } from './statusBadge.js';

/**
 * ETP-6148 — per-column status tones.
 *
 * Status codes are not globally unique: `PR`, `AN` and `CP` mean different things in different
 * windows, so `getStatusTone`'s global catalog cannot colour them. A window colours its own codes
 * instead, through the status field's `enumVariants` in `decisions.json`. The generator already
 * emits that key on the column descriptor for every column type. This module is where a `status`
 * column honours it: the grid cell (`DataTable.cellRenderers.jsx`) and the "All statuses"
 * quick-filter pill (`ListFilterBar.jsx`).
 *
 * Kept apart from `statusBadge.js` on purpose. Dozens of DataTable tests mock that module with a
 * fixed export list, and this function delegates to its `getStatusTone`, so a mocked catalog
 * still applies to every code the column does not declare.
 */

// The StatusTag tones (`TONE_STYLES` in components/ui/status-tag-tokens.js).
const STATUS_TONES = new Set(['success', 'warning', 'destructive', 'caution', 'info', 'neutral']);

// `enumVariants` is also the key an `enum` column colours its Tag with, in Tag-variant names
// (green, red, …). A status column accepts those as well, mapped to the tone of the same colour
// family, so one vocabulary works for both column types.
const TAG_VARIANT_TONE = Object.freeze({
  green: 'success',
  teal: 'success',
  yellow: 'warning',
  red: 'destructive',
  orange: 'caution',
  blue: 'info',
  neutral: 'neutral',
});

/**
 * The tone of a status code on a column that may declare its own per-code tones.
 *
 * A code the column does not declare, or a declared value that is neither a tone nor a known Tag
 * variant, falls back to `getStatusTone`. A column without `enumVariants` therefore renders
 * exactly as before.
 *
 * @param {string} status raw status code
 * @param {Record<string, string>} [enumVariants] code → tone (or Tag variant)
 * @returns {string} one of the StatusTag tones
 */
export function resolveStatusTone(status, enumVariants) {
  const declared = enumVariants?.[status];
  if (typeof declared === 'string') {
    if (STATUS_TONES.has(declared)) return declared;
    const mapped = TAG_VARIANT_TONE[declared];
    if (mapped) return mapped;
  }
  return getStatusTone(status);
}
