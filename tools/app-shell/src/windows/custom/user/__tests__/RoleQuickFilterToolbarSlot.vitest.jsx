/**
 * Tests for RoleQuickFilterToolbarSlot — ETP-5188 (Points 2 + 4) companion toolbar-slot
 * component. Rendered by `ListView.jsx` via `UserHeaderTable.ToolbarQuickFilter` (see
 * that component's own doc comment and `UserHeaderTable.vitest.jsx`, which now only
 * covers the `filteredData` row-filtering logic driven off the shared `?role=` URL
 * param — the dropdown UI + roles-catalog wiring that used to be asserted there moved
 * here, since it's this component, not `UserHeaderTable`, that now owns rendering
 * `RoleFilterControl` and fetching the light roles catalog.
 */
import { render, screen, fireEvent } from '@testing-library/react';

let mockSearchParams = new URLSearchParams();
let setSearchParamsMock;
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, setSearchParamsMock],
}));

// ETP-5188 — this component uses the LIGHT `useRolesCatalog()` twin (not the heavier
// `useUserRoleGridData()` `UserHeaderTable` uses), so it's mocked directly here rather
// than mocking the underlying fetch modules — see `RoleChipsCell.jsx`'s own docstring
// for why the two hooks/fetches are deliberately separate.
let rolesCatalogState = { roles: [], loading: false, error: null };
vi.mock('../RoleChipsCell.jsx', () => ({
  useRolesCatalog: () => rolesCatalogState,
}));

vi.mock('../RoleFilterControl.jsx', () => ({
  RoleFilterControl: ({ value, onChange, roles, 'data-testid': dataTestId }) => (
    <div data-testid={dataTestId}>
      <div data-testid="stub-value">{value ?? '__null__'}</div>
      <div data-testid="stub-roles-count">{(roles ?? []).length}</div>
      <button type="button" data-testid="stub-select-role-fin" onClick={() => onChange('role-fin')}>fin</button>
      <button type="button" data-testid="stub-clear-filter" onClick={() => onChange(null)}>clear</button>
    </div>
  ),
}));

import RoleQuickFilterToolbarSlot from '../RoleQuickFilterToolbarSlot.jsx';

const ROLES = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
  { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true },
];

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  setSearchParamsMock = vi.fn();
  rolesCatalogState = { roles: ROLES, loading: false, error: null };
});

describe('RoleQuickFilterToolbarSlot', () => {
  // Moved from UserHeaderTable.vitest.jsx ("renders the role-filter toolbar above the
  // grid") — this component, not UserHeaderTable, is what actually mounts the control
  // now. `RoleFilterControl__toolbar` is the default `data-testid` this component
  // passes explicitly (not `RoleFilterControl`'s own internal default), matching the
  // convention `ListView.jsx`'s `TableToolbarQuickFilter__620cbc` wrapper expects.
  it('renders RoleFilterControl under the RoleFilterControl__toolbar testid', () => {
    render(<RoleQuickFilterToolbarSlot />);
    expect(screen.getByTestId('RoleFilterControl__toolbar')).toBeInTheDocument();
  });

  // Moved from UserHeaderTable.vitest.jsx ("hands the fetched roles catalog down to
  // the filter control").
  it('hands the fetched roles catalog down to RoleFilterControl', () => {
    render(<RoleQuickFilterToolbarSlot />);
    expect(screen.getByTestId('stub-roles-count')).toHaveTextContent('3');
  });

  // Fail-quiet guard (see the component's own doc comment) — not previously covered
  // anywhere, since `UserHeaderTable`'s old inline rendering had no loading/error state
  // of its own to hide behind.
  it('renders nothing while the roles catalog is still loading', () => {
    rolesCatalogState = { roles: [], loading: true, error: null };
    const { container } = render(<RoleQuickFilterToolbarSlot />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the roles catalog fetch failed', () => {
    rolesCatalogState = { roles: [], loading: false, error: new Error('boom') };
    const { container } = render(<RoleQuickFilterToolbarSlot />);
    expect(container).toBeEmptyDOMElement();
  });

  // Moved from UserHeaderTable.vitest.jsx's ETP-4999 describe block ("seeds
  // RoleFilterControl's initial value from the ?role= query param" / "defaults to
  // null...") — this component, not UserHeaderTable, is the one that reads/writes the
  // shared `role` URL param and threads it into RoleFilterControl's `value` prop.
  it('passes the current ?role= search param down as the current value', () => {
    mockSearchParams = new URLSearchParams('role=role-fin');
    render(<RoleQuickFilterToolbarSlot />);
    expect(screen.getByTestId('stub-value')).toHaveTextContent('role-fin');
  });

  it('defaults to null (no filter) when the ?role= param is absent', () => {
    render(<RoleQuickFilterToolbarSlot />);
    expect(screen.getByTestId('stub-value')).toHaveTextContent('__null__');
  });

  // Moved from UserHeaderTable.vitest.jsx ("threads the selected role id down as the
  // stub filter's current value") — the write side of the same shared `role` param.
  it('sets the ?role= URL param when a role is selected', () => {
    render(<RoleQuickFilterToolbarSlot />);
    fireEvent.click(screen.getByTestId('stub-select-role-fin'));

    expect(setSearchParamsMock).toHaveBeenCalledTimes(1);
    const [updater, options] = setSearchParamsMock.mock.calls[0];
    const result = updater(new URLSearchParams());
    expect(result.get('role')).toBe('role-fin');
    expect(options).toEqual({ replace: true });
  });

  // Moved from UserHeaderTable.vitest.jsx ("restores every row when the filter is
  // cleared back to null") — the clear-filter write path.
  it('removes the ?role= URL param when the filter is cleared', () => {
    render(<RoleQuickFilterToolbarSlot />);
    fireEvent.click(screen.getByTestId('stub-clear-filter'));

    expect(setSearchParamsMock).toHaveBeenCalledTimes(1);
    const [updater] = setSearchParamsMock.mock.calls[0];
    const result = updater(new URLSearchParams('role=role-fin'));
    expect(result.get('role')).toBeNull();
  });
});
