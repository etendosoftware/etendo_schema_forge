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
  fetchTemplateRoles: vi.fn(),
}));
vi.mock('@/lib/userRoleAssignmentsApi.js', () => ({
  fetchUserRoleAssignments: vi.fn(),
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  // ETP-4906 Round 4 (DEV wave 9) — UserHeaderTable now calls useLocaleSwitch() to build
  // its labelOverrides memo keyed by the current locale.
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
  // ETP-4830 scope addition — the new `invitationStatus` column's cell renders the
  // real (unmocked) `PendingInvitationPill`, which renders the real `DocumentStatusPill`,
  // which imports `useLocale` from `@/i18n` — stub it so that import doesn't crash.
  // Its own `label` is always explicit in `PendingInvitationPill`, so `dictionary` is
  // never actually read down `statusLabel`'s fallback path.
  useLocale: () => ({}),
}));

import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
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

// ETP-4830 (item #4) — UserHeaderTable mounts UserDebugPanel only while useUserDebugMode() is
// active. Mocked here so tests control activation directly rather than driving the real
// `debuguser` keystroke sequence.
let debugModeActive = false;
vi.mock('../useUserDebugMode.js', () => ({
  useUserDebugMode: () => debugModeActive,
}));
vi.mock('../UserDebugPanel.jsx', () => ({
  default: (props) => (
    <div data-testid="stub-user-debug-panel">
      <div data-testid="stub-user-debug-panel-count">{(props.users ?? []).length}</div>
    </div>
  ),
}));

import UserHeaderTable from '../UserHeaderTable.jsx';

// ETP-4906 DEV wave 7 — `useUserRoleGridData` (RoleChipsCell.jsx) now combines the 4
// system-level templates from `fetchTemplateRoles()` with `fetchRolesOverview()`'s
// tenant client-admin row. `ROLES` (the combined, merged shape) stays for assertions
// that only care about the final count/rendering.
const TEMPLATE_ROLES = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
];

const OVERVIEW_ROLES = [
  { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true },
];

const ROLES = [...TEMPLATE_ROLES, ...OVERVIEW_ROLES];

const ROWS = [
  { id: 'user-1', name: 'Alice', defaultRole: 'role-composed-1' },
  { id: 'user-2', name: 'Bob', defaultRole: 'role-composed-2' },
  { id: 'user-3', name: 'Carol (Admin)', defaultRole: 'role-admin' },
];

function mockDataOk({
  templateRoles = TEMPLATE_ROLES,
  overviewRoles = OVERVIEW_ROLES,
  assignments = { 'user-1': ['role-fin'], 'user-2': ['role-sales'] },
} = {}) {
  fetchTemplateRoles.mockResolvedValue({ roles: templateRoles });
  fetchRolesOverview.mockResolvedValue({ roles: overviewRoles });
  fetchUserRoleAssignments.mockResolvedValue({ assignments });
}

