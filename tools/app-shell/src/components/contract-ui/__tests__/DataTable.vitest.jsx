import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => raw,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label }) => <span>{label}</span>,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (cur, val) => val != null ? String(val) : '',
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DataTable } from '../DataTable.jsx';

const COLUMNS = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'amount', label: 'Amount', type: 'amount' },
  { key: 'status', label: 'Status', type: 'status' },
];

const DATA = [
  { id: '1', name: 'Order A', amount: 100, status: 'DR' },
  { id: '2', name: 'Order B', amount: 200, status: 'CO' },
];

describe('DataTable', () => {
  it('renders without crashing with empty data', () => {
    render(<DataTable columns={COLUMNS} data={[]} />);
    // Empty state should be visible
    expect(screen.getByText('noRecordsYet')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders data rows', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('Order A')).toBeInTheDocument();
    expect(screen.getByText('Order B')).toBeInTheDocument();
  });

  it('renders amount values', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('renders row test ids', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-2')).toBeInTheDocument();
  });

  it('shows empty state with filter hint when data is filtered to empty', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        filters={['name']}
      />
    );
    expect(screen.getByText('noRecordsYet')).toBeInTheDocument();
  });

  it('calls onNavigate when a row is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <DataTable columns={COLUMNS} data={DATA} onNavigate={onNavigate} />
    );
    await user.click(screen.getByTestId('row-1'));
    expect(onNavigate).toHaveBeenCalledWith(DATA[0]);
  });

  it('renders loading skeleton when loading is true', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} data={[]} loading={true} />
    );
    // Skeleton renders animated placeholder divs
    expect(container.querySelector('.space-y-2')).toBeInTheDocument();
  });

  it('renders checkboxes when selectable is true (default)', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    // Header checkbox + 2 row checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3);
  });

  it('does not render checkboxes when selectable is false', () => {
    render(<DataTable columns={COLUMNS} data={DATA} selectable={false} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('renders delete button when onDeleteRow is provided', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        onDeleteRow={vi.fn()}
      />
    );
    const deleteButtons = screen.getAllByTitle('deleteRowTooltip');
    expect(deleteButtons.length).toBe(2);
  });

  it('renders boolean column as yes/no text', () => {
    const columns = [{ key: 'active', label: 'Active', type: 'boolean' }];
    const data = [
      { id: '1', active: true },
      { id: '2', active: false },
    ];
    render(<DataTable columns={columns} data={data} selectable={false} />);
    expect(screen.getByText('yes')).toBeInTheDocument();
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('renders footer totals for amount columns', () => {
    render(
      <DataTable columns={COLUMNS} data={DATA} selectable={false} showFooterTotals={true} />
    );
    // Total of 100 + 200 = 300
    expect(screen.getByText('300')).toBeInTheDocument();
  });
});

/**
 * Behavior-lock tests for the internal `filteredData` useMemo in DataTable.
 *
 * The memo composes three filter passes in order:
 *   1. searchQuery (local) — skipped entirely when `onFilterChange` is provided
 *      (backend owns the search axis).
 *   2. rowFilter (always local) — applied AFTER search regardless of onFilterChange.
 *
 * Note: `searchQuery` is internal state (useState) with no external setter wired
 * into DataTable's props. The behaviors that depend on a non-empty searchQuery
 * (behaviors 2, 3, 5) therefore cannot be exercised from the public component
 * API; they are documented here for the refactor but locked at the
 * "searchQuery === ''" branch (the only reachable state).
 *
 * What we DO lock from outside:
 *  - B1: no search / no rowFilter / no onFilterChange → data passes through.
 *  - B4a: rowFilter without onFilterChange → applied to all rows.
 *  - B4b: rowFilter WITH onFilterChange → still applied locally.
 *  - B6:  rows with missing/null/undefined filter keys must not crash, and an
 *         empty searchQuery (the only reachable case) lets them pass — combined
 *         with a rowFilter that drops them, only the well-formed row survives.
 */
describe('DataTable — filteredData behavior lock', () => {
  const baseColumns = [
    { key: 'name', label: 'Name', type: 'string' },
  ];

  function getDataRowIds() {
    // Rows render with data-testid="row-<id>"; rely on the existing convention.
    return Array.from(document.querySelectorAll('[data-testid^="row-"]'))
      .map(el => el.getAttribute('data-testid'));
  }

  it('B1: passes data through untouched when no search, no rowFilter, no onFilterChange', () => {
    const data = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
      { id: '3', name: 'Gamma' },
    ];
    render(<DataTable columns={baseColumns} data={data} selectable={false} />);
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-2')).toBeInTheDocument();
    expect(screen.getByTestId('row-3')).toBeInTheDocument();
    expect(getDataRowIds()).toHaveLength(3);
  });

  it('B4a: applies rowFilter when onFilterChange is undefined', () => {
    const data = [
      { id: '1', name: 'Alpha', amount: 10 },
      { id: '2', name: 'Beta', amount: 0 },
      { id: '3', name: 'Gamma', amount: 50 },
    ];
    render(
      <DataTable
        columns={baseColumns}
        data={data}
        rowFilter={(row) => row.amount > 0}
        selectable={false}
      />
    );
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-3')).toBeInTheDocument();
    expect(getDataRowIds()).toHaveLength(2);
  });

  it('B4b: still applies rowFilter when onFilterChange is provided (backend search ignored locally)', () => {
    const data = [
      { id: '1', name: 'Alpha', amount: 10 },
      { id: '2', name: 'Beta', amount: 0 },
    ];
    render(
      <DataTable
        columns={baseColumns}
        data={data}
        rowFilter={(row) => row.amount > 0}
        onFilterChange={vi.fn()}
        selectable={false}
      />
    );
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
    expect(getDataRowIds()).toHaveLength(1);
  });

  it('B1 with onFilterChange: passes all rows through when no rowFilter (searchQuery empty, backend owns search)', () => {
    const data = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ];
    render(
      <DataTable
        columns={baseColumns}
        data={data}
        onFilterChange={vi.fn()}
        selectable={false}
      />
    );
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-2')).toBeInTheDocument();
    expect(getDataRowIds()).toHaveLength(2);
  });

  it('B6: rows with missing/null/undefined filter keys do not crash and pass through when searchQuery is empty', () => {
    const data = [
      { id: '1', name: 'Alpha' },
      { id: '2' /* name missing */ },
      { id: '3', name: null },
      { id: '4', name: undefined },
    ];
    expect(() => {
      render(
        <DataTable
          columns={baseColumns}
          data={data}
          filters={['name']}
          selectable={false}
        />
      );
    }).not.toThrow();
    // Empty searchQuery is short-circuited → all 4 rows pass.
    expect(getDataRowIds()).toHaveLength(4);
  });

  it('B6 combined with rowFilter: malformed rows survive search pass but rowFilter can still drop them', () => {
    const data = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: null },
      { id: '3' /* missing */ },
    ];
    render(
      <DataTable
        columns={baseColumns}
        data={data}
        filters={['name']}
        rowFilter={(row) => typeof row.name === 'string'}
        selectable={false}
      />
    );
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-3')).not.toBeInTheDocument();
    expect(getDataRowIds()).toHaveLength(1);
  });

  it('rowFilter is applied AFTER search (order lock): a rowFilter receiving all rows still drops correctly', () => {
    // Since searchQuery is always '' through the public API, search is a noop;
    // this confirms rowFilter sees the full data set and drops as expected.
    const seen = [];
    const data = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
      { id: '3', name: 'Gamma' },
    ];
    render(
      <DataTable
        columns={baseColumns}
        data={data}
        rowFilter={(row) => { seen.push(row.id); return row.name !== 'Beta'; }}
        selectable={false}
      />
    );
    // rowFilter may run multiple times (StrictMode / re-renders); assert it
    // sees the full unfiltered set rather than a subset.
    expect(new Set(seen)).toEqual(new Set(['1', '2', '3']));
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('row-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-3')).toBeInTheDocument();
  });
});