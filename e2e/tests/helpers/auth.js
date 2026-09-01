/**
 * Authentication and navigation helpers for E2E tests.
 *
 * Two modes:
 *
 * Mock mode (default when BASE_URL is not set, or E2E_USE_MOCK=1):
 *   Seeds localStorage with a fake token before React boots and intercepts /sws/*
 *   so useEntity never receives a 401 and never calls logout().
 *
 * Real Etendo mode (BASE_URL set, or E2E_USE_MOCK=0):
 *   Uses the current onboarding login flow, then enters the first available environment.
 */

const MOCK_MODE_OVERRIDE = process.env.E2E_USE_MOCK;
const IS_MOCK_MODE = MOCK_MODE_OVERRIDE === '1' || (MOCK_MODE_OVERRIDE !== '0' && !process.env.BASE_URL);

export const DEFAULT_USER = process.env.E2E_USER || 'goadmin@etendo.software';
export const DEFAULT_LOGIN_PASS = process.env.E2E_PASSWORD || '';

/**
 * Authenticate for E2E tests.
 *
 * In mock mode: seeds localStorage + intercepts /sws/* API calls.
 * In real mode: fills the onboarding login form and enters the first available environment.
 */
export async function login(page, {
  user = DEFAULT_USER,
  password = DEFAULT_LOGIN_PASS,
} = {}) {
  if (IS_MOCK_MODE) {
    // Inject token before React boots so AuthContext.isAuthenticated = true.
    await page.addInitScript(() => {
      localStorage.setItem('sf_auth_token', 'e2e-mock-token');
      localStorage.setItem('sf_auth_user', 'admin');
      // ETP-4520 — also seed a selected role: AuthProvider's hydration effect
      // only fetches window access when `session.selectedRole` is present, so
      // without this every generated window's WindowAccessGuard would fail
      // closed to "none" and block rendering entirely (blank page).
      localStorage.setItem('sf_auth_selected_role', JSON.stringify({ id: 'e2e-mock-role', name: 'Administrator' }));

      // Stub the SFWindowAccessMap endpoint itself. It's reached via NEO
      // Headless's own `/sws/neo/windowaccessmap` bridge (ETP-4513 — moved off
      // the Webhooks module's `/webhooks/SFWindowAccessMap`, which required a
      // per-role grant row wiped by `update.database`), which WOULD be caught
      // by the generic page.route('**/sws/**') interception below — but unlike
      // that route, a JSON-serialized response can't grant "full access to
      // every window" without enumerating every window id up front. A real JS
      // Proxy constructed here (in-browser, not sent over the wire) can,
      // mirroring the same trick used by the app's own dev-mode mockFetch.js
      // for this identical endpoint. Intercepting at the window.fetch layer
      // (rather than page.route) also sidesteps any LIFO route-registration
      // ordering concerns with the generic /sws/** catch-all below.
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (url && url.includes('/sws/neo/windowaccessmap')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              windowAccess: new Proxy({}, { get: () => 'full' }),
              capabilities: new Proxy({}, { get: () => true }),
            }),
          });
        }
        return realFetch(input, init);
      };
    });

    // Intercept /sws/* to prevent the real Etendo backend receiving our fake
    // token (which would return 401 and trigger logout()).
    // - GET /selectors/**  → single synthetic item so product search dropdowns populate
    // - POST /**/callout   → synthetic updates so forceCalloutFields can override user values
    // - POST/PUT/PATCH     → synthetic saved record so the UI can navigate to detail
    // - GET (other)        → empty list
    await page.route('**/sws/**', (route) => {
      const url = route.request().url();
      const method = route.request().method();
      // ETP-4576 — the session is RESTORED FROM THE SERVER, not seeded into localStorage: the
      // shell asks GET /sws/go/session on mount and treats anything else as anonymous. Handled
      // here rather than in its own page.route because Playwright resolves routes LIFO, so this
      // catch-all — registered last — would swallow a more specific one anyway. Without it every
      // spec bounces off the auth guard into /onboarding and never reaches the page under test.
      // The account owns an environment: an empty list is what sends the shell into the
      // onboarding wizard, so the catch-all's generic `{ data: [] }` would strand every spec
      // on the "let's get you set up" screen rather than the page under test.
      if (url.includes('/sws/go/environments') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            clientId: 'e2e-mock-client',
            clientName: 'E2E Client',
            adminUserId: 'e2e-mock-user',
            roleId: 'e2e-mock-role',
            orgId: 'e2e-mock-org',
          }]),
        });
      }
      if (url.includes('/sws/go/session') && method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            csrfToken: 'e2e-mock-csrf',
            account: { name: 'admin', email: 'admin@e2e.test' },
            environment: { clientId: 'e2e-mock-client', roleId: 'e2e-mock-role', orgId: 'e2e-mock-org' },
            roleList: [{
              id: 'e2e-mock-role',
              name: 'Administrator',
              orgList: [{ id: 'e2e-mock-org', name: 'E2E Org' }],
            }],
          }),
        });
      }
      // SFListMenu is reached via `/sws/neo/listmenu` now (ETP-4513 — moved off the Webhooks
      // module's `/webhooks/SFListMenu`). Before that move, this generic `/sws/**` catch-all
      // never matched the old `/webhooks/*` path at all, so the fetch failed unmocked and
      // useRoleMenu() fell back to its documented `null` ("webhook unreachable" → don't filter,
      // show the full unfiltered sidebar) — the behavior every test in this suite that doesn't
      // explicitly mock listmenu (see role-filtered-sidebar.mocked.spec.js for the one that does)
      // was actually written against. Aborting here reproduces that same fallback instead of
      // silently "succeeding" with an empty/malformed tree, which would resolve to an empty
      // allowed-id Set and filter every AD-backed menu item out — see menuTree.js's own comment
      // on this exact failure mode for why a well-formed-but-wrong-shape 200 isn't safe either.
      if (url.includes('/sws/neo/listmenu')) {
        route.abort();
      } else if (url.includes('/sws/neo/session')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ currencyCode: 'EUR' }),
        });
      } else if (url.includes('/sws/neo/dashboard/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
      } else if (url.includes('/selectors/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [{ id: 'prod-e2e', label: 'Test Product', name: 'Test Product', _identifier: 'Test Product' }] }),
        });
      } else if (method === 'POST' && url.includes('/callout')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            updates: { quantityCount: { value: 42 }, bookQuantity: { value: 42 } },
            combos: {},
            messages: [],
          }),
        });
      } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'e2e-record-id', data: {}, success: true }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], totalRows: 0 }),
        });
      }
    });

    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    return;
  }

  if (!password) {
    throw new Error('Set E2E_PASSWORD for real-backend E2E login, or set E2E_USE_MOCK=1 for mock mode.');
  }

  await page.goto('/onboarding');

  // If already logged in, the page redirects away from /onboarding (to dashboard,
  // environment list, or the last visited window). Detect this and go to dashboard.
  const stayedOnOnboarding = await page.waitForURL('**/onboarding**', { timeout: 2_000 }).then(() => true).catch(() => false);
  if (!stayedOnOnboarding) {
    // Already logged in — navigate to dashboard and return
    if (!page.url().includes('/dashboard')) {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    }
    return;
  }

  const switchToLogin = page.getByTestId('action-switch-to-login');
  if (await switchToLogin.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await switchToLogin.click();
  }

  await page.locator('#login-email').fill(user);
  await page.locator('#login-password').fill(password);
  await page.getByTestId('action-login-submit').click();

  await expectAnyEnvironmentOrDashboard(page);

  if (page.url().includes('/dashboard')) return;

  const enterButton = page.locator('[data-testid^="action-enter-environment-"]').first();
  await enterButton.click({ timeout: 30_000 });
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function expectAnyEnvironmentOrDashboard(page) {
  await Promise.race([
    page.waitForURL('**/dashboard', { timeout: 30_000 }),
    page.locator('[data-testid^="action-enter-environment-"]').first().waitFor({ state: 'visible', timeout: 30_000 }),
  ]);
}

/**
 * Navigate to a specific window by slug.
 * Uses path-based routing (not hash-based).
 */
export async function navigateTo(page, windowSlug) {
  await page.goto(`/${windowSlug}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}
