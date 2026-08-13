/**
 * Date-range bound helpers shared by the financial-account window and the
 * reconciliation split panel. These resolve a {@link DateRangePopover} value
 * (a preset id or an explicit `{ from, to }` pair) into concrete Date bounds
 * suitable for client-side filtering and for the backend date params.
 *
 * Single source of truth — do NOT copy these into individual components.
 */

/**
 * Resolves a named preset id into `{ from, to }` Date bounds.
 *
 * Presets: today, yesterday, last7, last30, last12m. The `to` bound is pushed
 * to the end of its day (23:59:59.999) so a same-day comparison is inclusive.
 *
 * @param {string} presetId
 * @returns {{ from: Date, to: Date } | null} null for an unknown preset.
 */
export function presetBounds(presetId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = new Date(today);
  const from = new Date(today);
  if (presetId === 'today') {
    // from = to = start of today
  } else if (presetId === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else if (presetId === 'last7') {
    from.setDate(from.getDate() - 6);
  } else if (presetId === 'last30') {
    from.setDate(from.getDate() - 29);
  } else if (presetId === 'last12m') {
    from.setMonth(from.getMonth() - 12);
  } else {
    return null;
  }
  // Include the whole "to" day.
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/**
 * Resolves a DateRangePopover value into concrete `{ from, to }` Date bounds
 * (a null member = no constraint on that side).
 *
 * @param {null | { presetId: string } | { from: Date, to: Date }} dateRange
 * @returns {{ from: Date | null, to: Date | null }}
 */
export function getDateBounds(dateRange) {
  if (!dateRange) return { from: null, to: null };
  if ('presetId' in dateRange) {
    const bounds = presetBounds(dateRange.presetId);
    return bounds ?? { from: null, to: null };
  }
  if ('from' in dateRange && 'to' in dateRange) {
    const from = dateRange.from instanceof Date ? new Date(dateRange.from) : null;
    const to = dateRange.to instanceof Date ? new Date(dateRange.to) : null;
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  return { from: null, to: null };
}

/**
 * Formats a Date as an ISO `yyyy-mm-dd` string for a backend date param,
 * or `undefined` when the value is not a valid Date.
 *
 * @param {Date} date
 * @returns {string | undefined}
 */
export function toDateParam(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : undefined;
}
