// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Stable navigate spy so tests can assert the post-clone redirect.
const routerMock = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => routerMock.navigate,
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

  it('shows the remaining "saldo a favor" badge for AP CreditMemo doc type', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('shows the remaining "saldo a favor" badge for Nota de Crédito doc type', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'Nota de Crédito' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  // ETP-4737: the new doc type didn't match any hardcoded name/category check
  // before this fix, so it fell through to the regular (non-credit) badge logic.
  it('shows the remaining "saldo a favor" badge for the new Factura Rectificativa (compras) doc type', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('prefers the server-injected apInvoiceSubtype over the identifier string', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, apInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('shows the fully-applied badge when a credit note has no remaining balance', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{
          ...BASE_DATA,
          'transactionDocument$_identifier': 'AP CreditMemo',
          outstandingAmount: 0,
        }}
      />,
    );
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
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

  it('clicking the credit-note badge opens the payment history modal (like the grid)', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
    fireEvent.click(screen.getByText('cpFavorBadge'));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
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

  // ETP-4404: the backend enriches invoices with hasRectifications; the topbar
  // must simply tolerate the extra field (there is no badge for it by design —
  // the Nota de Crédito doc-type badge already conveys rectificative)
  it('renders cleanly with the hasRectifications enrichment field present', () => {
    const { container } = render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, hasRectifications: true }}
      />,
    );
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('statusPending')).toBeInTheDocument();
  });
});

// ── ETP-4738: Factura Rectificativa de Compra recognized via apInvoiceSubtype ──
// A Factura Rectificativa with a negative total is reclassified server-side to
// apInvoiceSubtype: 'RECTIFICATIVA' (unified with the legacy AP CreditMemo subtype
// per ETP-4737), but its doc-type identifier ("Factura Rectificativa") is not one
// of the two hardcoded legacy doc-type-name checks ('Nota de Crédito' / 'AP
// CreditMemo'). isCreditType must still recognize it via the server-injected
// subtype field alone. This exercises the REAL
// artifacts/purchase-invoice/custom/purchaseInvoiceSubtype.js (not mocked here
// — @generated resolves to artifacts/ in vitest.config.js).
describe('PurchaseInvoiceTopbar — apInvoiceSubtype recognizes Factura Rectificativa (ETP-4738)', () => {
  const props = {
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

  const RECTIFICATIVA_DATA = {
    ...BASE_DATA,
    'transactionDocument$_identifier': 'Factura Rectificativa',
    apInvoiceSubtype: 'RECTIFICATIVA',
    grandTotalAmount: -15,
    outstandingAmount: -15,
  };

  it('shows the "Saldo a favor" badge for a Factura Rectificativa with apInvoiceSubtype RECTIFICATIVA and a nonzero remaining balance', () => {
    render(<PurchaseInvoiceTopbar {...props} data={RECTIFICATIVA_DATA} />);
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    expect(screen.queryByText('statusPending')).toBeNull();
  });

  it('shows the "Aplicada" pill for a Factura Rectificativa with apInvoiceSubtype RECTIFICATIVA once fully consumed', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...RECTIFICATIVA_DATA, outstandingAmount: 0 }}
      />,
    );
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
  });

  it('clicking the Factura Rectificativa "Saldo a favor" badge opens the payment history modal', () => {
    render(<PurchaseInvoiceTopbar {...props} data={RECTIFICATIVA_DATA} />);
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
    fireEvent.click(screen.getByText('cpFavorBadge'));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('regression guard: legacy doc-type-name fallback still works when apInvoiceSubtype is ABSENT (old/undeployed backend)', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...BASE_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('negative control: a normal invoice with apInvoiceSubtype "FAC" still shows the normal pending badge, never the credit badge', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...BASE_DATA, apInvoiceSubtype: 'FAC' }}
      />,
    );
    expect(screen.getByText('statusPending')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
    expect(screen.queryByText('cpCreditFullyApplied')).toBeNull();
  });
});

// ── Branch / fallback coverage (ETP-4738) ─────────────────────────────────────
// The post-clone redirect callback and the amount/currency defensive fallbacks
// were never exercised. Each test drives the real component and asserts the
// resulting behaviour (navigation target, rendered badge and amount).
describe('PurchaseInvoiceTopbar — branch/fallback coverage (ETP-4738)', () => {
  const props = {
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

  // ── onCloned redirect (uncovered lines 77-78) ──────────────────────────────

  it('navigates to the cloned invoice and closes the clone modal when the clone succeeds', () => {
    render(<PurchaseInvoiceTopbar {...props} />);
    fireEvent.click(screen.getByTestId('clone-btn'));
    expect(screen.getByTestId('clone-order-modal')).toBeInTheDocument();

    // The mocked CloneOrderModal invokes onCloned('new-id-123').
    fireEvent.click(screen.getByText('Confirm clone'));

    expect(routerMock.navigate).toHaveBeenCalledWith('/purchase-invoice/new-id-123');
    expect(screen.queryByTestId('clone-order-modal')).toBeNull();
  });

  it('does not navigate while the clone modal is merely open', () => {
    render(<PurchaseInvoiceTopbar {...props} />);
    fireEvent.click(screen.getByTestId('clone-btn'));
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  // ── grandTotal fallback (uncovered branch on line 30) ──────────────────────

  it('treats a missing grandTotalAmount as 0 and still shows the outstanding amount', () => {
    const data = { ...BASE_DATA, outstandingAmount: 250 };
    delete data.grandTotalAmount;
    render(<PurchaseInvoiceTopbar {...props} data={data} />);
    expect(screen.getByText('statusPending')).toBeInTheDocument();
    expect(screen.getByText('EUR:250')).toBeInTheDocument();
  });

  it('shows a fully-paid badge with a zero total when both amounts are missing', () => {
    const data = { ...BASE_DATA };
    delete data.grandTotalAmount;
    delete data.outstandingAmount;
    render(<PurchaseInvoiceTopbar {...props} data={data} />);
    // grandTotal 0 → outstanding 0 → isFullyPaid, totalPaid 0
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
    expect(screen.getByText('EUR:0')).toBeInTheDocument();
  });

  // ── currency fallbacks in the credit and paid badges (lines 111/126) ───────

  it('credit-note badge falls back to USD when the invoice carries no currency', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{
          ...BASE_DATA,
          'transactionDocument$_identifier': 'AP CreditMemo',
          'currency$_identifier': '',
          grandTotalAmount: -20,
          outstandingAmount: -20,
        }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    expect(screen.getByText('USD:20')).toBeInTheDocument();
  });

  it('paid badge falls back to USD when the invoice carries no currency', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...BASE_DATA, 'currency$_identifier': '', paymentComplete: true }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
    // grandTotal 1000 - outstanding 500 = 500 paid
    expect(screen.getByText('USD:500')).toBeInTheDocument();
  });

  it('credit-note badge uses the invoice currency when present', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{
          ...BASE_DATA,
          'transactionDocument$_identifier': 'AP CreditMemo',
          outstandingAmount: -20,
        }}
      />,
    );
    expect(screen.getByText('EUR:20')).toBeInTheDocument();
  });

  // ── no badge at all (and therefore no modal) on a draft invoice ────────────

  it('renders no clickable payment badge on a draft invoice, so no modal can open', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...BASE_DATA, documentStatus: 'DR' }}
      />,
    );
    expect(screen.queryByTestId('payment-status-badge')).toBeNull();
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
  });
});
