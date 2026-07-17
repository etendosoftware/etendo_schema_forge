/**
 * Smoke test for App.jsx — verifies the root component mounts
 * without crashing when all heavy dependencies are mocked.
 */

// Mock all heavy imports before loading App
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
  Toaster: () => null,
}));

// The real AppShellRuntime wraps everything in a <BrowserRouter>; the mock must
// provide an equivalent Router context so App's children (ServiceWorkerManager,
// AppStoreKeyWatcher, ObservabilityRouteTracker) can call useLocation/useNavigate.
vi.mock('@etendosoftware/app-shell-core/runtime', async () => {
  const { MemoryRouter } = await import('react-router-dom');
  return {
    AppShellRuntime: ({ children, layout: Layout, menuGroups }) => (
      <MemoryRouter>
        <div data-testid="app-shell-runtime">
          {children}
          {Layout && <Layout menuGroups={menuGroups} />}
        </div>
      </MemoryRouter>
    ),
  };
});

vi.mock('../runtime-routes.jsx', () => ({
  buildRuntimeRoutes: () => [],
}));

vi.mock('../auth/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => <div data-testid="auth-provider">{children}</div>,
  useAuth: () => ({ isAuthenticated: true, token: 'test-token', logout: vi.fn() }),
}));

vi.mock('../layout/AppLayout.jsx', () => ({
  default: () => <div data-testid="app-layout">Layout</div>,
}));

vi.mock('../windows/WindowLoader.jsx', () => ({
  default: () => <div data-testid="window-loader">WindowLoader</div>,
}));

vi.mock('../preview/PreviewPage.jsx', () => ({
  default: () => <div>Preview</div>,
}));

vi.mock('../pages/DashboardPage.jsx', () => ({
  default: () => <div data-testid="dashboard">Dashboard</div>,
}));

vi.mock('../pages/FirstStepsPage.jsx', () => ({
  default: () => <div>FirstSteps</div>,
}));

vi.mock('../pages/SalesPage.jsx', () => ({
  default: () => <div>Sales</div>,
}));

vi.mock('../pages/InventoryPage.jsx', () => ({
  default: () => <div>Inventory</div>,
}));

vi.mock('../pages/PurchasesPage.jsx', () => ({
  default: () => <div>Purchases</div>,
}));

vi.mock('../pages/AccountingPage.jsx', () => ({
  default: () => <div>Accounting</div>,
}));

vi.mock('../pages/ReportsPage.jsx', () => ({
  default: () => <div>Reports</div>,
}));

vi.mock('../pages/CrmPage.jsx', () => ({
  default: () => <div>CRM</div>,
}));

vi.mock('../pages/HrPage.jsx', () => ({
  default: () => <div>HR</div>,
}));

vi.mock('../pages/ProjectsPage.jsx', () => ({
  default: () => <div>Projects</div>,
}));

vi.mock('../pages/ReportViewerPage.jsx', () => ({
  default: () => <div>ReportViewer</div>,
}));

vi.mock('../pages/FinancialAccountsPage.jsx', () => ({
  default: () => <div>FinancialAccounts</div>,
}));

vi.mock('../pages/ArtifactViewerPage.jsx', () => ({
  default: () => <div>ArtifactViewer</div>,
}));

vi.mock('../pages/OnboardingPage.jsx', () => ({
  default: () => <div>Onboarding</div>,
}));

vi.mock('../pages/SmartScanPage.jsx', () => ({
  default: () => <div>SmartScan</div>,
}));

vi.mock('../pages/OAuth2ClientsPage.jsx', () => ({
  default: () => <div>OAuth2Clients</div>,
}));

vi.mock('../pages/AuthorizePage.jsx', () => ({
  default: () => <div>Authorize</div>,
}));

vi.mock('../pages/QuickSalesOrderPage.jsx', () => ({
  default: () => <div>QuickSalesOrder</div>,
}));

vi.mock('../pages/QuickPurchaseOrderPage.jsx', () => ({
  default: () => <div>QuickPurchaseOrder</div>,
}));

vi.mock('../pages/AppStorePage.jsx', () => ({
  default: () => <div>AppStore</div>,
}));

vi.mock('../windows/registry.js', () => ({
  buildMenuGroups: () => [
    { label: 'Test', items: [{ key: 'dashboard', label: 'Dashboard', path: '/dashboard' }] },
  ],
  buildWindowMap: () => ({}),
}));

vi.mock('../lib/mockFetch.js', () => ({
  createMockFetch: () => vi.fn(),
}));

vi.mock('../i18n/index.js', () => ({
  LocaleProvider: ({ children }) => <>{children}</>,
}));

vi.mock('../i18n/useLocaleState.js', () => ({
  useLocaleState: () => ['en_US', vi.fn()],
}));

vi.mock('../hooks/useServiceWorker.js', () => ({
  useServiceWorker: () => ({ checkForUpdate: vi.fn() }),
}));

vi.mock('../hooks/useInstalledApps.js', () => ({
  useInstalledApps: () => new Set(),
}));

vi.mock('../hooks/useAppStoreUnlock.js', () => ({
  useAppStoreUnlock: () => false,
  attachKeySequenceWatcher: () => () => {},
}));

vi.mock('../hooks/useCurrency.jsx', () => ({
  CurrencyProvider: ({ children }) => <>{children}</>,
}));

vi.mock('../lib/oauthReturnTo.js', () => ({
  buildOnboardingReturnTo: () => '/onboarding',
}));

vi.mock('../lib/observability/RouteTracker.jsx', () => ({
  ObservabilityRouteTracker: () => null,
}));

import { render, screen } from '@testing-library/react';
import App from '../App.jsx';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    // App now delegates composition to AppShellRuntime
    expect(screen.getByTestId('app-shell-runtime')).toBeInTheDocument();
  });

  it('passes AppLayout as the runtime layout (not the default ShellLayout)', () => {
    render(<App />);
    // The runtime mock renders the `layout` prop it receives; App must pass
    // its own AppLayout so SideMenu/Favorites/CommandPalette/Copilot chrome survives.
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });
});
