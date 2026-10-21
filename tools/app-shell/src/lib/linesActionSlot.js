/**
 * Single source of truth for the TRAILING ACTION SLOT of a lines table.
 *
 * A lines tab is painted by two different renderers that must line up
 * pixel-for-pixel:
 *   - `InlineLinesPanel` — a flex layout, owns the header + the saved rows.
 *   - `DataTable` in `hideHeader`/`hideDataRows` mode — an HTML `<table>` whose
 *     hidden `<colgroup>` replicates that flex layout, owns the add-row form
 *     mounted underneath (see `renderLinesColgroup` in DataTable.jsx).
 *
 * InlineLinesPanel appends a dedicated `ACTION_SLOT_WIDTH_PX` slot at the END
 * of the flex row for the hover action strip, and DataTable's colgroup MUST
 * reserve the identical slot (plus a matching `<td>`: an unmatched `<col>`
 * reserves no width in a real table). Since ETP-5600 an editable table always
 * reserves it; only a read-only one lets a trailing `amount` (without
 * `noTrailing`) take its place — see `resolveTrailingColumn`.
 *
 * ETP-5245 — DataTable used to answer this with its own predicate ("is there
 * ANY amount column?"). That agreed with InlineLinesPanel only while the panel
 * scanned backwards for the last amount column anywhere in the row; once the
 * panel was narrowed to the last column only, every tab whose amount is NOT
 * last (Producto > Costo: `cost`, `startingDate`, `endingDate`) lost the 160px
 * reservation on the add-row side, so `growColumnWidth()` handed that width to
 * the grow columns and the add-row inputs drifted right of their headers. The
 * `noTrailing` variant of the same divergence (price-list > product prices)
 * predates it.
 *
 * Deliberately its own module rather than another export of
 * `linesColumnWidth.js`: that module is `vi.mock`ed with a partial factory by
 * ~15 test files, and a predicate that the two renderers may answer
 * DIFFERENTLY under a stub is exactly the bug this file exists to prevent.
 */

/**
 * Width, in px, of the action strip appended at the end of a lines row. ETP-5600 —
 * the Figma "Sticky Acciones" band: four 32px buttons, 2px apart, padding 0 12px
 * (4 x 32 + 3 x 2 + 24 = 158), the most a line shows (Add dimensions + a caller
 * action + Edit + Delete). It was 160 before, 2px of slack with no design source.
 */
export const ACTION_SLOT_WIDTH_PX = 158;

/**
 * The trailing column that absorbs the action slot, or `null` when the row must
 * reserve a dedicated `ACTION_SLOT_WIDTH_PX` slot instead.
 *
 * ETP-5600 (QA pass 2) — an EDITABLE (draft) lines table always reserves the
 * slot: the hover strip is pinned to the visible right edge of the horizontal
 * scroll box (`LINE_STICKY_ACTIONS_SLOT`), so it needs room of its own past the
 * last column — swapping the trailing amount for the strip hid that amount on
 * hover and, scrolled to the end, read as the buttons overlapping it. Only a
 * READ-ONLY table, which never shows the strip, keeps the former rule (a
 * trailing `amount` without `noTrailing` takes the slot's place), so completed
 * documents keep their exact layout.
 *
 * @param {Array<{type?: string, noTrailing?: boolean}>} visibleColumns Grid columns, in render order.
 * @param {{editable?: boolean}} [options] `editable` defaults to `true`: the
 *   add-row renderer only ever mounts on an editable table.
 * @returns {object|null} The trailing column, or null.
 */
export function resolveTrailingColumn(visibleColumns, { editable = true } = {}) {
  if (editable) return null;
  const cols = visibleColumns ?? [];
  const last = cols[cols.length - 1];
  if (!last || last.type !== 'amount' || last.noTrailing) return null;
  return last;
}

/**
 * True when the row must append a dedicated `ACTION_SLOT_WIDTH_PX` slot. Both
 * lines renderers MUST use this same answer for the same column list and
 * editability (see `resolveTrailingColumn`).
 *
 * @param {Array<object>} visibleColumns Grid columns, in render order.
 * @param {{editable?: boolean}} [options] See `resolveTrailingColumn`.
 * @returns {boolean}
 */
export function reservesActionSlot(visibleColumns, options) {
  return resolveTrailingColumn(visibleColumns, options) === null;
}
