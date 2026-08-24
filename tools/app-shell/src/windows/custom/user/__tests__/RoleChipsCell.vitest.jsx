/**
 * Tests for RoleChipsCell — ETP-4906 Users LIST GRID "Rol" column renderer, plus the
 * colocated `useUserRoleGridData()` hook and the `resolveUserId`/`resolveDefaultRoleId`
 * pure helpers it exports. See the file's own doc comment for the Admin-branch
 * detection rule (a classic-Admin user's `defaultRole` IS the admin role id, so it must
 * never fall through to the (empty, for them) bulk assignments lookup) and the single
 * fetch-ownership contract (`useUserRoleGridData` is the ONE call site for the grid).
 */
import { render, screen, waitFor, renderHook } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
  fetchTemplateRoles: vi.fn(),
}));

vi.mock('@/lib/userRoleAssignmentsApi.js', () => ({
  fetchUserRoleAssignments: vi.fn(),
}));

import { fetchRolesOverview, fetchTemplateRoles } from '@/lib/rolesApi.js';
import { fetchUserRoleAssignments } from '@/lib/userRoleAssignmentsApi.js';
import RoleChipsCell, {
  resolveUserId, resolveDefaultRoleId, useUserRoleGridData,
} from '../RoleChipsCell.jsx';

// ETP-4906 DEV wave 7 — `useUserRoleGridData` now combines TWO sources: the 4 system-level
// templates from `fetchTemplateRoles()` (`SFSystemRoleTemplates`, never a client-admin row)
// and `fetchRolesOverview()` (`SFRolesOverview`), kept ONLY for its tenant client-admin row.
// The hook's `roles` output is `[...templateRoles, adminRole]` (if an admin row is present).
const TEMPLATE_ROLES = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
  { id: 'role-purch', name: 'Purchasing' },
];

const OVERVIEW_ROLES_WITH_ADMIN = [
  { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true },
];

// Combined shape the hook is expected to expose — used directly by the RoleChipsCell
// rendering tests below (which drive the component via props, not the hook).
const ROLES = [...TEMPLATE_ROLES, ...OVERVIEW_ROLES_WITH_ADMIN];

const ROLES_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

describe('resolveUserId (pure helper)', () => {
  it('returns null for null/undefined/empty id', () => {
    expect(resolveUserId({ id: null })).toBeNull();
    expect(resolveUserId({ id: undefined })).toBeNull();
    expect(resolveUserId({ id: '' })).toBeNull();
    expect(resolveUserId({})).toBeNull();
    expect(resolveUserId(null)).toBeNull();
  });

  it('returns the id as a plain string', () => {
    expect(resolveUserId({ id: 'user-1' })).toBe('user-1');
    expect(resolveUserId({ id: 42 })).toBe('42');
  });
});

describe('resolveDefaultRoleId (pure helper)', () => {
  it('returns null for null/undefined/empty defaultRole', () => {
    expect(resolveDefaultRoleId({ defaultRole: null })).toBeNull();
    expect(resolveDefaultRoleId({ defaultRole: undefined })).toBeNull();
    expect(resolveDefaultRoleId({ defaultRole: '' })).toBeNull();
    expect(resolveDefaultRoleId({})).toBeNull();
  });

  it('returns a plain id string as-is', () => {
    expect(resolveDefaultRoleId({ defaultRole: 'role-fin' })).toBe('role-fin');
  });

  it('extracts id from an {id,...} object shape', () => {
    expect(resolveDefaultRoleId({ defaultRole: { id: 'role-fin', name: 'Finance' } })).toBe('role-fin');
  });

  it('extracts value from a {value,...} object shape when no id', () => {
    expect(resolveDefaultRoleId({ defaultRole: { value: 'role-fin' } })).toBe('role-fin');
  });

  it('returns null for an object with an empty id/value', () => {
    expect(resolveDefaultRoleId({ defaultRole: { id: '' } })).toBeNull();
  });
});

