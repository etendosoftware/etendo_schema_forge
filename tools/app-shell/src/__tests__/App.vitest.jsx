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
import App, { fetchWindowAccess, __resetMenuAccessCacheForTest } from '../App.jsx';
import { MENU_ACCESS_UNREACHABLE } from '../lib/menuTree.js';

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

  // ETP-5189 follow-up — `fetchMenuAccess()`'s module-level cache (60s TTL) is scoped
  // to one real page load in production, but this file calls `fetchWindowAccess()`
  // many times against the SAME imported module instance, so a cache populated by an
  // earlier test case would otherwise leak into later, independent assertions (the
  // menu-fetch-failure tests below need a genuinely fresh `{}` fallback, not a stale
  // successful `menuAccess` left over from a prior `it()`).
  beforeEach(() => {
    __resetMenuAccessCacheForTest();
  });

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

  // ETP-5189 — the menu fetch (SFListMenu) is wrapped in its OWN try/catch, decoupled
  // from the windowaccessmap parsing above — a menu-fetch failure fails OPEN for
  // `menuAccess` alone (falls back to the MENU_ACCESS_UNREACHABLE sentinel, see below),
  // leaving `windowAccess`/`capabilities` from the already-successful SFWindowAccessMap
  // fetch untouched. This mirrors `useRoleMenu()`'s own fail-open philosophy for
  // SFListMenu specifically (an unreachable menu webhook means "don't filter", not "deny
  // everything"). Confirmed live: the E2E mocked-spec harness (`e2e/tests/helpers/
  // auth.js`) deliberately `route.abort()`s `/sws/neo/listmenu` to exercise this exact
  // fallback — an earlier version of `fetchWindowAccess` lumped the menu fetch into the
  // outer catch, which nulled out `windowAccess`/`capabilities` too and broke every
  // window's WindowAccessGuard across ~40 unrelated mocked specs.
  //
  // ETP-5375 — the fallback value used to be a plain `{}`, indistinguishable from a
  // resolved-but-legitimately-empty allow set once it reached `useRoleMenu()`, which
  // permanently defeated the ETP-4514 "zero access" blocking screen. It must carry the
  // MENU_ACCESS_UNREACHABLE sentinel instead — see menuTree.js's own comment on it.
  it('keeps windowAccess/capabilities and falls back to the unreachable-menu sentinel when the menu fetch (SFListMenu) itself fails', async () => {
    stubFetch(jsonResponse(PAYLOAD), menuTextResponse('<!doctype html><html><body>App</body></html>'));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });
  });

  it('keeps windowAccess/capabilities and falls back to the unreachable-menu sentinel when the menu fetch (SFListMenu) rejects outright', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (
      String(url).includes('/listmenu')
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(jsonResponse(PAYLOAD))
    )));
    const result = await fetchWindowAccess({ token: 'tok' });
    expect(result).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });
  });

  // ETP-5395 — production regression: on app.etendo.ai a correct SFListMenu answer for a
  // Purchasing role took longer than the old 1s budget, so the menu fell back to "unknown"
  // and the sidebar showed every entry (Ventas included) on every load. A slow but valid
  // answer must be used, not replaced by the fail-open sentinel.
  it('uses a slow but successful SFListMenu answer instead of failing open', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url) => (
      String(url).includes('/listmenu')
        ? new Promise((resolve) => { setTimeout(() => resolve(menuTextResponse(MENU_TREE)), 2_500); })
        : Promise.resolve(jsonResponse(PAYLOAD))
    )));

    const resultPromise = fetchWindowAccess({ token: 'tok' });
    await vi.advanceTimersByTimeAsync(2_500);

    await expect(resultPromise).resolves.toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });
    vi.useRealTimers();
  });

  it('does not block window access forever when SFListMenu never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url) => (
      String(url).includes('/listmenu')
        ? new Promise(() => {})
        : Promise.resolve(jsonResponse(PAYLOAD))
    )));

    const resultPromise = fetchWindowAccess({ token: 'tok' });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });
    vi.useRealTimers();
  });

  // ETP-5189 follow-up — this is the behavior the whole cache exists for: a burst of
  // silent refreshes within the 60s TTL must not re-hit SFListMenu each time. Only the
  // menu fetch is cached (see `fetchMenuAccess()` in App.jsx), so `/windowaccessmap`
  // is still expected to be called once per `fetchWindowAccess()` invocation.
  it('caches the SFListMenu fetch so two calls within the TTL only hit /listmenu once', async () => {
    stubFetch(jsonResponse(PAYLOAD));

    const first = await fetchWindowAccess({ token: 'tok' });
    const second = await fetchWindowAccess({ token: 'tok' });

    expect(first).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });
    expect(second).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });

    const calls = globalThis.fetch.mock.calls.map(([url]) => String(url));
    const menuCalls = calls.filter((url) => url.includes('/listmenu'));
    const windowAccessCalls = calls.filter((url) => url.includes('/windowaccessmap'));
    expect(menuCalls).toHaveLength(1);
    expect(windowAccessCalls).toHaveLength(2);
  });

  // [ETP-5395] — the other half of the TTL shrink: the whole point of moving from
  // 60s to 3s (see App.jsx's MENU_ACCESS_CACHE_TTL_MS comment) is that the cache
  // must actually EXPIRE quickly enough to pick up a real permission change, not
  // just dedupe a same-burst sequence of calls (already proven by the test above).
  // Uses fake timers to advance `Date.now()` past the 3s TTL between two calls —
  // real timers would make this test slow and flaky. This mirrors the existing
  // "does not block window access forever" test's use of fake timers with the same
  // mocked-fetch setup, so no `advanceTimersByTimeAsync` is needed to unblock the
  // calls themselves (the fetch/menu mocks resolve via microtasks, not timers) —
  // it's only used here to move the clock forward.
  it('refetches SFListMenu once the TTL has elapsed instead of serving the stale cache', async () => {
    vi.useFakeTimers();
    try {
      stubFetch(jsonResponse(PAYLOAD));

      const first = await fetchWindowAccess({ token: 'tok' });
      expect(first).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });

      // Past the 3s TTL, with margin.
      await vi.advanceTimersByTimeAsync(3_100);

      const second = await fetchWindowAccess({ token: 'tok' });
      expect(second).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });

      const calls = globalThis.fetch.mock.calls.map(([url]) => String(url));
      const menuCalls = calls.filter((url) => url.includes('/listmenu'));
      expect(menuCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // [ETP-5395 QA, superseded by ETP-5403] — the FAILURE case (the
  // `MENU_ACCESS_UNREACHABLE` sentinel, see fetchMenuAccess()'s catch branch) is
  // cached too, not just successful resolutions — this is what bounds the
  // request-volume regression under a genuinely down/unreachable SFListMenu. As of
  // ETP-5403, failure outcomes are stamped with their OWN, much longer TTL
  // (`MENU_ACCESS_FAILURE_TTL_MS`, 60s) instead of sharing the 3s success TTL — see
  // the two tests below for the decoupled behavior. This test only proves the
  // within-TTL dedupe still holds for the failure path; it says nothing about which
  // TTL governs it.
  it('caches the SFListMenu FAILURE too, so two calls within the TTL only attempt /listmenu once', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (
      String(url).includes('/listmenu')
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(jsonResponse(PAYLOAD))
    )));

    const first = await fetchWindowAccess({ token: 'tok' });
    const second = await fetchWindowAccess({ token: 'tok' });

    expect(first).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });
    expect(second).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });

    const calls = globalThis.fetch.mock.calls.map(([url]) => String(url));
    const menuCalls = calls.filter((url) => url.includes('/listmenu'));
    expect(menuCalls).toHaveLength(1);
  });

  // [ETP-5403] — the regression this ticket fixes: under a sustained outage, the
  // failure outcome must NOT expire at the short 3s success-path TTL. Advancing the
  // clock past `MENU_ACCESS_CACHE_TTL_MS` (3s) but staying well under
  // `MENU_ACCESS_FAILURE_TTL_MS` (60s) must still serve the cached failure sentinel
  // without a second /listmenu attempt — this is the "20x/min retry storm" the
  // ticket's background section describes, now closed.
  it('does not re-attempt SFListMenu at the short success TTL after a failure — stays throttled near the failure TTL', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((url) => (
        String(url).includes('/listmenu')
          ? Promise.reject(new Error('network down'))
          : Promise.resolve(jsonResponse(PAYLOAD))
      )));

      const first = await fetchWindowAccess({ token: 'tok' });
      expect(first).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });

      // Past the old 3s success TTL, with margin, but well under the 60s failure TTL.
      await vi.advanceTimersByTimeAsync(3_100);

      const second = await fetchWindowAccess({ token: 'tok' });
      expect(second).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });

      const calls = globalThis.fetch.mock.calls.map(([url]) => String(url));
      const menuCalls = calls.filter((url) => url.includes('/listmenu'));
      expect(menuCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // [ETP-5403] — the failure cache must still eventually expire and recover once the
  // outage clears; the longer TTL throttles retries, it does not disable them.
  it('re-attempts SFListMenu once the failure TTL has elapsed', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((url) => (
        String(url).includes('/listmenu')
          ? Promise.reject(new Error('network down'))
          : Promise.resolve(jsonResponse(PAYLOAD))
      )));

      const first = await fetchWindowAccess({ token: 'tok' });
      expect(first).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });

      // Past the 60s failure TTL, with margin.
      await vi.advanceTimersByTimeAsync(60_100);

      const second = await fetchWindowAccess({ token: 'tok' });
      expect(second).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });

      const calls = globalThis.fetch.mock.calls.map(([url]) => String(url));
      const menuCalls = calls.filter((url) => url.includes('/listmenu'));
      expect(menuCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // [ETP-5403 QA] — the decoupling must work in both directions: once a failure
  // recovers into a SUCCESS, that outcome must be cached at the short 3s success TTL
  // again, not left lingering at the 60s failure TTL from the previous attempt. Each
  // `fetchMenuAccess()` call picks its TTL from its OWN outcome, not the cache's prior
  // one — this proves it, by forcing a failure -> recovery -> success sequence and
  // showing the post-recovery cache still expires quickly.
  it('re-caches at the short success TTL again once a failure recovers into a success', async () => {
    vi.useFakeTimers();
    try {
      let shouldFail = true;
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (String(url).includes('/listmenu')) {
          return shouldFail ? Promise.reject(new Error('network down')) : Promise.resolve(menuTextResponse(MENU_TREE));
        }
        return Promise.resolve(jsonResponse(PAYLOAD));
      }));

      const first = await fetchWindowAccess({ token: 'tok' });
      expect(first).toEqual({ ...PAYLOAD, menuAccess: { [MENU_ACCESS_UNREACHABLE]: true } });

      // Past the 60s failure TTL — the outage has now cleared.
      await vi.advanceTimersByTimeAsync(60_100);
      shouldFail = false;

      const second = await fetchWindowAccess({ token: 'tok' });
      expect(second).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });

      // Only past the short 3s success TTL, well under the 60s failure TTL — if the
      // recovered success were mistakenly cached at 60s, this would still be served
      // from cache and no third /listmenu call would happen.
      await vi.advanceTimersByTimeAsync(3_100);

      const third = await fetchWindowAccess({ token: 'tok' });
      expect(third).toEqual({ ...PAYLOAD, menuAccess: EXPECTED_MENU_ACCESS });

      const calls = globalThis.fetch.mock.calls.map(([url]) => String(url));
      const menuCalls = calls.filter((url) => url.includes('/listmenu'));
      expect(menuCalls).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
