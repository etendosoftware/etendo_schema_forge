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

// ETP-4658: pages/FinancialAccountsPage.jsx no longer exists — the accounts list is
// the `financial-account` window's own list branch (generated ListView + the
// AccountsHeaderTable slot) and `finance/accounts` is now only a redirect to it, so
// there is nothing left to stub for that route.

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
  // App renders LocaleChangeConfirmDialog (ETP-5022), which calls useUI().
  useUI: () => (key) => key,
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
import App, { fetchWindowAccess } from '../App.jsx';

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

/**
 * ETP-4520 — `fetchWindowAccess`'s SFWindowAccessMap response-shape handling.
 * `com.etendoerp.go`'s real `SFWindowAccessMap.java` always wraps its payload
 * as a JSON *string* under `data.result` (`responseVars.put("result",
 * result.toString())`). The other two shapes below are defensive: a future/
 * inconsistent backend that returns `data.result` as a plain object, or the
 * fully unwrapped `{windowAccess, capabilities}` payload with no wrapper at
 * all.
 *
 * ETP-5189 — `fetchWindowAccess` now ALSO calls the SFListMenu webhook (via
 * `fetchMenuTree()`/`collectAllowedIds()` in `lib/menuTree.js`) to build the
 * `menuAccess` map it merges into its return value. That call goes through the
 * SAME global `fetch` stub, so every success-path test below must be able to
 * answer BOTH `/sws/neo/windowaccessmap` and `/sws/neo/listmenu` — hence the
 * URL-branching `stubFetch` (unlike the single-response stub this replaced,
 * which made `fetchMenuTree()`'s internal `res.text()` call throw, since the
 * old `jsonResponse` helper had no `.text()`).
 */
describe('fetchWindowAccess', () => {
  const PAYLOAD = { windowAccess: { W1: 'full' }, capabilities: { showAccountingFields: true } };

  // A realistic role-filtered menu tree: 3 levels deep, mixing all three id
  // kinds `collectAllowedIds` recognizes (windowId/processId/obuiappProcessId),
  // including two on the SAME node — mirrors `lib/__tests__/menuTree.vitest.js`'s
  // own coverage of `collectAllowedIds` so the flattening behavior is exercised
  // here too, end-to-end through `fetchWindowAccess`.
  const MENU_TREE = {
    tree: [
      {
        windowId: 'W1',
        processId: 'P1',
        children: [
          {
            obuiappProcessId: 'OP1',
            children: [{ windowId: 'W2' }],
          },
        ],
      },
    ],
    count: 1,
  };
  const EXPECTED_MENU_ACCESS = { W1: true, P1: true, OP1: true, W2: true };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body, ok = true) {
    return { ok, json: async () => body };
  }

  // `callMenuWebhook` (lib/menuTree.js) reads the body via `res.text()`, not `.json()`.
  function menuTextResponse(body, ok = true) {
    return { ok, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  }

  /**
   * Branches the global `fetch` stub by URL: `/sws/neo/listmenu` (SFListMenu,
   * read via `.text()`) gets `menuResponse`; everything else (SFWindowAccessMap,
   * read via `.json()`) gets `windowAccessResponse`.
   */
  function stubFetch(windowAccessResponse, menuResponse = menuTextResponse(MENU_TREE)) {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      String(url).includes('/listmenu') ? menuResponse : windowAccessResponse,
    )));
  }

  it('parses data.result when it is a JSON string (real/current backend shape)', async () => {
    stubFetch(jsonResponse({ result: JSON.stringify(PAYLOAD) }));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });
  });

  it('uses data.result directly when it is already a plain object', async () => {
    stubFetch(jsonResponse({ result: PAYLOAD }));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });
  });

  it('falls back to data itself when there is no result wrapper and the shape looks right', async () => {
    stubFetch(jsonResponse(PAYLOAD));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });
  });

  it('fails closed (null) when data.result is an unparsable string', async () => {
    stubFetch(jsonResponse({ result: 'not-json' }));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toBeNull();
  });

  it('fails closed (null) when the response has neither a result wrapper nor the right shape', async () => {
    stubFetch(jsonResponse({ unrelated: true }));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toBeNull();
  });

  it('fails closed (null) when the response is not ok', async () => {
    stubFetch(jsonResponse(PAYLOAD, false));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toBeNull();
  });

  it('fails closed (null) when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toBeNull();
  });

  // ETP-5189 — the menu fetch (SFListMenu) is inside the SAME top-level `try` as the
  // windowaccessmap parsing, so a menu-fetch failure must fail the WHOLE call closed
  // (return `null`), not return a partial `{ ...payload, menuAccess: {} }` result — that
  // would silently reset windowAccess/capabilities/menuAccess together, per the existing
  // fail-closed contract for a SFWindowAccessMap failure.
  it('fails closed (null) — not a partial result — when the menu fetch (SFListMenu) itself fails', async () => {
    stubFetch(jsonResponse(PAYLOAD), menuTextResponse('<!doctype html><html><body>App</body></html>'));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toBeNull();
  });

  it('fails closed (null) when the menu fetch (SFListMenu) rejects outright', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (
      String(url).includes('/listmenu')
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(jsonResponse(PAYLOAD))
    )));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toBeNull();
  });
});
