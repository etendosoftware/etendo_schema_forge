/**
 * Tests for UserRolesTab — ETP-4906 "Roles del usuario" live permission-preview
 * matrix. See the component's own doc comment for the cross-task coupling with
 * AssignTemplateRolesControl (shared `useRoleSelection()` context) and the
 * hardcoded 3-row "General" category (never derived from SFListMenu).
 */
import { render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
}));

vi.mock('@/lib/menuTree.js', () => ({
  fetchMenuTree: vi.fn(),
}));

import { fetchRolesOverview } from '@/lib/rolesApi.js';
import { fetchMenuTree } from '@/lib/menuTree.js';
import UserRolesTab from '../UserRolesTab.jsx';
import { RoleSelectionProvider } from '../roleSelectionContext.js';

const MENU_TREE = {
  tree: [
    {
      type: 'folder',
      name: 'Comercial',
      children: [
        { name: 'Ventas', windowId: 'w1' },
        { name: 'Clientes', windowId: 'w2' },
      ],
    },
    {
      type: 'folder',
      name: 'Compras',
      children: [
        { name: 'Proveedores', windowId: 'w3' },
      ],
    },
  ],
};

const ROLES_OVERVIEW = {
  roles: [
    { id: 'role-fin', name: 'Finance', windows: [{ id: 'w1', tier: 'full' }] },
    { id: 'role-sales', name: 'Sales', windows: [{ id: 'w1', tier: 'full' }, { id: 'w2', tier: 'readonly' }] },
    { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true, windows: [{ id: 'w1', tier: 'full' }, { id: 'w2', tier: 'full' }, { id: 'w3', tier: 'full' }] },
  ],
};

function renderTab({ isNew = false, onVisibilityChange = vi.fn(), selectedRoleIds = [] } = {}) {
  return render(
    <RoleSelectionProvider value={{ selectedRoleIds, setSelectedRoleIds: vi.fn() }}>
      <UserRolesTab isNew={isNew} onVisibilityChange={onVisibilityChange} />
    </RoleSelectionProvider>,
  );
}

