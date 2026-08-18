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

// ETP-4841: a credit instrument is one with a NEGATIVE total, whatever its
// document type. Every credit fixture below therefore carries negative amounts;
// the doc-type identifier / apInvoiceSubtype fields are only kept to prove they
// no longer decide anything.
const CREDIT_DATA = {
  ...BASE_DATA,
  grandTotalAmount: -1000,
  outstandingAmount: -500,
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

  it('shows the remaining credit badge for a negative-total AP CreditMemo', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...CREDIT_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('shows the remaining credit badge for a negative-total Nota de Crédito', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...CREDIT_DATA, 'transactionDocument$_identifier': 'Nota de Crédito' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('shows the remaining credit badge for a negative-total Factura Rectificativa (compras)', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...CREDIT_DATA, 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  // ETP-4841: apInvoiceSubtype used to select the credit branch. It no longer
  // participates at all — the same subtype yields opposite badges purely on sign.
  it('ignores apInvoiceSubtype entirely: the sign of the total decides the badge', () => {
    const asCredit = render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...CREDIT_DATA, apInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    asCredit.unmount();

    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, apInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }}
      />,
    );
    expect(screen.getByText('statusPending')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
  });

  it('shows the fully-applied badge when a credit has no remaining balance', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{
          ...CREDIT_DATA,
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

  it('clicking the credit badge opens the payment history modal (like the grid)', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...CREDIT_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
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

  it('falls back to the full grandTotal when outstandingAmount is absent — an unknown balance reads as UNPAID, never settled', () => {
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, outstandingAmount: null }}
      />,
    );
    // Safe direction by design: rendering "unknown" as "Pagada" would tell the
    // user an invoice is settled on no evidence. resolveInvoicePaymentBadge
    // therefore falls back to grandTotal (1000) → pending for the whole amount.
    expect(screen.getByText('statusPending')).toBeInTheDocument();
    expect(screen.queryByText('statusPaid')).toBeNull();
    expect(screen.getByText('EUR:1000')).toBeInTheDocument();
  });

  it('applies the same absent-value fallback when the outstandingAmount key is missing entirely', () => {
    const data = { ...BASE_DATA };
    delete data.outstandingAmount;
    render(<PurchaseInvoiceTopbar {...defaultProps} data={data} />);
    expect(screen.getByText('statusPending')).toBeInTheDocument();
    expect(screen.getByText('EUR:1000')).toBeInTheDocument();
  });

  it('a PRESENT zero outstandingAmount still means genuinely settled', () => {
    // The contrast that makes the fallback safe rather than sloppy: 0 is a real
    // answer, null/undefined/'' are the absence of one.
    render(
      <PurchaseInvoiceTopbar
        {...defaultProps}
        data={{ ...BASE_DATA, outstandingAmount: 0 }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
    expect(screen.queryByText('statusPending')).toBeNull();
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

// ── ETP-4841: the topbar badge follows the SIGN of the total ─────────────────
// The credit branch used to be selected by apInvoiceSubtype === 'RECTIFICATIVA'
// (ETP-4738). It now reads resolveInvoicePaymentBadge(data).isCredit, so the two
// mislabelled shapes below — a POSITIVE rectificativa and a NEGATIVE ordinary
// Factura — finally render the right badge.
describe('PurchaseInvoiceTopbar — sign-driven payment badge (ETP-4841)', () => {
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

  const NEGATIVE_RECTIFICATIVA_DATA = {
    ...BASE_DATA,
    'transactionDocument$_identifier': 'Factura Rectificativa',
    apInvoiceSubtype: 'RECTIFICATIVA',
    grandTotalAmount: -15,
    outstandingAmount: -15,
  };

  // Case A of the ETP-4841 matrix: billed 3, should have been 4 → a correction
  // invoice for the difference, PAYABLE like any other invoice.
  const POSITIVE_RECTIFICATIVA_DATA = {
    ...NEGATIVE_RECTIFICATIVA_DATA,
    grandTotalAmount: 15,
    outstandingAmount: 15,
  };

  // Case B: an ordinary Factura whose total came out negative → a credit.
  const NEGATIVE_ORDINARY_DATA = {
    ...BASE_DATA,
    apInvoiceSubtype: 'FAC',
    grandTotalAmount: -750,
    outstandingAmount: -750,
  };

  it('shows the credit badge for a NEGATIVE Factura Rectificativa with a remaining balance', () => {
    render(<PurchaseInvoiceTopbar {...props} data={NEGATIVE_RECTIFICATIVA_DATA} />);
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    expect(screen.getByText('EUR:15')).toBeInTheDocument();
    expect(screen.queryByText('statusPending')).toBeNull();
  });

  it('shows the fully-applied pill for a NEGATIVE Factura Rectificativa once fully consumed', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...NEGATIVE_RECTIFICATIVA_DATA, outstandingAmount: 0 }}
      />,
    );
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
  });

  it('clicking the credit badge opens the payment history modal', () => {
    render(<PurchaseInvoiceTopbar {...props} data={NEGATIVE_RECTIFICATIVA_DATA} />);
    expect(screen.queryByTestId('payment-history-modal')).toBeNull();
    fireEvent.click(screen.getByText('cpFavorBadge'));
    expect(screen.getByTestId('payment-history-modal')).toBeInTheDocument();
  });

  it('case A: a POSITIVE Factura Rectificativa shows the pending badge, never the credit one', () => {
    render(<PurchaseInvoiceTopbar {...props} data={POSITIVE_RECTIFICATIVA_DATA} />);
    expect(screen.getByText('statusPending')).toBeInTheDocument();
    expect(screen.getByText('EUR:15')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
    expect(screen.queryByText('cpCreditFullyApplied')).toBeNull();
  });

  it('case A: a POSITIVE Factura Rectificativa marked paymentComplete shows the paid badge', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...POSITIVE_RECTIFICATIVA_DATA, paymentComplete: 'Y' }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
  });

  it('case B: an ordinary Factura with a NEGATIVE total shows the credit badge, never "pagada"', () => {
    render(<PurchaseInvoiceTopbar {...props} data={NEGATIVE_ORDINARY_DATA} />);
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    expect(screen.getByText('EUR:750')).toBeInTheDocument();
    expect(screen.queryByText('statusPaid')).toBeNull();
  });

  it('case B: paymentComplete never turns a credit into the paid badge', () => {
    // isFullyPaid is gated on !badge.isCredit, so a credit stays a credit even
    // when Etendo has flagged the invoice as settled.
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...NEGATIVE_ORDINARY_DATA, paymentComplete: true }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
    expect(screen.queryByText('statusPaid')).toBeNull();
  });

  it('case C: a negative invoice with a zero outstanding shows the fully-applied pill', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...NEGATIVE_ORDINARY_DATA, outstandingAmount: 0 }}
      />,
    );
    expect(screen.getByText('cpCreditFullyApplied')).toBeInTheDocument();
  });

  it('case D: an OVERPAID positive invoice (outstanding < 0) shows the paid badge, not a credit', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...BASE_DATA, grandTotalAmount: 700, outstandingAmount: -50 }}
      />,
    );
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
  });

  it('case E: a draft credit shows no payment badge at all', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...NEGATIVE_ORDINARY_DATA, documentStatus: 'DR' }}
      />,
    );
    expect(screen.queryByTestId('payment-status-badge')).toBeNull();
    expect(screen.queryByText('cpFavorBadge')).toBeNull();
    expect(screen.queryByText('cpCreditFullyApplied')).toBeNull();
  });

  it('regression guard: an AP CreditMemo with no apInvoiceSubtype and a negative total is still a credit', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{ ...CREDIT_DATA, 'transactionDocument$_identifier': 'AP CreditMemo' }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
  });

  it('negative control: a normal positive invoice with apInvoiceSubtype "FAC" shows the pending badge', () => {
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
    // The absent-outstanding fallback lands on a grandTotal that is itself 0,
    // so there is genuinely nothing owed → isFullyPaid, totalPaid 0.
    expect(screen.getByText('statusPaid')).toBeInTheDocument();
    expect(screen.getByText('EUR:0')).toBeInTheDocument();
  });

  // ── currency fallbacks in the credit and paid badges (lines 111/126) ───────

  it('credit badge falls back to USD when the invoice carries no currency', () => {
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

  it('credit badge uses the invoice currency when present', () => {
    render(
      <PurchaseInvoiceTopbar
        {...props}
        data={{
          ...BASE_DATA,
          'transactionDocument$_identifier': 'AP CreditMemo',
          grandTotalAmount: -20,
          outstandingAmount: -20,
        }}
      />,
    );
    expect(screen.getByText('cpFavorBadge')).toBeInTheDocument();
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
