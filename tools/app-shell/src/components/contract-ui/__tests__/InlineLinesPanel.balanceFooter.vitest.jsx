/**
 * InlineLinesPanel — `balanceFooter` grid-aligned totals row (ETP-5210).
 *
 * Covers the debit/credit totals row added in b3d47d0d1 ("Align balance totals
 * under their grid columns"): `renderBalanceFooterRow` in InlineLinesPanel.jsx,
 * fed by `buildBalanceFooterGridTotals` in detailViewHelpers.jsx (tested
 * separately). This file only exercises InlineLinesPanel's own contract — it
 * receives the ALREADY-FORMATTED `{ debitField, creditField, debitTotal,
 * creditTotal }` shape as a prop and renders it as a row.
 *
 * Deliberately does NOT mock `@/lib/linesColumnWidth.js` (unlike the sibling
 * `InlineLinesPanel.vitest.jsx` / `.cellBadges.vitest.jsx` files, which stub
 * `columnFlex` to a constant): the whole point of this feature is that the
 * totals row reuses the REAL per-column `columnFlex()` the header row uses, so
 * a constant stub would make the alignment assertion below vacuous.
 */
import { render, screen, within } from '@testing-library/react';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import { columnFlex } from '@/lib/linesColumnWidth.js';
import React from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => {
    const idKey = `${key}$_identifier`;
    return row[idKey] || row[key] || '';
  },
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
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
vi.mock('./quickActionsStyle.js', () => ({
  QUICK_ACTIONS_PILL_CLASS: 'pill',
}));

// Three columns of varying types/widths (mirrors simple-g-l-journal: a string
// "Cuenta" column plus the two amount columns balanceFooter targets) so the
// column-width alignment assertion below is meaningful — a fixture where every
// column shared the same width could pass even if the totals row used its own
// (wrong) width calculation instead of the real columnFlex().
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

function renderPanel(props = {}) {
  return render(
    <InlineLinesPanel
      columns={COLUMNS}
      data={ROWS}
      entity="lines"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...props}
    />,
  );
}

describe('InlineLinesPanel — balanceFooter backwards compatibility', () => {
  it('renders no totals row when balanceFooter is omitted (existing windows unaffected)', () => {
    renderPanel();
    expect(screen.queryByTestId('balance-footer-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('balance-footer-debit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('balance-footer-credit')).not.toBeInTheDocument();
  });

  it('renders no totals row when balanceFooter is explicitly null', () => {
    renderPanel({ balanceFooter: null });
    expect(screen.queryByTestId('balance-footer-row')).not.toBeInTheDocument();
  });
});

describe('InlineLinesPanel — balanceFooter totals row', () => {
  it('renders the totals row with the formatted debit/credit sums', () => {
    renderPanel({ balanceFooter: BALANCE_FOOTER });

    const row = screen.getByTestId('balance-footer-row');
    expect(row).toBeInTheDocument();
    expect(within(row).getByTestId('balance-footer-debit')).toHaveTextContent('100,00 €');
    expect(within(row).getByTestId('balance-footer-credit')).toHaveTextContent('100,00 €');
  });

  it('renders every non-debit/credit column in the totals row blank', () => {
    renderPanel({ balanceFooter: BALANCE_FOOTER });

    const row = screen.getByTestId('balance-footer-row');
    // Structure mirrors the header row: [checkbox placeholder] [account] [debit] [credit] [right spacer].
    // No dimensionsPanel column and no reserved action slot in this fixture (the
    // trailing amount column — credit — always supplies the hover-action slot).
    const accountCell = row.children[1];
    expect(accountCell).not.toBe(within(row).getByTestId('balance-footer-debit'));
    expect(accountCell).not.toBe(within(row).getByTestId('balance-footer-credit'));
    expect(accountCell.textContent).toBe('');
  });
});

describe('InlineLinesPanel — balanceFooter column-width alignment (ETP-5210)', () => {
  it('gives the debit/credit footer cells the exact same flex as their header cells', () => {
    renderPanel({ balanceFooter: BALANCE_FOOTER });

    const debitHeader = screen.getByTestId('column-header-amtSourceDr');
    const creditHeader = screen.getByTestId('column-header-amtSourceCr');
    const debitFooter = screen.getByTestId('balance-footer-debit');
    const creditFooter = screen.getByTestId('balance-footer-credit');

    expect(debitFooter.style.flex).toBe(debitHeader.style.flex);
    expect(creditFooter.style.flex).toBe(creditHeader.style.flex);

    // Sanity: the two amount columns actually resolve to a non-trivial,
    // real columnFlex() value (not a coincidental constant), proving the
    // comparison above is exercising the real per-column width logic.
    const expectedDebitFlex = columnFlex(COLUMNS[1], 1);
    const expectedCreditFlex = columnFlex(COLUMNS[2], 2);
    expect(debitFooter.style.flex).toBe(expectedDebitFlex);
    expect(creditFooter.style.flex).toBe(expectedCreditFlex);
  });

  it('gives the blank "account" footer cell the same flex as its own header cell', () => {
    renderPanel({ balanceFooter: BALANCE_FOOTER });

    const accountHeader = screen.getByTestId('column-header-account');
    const row = screen.getByTestId('balance-footer-row');
    const accountFooterCell = row.children[1];

    expect(accountFooterCell.style.flex).toBe(accountHeader.style.flex);
  });
});

describe('InlineLinesPanel — balanceFooter font-weight regression (ETP-5210)', () => {
  it('renders the totals row in bold (600), guarding against cellStyle silently winning back to 400', () => {
    renderPanel({ balanceFooter: BALANCE_FOOTER });

    const row = screen.getByTestId('balance-footer-row');
    // Read the actual rendered inline style, not the JSX literal — this is
    // exactly the bug that shipped and was fixed: `...cellStyle` (fontWeight:
    // 400) spread AFTER `fontWeight: 600` would silently overwrite it back to
    // normal weight. Reading `style.fontWeight` off the DOM node reflects
    // whichever key actually won at render time.
    expect(row.style.fontWeight).toBe('600');
    expect(row.style.fontWeight).not.toBe('400');
  });
});
