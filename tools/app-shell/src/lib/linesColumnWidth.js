/**
 * Column-width helpers shared between InlineLinesPanel (flex layout used while
 * displaying rows) and DataTable's inline-add row (HTML table layout used while
 * filling a new line). Keeping a single source of truth here means both
 * renderers compute the same widths and the header text wraps identically
 * regardless of which is mounted.
 */

/**
 * Returns the CSS `flex` shorthand for a lines-table column.
 * Used by InlineLinesPanel's flex column layout.
 */
export function columnFlex(col, idx) {
  const g = col.grow ? '1' : '0';
  if (col.minWidth) return `1 1 ${col.minWidth}px`;
  if (col.type === 'amount') return `${g} 0 172px`;
  if (col.type === 'price') return `${g} 0 152px`;
  if (col.type === 'quantity' || col.type === 'integer') return `${g} 0 152px`;
  if (col.type === 'decimal' || col.type === 'percent') return `${g} 0 152px`;
  if (col.type === 'string' || col.type === 'text') return '1 1 224px';
  if (col.type === 'selector' || col.type === 'search' || col.type === 'foreignKey') {
    const grow = col.grow !== undefined ? col.grow : (idx === 0);
    return grow ? '1 1 192px' : '0 0 192px';
  }
  // Enum/select columns share the string baseline (224px). Their values
  // include the Select's chevron, so long options like "Use Generic Account
  // No." need at least as much room as a plain text input of the same length
  // — settling for the narrower selector tier (192px) clipped the trailing
  // word inside the trigger. `1 1` keeps the column elastic on top.
  if (col.type === 'enum' || col.type === 'select') return '1 1 224px';
  if (col.type === 'date') return '1 1 130px';
  return `${g} 0 120px`;
}

/**
 * Returns just the basis (preferred width) in pixels for a column. Used by
 * DataTable's HTML table layout to set `minWidth` on TableHead/TableCell so
 * the auto-layout can't shrink columns below the flex baseline used in the
 * display table — keeping header wrapping consistent across both modes.
 */
export function columnMinWidthPx(col, idx) {
  if (col.minWidth) return col.minWidth;
  if (col.type === 'amount') return 172;
  if (col.type === 'price') return 152;
  if (col.type === 'quantity' || col.type === 'integer') return 152;
  if (col.type === 'decimal' || col.type === 'percent') return 152;
  if (col.type === 'string' || col.type === 'text') return 224;
  if (col.type === 'selector' || col.type === 'search' || col.type === 'foreignKey') return 192;
  if (col.type === 'enum' || col.type === 'select') return 224;
  if (col.type === 'date') return 130;
  return 120;
}
