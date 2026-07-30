/**
 * Authentication and navigation helpers for E2E tests.
 *
 * Two modes:
 *
 * Mock mode (default when BASE_URL is not set, or E2E_USE_MOCK=1):
 *   Mocks GET /sws/go/session with a synthetic cookie-session payload (ETP-4576)
 *   so AuthProvider's mount-time restore resolves into an authenticated session,
 *   and intercepts the rest of /sws/* so useEntity never receives a 401 and
 *   never calls logout().
 *
 * Real Etendo mode (BASE_URL set, or E2E_USE_MOCK=0):
 *   Uses the current onboarding login flow, then enters the first available environment.
 */

const MOCK_MODE_OVERRIDE = process.env.E2E_USE_MOCK;
const IS_MOCK_MODE = MOCK_MODE_OVERRIDE === '1' || (MOCK_MODE_OVERRIDE !== '0' && !process.env.BASE_URL);

export const DEFAULT_USER = process.env.E2E_USER || 'goadmin@etendo.software';
export const DEFAULT_LOGIN_PASS = process.env.E2E_PASSWORD || '';

// ETP-4576 — defaults for the synthetic session served on GET /sws/go/session
// in mock mode. Overridable per test via `login(page, { org, role })`.
export const MOCK_ORG = { id: 'e2e-org', name: 'E2E Org' };
export const MOCK_ROLE = { id: 'e2e-role', name: 'Administrator' };

/**
 * Build the GET /sws/go/session body for a given org/role context.
 *
 * Mirrors the real 200 body of that endpoint (EtendoGoJwtServlet's
 * handleSessionRestore): { status, account, environment, roleList, csrfToken }.
 * Note there is no token anywhere — the session lives in the `__Host-` httpOnly
 * cookie, and the CSRF proof is the only thing the client ever holds.
 *
 * mapRestoredSession() (app-shell-core/src/auth/session.js) does NOT take the
 * `environment` block at face value: it resolves `selectedRole` by looking
 * `environment.roleId` up inside `roleList`, and `selectedOrg` by looking
 * `environment.orgId` up inside THAT role's `orgList`. Ids that don't
 * cross-reference resolve both to `null`, and a session without a
 * `selectedRole` never triggers AuthProvider's `fetchWindowAccess` — leaving
 * `windowAccess` at its fail-closed `{}` default, so WindowAccessGuard blanks
 * every generated window (the same failure mode the ETP-4520 note below the
 * old localStorage seeding used to describe).
 *
 * That is why this function — not the caller — owns the cross-referencing: the
 * caller only ever declares WHICH org/role it wants (`{ id, name }`), and both
 * `environment.roleId`/`environment.orgId` and the role's `orgList` are DERIVED
 * from those same objects here. Any `orgList` the caller puts on `role` is
 * deliberately overwritten, so a caller cannot produce an incoherent payload.
 *
 * @param {object} [context]
 * @param {{id: string, name?: string}|null} [context.org]
 *        The selected organisation. Pass `null` for the "authenticated but no
 *        organisation selected" case (`selectedOrg === null`) — several windows
 *        render a dedicated empty state for it (fiscal-config's `fiscal.noOrg`,
 *        fiscal-monitor's setup description). The role is still selected in that
 *        case, so window access is still granted and the window actually renders.
 * @param {{id: string, name?: string}} [context.role] The selected role.
 */
function buildSessionResponse({ org = MOCK_ORG, role = MOCK_ROLE } = {}) {
  if (!role) {
    throw new Error(
      'login({ role: null }) is not supported: a session with no selected role never triggers '
      + 'fetchWindowAccess, so WindowAccessGuard fails closed and every generated window renders '
      + 'blank. Use `org: null` for the "no environment selected" case instead.',
    );
  }

  const selectedOrg = org ? { ...org } : null;
  // orgList is derived, never taken from the caller — see the note above.
  const selectedRole = { ...role, orgList: selectedOrg ? [selectedOrg] : [] };

  return {
    status: 'success',
    account: { id: 'e2e-account', name: 'E2E Admin', email: 'e2e@etendo.software' },
    environment: {
      userId: 'e2e-user',
      roleId: selectedRole.id,
      clientId: 'e2e-client',
      orgId: selectedOrg ? selectedOrg.id : null,
      warehouseId: 'e2e-warehouse',
    },
    roleList: [selectedRole],
    csrfToken: 'e2e-mock-csrf',
  };
}

