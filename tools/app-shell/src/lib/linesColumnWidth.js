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
//
// ETP-5833 — per-type default sizing AND expansion. Only DESCRIPTIVE columns (`string`/`text`,
// the leading selector) absorb leftover width when the grid has one (else the first unpinned column does, see `absorberIndex`); every other type is fixed (`0 0 <basis>`), so a
// date, a number or a status never stretches to the width of a description. Bases are constants
// per type, never measured from content, so sorting or paging cannot move a column. In a plain
// list the rendered header label also floors the column (`listHeaderMinWidthPx`), which depends
// on label + locale only.
//  - `date` (176): the value (dd/mm/yyyy ~80px + due-date dot) needs far less, but a LIST header
//    never wraps (`whitespace-nowrap` + ellipsis), so the basis is sized for the longest
//    representative translated header ("Fecha de presupuesto", ~129px) + 24px padding + the sort icon.
//    Measured in the browser at 130px the label was cut at 106px. A longer label is covered by the
//    list header floor (`listHeaderMinWidthPx`), not by raising this basis.
//  - `number` (152): the type the generator emits for every integer/decimal/quantity/price field
//    (`mapFieldType`); it used to fall to the generic 120px while `quantity` got 152.
//  - `status` (184): StatusTag pill ("Cobro depositado" is ~153px + padding, ETP-5510). Lines and
//    list share it, so the two renderers cannot disagree on a status column again.
//  - `enum`/`select` (224): the value plus the Select chevron; "Use Generic Account No." clipped
//    at 192px. Codes and states do not expand on top of that.
// A date WITH time has no tier on purpose: no list/lines column carries one (only the hidden
// `created`/`updated` audit fields, and the generator maps a visible datetime to `string`), and a
// `date` column renders date-only. Add its tier together with its renderer if one is ever exposed.
// `col.minWidth` (decisions `columnWidth`) and `col.grow` still override, see `columnFlex`.
const FIXED_BASIS_PX = {
  amount: 172,
  price: 152,
  quantity: 152,
  integer: 152,
  decimal: 152,
  number: 152,
  percent: 152,
  signedDelta: 152,
  date: 176,
  status: 184,
  enum: 224,
  select: 224,
};

// Percent columns render a compact ProgressCircle (~64px of content). The
// lines/add-row flex layout (`columnFlex`) keeps the 152px FIXED_BASIS_PX tier so
// InlineLinesPanel rows and DataTable's add-row colgroup stay aligned; only the
// plain-list HTML table (`columnMinWidthPx`, used exclusively by DataTable list
// mode) narrows to this basis. An explicit `col.minWidth` still wins.
const PERCENT_LIST_BASIS_PX = 104;

// ETP-5833 (QA) — plain-list-only amount basis, same split as PERCENT_LIST_BASIS_PX. The 172px
// FIXED_BASIS_PX tier is sized for an editable amount INPUT in a lines grid; a read-only list cell
// ("1.234.567,89 €", ~95px + 24px padding) needs far less, and the header label is protected by the
// header floor (`listHeaderMinWidthPx`), not by this basis. Lines (`columnFlex`) keep 172.
const AMOUNT_LIST_BASIS_PX = 130;

// Descriptive columns: the only types that absorb the leftover width of a lines grid.
const ELASTIC_BASIS_PX = {
  string: 224,
  text: 224,
  // ETP-4610 — the `dimensionsPanel` type used to reserve 320px here (badges +
  // "+N"/"Add dimensions" trigger). It no longer renders as a grid column at all
  // (InlineLinesPanel filters it out of `visibleColumns` before any width lookup
  // happens — see `hasDimensionsPanel` there), so no basis entry is needed.
};

// ETP-5510 — plain-list-only basis (`columnMinWidthPx`; the lines/add-row flex layout in
// `columnFlex` is untouched). `multiField`: the identity cell (media + bold title + chip)
// needs real room; at the generic 120px the title was unreadable. (`status`, the other ETP-5510
// type, moved to FIXED_BASIS_PX by ETP-5833 so lines and list share its 184px.)
const LIST_BASIS_PX = {
  multiField: 240,
};

