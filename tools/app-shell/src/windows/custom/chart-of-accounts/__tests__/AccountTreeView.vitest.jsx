// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  ChevronRight: (props) => <span data-testid="chevron-right" {...props} />,
  ChevronDown: (props) => <span data-testid="chevron-down" {...props} />,
}));

// Stub the child modal so we only assert it is wired with the right props.
vi.mock('../NewAccountModal', () => ({
  default: ({ isOpen, currentRecord }) =>
    isOpen ? (
      <div
        data-testid="new-account-modal"
        data-current-id={currentRecord?.id ?? ''}
      />
    ) : null,
}));

// --- Import under test ---

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountTreeView from '../AccountTreeView.jsx';

// --- Fixtures ---

// All API records are leaves; the hierarchy is derived from parentCode4.
const DATA = [
  {
    id: 'acc-1',
    searchKey: '43000001',
    name: 'Client A',
    parentCode4: '4300',
    parentCode4Name: 'Clientes',
    summaryLevel: 'N',
    ytdDebit: 100,
    ytdCredit: 40,
    ytdBalance: 60,
  },
  {
    id: 'acc-2',
    searchKey: '43000002',
    name: 'Client B',
    parentCode4: '4300',
    parentCode4Name: 'Clientes',
    summaryLevel: 'N',
    ytdDebit: 0,
    ytdCredit: 200,
    ytdBalance: -200,
  },
  {
    id: 'acc-3',
    searchKey: '57000001',
    name: 'Bank',
    parentCode4: '5700',
    parentCode4Name: 'Tesoreria',
    summaryLevel: 'N',
    ytdDebit: 500,
    ytdCredit: 0,
    ytdBalance: 500,
  },
];

const defaultProps = {
  data: DATA,
  onNavigate: vi.fn(),
  onDataMutated: vi.fn(),
  token: 'test-token',
  apiBaseUrl: '/sws/neo/chart-of-accounts',
};

describe('AccountTreeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state when there is no data', () => {
    render(<AccountTreeView {...defaultProps} data={[]} />);
    expect(screen.getByText('accountTreeNoAccounts')).toBeInTheDocument();
    // Toolbar still renders, but no group rows
    expect(screen.queryByTestId('account-tree-row-group-4300')).not.toBeInTheDocument();
  });

  it('renders one virtual group header per parentCode4', () => {
    render(<AccountTreeView {...defaultProps} />);
    expect(screen.getByTestId('account-tree-row-group-4300')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-group-5700')).toBeInTheDocument();
  });

  it('expands all groups by default and shows their children', () => {
    render(<AccountTreeView {...defaultProps} />);
    expect(screen.getByTestId('account-tree-row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-2')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-3')).toBeInTheDocument();
  });

  it('aggregates child balances onto the group header', () => {
    render(<AccountTreeView {...defaultProps} />);
    const group = screen.getByTestId('account-tree-row-group-4300');
    // 60 + (-200) = -140, formatted es-style with grouping
    expect(within(group).getByText('-140,00')).toBeInTheDocument();
  });

  it('collapses a group when its toggle is clicked, hiding children', async () => {
    const user = userEvent.setup();
    render(<AccountTreeView {...defaultProps} />);
    await user.click(screen.getByTestId('account-tree-toggle-group-4300'));
    expect(screen.queryByTestId('account-tree-row-acc-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-2')).not.toBeInTheDocument();
    // The other group is unaffected
    expect(screen.getByTestId('account-tree-row-acc-3')).toBeInTheDocument();
  });

  it('collapse-all hides every child, expand-all restores them', async () => {
    const user = userEvent.setup();
    render(<AccountTreeView {...defaultProps} />);
    await user.click(screen.getByText('collapse'));
    expect(screen.queryByTestId('account-tree-row-acc-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-tree-row-acc-3')).not.toBeInTheDocument();

    await user.click(screen.getByText('expand'));
    expect(screen.getByTestId('account-tree-row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-tree-row-acc-3')).toBeInTheDocument();
  });

  it('calls onNavigate when a real account row is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    await user.click(screen.getByTestId('account-tree-row-acc-1'));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1' }),
    );
  });

  it('does NOT call onNavigate when a virtual group header is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AccountTreeView {...defaultProps} onNavigate={onNavigate} />);
    await user.click(screen.getByTestId('account-tree-row-group-4300'));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('opens NewAccountModal from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<AccountTreeView {...defaultProps} />);
    expect(screen.queryByTestId('new-account-modal')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /newSubAccount/ }));
    expect(screen.getByTestId('new-account-modal')).toBeInTheDocument();
  });

  it('passes the selected row to NewAccountModal as currentRecord', async () => {
    const user = userEvent.setup();
    render(<AccountTreeView {...defaultProps} />);
    await user.click(screen.getByTestId('account-tree-row-acc-3'));
    await user.click(screen.getByRole('button', { name: /newSubAccount/ }));
    expect(screen.getByTestId('new-account-modal')).toHaveAttribute(
      'data-current-id',
      'acc-3',
    );
  });

  it('reports the tree columns via onColumnsReady', () => {
    const onColumnsReady = vi.fn();
    render(<AccountTreeView {...defaultProps} onColumnsReady={onColumnsReady} />);
    expect(onColumnsReady).toHaveBeenCalled();
    const columns = onColumnsReady.mock.calls.at(-1)[0];
    expect(columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['searchKey', 'name', 'accountType', 'ytdBalance']),
    );
  });

  it('renders a dash for null amount values', () => {
    const data = [
      {
        id: 'acc-x',
        searchKey: '99000001',
        name: 'No amounts',
        parentCode4: '9900',
        parentCode4Name: 'Otros',
        summaryLevel: 'N',
        ytdDebit: null,
        ytdCredit: null,
        ytdBalance: null,
      },
    ];
    render(<AccountTreeView {...defaultProps} data={data} />);
    const row = screen.getByTestId('account-tree-row-acc-x');
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
  });
});
