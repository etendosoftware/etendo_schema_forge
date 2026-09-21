/**
 * Column-width helpers shared between InlineLinesPanel (flex layout used while
 * displaying rows) and DataTable's inline-add row (HTML table layout used while
 * filling a new line). Keeping a single source of truth here means both
 * renderers compute the same widths and the header text wraps identically
 * regardless of which is mounted.
 */

import { isPostedStatusColumn } from './postedStatus.js';

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

// The Posted-status column (`postedStatus.js`) is a `boolean`+`badge` column
// too, but its pill can also show one of 15 non-Y/N reason codes instead of
// the plain true/false label — up to "Sin pedido de compra relacionado" (33
// chars, the longest across en_US/es_ES/es_AR), far past what 152px holds.
// Without this wider basis the pill gets clipped by the cell's own `overflow:
// hidden` mid-word (e.g. "Sin pedido de compra" — the trailing "relacionado"
// silently disappears). Scoped to this one column, not a general bump to
// BOOLEAN_BADGE_BASIS_PX, since every other boolean-badge column in the app
// only ever shows the short true/false pair.
const POSTED_STATUS_BADGE_BASIS_PX = 240;

function booleanBadgeBasisPx(col) {
  return isPostedStatusColumn(col.column) ? POSTED_STATUS_BADGE_BASIS_PX : BOOLEAN_BADGE_BASIS_PX;
}

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
  // ETP-5332 — closes the gap ETP-5133's own review (linesColumnWidth.test.js's
  // "KNOWN GAP" case) flagged and left unfixed because no window declared `col.minWidth`
  // yet: `1 1` (shrinkable) let THIS one column collapse toward zero at a narrow
  // viewport while every other branch below is `shrink: 0`, so it alone absorbed all the
  // missing space — and with no `overflow: hidden` on the cell, its text visually bled
  // into the next column instead of the row triggering horizontal scroll like it does for
  // every other column type. `contacts/ContactTable.jsx`'s Email (`minWidth: 320`) inside
  // the narrower create-contact popup is the "future window" that reintroduced it.
  // `1 0` matches every other branch: minWidth still WINS as the basis (ETP-5210's
  // override contract is unchanged), it just can no longer shrink below it.
  if (col.minWidth) return `1 0 ${col.minWidth}px`;
  if (col.type === 'boolean' && col.badge) return `0 0 ${booleanBadgeBasisPx(col)}px`;
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
  if (col.type === 'boolean' && col.badge) return booleanBadgeBasisPx(col);
  if (SELECTOR_TYPES.has(col.type)) return 192;
  return ELASTIC_BASIS_PX[col.type] ?? FIXED_BASIS_PX[col.type] ?? 120;
}