// ETP-5510 — floor of the ONE width-less (`grow`) column. A <col> without a width gets
// "whatever is left" under `table-layout: fixed`, which is 0 when the other columns already
// fill the viewport (Products at 1280px). The floor is applied through the table's
// `min-width` (`listTableMinWidthPx`), so the list scrolls horizontally instead.
export const GROW_COLUMN_MIN_PX = 320;

const SELECTOR_TYPES = new Set(['selector', 'search', 'foreignKey']);

// ETP-5696 — a `display: 'tag'` column (the unit of measure of a document line) shows a short
// grey pill, not a selector-sized value, so it must NOT reserve the 192px selector tier: the
// space belongs to the product column. 144px holds the longest unit name ("Square Centimeter",
// 17 chars) plus the pill and cell padding. FIXED (`0 0`), never elastic, so it does not take
// a share of the leftover width either; an explicit `col.minWidth` (decisions `columnWidth`)
// still sets the basis, but does not make it grow.
const TAG_BASIS_PX = 144;

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
  const flex = typeColumnFlex(col, idx);
  // ETP-5133 (QA pass 3, F-2) — a no-truncate column (see `linesContentWidth.js`) carries the
  // width its widest value needs. It only ever RAISES the type basis (never shrinks it) and
  // keeps the grow/shrink terms, so the absorber choice and every fixed column are unchanged.
  // Header, body rows, new/edit row, totals row and the add-row colgroup all read their widths
  // from here, so they keep agreeing with each other.
  const contentPx = col.contentWidthPx;
  if (typeof contentPx !== 'number' || contentPx <= 0) return flex;
  const [grow, shrink, basis] = flex.split(' ');
  return contentPx > Number.parseFloat(basis) ? `${grow} ${shrink} ${Math.ceil(contentPx)}px` : flex;
}

function typeColumnFlex(col, idx) {
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
  if (col.display === 'tag') return `0 0 ${col.minWidth ?? TAG_BASIS_PX}px`;
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
  // `headerMinWidthPx` is set by DataTable on plain-list columns only (see listHeaderMinWidthPx);
  // the lines/add-row renderers never carry it, so their colgroup stays on the type basis.
  return Math.max(listTypeBasisPx(col), col.headerMinWidthPx ?? 0);
}

function listTypeBasisPx(col) {
  if (col.display === 'tag') return col.minWidth ?? TAG_BASIS_PX;
  if (col.minWidth) return col.minWidth;
  if (col.type === 'boolean' && col.badge) return booleanBadgeBasisPx(col);
  if (SELECTOR_TYPES.has(col.type)) return 192;
  if (col.type === 'percent') return PERCENT_LIST_BASIS_PX;
  if (col.type === 'amount') return AMOUNT_LIST_BASIS_PX;
  if (LIST_BASIS_PX[col.type] !== undefined) return LIST_BASIS_PX[col.type];
  return ELASTIC_BASIS_PX[col.type] ?? FIXED_BASIS_PX[col.type] ?? 120;
}

// ETP-5833 (QA) — a plain-list header never wraps (`whitespace-nowrap` + ellipsis), so a type
// basis alone truncated long translated labels. The list floor of a column is therefore
// max(type basis, rendered header width), where the header width is the RESOLVED label (the
// caller passes what the header actually shows — often only known at render time through
// useLabel/AD) plus the header chrome below. It depends on label + locale only, never on row
// data, so sorting or paging cannot move a column.
//  - 24px: the <th>'s `px-3`;
//  - 14px: the sort arrow ("▲", 12px at text-xs, plus `pl-0.5`), reserved even when the column
//    is not sorted, so clicking a header never changes its width;
//  - 4px: rounding slack between the measured text and the laid-out glyphs.
export const LIST_HEADER_CHROME_PX = 42;
// The ComputedFreshnessHint clock (h-3.5 = 14px) plus the label's `gap-1` (4px).
const COMPUTED_HINT_PX = 18;
// Deterministic estimate used where no canvas can measure (jsdom, node, a browser without
// OffscreenCanvas): ~7px per character is the upper end of Inter 600 at 12px ("Fecha de
// presupuesto" measures 128.6px / 20 chars = 6.4px), so the estimate errs wide, never narrow.
const FALLBACK_CHAR_PX = 7;
const HEADER_FONT_WEIGHT_SIZE = '600 12px';

const labelWidthCache = new Map();
const MEASURE_CACHE_MAX = 500;
let measureContext;

