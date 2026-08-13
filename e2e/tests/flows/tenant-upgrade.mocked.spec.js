import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Tenant upgrade (`tenant-upgrade` flag) — smoke (mocked). ETP-4686.
 *
 * Covers the flag-gated menu entry, the mock checkout, the NDJSON provisioning
 * stream and the two failure paths (client-side decline, backend 402 paywall).
 *
 * Mock mode only: every route here is installed on top of the generic `/sws/**`
 * stub that `login()` seeds, so no backend is needed. Playwright matches routes
 * in reverse registration order, so these specific routes win.
 *
 * ## Running this spec
 *
 * The flag is read from `import.meta.env.VITE_FEATURE_FLAGS`, which Vite bakes
 * in when the dev server starts — it cannot be flipped per test. So the two
 * flag-dependent tests are selected by `E2E_TENANT_UPGRADE_FLAG`, and the suite
 * is run once per flag state against a matching dev server:
 *
 *   # flag off (default) — the regression guard
 *   npx vite --port 3101
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3101 \
 *     npx playwright test tests/flows/tenant-upgrade.mocked.spec.js --project=mocked
 *
 *   # flag on
 *   VITE_FEATURE_FLAGS='{"tenant-upgrade":true}' npx vite --port 3102
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3102 E2E_TENANT_UPGRADE_FLAG=on \
 *     npx playwright test tests/flows/tenant-upgrade.mocked.spec.js --project=mocked
 *
 * Everything except the menu entry runs in both states, because `/upgrade` is
 * registered unconditionally — the flag gates the entry point, not the route
 * (see `docs/feature-flags.md`, rule 3). Collapsing this to a single run needs a
 * runtime override seam in `lib/flags/bootstrap.js`; see the spec's Jira notes.
 */

const FLAG_ON = process.env.E2E_TENANT_UPGRADE_FLAG === 'on';

/** Matches `createMockPaymentToken()` — lowercase hex is part of the backend contract. */
const PAID_TOKEN_PATTERN = /^mock-paid-[0-9a-f]+$/;

const DECLINE_CARD = '4000000000000002';
const GOOD_CARD = '4242424242424242';
/** Well past today; a card is valid through the last day of its expiry month. */
const FUTURE_EXPIRY = '12/30';

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
 * (`useEnvironmentSwitch.js`) calls `GET /sws/go/login?userId=...` and only
 * proceeds with its hard `window.location.href = '/'` navigation if the
 * response includes a `token` — without one it silently no-ops.
 */
async function installEnvironmentLoginMock(page, { token, roleList } = {}) {
  await page.route('**/sws/go/login{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token, roleList }),
    });
  });
}

/**
 * Mocks the onboarding endpoint and records every request body it receives, so
 * a test can assert both what was sent and that nothing was sent at all.
 *
 * `route.fulfill` always delivers its `body` as a single complete response —
 * it cannot stream a chunked/NDJSON body incrementally, so this mock never
 * reproduces genuine per-step streaming. `delayMs` (default 0, so the other
 * tests using this mock are unaffected) only holds the fulfilled response
 * back by a fixed amount, giving a test a deterministic window in which
 * UpgradePage's `running` phase is mounted before the response resolves.
 */
