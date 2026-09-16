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
 * These tests deliberately do NOT mock `@/lib/linesColumnWidth.js` (unlike the sibling
 * suites): the real per-type bases — amount 172px, date 130px, string 224px — are what
 * make the two layouts comparable at all. Under the usual uniform `'1 0 100px'` stub
 * every column looks alike and the misalignment is invisible.
 *
 * Harness/mocks follow linesDateField.vitest.jsx, which renders the same two components.
 */
import { render, screen } from '@testing-library/react';
import React, { createRef } from 'react';
import { DataTable } from '../DataTable.jsx';
import InlineLinesPanel from '../InlineLinesPanel.jsx';

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
// normalizes (and may drop) shorthand `flex` and `calc()` values, but the attribute is
// exactly the text React wrote.
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
 * The same budget as the add-row table declares it: literal-px `<col>`s, plus the
 * `calc((100% - Fpx) / N + Bpx)` expression `growColumnWidth()` emits for grow columns
 * (F = every fixed px the table believes is spoken for, N = number of grow columns).
 */
function readAddRowLayout(container) {
  let fixedPx = 0;
  const growBases = [];
  let calcFixedPx = null;
  let calcGrowCount = null;
  for (const col of container.querySelectorAll('colgroup col')) {
    const width = styleProp(col, 'width') ?? '';
    if (!width.startsWith('calc(')) {
      fixedPx += parseInt(width, 10);
      continue;
    }
    const parsed = parseGrowWidth(width);
    calcFixedPx = parsed.fixedPx;
    calcGrowCount = parsed.growCount;
    growBases.push(parsed.basisPx);
  }
  return { fixedPx, growBases, calcFixedPx, calcGrowCount };
}

/**
 * Reads back `growColumnWidth()`'s `calc((100% - Fpx) / N + Bpx)`. jsdom's CSS
 * serializer rewrites it — `calc(Bpx + 0.5 * (100% - Fpx))` for N=2 — so match the
 * three quantities wherever they landed instead of the literal source shape.
 */
function parseGrowWidth(width) {
  const fixedPx = Number(/100%\s*-\s*(\d+)px/.exec(width)[1]);
  const rest = width.replace(/\(?100%\s*-\s*\d+px\)?/, '');
  const basisPx = Number(/(\d+)px/.exec(rest)[1]);
  const fraction = /([\d.]+)\s*\*/.exec(rest);
  const divisor = /\/\s*([\d.]+)/.exec(rest);
  const growCount = fraction ? Math.round(1 / Number(fraction[1])) : Number(divisor[1]);
  return { fixedPx, basisPx, growCount };
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
  const addRowLayout = readAddRowLayout(addRow.container);
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
    // What the grow columns are told is already spoken for MUST equal what the header
    // actually reserves — this single number is the misalignment: every px missing here
    // is silently split among the grow columns, pushing later columns to the right.
    expect(addRowLayout.calcFixedPx).toBe(headerLayout.fixedPx);
  });

  it('grows the same columns from the same bases as the header strip', () => {
    const { headerLayout, addRowLayout } = layoutsFor(columns);
    expect(addRowLayout.growBases).toEqual(headerLayout.growBases);
    expect(addRowLayout.calcGrowCount).toBe(headerLayout.growBases.length);
  });

  it('declares literal <col> px that add up to the total its own calc() assumes', () => {
    const { addRowLayout } = layoutsFor(columns);
    expect(addRowLayout.fixedPx).toBe(addRowLayout.calcFixedPx);
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
    expect(addRowLayout.calcFixedPx).toBe(420);
    // The two date columns keep their own 130px basis and split what is left.
    expect(addRowLayout.growBases).toEqual([130, 130]);
  });

  it('reserves NO extra slot when the trailing amount column doubles as the strip', () => {
    const { headerLayout, addRowLayout } = layoutsFor(TRAILING_AMOUNT_COLUMNS);
    // checkbox 40 + quantity 152 + amount 172 + right spacer 48 — no 160px slot.
    expect(headerLayout.fixedPx).toBe(412);
    expect(addRowLayout.calcFixedPx).toBe(412);
  });
});
