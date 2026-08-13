// --- Mocks (before imports) ---

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// --- Imports ---

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentConciliadoBadge from '../PaymentConciliadoBadge.jsx';

// --- Tests ---

describe('PaymentConciliadoBadge', () => {
  beforeEach(() => navigate.mockReset());

  it('renders nothing when data is undefined', () => {
    const { container } = render(<PaymentConciliadoBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when data has no status', () => {
    const { container } = render(<PaymentConciliadoBadge data={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-deposited status (e.g. draft)', () => {
    const { container } = render(<PaymentConciliadoBadge data={{ status: 'RPAP' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unknown/void status', () => {
    const { container } = render(<PaymentConciliadoBadge data={{ status: 'RPVOID' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['RPR', 'RDNC', 'PPM', 'PWNC', 'RPAE'])(
    'renders nothing for a deposited-but-not-cleared status %s',
    (status) => {
      const { container } = render(<PaymentConciliadoBadge data={{ status }} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('renders the conciliado badge for RPPC (Payment Cleared)', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPPC' }} />);
    const badge = screen.getByText('conciliado');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' });
  });

  it('renders the checkmark svg icon alongside the label', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPPC' }} />);
    expect(document.querySelector('svg polyline')).toBeInTheDocument();
  });

  it('renders a clickable button and navigates to the matched transaction when both financialTransactionId and account are present', async () => {
    const user = userEvent.setup();
    render(
      <PaymentConciliadoBadge
        data={{ status: 'RPPC', financialTransactionId: 'txn-1', account: 'acc-1' }}
      />,
    );
    const button = screen.getByTestId('payment-conciliado-go-to-transaction');
    expect(button.tagName).toBe('BUTTON');
    await user.click(button);
    expect(navigate).toHaveBeenCalledWith('/financial-account/acc-1?tab=movements&txn=txn-1');
  });

  it('falls back to the static pill when financialTransactionId is missing', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPPC', account: 'acc-1' }} />);
    expect(screen.queryByTestId('payment-conciliado-go-to-transaction')).not.toBeInTheDocument();
    const badge = screen.getByText('conciliado');
    expect(badge.closest('span')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falls back to the static pill when account is missing', () => {
    render(<PaymentConciliadoBadge data={{ status: 'RPPC', financialTransactionId: 'txn-1' }} />);
    expect(screen.queryByTestId('payment-conciliado-go-to-transaction')).not.toBeInTheDocument();
    const badge = screen.getByText('conciliado');
    expect(badge.closest('span')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
