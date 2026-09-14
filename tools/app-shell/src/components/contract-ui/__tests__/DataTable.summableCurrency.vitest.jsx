/**
 * DataTable — `summable` opt-out and per-row currency (ETP-5245).
 *
 * Two independent bugs, one column: the Product > Costing cost rendered as
 * `98.47` / `100` — no decimals, no separators, no symbol.
 *
 * 1. Typing it as `amount` fixes the formatting, but `amount` also dragged in a
 *    footer TOTAL that sums the column. Costs are not addable: they are the
 *    values in force at different points in time, so their sum means nothing.
 *    `summable: false` splits formatting from aggregation.
 * 2. Even as `amount`, the symbol stayed missing, because the cell looked up a
 *    hardcoded `currency$_identifier` while NEO emits `cCurrencyID$_identifier`
 *    for this entity.
 *
 * The load-bearing regression guard is `does not declare summable`: ~99 amount
 * columns across 28 windows carry no `summable` key and MUST keep summing.
 *
 * Note on indices: DataTable emits a leading gutter/selection cell, so the first
 * declared column is cell index 1 in the header, body and footer rows.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('../InlineSearchCombo.jsx', () => ({ InlineSearchCombo: () => null }));
vi.mock('../RowQuickActions.jsx', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Session currency is the LAST resort in the cascade; the tests below drive it
// explicitly to prove the row's own currency always wins over it.
const sessionCurrency = vi.hoisted(() => ({ value: null }));
vi.mock('@/hooks/useCurrency.jsx', () => ({
  useCurrency: () => sessionCurrency.value,
}));

import { DataTable } from '../DataTable.jsx';

// formatAmount / formatCurrency are NOT mocked: the point of the ticket is the
// rendered string, so the real canonical formatter is what must be asserted.
const COST_COL = { key: 'cost', column: 'Cost', type: 'amount', label: 'Cost' };

const MIXED_ROWS = [
  { id: 'r1', cost: 98.47, 'cCurrencyID$_identifier': 'EUR' },
  { id: 'r2', cost: 100, 'cCurrencyID$_identifier': 'USD' },
];

// formatCurrency separates the symbol with a NON-BREAKING space (U+00A0), which
// is correct output but unreadable in an assertion — normalize it to a plain
// space so the expected strings below read the way the cell looks on screen.
const norm = (s) => (s ?? '').replace(/\u00a0/g, ' ');

function footerCells() {
  const footer = document.querySelector('tfoot tr');
  return footer ? Array.from(footer.querySelectorAll('td')).map((td) => norm(td.textContent)) : null;
}

function cellText(rowId, index = 1) {
  return norm(screen.getByTestId(`row-${rowId}`).querySelectorAll('td')[index].textContent);
}

describe('DataTable — summable opt-out (ETP-5245)', () => {
  beforeEach(() => { sessionCurrency.value = null; });

  it('renders the footer total when an amount column does not declare summable (REGRESSION GUARD)', () => {
    // The default that 28 windows depend on. If this ever goes red, every
    // document total in the app silently disappeared.
    render(<DataTable columns={[COST_COL]} data={MIXED_ROWS} />);
    const cells = footerCells();
    expect(cells).not.toBeNull();
    expect(cells[1]).toContain('198,47');
  });

  it('renders the footer total when an amount column declares summable: true', () => {
    render(<DataTable columns={[{ ...COST_COL, summable: true }]} data={MIXED_ROWS} />);
    expect(footerCells()[1]).toContain('198,47');
  });

  it('renders NO footer row at all when the only amount column declares summable: false', () => {
    render(<DataTable columns={[{ ...COST_COL, summable: false }]} data={MIXED_ROWS} />);
    expect(footerCells()).toBeNull();
  });

  it('keeps totalling the sibling amount columns and blanks only the opted-out one', () => {
    const columns = [
      { ...COST_COL, summable: false },
      { key: 'lineTotal', column: 'LineTotal', type: 'amount', label: 'Line Total' },
    ];
    const data = [
      { id: 'r1', cost: 98.47, lineTotal: 10 },
      { id: 'r2', cost: 100, lineTotal: 5 },
    ];
    render(<DataTable columns={columns} data={data} />);
    const cells = footerCells();
    expect(cells[1]).toBe('');            // cost — excluded, blank (not "NaN"/"0,00 €")
    expect(cells[2]).toContain('15,00');  // lineTotal — still summed
  });

  it('keeps the amount FORMATTING on an opted-out column (summable removes the total, not the money)', () => {
    render(<DataTable columns={[{ ...COST_COL, summable: false, currencyField: 'cCurrencyID' }]} data={MIXED_ROWS} />);
    expect(cellText('r1')).toBe('98,47 €');
  });
});

describe('DataTable — per-row currency (ETP-5245)', () => {
  beforeEach(() => { sessionCurrency.value = null; });

  it('formats each row with its OWN currency, not one currency for the whole grid', () => {
    render(<DataTable columns={[{ ...COST_COL, currencyField: 'cCurrencyID' }]} data={MIXED_ROWS} />);
    expect(cellText('r1')).toBe('98,47 €');
    expect(cellText('r2')).toBe('100,00 $');
  });

  it('resolves cCurrencyID$_identifier even when the column declares no currencyField', () => {
    render(<DataTable columns={[COST_COL]} data={MIXED_ROWS} />);
    expect(cellText('r1')).toBe('98,47 €');
  });

  it('still honours the legacy currency$_identifier property', () => {
    const rows = [{ id: 'r1', cost: 98.47, 'currency$_identifier': 'EUR' }];
    render(<DataTable columns={[COST_COL]} data={rows} />);
    expect(cellText('r1')).toBe('98,47 €');
  });

  it('falls back to the session currency only for rows that carry none', () => {
    sessionCurrency.value = 'EUR';
    render(<DataTable columns={[COST_COL]} data={[{ id: 'r1', cost: 98.47 }]} />);
    expect(cellText('r1')).toBe('98,47 €');
  });

  it('never lets the session currency override a row that has its own', () => {
    sessionCurrency.value = 'EUR';
    render(<DataTable columns={[COST_COL]} data={[MIXED_ROWS[1]]} />);
    expect(cellText('r2')).toBe('100,00 $');
  });

  it('renders a grouped, symbol-less amount when no currency is known anywhere (mock data)', () => {
    render(<DataTable columns={[COST_COL]} data={[{ id: 'r1', cost: 98.47 }]} />);
    expect(cellText('r1')).toBe('98,47');
  });

  it('labels the footer total with the resolved row currency', () => {
    render(<DataTable columns={[{ ...COST_COL, currencyField: 'cCurrencyID' }]} data={MIXED_ROWS} />);
    expect(footerCells()[1]).toBe('198,47 €');
  });
});
