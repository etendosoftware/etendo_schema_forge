/**
 * ETP-5443 follow-up — `fetchWindowAccess`'s environment-access-gate side effect: a NEO
 * `/sws/neo/windowaccessmap` 402 records the demo/subscription block via
 * `setEnvironmentAccessDecision`, so `AppLayout` can show the dedicated blocked-access screen
 * instead of the generic "your role has no access" one. See `lib/environmentAccessGate.js` (and
 * its own suite, `lib/__tests__/environmentAccessGate.vitest.js`, for the plain-module contract:
 * message parsing, the blocking-decision allowlist, notify semantics) and
 * `layout/__tests__/AppLayout.vitest.jsx` (which mocks the React binding and tests the RENDER
 * side). This file tests the DETECTION side, at the source, through the real
 * `fetchWindowAccess` + `readNeoErrorMessage` + `parseEnvironmentAccessDecision` pipeline.
 *
 * A NEW file rather than an addition to `__tests__/App.vitest.jsx`'s own
 * `describe('fetchWindowAccess', ...)` block: that file's heavy mock set (below) exists only to
 * make `../App.jsx` importable at all (this repo's page components are real modules, not
 * stubbed, unless mocked) — duplicated here verbatim rather than editing that file.
 */

// Mock all heavy imports before loading App — same set __tests__/App.vitest.jsx already
// maintains, kept in sync since both load the same module. Only the two exports this file
// actually calls (`fetchWindowAccess`, `__resetMenuAccessCacheForTest`) are exercised below;
// none of these mocked modules are otherwise part of this file's assertions.
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
  Toaster: () => null,
}));

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

import { fetchWindowAccess, __resetMenuAccessCacheForTest } from '../App.jsx';
import {
  getEnvironmentAccessDecision,
  resetEnvironmentAccessGateForTest,
} from '@/lib/environmentAccessGate.js';

describe('fetchWindowAccess — environment access gate (ETP-5443 follow-up)', () => {
  function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
    return { ok, status, json: async () => body };
  }

  // `callMenuWebhook` (lib/menuTree.js) reads the body via `.text()`, not `.json()` — mirrors
  // __tests__/App.vitest.jsx's own helper. Content is irrelevant here; every case just needs an
  // answer so the parallel SFListMenu fetch (ETP-5189) resolves instead of hanging.
  function menuTextResponse(body = { tree: [], count: 0 }) {
    return { ok: true, text: async () => JSON.stringify(body) };
  }

  /** Branches the global `fetch` stub by URL, same pattern as __tests__/App.vitest.jsx. */
  function stubFetch(windowAccessResponse, menuResponse = menuTextResponse()) {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      String(url).includes('/listmenu') ? menuResponse : windowAccessResponse,
    )));
  }

  /** `NeoResponse.error()`'s real shape: `{ error: { message: "..." } }` — see readNeoErrorMessage. */
  function neoError(message) {
    return { error: { message } };
  }

  beforeEach(() => {
    __resetMenuAccessCacheForTest();
    resetEnvironmentAccessGateForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records DEMO_TRIAL_EXPIRED from a 402 with that decision in the body', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: DEMO_TRIAL_EXPIRED'), false, 402));

    const result = await fetchWindowAccess({ token: 'tok' });

    expect(result).toBeNull();
    expect(getEnvironmentAccessDecision()).toBe('DEMO_TRIAL_EXPIRED');
  });

  it('records SUBSCRIPTION_REQUIRED from a 402 with that decision in the body', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: SUBSCRIPTION_REQUIRED'), false, 402));

    const result = await fetchWindowAccess({ token: 'tok' });

    expect(result).toBeNull();
    expect(getEnvironmentAccessDecision()).toBe('SUBSCRIPTION_REQUIRED');
  });

  // MEMBERSHIP_REQUIRED is a real EnvironmentAccessPolicy.Decision, but a DIFFERENT kind of "no
  // access" (not a member of the environment at all, not a commercial cut-off) — it must NOT trip
  // the blocked-access screen. isBlockingAccessDecision (see lib/__tests__/
  // environmentAccessGate.vitest.js) is what excludes it; this proves fetchWindowAccess's own
  // recording obeys that exclusion end-to-end, through the real parse + set pipeline.
  it('does not record a decision for a 402 with MEMBERSHIP_REQUIRED (not a commercial block)', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: MEMBERSHIP_REQUIRED'), false, 402));

    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  it('does not record a decision for a differently-worded 402', async () => {
    stubFetch(jsonResponse(neoError('Rate limit exceeded'), false, 402));

    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  it('survives a 402 whose body is not JSON at all, without recording a decision or throwing', async () => {
    stubFetch({
      ok: false,
      status: 402,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });

    await expect(fetchWindowAccess({ token: 'tok' })).resolves.toBeNull();
    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  it('does not record a decision for a 402 with an empty body', async () => {
    stubFetch(jsonResponse({}, false, 402));

    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  it('clears a previously-recorded decision once the environment answers 200 again', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: DEMO_TRIAL_EXPIRED'), false, 402));
    await fetchWindowAccess({ token: 'tok' });
    expect(getEnvironmentAccessDecision()).toBe('DEMO_TRIAL_EXPIRED');

    stubFetch(jsonResponse({ windowAccess: { W1: 'full' }, capabilities: {} }));
    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  it('clears a previously-recorded decision on a 401', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: SUBSCRIPTION_REQUIRED'), false, 402));
    await fetchWindowAccess({ token: 'tok' });
    expect(getEnvironmentAccessDecision()).toBe('SUBSCRIPTION_REQUIRED');

    stubFetch(jsonResponse({ message: 'unauthorized' }, false, 401));
    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  it('clears a previously-recorded decision on an unrelated 500', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: DEMO_TRIAL_EXPIRED'), false, 402));
    await fetchWindowAccess({ token: 'tok' });
    expect(getEnvironmentAccessDecision()).toBe('DEMO_TRIAL_EXPIRED');

    stubFetch(jsonResponse({ message: 'internal error' }, false, 500));
    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBeNull();
  });

  // Intentional behavior: a thrown/rejected `apiFetch()` call (DNS failure, connection
  // refused, an aborted request) never reaches the `if (!res.ok)` branch; it lands directly
  // in the outer `catch { return null; }`, which deliberately does NOT call
  // `setEnvironmentAccessDecision`. This preserves the last server-confirmed block decision
  // across transient network failures, so a demo/subscription block is not silently replaced
  // by the misleading "your role has no access" screen while connectivity is recovering.
  it('leaves a previously-recorded decision UNCHANGED when the request throws outright (intentional)', async () => {
    stubFetch(jsonResponse(neoError('Environment access is not available: SUBSCRIPTION_REQUIRED'), false, 402));
    await fetchWindowAccess({ token: 'tok' });
    expect(getEnvironmentAccessDecision()).toBe('SUBSCRIPTION_REQUIRED');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await fetchWindowAccess({ token: 'tok' });

    expect(getEnvironmentAccessDecision()).toBe('SUBSCRIPTION_REQUIRED');
  });
});
