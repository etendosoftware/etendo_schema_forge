/**
 * Date-range presets shared by ListFilterBar (the date dropdown) and ListView
 * (`listViewOptions.defaultDatePreset`). One computation, so the default a window
 * opens with is byte-identical to what the user gets by picking that preset.
 */

/** Local-calendar `YYYY-MM-DD` for a Date; '' for an invalid one. */
export function toIsoDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Range for a preset id, computed from `now` (defaults to today). Returns null for
 * `allTime` and for any unknown id (= no date filter).
 */
export function computePresetRange(presetId, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const to = new Date(today);
  const from = new Date(today);
  if (presetId === 'today') { /* from = to = today */ }
  else if (presetId === 'yesterday') { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
  else if (presetId === 'last7') from.setDate(from.getDate() - 6);
  else if (presetId === 'last30') from.setDate(from.getDate() - 29);
  else if (presetId === 'last12m') from.setMonth(from.getMonth() - 12);
  else return null;
  return { from, to };
}

/**
 * The column-filter value ListFilterBar emits for a preset, or null when the preset
 * means "no date filter" (allTime / unknown).
 */
export function buildDatePresetFilter(presetId, now = new Date()) {
  const range = computePresetRange(presetId, now);
  if (!range) return null;
  return {
    mode: 'date',
    op: 'range',
    value: [toIsoDate(range.from), toIsoDate(range.to)],
    originalValue: `preset:${presetId}`,
  };
}
