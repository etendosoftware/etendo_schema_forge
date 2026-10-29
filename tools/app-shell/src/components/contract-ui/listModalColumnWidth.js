// Fixed column widths of the list-modal grid (decisions `columnWidth` / `columnMaxWidth`, emitted
// as `minWidth` / `maxWidth`). Plain module, no React.

// Horizontal padding of a list-modal grid cell: `px-3` on both sides, in every density.
export const CELL_PADDING_X = 24;

/**
 * Inline style of a header / body cell: the cell FRAME (border-box under Tailwind's preflight,
 * padding included) starts at `minWidth`. No width declared → undefined, the browser sizes it.
 *
 * @param {{ minWidth?: number }} col
 */
export function columnWidthStyle(col) {
  if (col.minWidth == null) return undefined;
  return { width: col.minWidth, minWidth: col.minWidth };
}

/**
 * The cap for the cell CONTENT, so the cell frame never grows past `maxWidth`.
 *
 * A browser ignores `max-width` on a `<td>` of an auto-layout table, so the cap lives on a wrapper
 * inside the cell — which sits inside the cell's padding. Without subtracting it, `minWidth` and
 * `maxWidth` meant different boxes: a column declared 164 / max 240 grew to 264 (QA BUG-2).
 *
 * @param {{ maxWidth?: number }} col
 * @returns {number|null} px, or null when the column declares no cap
 */
export function cellContentMaxWidth(col) {
  if (col.maxWidth == null) return null;
  return Math.max(col.maxWidth - CELL_PADDING_X, 0);
}
