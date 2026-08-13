import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    if (key === 'financeAccountsReconcilePending') return `Conciliar (${params.count})`;
    if (key === 'financeAccountsStatusReconciled') return 'Conciliado';
    return key;
  },
}));

import { ReconcilePill } from '../ReconcilePill.jsx';

describe('ReconcilePill', () => {
  it('renders the "Conciliado" badge when pendingCount is 0', () => {
    render(<ReconcilePill pendingCount={0} />);
    expect(screen.getByTestId('reconcile-status-reconciled')).toBeInTheDocument();
    expect(screen.queryByTestId('reconcile-status-pending')).not.toBeInTheDocument();
  });

  it('renders the "Conciliado" badge when pendingCount is missing', () => {
    render(<ReconcilePill />);
    expect(screen.getByTestId('reconcile-status-reconciled')).toBeInTheDocument();
  });

  it('renders the pending pill with the interpolated count', () => {
    render(<ReconcilePill pendingCount={7} />);
    const pill = screen.getByTestId('reconcile-status-pending');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent('Conciliar (7)');
  });

  it('fires onClick when the pending pill is clicked', () => {
    const onClick = vi.fn();
    render(<ReconcilePill pendingCount={3} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('reconcile-status-pending'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render a clickable target when reconciled', () => {
    const onClick = vi.fn();
    render(<ReconcilePill pendingCount={0} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('reconcile-status-reconciled'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
