import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Paid productive environment — smoke (mocked). ETP-4686, ETP-4966.
 *
 * Covers the menu entry, the hosted checkout contract, the NDJSON provisioning
 * stream and the two failure paths (checkout creation, backend 402 paywall).
 *
 * Mock mode only: every route here is installed on top of the generic `/sws/**`
 * stub that `login()` seeds, so no backend is needed. Playwright matches routes
 * in reverse registration order, so these specific routes win.
 *
 * ## Running this spec
 *
 * No flag setup is needed since ETP-4966 retired `tenant-upgrade`: the capability
 * is permanent, so every test here runs the same way regardless of how the dev
 * server was started.
 *
 *   npx vite --port 3101
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3101 \
 *     npx playwright test tests/flows/tenant-upgrade.mocked.spec.js --project=mocked
 */

const EXISTING_TENANT = 'Acme Trial';
const EXISTING_ENVIRONMENTS = [
  { clientName: EXISTING_TENANT, adminUserId: 'user-1', adminUserName: 'admin', plan: 'free' },
];

const PROVISIONING_STEPS = ['setup', 'client', 'organization', 'dataset', 'sequences', 'finalize'];

/** Builds the NDJSON body the onboarding endpoint streams back. */
function ndjsonBody({ success = true } = {}) {
  const lines = [];
  for (const step of PROVISIONING_STEPS) {
    lines.push(JSON.stringify({ type: 'progress', step, status: 'in_progress' }));
    lines.push(JSON.stringify({ type: 'progress', step, status: 'done', ms: 10 }));
  }
  lines.push(JSON.stringify({ type: 'result', success, clientName: 'Acme Productive' }));
  return `${lines.join('\n')}\n`;
}

/**
 * Seeds the account-level token `getPlatformToken()` reads. `login()` only seeds
 * the ERP session token, and tenant creation authenticates with the platform one.
 */
async function seedPlatformToken(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_platform_token', 'e2e-platform-token');
  });
}

/**
 * Reads `environments` at fulfill time, not at registration time — so a test
 * that keeps the same array reference and pushes into it later (e.g. once a
 * new tenant has been "provisioned") sees a route that stays in sync with
 * that mutation, without re-registering the route.
 */
async function installEnvironmentsMock(page, environments) {
  await page.route('**/sws/go/environments{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ environments }),
    });
  });
}

/**
 * Mocks entering an already-provisioned environment. `switchTo`
 * (`useEnvironmentSwitch.js`) calls `POST /sws/go/session/environment` and only
 * proceeds with its hard `window.location.href = '/'` navigation when the
 * response says `status: 'success'` — otherwise it silently no-ops.
 *
 * ETP-4575/4576: this used to be `GET /sws/go/login?userId=...` gated on a
 * `token` in the body. The backend now rotates the `__Host-` session cookie for
 * the target environment and returns only a fresh CSRF proof, so there is no
 * token to hand back and `status` is what the client reads. A route on the old
 * path never matches, and the switch would no-op forever.
 */
async function installEnvironmentLoginMock(page, { roleList } = {}) {
  const requests = [];
  await page.route('**/sws/go/session/environment', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', csrfToken: 'e2e-csrf-env', roleList }),
    });
  });
  return { requests };
}