// `OffscreenCanvas` is feature-detected rather than a DOM <canvas>: jsdom implements <canvas>
// without a 2D context and reports "Not implemented" through its virtual console (no exception),
// whereas it has no OffscreenCanvas at all, so tests take the estimate silently.
function canvasContext() {
  if (measureContext !== undefined) return measureContext;
  measureContext = null;
  if (typeof OffscreenCanvas === 'undefined') return measureContext;
  try {
    measureContext = new OffscreenCanvas(1, 1).getContext('2d') ?? null;
  } catch {
    measureContext = null;
  }
  return measureContext;
}

/**
 * The CSS font of a list header label (`text-xs font-semibold` in the body font family). Reads
 * the computed style once per call — resolve it once per render pass and pass it to
 * `listHeaderMinWidthPx`, not once per column.
 */
export function listHeaderFont() {
  const family = (typeof document !== 'undefined' && document.body
    && globalThis.getComputedStyle?.(document.body)?.fontFamily) || 'Inter, sans-serif';
  return `${HEADER_FONT_WEIGHT_SIZE} ${family}`;
}

// True once the header font is really usable for measuring. While a web font is still swapping
// in (Inter, `display=swap`), canvas measures the FALLBACK face under the same family string, so
// such a width must not be cached: DataTable re-measures when `document.fonts.ready` resolves.
function fontReady(font) {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts?.check) return true;
  try {
    return fonts.check(font);
  } catch {
    return true;
  }
}

/**
 * Width in px of a header label rendered with the list header font (`text-xs font-semibold`).
 * Canvas `measureText` where an OffscreenCanvas 2D context exists; a deterministic per-character
 * estimate otherwise (jsdom tests, node) or when the canvas measures 0. Widths are cached per
 * font + label, but only once the font has loaded (see `fontReady`).
 */
export function measureHeaderLabelPx(label, font = listHeaderFont()) {
  return measureTextPx(label, font);
}

/**
 * Width in px of `value` rendered with the CSS `font` — the measurement behind
 * `measureHeaderLabelPx`, also used for cell text (ETP-5133, `linesContentWidth.js`). Same canvas
 * path, cache and font-loading rule; `fallbackCharPx` is the per-character estimate used where no
 * canvas can measure (pick the upper end for the font so the estimate errs wide). 0 for a
 * non-text value (a React node) or an empty string.
 */
export function measureTextPx(value, font, fallbackCharPx = FALLBACK_CHAR_PX) {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const text = String(value);
  if (text === '') return 0;
  const estimate = Math.ceil(text.length * fallbackCharPx);
  const ctx = canvasContext();
  if (!ctx) return estimate;
  const cacheKey = `${font}|${text}`;
  const cached = labelWidthCache.get(cacheKey);
  if (cached !== undefined) return cached;
  ctx.font = font;
  const measured = Math.ceil(ctx.measureText(text)?.width ?? 0);
  const width = measured > 0 ? measured : estimate;
  if (measured > 0 && fontReady(font)) {
    // ponytail: bounded cache — cell values (ETP-5133) are unbounded, unlike header labels; a
    // full reset is enough at this size (no LRU needed).
    if (labelWidthCache.size >= MEASURE_CACHE_MAX) labelWidthCache.clear();
    labelWidthCache.set(cacheKey, width);
  }
  return width;
}

/**
 * ETP-5833 (QA) — minimum width (px) a plain-list column needs so its header label is never
 * truncated: measured label + `LIST_HEADER_CHROME_PX` (+ the computed-freshness clock when it
 * renders). 0 when the header does not render on one line from a label: `headClass` pins its own
 * width, and a `headerWrap` header (default for `percent`) wraps onto two lines by design.
 * `label` is the label the header shows (see `resolveColumnLabel`); for a `multiField` column,
 * the joined part labels. `font` defaults to `listHeaderFont()`; pass it in when sizing many
 * columns at once.
 */
export function listHeaderMinWidthPx(col, label, font) {
  if (col.headClass) return 0;
  if (col.headerWrap ?? col.type === 'percent') return 0;
  const textPx = measureHeaderLabelPx(label, font);
  if (textPx === 0) return 0;
  const deferredComputed = col.computed?.mode === 'stored' && col.computed?.refresh !== 'synchronous';
  return textPx + LIST_HEADER_CHROME_PX + (deferredComputed ? COMPUTED_HINT_PX : 0);
}