async function installOnboardingMock(page, { status = 200, success = true, delayMs = 0 } = {}) {
  const requests = [];
  await page.route('**/sws/go/onboarding{/**,}**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();

    requests.push(JSON.parse(request.postData() || '{}'));

    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

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

async function fillCheckout(page, { tenantName, cardNumber = GOOD_CARD }) {
  await page.getByTestId('upgrade-tenant-name').fill(tenantName);
  await page.getByTestId('upgrade-cardholder').fill('Ada Lovelace');
  await page.getByTestId('upgrade-card-number').fill(cardNumber);
  await page.getByTestId('upgrade-expiry').fill(FUTURE_EXPIRY);
  await page.getByTestId('upgrade-cvc').fill('123');
}

async function gotoUpgrade(page) {
  await page.goto('/upgrade');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('Tenant upgrade — flag gating of the menu entry', () => {
  test.beforeEach(async ({ page }) => {
    await seedPlatformToken(page);
    await login(page);
  });

  test('flag off: the user menu offers no upgrade entry', async ({ page }) => {
    test.skip(FLAG_ON, 'Requires a dev server started without VITE_FEATURE_FLAGS');

    await page.getByTestId('topbar-user-menu').click();
    // Assert the menu actually opened, so an absent entry cannot be a false pass.
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();
    await expect(page.getByTestId('menu-tenant-upgrade')).toHaveCount(0);
  });

  test('flag on: the entry is offered and opens the upgrade page', async ({ page }) => {
    test.skip(!FLAG_ON, 'Requires a dev server started with VITE_FEATURE_FLAGS tenant-upgrade=true');

    await page.getByTestId('topbar-user-menu').click();
    await expect(page.getByTestId('user-menu-logout')).toBeVisible();

    const entry = page.getByTestId('menu-tenant-upgrade');
    await expect(entry).toBeVisible();
    await entry.click();

    await expect(page).toHaveURL(/\/upgrade$/);
    await expect(page.getByTestId('upgrade-plan-productive')).toBeVisible();
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

    // installOnboardingMock cannot stream the NDJSON body incrementally (see
    // its doc comment), so this delay is what makes the intermediate
    // `running` phase observable at all: without it, the mock resolves
    // faster than Playwright's first poll and the progress panel is
    // sometimes never caught mounted (the original flake behind ETP-4686).
    const RUNNING_PHASE_DELAY_MS = 750;
    const requests = await installOnboardingMock(page, { delayMs: RUNNING_PHASE_DELAY_MS });

    // enterByClientName (useEnvironmentSwitch.js) re-fetches /environments to
    // find the tenant by name, then switchTo() logs into it via this route —
    // both need a response, or the auto-enter after success silently fails.
    const NEW_ENV_TOKEN = 'e2e-new-env-token';
    await installEnvironmentLoginMock(page, {
      token: NEW_ENV_TOKEN,
      roleList: [{ id: 'role-productive', name: 'Administrator', orgList: [{ id: 'org-productive', name: 'Acme Productive HQ' }] }],
    });

    await gotoUpgrade(page);

    // Both plans are compared before any payment detail is asked for.
    await expect(page.getByTestId('upgrade-plan-free')).toBeVisible();
    await expect(page.getByTestId('upgrade-plan-productive')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();

    await fillCheckout(page, { tenantName: 'Acme Productive' });
    await page.getByTestId('upgrade-submit').click();

    // The progress panel mounts with all steps seeded (UpgradePage sets phase
    // to 'running' before awaiting the request), and the mock is still
    // holding the response back, so success has not happened yet. This does
    // NOT verify that steps update one by one as they stream in — the mock
    // cannot deliver a chunked body, so per-step progression is unobservable
    // here — only that the running phase renders before success replaces it.
    await expect(page.getByTestId('upgrade-progress')).toBeVisible();
    await expect(page.getByTestId('upgrade-progress-step-finalize')).toBeVisible();
    await expect(page.getByTestId('upgrade-success')).toHaveCount(0);

    // Once the delayed mock resolves, the success panel replaces the form.
    await expect(page.getByTestId('upgrade-success')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toHaveCount(0);

    // The mock charge minted a token in the shape the backend accepts.
    expect(requests).toHaveLength(1);
    expect(requests[0].clientName).toBe('Acme Productive');
    expect(requests[0].paymentToken).toMatch(PAID_TOKEN_PATTERN);

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

    // sf_auth_client_name is written by buildEnvironmentSessionStorage and
    // not touched by login()'s init script (unlike sf_auth_token, which that
    // script reseeds on every new document — see auth.js), so it is the
    // reliable signal that the session landed in the new tenant rather than
    // merely surviving the reload with the old one.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('sf_auth_client_name')))
      .toBe('Acme Productive');
  });

  test('declined test card fails client-side and never reaches the backend', async ({ page }) => {
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await fillCheckout(page, { tenantName: 'Acme Productive', cardNumber: DECLINE_CARD });
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-error')).toBeVisible();
    // The whole point of the decline card is to exercise the error path without
    // a request, so the checkout stays put and nothing was posted.
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
    await expect(page.getByTestId('upgrade-progress')).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });

  test('backend 402 paywall surfaces an error and keeps the user on the checkout', async ({ page }) => {
    const requests = await installOnboardingMock(page, { status: 402 });
    await gotoUpgrade(page);

    await fillCheckout(page, { tenantName: 'Acme Productive' });
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-error')).toBeVisible();
    await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
    await expect(page.getByTestId('upgrade-success')).toHaveCount(0);
    // The request was made — this path is the backend refusing, not the client.
    expect(requests).toHaveLength(1);
  });

  test('a tenant name the account already owns is rejected before paying', async ({ page }) => {
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await fillCheckout(page, { tenantName: EXISTING_TENANT });
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-tenant-name-error')).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test('an invalid card is rejected field by field without posting', async ({ page }) => {
    const requests = await installOnboardingMock(page);
    await gotoUpgrade(page);

    await page.getByTestId('upgrade-tenant-name').fill('Acme Productive');
    await page.getByTestId('upgrade-cardholder').fill('Ada Lovelace');
    await page.getByTestId('upgrade-card-number').fill('4242');
    await page.getByTestId('upgrade-expiry').fill('01/20');
    await page.getByTestId('upgrade-cvc').fill('1');
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-card-number-error')).toBeVisible();
    await expect(page.getByTestId('upgrade-expiry-error')).toBeVisible();
    await expect(page.getByTestId('upgrade-cvc-error')).toBeVisible();
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
