import { render, screen } from '@testing-library/react';

// Echoes the raw key, and appends the interpolation values when the call site passes any — the
// pending-amount caption is the only such call here, so this is what makes the money string it
// formats (and therefore formatMoney's output) assertable in the DOM.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}:${Object.values(vars).join('|')}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// Stub MoneyAmount so we can assert on the value/currency pair without
// formatter quirks.
vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value, currency, tone }) => (
    <span data-testid={`money-${value}-${currency}-${tone}`}>{`${value} ${currency}`}</span>
  ),
}));

import { StatementLinesTable } from '../StatementLinesTable.jsx';

const LINES = [
  {
    id: 'l1', lineNo: 1, date: '2026-05-06T12:00:00.000Z',
    description: 'Compra mensual', reference: 'REF-1', bpartnerName: 'ACME',
    amount: 1000, matched: true,
  },
  {
    id: 'l2', lineNo: 2, date: '2026-05-07T12:00:00.000Z',
    description: '', reference: '', bpartnerName: '',
    amount: -250, matched: false,
  },
];

describe('StatementLinesTable', () => {
  it('renders the column headers (i18n keys)', () => {
    render(<StatementLinesTable lines={[]} loading={false} />);
    expect(screen.getByText('financeAccountStatementLinesColLineNo')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColDate')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColDescription')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColReference')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColBpartner')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColAmount')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementLinesColMatched')).toBeInTheDocument();
  });

  it('renders the empty-state row when there are no lines and not loading', () => {
    render(<StatementLinesTable lines={[]} loading={false} />);
    expect(screen.getByText('financeAccountStatementLinesEmpty')).toBeInTheDocument();
  });

  it('renders skeleton rows when loading=true (no data rows)', () => {
    const { container } = render(<StatementLinesTable lines={[]} loading={true} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('financeAccountStatementLinesEmpty')).not.toBeInTheDocument();
  });

  it('renders one row per line with line number, reference, bpartner', () => {
    render(<StatementLinesTable lines={LINES} loading={false} />);
    expect(screen.getByTestId('statement-line-row-l1')).toBeInTheDocument();
    expect(screen.getByTestId('statement-line-row-l2')).toBeInTheDocument();
    expect(screen.getByText('REF-1')).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
  });

  it('shows "—" placeholders for empty description / reference / bpartner', () => {
    render(<StatementLinesTable lines={LINES} loading={false} />);
    // Three "—" should appear in row l2 (description, reference, bpartner)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('renders a MoneyAmount with tone="auto" for each line', () => {
    render(<StatementLinesTable lines={LINES} loading={false} currency="USD" />);
    expect(screen.getByTestId('money-1000-USD-auto')).toBeInTheDocument();
    expect(screen.getByTestId('money--250-USD-auto')).toBeInTheDocument();
  });

  it('passes through the EUR currency by default', () => {
    render(<StatementLinesTable lines={LINES} loading={false} />);
    expect(screen.getByTestId('money-1000-EUR-auto')).toBeInTheDocument();
  });

  it('renders a reconciled/unmatched StatusTag pill for each line (falls back to `matched`)', () => {
    // Neither LINES fixture sets `reconcileStatus`, so this exercises the plain-`matched`
    // fallback path in statusEntryFor — the StatusTag renders the i18n label as its visible
    // (and therefore accessible) text, replacing the old boolean dot + aria-label.
    render(<StatementLinesTable lines={LINES} loading={false} />);
    expect(
      screen.getByText('financeAccountStatementLinesStatusReconciled'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementLinesStatusUnmatched'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('statement-line-pending-amount')).not.toBeInTheDocument();
  });

  describe('PARTIAL reconcileStatus (ETP-4502 iteration 4)', () => {
    it('renders the "Parcial" pill and the pending-amount caption for a PARTIAL line', () => {
      const lines = [{
        id: 'l1', lineNo: 1, date: '2026-05-06T12:00:00.000Z',
        description: '', reference: '', bpartnerName: '',
        amount: 100, matched: false, reconcileStatus: 'PARTIAL', pendingAmount: 46.76,
      }];
      render(<StatementLinesTable lines={lines} loading={false} />);
      expect(
        screen.getByText('financeAccountStatementLinesStatusPartial'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('statement-line-pending-amount')).toBeInTheDocument();
    });

    it('renders the "unmatched" pill and no caption for a PENDING line', () => {
      const lines = [{
        id: 'l1', lineNo: 1, date: '2026-05-06T12:00:00.000Z',
        description: '', reference: '', bpartnerName: '',
        amount: 100, matched: false, reconcileStatus: 'PENDING', pendingAmount: 100,
      }];
      render(<StatementLinesTable lines={lines} loading={false} />);
      expect(
        screen.getByText('financeAccountStatementLinesStatusUnmatched'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('statement-line-pending-amount')).not.toBeInTheDocument();
    });

    it('formats the pending amount with the currency symbol for a valid ISO code', () => {
      const lines = [{
        id: 'l1', lineNo: 1, date: '2026-05-06T12:00:00.000Z',
        description: '', reference: '', bpartnerName: '',
        amount: 100, matched: false, reconcileStatus: 'PARTIAL', pendingAmount: 46.76,
      }];
      render(<StatementLinesTable lines={lines} loading={false} currency="EUR" />);
      // Intl formats it (es-ES → comma decimal separator + € symbol), i.e. NOT the plain
      // "<amount> <CODE>" fallback below.
      const caption = screen.getByTestId('statement-line-pending-amount');
      expect(caption.textContent).toContain('46,76');
      expect(caption.textContent).toContain('€');
      expect(caption.textContent).not.toContain('46.76 EUR');
    });

    it('falls back to plain "<amount> <CODE>" when Intl rejects the currency code', () => {
      // Intl.NumberFormat throws a RangeError for a non-ISO-4217 currency code, so formatMoney's
      // catch branch degrades to a plain amount + raw code string instead of blowing up the row.
      const lines = [{
        id: 'l1', lineNo: 1, date: '2026-05-06T12:00:00.000Z',
        description: '', reference: '', bpartnerName: '',
        amount: 100, matched: false, reconcileStatus: 'PARTIAL', pendingAmount: 46.76,
      }];
      render(<StatementLinesTable lines={lines} loading={false} currency="NOTACURRENCY" />);
      const caption = screen.getByTestId('statement-line-pending-amount');
      expect(caption.textContent).toContain('46.76 NOTACURRENCY');
      expect(caption.textContent).not.toContain('46,76');
    });

    it('falls back to the reconciled pill (no caption) when only the legacy `matched` boolean is set', () => {
      const lines = [{
        id: 'l1', lineNo: 1, date: '2026-05-06T12:00:00.000Z',
        description: '', reference: '', bpartnerName: '',
        amount: 100, matched: true,
      }];
      render(<StatementLinesTable lines={lines} loading={false} />);
      expect(
        screen.getByText('financeAccountStatementLinesStatusReconciled'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('statement-line-pending-amount')).not.toBeInTheDocument();
    });
  });
});
