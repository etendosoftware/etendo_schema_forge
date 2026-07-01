vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (_raw, _locale, _opts) => '1 Jan 2026',
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (n) => String(n),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import PaymentsCard from '../PaymentsCard.jsx';

describe('PaymentsCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders section title via i18n key', () => {
    render(<PaymentsCard />);
    expect(screen.getByText('previewCardPayments')).toBeInTheDocument();
  });

  it('shows loading text when loading=true', () => {
    render(<PaymentsCard loading />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows no-payments message when payments empty and no outstanding', () => {
    render(<PaymentsCard payments={[]} totalOutstanding={0} specName="purchase-invoice" />);
    expect(screen.getByText('noPagoYet')).toBeInTheDocument();
  });

  it('shows add-payment button when canAddPayment=true', () => {
    const onAddPayment = vi.fn();
    render(<PaymentsCard canAddPayment onAddPayment={onAddPayment} payments={[]} totalOutstanding={100} />);
    const btn = screen.getByText('previewCardAddPayment');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onAddPayment).toHaveBeenCalledTimes(1);
  });

  it('shows check icon when isFullyPaid=true and canAddPayment=false', () => {
    const { container } = render(<PaymentsCard isFullyPaid payments={[]} totalOutstanding={0} />);
    // Check icon from lucide renders as svg
    expect(container.querySelector('svg')).toBeInTheDocument();
    // No add-payment button
    expect(screen.queryByText('previewCardAddPayment')).toBeNull();
  });

  it('renders payment rows with documentNo', () => {
    const payments = [{ id: '1', amount: 200, paymentDate: '2026-01-01', documentNo: 'INV-200' }];
    render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
    expect(screen.getByText('INV-200')).toBeInTheDocument();
    expect(screen.getByText('1 Jan 2026')).toBeInTheDocument();
  });

  it('renders payment rows using id fallback when documentNo absent', () => {
    const payments = [{ id: 'pay-42', amount: 50, paymentDate: '2026-02-01' }];
    render(<PaymentsCard payments={payments} currencyCode="USD" specName="purchase-invoice" />);
    expect(screen.getByText('pay-42')).toBeInTheDocument();
  });

  it('formats amounts > 999 with thousand dots', () => {
    const payments = [{ id: '1', amount: 1500, paymentDate: '2026-01-01', documentNo: 'INV-1500' }];
    render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
    expect(screen.getByText(/1\.500,00/)).toBeInTheDocument();
  });

  it('shows outstanding row when totalOutstanding > 0', () => {
    const payments = [{ id: '1', amount: 100, paymentDate: '2026-01-01', documentNo: 'INV-1' }];
    render(<PaymentsCard payments={payments} currencyCode="EUR" totalOutstanding={50} specName="purchase-invoice" />);
    expect(screen.getByText('invoicePendingPayment')).toBeInTheDocument();
    expect(screen.getByText('50,00 EUR')).toBeInTheDocument();
  });

  it('does not show outstanding row when totalOutstanding is 0', () => {
    const payments = [{ id: '1', amount: 100, paymentDate: '2026-01-01', documentNo: 'INV-1' }];
    render(<PaymentsCard payments={payments} currencyCode="EUR" totalOutstanding={0} specName="purchase-invoice" />);
    expect(screen.queryByText('invoicePendingPayment')).toBeNull();
  });
});