/**
 * Test seam: drops the cached canvas context and label widths so a test can install (or remove)
 * an `OffscreenCanvas` / `document.fonts` double and measure again from scratch.
 */
export function resetHeaderMeasureCache() {
  labelWidthCache.clear();
  measureContext = undefined;
}

// ETP-5833 — the column that absorbs leftover width must be DESCRIPTIVE (string/text, a
// selector, a multiField), never a fixed date/number: a leading `date` (Sales Quotation) stretched
// to the 320px grow floor once dates became fixed. A `display: 'tag'` pill stays fixed. Falls back
// to the first unpinned column (`headClass`/`cellClass` pin their own width) when none qualifies.
//
// ETP-5833 (QA) — a document number or a search key is a short code, not a description: the Sales
// Invoice list made `DocumentNo` the 320px absorber because it precedes the business partner. Code
// columns are recognised STRUCTURALLY by their AD column (`col.column`), never by window: they are
// skipped while a non-code descriptive column exists, and only absorb when nothing else describes.
const CODE_AD_COLUMNS = new Set(['documentno', 'value']);

function isCodeColumn(col) {
  return typeof col.column === 'string' && CODE_AD_COLUMNS.has(col.column.toLowerCase());
}

function absorberIndex(columns) {
  const unpinned = c => !c.headClass && !c.cellClass;
  const descriptive = c => unpinned(c) && c.display !== 'tag'
    && (c.type in ELASTIC_BASIS_PX || SELECTOR_TYPES.has(c.type) || c.type === 'multiField');
  const idx = columns.findIndex(c => descriptive(c) && !isCodeColumn(c));
  if (idx !== -1) return idx;
  const codeIdx = columns.findIndex(descriptive);
  return codeIdx === -1 ? columns.findIndex(unpinned) : codeIdx;
}

/**
 * ETP-5510 — a plain list always needs exactly one width-less column to absorb the leftover
 * space; otherwise `table-layout: fixed` stretches EVERY <col> proportionally (the 40px
 * selection column became 65px in Warehouse, which declares no `grow` column). Returns the
 * columns unchanged when one already grows, otherwise marks the first column that does not
 * pin its own width (`headClass`/`cellClass`) as `grow`.
 */
export function withImplicitGrowColumn(columns) {
  if (columns.length === 0 || columns.some(c => c.grow)) return columns;
  const idx = absorberIndex(columns);
  if (idx === -1) return columns;
  return columns.map((c, i) => (i === idx ? { ...c, grow: true } : c));
}

/**
 * ETP-5510 — minimum table width (px) of a plain list: every sized column at its
 * `columnMinWidthPx`, the `grow` column at `GROW_COLUMN_MIN_PX` (at least its own basis),
 * plus the fixed slots (selection checkbox, row actions). Columns that pin their width with
 * `headClass` are not counted — their width lives in a class this helper cannot read.
 * Applied as `min-width` on the header AND body tables so columns never compress below
 * their floor: the scroll container scrolls instead.
 */
export function listTableMinWidthPx(columns, fixedSlotsPx = 0) {
  return columns.reduce((sum, col) => {
    if (col.headClass) return sum;
    const basis = columnMinWidthPx(col);
    return sum + (col.grow ? Math.max(basis, GROW_COLUMN_MIN_PX) : basis);
  }, fixedSlotsPx);
}

/**
 * ETP-5833 — lines-grid counterpart of `withImplicitGrowColumn`. With dates, numbers, statuses and
 * enum/select now fixed, a lines grid can end up with NO growing column (Product > Costo: amount +
 * two dates). `InlineLinesPanel` would then leave blank space on the right, and the add-row
 * `<table style="table-layout: fixed">`, whose `<col>`s would all be literal px, would spread the
 * surplus across every `<col>` and drift away from the header (ETP-5245). Both renderers run their
 * `visibleColumns` through this, so they keep agreeing on one absorber.
 */
export function withLinesAbsorberColumn(columns) {
  if (columns.length === 0) return columns;
  if (columns.some((c, i) => columnFlex(c, i).startsWith('1'))) return columns;
  const idx = absorberIndex(columns);
  if (idx === -1) return columns;
  return columns.map((c, i) => (i === idx ? { ...c, grow: true } : c));
}
