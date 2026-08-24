const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
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

  it('shows an inert add-payment label when the drafts already reserve the outstanding', () => {
    const onAddPayment = vi.fn();
    render(
      <PaymentsCard
        addPaymentBlockedByDraft
        onAddPayment={onAddPayment}
        payments={[]}
        totalOutstanding={100}
      />,
    );
    const label = screen.getByText('previewCardAddPayment');
    expect(label).toHaveAttribute('title', 'cpAddPaymentBlockedByDraft');
    fireEvent.click(label);
    expect(onAddPayment).not.toHaveBeenCalled();
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
    // Real currency symbol, not the raw ISO code — "50,00 €", never "50,00 EUR".
    expect(screen.getByText('50,00 €')).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
  });

  it('renders the row amount with the real currency symbol, not the raw ISO code', () => {
    const payments = [{ id: '1', amount: 1500, paymentDate: '2026-01-01', documentNo: 'INV-1500' }];
    render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
    expect(screen.getByText(/1\.500,00\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
  });

  it('resolves the symbol dynamically for a non-EUR currency (USD), not hardcoded €', () => {
    const payments = [{ id: '1', amount: 200, paymentDate: '2026-01-01', documentNo: 'INV-200' }];
    render(<PaymentsCard payments={payments} currencyCode="USD" specName="purchase-invoice" />);
    expect(screen.getByText(/200,00\s\$/)).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).toBeNull();
  });

  it('does not show outstanding row when totalOutstanding is 0', () => {
    const payments = [{ id: '1', amount: 100, paymentDate: '2026-01-01', documentNo: 'INV-1' }];
    render(<PaymentsCard payments={payments} currencyCode="EUR" totalOutstanding={0} specName="purchase-invoice" />);
    expect(screen.queryByText('invoicePendingPayment')).toBeNull();
  });

  describe('resolveMethodKey via rendered method icon', () => {
    // Icons are inline SVGs (no data-testid); card uses a <rect>, cash uses a
    // <rect> + <circle>, direct uses only <path>, transfer uses only <path>.
    // We disambiguate card vs cash by presence of a <circle>.
    function renderRowIcon(methodLabel) {
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', 'paymentMethod$_identifier': methodLabel }];
      return render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
    }

    it('resolves "tarjeta" to the card icon (rect, no circle)', () => {
      const { container } = renderRowIcon('Tarjeta de crédito');
      const row = screen.getByTestId('PaymentsCard__row-0');
      const rect = row.querySelector('rect');
      expect(rect).toBeInTheDocument();
      expect(row.querySelector('circle')).toBeNull();
    });

    it('resolves "card" to the card icon', () => {
      renderRowIcon('Card payment');
      const row = screen.getByTestId('PaymentsCard__row-0');
      expect(row.querySelector('rect')).toBeInTheDocument();
      expect(row.querySelector('circle')).toBeNull();
    });

    it('resolves "efectivo" to the cash icon (rect + circle)', () => {
      renderRowIcon('Efectivo');
      const row = screen.getByTestId('PaymentsCard__row-0');
      expect(row.querySelector('rect')).toBeInTheDocument();
      expect(row.querySelector('circle')).toBeInTheDocument();
    });

    it('resolves "cash" to the cash icon', () => {
      renderRowIcon('Cash');
      const row = screen.getByTestId('PaymentsCard__row-0');
      expect(row.querySelector('rect')).toBeInTheDocument();
      expect(row.querySelector('circle')).toBeInTheDocument();
    });

    it('resolves "domiciliación" to the direct-debit icon (path only, no rect/circle)', () => {
      renderRowIcon('Domiciliación bancaria');
      const row = screen.getByTestId('PaymentsCard__row-0');
      expect(row.querySelector('rect')).toBeNull();
      expect(row.querySelector('circle')).toBeNull();
      expect(row.querySelector('path')).toBeInTheDocument();
    });

    it('resolves "direct" to the direct-debit icon', () => {
      renderRowIcon('Direct debit');
      const row = screen.getByTestId('PaymentsCard__row-0');
      expect(row.querySelector('rect')).toBeNull();
      expect(row.querySelector('circle')).toBeNull();
      expect(row.querySelector('path')).toBeInTheDocument();
    });
  });

  describe('titleRight priority', () => {
    it('shows the creditBalance badge when isCreditNote=true, even if canAddPayment and isFullyPaid are also true', () => {
      render(
        <PaymentsCard
          isCreditNote
          canAddPayment
          isFullyPaid
          payments={[]}
          totalOutstanding={0}
        />,
      );
      expect(screen.getByText('creditBalance')).toBeInTheDocument();
      expect(screen.queryByText('previewCardAddPayment')).toBeNull();
      expect(screen.queryByText('cobrada')).toBeNull();
      expect(screen.queryByText('pagada')).toBeNull();
    });
  });

  describe('empty-state labels', () => {
    it('shows noApplicationsRegistered when isCreditNote=true and there are no payments', () => {
      render(<PaymentsCard isCreditNote payments={[]} totalOutstanding={0} />);
      expect(screen.getByText('noApplicationsRegistered')).toBeInTheDocument();
    });

    it('shows noCobroYet when isCreditNote=false and specName is sales-invoice', () => {
      render(<PaymentsCard payments={[]} totalOutstanding={0} specName="sales-invoice" />);
      expect(screen.getByText('noCobroYet')).toBeInTheDocument();
    });
  });

  describe('StateTag deposited/draft', () => {
    it('shows statusDeposited when the payment is processed', () => {
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', processed: true }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      expect(screen.getByText('statusDeposited')).toBeInTheDocument();
    });

    it('shows statusDeposited when the status is in the paid-statuses whitelist', () => {
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', status: 'RPR' }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      expect(screen.getByText('statusDeposited')).toBeInTheDocument();
    });

    it('shows statusDraft when the payment is neither processed nor in the whitelist', () => {
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', status: 'DR' }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      expect(screen.getByText('statusDraft')).toBeInTheDocument();
    });

    it('shows a bank transfer the bank only authorized as in progress, not deposited (ETP-4895)', () => {
      // This card and the invoice's payment modal are fed by the same invoicePayments action, so
      // they see the identical row — yet this one used to read "Depositado" for a transfer the
      // modal was already reporting as "Pago en progreso".
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', status: 'PPM', processed: true, viaPis: true, pisPending: true }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      expect(screen.getByTestId('payments-card-state-in-progress')).toHaveTextContent('cpPaymentStateInProgress');
      expect(screen.queryByText('statusDeposited')).toBeNull();
    });

    it('goes back to deposited once the transfer is executed and the bank transaction exists', () => {
      // Core moves the payment off PPM to PWNC when the withdrawal is recorded, so no extra
      // signal is needed for the reverse direction.
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', status: 'PWNC', processed: true, viaPis: true, pisPending: false }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      expect(screen.getByText('statusDeposited')).toBeInTheDocument();
    });

    it('shows a rejected bank transfer as an error', () => {
      const payments = [{ id: '1', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-1', status: 'ETGOERR' }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      expect(screen.getByTestId('payments-card-state-error')).toHaveTextContent('cpPaymentStateError');
    });
  });

  describe('row click navigation', () => {
    it('navigates to /payment-in/{id} when specName is sales-invoice', () => {
      const payments = [{ id: 'pay-9', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-9' }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="sales-invoice" />);
      fireEvent.click(screen.getByTestId('PaymentsCard__row-0'));
      expect(mockNavigate).toHaveBeenCalledWith('/payment-in/pay-9');
    });

    it('navigates to /payment-out/{id} when specName is not sales-invoice', () => {
      const payments = [{ id: 'pay-8', amount: 10, paymentDate: '2026-01-01', documentNo: 'DOC-8' }];
      render(<PaymentsCard payments={payments} currencyCode="EUR" specName="purchase-invoice" />);
      fireEvent.click(screen.getByTestId('PaymentsCard__row-0'));
      expect(mockNavigate).toHaveBeenCalledWith('/payment-out/pay-8');
    });
  });
});
