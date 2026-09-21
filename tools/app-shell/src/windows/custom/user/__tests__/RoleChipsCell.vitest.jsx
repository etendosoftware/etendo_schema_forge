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
  resolveUserId, resolveDefaultRoleId, useUserRoleGridData, useRolesCatalog,
  hasNoRole, buildRoleEnumLabels, buildRoleFilterQueryParams, NO_ROLE_FILTER_VALUE,
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

// ---------------------------------------------------------------------------
// ETP-5188 — hasNoRole (Point 5 "Sin rol" predicate)
// ---------------------------------------------------------------------------

describe('hasNoRole (pure helper)', () => {
  it('returns true when the user has no entry at all in the assignments map', () => {
    expect(hasNoRole({ id: 'user-1', defaultRole: 'role-fin' }, {
      adminRoleId: 'role-admin',
      assignments: {},
    })).toBe(true);
  });

  it('returns true when the user has a present-but-empty assignments entry', () => {
    expect(hasNoRole({ id: 'user-1', defaultRole: 'role-fin' }, {
      adminRoleId: 'role-admin',
      assignments: { 'user-1': [] },
    })).toBe(true);
  });

  it('returns false when the user has at least one entry in the assignments map', () => {
    expect(hasNoRole({ id: 'user-1', defaultRole: 'role-fin' }, {
      adminRoleId: 'role-admin',
      assignments: { 'user-1': ['role-fin'] },
    })).toBe(false);
  });

  it('returns true (no role) for a row with a malformed/missing userId, even if assignments has other entries', () => {
    expect(hasNoRole({ defaultRole: 'role-fin' }, {
      adminRoleId: 'role-admin',
      assignments: { 'user-1': ['role-fin'] },
    })).toBe(true);
    expect(hasNoRole({ id: null, defaultRole: 'role-fin' }, {
      adminRoleId: 'role-admin',
      assignments: { 'user-1': ['role-fin'] },
    })).toBe(true);
  });

  it('never treats the classic-Admin user as "Sin rol", even though Admin has no assignments entry', () => {
    expect(hasNoRole({ id: 'admin-user', defaultRole: 'role-admin' }, {
      adminRoleId: 'role-admin',
      assignments: {}, // Admin genuinely has zero entries here — must not read as "no role"
    })).toBe(false);
  });

  it('does not take the admin short-circuit when adminRoleId is null/undefined, even if defaultRoleId happens to match a truthy string', () => {
    expect(hasNoRole({ id: 'user-1', defaultRole: 'role-admin' }, {
      adminRoleId: null,
      assignments: {},
    })).toBe(true); // falls through to the (empty) assignments check
    expect(hasNoRole({ id: 'user-1', defaultRole: 'role-admin' }, {
      adminRoleId: undefined,
      assignments: { 'user-1': ['role-fin'] },
    })).toBe(false); // falls through to the (non-empty) assignments check
  });

  it('does not take the admin short-circuit when defaultRoleId does not match a real adminRoleId', () => {
    expect(hasNoRole({ id: 'user-1', defaultRole: 'role-fin' }, {
      adminRoleId: 'role-admin',
      assignments: { 'user-1': ['role-fin'] },
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ETP-5188 — buildRoleEnumLabels (advanced-filter "Rol" field catalog)
// ---------------------------------------------------------------------------

describe('buildRoleEnumLabels (pure helper)', () => {
  const ui = (key) => key;

  it('always includes the "Sin rol" sentinel, even with an empty/null/undefined rolesById', () => {
    expect(buildRoleEnumLabels({}, ui)).toEqual({ [NO_ROLE_FILTER_VALUE]: 'noRole' });
    expect(buildRoleEnumLabels(null, ui)).toEqual({ [NO_ROLE_FILTER_VALUE]: 'noRole' });
    expect(buildRoleEnumLabels(undefined, ui)).toEqual({ [NO_ROLE_FILTER_VALUE]: 'noRole' });
  });

  it('resolves a client-admin role through the generic admin i18n key, not resolveRoleDisplayName', () => {
    const rolesById = { 'role-admin': { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true } };
    expect(buildRoleEnumLabels(rolesById, ui)).toEqual({
      [NO_ROLE_FILTER_VALUE]: 'noRole',
      'role-admin': 'roleNameAdmin',
    });
  });

  it('resolves a regular template role through resolveRoleDisplayName', () => {
    const rolesById = { 'role-fin': { id: 'role-fin', name: 'Finance' } };
    expect(buildRoleEnumLabels(rolesById, ui)).toEqual({
      [NO_ROLE_FILTER_VALUE]: 'noRole',
      'role-fin': 'roleNameFinance',
    });
  });

  it('skips a role with a null/undefined id', () => {
    const rolesById = { broken: { id: null, name: 'Broken' } };
    expect(buildRoleEnumLabels(rolesById, ui)).toEqual({ [NO_ROLE_FILTER_VALUE]: 'noRole' });
  });

  it('coerces a numeric role id to a string key', () => {
    const rolesById = { 42: { id: 42, name: 'Legacy' } };
    expect(buildRoleEnumLabels(rolesById, ui)).toEqual({
      [NO_ROLE_FILTER_VALUE]: 'noRole',
      42: 'Legacy',
    });
  });
});

// ---------------------------------------------------------------------------
// ETP-5188 — buildRoleFilterQueryParams (advanced-filter "Rol" → RoleIds=/
// NoRole=/RoleFilterNegate= translation)
// ---------------------------------------------------------------------------

describe('buildRoleFilterQueryParams (pure helper)', () => {
  it('returns null for an operator it does not translate (e.g. "contains")', () => {
    expect(buildRoleFilterQueryParams({ operator: 'contains', value: ['role-fin'] })).toBeNull();
  });

  it('returns null when the operator is undefined/missing', () => {
    expect(buildRoleFilterQueryParams({ value: ['role-fin'] })).toBeNull();
    expect(buildRoleFilterQueryParams({})).toBeNull();
  });

  it('returns null for equals/notEqual with an empty value array', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: [] })).toBeNull();
    expect(buildRoleFilterQueryParams({ operator: 'notEqual', value: [] })).toBeNull();
  });

  it('returns null for equals/notEqual when value is null/undefined/empty-string (no array at all)', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: null })).toBeNull();
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: undefined })).toBeNull();
    expect(buildRoleFilterQueryParams({ operator: 'equals' })).toBeNull();
  });

  it('accepts a single non-array value for equals (not just an array from the checkbox picker)', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: 'role-fin' })).toBe('RoleIds=role-fin');
  });

  it('builds RoleIds= for equals with one or more real role ids', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: ['role-fin'] })).toBe('RoleIds=role-fin');
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: ['role-fin', 'role-sales'] }))
      .toBe(`RoleIds=${encodeURIComponent('role-fin,role-sales')}`);
  });

  it('preserves duplicate ids in the value array as-is (no de-duplication)', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: ['role-fin', 'role-fin'] }))
      .toBe(`RoleIds=${encodeURIComponent('role-fin,role-fin')}`);
  });

  it('combines RoleIds= and NoRole= when the sentinel is mixed with real role ids (equals)', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: [NO_ROLE_FILTER_VALUE, 'role-fin', 'role-sales'] }))
      .toBe(`RoleIds=${encodeURIComponent('role-fin,role-sales')}&NoRole=true`);
  });

  it('adds RoleFilterNegate=true for notEqual, same RoleIds=/NoRole= construction as equals', () => {
    expect(buildRoleFilterQueryParams({ operator: 'notEqual', value: ['role-fin'] }))
      .toBe('RoleIds=role-fin&RoleFilterNegate=true');
    expect(buildRoleFilterQueryParams({ operator: 'notEqual', value: [NO_ROLE_FILTER_VALUE] }))
      .toBe('NoRole=true&RoleFilterNegate=true');
    expect(buildRoleFilterQueryParams({ operator: 'notEqual', value: [NO_ROLE_FILTER_VALUE, 'role-fin'] }))
      .toBe('RoleIds=role-fin&NoRole=true&RoleFilterNegate=true');
  });

  it('translates isNull to a bare NoRole=true, ignoring any row.value present', () => {
    expect(buildRoleFilterQueryParams({ operator: 'isNull' })).toBe('NoRole=true');
    // isNull never carries a value in practice (see the function's own docstring), but
    // the translation must not depend on that invariant holding — value must be ignored.
    expect(buildRoleFilterQueryParams({ operator: 'isNull', value: ['role-fin'] })).toBe('NoRole=true');
  });

  it('translates isNotNull to NoRole=true&RoleFilterNegate=true, ignoring any row.value present', () => {
    expect(buildRoleFilterQueryParams({ operator: 'isNotNull' })).toBe('NoRole=true&RoleFilterNegate=true');
    expect(buildRoleFilterQueryParams({ operator: 'isNotNull', value: ['role-fin'] }))
      .toBe('NoRole=true&RoleFilterNegate=true');
  });

  it('drops literal empty-string entries out of the value array before building RoleIds=', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: ['', 'role-fin'] }))
      .toBe('RoleIds=role-fin');
  });

  it('returns null when, after filtering, only an empty-string entry remains', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: [''] })).toBeNull();
  });

  // BUG-1 (see QA report) — `.map(String)` runs BEFORE `.filter(Boolean)`, so a `null`/
  // `undefined` array entry is stringified to the literal (truthy) strings "null"/
  // "undefined" first and therefore survives the filter — only a genuine empty string
  // is actually dropped. Documented here as the CURRENT behavior (backend
  // `sanitizeRoleIds()` in `UserRoleAssignmentHandler.java` regex-validates and silently
  // discards these malformed entries, so there is no functional/security impact today —
  // this is a robustness gap, not a live break), not an endorsement of it.
  it('BUG-1: does NOT drop null/undefined array entries — they are stringified to the literal "null"/"undefined" tokens and sent as-is', () => {
    expect(buildRoleFilterQueryParams({ operator: 'equals', value: [null, undefined, 'role-fin'] }))
      .toBe(`RoleIds=${encodeURIComponent('null,undefined,role-fin')}`);
  });
});

