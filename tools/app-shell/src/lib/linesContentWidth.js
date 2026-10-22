/**
 * ETP-5133 (QA pass 3, F-2) — the no-truncate policy of a lines-grid column, and the width such a
 * column needs so its widest value is shown in FULL.
 *
 * Most lines-grid columns ellipsize with a hover tooltip. A no-truncate column (the product)
 * shows its whole value instead: the column widens to its widest value and any overflow of the
 * row is absorbed by the grid's own horizontal scroll (InlineLinesPanel's `bodyScrollRef`), never
 * by a scrollbar inside the cell.
 *
 * Why a width computed from the data, not `min-width: max-content` on the cell: every line, the
 * header strip, the totals row and the add-row `<table>` (DataTable, a sibling component) are
 * separate layout boxes that only line up because they all read the same width from `columnFlex`.
 * A cell sized by its own content would make each line as wide as ITS product and push every
 * following column out of line with the header. Feeding the widest value into `columnFlex` (via
 * `contentWidthPx`) keeps one width source for all of them. Both components derive their columns
 * from the same `columns` + `data` props (the generated `LinesTable.jsx` mounts them as siblings
 * with the same props), so they compute the same width.
 */

import { measureTextPx } from './linesColumnWidth.js';
import { resolveIdentifier } from './resolveIdentifier.js';

// Lines-grid cell typography — keep in sync with `buildLineCellStyle` / `TOKENS` in
// InlineLinesPanel.jsx (400 weight, 14px, Inter).
const CELL_FONT = '400 14px Inter, system-ui, sans-serif';
// Per-character estimate where no canvas can measure (jsdom, node): the upper end of Inter 400 at
// 14px, so the estimate errs wide, never narrow.
const CELL_FALLBACK_CHAR_PX = 8;
// Horizontal chrome around the text, sized for the WIDER of the two cell modes so the column does
// not change width when a line enters edit mode:
//  - read mode: the cell's `cellPaddingX` on both sides = 24px;
//  - edit mode (LookupTrigger): cell padding 3 + 3, button border 1 + 1, button `px-2` 8 + 8,
//    search icon 14, `gap-2` 8 = 46px.
// Plus 2px of rounding slack between the measured text and the laid-out glyphs.
export const NO_TRUNCATE_CELL_CHROME_PX = 48;

/**
 * Whether a lines-grid column shows its full value instead of ellipsizing it. An explicit
 * `noTruncate` (true or false) always wins; otherwise a lookup selector (`type: 'selector'`,
 * `lookup: true` — the popup-search selector the product is generated as) defaults to no-truncate.
 * The rule is structural: it never names an entity or a column.
 */
export function isNoTruncateColumn(col) {
  if (!col) return false;
  return col.noTruncate ?? (col.type === 'selector' && col.lookup === true);
}

/**
 * Width in px (chrome included) the widest value of `col` across `rows` needs, or 0 when there is
 * nothing to measure. Values are resolved exactly as the cell renders them (`resolveIdentifier`).
 */
export function contentWidthPx(col, rows) {
  let widest = 0;
  for (const row of rows ?? []) {
    const textPx = measureTextPx(resolveIdentifier(row, col.key), CELL_FONT, CELL_FALLBACK_CHAR_PX);
    if (textPx > widest) widest = textPx;
  }
  return widest > 0 ? widest + NO_TRUNCATE_CELL_CHROME_PX : 0;
}

/**
 * Returns `columns` with `contentWidthPx` set on every no-truncate column that has something to
 * measure (`columnFlex` raises the column's basis to it). Every other column is returned as-is,
 * and when no column changes the input array itself is returned.
 */
export function withContentWidths(columns, rows) {
  let changed = false;
  const next = columns.map((col) => {
    if (!isNoTruncateColumn(col)) return col;
    const px = contentWidthPx(col, rows);
    if (px === 0) return col;
    changed = true;
    return { ...col, contentWidthPx: px };
  });
  return changed ? next : columns;
}
