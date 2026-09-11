/**
 * Combined-mount regression suite for ETP-5210 ("Fix totals row order when
 * add-row is active").
 *
 * The generated `*LineTable` wrapper (e.g. GLJournalLineTable.jsx) renders
 * BOTH siblings side by side whenever `linesLayout === 'inlineEditable'` and
 * `addRow.active`:
 *
 *   <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
 *   <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
 *
 * `props` carries the SAME `balanceFooter` and `lineFormActive` (DetailView's
 * `addingLine`) into both. This file mounts that exact shape directly (no
 * generated wrapper involved) and asserts on the combined DOM — the unit
 * tests in InlineLinesPanel.balanceFooter.vitest.jsx and
 * DataTable.balanceFooterAddRow.vitest.jsx already cover each component in
 * isolation.
 */
import { render, screen, within } from '@testing-library/react';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import { DataTable } from '../DataTable.jsx';
import { columnFlex } from '@/lib/linesColumnWidth.js';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => raw,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label }) => <span>{label}</span>,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[`${key}$_identifier`] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field, displayLabel }) => (
    <span data-testid={`inline-combo-${field.key}`}>{displayLabel}</span>
  ),
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({
  default: () => null,
}));

// Deliberately does NOT mock @/lib/linesColumnWidth.js — scenario 6 below
// asserts the DataTable-rendered footer cells share the REAL columnFlex()
// width with the sibling InlineLinesPanel's header cells; a constant stub
// would make that assertion vacuous.

// Three columns (a string "Cuenta" plus the two amount columns the
// balanceFooter targets), same shape as the sibling unit-test fixtures.
const COLUMNS = [
  { key: 'account', label: 'Cuenta', type: 'string' },
  { key: 'amtSourceDr', label: 'Débito', type: 'amount' },
  { key: 'amtSourceCr', label: 'Crédito', type: 'amount' },
];

const ROWS = [
  { id: 'L1', account: 'A1', 'account$_identifier': 'Caja', amtSourceDr: '100', amtSourceCr: '0' },
];

const BALANCE_FOOTER = {
  debitField: 'amtSourceDr',
  creditField: 'amtSourceCr',
  debitTotal: '100,00 €',
  creditTotal: '100,00 €',
};

const inlineLinesPanelProps = {
  columns: COLUMNS,
  data: ROWS,
  entity: 'lines',
  token: 'test',
  apiBaseUrl: '/api',
  selectorContext: {},
  onSelectionChange: vi.fn(),
  onUpdateRow: vi.fn().mockResolvedValue(),
  onDeleteRow: vi.fn().mockResolvedValue(),
};

// Mirrors the generated *LineTable wrapper's `props.addRow?.active` branch:
// InlineLinesPanel gets `addRow={undefined}` (its own footer suppressed via
// `lineFormActive`), the sibling DataTable gets the real, active addRow plus
// `hideHeader`/`hideDataRows`. Both receive the same `balanceFooter`.
function renderCombinedAddRowActive(balanceFooter = BALANCE_FOOTER) {
  return render(
    <>
      <InlineLinesPanel
        {...inlineLinesPanelProps}
        balanceFooter={balanceFooter}
        lineFormActive
        addRow={undefined}
      />
      <DataTable
        columns={COLUMNS}
        data={[]}
        addRow={{ active: true, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
        balanceFooter={balanceFooter}
        selectable={false}
        hideHeader
        hideDataRows
      />
    </>,
  );
}

describe('Combined mount — add-row active (ETP-5210 scenario 3)', () => {
  it('renders exactly ONE balance-footer-row across both siblings', () => {
    renderCombinedAddRowActive();
    expect(screen.getAllByTestId('balance-footer-row')).toHaveLength(1);
  });

  it('positions the single totals row AFTER the add-row inputs', () => {
    renderCombinedAddRowActive();
    const addRow = screen.getByTestId('inline-add-row');
    const footer = screen.getByTestId('balance-footer-row');
    const position = addRow.compareDocumentPosition(footer);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeFalsy();
  });

  it('does NOT position the totals row between the saved lines and the add-row form', () => {
    renderCombinedAddRowActive();
    const savedLine = screen.getByTestId('line-row-L1');
    const addRow = screen.getByTestId('inline-add-row');
    const footer = screen.getByTestId('balance-footer-row');
    // savedLine -> addRow -> footer, strictly in that order.
    const savedToAddRow = savedLine.compareDocumentPosition(addRow);
    const addRowToFooter = addRow.compareDocumentPosition(footer);
    expect(savedToAddRow & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(addRowToFooter & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Combined mount — column-width alignment (ETP-5210 scenario 6)', () => {
  it('gives the DataTable-rendered footer debit/credit cells the same flex as the sibling InlineLinesPanel header cells', () => {
    renderCombinedAddRowActive();
    // Scoped to InlineLinesPanel's own container — DataTable also renders a
    // (CSS-hidden, `hideHeader`) header with the same `column-header-*`
    // testids, so an unscoped query would be ambiguous.
    const panel = within(screen.getByTestId('inline-lines-panel'));
    const debitHeader = panel.getByTestId('column-header-amtSourceDr');
    const creditHeader = panel.getByTestId('column-header-amtSourceCr');
    const footer = screen.getByTestId('balance-footer-row');
    const debitFooter = within(footer).getByTestId('balance-footer-debit');
    const creditFooter = within(footer).getByTestId('balance-footer-credit');

    expect(debitFooter.style.flex).toBe(debitHeader.style.flex);
    expect(creditFooter.style.flex).toBe(creditHeader.style.flex);

    // Sanity: these actually resolve to a non-trivial, real columnFlex()
    // value (not a coincidental constant equality).
    expect(debitFooter.style.flex).toBe(columnFlex(COLUMNS[1], 1));
    expect(creditFooter.style.flex).toBe(columnFlex(COLUMNS[2], 2));
  });
});

describe('Combined mount — add-row inactive (ETP-5210 scenario 4, pre-existing case)', () => {
  it('renders the totals row from InlineLinesPanel alone, positioned after the saved lines', () => {
    render(
      <InlineLinesPanel
        {...inlineLinesPanelProps}
        balanceFooter={BALANCE_FOOTER}
        lineFormActive={false}
      />,
    );
    const footers = screen.getAllByTestId('balance-footer-row');
    expect(footers).toHaveLength(1);

    const savedLine = screen.getByTestId('line-row-L1');
    const position = savedLine.compareDocumentPosition(footers[0]);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Combined mount — no balanceFooter configured (ETP-5210 scenario 5)', () => {
  it('renders no totals row from either sibling when add-row is active', () => {
    renderCombinedAddRowActive(null);
    expect(screen.queryByTestId('balance-footer-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('balance-footer-debit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('balance-footer-credit')).not.toBeInTheDocument();
  });

  it('renders no totals row from InlineLinesPanel when add-row is inactive', () => {
    render(<InlineLinesPanel {...inlineLinesPanelProps} />);
    expect(screen.queryByTestId('balance-footer-row')).not.toBeInTheDocument();
  });
});
