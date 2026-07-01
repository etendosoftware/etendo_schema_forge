import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    if (key === 'financeAccountsCount') return `${params.count} cuentas`;
    if (key === 'financeAccountsReconcilePending') return `Conciliar (${params.count})`;
    if (key === 'financeAccountsRulesToast') return 'Próximamente en T5 (ETP-4099)';
    return key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

const mockSetPageMeta = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (...args) => mockSetPageMeta(...args),
}));

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

const mockUseFinancialAccounts = vi.fn();
vi.mock('@/hooks/useFinancialAccounts.js', () => ({
  useFinancialAccounts: () => mockUseFinancialAccounts(),
}));

vi.mock('@/hooks/useAccountMutations.js', () => ({
  useAccountMutations: () => ({
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    archiveAccount: vi.fn(),
    fetchDefaults: vi.fn().mockResolvedValue({ currencies: [], defaultCurrencyId: '' }),
  }),
}));

// usePsd2Actions/usePsd2ConnectFlow call useAuth internally; both the page and the
// child modals consume them, so stub them at the module level (no AuthProvider needed).
vi.mock('@/hooks/usePsd2Actions.js', () => ({
  usePsd2Actions: () => ({
    sync: vi.fn(), disconnect: vi.fn(), reconnect: vi.fn(), connect: vi.fn(),
    fetchStatus: vi.fn().mockResolvedValue({}), fetchProviders: vi.fn().mockResolvedValue([]),
    saveImportSettings: vi.fn(),
  }),
  launchSaltEdgePopup: vi.fn(),
}));
// The wizard imports usePsd2Actions without the .js extension.
vi.mock('@/hooks/usePsd2Actions', () => ({
  usePsd2Actions: () => ({
    sync: vi.fn(), disconnect: vi.fn(), reconnect: vi.fn(), connect: vi.fn(),
    fetchStatus: vi.fn().mockResolvedValue({}), fetchProviders: vi.fn().mockResolvedValue([]),
    saveImportSettings: vi.fn(),
  }),
  launchSaltEdgePopup: vi.fn(),
}));
vi.mock('@/hooks/usePsd2ConnectFlow.js', () => ({
  usePsd2ConnectFlow: () => ({
    startConnect: vi.fn(), startCreate: vi.fn(), connecting: false,
    selection: null, confirmSelection: vi.fn(), cancelSelection: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import FinancialAccountsPage from '../FinancialAccountsPage.jsx';

const baseAccounts = [
  {
    id: 'acc-1',
    name: 'BBVA Principal',
    type: 'B',
    currentBalance: 1000,
    currencyIso: 'EUR',
    pendingCount: 3,
    active: true,
  },
  {
    id: 'acc-2',
    name: 'Caja Tienda',
    type: 'C',
    currentBalance: 50,
    currencyIso: 'EUR',
    pendingCount: 0,
    active: true,
  },
  {
    id: 'acc-3',
    name: 'Visa Corporate',
    type: 'T',
    currentBalance: -120,
    currencyIso: 'USD',
    pendingCount: 1,
    active: true,
  },
];

// A mix that includes archived (inactive) accounts of different types.
const mixedAccounts = [
  ...baseAccounts,
  {
    id: 'acc-4',
    name: 'Santander Cerrada',
    type: 'B',
    currentBalance: 0,
    currencyIso: 'EUR',
    pendingCount: 0,
    active: false,
  },
  {
    id: 'acc-5',
    name: 'Caja Antigua',
    type: 'C',
    currentBalance: 0,
    currencyIso: 'EUR',
    pendingCount: 0,
    active: false,
  },
];

const baseSummary = {
  totalBalance: 930,
  byCurrency: [
    { currencyIso: 'EUR', total: 1050 },
    { currencyIso: 'USD', total: -120 },
  ],
  pending: { accountsWithPending: 2, suggestionsReady: 0, byRule: 0 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <FinancialAccountsPage />
    </MemoryRouter>,
  );
}

describe('FinancialAccountsPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseFinancialAccounts.mockReset();
    mockSetPageMeta.mockReset();
  });

  it('renders the toolbar, sidebar and all account rows', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: baseAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    expect(screen.getByTestId('cuentas-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('cuentas-card')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-2')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-3')).toBeInTheDocument();
  });

  it('filters the table by the active type', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: baseAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    fireEvent.click(screen.getByTestId('account-type-filter-trigger'));
    fireEvent.click(screen.getByTestId('account-type-filter-option-c'));

    expect(screen.queryByTestId('account-row-acc-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-2')).toBeInTheDocument();
    expect(screen.queryByTestId('account-row-acc-3')).not.toBeInTheDocument();
  });

  it('filters the table by the search term against the account name', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: baseAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    fireEvent.change(screen.getByTestId('cuentas-search-input'), {
      target: { value: 'visa' },
    });

    expect(screen.queryByTestId('account-row-acc-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-row-acc-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-3')).toBeInTheDocument();
  });

  it('navigates to the detail route when a row is clicked', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: baseAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    fireEvent.click(screen.getByTestId('account-row-acc-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/financial-account/acc-1');
  });

  it('renders the "Nueva cuenta" button enabled and does not navigate when clicked', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: baseAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    const button = screen.getByTestId('cuentas-new-account-button');
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    // Clicking opens the wizard modal, not a navigation.
    fireEvent.click(button);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('hides archived (inactive) accounts in the default view', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: mixedAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    // Active accounts are visible…
    expect(screen.getByTestId('account-row-acc-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-2')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-3')).toBeInTheDocument();
    // …archived ones are not.
    expect(screen.queryByTestId('account-row-acc-4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-row-acc-5')).not.toBeInTheDocument();
  });

  it('shows only archived accounts regardless of type when the Inactive filter is selected', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: mixedAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    fireEvent.click(screen.getByTestId('account-type-filter-trigger'));
    fireEvent.click(screen.getByTestId('account-type-filter-option-inactive'));

    // Active accounts are hidden…
    expect(screen.queryByTestId('account-row-acc-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-row-acc-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-row-acc-3')).not.toBeInTheDocument();
    // …only the archived ones show, across both bank and cash types.
    expect(screen.getByTestId('account-row-acc-4')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-5')).toBeInTheDocument();
  });

  it('still applies the search term inside the Inactive view', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: mixedAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    fireEvent.click(screen.getByTestId('account-type-filter-trigger'));
    fireEvent.click(screen.getByTestId('account-type-filter-option-inactive'));
    fireEvent.change(screen.getByTestId('cuentas-search-input'), {
      target: { value: 'antigua' },
    });

    expect(screen.queryByTestId('account-row-acc-4')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-row-acc-5')).toBeInTheDocument();
  });

  it('treats accounts with a missing active flag as active', () => {
    const accountsNoFlag = [
      { id: 'acc-x', name: 'Sin Flag', type: 'B', currentBalance: 10, currencyIso: 'EUR', pendingCount: 0 },
    ];
    mockUseFinancialAccounts.mockReturnValue({
      accounts: accountsNoFlag,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId('account-row-acc-x')).toBeInTheDocument();
  });

  it('sets the header record count to the number of active accounts only', () => {
    mockUseFinancialAccounts.mockReturnValue({
      accounts: mixedAccounts,
      summary: baseSummary,
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    renderPage();

    // mixedAccounts has 3 active + 2 archived → badge must read 3.
    const meta = mockSetPageMeta.mock.calls.at(-1)?.[0];
    expect(meta?.recordCount).toBe(3);
  });
});
