/**
 * The committed-value logic shared by the paged selectors (InlineSearchCombo, CreatableSearchSelect,
 * SelectorInput). Pure: no React, no DOM except `centerOptionInPanel`.
 */

// ETP-5903 — how many pages (of the component's own page size) a reopened selector may load to
// find its committed value in place. Beyond that, the value is pinned on top instead (ETP-5846):
// a catalog of thousands (business partners, products) must not cost dozens of requests per open.
export const LOCATE_SELECTION_MAX_PAGES = 6;

/** Whether `value` holds a committed id (not null, undefined or ''). */
export function hasCommittedValue(value) {
  return value != null && value !== '';
}

/**
 * Index of the row that holds the committed `value`, or -1 when it is not among `rows`.
 *
 * The committed option is marked with a check icon + a bolder label, never with the highlight
 * background: a colour-only cue would be indistinguishable from hover in a monochrome/high-contrast
 * rendering, and would collide with the keyboard highlight state.
 *
 * ETP-5846 — the component's ONLY source of truth for "which option is the current selection" is
 * the `value` prop, so this marker can never drift from what the parent holds.
 *
 * @param {Array<{id?: string}>} rows the rendered option rows
 * @param {string} value the committed id
 * @returns {number} index of the current option, or -1
 */
export function resolveSelectedIndex(rows, value) {
  if (!hasCommittedValue(value)) return -1;
  return rows.findIndex(o => String(o.id) === String(value));
}

/**
 * Rows resolved for the committed value but absent from the loaded pages, kept in front of the
 * list. Deduplicated by id so the pinned row can never render twice.
 */
export function prependCurrentSelection(rows, pinned, value) {
  if (pinned.length === 0 || resolveSelectedIndex(rows, value) !== -1) return rows;
  const known = new Set(rows.map(o => String(o.id)));
  const missing = pinned.filter(o => !known.has(String(o.id)));
  return missing.length === 0 ? rows : [...missing, ...rows];
}

/**
 * Keyboard highlight after an arrow key (ETP-5903). Nothing highlighted yet (`current` -1) means
 * the move starts from the committed row, so the first ArrowDown lands on the option AFTER the
 * current value, not on the second option of the list. With no committed row it starts from the
 * top, as before. Clamped to the list.
 *
 * @param {number} current the highlighted index, -1 for none
 * @param {number} selected the committed row's index, -1 for none
 * @param {number} delta +1 (down) or -1 (up)
 * @param {number} length number of rows
 */
export function nextActiveIndex(current, selected, delta, length) {
  const from = current >= 0 ? current : selected;
  return Math.max(0, Math.min(from + delta, length - 1));
}

/**
 * Where the arrow keys start (ETP-5903): from the committed row while no search is typed (AC2);
 * with a query the list is that search's results, navigated from the top (AC4).
 */
export function arrowStartIndexFor(query, selected) {
  return query.trim() === '' ? selected : -1;
}

/**
 * Whether a reopened selector should still load the next page looking for its committed value
 * (ETP-5903). It stops as soon as the value is on screen, the list ends, the page cap is reached,
 * or the user did something on their own (typed, pressed a key).
 */
export function shouldKeepLocating({ found, hasMore, loadedRows, pageSize, interacted }) {
  if (found || !hasMore || interacted) return false;
  return loadedRows < LOCATE_SELECTION_MAX_PAGES * pageSize;
}

/**
 * Scrolls `panel` so `option` sits in its vertical centre (ETP-5903). Done on the panel itself
 * rather than with `scrollIntoView`, which would also scroll every scrollable ancestor — the
 * selectors' panels are portalled, so that would move the page behind them.
 *
 * @returns {boolean} false when the panel could not scroll far enough (the option is among the
 *   last loaded rows), so the caller can centre again once the next page has landed.
 */
export function centerOptionInPanel(panel, option) {
  if (!panel || !option) return false;
  const panelRect = panel.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();
  const offsetInPanel = optionRect.top - panelRect.top + panel.scrollTop;
  const target = offsetInPanel - (panel.clientHeight - optionRect.height) / 2;
  panel.scrollTop = Math.max(0, target);
  return !(target > panel.scrollHeight - panel.clientHeight);
}
