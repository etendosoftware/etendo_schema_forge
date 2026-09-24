import { test, expect } from '@playwright/test';
import { login, declareCookieSession } from '../helpers/auth.js';

/**
 * Tenant upgrade under the COOKIE session scheme (ETP-5443 follow-up).
 *
 * `tenant-upgrade.mocked.spec.js` exercises the shipped default — `login()`'s mocked
 * `GET /sws/go/session` deliberately omits `csrfToken` so `sessionCredentials`'s `mode: 'auto'`
 * resolves to `bearer` (see that file's own comment). That means it never actually proves the
 * `/upgrade` checkout works once a real backend has migrated the session to the `__Host-`
 * cookie: every write there goes through `apiFetch`, which reads the active scheme from
 * `sessionCredentials` and puts the CSRF proof in `X-Go-CSRF` — never in `Authorization` — only
 * under `mode: 'cookie'`.
 *
 * This file re-runs the same checkout surface with `declareCookieSession()` (see
 * `../helpers/auth.js`) layered on top of `login()`, so `GET /sws/go/session` answers with a
 * `csrfToken` and the whole page runs in `mode: 'cookie'` for real. It also does not seed
 * `sf_platform_token` — under the current cookie contract nothing reads that key any more (see
 * `tenant-upgrade.mocked.spec.js`'s own `seedPlatformToken` doc comment), so a spec asserting the
 * cookie path should prove it works with NO legacy key present at all, not just tolerate one.
 *
 * Bearer mode is still a supported mode of the SPA — `credentialMode` defaults to `auto` and
 * `setSessionCredentials` resolves to `bearer` whenever the session answers with no `csrfToken`
 * (see `sessionCredentials.js`'s own `resolveMode`) — so `tenant-upgrade.mocked.spec.js` stays a
 * legitimate, separate mode to cover, not a spec to delete or merge into this one.
 */

const CURRENT_ENV = {
  clientId: 'e2e-mock-client', // matches declareCookieSession()'s `environment.clientId`
  clientName: 'Acme Trial',
  adminUserId: 'user-1',
  adminUserName: 'admin',
  plan: 'free',
};

/**
 * The Subscription Plan Catalog (ETP-5046), shaped exactly like `GET /sws/go/plans` answers — note
 * there is no provider price id; the server never sends one. The upgrade page keeps its submit
 * DISABLED until this catalog has loaded with at least one plan (`canCheckout` in UpgradePage.jsx),
 * and the generic `**\/sws/**` stub from `login()` carries no catalog, so every checkout test here
 * needs this route. A single plan is auto-selected, which is the v1 catalog.
 */
const PRODUCTIVE_PLAN = {
  planKey: 'productive-monthly',
  name: 'Productive',
  description: 'A second tenant for real work',
  displayPrice: '49.00',
  currency: 'EUR',
  billingInterval: 'month',
};

async function installPlansMock(page, plans = [PRODUCTIVE_PLAN]) {
  await page.route('**/sws/go/plans', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plans }),
    });
  });
}

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
 * Mocks `POST /sws/go/billing/purchases` and records the request headers alongside the body,
 * so a test can assert the CSRF/Authorization contract directly instead of inferring it.
 */
async function installPurchaseMock(page, { status = 201 } = {}) {
  const requests = [];
  const requestId = 'purchase-request-1';

  await page.route('**/sws/go/billing/purchases', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests.push({
      body: JSON.parse(route.request().postData() || '{}'),
      headers: route.request().headers(),
    });
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
        checkoutUrl: new URL('/__mock-checkout__', route.request().url()).toString(),
      }),
    });
  });

  // `window.location.assign(session.checkoutUrl)` is a real top-level navigation, not a fetch —
  // the target must itself be routable for the test to observe where the browser landed (same
  // pattern as subscription-lifecycle.mocked.spec.js's Stripe portal stub).
  await page.route('**/__mock-checkout__**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>Mock Stripe Checkout</body></html>',
    });
  });

  return requests;
}

