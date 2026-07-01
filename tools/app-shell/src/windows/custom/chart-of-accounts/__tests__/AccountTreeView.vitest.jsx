// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

// Stub NewAccountModal — AccountTreeView.jsx's own tree logic is what this
// suite targets; NewAccountModal has its own dedicated test file.
vi.mock('../NewAccountModal', () => ({
  default: ({ isOpen, onClose, onSaved, currentRecord }) =>
    isOpen ? (
      <div data-testid="new-account-modal-stub">
        <span data-testid="modal-current-record-id">{currentRecord?.id ?? 'none'}</span>
        <button type="button" data-testid="modal-close" onClick={onClose}>close</button>
        <button type="button" data-testid="modal-save" onClick={onSaved}>save</button>
      </div>
    ) : null,
}));

import AccountTreeView from '../AccountTreeView.jsx';

const DATA = [
  { id: 'acc-40000001', searchKey: '40000002', name: 'Sales EU', ytdDebit: 100, ytdCredit: 50, ytdBalance: 50, parentCode4: '4000', parentCode4Name: 'Sales', hasChildren: false, summaryLevel: 'N' },
  { id: 'acc-40000000', searchKey: '40000001', name: 'Sales US', ytdDebit: 10, ytdCredit: 5, ytdBalance: -5, parentCode4: '4000', parentCode4Name: 'Sales', hasChildren: false, summaryLevel: 'N' },
  { id: 'acc-50000001', searchKey: '50000001', name: 'Purchases US', ytdDebit: 0, ytdCredit: 0, ytdBalance: null, parentCode4: '5000', parentCode4Name: 'Purchases', hasChildren: false, summaryLevel: 'N' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountTreeView', () => {
  it('shows the empty state when there are no accounts', () => {
    render(<AccountTreeView data={[]} />);
    expect(screen.getByText('accountTreeNoAccounts')).toBeInTheDocument();
  });

  it('groups accounts by parentCode4 and auto-expands the group headers', () => {
    render(<AccountTreeView data={DATA} />);
    // Group headers are visible…
    expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-5000')).toBeInTheDocument();
    // …and their children too, since groups auto-expand on load.
    expect(screen.getByTestId('account-tree-row-acc-40000001')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
  });

  it('sorts children within a group by searchKey', () => {
    render(<AccountTreeView data={DATA} />);
    const rows = screen.getAllByRole('row').map((r) => r.getAttribute('data-testid'));
    const idxUS = rows.indexOf('account-tree-row-acc-40000000'); // 40000001
    const idxEU = rows.indexOf('account-tree-row-acc-40000001'); // 40000002
    expect(idxUS).toBeLessThan(idxEU);
  });

  it('collapsing a group hides its children without affecting other groups', () => {
    render(<AccountTreeView data={DATA} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-40000001')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
  });

  it('toggling a group chevron does not select the row or call onNavigate', () => {
    const onNavigate = vi.fn();
    render(<AccountTreeView data={DATA} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-toggle-group-4000'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tree-row-group-4000')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a leaf row selects it and calls onNavigate with the item', () => {
    const onNavigate = vi.fn();
    render(<AccountTreeView data={DATA} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-row-acc-40000000'));

    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-40000000' }));
    expect(screen.getByTestId('account-tree-row-acc-40000000')).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a virtual group row selects it but does not call onNavigate', () => {
    const onNavigate = vi.fn();
    render(<AccountTreeView data={DATA} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('account-tree-row-group-4000'));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('account-tree-row-group-4000')).toHaveAttribute('aria-selected', 'true');
  });

  it('"Contraer" (collapse all) hides every group\'s children', () => {
    render(<AccountTreeView data={DATA} />);
    fireEvent.click(screen.getByText('collapse'));

    expect(screen.queryByTestId('account-tree-row-acc-40000000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-50000001')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-4000')).toBeInTheDocument();
  });

  it('"Expandir" (expand all) re-reveals every group\'s children', () => {
    render(<AccountTreeView data={DATA} />);
    fireEvent.click(screen.getByText('collapse'));
    fireEvent.click(screen.getByText('expand'));

    expect(screen.getByTestId('account-tree-row-acc-40000000')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-50000001')).toBeInTheDocument();
  });

  it('formats null balances as an em dash and negative balances distinctly', () => {
    render(<AccountTreeView data={DATA} />);
    const negativeRow = screen.getByTestId('account-tree-row-acc-40000000');
    expect(negativeRow.textContent).toContain('-5,00');

    const nullBalanceRow = screen.getByTestId('account-tree-row-acc-50000001');
    expect(nullBalanceRow.textContent).toContain('—');
  });

  it('calls onColumnsReady with the tree column definitions', () => {
    const onColumnsReady = vi.fn();
    render(<AccountTreeView data={DATA} onColumnsReady={onColumnsReady} />);
    expect(onColumnsReady).toHaveBeenCalled();
    const cols = onColumnsReady.mock.calls.at(-1)[0];
    expect(cols.map((c) => c.key)).toEqual(['searchKey', 'name', 'accountType', 'active', 'ytdDebit', 'ytdCredit', 'ytdBalance']);
  });

  it('opens the New Sub-account modal with no current record when nothing is selected', () => {
    render(<AccountTreeView data={DATA} />);
    fireEvent.click(screen.getByText('+ newSubAccount'));

    expect(screen.getByTestId('new-account-modal-stub')).toBeInTheDocument();
    expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('none');
  });

  it('opens the modal with the selected row as the current record', () => {
    render(<AccountTreeView data={DATA} />);
    fireEvent.click(screen.getByTestId('account-tree-row-acc-40000000'));
    fireEvent.click(screen.getByText('+ newSubAccount'));

    expect(screen.getByTestId('modal-current-record-id')).toHaveTextContent('acc-40000000');
  });

  it('closes the modal via onClose without side effects', () => {
    render(<AccountTreeView data={DATA} />);
    fireEvent.click(screen.getByText('+ newSubAccount'));
    fireEvent.click(screen.getByTestId('modal-close'));

    expect(screen.queryByTestId('new-account-modal-stub')).not.toBeInTheDocument();
  });

  it('closes the modal and calls onDataMutated when a new account is saved', () => {
    const onDataMutated = vi.fn();
    render(<AccountTreeView data={DATA} onDataMutated={onDataMutated} />);
    fireEvent.click(screen.getByText('+ newSubAccount'));
    fireEvent.click(screen.getByTestId('modal-save'));

    expect(screen.queryByTestId('new-account-modal-stub')).not.toBeInTheDocument();
    expect(onDataMutated).toHaveBeenCalled();
  });
});