/** Mocks provider-hosted checkout creation and the paid return status. */
async function installCheckoutMock(page, { status = 201 } = {}) {
  const requests = [];
  const requestId = 'checkout-request-1';

  await page.route('**/sws/go/checkout/sessions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests.push(JSON.parse(route.request().postData() || '{}'));
    if (status !== 201) {
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Checkout unavailable' }),
      });
    }
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId,
        checkoutUrl: new URL(`/upgrade?checkout=success&requestId=${requestId}`, route.request().url()).toString(),
        mode: 'subscription',
      }),
    });
  });

  await page.route(`**/sws/go/checkout/sessions/${requestId}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'paid', clientName: 'Acme Productive' }),
    });
  });
  return requests;
}

/**
 * A latch the test opens by hand. Handed to `installOnboardingMock` as
 * `holdUntil`, it keeps the mocked response pending for as long as the test
 * needs, instead of for a guessed number of milliseconds.
 */
function createGate() {
  let open;
  const opened = new Promise((resolve) => { open = resolve; });
  return { opened, open };
}

/**
 * Mocks the onboarding endpoint and records every request body it receives, so
 * a test can assert both what was sent and that nothing was sent at all.
 *
 * `route.fulfill` always delivers its `body` as a single complete response —
 * it cannot stream a chunked/NDJSON body incrementally, so this mock never
 * reproduces genuine per-step streaming. `holdUntil` (default: none, so the
 * other tests using this mock are unaffected) parks the response on a promise
 * the test resolves itself, which is what makes UpgradePage's intermediate
 * `running` phase observable.
 *
 * This used to be a fixed `delayMs` and it flaked twice (ETP-4686, then again
 * on 2026-08-25): a wall-clock window only has to be shorter than the gap
 * between two of Playwright's polls for the progress panel to mount and be
 * replaced by success unseen, which is likelier the more loaded the machine
 * is — precisely when the whole suite runs. A latch has no window to lose.
 */
async function installOnboardingMock(page, { status = 200, success = true, holdUntil = null } = {}) {
  const requests = [];
  await page.route('**/sws/go/onboarding{/**,}**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();

    requests.push(JSON.parse(request.postData() || '{}'));

    if (holdUntil) await holdUntil;

    if (status === 402) {
      return route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'payment_required', message: 'Payment is required' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: ndjsonBody({ success }),
    });
  });
  return requests;
}

async function fillCheckout(page, tenantName) {
  await page.getByTestId('upgrade-tenant-name').fill(tenantName);
}

async function gotoUpgrade(page) {
  await page.goto('/upgrade');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('Tenant upgrade — the menu entry is unconditional', () => {
  test.beforeEach(async ({ page }) => {
    await seedPlatformToken(page);
    await login(page);
  });

  test('the user menu always offers the upgrade entry', async ({ page }) => {
    // ETP-4966 retired the `tenant-upgrade` flag, so this no longer depends on how the dev server
    // was started. The old spec asserted the opposite and skipped itself against a flag-on server —
    // which is precisely why nobody noticed the two ends of the flag disagreeing in production.
    await page.getByTestId('topbar-user-menu').click();
    // Assert the menu actually opened, so a present entry cannot be a false pass either way.
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();
    await expect(page.getByTestId('menu-tenant-upgrade')).toBeVisible();
  });
});

test.describe('Tenant upgrade — checkout and provisioning', () => {
  test.beforeEach(async ({ page }) => {
    await seedPlatformToken(page);
    await login(page);
    await installEnvironmentsMock(page, EXISTING_ENVIRONMENTS);
  });

  test('happy path: checkout streams provisioning progress, auto-enters the new environment', async ({ page }) => {
    // A private copy: the beforeEach mock above already wired the ambient
    // EXISTING_ENVIRONMENTS array to the environments route, but this test
    // needs to grow that list once provisioning succeeds (see below) without
    // leaking the newly "provisioned" tenant into any other test in this
    // file. Re-registering the same route pattern here shadows the beforeEach
    // one (Playwright resolves same-pattern routes in reverse registration
    // order), and installEnvironmentsMock reads the array at fulfill time, so
    // a later push() is picked up without a second registration.
    const environments = [...EXISTING_ENVIRONMENTS];
    await installEnvironmentsMock(page, environments);

    const checkoutRequests = await installCheckoutMock(page);

    // installOnboardingMock cannot stream the NDJSON body incrementally (see
    // its doc comment), so this latch is what makes the intermediate `running`
    // phase observable at all: provisioning cannot finish until this test says
    // so, well after it has asserted the progress panel.
    const provisioning = createGate();
    const requests = await installOnboardingMock(page, { holdUntil: provisioning.opened });

    // enterByClientName (useEnvironmentSwitch.js) re-fetches /environments to
    // find the tenant by name, then switchTo() logs into it via this route —
    // both need a response, or the auto-enter after success silently fails.
    const { requests: envLoginRequests } = await installEnvironmentLoginMock(page, {
      roleList: [{ id: 'role-productive', name: 'Administrator', orgList: [{ id: 'org-productive', name: 'Acme Productive HQ' }] }],
    });

    await gotoUpgrade(page);

    // Both plans are compared before any payment detail is asked for.
    await expect(page.getByTestId('upgrade-plan-free')).toBeVisible();
    await expect(page.getByTestId('upgrade-plan-productive')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();

    await fillCheckout(page, 'Acme Productive');
    await page.getByTestId('upgrade-submit').click();

    // The progress panel mounts with all steps seeded (UpgradePage sets phase
    // to 'running' before awaiting the request), and the mock is still
    // holding the response back, so success cannot have happened yet. This
    // does NOT verify that steps update one by one as they stream in — the
    // mock cannot deliver a chunked body, so per-step progression is
    // unobservable here — only that the running phase renders before success
    // replaces it.
    await expect(page.getByTestId('upgrade-progress')).toBeVisible();
    await expect(page.getByTestId('upgrade-progress-step-finalize')).toBeVisible();
    await expect(page.getByTestId('upgrade-success')).toHaveCount(0);

    // Only now can provisioning finish, and the success panel replace the form.
    provisioning.open();
    await expect(page.getByTestId('upgrade-success')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toHaveCount(0);

    expect(checkoutRequests).toEqual([{
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      clientName: 'Acme Productive',
      language: 'es_ES',
    }]);
    expect(requests).toHaveLength(1);
    expect(requests[0].clientName).toBe('Acme Productive');
    expect(requests[0].paymentToken).toBe('checkout-request-1');

    // The freshly provisioned tenant only becomes enterable once it exists —
    // mirrors what a real backend would do (a client created by this very
    // request would already be in a follow-up /environments list).
    environments.push({
      clientName: 'Acme Productive',
      adminUserId: 'user-2',
      clientId: 'client-2',
      adminUserName: 'admin',
      plan: 'productive',
    });

    // "Continue" enters the tenant that was just provisioned (ETP-4686,
    // commit 45be6bf36 replaced an earlier sign-out-first design with this
    // auto-enter). enterByClientName finds the match above, then switchTo
    // logs in and does a hard `window.location.href = '/'` — a real
    // navigation, so the app re-boots and lands wherever an authenticated
    // session resolves to (the same place login() itself waits for).
    await page.getByTestId('upgrade-success-continue').click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });

    // The old proof was `localStorage.sf_auth_client_name`, written by
    // `buildEnvironmentSessionStorage`. ETP-4576 deleted that function — the
    // tenant now lives in the rotated `__Host-` session cookie, which the page
    // cannot read, and the key is one of those `purgeLegacyAuthStorage()`
    // deletes. So there is nothing in localStorage left to assert on.
    //
    // The equivalent proof under the cookie session is the switch REQUEST: it
    // must have targeted the newly-provisioned tenant's admin user, not the one
    // the page booted with. That distinguishes "landed in the new tenant" from
    // "survived the reload with the old one" exactly as the key did.
    await expect.poll(() => envLoginRequests.length).toBeGreaterThan(0);
    expect(envLoginRequests.at(-1)).toMatchObject({ userId: 'user-2' });
  });

  test('checkout creation failure stays on the checkout without onboarding', async ({ page }) => {
    const checkoutRequests = await installCheckoutMock(page, { status: 503 });
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await fillCheckout(page, 'Acme Productive');
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-error')).toBeVisible();
    expect(checkoutRequests).toHaveLength(1);
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
    await expect(page.getByTestId('upgrade-progress')).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });

  test('backend 402 paywall surfaces an error and keeps the user on the checkout', async ({ page }) => {
    const checkoutRequests = await installCheckoutMock(page);
    const requests = await installOnboardingMock(page, { status: 402 });
    await gotoUpgrade(page);

    await fillCheckout(page, 'Acme Productive');
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-error')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
    await expect(page.getByTestId('upgrade-success')).toHaveCount(0);
    // The request was made — this path is the backend refusing, not the client.
    expect(checkoutRequests).toHaveLength(1);
    expect(requests).toHaveLength(1);
  });

  test('a tenant name the account already owns is rejected before paying', async ({ page }) => {
    const checkoutRequests = await installCheckoutMock(page);
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await fillCheckout(page, EXISTING_TENANT);
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-tenant-name-error')).toBeVisible();
    expect(checkoutRequests).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  test('an unavailable checkout response stays on the form without onboarding', async ({ page }) => {
    const checkoutRequests = await installCheckoutMock(page, { status: 503 });
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await fillCheckout(page, 'Acme Productive');
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-error')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
    expect(checkoutRequests).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });
});

test.describe('Tenant upgrade — an account with no tenants yet', () => {
  test.beforeEach(async ({ page }) => {
    await seedPlatformToken(page);
    await login(page);
    await installEnvironmentsMock(page, []);
  });

  test('offers free onboarding instead of a checkout', async ({ page }) => {
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await expect(page.getByTestId('upgrade-first-tenant-free')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toHaveCount(0);

    await page.getByTestId('upgrade-first-tenant-free-continue').click();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(requests).toHaveLength(0);
  });
});
