import { test, expect } from '@playwright/test';
import { login, declareCookieSession } from '../helpers/auth.js';

/**
 * Account settings writes under the COOKIE session scheme (ETP-5455, test plan M-03).
 *
 * Both writes on `/account` used to be broken under the cookie session, each in its own way, while
 * the GET that draws the page kept working (the browser attaches the `__Host-` cookie by itself and
 * reads need no proof of intent):
 *
 *  - change password handed `localStorage['sf_platform_token']` to the core client as its CSRF
 *    argument. Nothing writes that key since ADR-0001, so the POST went out with no `X-Go-CSRF` and
 *    the backend refused it with 403.
 *  - removing a sign-in method was authenticated bearer-only on the backend, so the cookie session
 *    got a 401 (fixed server-side in the same ticket; this spec pins the client half).
 *
 * `declareCookieSession()` makes `GET /sws/go/session` answer with a `csrfToken`, so the SPA runs in
 * `mode: 'cookie'` for real. No legacy key is seeded: the spec proves the writes work with none
 * present, not merely that they tolerate one.
 */

const SESSION_CSRF = 'e2e-cookie-csrf-token'; // declareCookieSession()'s default

const AUTH_METHODS = {
  password: { enabled: true },
  identities: [{ provider: 'google', email: 'admin@e2e.test' }],
  removable: ['password', 'google'],
};

const LEGACY_KEYS = ['sf_auth_token', 'sf_platform_token', 'sf_auth_user', 'sf_auth_client_id'];

async function installAccountMocks(page) {
  await page.route('**/sws/go/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authMethods: AUTH_METHODS }),
    });
  });
  await page.route('**/sws/go/billing/subscription', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasSubscription: false }),
    });
  });
}

/** Records every request to `urlGlob` (method + headers + body) and answers it with `body`. */
async function recordWrites(page, urlGlob, body) {
  const requests = [];
  await page.route(urlGlob, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    requests.push({ headers: request.headers(), body: request.postDataJSON() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

async function readLegacyKeys(page) {
  return page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)), LEGACY_KEYS);
}

async function gotoAccount(page) {
  await page.goto('/account');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('account-security-section')).toBeVisible({ timeout: 10_000 });
}

test.describe('Account settings — cookie session scheme (ETP-5455)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await declareCookieSession(page);
    await installAccountMocks(page);
  });

  test('changing the password sends the session CSRF proof and no Authorization', async ({ page }) => {
    const requests = await recordWrites(page, '**/sws/go/change-password', { status: 'ok' });
    await gotoAccount(page);
    expect(await readLegacyKeys(page)).toEqual(LEGACY_KEYS.map(() => null));

    await page.getByTestId('auth-method-change-password').click();
    await expect(page.getByTestId('change-password-dialog')).toBeVisible();
    await page.locator('#change-current-password').fill('Current-Pass-1');
    await page.locator('#change-new-password').fill('New-Pass-12345');
    await page.locator('#change-confirm-password').fill('New-Pass-12345');
    await page.getByTestId('change-password-submit').click();

    await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);
    expect(requests[0].headers['x-go-csrf']).toBe(SESSION_CSRF);
    expect(requests[0].headers.authorization).toBeUndefined();
    expect(requests[0].body).toMatchObject({
      currentPassword: 'Current-Pass-1',
      newPassword: 'New-Pass-12345',
    });
  });

  test('removing a sign-in method sends the session CSRF proof and no Authorization', async ({ page }) => {
    const requests = await recordWrites(page, '**/sws/go/auth-methods/remove', {
      authMethods: { password: { enabled: true }, identities: [], removable: [] },
    });
    await gotoAccount(page);

    await page.getByTestId('auth-method-remove-google').click();
    await expect(page.getByTestId('auth-method-remove-confirm')).toBeVisible();
    await page.getByTestId('auth-method-remove-confirm-yes').click();

    await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);
    expect(requests[0].headers['x-go-csrf']).toBe(SESSION_CSRF);
    expect(requests[0].headers.authorization).toBeUndefined();
    expect(requests[0].body).toEqual({ method: 'google' });
    // The screen redraws from the methods the server returned, and nothing was logged out.
    await expect(page.getByTestId('auth-method-row-google')).toHaveCount(0);
    await expect(page).toHaveURL(/\/account/);
    expect(await readLegacyKeys(page)).toEqual(LEGACY_KEYS.map(() => null));
  });
});