// ---------------------------------------------------------------------------
// ETP-5188 — useRolesCatalog (light catalog-only twin of useUserRoleGridData,
// used by RoleQuickFilterToolbarSlot)
// ---------------------------------------------------------------------------

describe('useRolesCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in a loading state with an empty roles list', () => {
    fetchTemplateRoles.mockReturnValue(new Promise(() => {}));
    fetchRolesOverview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRolesCatalog());

    expect(result.current.loading).toBe(true);
    expect(result.current.roles).toEqual([]);
    expect(result.current.adminRoleId).toBeNull();
  });

  it('fetches only the two light catalogs, never the bulk assignments endpoint', async () => {
    fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLES });
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    renderHook(() => useRolesCatalog());

    await waitFor(() => {
      expect(fetchTemplateRoles).toHaveBeenCalledTimes(1);
      expect(fetchRolesOverview).toHaveBeenCalledTimes(1);
    });
    expect(fetchUserRoleAssignments).not.toHaveBeenCalled();
  });

  it('resolves the merged roles array (templates + tenant admin) and rolesById/adminRoleId', async () => {
    fetchTemplateRoles.mockResolvedValue({ roles: TEMPLATE_ROLES });
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    const { result } = renderHook(() => useRolesCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual(ROLES);
    expect(result.current.rolesById['role-fin']).toEqual(TEMPLATE_ROLES[0]);
    expect(result.current.adminRoleId).toBe('role-admin');
    expect(result.current.error).toBeNull();
  });

  it('sets error and stops loading when a fetch rejects', async () => {
    fetchTemplateRoles.mockRejectedValue(new Error('boom'));
    fetchRolesOverview.mockResolvedValue({ roles: OVERVIEW_ROLES_WITH_ADMIN });
    const { result } = renderHook(() => useRolesCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('defaults roles defensively when the responses omit the expected arrays', async () => {
    fetchTemplateRoles.mockResolvedValue({});
    fetchRolesOverview.mockResolvedValue({});
    const { result } = renderHook(() => useRolesCatalog());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(result.current.adminRoleId).toBeNull();
  });
});
