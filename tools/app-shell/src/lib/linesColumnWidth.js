/**
 * Column-width helpers shared between InlineLinesPanel (flex layout used while
 * displaying rows) and DataTable's inline-add row (HTML table layout used while
 * filling a new line). Keeping a single source of truth here means both
 * renderers compute the same widths and the header text wraps identically
 * regardless of which is mounted.
 */

// Fixed-basis column types share one baseline per type (grow flag only affects
// the flex-grow term, not the basis). Kept as a lookup — rather than a chain of
// `if` statements — to stay under the cognitive-complexity budget as the type
// list grows; see `columnFlex`/`columnMinWidthPx` below for how each side of
// the shared basis is derived.
const FIXED_BASIS_PX = {
  amount: 172,
  price: 152,
  quantity: 152,
  integer: 152,
  decimal: 152,
  percent: 152,
  signedDelta: 152,
};

// Enum/select columns share the string baseline (224px). Their values include
// the Select's chevron, so long options like "Use Generic Account No." need at
// least as much room as a plain text input of the same length — settling for
// the narrower selector tier (192px) clipped the trailing word inside the
// trigger. `1 1` keeps the column elastic on top.
const ELASTIC_BASIS_PX = {
  string: 224,
  text: 224,
  enum: 224,
  select: 224,
  date: 130,
  // ETP-4610 — the `dimensionsPanel` type used to reserve 320px here (badges +
  // "+N"/"Add dimensions" trigger). It no longer renders as a grid column at all
  // (InlineLinesPanel filters it out of `visibleColumns` before any width lookup
  // happens — see `hasDimensionsPanel` there), so no basis entry is needed.
};

const SELECTOR_TYPES = new Set(['selector', 'search', 'foreignKey']);

// Column types that never render as a fixed grid column in EITHER lines
// renderer — InlineLinesPanel (flex layout, saved rows) or DataTable's
// inline-add row (HTML table layout, hideHeader mode). `dimensionsPanel`
// (ETP-4610) is the only member today: its fields render via a hover
// action + expand sub-row instead of a header cell/basis. Both renderers
// MUST filter their `visibleColumns` through this same predicate — see
// ETP-4803, where DataTable diverged and kept `dimensionsPanel` in its
// hidden add-row `<colgroup>`, throwing off `growColumnWidth()` for every
// column after it.
const NON_GRID_COLUMN_TYPES = new Set(['dimensionsPanel']);

/**
 * True if `col` should participate in the shared grid layout (colgroup /
 * flex row) computed by both InlineLinesPanel and DataTable. False for
 * column types that render out-of-band (e.g. `dimensionsPanel`).
 */
export function isLineGridColumn(col) {
  return !NON_GRID_COLUMN_TYPES.has(col.type);
}

function selectorFlex(col, idx) {
  const grow = col.grow !== undefined ? col.grow : idx === 0;
  return grow ? '1 1 192px' : '0 0 192px';
}

/**
 * Returns the CSS `flex` shorthand for a lines-table column.
 * Used by InlineLinesPanel's flex column layout.
 */
export function columnFlex(col, idx) {
  if (col.minWidth) return `1 1 ${col.minWidth}px`;
  if (SELECTOR_TYPES.has(col.type)) return selectorFlex(col, idx);
  const elasticPx = ELASTIC_BASIS_PX[col.type];
  if (elasticPx !== undefined) return `1 1 ${elasticPx}px`;
  const g = col.grow ? '1' : '0';
  const fixedPx = FIXED_BASIS_PX[col.type];
  return `${g} 0 ${fixedPx !== undefined ? fixedPx : 120}px`;
}

/**
 * Returns just the basis (preferred width) in pixels for a column. Used by
 * DataTable's HTML table layout to set `minWidth` on TableHead/TableCell so
 * the auto-layout can't shrink columns below the flex baseline used in the
 * display table — keeping header wrapping consistent across both modes.
 */
export function columnMinWidthPx(col) {
  if (col.minWidth) return col.minWidth;
  if (SELECTOR_TYPES.has(col.type)) return 192;
  return ELASTIC_BASIS_PX[col.type] ?? FIXED_BASIS_PX[col.type] ?? 120;
}