describe('useUserRoleGridData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in a loading state with empty roles/assignments', () => {
    fetchTemplateRoles.mockReturnValue(new Promise(() => {}));
    fetchRolesOverview.mockReturnValue(new Promise(() => {}));
    fetchUserRoleAssignments.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUserRoleGridData());

    expect(result.current.loading).toBe(true);
    expect(result.current.roles).toEqual([]);
    expect(result.current.assignments).toEqual({});
    expect(result.current.adminRoleId).toBeNull();
  });

  it('fetches SFSystemRoleTemplates, SFRolesOverview and the bulk SFUserRoleAssignments once, in parallel', async () => {
    fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLES });
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    fetchUserRoleAssignments.mockResolvedValue({ assignments: { 'user-1': ['role-fin'] } });
    renderHook(() => useUserRoleGridData());

    await waitFor(() => {
      expect(fetchTemplateRoles).toHaveBeenCalledTimes(1);
      expect(fetchRolesOverview).toHaveBeenCalledTimes(1);
      expect(fetchUserRoleAssignments).toHaveBeenCalledTimes(1);
    });
    // No args → bulk mode, not a specific user.
    expect(fetchUserRoleAssignments).toHaveBeenCalledWith();
  });

  it('resolves roles (templates + tenant client-admin row), rolesById and the bulk assignments map after all fetches settle', async () => {
    fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLES });
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    fetchUserRoleAssignments.mockResolvedValue({ assignments: { 'user-1': ['role-fin', 'role-sales'] } });
    const { result } = renderHook(() => useUserRoleGridData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual(ROLES);
    expect(result.current.rolesById['role-fin']).toEqual(TEMPLATE_ROLES[0]);
    expect(result.current.assignments).toEqual({ 'user-1': ['role-fin', 'role-sales'] });
    expect(result.current.error).toBeNull();
  });

  it('resolves adminRoleId from SFRolesOverview\'s isClientAdmin entry (never from the templates)', async () => {
    fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLES });
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    fetchUserRoleAssignments.mockResolvedValue({ assignments: {} });
    const { result } = renderHook(() => useUserRoleGridData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.adminRoleId).toBe('role-admin');
  });

  it('leaves adminRoleId null when SFRolesOverview carries no client-admin row', async () => {
    fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLES });
    fetchRolesOverview.mockResolvedValue({ roles: [] });
    fetchUserRoleAssignments.mockResolvedValue({ assignments: {} });
    const { result } = renderHook(() => useUserRoleGridData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.adminRoleId).toBeNull();
    expect(result.current.roles).toEqual(TEMPLATE_ROLES);
  });

  it('sets error and stops loading when any of the three fetches rejects', async () => {
    fetchTemplateRoles.mockRejectedValue(new Error('boom'));
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    fetchUserRoleAssignments.mockResolvedValue({ assignments: {} });
    const { result } = renderHook(() => useUserRoleGridData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('defaults roles/assignments defensively when the responses omit the expected arrays/objects', async () => {
    fetchTemplateRoles.mockResolvedValue({});
    fetchRolesOverview.mockResolvedValue({});
    fetchUserRoleAssignments.mockResolvedValue({});
    const { result } = renderHook(() => useUserRoleGridData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(result.current.assignments).toEqual({});
  });
});

describe('RoleChipsCell', () => {
  function renderCell(props = {}) {
    return render(
      <RoleChipsCell
        row={{ id: 'user-1', defaultRole: 'role-fin' }}
        rolesById={ROLES_BY_ID}
        adminRoleId="role-admin"
        assignments={{ 'user-1': ['role-fin', 'role-sales'] }}
        loading={false}
        {...props}
      />,
    );
  }

  it('renders a skeleton while the grid-wide bulk data is still loading', () => {
    renderCell({ loading: true });
    expect(screen.getByTestId('RoleChipsCell__skeleton')).toBeInTheDocument();
  });

  it('renders the generic admin chip for a classic-Admin user, bypassing the assignments lookup entirely', () => {
    renderCell({
      row: { id: 'admin-user', defaultRole: 'role-admin' },
      assignments: {}, // deliberately empty — proves the admin branch never consults it
    });

    expect(screen.getByTestId('RoleChipsCell__admin')).toBeInTheDocument();
    expect(screen.getByTestId('RoleChipsCell__admin')).toHaveTextContent('roleNameAdmin');
    expect(screen.queryByTestId('RoleChipsCell__empty')).not.toBeInTheDocument();
  });

  it('does not take the admin branch when adminRoleId is unresolved (null)', () => {
    renderCell({
      row: { id: 'admin-user', defaultRole: 'role-admin' },
      adminRoleId: null,
      assignments: {},
    });

    expect(screen.queryByTestId('RoleChipsCell__admin')).not.toBeInTheDocument();
    expect(screen.getByTestId('RoleChipsCell__empty')).toBeInTheDocument();
  });

  it('renders an empty-dash cell when the user has no applied template roles', () => {
    renderCell({ row: { id: 'user-2', defaultRole: 'role-fin' }, assignments: {} });
    expect(screen.getByTestId('RoleChipsCell__empty')).toBeInTheDocument();
  });

  it('renders chips for every applied template role, resolved through rolesById + roleNameI18n', () => {
    renderCell();
    const chips = screen.getByTestId('RoleChipsCell__chips');
    expect(chips).toHaveTextContent('roleNameFinance');
    expect(chips).toHaveTextContent('roleNameSales');
  });

  it('drops an applied role id that has no matching entry in rolesById', () => {
    renderCell({ assignments: { 'user-1': ['role-fin', 'unknown-role-id'] } });
    const chips = screen.getByTestId('RoleChipsCell__chips');
    expect(chips).toHaveTextContent('roleNameFinance');
    // 1 known role → exactly 1 rendered chip, no overflow badge for the dropped unknown id.
    expect(screen.queryByTestId('RoleChipsCell__overflow')).not.toBeInTheDocument();
  });

  it('caps visible chips at MAX_CHIPS (2) and shows a "+N" overflow badge beyond that', () => {
    renderCell({ assignments: { 'user-1': ['role-fin', 'role-sales', 'role-purch'] } });

    const overflow = screen.getByTestId('RoleChipsCell__overflow');
    expect(overflow).toHaveTextContent('+1');
  });

  it('resolves an applied admin-flagged role (if one ever appears in assignments) through the generic admin i18n key', () => {
    renderCell({ assignments: { 'user-1': ['role-admin'] } });
    const chips = screen.getByTestId('RoleChipsCell__chips');
    expect(chips).toHaveTextContent('roleNameAdmin');
  });

  it('never crashes when the row has no resolvable user id', () => {
    renderCell({ row: { defaultRole: 'role-fin' } });
    expect(screen.getByTestId('RoleChipsCell__empty')).toBeInTheDocument();
  });

  // ETP-4906 — `data-testid` wrapper prop (was silently dropped: the component's
  // signature never accepted it). Defaults to `RoleChipsCell__cell`, applied on the
  // root of every branch, additional to (never replacing) that branch's own internal,
  // hardcoded testid.
  describe('data-testid wrapper prop', () => {
    it('defaults to RoleChipsCell__cell and wraps the skeleton branch', () => {
      renderCell({ loading: true });
      const wrapper = screen.getByTestId('RoleChipsCell__cell');
      expect(wrapper).toContainElement(screen.getByTestId('RoleChipsCell__skeleton'));
    });

    it('defaults to RoleChipsCell__cell and wraps the admin branch', () => {
      renderCell({ row: { id: 'admin-user', defaultRole: 'role-admin' }, assignments: {} });
      const wrapper = screen.getByTestId('RoleChipsCell__cell');
      expect(wrapper).toContainElement(screen.getByTestId('RoleChipsCell__admin'));
    });

    it('defaults to RoleChipsCell__cell and wraps the empty branch', () => {
      renderCell({ row: { id: 'user-2', defaultRole: 'role-fin' }, assignments: {} });
      const wrapper = screen.getByTestId('RoleChipsCell__cell');
      expect(wrapper).toContainElement(screen.getByTestId('RoleChipsCell__empty'));
    });

    it('defaults to RoleChipsCell__cell and wraps the chips branch', () => {
      renderCell();
      const wrapper = screen.getByTestId('RoleChipsCell__cell');
      expect(wrapper).toContainElement(screen.getByTestId('RoleChipsCell__chips'));
    });

    it('honors a caller-supplied override instead of the default', () => {
      renderCell({ 'data-testid': 'custom-role-cell' });
      expect(screen.getByTestId('custom-role-cell')).toBeInTheDocument();
      expect(screen.queryByTestId('RoleChipsCell__cell')).not.toBeInTheDocument();
    });
  });
});
