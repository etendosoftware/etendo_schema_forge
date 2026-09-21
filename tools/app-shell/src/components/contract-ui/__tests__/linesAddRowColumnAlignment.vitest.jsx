/**
 * ETP-5245 — the add-row must reserve the SAME column widths as the header above it.
 *
 * An `inlineEditable` lines tab is painted by two different renderers that have to line
 * up pixel-for-pixel (see any generated `<Window>Table.jsx`):
 *   - `InlineLinesPanel` — a flex layout; owns the header strip and the saved rows.
 *   - a sibling `<DataTable hideHeader hideDataRows>` — an HTML table whose hidden
 *     `<colgroup>` replicates that flex layout; owns the "Add ..." row.
 *
 * The bug: `InlineLinesPanel` appends a dedicated 160px action slot whenever the LAST
 * visible column cannot double as the hover action strip, while `DataTable` decided the
 * same question with its own predicate ("is there ANY amount column?"). On Producto >
 * Costo (`cost` amount, `startingDate`, `endingDate`) the two disagreed: the panel
 * reserved the slot, the add-row table did not, so `growColumnWidth()` handed those
 * 160px to the two date columns (+80px each) — "Fecha de inicio" rendered ~80px too
 * wide and "Fecha de expiración" started ~80px right of its own header.
 *
 * Both renderers now answer through `reservesActionSlot()` / `resolveTrailingColumn()`
 * in `@/lib/linesActionSlot.js`.
 *
 * ETP-5332 — `growColumnWidth()` used to emit `calc((100% - Fpx) / N + Bpx)` for every
 * growing column and this suite read that expression back apart (`parseGrowWidth`).
 * Live measurement in Chrome proved the browser does NOT honour `calc()` per column
 * inside `table-layout: fixed` — it ignores the differing basis terms and splits the
 * leftover space equally, flattening Contacts' Persona tab (bases 224/224/320/224/224)
 * to an identical 243px for all five columns. `growColumnWidth()` now does that
 * arithmetic itself in JS and returns a LITERAL number: the column's own basis plus its
 * share of whatever is left over once the container has been measured, or just the bare
 * basis before measurement (first paint, or jsdom — which has no `ResizeObserver` at
 * all, so every test below exercises the pre-measurement branch). That also means a
 * fixed column and a grow column now emit the exact same style shape ("Npx"), so this
 * suite can no longer classify grow vs. fixed by parsing the width string: instead it
 * asks `columnFlex()` — the same lib both renderers already call — which columns grow,
 * and compares px totals instead of decoding an expression that no longer exists.
 *
 * These tests deliberately do NOT mock `@/lib/linesColumnWidth.js` (unlike the sibling
 * suites): the real per-type bases — amount 172px, date 130px, string 224px — are what
 * make the two layouts comparable at all. Under the usual uniform `'1 0 100px'` stub
 * every column looks alike and the misalignment is invisible.
 *
 * Harness/mocks follow linesDateField.vitest.jsx, which renders the same two components.
 */
import { render, screen } from '@testing-library/react';
import React, { createRef } from 'react';
import { DataTable, growColumnWidth, getTableContainerStyle } from '../DataTable.jsx';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import { columnFlex } from '@/lib/linesColumnWidth.js';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => 'en_US',
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row[`${key}$_identifier`] || row[key] || '',
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
}));

vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field }) => <span data-testid={`inline-combo-${field.key}`} />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));

// ── Column sets ───────────────────────────────────────────────────────────────
// The real Producto > Costo tab (artifacts/product/generated/web/product/CostingTable.jsx):
// the amount column is FIRST, so no column can hand its slot to the action strip.
const COSTING_COLUMNS = [
  { key: 'cost', column: 'Cost', type: 'amount', label: 'Cost', summable: false, required: true },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date', required: true },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
];

// Document lines: the amount IS last, so it doubles as the action strip and NO extra
// slot is reserved. This is the shape that already rendered correctly — it pins that
// the fix did not just "always reserve 160px".
const TRAILING_AMOUNT_COLUMNS = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'quantity', column: 'QtyOrdered', type: 'quantity', label: 'Quantity' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', label: 'Net Amount' },
];

// price-list > product prices: the last column IS an amount but opts out with
// `noTrailing`, so the panel reserves the slot. Same divergence, different trigger.
const NO_TRAILING_COLUMNS = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'listPrice', column: 'PriceList', type: 'amount', label: 'List Price', noTrailing: true },
];

// Producto > Contabilidad: no amount at all. Control case — both renderers already
// agreed here, before and after the fix.
const NO_AMOUNT_COLUMNS = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'string', label: 'Accounting Schema' },
  { key: 'costType', column: 'CostType', type: 'string', label: 'Cost Type' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string', label: 'Warehouse' },
];

const asAddFields = (columns) =>
  columns.map(({ key, column, type, label }) => ({ key, column, type, label }));

// ── Layout readers ────────────────────────────────────────────────────────────
// Read the inline style ATTRIBUTE rather than `el.style.*`: jsdom's CSS engine
// normalizes (and may drop) shorthand `flex` values, but the attribute is exactly the
// text React wrote.
function styleProp(el, prop) {
  const attr = el.getAttribute('style') || '';
  return new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(attr)?.[1]?.trim() ?? null;
}