describe('UserRolesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('new (not-yet-persisted) user', () => {
    it('renders nothing when isNew', () => {
      const { container } = renderTab({ isNew: true });
      expect(container).toBeEmptyDOMElement();
    });

    it('reports itself as hidden via onVisibilityChange(false) when isNew', () => {
      const onVisibilityChange = vi.fn();
      renderTab({ isNew: true, onVisibilityChange });
      expect(onVisibilityChange).toHaveBeenCalledWith(false);
    });

    it('never fetches the menu tree or roles overview when isNew', () => {
      renderTab({ isNew: true });
      expect(fetchMenuTree).not.toHaveBeenCalled();
      expect(fetchRolesOverview).not.toHaveBeenCalled();
    });
  });

  describe('existing user', () => {
    it('reports itself as visible via onVisibilityChange(true)', () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      const onVisibilityChange = vi.fn();
      renderTab({ isNew: false, onVisibilityChange });
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });

    it('renders the empty state when zero roles are currently selected', async () => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      renderTab({ selectedRoleIds: [] });

      expect(await screen.findByTestId('UserRolesTab__empty')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab')).not.toBeInTheDocument();
    });

    // Regression coverage for a since-fixed bug (ETP-4906 F9 Findings): the render-branch
    // order in UserRolesTab.jsx used to check `columns.length === 0` (the empty state)
    // BEFORE checking `loading`/`error`. `columns` is derived from `rolesOverview`
    // (`useMemo` over `rolesOverview?.roles`), which stays `null` for the entire duration
    // of the in-flight fetch AND forever after a rejected fetch (the `.catch` only sets
    // `error`, never `rolesOverview`) — so `columns.length` was 0 in both cases regardless
    // of how many roles were selected, making the empty state always win and the
    // loading/error branches dead code. The branch order has since been fixed
    // (loading/error are now checked first); the two tests below pin that behavior.
    it('shows a loading indicator (not the empty state) while the two fetches are in flight, with roles selected', async () => {
      let resolveMenu;
      fetchMenuTree.mockReturnValue(new Promise((resolve) => { resolveMenu = resolve; }));
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      renderTab({ selectedRoleIds: ['role-fin'] });

      expect(screen.getByTestId('UserRolesTab__loading')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
      resolveMenu(MENU_TREE);
      await waitFor(() => expect(screen.getByTestId('UserRolesTab')).toBeInTheDocument());
    });

    it('shows an error message (not the empty state) when a fetch rejects, with roles selected', async () => {
      fetchMenuTree.mockRejectedValue(new Error('network down'));
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      renderTab({ selectedRoleIds: ['role-fin'] });

      await waitFor(() => expect(fetchMenuTree).toHaveBeenCalled());
      expect(await screen.findByTestId('UserRolesTab__error')).toBeInTheDocument();
      expect(screen.queryByTestId('UserRolesTab__empty')).not.toBeInTheDocument();
    });

    it('does not update state after unmount while fetches are still in flight', async () => {
      let resolveMenu;
      fetchMenuTree.mockReturnValue(new Promise((resolve) => { resolveMenu = resolve; }));
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = renderTab({ selectedRoleIds: ['role-fin'] });
      unmount();
      resolveMenu(MENU_TREE);
      await new Promise((r) => setTimeout(r, 0));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('the rendered matrix', () => {
    beforeEach(() => {
      fetchMenuTree.mockResolvedValue(MENU_TREE);
      fetchRolesOverview.mockResolvedValue(ROLES_OVERVIEW);
    });

    it('renders one column per currently-selected (non-admin) role', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      // Scope to the <thead> — the category divider rows inside <tbody> also use <th>
      // (colSpan-ed), which the accessibility tree maps to role=columnheader too.
      const headerRow = table.querySelector('thead tr');
      const headers = within(headerRow).getAllByRole('columnheader');
      // First header is the "Window" column, then one per selected role.
      expect(headers).toHaveLength(3);
      expect(headers[1]).toHaveTextContent('Finance');
      expect(headers[2]).toHaveTextContent('Sales');
    });

    it('never renders the Admin role as a column, even if selectedRoleIds erroneously includes it', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-admin'] });

      const table = await screen.findByTestId('UserRolesTab');
      const headerRow = table.querySelector('thead tr');
      expect(within(headerRow).queryByText('GOClient Admin')).not.toBeInTheDocument();
      expect(within(headerRow).getAllByRole('columnheader')).toHaveLength(2); // Window + Finance only
    });

    it('renders the 3 hardcoded General rows as unconditional ✓ for every column', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      await screen.findByTestId('UserRolesTab');
      for (const key of ['dashboard', 'favorites', 'copilot']) {
        const row = screen.getByTestId(`UserRolesTab__row-${key}`);
        const cells = within(row).getAllByRole('cell');
        // cells[0] is the window-name cell; cells[1..] are the per-role value cells.
        expect(cells).toHaveLength(3);
        expect(cells[1]).toHaveTextContent('✓');
        expect(cells[2]).toHaveTextContent('✓');
      }
    });

    it('groups window rows by category, in first-appearance order', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const table = await screen.findByTestId('UserRolesTab');
      const categoryHeaders = within(table).getAllByText(/^(Comercial|Compras)$/);
      expect(categoryHeaders.map((el) => el.textContent)).toEqual(['Comercial', 'Compras']);
    });

    it('resolves cell values from each role\'s windows[] — full access renders ✓', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w1');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Ventas');
      expect(cells[1]).toHaveTextContent('✓'); // Finance — full
      expect(cells[2]).toHaveTextContent('✓'); // Sales — full
    });

    it('resolves a read-only tier through the accessTierReadOnly i18n key', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w2');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Clientes');
      expect(cells[1]).toHaveTextContent('—'); // Finance has no w2 entry at all
      expect(cells[2]).toHaveTextContent('accessTierReadOnly'); // Sales — readonly
    });

    it('renders a dash for a window absent from a role\'s windows[]', async () => {
      renderTab({ selectedRoleIds: ['role-fin', 'role-sales'] });

      const row = await screen.findByTestId('UserRolesTab__row-w3');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Proveedores');
      expect(cells[1]).toHaveTextContent('—');
      expect(cells[2]).toHaveTextContent('—');
    });
  });
});
