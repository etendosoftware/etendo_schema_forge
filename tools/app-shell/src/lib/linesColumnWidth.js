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

// A `boolean` column with `badge: true` renders a rounded pill (see `Tag`,
// DataTable.cellRenderers.jsx), not a plain "Sí"/"No" string — the generic
// 120px fallback below fits the latter but clips the former: "Sin
// contabilizar" (the widest badge label in the codebase today) alone
// measures ~103px, and the cell's own horizontal padding (24px) pushes the
// total past 120px. The overflow gets cut by the cell's `overflow: hidden`,
// slicing through the pill's rounded end — which reads as a stray dot/period
// next to the label, not as a truncated pill (ETP-5268 follow-up). Reuses
// the existing 152px tier (see FIXED_BASIS_PX) rather than inventing a new
// one, leaving comfortable slack for longer locales.
const BOOLEAN_BADGE_BASIS_PX = 152;

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
 * column types that render out-of-band (e.g. `dimensionsPanel`), and false
 * for any column explicitly marked `filterOnly: true`.
 *
 * ETP-5188 — `filterOnly` is a generic, type-independent escape hatch for a
 * column that exists ONLY to appear in the advanced-filter field list (it
 * still flows through `DataTable`'s raw `columns` prop into `onColumnsReady`
 * → `ListView`'s `filterColumns`) and must never render as an actual grid
 * cell/header — e.g. a synthetic field with no backing AD column, whose
 * condition is intercepted before it reaches the generic criteria builder
 * (see `UserHeaderTable.jsx`'s `roleFilterColumn` / `toQueryParams`, and
 * `ListView.jsx`'s `extractQueryParamConditions`). Unlike
 * `NON_GRID_COLUMN_TYPES`, this is not tied to a specific `type` — any
 * column type can opt out of rendering this way without hijacking an
 * unrelated type's semantics.
 */
export function isLineGridColumn(col) {
  return col.filterOnly !== true && !NON_GRID_COLUMN_TYPES.has(col.type);
}

function selectorFlex(col, idx) {
  const grow = col.grow !== undefined ? col.grow : idx === 0;
  return grow ? '1 0 192px' : '0 0 192px';
}

/**
 * Returns the CSS `flex` shorthand for a lines-table column.
 * Used by InlineLinesPanel's flex column layout.
 */
export function columnFlex(col, idx) {
  if (col.minWidth) return `1 1 ${col.minWidth}px`;
  if (col.type === 'boolean' && col.badge) return `0 0 ${BOOLEAN_BADGE_BASIS_PX}px`;
  if (SELECTOR_TYPES.has(col.type)) return selectorFlex(col, idx);
  const elasticPx = ELASTIC_BASIS_PX[col.type];
  if (elasticPx !== undefined) return `1 0 ${elasticPx}px`;
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
  if (col.type === 'boolean' && col.badge) return BOOLEAN_BADGE_BASIS_PX;
  if (SELECTOR_TYPES.has(col.type)) return 192;
  return ELASTIC_BASIS_PX[col.type] ?? FIXED_BASIS_PX[col.type] ?? 120;
}