/**
 * The header strip's own width budget: total px locked by non-growing children
 * (checkbox, fixed-basis columns, the reserved action slot, the right spacer) plus the
 * basis of every growing column, in order.
 */
function readHeaderLayout() {
  const row = document.querySelector('[data-testid^="column-header-"]').parentElement;
  let fixedPx = 0;
  const growBases = [];
  for (const el of row.children) {
    const flex = styleProp(el, 'flex');
    if (flex) {
      const [grow, , basis] = flex.split(/\s+/);
      if (Number(grow) > 0) growBases.push(parseInt(basis, 10));
      else fixedPx += parseInt(basis, 10);
      continue;
    }
    const width = styleProp(el, 'width');
    if (width) fixedPx += parseInt(width, 10);
  }
  return { fixedPx, growBases };
}

/**
 * ETP-5332 — the add-row table's own width budget, re-expressed for literal-px
 * `<col>`s: `growColumnWidth()` no longer emits a `calc()` string to decode, so grow
 * and fixed `<col>`s render the exact same shape ("Npx"). Classify them the same way
 * `renderLinesColgroup()` itself does — via `columnFlex()`, the shared lib both
 * renderers call — instead of trying to infer it from the rendered width alone.
 *
 * `<colgroup>` order here (no `dimensionsPanel`/`headClass` columns in these fixtures):
 * [checkbox, ...visibleColumns in `columns` order, ...trailing action/spacer cols].
 */
function readAddRowLayout(container, columns) {
  const widths = Array.from(container.querySelectorAll('colgroup col')).map((col) => {
    const width = styleProp(col, 'width');
    return width == null ? null : parseInt(width, 10);
  });

  const growFlags = columns.map((col, idx) => columnFlex(col, idx).trim().startsWith('1'));
  const visibleWidths = widths.slice(1, 1 + columns.length);
  const trailingWidths = widths.slice(1 + columns.length);

  const growBases = visibleWidths.filter((_, idx) => growFlags[idx]);
  const nonGrowVisibleWidths = visibleWidths.filter((_, idx) => !growFlags[idx]);

  const fixedPx = [widths[0], ...nonGrowVisibleWidths, ...trailingWidths].reduce(
    (sum, w) => sum + w,
    0,
  );

  return { fixedPx, growBases, allWidths: widths };
}

function renderHeader(columns) {
  return render(
    <InlineLinesPanel
      columns={columns}
      data={[]}
      entity="costing"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
    />,
  );
}

function renderAddRow(columns) {
  return render(
    <DataTable
      columns={columns}
      data={[]}
      entity="costing"
      specName="product"
      token="test"
      apiBaseUrl="/api"
      selectable
      hideHeader
      hideDataRows
      linesLayout="inlineEditable"
      addRow={{
        ref: createRef(),
        active: true,
        fields: asAddFields(columns),
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        catalogs: {},
      }}
    />,
  );
}

/** Renders both renderers for the same columns and returns their width budgets. */
function layoutsFor(columns) {
  const header = renderHeader(columns);
  const headerLayout = readHeaderLayout();
  header.unmount();

  const addRow = renderAddRow(columns);
  const addRowLayout = readAddRowLayout(addRow.container, columns);
  return { headerLayout, addRowLayout, addRow };
}

describe.each([
  ['Producto > Costo — amount column first', COSTING_COLUMNS],
  ['document lines — amount column last', TRAILING_AMOUNT_COLUMNS],
  ['price-list — last amount opts out with noTrailing', NO_TRAILING_COLUMNS],
  ['Producto > Contabilidad — no amount column', NO_AMOUNT_COLUMNS],
])('add-row column widths match the header (%s)', (_name, columns) => {
  it('locks the same total of fixed px as the header strip', () => {
    const { headerLayout, addRowLayout } = layoutsFor(columns);
    // What the add-row's non-growing <col>s reserve MUST equal what the header actually
    // reserves — this single number is the misalignment: every px missing here is
    // silently split among the grow columns, pushing later columns to the right.
    expect(addRowLayout.fixedPx).toBe(headerLayout.fixedPx);
  });

  it('grows the same columns from the same bases as the header strip', () => {
    const { headerLayout, addRowLayout } = layoutsFor(columns);
    expect(addRowLayout.growBases).toEqual(headerLayout.growBases);
  });

  it('declares only literal, finite <col> px widths — no calc() left to decode (ETP-5332)', () => {
    const { addRowLayout } = layoutsFor(columns);
    for (const w of addRowLayout.allWidths) {
      expect(Number.isFinite(w)).toBe(true);
    }
  });

  it('backs every <col> with a real add-row <td>', () => {
    // ETP-4735's lesson: a <colgroup><col> with no matching cell in the row reserves no
    // width at all in a real table, so the two counts must agree.
    const { addRow } = layoutsFor(columns);
    const cols = addRow.container.querySelectorAll('colgroup col').length;
    const cells = screen.getByTestId('inline-add-row').querySelectorAll('td').length;
    expect(cells).toBe(cols);
  });
});

