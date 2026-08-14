/**
 * Tests for UserHeaderTable — ETP-4906 Users LIST GRID `headerTable` override. See the
 * file's own doc comment for why the grid is taken over entirely (only a
 * `customComponents.headerTable`/`list-modal` slot can resolve a named `cellType`
 * against a window-scoped registry) and its client-side role-filter contract.
 *
 * `RoleChipsCell`'s own fetch (`useUserRoleGridData`) and `RoleFilterControl`'s own
 * dropdown rendering are covered by their own suites. `RoleFilterControl` is stubbed
 * here (same "faithful-but-minimal stub" convention `AccountsHeaderTable.vitest.jsx`
 * uses for `DistinctValuesFilter`) so this file stays focused on the ONE thing it
 * genuinely owns: the `filteredData` client-side row-filtering logic driven off the
 * selected role id.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
}));
vi.mock('@/lib/userRoleAssignmentsApi.js', () => ({
  fetchUserRoleAssignments: vi.fn(),
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { fetchRolesOverview } from '@/lib/rolesApi.js';
import { fetchUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';

let tableProps = null;
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    tableProps = props;
    return (
      <div data-testid="data-table">
        {(props.data ?? []).map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`} />
        ))}
      </div>
    );
  },
}));

vi.mock('../RoleFilterControl.jsx', () => ({
  RoleFilterControl: ({ value, onChange, roles }) => (
    <div data-testid="stub-role-filter">
      <div data-testid="stub-role-filter-value">{value ?? '__null__'}</div>
      <div data-testid="stub-role-filter-count">{(roles ?? []).length}</div>
      <button type="button" data-testid="stub-select-role-fin" onClick={() => onChange('role-fin')}>fin</button>
      <button type="button" data-testid="stub-select-role-admin" onClick={() => onChange('role-admin')}>admin</button>
      <button type="button" data-testid="stub-clear-filter" onClick={() => onChange(null)}>clear</button>
    </div>
  ),
}));

import UserHeaderTable from '../UserHeaderTable.jsx';

const ROLES = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
  { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true },
];

const ROWS = [
  { id: 'user-1', name: 'Alice', defaultRole: 'role-composed-1' },
  { id: 'user-2', name: 'Bob', defaultRole: 'role-composed-2' },
  { id: 'user-3', name: 'Carol (Admin)', defaultRole: 'role-admin' },
];

function mockDataOk({
  roles = ROLES,
  assignments = { 'user-1': ['role-fin'], 'user-2': ['role-sales'] },
} = {}) {
  fetchRolesOverview.mockResolvedValue({ roles });
  fetchUserRoleAssignments.mockResolvedValue({ assignments });
}

beforeEach(() => {
  vi.clearAllMocks();
  tableProps = null;
});

describe('UserHeaderTable — layout', () => {
  it('renders the role-filter toolbar above the grid', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    expect(await screen.findByTestId('UserHeaderTable__toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('hands the fetched roles catalog down to the filter control', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    expect(await screen.findByTestId('stub-role-filter-count')).toHaveTextContent('3');
  });

  it('appends exactly one extra column (defaultRole → custom) after the hand-mirrored base columns', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    expect(tableProps.columns.map((c) => c.key)).toEqual([
      'name', 'firstName', 'lastName', 'businessPartner', 'email', 'locked', 'defaultRole',
    ]);
  });

  it('marks the defaultRole column as type "custom" with an identifier filterMode', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    const col = tableProps.columns.find((c) => c.key === 'defaultRole');
    expect(col.type).toBe('custom');
    expect(col.filterMode).toBe('identifier');
    expect(typeof col.render).toBe('function');
  });

  it('spreads unrelated props through to DataTable (pagination/sort/etc.)', async () => {
    mockDataOk();
    const onDataMutated = vi.fn();
    render(<UserHeaderTable data={ROWS} onDataMutated={onDataMutated} />);

    await screen.findByTestId('data-table');
    expect(tableProps.onDataMutated).toBe(onDataMutated);
    expect(tableProps.filters).toEqual(['name', 'email']);
  });

  it('renders with no rows and no crash when data is missing', async () => {
    mockDataOk();
    render(<UserHeaderTable />);

    expect(await screen.findByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId(/^row-/)).not.toBeInTheDocument();
  });
});

describe('UserHeaderTable — role filter (client-side row filtering)', () => {
  it('shows every row when no role filter is applied', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    expect(screen.getByTestId('row-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('row-user-3')).toBeInTheDocument();
  });

  it('filters to only users whose bulk assignments include the selected template role', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');

    fireEvent.click(screen.getByTestId('stub-select-role-fin'));

    expect(screen.getByTestId('row-user-1')).toBeInTheDocument(); // has role-fin
    expect(screen.queryByTestId('row-user-2')).not.toBeInTheDocument(); // has role-sales only
    expect(screen.queryByTestId('row-user-3')).not.toBeInTheDocument(); // classic Admin, no assignments entry
  });

  it('filters to only the classic-Admin user(s) when the admin role id is selected', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');

    fireEvent.click(screen.getByTestId('stub-select-role-admin'));

    expect(screen.queryByTestId('row-user-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-user-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-user-3')).toBeInTheDocument(); // defaultRole === adminRoleId
  });

  it('restores every row when the filter is cleared back to null', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');

    fireEvent.click(screen.getByTestId('stub-select-role-fin'));
    expect(screen.queryByTestId('row-user-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stub-clear-filter'));
    expect(screen.getByTestId('row-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('row-user-3')).toBeInTheDocument();
  });

  it('threads the selected role id down as the stub filter\'s current value', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');

    fireEvent.click(screen.getByTestId('stub-select-role-fin'));
    expect(screen.getByTestId('stub-role-filter-value')).toHaveTextContent('role-fin');
  });
});
