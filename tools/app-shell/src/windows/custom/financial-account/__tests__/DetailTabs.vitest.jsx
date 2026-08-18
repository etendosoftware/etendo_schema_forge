import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      financeAccountDetailTabMovements: 'Movimientos',
      financeAccountDetailTabReconciliation: 'Conciliación',
      financeAccountDetailTabStatements: 'Extractos',
      financeAccountDetailTabReconciliations: 'Reconciliaciones',
    };
    return map[key] ?? key;
  },
}));

import { DetailTabs, getVisibleTabs } from '../DetailTabs.jsx';

/** Bank/card is the pre-ETP-4795 shape: Movements, Reconciliation, Statements. */
const BANK = { isCash: false };
const CASH = { isCash: true };

function renderTabs(props = {}) {
  return render(
    <DetailTabs
      value="movements"
      onValueChange={() => {}}
      isCash={false}
      badges={{ movements: 0, reconciliation: 0 }}
      {...props}
    />,
  );
}

describe('getVisibleTabs (ETP-4795)', () => {
  it('gives a bank/card account Movements, Conciliación and Extractos', () => {
    expect(getVisibleTabs(false).map((t) => t.key))
      .toEqual(['movements', 'reconciliation', 'statements']);
  });

  it('swaps Extractos for Reconciliaciones on a cash account', () => {
    // A cash drawer has no bank statements to import, but it does accumulate reconciliation
    // documents from each close.
    expect(getVisibleTabs(true).map((t) => t.key))
      .toEqual(['movements', 'reconciliation', 'reconciliationList']);
  });

  it('hides BOTH type-dependent tabs while the account type is unknown', () => {
    // `undefined` = the account is still loading. Neither tab renders, so nothing appears for a
    // frame and then vanishes once the real type arrives — tabs only ever appear.
    expect(getVisibleTabs(undefined).map((t) => t.key))
      .toEqual(['movements', 'reconciliation']);
  });

  it('never returns an empty list, so the parent guard always has a tab to fall back to', () => {
    for (const isCash of [true, false, undefined, null]) {
      expect(getVisibleTabs(isCash).length).toBeGreaterThan(0);
    }
  });
});

describe('DetailTabs', () => {
  it('renders the three bank tab labels', () => {
    renderTabs(BANK);
    expect(screen.getByText('Movimientos')).toBeInTheDocument();
    expect(screen.getByText('Conciliación')).toBeInTheDocument();
    expect(screen.getByText('Extractos')).toBeInTheDocument();
  });

  it('hides Extractos and shows Reconciliaciones for a cash account', () => {
    renderTabs(CASH);
    expect(screen.queryByText('Extractos')).not.toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-reconciliation-list')).toBeInTheDocument();
  });

  it('keeps Conciliación and Reconciliaciones as two distinct, both-visible tabs', () => {
    // Their i18n keys differ by a single trailing "s"; this asserts they never collapse into one.
    renderTabs(CASH);
    expect(screen.getByText('Conciliación')).toBeInTheDocument();
    expect(screen.getByText('Reconciliaciones')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-reconciliation-list')).toBeInTheDocument();
  });

  it('renders neither type-dependent tab while the account is loading', () => {
    renderTabs({ isCash: undefined });
    expect(screen.queryByTestId('detail-tab-statements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('detail-tab-reconciliation-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-movements')).toBeInTheDocument();
  });

  it('displays the movements and reconciliation counts as badges (the others have none)', () => {
    renderTabs({ ...BANK, badges: { movements: 12, reconciliation: 3 } });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-selected="true"', () => {
    renderTabs({ ...BANK, value: 'reconciliation' });
    expect(screen.getByText('Conciliación').closest('button')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Movimientos').closest('button')).toHaveAttribute('aria-selected', 'false');
  });

  it('emits the clicked tab via onValueChange', () => {
    const onValueChange = vi.fn();
    renderTabs({ ...BANK, onValueChange });
    fireEvent.click(screen.getByText('Extractos'));
    expect(onValueChange).toHaveBeenCalledWith('statements');
  });

  it('emits the cash-only tab key when Reconciliaciones is clicked', () => {
    const onValueChange = vi.fn();
    renderTabs({ ...CASH, onValueChange });
    fireEvent.click(screen.getByText('Reconciliaciones'));
    expect(onValueChange).toHaveBeenCalledWith('reconciliationList');
  });

  it('renders zero badges (badge=0 is treated as a valid number)', () => {
    renderTabs(BANK);
    // Two "0" badges expected — movements and reconciliation; the others get no badge at all.
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  it('gives each tab a distinct data-testid (ETP-4553 — all 3 used to share one)', () => {
    renderTabs(BANK);
    expect(screen.getByTestId('detail-tab-movements')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('detail-tab-statements')).toBeInTheDocument();
  });
});