describe('the reserved action slot itself (ETP-5245)', () => {
  it('reserves 160px in the add-row whenever the header does — Producto > Costo', () => {
    const { headerLayout, addRowLayout } = layoutsFor(COSTING_COLUMNS);
    // checkbox 40 + amount basis 172 + action slot 160 + right spacer 48.
    expect(headerLayout.fixedPx).toBe(420);
    expect(addRowLayout.fixedPx).toBe(420);
    // The two date columns keep their own 130px basis and split what is left.
    expect(addRowLayout.growBases).toEqual([130, 130]);
  });

  it('reserves NO extra slot when the trailing amount column doubles as the strip', () => {
    const { headerLayout, addRowLayout } = layoutsFor(TRAILING_AMOUNT_COLUMNS);
    // checkbox 40 + quantity 152 + amount 172 + right spacer 48 — no 160px slot.
    expect(headerLayout.fixedPx).toBe(412);
    expect(addRowLayout.fixedPx).toBe(412);
  });
});

// ── growColumnWidth() — direct unit coverage (ETP-5332) ──────────────────────────
// jsdom has no ResizeObserver, so nothing above ever exercises the post-measurement
// branch (the actual arithmetic that regressed in Chrome). Cover it directly here.
describe('growColumnWidth()', () => {
  it('pre-measurement (availableWidthPx = 0) returns the bare basis, never narrower than the header', () => {
    expect(growColumnWidth(224, 992, 3)).toBe(224);
    expect(growColumnWidth(130, 420, 2, 260, 0)).toBe(130);
  });

  it('with surplus, splits the leftover evenly on top of each basis, and the total lands exactly on the available width', () => {
    const basisPx = 130;
    const fixedTotalPx = 420;
    const growCount = 2;
    const growBasisTotalPx = 260; // 2 * 130
    const availableWidthPx = 900;

    const width = growColumnWidth(basisPx, fixedTotalPx, growCount, growBasisTotalPx, availableWidthPx);
    const expectedLeftoverPerColumn = (availableWidthPx - fixedTotalPx - growBasisTotalPx) / growCount;

    expect(width).toBe(basisPx + expectedLeftoverPerColumn);
    // The property that actually makes this "correct": fixed budget + every grow
    // column's resolved width must sum exactly to what the container measured.
    expect(fixedTotalPx + growCount * width).toBe(availableWidthPx);
  });

  it('keeps columns with different bases at different widths — the Persona regression (bases 224/224/320/224/224)', () => {
    // This is the exact case that broke in Chrome: `calc()` per column was ignored and
    // every column rendered at an identical 243px regardless of its own basis.
    const bases = [224, 224, 320, 224, 224];
    const growCount = bases.length;
    const growBasisTotalPx = bases.reduce((sum, b) => sum + b, 0);
    const fixedTotalPx = 40; // checkbox only
    const availableWidthPx = 1600; // comfortably fits

    const widths = bases.map((basisPx) =>
      growColumnWidth(basisPx, fixedTotalPx, growCount, growBasisTotalPx, availableWidthPx),
    );

    expect(new Set(widths).size).toBeGreaterThan(1);
    expect(widths[0]).toBe(widths[1]); // same basis -> same resolved width
    expect(widths[2]).toBeGreaterThan(widths[0]); // wider basis (320) stays the widest
  });

  it('clamps leftover at 0 under a deficit — columns keep their basis and overflow instead of shrinking', () => {
    // Cuenta Bancaria-shaped deficit: the row demands ~1968px of real content in a
    // ~1134px container.
    const basisPx = 224;
    const growCount = 5;
    const growBasisTotalPx = basisPx * growCount; // 1120
    const fixedTotalPx = 848; // total demand: 848 + 1120 = 1968
    const availableWidthPx = 1134;

    const widths = Array.from({ length: growCount }, () =>
      growColumnWidth(basisPx, fixedTotalPx, growCount, growBasisTotalPx, availableWidthPx),
    );

    for (const w of widths) {
      expect(w).toBe(basisPx); // never squeezed below its own basis
    }
    // The row's real content demand still exceeds the container — that excess becomes
    // the wrapper's horizontal scroll (getTableContainerStyle's minWidth), not a squeeze.
    expect(fixedTotalPx + growCount * basisPx).toBeGreaterThan(availableWidthPx);
  });

  it('returns undefined when there are no growing columns', () => {
    expect(growColumnWidth(100, 500, 0)).toBeUndefined();
  });
});

describe('getTableContainerStyle()', () => {
  it('is byte-identical to the pre-ETP-5332 contract when called with no budget', () => {
    expect(getTableContainerStyle()).toEqual({ tableLayout: 'fixed', width: '100%' });
    expect(getTableContainerStyle()).not.toHaveProperty('minWidth');
  });

  it('adds minWidth when a px budget is declared, so a fixed-layout table cannot squeeze columns below their own colgroup demand', () => {
    expect(getTableContainerStyle(992)).toEqual({
      tableLayout: 'fixed',
      width: '100%',
      minWidth: 992,
    });
  });
});
