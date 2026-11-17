/**
 * The committed-value logic shared by the paged selectors (InlineSearchCombo, CreatableSearchSelect,
 * SelectorInput). Pure: no React, no DOM except `centerOptionInPanel`.
 */

// ETP-5903 — how many pages (of the component's own page size) a reopened selector may load to
// find its committed value in place. Beyond that, the value is pinned on top instead (ETP-5846):
// a catalog of thousands (business partners, products) must not cost dozens of requests per open.
export const LOCATE_SELECTION_MAX_PAGES = 6;

// ETP-6103 — rows per request while a reopened selector looks for its committed value. One 100-row
// request costs about the same as a 30-row one (measured on production: ~500-700 ms flat), so the
// walk is two requests, not a dozen: the first page has this many rows, and if the value is not
// there the second asks for all the rest of the walk at once. Pickers that opt out of big pages
// (`largePages: false`, the product drawers) keep their own size and LOCATE_SELECTION_MAX_PAGES.
export const LOCATE_WALK_PAGE_SIZE = 100;

// ETP-6103 — total rows a big-page walk may load, which is also the server's selector cap
// (MAX_LIMIT in NeoSelectorService). A typical tenant's 650-account catalogue fits.
export const LOCATE_WALK_MAX_ROWS = 1000;

/**
 * Most rows a locate walk may load for a picker: LOCATE_WALK_MAX_ROWS with big pages, otherwise
 * LOCATE_SELECTION_MAX_PAGES x the picker's own page size.
 */
export function locateMaxRows(pageSize, largePages = true) {
  return largePages ? LOCATE_WALK_MAX_ROWS : LOCATE_SELECTION_MAX_PAGES * pageSize;
}

/**
 * Rows to request in the next page of the locate walk (ETP-6103): LOCATE_WALK_PAGE_SIZE for the
 * first page, then everything that is left of the walk total in one request; never below the
 * picker's own size.
 *
 * @param {number} pageSize the picker's own page size
 * @param {number} loadedRows rows fetched so far
 */
export function locatePageLimit(pageSize, loadedRows) {
  if (loadedRows <= 0) return Math.max(pageSize, LOCATE_WALK_PAGE_SIZE);
  return Math.max(pageSize, LOCATE_WALK_MAX_ROWS - loadedRows);
}

/**
 * Rows for a picker's FIRST page (ETP-6103): the larger walk size when the open has a committed
 * value and no typed search, so the walk needs fewer requests; the picker's own size otherwise.
 */
export function firstPageLimit(pageSize, value, query) {
  return hasCommittedValue(value) && String(query ?? '').trim() === '' ? locatePageLimit(pageSize, 0) : pageSize;
}

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
export function shouldKeepLocating({
  found, hasMore, loadedRows, pageSize, interacted, maxRows = LOCATE_SELECTION_MAX_PAGES * pageSize,
}) {
  if (found || !hasMore || interacted) return false;
  return loadedRows < maxRows;
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
  return target <= panel.scrollHeight - panel.clientHeight;
}

/**
 * The committed lookup item rebuilt from a saved row (ETP-5948): the reverse of the field's
 * declarative `onSelectMappings` (see `resolveOnSelectMappings` in DataTable.jsx). Each
 * `{ from, to }` mapping copied `item[from]` into `row[to]` on selection, so `row[to]` is written
 * back at the `from` path. Literal (`value`) mappings carry nothing from the item and are skipped.
 *
 * Structural: it names no entity and no selector key. A drawer reads whatever part of the item it
 * needs to recognise its own committed row (the stock drawer: the locator it mapped to the line).
 *
 * @param {{ onSelectMappings?: Array<{from?: string, to?: string, value?: unknown}> }} field
 * @param {object} row the saved row
 * @param {*} value the committed id
 * @returns {object|null} `{ id: value, ...mapped paths }`, or null without a committed value
 */
export function committedItemFromRow(field, row, value) {
  if (!hasCommittedValue(value)) return null;
  const item = { id: value };
  for (const m of field?.onSelectMappings ?? []) {
    if (!m?.from || !m.to || m.value !== undefined || row?.[m.to] == null) continue;
    const keys = m.from.split('.');
    let target = item;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {});
    target[keys.at(-1)] = row[m.to];
  }
  return item;
}

/** Most label segments a pin lookup tries after the full label (one request each, on a miss). */
const PIN_MAX_SEGMENTS = 3;

/**
 * ETP-5948 — search terms for pinning a committed value by its label: the label itself, then each
 * segment between ` - ` (the AD identifier separator). Selector search matches each identifier
 * column on its own, so a `"<code> - <name>"` label like an account's finds nothing as a whole,
 * while one of its parts does — not always the first (a tax reads `"21% - <name> - <category>"`
 * and only its name is searchable). Callers stop at the first term that returns the id.
 *
 * shortcut: segments past PIN_MAX_SEGMENTS are not tried; raise it if a longer identifier shows up.
 *
 * @param {string} label The committed value's display label.
 * @returns {string[]} Distinct, non-empty terms, in the order to try them.
 */
export function pinSearchTerms(label) {
  const full = String(label ?? '').trim();
  const segments = full.split(' - ').map((s) => s.trim()).slice(0, PIN_MAX_SEGMENTS);
  return [...new Set([full, ...segments])].filter(Boolean);
}

/**
 * ETP-6148 — the multi-select counterpart of {@link resolveSelectedIndex}: the ids of the rows
 * that are committed (already applied to the record — e.g. the dues already in a remittance), so
 * a reopened multi-select picker opens with exactly those rows checked and `aria-selected`.
 * The committed state comes from the caller's `isCommitted(row)` only, never from a draft.
 *
 * @param {object[]} rows the loaded rows
 * @param {(row: object) => boolean} isCommitted whether a row is committed
 * @param {(row: object) => string} getId the row's id
 * @returns {Set<string>} the committed ids, as strings
 */
export function committedIdSet(rows, isCommitted, getId) {
  const ids = new Set();
  for (const row of rows ?? []) {
    if (isCommitted(row)) ids.add(String(getId(row)));
  }
  return ids;
}
