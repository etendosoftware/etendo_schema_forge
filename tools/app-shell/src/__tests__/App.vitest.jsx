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

// Captures the props AppShellRuntime receives so tests can assert on the wiring
// App performs (ETP-4576: the `auth` prop bag must carry `restoreSession`).
// `vi.hoisted` is required — the mock factory below runs while `../App.jsx` is
// imported, i.e. before plain module-scope declarations are initialized.
const runtimeProps = vi.hoisted(() => ({ auth: undefined }));

// The real AppShellRuntime wraps everything in a <BrowserRouter>; the mock must
// provide an equivalent Router context so App's children (ServiceWorkerManager,
// AppStoreKeyWatcher, ObservabilityRouteTracker) can call useLocation/useNavigate.
vi.mock('@etendosoftware/app-shell-core/runtime', async () => {
  const { MemoryRouter } = await import('react-router-dom');
  return {
    AppShellRuntime: ({ children, layout: Layout, menuGroups, auth }) => {
      runtimeProps.auth = auth;
      return (
        <MemoryRouter>
          <div data-testid="app-shell-runtime">
            {children}
            {Layout && <Layout menuGroups={menuGroups} />}
          </div>
        </MemoryRouter>
      );
    },
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
import App, { fetchWindowAccess, restoreSession } from '../App.jsx';

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

  // ETP-4576 — AuthProvider (in @etendosoftware/app-shell-core) only boots into
  // cookie-session restore when it receives a `restoreSession` function through
  // the `auth` prop bag. Without this wiring the whole server-side-session
  // mechanism stays dormant and the app keeps falling back to the legacy
  // Bearer/localStorage path.
  it('wires restoreSession into the auth prop bag handed to AppShellRuntime', () => {
    render(<App />);
    expect(runtimeProps.auth).toBeDefined();
    expect(typeof runtimeProps.auth.restoreSession).toBe('function');
  });

  it('keeps the pre-existing auth prop bag entries alongside restoreSession', () => {
    render(<App />);
    expect(runtimeProps.auth.loginPath).toBe('/login');
    expect(typeof runtimeProps.auth.fetchWindowAccess).toBe('function');
    expect(runtimeProps.auth.unauthenticatedFallback).toBeTruthy();
  });

  // ETP-4576 — turning `restoreSession` on makes boot asynchronous: `AuthGate`
  // renders `bootingFallback` while `status === 'booting'`, and that prop
  // defaults to `null`. So without an explicit `bootingFallback` the user stares
  // at a blank screen on EVERY page load until `GET /sws/go/session` answers.
  // The fallback must be a renderable element, styled like App's
  // `notFoundElement`, not `null`/`undefined`.
  it('provides a renderable auth.bootingFallback so boot is not a blank screen', () => {
    render(<App />);
    const bootingFallback = runtimeProps.auth.bootingFallback;
    expect(bootingFallback).toBeTruthy();
    // Rendering it is the real contract: it must be a valid React element, not
    // a truthy-but-unrenderable value.
    const { getByText } = render(<>{bootingFallback}</>);
    expect(getByText('Loading...')).toBeInTheDocument();
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
 */
describe('fetchWindowAccess', () => {
  const PAYLOAD = { windowAccess: { W1: 'full' }, capabilities: { showAccountingFields: true } };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  }

  function jsonResponse(body, ok = true) {
    return { ok, json: async () => body };
  }

  it('parses data.result when it is a JSON string (real/current backend shape)', async () => {
    stubFetch(jsonResponse({ result: JSON.stringify(PAYLOAD) }));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual(PAYLOAD);
  });

  it('uses data.result directly when it is already a plain object', async () => {
    stubFetch(jsonResponse({ result: PAYLOAD }));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual(PAYLOAD);
  });

  it('falls back to data itself when there is no result wrapper and the shape looks right', async () => {
    stubFetch(jsonResponse(PAYLOAD));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual(PAYLOAD);
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
});

/**
 * ETP-4576 — host-injected session restore against the server-side `__Host-`
 * cookie session (ADR-0001). `AuthProvider` (in @etendosoftware/app-shell-core)
 * calls this on boot: a resolved payload becomes the authenticated session
 * (account/environment/roleList/csrfToken), anything falsy means "no session"
 * and the shell drops to `anonymous`. The security point of the whole task is
 * that the browser never holds a bearer token: the request must authenticate
 * purely with the cookie, so it carries `credentials: 'include'` and NO
 * `Authorization` header.
 */
describe('restoreSession', () => {
  const SESSION = {
    account: { id: 'U1', name: 'Tester' },
    environment: { clientId: 'C1', orgId: 'O1' },
    roleList: [{ id: 'R1', name: 'Admin' }],
    csrfToken: 'csrf-abc',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response) {
    const spy = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  function jsonResponse(body, ok = true) {
    return { ok, json: async () => body };
  }

  it('calls the session endpoint (GET) on the API base', async () => {
    const spy = stubFetch(jsonResponse(SESSION));
    await restoreSession();
    // `apiBase` is environment-derived (empty in tests, a context path in the
    // deployed webapp), so only assert on the suffix.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual(expect.stringContaining('/sws/go/session'));
    expect(String(spy.mock.calls[0][0]).endsWith('/sws/go/session')).toBe(true);
    expect(spy.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'GET' }));
  });

  it("sends credentials: 'include' so the __Host- session cookie travels", async () => {
    const spy = stubFetch(jsonResponse(SESSION));
    await restoreSession();
    expect(spy.mock.calls[0][1]).toEqual(
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('sends no Authorization header and no bearer token anywhere in the request', async () => {
    const spy = stubFetch(jsonResponse(SESSION));
    await restoreSession();
    const [, init = {}] = spy.mock.calls[0];
    const headerNames = Object.keys(init.headers ?? {}).map((h) => h.toLowerCase());
    expect(headerNames).not.toContain('authorization');
    // Belt and braces: no bearer token smuggled through any other init field.
    expect(JSON.stringify(init).toLowerCase()).not.toContain('bearer');
  });

  it('returns the parsed session payload when the response is ok', async () => {
    stubFetch(jsonResponse(SESSION));
    await expect(restoreSession()).resolves.toEqual(SESSION);
  });

  it('fails closed (null) when the response is not ok (e.g. the 401 for "no session")', async () => {
    stubFetch(jsonResponse(SESSION, false));
    await expect(restoreSession()).resolves.toBeNull();
  });

  it('fails closed (null) when fetch rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(restoreSession()).resolves.toBeNull();
  });

  it('fails closed (null) when the body is not valid JSON', async () => {
    stubFetch({ ok: true, json: async () => { throw new Error('invalid json'); } });
    await expect(restoreSession()).resolves.toBeNull();
  });
});
