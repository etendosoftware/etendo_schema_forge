import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountDetailTabMovements: 'Movimientos',
      financeAccountDetailTabReconciliation: 'Conciliación',
      financeAccountDetailTabStatements: 'Extractos',
    };
    return map[key] ?? key;
  },
}));

import { DetailTabs } from '../DetailTabs.jsx';

describe('DetailTabs', () => {
  it('renders the three tab labels', () => {
    render(
      <DetailTabs
        value="movements"
        onValueChange={() => {}}
        movementsCount={0}
        reconciliationCount={0}
      />,
    );
    expect(screen.getByText('Movimientos')).toBeInTheDocument();
    expect(screen.getByText('Conciliación')).toBeInTheDocument();
    expect(screen.getByText('Extractos')).toBeInTheDocument();
  });

  it('displays the movements and reconciliation counts as badges (statements has none)', () => {
    render(
      <DetailTabs
        value="movements"
        onValueChange={() => {}}
        movementsCount={12}
        reconciliationCount={3}
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // The statements trigger has no numeric badge.
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-selected="true"', () => {
    render(
      <DetailTabs
        value="reconciliation"
        onValueChange={() => {}}
        movementsCount={0}
        reconciliationCount={0}
      />,
    );
    const reconciliation = screen.getByText('Conciliación').closest('button');
    const movements = screen.getByText('Movimientos').closest('button');
    expect(reconciliation).toHaveAttribute('aria-selected', 'true');
    expect(movements).toHaveAttribute('aria-selected', 'false');
  });

  it('emits the clicked tab via onValueChange', () => {
    const onValueChange = vi.fn();
    render(
      <DetailTabs
        value="movements"
        onValueChange={onValueChange}
        movementsCount={0}
        reconciliationCount={0}
      />,
    );
    fireEvent.click(screen.getByText('Extractos'));
    expect(onValueChange).toHaveBeenCalledWith('statements');
  });

  it('renders zero badges (badge=0 is treated as a valid number)', () => {
    render(
      <DetailTabs
        value="movements"
        onValueChange={() => {}}
        movementsCount={0}
        reconciliationCount={0}
      />,
    );
    // Two "0" badges expected — movements and reconciliation (statements has none).
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  it('gives each tab a distinct data-testid (ETP-4553 — all 3 used to share one)', () => {
    render(
      <DetailTabs
        value="movements"
        onValueChange={() => {}}
        movementsCount={0}
        reconciliationCount={0}
      />,
    );
    expect(screen.getByTestId('detail-tab-movements')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-statements')).toBeInTheDocument();
  });
});