async function gotoUpgrade(page) {
  await page.goto('/upgrade');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/** Plan -> Addons -> Payment, filling the tenant name at the end (see UpgradePage.jsx). */
async function reachPaymentStep(page, tenantName) {
  await page.getByTestId('upgrade-plan-select').click();
  await page.getByTestId('upgrade-addons-continue').click();
  await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
  if (tenantName !== undefined) {
    await page.getByTestId('upgrade-tenant-name-input').fill(tenantName);
  }
}

test.describe('Tenant upgrade — cookie session scheme', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await declareCookieSession(page);
    await installPlansMock(page);
  });

  test('no legacy platform token exists before or after the checkout', async ({ page }) => {
    await installEnvironmentsMock(page, [CURRENT_ENV]);
    await installPurchaseMock(page);
    await gotoUpgrade(page);

    const legacyBefore = await page.evaluate(() => localStorage.getItem('sf_platform_token'));
    expect(legacyBefore).toBeNull();

    await reachPaymentStep(page);
    // The prefilled demo name remains valid for the legacy tenant conversion flow.
    await page.getByTestId('upgrade-submit').click();
    await expect(page).toHaveURL(/__mock-checkout__/, { timeout: 10_000 });

    const legacyAfter = await page.evaluate(() => localStorage.getItem('sf_platform_token'));
    expect(legacyAfter).toBeNull();
  });

  test('the tenant-name field is prefilled from the current environment', async ({ page }) => {
    await installEnvironmentsMock(page, [CURRENT_ENV]);
    await installPurchaseMock(page);
    await gotoUpgrade(page);

    await reachPaymentStep(page);
    await expect(page.getByTestId('upgrade-tenant-name-input')).toHaveValue(CURRENT_ENV.clientName);
  });

  test('submitting sends the purchase with X-Go-CSRF and no Authorization, then follows checkoutUrl', async ({ page }) => {
    await installEnvironmentsMock(page, [CURRENT_ENV]);
    const requests = await installPurchaseMock(page);
    await gotoUpgrade(page);

    await reachPaymentStep(page, 'Acme Productive');
    await page.getByTestId('upgrade-submit').click();

    await expect(page).toHaveURL(/__mock-checkout__/, { timeout: 10_000 });

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      // The auto-selected catalog key — a plan, never a price (ETP-5046).
      planKey: PRODUCTIVE_PLAN.planKey,
      clientName: 'Acme Productive',
      dataTransfer: { products: true, contacts: true },
    });
    expect(JSON.stringify(requests[0].body)).not.toMatch(/priceId/i);
    // The whole point of the cookie scheme: the write proof travels in X-Go-CSRF, and there is
    // no bearer token to put in Authorization at all (sessionCredentials.js's `authHeaders()`).
    expect(requests[0].headers['x-go-csrf']).toBe('e2e-cookie-csrf-token');
    expect(requests[0].headers.authorization).toBeUndefined();
  });

  test('the addon choice reaches the purchase even when both checkboxes are cleared', async ({ page }) => {
    await installEnvironmentsMock(page, [CURRENT_ENV]);
    const requests = await installPurchaseMock(page);
    await gotoUpgrade(page);

    await page.getByTestId('upgrade-plan-select').click();
    await page.getByTestId('upgrade-data-transfer-products').uncheck();
    await page.getByTestId('upgrade-data-transfer-contacts').uncheck();
    await page.getByTestId('upgrade-addons-continue').click();
    await page.getByTestId('upgrade-tenant-name-input').fill('Acme Productive');
    await page.getByTestId('upgrade-submit').click();

    await expect(page).toHaveURL(/__mock-checkout__/, { timeout: 10_000 });
    expect(requests).toHaveLength(1);
    expect(requests[0].body.dataTransfer).toEqual({ products: false, contacts: false });
    expect(requests[0].body.planKey).toBe(PRODUCTIVE_PLAN.planKey);
  });

  test('a name matching the account\'s own productive environment is rejected before paying', async ({ page }) => {
    const productiveEnv = { ...CURRENT_ENV, plan: 'productive' };
    await installEnvironmentsMock(page, [productiveEnv]);
    const requests = await installPurchaseMock(page);
    await gotoUpgrade(page);

    // When the current environment is already productive the name is deliberately NOT prefilled
    // (ETP-5463, UpgradePage.jsx `currentIsProductive`): a new productive tenant needs a new name.
    await reachPaymentStep(page);
    await expect(page.getByTestId('upgrade-tenant-name-input')).toHaveValue('');
    // Typing the account's own productive environment's name must be rejected client-side,
    // before any request goes out.
    await page.getByTestId('upgrade-tenant-name-input').fill(productiveEnv.clientName);
    await page.getByTestId('upgrade-submit').click();

    await expect(page.getByTestId('upgrade-tenant-name-taken')).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test('a changed tenant name is carried in the purchase request', async ({ page }) => {
    const productiveEnv = { ...CURRENT_ENV, plan: 'productive' };
    await installEnvironmentsMock(page, [productiveEnv]);
    const requests = await installPurchaseMock(page);
    await gotoUpgrade(page);

    await reachPaymentStep(page, 'Brand New Co');
    await page.getByTestId('upgrade-submit').click();

    await expect(page).toHaveURL(/__mock-checkout__/, { timeout: 10_000 });
    expect(requests).toHaveLength(1);
    expect(requests[0].body.clientName).toBe('Brand New Co');
    expect(requests[0].body.planKey).toBe(PRODUCTIVE_PLAN.planKey);
  });
});
