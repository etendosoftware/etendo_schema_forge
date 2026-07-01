// Mocks before imports
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (val) => (val ? `formatted:${val}` : '—'),
}));

vi.mock('@/lib/formatAmount.js', () => ({
  // Include currency code in output so amount-display assertions can match on it
  formatAmount: (val, code) => `${code ? code + ' ' : ''}${Number(val || 0).toFixed(2)}`,
}));

vi.mock('@/lib/statusBadge.js', () => ({
  getStatusBadgeProps: (code) => ({ variant: code === 'CO' ? 'default' : 'secondary' }),
}));

vi.mock('@/components/ui/badge.jsx', () => ({
  Badge: ({ children, variant, className }) => (
    <span data-testid="status-badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

import { render, screen } from '@testing-library/react';
import SummaryCard, { CardShell, InfoRow, PercentBar } from '../SummaryCard.jsx';

// ── CardShell ─────────────────────────────────────────────────────────────────

describe('CardShell', () => {
  it('renders children inside a wrapper', () => {
    render(<CardShell><span data-testid="child">content</span></CardShell>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

// ── InfoRow ───────────────────────────────────────────────────────────────────

describe('InfoRow', () => {
  it('renders label and value', () => {
    render(<InfoRow label="Cliente" value="Acme Corp" />);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders a dash when value is null', () => {
    render(<InfoRow label="Field" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders a dash when value is undefined', () => {
    render(<InfoRow label="Field" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders children slot instead of value when provided', () => {
    render(
      <InfoRow label="Status">
        <span data-testid="custom-child">Custom</span>
      </InfoRow>,
    );
    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('applies underline class when underline prop is true', () => {
    render(<InfoRow label="Due" value="2024-12-31" underline />);
    const valueEl = screen.getByText('2024-12-31');
    expect(valueEl.className).toContain('underline');
  });
});

// ── PercentBar ────────────────────────────────────────────────────────────────

describe('PercentBar', () => {
  it('renders 0% with slate track color', () => {
    render(<PercentBar value={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders a mid-value (50%) with amber color classes', () => {
    render(<PercentBar value={50} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    const text = screen.getByText('50%');
    expect(text.className).toContain('amber');
  });

  it('renders 100% with emerald color classes', () => {
    render(<PercentBar value={100} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    const text = screen.getByText('100%');
    expect(text.className).toContain('emerald');
  });

  it('clamps values above 100 to 100', () => {
    render(<PercentBar value={150} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('treats NaN input as 0', () => {
    render(<PercentBar value="not-a-number" />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

// ── SummaryCard ───────────────────────────────────────────────────────────────

describe('SummaryCard', () => {
  const fullProps = {
    currencyCode: 'EUR',
    grandTotal: 1500,
    contact: 'Acme Corp',
    date: '2024-05-01',
    statusCode: 'CO',
    statusLabel: 'Completed',
  };

  it('renders without crashing with full props', () => {
    render(<SummaryCard {...fullProps} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders the formatted grandTotal with currency code', () => {
    render(<SummaryCard {...fullProps} />);
    // formatAmount(1500, 'EUR') → "EUR 1500.00" via mock
    expect(screen.getByText('EUR 1500.00')).toBeInTheDocument();
  });

  it('renders the formatted date', () => {
    render(<SummaryCard {...fullProps} />);
    expect(screen.getByText('formatted:2024-05-01')).toBeInTheDocument();
  });

  it('renders the status badge with the statusLabel', () => {
    render(<SummaryCard {...fullProps} />);
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('Completed');
    expect(badge).toHaveAttribute('data-variant', 'default');
  });

  it('uses statusCode as label fallback when statusLabel is absent', () => {
    render(<SummaryCard {...fullProps} statusLabel={undefined} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('CO');
  });

  it('shows validUntil row only when validUntil is provided', () => {
    const { rerender } = render(<SummaryCard {...fullProps} />);
    expect(screen.queryByText('previewCardValidUntil')).not.toBeInTheDocument();

    rerender(<SummaryCard {...fullProps} validUntil="2024-12-31" />);
    expect(screen.getByText('previewCardValidUntil')).toBeInTheDocument();
    expect(screen.getByText('formatted:2024-12-31')).toBeInTheDocument();
  });

  it('shows dueDate row only when dueDate is provided', () => {
    const { rerender } = render(<SummaryCard {...fullProps} />);
    expect(screen.queryByText('previewCardDueDate')).not.toBeInTheDocument();

    rerender(<SummaryCard {...fullProps} dueDate="2024-06-15" />);
    expect(screen.getByText('previewCardDueDate')).toBeInTheDocument();
  });

  it('shows invoicePercent row only when invoicePercent is not null', () => {
    const { rerender } = render(<SummaryCard {...fullProps} />);
    expect(screen.queryByText('previewCardInvoicePercent')).not.toBeInTheDocument();

    rerender(<SummaryCard {...fullProps} invoicePercent={75} />);
    expect(screen.getByText('previewCardInvoicePercent')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows deliveryPercent row only when deliveryPercent is not null', () => {
    const { rerender } = render(<SummaryCard {...fullProps} />);
    expect(screen.queryByText('previewCardDeliveryPercent')).not.toBeInTheDocument();

    rerender(<SummaryCard {...fullProps} deliveryPercent={50} />);
    expect(screen.getByText('previewCardDeliveryPercent')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders children prop inside the card body', () => {
    render(
      <SummaryCard {...fullProps}>
        <span data-testid="extra-row">Extra Info</span>
      </SummaryCard>,
    );
    expect(screen.getByTestId('extra-row')).toBeInTheDocument();
  });

  it('renders with minimal props (nulls/defaults) without crashing', () => {
    render(<SummaryCard statusCode="DR" statusLabel="Draft" />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Draft');
    // grandTotal defaults to 0
    expect(screen.getByText(/0\.00/)).toBeInTheDocument();
  });

  it('renders dash for date when date is falsy', () => {
    render(<SummaryCard statusCode="DR" date={null} />);
    // formatCalendarDate returns '—' for null; contact is also null → multiple dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  // ── Dual-currency display (ETP-4027) ──────────────────────────────────────

  describe('dual-currency display', () => {
    const dualProps = {
      ...fullProps,
      currencyCode: 'USD',
      grandTotal: 304.92,
      orgCurrencyCode: 'EUR',
      orgGrandTotal: 261.81,
      exchangeRate: 1.1647,
    };

    it('shows orgGrandTotal formatted with orgCurrencyCode as primary amount when currencies differ', () => {
      render(<SummaryCard {...dualProps} />);
      // formatAmount(261.81, 'EUR') → "EUR 261.81" via updated mock
      expect(screen.getByText('EUR 261.81')).toBeInTheDocument();
    });

    it('shows doc amount as secondary below the header when currencies differ', () => {
      render(<SummaryCard {...dualProps} />);
      // formatAmount(304.92, 'USD') → "USD 304.92" in secondary span
      expect(screen.getByText('USD 304.92')).toBeInTheDocument();
    });

    it('shows exchange rate note (in parentheses) when currencies differ', () => {
      render(<SummaryCard {...dualProps} />);
      // rateNote is formatted to 4 decimal places — matches "(1.1647)" pattern
      expect(screen.getByText(/\(1[.,]1647\)/)).toBeInTheDocument();
    });

    it('shows only doc amount — no secondary row — when orgCurrencyCode equals currencyCode', () => {
      render(<SummaryCard {...fullProps} orgCurrencyCode="EUR" orgGrandTotal={1600} exchangeRate={1.1} />);
      // fullProps has currencyCode='EUR' === orgCurrencyCode='EUR' → showOrgTotal=false
      expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
      // Primary amount is doc amount: formatAmount(1500, 'EUR') → "EUR 1500.00"
      expect(screen.getByText('EUR 1500.00')).toBeInTheDocument();
    });

    it('falls back to doc amount only when orgGrandTotal is null (no rate available)', () => {
      render(<SummaryCard {...dualProps} orgGrandTotal={null} />);
      // orgGrandTotal == null → showOrgTotal=false → primary = formatAmount(304.92, 'USD')
      expect(screen.getByText('USD 304.92')).toBeInTheDocument();
      // EUR amount must NOT be the primary
      expect(screen.queryByText(/EUR 261/)).not.toBeInTheDocument();
    });

    it('does not show rate note when currencies differ but exchangeRate is falsy', () => {
      render(<SummaryCard {...dualProps} exchangeRate={null} />);
      // rateNote is only rendered when showOrgTotal && exchangeRate
      expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
    });

    it('shows currencyCode badge in header when dual-currency is active', () => {
      render(<SummaryCard {...dualProps} />);
      // CardHeader badge = currencyCode when showOrgTotal
      expect(screen.getByText('USD')).toBeInTheDocument();
    });
  });
});
