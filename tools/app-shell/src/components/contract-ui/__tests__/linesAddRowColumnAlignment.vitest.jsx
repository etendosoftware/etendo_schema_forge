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
import { renderToStaticMarkup } from 'react-dom/server';
import React, { createRef } from 'react';
import { DataTable, growColumnWidth, getTableContainerStyle } from '../DataTable.jsx';
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
 * `calc((100% - Fpx) / N + Bpx)` expression `growColumnWidth()` emits for
 * grow columns when no live scroll host is measured (F = every fixed px the table
 * believes is spoken for, N = number of grow columns).
 *
 * ETP-5133 BUG-1 follow-up — this MUST read from server-rendered markup, not a
 * mounted `container`'s live DOM: jsdom's `cssstyle` cannot parse a `calc(...)`
 * value (it appears whenever `growColumnWidth()` falls back to its unmeasured
 * formula — see its own doc comment in DataTable.jsx) and silently drops the
 * ENTIRE `style` attribute rather than the single unparseable declaration —
 * verified live: `col.getAttribute('style')` comes back `null`, not merely
 * missing `width`. `renderToStaticMarkup` serializes the literal style text
 * React wrote without ever going through jsdom's CSSOM, so the calc()
 * expression survives intact.
 */
function readAddRowLayout(columns) {
  const html = renderToStaticMarkup(addRowElement(columns));
  const colgroupHtml = /<colgroup>([\s\S]*?)<\/colgroup>/.exec(html)?.[1] ?? '';
  const colTags = colgroupHtml.match(/<col\b[^>]*>/g) ?? [];
  let fixedPx = 0;
  const growBases = [];
  let calcFixedPx = null;
  let calcGrowCount = null;
  for (const tag of colTags) {
    const style = /style="([^"]*)"/.exec(tag)?.[1] ?? '';
    const width = /(?:^|;)\s*width:\s*([^;]+)/.exec(style)?.[1]?.trim() ?? '';
    // Fixed columns render a bare pixel value ('80px'); grow columns render a
    // `calc(...)` expression — so match on `calc(` anywhere rather than
    // anchoring at the start.
    if (!width.includes('calc(')) {
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
 * serializer rewrites a live-mounted calc() — `calc(Bpx + 0.5 * (100% - Fpx))`
 * for N=2 — so match the three quantities wherever they landed instead of the
 * literal source shape; that tolerance also means this same regex-based
 * reader keeps working when the text instead comes verbatim from
 * server-rendered markup (see `readAddRowLayout` above), since the literal
 * `calc(...)` string still contains all three of the same quantities the
 * regex below looks for.
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

// Shared between `renderAddRow` (live mount — used for DOM assertions that
// don't touch `<col>` widths, e.g. the `<td>` count) and `readAddRowLayout`
// (server-rendered markup — the only reliable way to read a `<col>` width
// that may contain `max(...)`, see its own doc comment).
function addRowElement(columns) {
  return (
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
    />
  );
}

function renderAddRow(columns) {
  return render(addRowElement(columns));
}

/** Renders both renderers for the same columns and returns their width budgets. */
function layoutsFor(columns) {
  const header = renderHeader(columns);
  const headerLayout = readHeaderLayout();
  header.unmount();

  const addRow = renderAddRow(columns);
  const addRowLayout = readAddRowLayout(columns);
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

// ── growColumnWidth() — direct unit coverage ─────────────────────────────────────
// Everything above only ever exercises the UNMEASURED branch (no live scroll host —
// jsdom has no ResizeObserver, see readAddRowLayout's own doc comment): it always gets
// back a calc() expression to decode. The MEASURED branch — the actual literal-pixel
// arithmetic added by ETP-5133's BUG-1 fix (pass 2, see growColumnWidth()'s own doc
// comment in DataTable.jsx) to reproduce flexbox's leftover-distribution against a real,
// live scroll host — is never reached by mounting DataTable standalone, so it is
// covered directly here with a synthetic `measured` object instead.
describe('growColumnWidth()', () => {
  it('without a measured host, returns the calc() expression restoring the column basis', () => {
    expect(growColumnWidth(224, 992, 3)).toBe('calc((100% - 992px) / 3 + 224px)');
    // A `measured` object whose hostWidthPx isn't finite yet (host not measured, or no
    // live scroll host at all) also falls back to the calc() branch instead of throwing.
    expect(growColumnWidth(130, 420, 2, { hostWidthPx: NaN, growBasisTotalPx: 260 }))
      .toBe('calc((100% - 420px) / 2 + 130px)');
  });

  it('with a measured host and surplus, splits the leftover evenly on top of each basis', () => {
    const basisPx = 130;
    const fixedTotalPx = 420;
    const growCount = 2;
    const growBasisTotalPx = 260; // 2 * 130
    const hostWidthPx = 900;

    const width = growColumnWidth(basisPx, fixedTotalPx, growCount, { hostWidthPx, growBasisTotalPx });
    const expectedLeftoverPerColumn = (hostWidthPx - fixedTotalPx - growBasisTotalPx) / growCount;

    expect(width).toBe(`${basisPx + expectedLeftoverPerColumn}px`);
    // The property that actually makes this "correct": fixed budget + every grow
    // column's resolved width must sum exactly to what the container measured.
    expect(fixedTotalPx + growCount * parseInt(width, 10)).toBe(hostWidthPx);
  });

  it('keeps columns with different bases at different widths — the Persona regression (bases 224/224/320/224/224)', () => {
    // This is the exact case that broke in Chrome: a per-column calc() was ignored and
    // every column rendered at an identical width regardless of its own basis. The
    // measured branch reproduces flexbox's own arithmetic in JS instead of relying on
    // the browser to resolve a percentage per <col>.
    const bases = [224, 224, 320, 224, 224];
    const growCount = bases.length;
    const growBasisTotalPx = bases.reduce((sum, b) => sum + b, 0);
    const fixedTotalPx = 40; // checkbox only
    const hostWidthPx = 1600; // comfortably fits

    const widths = bases.map((basisPx) =>
      growColumnWidth(basisPx, fixedTotalPx, growCount, { hostWidthPx, growBasisTotalPx }),
    );

    expect(new Set(widths).size).toBeGreaterThan(1);
    expect(widths[0]).toBe(widths[1]); // same basis -> same resolved width
    expect(parseInt(widths[2], 10)).toBeGreaterThan(parseInt(widths[0], 10)); // wider basis (320) stays widest
  });

  it('clamps leftover at 0 under a deficit — columns keep their basis and overflow instead of shrinking', () => {
    // Cuenta Bancaria-shaped deficit: the row demands ~1968px of real content in a
    // ~1134px measured host.
    const basisPx = 224;
    const growCount = 5;
    const growBasisTotalPx = basisPx * growCount; // 1120
    const fixedTotalPx = 848; // total demand: 848 + 1120 = 1968
    const hostWidthPx = 1134;

    const widths = Array.from({ length: growCount }, () =>
      growColumnWidth(basisPx, fixedTotalPx, growCount, { hostWidthPx, growBasisTotalPx }),
    );

    for (const w of widths) {
      expect(w).toBe(`${basisPx}px`); // never squeezed below its own basis
    }
    // The row's real content demand still exceeds the measured host — that excess
    // overflows (horizontal scroll); it never squeezes a column below its own basis.
    expect(fixedTotalPx + growCount * basisPx).toBeGreaterThan(hostWidthPx);
  });

  it('returns undefined when there are no growing columns', () => {
    expect(growColumnWidth(100, 500, 0)).toBeUndefined();
  });
});

describe('getTableContainerStyle()', () => {
  it('always returns the fixed table-layout, 100%-width style object', () => {
    expect(getTableContainerStyle()).toEqual({ tableLayout: 'fixed', width: '100%' });
  });
});
