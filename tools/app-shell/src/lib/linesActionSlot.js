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
 * InlineLinesPanel only lets the LAST column double as the hover action strip,
 * and only when that column is an `amount` without `noTrailing` — the strip is
 * appended at the END of the flex row, so suppressing any other cell would
 * delete a slot from the middle and slide every following cell left. Whenever
 * that is not the case it appends a dedicated `ACTION_SLOT_WIDTH_PX` slot
 * instead, and DataTable's colgroup MUST reserve the identical slot (plus a
 * matching `<td>`: an unmatched `<col>` reserves no width in a real table).
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

/** Width, in px, of the action strip appended at the end of a lines row. */
export const ACTION_SLOT_WIDTH_PX = 160;

/**
 * The column whose cell is swapped for the hover action strip, or `null` when
 * the row must reserve a dedicated slot instead.
 *
 * @param {Array<{type?: string, noTrailing?: boolean}>} visibleColumns Grid columns, in render order.
 * @returns {object|null} The trailing column, or null.
 */
export function resolveTrailingColumn(visibleColumns) {
  const cols = visibleColumns ?? [];
  const last = cols[cols.length - 1];
  if (!last || last.type !== 'amount' || last.noTrailing) return null;
  return last;
}

/**
 * True when the row must append a dedicated `ACTION_SLOT_WIDTH_PX` slot because
 * no column can be swapped for the action strip. Both lines renderers MUST use
 * this same answer for the same column list.
 *
 * @param {Array<object>} visibleColumns Grid columns, in render order.
 * @returns {boolean}
 */
export function reservesActionSlot(visibleColumns) {
  return resolveTrailingColumn(visibleColumns) === null;
}
