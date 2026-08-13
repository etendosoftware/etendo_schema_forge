import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ recordId: 'acc-1' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params && params.amount ? `${key}:${params.amount}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// Minimal Dialog stub: render children only when open.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  DialogTitle: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
}));

import { ReconciledTxnsModal } from '../ReconciledTxnsModal.jsx';

const TXN = {
  documentNo: '1000034', date: '2026-01-26T00:00:00Z', contact: 'Laura Morat',
  description: 'Invoice No.: 10000016.', trxType: 'BPW', paymentStatus: 'RPAP',
  amount: -500, transactionId: 'txn-1', paymentId: 'pay-1', paymentIsReceipt: 'N',
};

function line(overrides = {}) {
  return {
    id: 'l1', date: '2026-01-26T00:00:00Z', description: 'Pago proveedor',
    bpartnerFkName: 'Proveedor Norte S.L.', reference: 'REF9',
    in: 0, out: 500, txns: [TXN], ...overrides,
  };
}

describe('ReconciledTxnsModal', () => {
  beforeEach(() => navigate.mockReset());

  it('renders nothing when line is null', () => {
    const { container } = render(<ReconciledTxnsModal line={null} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull();
  });

  it('lists the reconciled transaction rows', () => {
    render(<ReconciledTxnsModal line={line()} currency="EUR" onClose={vi.fn()} />);
    expect(screen.getByTestId('reconciled-txn-row-1000034')).toBeInTheDocument();
    expect(screen.getByText('1000034')).toBeInTheDocument();
    expect(screen.getByText('Laura Morat')).toBeInTheDocument();
    // BPW maps to the "Pago" type label key.
    expect(screen.getByText('financeAccountMovementsTypeBPW')).toBeInTheDocument();
  });

  it('shows the balanced indicator when the sum equals the line net', () => {
    render(<ReconciledTxnsModal line={line()} currency="EUR" onClose={vi.fn()} />);
    expect(screen.getByText('financeAccountStatementLinesTxnBalancedShort')).toBeInTheDocument();
    expect(screen.queryByText(/financeAccountStatementLinesTxnDiff/)).not.toBeInTheDocument();
  });

  it('shows the difference indicator when the sum does not match', () => {
    // line net = -500 but the only txn is -300 → diff of -200.
    render(
      <ReconciledTxnsModal
        line={line({ txns: [{ ...TXN, amount: -300 }] })}
        currency="EUR"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/^financeAccountStatementLinesTxnDiff:/)).toBeInTheDocument();
    expect(screen.queryByText('financeAccountStatementLinesTxnBalanced')).not.toBeInTheDocument();
  });

  it('navigates to movements tab with txn highlight and closes when the arrow is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReconciledTxnsModal line={line()} currency="EUR" onClose={onClose} />);
    await user.click(screen.getByTestId('reconciled-txn-go-1000034'));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(
      '/financial-account/acc-1?tab=movements&txn=txn-1',
      { replace: true },
    );
  });

  it('navigates to movements tab for a receipt transaction', async () => {
    const user = userEvent.setup();
    render(
      <ReconciledTxnsModal
        line={line({ in: 500, out: 0, txns: [{ ...TXN, amount: 500, paymentIsReceipt: 'Y' }] })}
        currency="EUR"
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('reconciled-txn-go-1000034'));
    expect(navigate).toHaveBeenCalledWith(
      '/financial-account/acc-1?tab=movements&txn=txn-1',
      { replace: true },
    );
  });

  it('renders no go-to-movement button when the txn has no transactionId', () => {
    render(
      <ReconciledTxnsModal
        line={line({ txns: [{ ...TXN, transactionId: null }] })}
        currency="EUR"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('reconciled-txn-go-1000034')).not.toBeInTheDocument();
  });

  it('maps each transaction type to its label, falling back to the raw code', () => {
    render(
      <ReconciledTxnsModal
        line={line({
          txns: [
            { ...TXN, documentNo: 'BF-1', trxType: 'BF', transactionId: null },
            { ...TXN, documentNo: 'X-1', trxType: 'OTHER', transactionId: null },
          ],
        })}
        currency="EUR"
        onClose={vi.fn()}
      />,
    );
    // BF resolves to its i18n key; an unknown code is rendered verbatim.
    expect(screen.getByText('financeAccountMovementsTypeBF')).toBeInTheDocument();
    expect(screen.getByText('OTHER')).toBeInTheDocument();
  });
});
