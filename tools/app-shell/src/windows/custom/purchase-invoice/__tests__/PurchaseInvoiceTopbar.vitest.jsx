// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Render createPortal children inline so portal content is testable
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: ({ onClose, onCloned }) => (
    <div data-testid="clone-order-modal">
      <button onClick={onClose}>Close clone</button>
      <button onClick={() => onCloned('new-id-123')}>Confirm clone</button>
    </div>
  ),
}));

vi.mock('@/windows/custom/shared/SendToSifButton.jsx', () => ({
  default: () => <div data-testid="send-to-sif-btn" />,
}));

vi.mock('@/windows/custom/shared/CloneButton.jsx', () => ({
  default: ({ onClick, title }) => (
    <button data-testid="clone-btn" onClick={onClick}>{title}</button>
  ),
}));

vi.mock('@/windows/custom/shared/InvoicePaymentHistoryModal.jsx', () => ({
  default: ({ onClose, onPaymentAdded }) => (
    <div data-testid="payment-history-modal">
      <button onClick={onClose}>Close payment modal</button>
      <button onClick={onPaymentAdded}>Added payment</button>
    </div>
  ),
}));

vi.mock('@/windows/custom/shared/useInvoiceUpdatedListener.js', () => ({
  useInvoiceUpdatedListener: vi.fn(),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
}));

vi.mock('@etendosoftware/app-shell-core/auth', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => vi.fn()),
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({ profile: null })),
}));

vi.mock('@/windows/custom/shared/sifSending.js', () => ({
  getPendingSifTargets: vi.fn(() => ({ sendSii: false, sendTbai: false })),
  getSifBodyKey: vi.fn(() => ''),
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (currency, amount) => `${currency}:${amount}`,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PurchaseInvoiceTopbar from '../PurchaseInvoiceTopbar.jsx';

const BASE_DATA = {
  id: 'inv-001',
  documentStatus: 'CO',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 1000,
  outstandingAmount: 500,
  paymentComplete: false,
  'transactionDocument$_identifier': 'AP Invoice',
};

describe('PurchaseInvoiceTopbar', () => {
  const defaultProps = {
    data: BASE_DATA,
    recordId: 'inv-001',
    token: 'test-token',
    apiBaseUrl: '/api',
    onRefresh: vi.fn(),
    onProcess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when data is not provided', () => {
    const { container } = render(
      <PurchaseInvoiceTopbar {...defaultProps} data={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders clone button and send-to-sif button when recordId is provided', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    expect(screen.getByTestId('clone-btn')).toBeInTheDocument();
    expect(screen.getByTestId('send-to-sif-btn')).toBeInTheDocument();
  });

  it('does not render action buttons when recordId is absent', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} recordId={null} />);
    expect(screen.queryByTestId('clone-btn')).toBeNull();
    expect(screen.queryByTestId('send-to-sif-btn')).toBeNull();
  });

  it('shows credit badge for AP CreditMemo doc type', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    expect(screen.getByText('creditApplied')).toBeInTheDocument();
  });

  it('shows credit badge for Nota de Crédito doc type', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'Nota de Crédito' }}
      />,
    );
    expect(screen.getByText('creditApplied')).toBeInTheDocument();
  });

  it('shows paid badge when paymentComplete is true', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, paymentComplete: true }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
  });

  it('shows paid badge when paymentComplete is Y', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, paymentComplete: 'Y' }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
  });

  it('shows paid badge when outstanding is 0', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, outstandingAmount: 0 }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
  });

  it('shows pending badge when outstanding > 0 and not fully paid', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    expect(screen.getByText('statusPending')).toBeInTheDocument();
  });

  it('does not show any payment badge when document is not completed', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, documentStatus: 'DR' }}
      />,
    );
    expect(screen.queryByText('statusPaid')).toBeNull();
    expect(screen.queryByText('statusPending')).toBeNull();
  });

  it('clicking pending badge opens payment history modal', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
    fireEvent.click(screen.getByText('statusPending'));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('clicking paid badge opens payment history modal', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, paymentComplete: true }}
      />,
    );
    fireEvent.click(screen.getByText('statusPaid'));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('clicking credit badge does not open payment modal', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    fireEvent.click(screen.getByText('creditApplied'));
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('closing payment modal calls onRefresh', () => {
    const onRefresh = vi.fn();
    render(<PurchaseInvoiceTopbar {...defaultProps} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText('statusPending'));
    fireEvent.click(screen.getByText('Close payment modal'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('payment modal disappears after closing', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    fireEvent.click(screen.getByText('statusPending'));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close payment modal'));
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });

  it('clicking clone button opens clone modal', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    expect(screen.queryByTestId('clone-order-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('clone-btn'));
    expect(screen.getByTestId('clone-order-modal')).toBeInTheDocument();
  });

  it('closing clone modal hides it', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('clone-btn'));
    fireEvent.click(screen.getByText('Close clone'));
    expect(screen.queryByTestId('clone-order-modal')).toBeNull();
  });

  it('uses currency from data for badge amount display', () => {
    render(<PurchaseInvoiceTopbar {...defaultProps} />);
    // formatCurrency mock returns "currency:amount"
    expect(screen.getByText(/EUR:/)).toBeInTheDocument();
  });

  it('falls back to USD currency when currency field is empty', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'currency$_identifier': '' }}
      />,
    );
    expect(screen.getByText(/USD:/)).toBeInTheDocument();
  });

  it('outstanding falls back to grandTotal when outstandingAmount is null', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, outstandingAmount: null }}
      />,
    );
    // outstanding = grandTotal (1000), grandTotal (1000) => not fully paid (outstanding > 0)
    expect(screen.getByText('statusPending')).toBeInTheDocument();
  });
});