beforeEach(() => {
  vi.clearAllMocks();
  tableProps = null;
  debugModeActive = false;
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

  it('appends invitationStatus and defaultRole (both custom) after the hand-mirrored base columns', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    expect(tableProps.columns.map((c) => c.key)).toEqual([
      'name', 'businessPartner', 'email', 'locked', 'active', 'invitationStatus', 'defaultRole',
    ]);
  });

  // ETP-4830 — 'Activo' column smoke test. The generic `inlineToggle: true` →
  // `toggle: true` decisions.json wiring (generate-frontend.js) is exercised
  // generically by the plain generated UserTable.jsx path; this window bypasses
  // that generated table via `customComponents.headerTable`, so the hand-mirrored
  // column here needs its own confirmation that `toggle: true` survived the port.
  it('marks the active column as a boolean inline toggle', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    const col = tableProps.columns.find((c) => c.key === 'active');
    expect(col.type).toBe('boolean');
    expect(col.toggle).toBe(true);
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

  it('marks the invitationStatus column as type "custom" with a translated label and a render function', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    const col = tableProps.columns.find((c) => c.key === 'invitationStatus');
    expect(col.type).toBe('custom');
    expect(col.label).toBe('usersGridInvitationColumn');
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

  // ETP-4906 Round 4 (DEV wave 9) — `t('Default_Ad_Role_ID')` (the shared native AD
  // dictionary entry) always wins over `col.label` in DataTable's own header resolution
  // (`t(col.column) ?? col.label ?? col.key`), so the grid header kept reading "Default
  // Role"/"Rol por Defecto" even after the chip-render swap. `UserHeaderTable` now scopes
  // an override to just this grid via `labelOverrides`, keyed by locale, resolving
  // `Default_Ad_Role_ID` to the new `usersGridRolesColumn` i18n key instead of editing the
  // shared dictionary entry (which other windows/contexts also reference).
  it('overrides Default_Ad_Role_ID via labelOverrides to the usersGridRolesColumn i18n key, scoped to the current locale', async () => {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);

    await screen.findByTestId('data-table');
    expect(tableProps.labelOverrides.en_US.Default_Ad_Role_ID).toBe('usersGridRolesColumn');
  });

  it('merges with (does not clobber) any labelOverrides already passed down from the generated page', async () => {
    mockDataOk();
    render(
      <UserHeaderTable
        data={ROWS}
        labelOverrides={{ en_US: { SomeOtherColumn: 'Some Other Label' } }}
      />,
    );

    await screen.findByTestId('data-table');
    expect(tableProps.labelOverrides.en_US.SomeOtherColumn).toBe('Some Other Label');
    expect(tableProps.labelOverrides.en_US.Default_Ad_Role_ID).toBe('usersGridRolesColumn');
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

describe('UserHeaderTable — debug panel (ETP-4830, item #4)', () => {
  it('does not render the debug panel when debug mode is inactive', async () => {
    debugModeActive = false;
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');

    expect(screen.queryByTestId('stub-user-debug-panel')).not.toBeInTheDocument();
  });

  it('renders the debug panel, seeded with the grid rows, when debug mode is active', async () => {
    debugModeActive = true;
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');

    expect(screen.getByTestId('stub-user-debug-panel')).toBeInTheDocument();
    expect(screen.getByTestId('stub-user-debug-panel-count')).toHaveTextContent(String(ROWS.length));
  });
});

/**
 * ETP-4830 scope addition — the invitationStatus grid column's cell render. The
 * exhaustive status → visual-treatment matrix already has its own dedicated,
 * comprehensive suite (`PendingInvitationPill.vitest.jsx`) — the shared mapping this
 * grid column and the detail-header toolbar pill both reuse. These tests only confirm
 * this column genuinely wires that shared component in per-row (reads
 * `row.invitationStatus`, renders a blank cell for null/unrecognized/missing without
 * crashing), NOT the full state matrix again.
 */
describe('UserHeaderTable — invitationStatus column cell render (ETP-4830 scope addition)', () => {
  async function getInvitationColumn() {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');
    return tableProps.columns.find((c) => c.key === 'invitationStatus');
  }

  it.each(['PENDING', 'SENT'])('renders the amber pill for invitationStatus %s', async (status) => {
    const col = await getInvitationColumn();
    const { getByTestId } = render(col.render({ id: 'row-1', invitationStatus: status }));

    const pill = getByTestId('document-status-pill');
    expect(pill).toHaveAttribute('data-tone', 'warning');
    expect(pill).toHaveAttribute('data-status', status);
  });

  it('renders the red pill for invitationStatus DELIVERY_FAILED', async () => {
    const col = await getInvitationColumn();
    const { getByTestId } = render(col.render({ id: 'row-1', invitationStatus: 'DELIVERY_FAILED' }));

    const pill = getByTestId('document-status-pill');
    expect(pill).toHaveAttribute('data-tone', 'destructive');
  });

  it('renders the neutral (gray) pill for invitationStatus EXPIRED', async () => {
    const col = await getInvitationColumn();
    const { getByTestId } = render(col.render({ id: 'row-1', invitationStatus: 'EXPIRED' }));

    const pill = getByTestId('document-status-pill');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
  });

  it('renders the green (success) pill for invitationStatus ACCEPTED (ETP-4999)', async () => {
    const col = await getInvitationColumn();
    const { getByTestId } = render(col.render({ id: 'row-1', invitationStatus: 'ACCEPTED' }));

    const pill = getByTestId('document-status-pill');
    expect(pill).toHaveAttribute('data-tone', 'success');
  });

  it.each(['REVOKED', null, undefined, 'SOME_FUTURE_STATUS'])(
    'renders a blank cell (no crash) for invitationStatus %s',
    async (status) => {
      const col = await getInvitationColumn();
      const { container } = render(col.render({ id: 'row-1', invitationStatus: status }));

      expect(container).toBeEmptyDOMElement();
    },
  );

  it('renders a blank cell (no crash) when the row itself is undefined', async () => {
    const col = await getInvitationColumn();
    expect(() => render(col.render(undefined))).not.toThrow();
  });

  // ETP-4999 — the Figma spec gives the grid a short label ("Pendiente", ...)
  // distinct from the detail form's full sentence; `PendingInvitationPill`'s own
  // suite covers the full compact/non-compact matrix, this just confirms the grid
  // column actually opts into the short wording via `compact`.
  it('passes compact to PendingInvitationPill so the grid cell uses the short-wording i18n key (ETP-4999)', async () => {
    const col = await getInvitationColumn();
    const { getByTestId } = render(col.render({ id: 'row-1', invitationStatus: 'PENDING' }));

    expect(getByTestId('document-status-pill')).toHaveTextContent('pendingInvitationGridBadge');
  });
});

/**
 * ETP-4830 item #4 (reworked after human feedback — see `UserHeaderTable.jsx`'s own doc
 * comment) — `isOwner` is NOT a dedicated grid column, it's a small inline pill on the `name`
 * cell via `renderDefaultCell`'s existing `col.pill` mechanism (`DataTable.cellRenderers.jsx`,
 * already unit-tested for the generic `{when, label}` shape in
 * `DataTable.renderCellValue.vitest.jsx`) — these tests only confirm `UserHeaderTable` wires
 * the right `when`/`label` onto the `name` column's `pill` config.
 */
describe('UserHeaderTable — owner pill on the name column (ETP-4830 item #4)', () => {
  async function getNameColumn() {
    mockDataOk();
    render(<UserHeaderTable data={ROWS} />);
    await screen.findByTestId('data-table');
    return tableProps.columns.find((c) => c.key === 'name');
  }

  it('declares a pill config on the name column with the translated owner label', async () => {
    const col = await getNameColumn();
    expect(col.pill).toBeDefined();
    expect(col.pill.label).toBe('ownerBadge');
  });

  it('pill.when reads true for the owner row', async () => {
    const col = await getNameColumn();
    expect(col.pill.when({ id: 'row-1', isOwner: true })).toBe(true);
  });

  it.each([
    ['isOwner false', { id: 'row-1', isOwner: false }],
    ['isOwner absent', { id: 'row-1' }],
  ])('pill.when reads false for %s', async (_label, row) => {
    const col = await getNameColumn();
    expect(col.pill.when(row)).toBe(false);
  });

  it('the rest of the name column is unchanged (type/column/required preserved)', async () => {
    const col = await getNameColumn();
    expect(col.type).toBe('string');
    expect(col.column).toBe('Name');
    expect(col.required).toBe(true);
  });
});
