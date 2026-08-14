/**
 * Tests for AssignTemplateRolesControl — ETP-4906, replaces AssignRoleControl
 * (ETP-4512, deleted). See the component's own doc comment for why selection now
 * lives in `useRoleSelection()` (shared with `UserRolesTab`) instead of a plain
 * `onChange('defaultRole', ...)` field write.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
}));

import { fetchRolesOverview } from '@/lib/rolesApi.js';
import AssignTemplateRolesControl from '../AssignTemplateRolesControl.jsx';
import { RoleSelectionProvider } from '../roleSelectionContext.js';

const TEMPLATE_ROLES = [
  { id: 'role-fin', name: 'Finance' },
  { id: 'role-sales', name: 'Sales' },
  { id: 'role-purch', name: 'Purchasing' },
  { id: 'role-inv', name: 'Inventory' },
];

function mockOverviewOk(roles = TEMPLATE_ROLES) {
  fetchRolesOverview.mockResolvedValue({ roles });
}

function renderControl({
  data = { id: 'user-1' },
  token = 'tok',
  apiBaseUrl = '/sws/neo/user',
  selectedRoleIds = [],
  setSelectedRoleIds = vi.fn(),
  ...rest
} = {}) {
  return render(
    <RoleSelectionProvider value={{ selectedRoleIds, setSelectedRoleIds }}>
      <AssignTemplateRolesControl data={data} token={token} apiBaseUrl={apiBaseUrl} {...rest} />
    </RoleSelectionProvider>,
  );
}

describe('AssignTemplateRolesControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('save-first placeholder (new, not-yet-persisted user)', () => {
    it('renders the save-first placeholder instead of the control when data.id is absent', () => {
      renderControl({ data: {} });

      expect(screen.getByTestId('AssignTemplateRolesControl__save-first')).toBeInTheDocument();
      expect(screen.queryByTestId('AssignTemplateRolesControl')).not.toBeInTheDocument();
      expect(screen.getByText('saveUserFirstForRoles')).toBeInTheDocument();
    });

    it('renders the save-first placeholder when data itself is null/undefined', () => {
      renderControl({ data: null });
      expect(screen.getByTestId('AssignTemplateRolesControl__save-first')).toBeInTheDocument();
    });

    it('never fetches roles when there is no persisted user', () => {
      renderControl({ data: {} });
      expect(fetchRolesOverview).not.toHaveBeenCalled();
    });
  });

  describe('fetching template roles (existing user)', () => {
    it('fetches SFRolesOverview once on mount for an existing user', async () => {
      mockOverviewOk();
      renderControl();

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalledTimes(1));
    });

    it('excludes the client-admin role from the selectable options', async () => {
      mockOverviewOk([...TEMPLATE_ROLES, { id: 'role-admin', name: 'GOClient Admin', isClientAdmin: true }]);
      renderControl({ selectedRoleIds: [] });

      const toggle = await screen.findByTestId('AssignTemplateRolesControl__toggle-expand');
      await userEvent.click(toggle);

      expect(screen.queryByTestId('AssignTemplateRolesControl__toggle-role-admin')).not.toBeInTheDocument();
      expect(screen.getByTestId('AssignTemplateRolesControl__toggle-role-fin')).toBeInTheDocument();
    });

    it('does not fetch when token is missing', () => {
      renderControl({ token: null });
      expect(fetchRolesOverview).not.toHaveBeenCalled();
    });

    it('does not fetch when apiBaseUrl is missing', () => {
      renderControl({ apiBaseUrl: null });
      expect(fetchRolesOverview).not.toHaveBeenCalled();
    });

    it('falls back to an empty roles list (no crash) when the fetch rejects', async () => {
      fetchRolesOverview.mockRejectedValue(new Error('network down'));
      renderControl();

      await waitFor(() => expect(screen.getByTestId('AssignTemplateRolesControl__toggle-expand')).not.toBeDisabled());
      expect(screen.getByTestId('AssignTemplateRolesControl__empty')).toBeInTheDocument();
    });

    it('does not update state after unmount while a fetch is still in flight', async () => {
      let resolveFetch;
      fetchRolesOverview.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = renderControl();
      unmount();

      resolveFetch({ roles: TEMPLATE_ROLES });
      await new Promise((r) => setTimeout(r, 0));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('rendering the current selection', () => {
    it('shows the empty-selection placeholder when no roles are selected', async () => {
      mockOverviewOk();
      renderControl({ selectedRoleIds: [] });

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalled());
      expect(screen.getByTestId('AssignTemplateRolesControl__empty')).toBeInTheDocument();
    });

    it('renders a chip per selected role, translated through resolveRoleDisplayName', async () => {
      mockOverviewOk();
      renderControl({ selectedRoleIds: ['role-fin', 'role-sales'] });

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalled());
      expect(screen.getByTestId('AssignTemplateRolesControl__chip-role-fin')).toHaveTextContent('roleNameFinance');
      expect(screen.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toHaveTextContent('roleNameSales');
    });

    it('collapses beyond MAX_COLLAPSED_CHIPS (3) into a "+N" overflow badge', async () => {
      mockOverviewOk();
      renderControl({ selectedRoleIds: ['role-fin', 'role-sales', 'role-purch', 'role-inv'] });

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalled());
      expect(screen.getByTestId('AssignTemplateRolesControl__overflow')).toHaveTextContent('+1');
      // Only the first MAX_COLLAPSED_CHIPS (3) selected roles render as their own chip —
      // the 4th (role-inv) is counted in the overflow badge, not rendered as a chip.
      expect(screen.getByTestId('AssignTemplateRolesControl__chip-role-fin')).toBeInTheDocument();
      expect(screen.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toBeInTheDocument();
      expect(screen.getByTestId('AssignTemplateRolesControl__chip-role-purch')).toBeInTheDocument();
      expect(screen.queryByTestId('AssignTemplateRolesControl__chip-role-inv')).not.toBeInTheDocument();
    });

    it('does not render an overflow badge when the selection is within the collapsed limit', async () => {
      mockOverviewOk();
      renderControl({ selectedRoleIds: ['role-fin'] });

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalled());
      expect(screen.queryByTestId('AssignTemplateRolesControl__overflow')).not.toBeInTheDocument();
    });
  });

  describe('editing (expand / toggle / remove)', () => {
    it('expands the options list on toggle click, listing every fetched (non-admin) role', async () => {
      mockOverviewOk();
      renderControl();

      const toggle = await screen.findByTestId('AssignTemplateRolesControl__toggle-expand');
      await userEvent.click(toggle);

      expect(screen.getByTestId('AssignTemplateRolesControl__options')).toBeInTheDocument();
      for (const role of TEMPLATE_ROLES) {
        expect(screen.getByTestId(`AssignTemplateRolesControl__toggle-${role.id}`)).toBeInTheDocument();
      }
    });

    it('collapses the options list on a second toggle click', async () => {
      mockOverviewOk();
      renderControl();

      const toggle = await screen.findByTestId('AssignTemplateRolesControl__toggle-expand');
      await userEvent.click(toggle);
      expect(screen.getByTestId('AssignTemplateRolesControl__options')).toBeInTheDocument();

      await userEvent.click(toggle);
      expect(screen.queryByTestId('AssignTemplateRolesControl__options')).not.toBeInTheDocument();
    });

    it('calls setSelectedRoleIds adding a role when its checkbox is toggled on', async () => {
      mockOverviewOk();
      const setSelectedRoleIds = vi.fn();
      renderControl({ selectedRoleIds: ['role-fin'], setSelectedRoleIds });

      const toggle = await screen.findByTestId('AssignTemplateRolesControl__toggle-expand');
      await userEvent.click(toggle);
      const salesRow = screen.getByTestId('AssignTemplateRolesControl__toggle-role-sales');
      await userEvent.click(within(salesRow).getByRole('checkbox'));

      expect(setSelectedRoleIds).toHaveBeenCalledTimes(1);
      const updater = setSelectedRoleIds.mock.calls[0][0];
      expect(updater(['role-fin'])).toEqual(['role-fin', 'role-sales']);
    });

    it('calls setSelectedRoleIds removing a role when its checkbox is toggled off', async () => {
      mockOverviewOk();
      const setSelectedRoleIds = vi.fn();
      renderControl({ selectedRoleIds: ['role-fin', 'role-sales'], setSelectedRoleIds });

      const toggle = await screen.findByTestId('AssignTemplateRolesControl__toggle-expand');
      await userEvent.click(toggle);
      const financeRow = screen.getByTestId('AssignTemplateRolesControl__toggle-role-fin');
      await userEvent.click(within(financeRow).getByRole('checkbox'));

      const updater = setSelectedRoleIds.mock.calls[0][0];
      expect(updater(['role-fin', 'role-sales'])).toEqual(['role-sales']);
    });

    it('removes a role via the chip\'s own remove control, without toggling edit mode', async () => {
      mockOverviewOk();
      const setSelectedRoleIds = vi.fn();
      renderControl({ selectedRoleIds: ['role-fin'], setSelectedRoleIds });

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalled());
      const removeBtn = screen.getByTestId('AssignTemplateRolesControl__chip-remove-role-fin');
      await userEvent.click(removeBtn);

      expect(setSelectedRoleIds).toHaveBeenCalledTimes(1);
      const updater = setSelectedRoleIds.mock.calls[0][0];
      expect(updater(['role-fin'])).toEqual([]);
      // Removing a chip must not also open the expanded options editor.
      expect(screen.queryByTestId('AssignTemplateRolesControl__options')).not.toBeInTheDocument();
    });

    it('closes the expanded editor on an outside click', async () => {
      mockOverviewOk();
      renderControl();

      const toggle = await screen.findByTestId('AssignTemplateRolesControl__toggle-expand');
      await userEvent.click(toggle);
      expect(screen.getByTestId('AssignTemplateRolesControl__options')).toBeInTheDocument();

      await userEvent.click(document.body);
      expect(screen.queryByTestId('AssignTemplateRolesControl__options')).not.toBeInTheDocument();
    });
  });

  describe('inert fallback when rendered outside a RoleSelectionProvider', () => {
    it('renders with an empty selection and never throws', async () => {
      mockOverviewOk();
      render(<AssignTemplateRolesControl data={{ id: 'user-1' }} token="tok" apiBaseUrl="/sws/neo/user" />);

      await waitFor(() => expect(fetchRolesOverview).toHaveBeenCalled());
      expect(screen.getByTestId('AssignTemplateRolesControl__empty')).toBeInTheDocument();
    });
  });
});
