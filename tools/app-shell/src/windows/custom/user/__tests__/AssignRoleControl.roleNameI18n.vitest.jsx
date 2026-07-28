/**
 * Regression test for the ETP-4513 fix: AssignRoleControl's "Assigned Role"
 * dropdown must translate the raw AD_Role.name values returned by the
 * userRoles.role selector (English strings like "Finance"/"Sales") instead of
 * rendering them as-is, so a Spanish-locale user sees "Finanzas"/"Ventas".
 *
 * Unlike AssignRoleControl.vitest.jsx (which mocks `useUI` as the identity
 * function to keep its i18n-key assertions decoupled from locale content),
 * this file mocks `useUI` with a tiny stand-in for the real es_ES.json
 * translations of the 5 `roleName*` keys — proving the actual translated
 * text renders, not just that the right i18n key was requested.
 */
import { render, screen, waitFor } from '@testing-library/react';
import AssignRoleControl from '../AssignRoleControl';

// Mirrors the real es_ES.json values for these keys (tools/app-shell/src/locales/es_ES.json).
const ES_ROLE_NAMES = {
  roleNameFinance: 'Finanzas',
  roleNameSales: 'Ventas',
  roleNamePurchasing: 'Compras',
  roleNameInventory: 'Inventario',
  roleNameAdmin: 'Administrador',
  assignedRole: 'Rol asignado',
  noRoleAssigned: 'Sin rol asignado',
};

vi.mock('@/i18n', () => ({
  useUI: () => (key) => ES_ROLE_NAMES[key] ?? key,
}));

const ROLE_OPTIONS = [
  { id: 'role-finance', label: 'Finance' },
  { id: 'role-sales', label: 'Sales' },
  { id: 'role-purchasing', label: 'Purchasing' },
  { id: 'role-inventory', label: 'Inventory' },
  { id: 'role-goclient-admin', label: 'GOClient Admin' },
];

function mockFetchOk(items = ROLE_OPTIONS) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items }),
  });
}

describe('AssignRoleControl — role-name i18n (ETP-4513)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Spanish-translated names for the 4 fixed roles under the Spanish locale', async () => {
    mockFetchOk();
    render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);

    const select = screen.getByTestId('AssignRoleControl__select');
    await waitFor(() => expect(select).not.toBeDisabled());

    expect(screen.getByText('Finanzas')).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByText('Compras')).toBeInTheDocument();
    expect(screen.getByText('Inventario')).toBeInTheDocument();

    // The raw English labels must never leak into the rendered options.
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
    expect(screen.queryByText('Sales')).not.toBeInTheDocument();
    expect(screen.queryByText('Purchasing')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
  });

  it('passes through an unrecognized label (tenant-specific admin role) unchanged', async () => {
    mockFetchOk();
    render(<AssignRoleControl data={{}} token="t" apiBaseUrl="/sws/neo/user" onChange={vi.fn()} />);

    const select = screen.getByTestId('AssignRoleControl__select');
    await waitFor(() => expect(select).not.toBeDisabled());

    // "GOClient Admin" is not one of the 4 fixed names — it must render
    // untranslated, same fallback behavior RolesOverviewPage already had.
    expect(screen.getByText('GOClient Admin')).toBeInTheDocument();
  });
});