// The default session (no overrides) — what the ~84 specs that call `login(page)`
// with no arguments get served.
export const MOCK_SESSION_RESPONSE = buildSessionResponse();

/**
 * Authenticate for E2E tests.
 *
 * In mock mode: mocks the cookie session + intercepts /sws/* API calls.
 * In real mode: fills the onboarding login form and enters the first available environment.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {string} [options.user] Real-backend mode only.
 * @param {string} [options.password] Real-backend mode only.
 * @param {{id: string, name?: string}|null} [options.org]
 *        Mock mode only — the organisation the restored session lands on. Tests
 *        whose behaviour depends on a specific org id (e.g. general-ledger-
 *        configuration only POSTs when `selectedOrg.id` is set) pass it here
 *        instead of seeding localStorage: the `sf_auth_*` keys are dead and
 *        purged on mount (ETP-4576).
 * @param {{id: string, name?: string}} [options.role]
 *        Mock mode only — the role the restored session lands on.
 */
export async function login(page, {
  user = DEFAULT_USER,
  password = DEFAULT_LOGIN_PASS,
  org,
  role,
} = {}) {
  if (IS_MOCK_MODE) {
    // Built once per login() call, outside the route handler, so every request
    // the handler serves for this page answers with the same context. `org` and
    // `role` are only forwarded when explicitly passed, so buildSessionResponse's
    // own defaults stay in charge of the no-override case (and `org: null` stays
    // distinguishable from "org not specified").
    const sessionResponse = buildSessionResponse({
      ...(org !== undefined ? { org } : {}),
      ...(role !== undefined ? { role } : {}),
    });


    // ETP-4576 — nothing to seed in localStorage anymore. The sf_auth_* keys
    // this used to write (`sf_auth_token`, `sf_auth_user`,
    // `sf_auth_selected_role`) are dead: AuthProvider's default storage is
    // memory, it never reads them, and purgeLegacyAuthStorage() deletes those
    // exact keys on mount. Authentication now comes entirely from the
    // GET /sws/go/session mock installed in the route handler below — and the
    // role that ETP-4520 needed for `fetchWindowAccess` is derived from that
    // response's `roleList`, not from storage.
    await page.addInitScript(() => {
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
      //
      // ETP-4576 makes this MORE load-bearing, not less: the restored session
      // now really does carry a `selectedRole`, so AuthProvider's hydration
      // effect actually invokes fetchWindowAccess (before, with no role, it was
      // never called and this stub was never even hit).
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

    // Intercept /sws/* to prevent the real Etendo backend receiving a request
    // it would answer with a 401 (which triggers logout()).
    // - GET /sws/go/session      → the synthetic cookie session (ETP-4576)
    // - DELETE /sws/go/session   → 204, like the real server-side revoke
    // - GET /selectors/**  → single synthetic item so product search dropdowns populate
    // - POST /**/callout   → synthetic updates so forceCalloutFields can override user values
    // - POST/PUT/PATCH     → synthetic saved record so the UI can navigate to detail
    // - GET (other)        → empty list
    await page.route('**/sws/**', (route) => {
      const url = route.request().url();
      const method = route.request().method();
      // ETP-4576 — the session endpoint MUST be handled here, as a branch of this
      // same catch-all rather than as a separate page.route(): registering it
      // separately would leave its precedence over `**/sws/**` up to LIFO
      // registration order. And it must come FIRST, before any broader branch.
      //
      // Falling through to the generic `else` below would be actively harmful,
      // not merely useless: `{data: [], totalRows: 0}` is truthy, so
      // AuthProvider's restore would "succeed" and flip `status` to
      // 'authenticated', but mapRestoredSession() would derive
      // `selectedRole: null` from it — and a session with no selected role
      // never fetches the window-access map, so WindowAccessGuard fails closed
      // and every generated window renders blank.
      if (url.includes('/sws/go/session')) {
        // 204 No Content, matching the real DELETE (server-side session revoke)
        // in EtendoGoJwtServlet.handleSessionDelete.
        if (method === 'DELETE') {
          route.fulfill({ status: 204 });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(sessionResponse),
          });
        }
        return;
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

  const dashboardReady = await page.waitForURL('**/dashboard', { timeout: 2_000 }).then(() => true).catch(() => false);
  if (dashboardReady) return;

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
