import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * `/account` with an expired session (ETP-5455, test plan M-04).
 *
 * A 401 on the page used to be drawn as a load failure: "your sign-in methods could not be loaded"
 * with a Retry that can never succeed, and "we couldn't load your subscription". Nothing was down —
 * the session was — and the one action that helps, signing in again, was offered nowhere.
 *
 * The case that matters most in practice is billing's: it accepts only a platform credential
 * (ETP-5455 decision 1), so a legacy bearer session reads `/me` and is refused by billing. That is
 * why this spec runs on `login()`'s default, which is the bearer scheme.
 *
 * Every route here is installed on top of the generic `/sws/**` stub `login()` seeds; Playwright
 * tries routes in reverse registration order, so these win.
 */

const AUTH_METHODS = { password: { enabled: true }, identities: [], removable: [] };

function unauthorized() {
  return {
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
  };
}

async function mockAccount(page, answer) {
  await page.route('**/sws/go/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(answer);
  });
}

async function mockSubscription(page, answer) {
  await page.route('**/sws/go/billing/subscription', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill(answer);
  });
}

const accountOk = {
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ authMethods: AUTH_METHODS }),
};

async function gotoAccount(page) {
  await page.goto('/account');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('/account — expired session (ETP-5455)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('a 401 on the account read shows ONE session-expired state, with no error toast or Retry',
    async ({ page }) => {
      await mockAccount(page, unauthorized());
      await mockSubscription(page, unauthorized());
      await gotoAccount(page);

      await expect(page.getByTestId('account-settings-session-expired')).toHaveCount(1);
      await expect(page.getByTestId('account-settings-session-expired')).toBeVisible();
      await expect(page.getByTestId('account-settings-sign-in-again')).toBeVisible();
      await expect(page.getByTestId('account-settings-load-error')).toHaveCount(0);
      await expect(page.getByTestId('account-settings-retry')).toHaveCount(0);
      await expect(page.getByTestId('SubscriptionSection__unavailable')).toHaveCount(0);
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
      // Never signed out automatically: the user reads why first.
      await expect(page).toHaveURL(/\/account/);
    });

  test('billing refusing a session /me accepts shows the same state', async ({ page }) => {
    await mockAccount(page, accountOk);
    await mockSubscription(page, unauthorized());
    await gotoAccount(page);

    await expect(page.getByTestId('account-settings-session-expired')).toBeVisible();
    await expect(page.getByTestId('SubscriptionSection__unavailable')).toHaveCount(0);
    await expect(page.getByTestId('account-security-section')).toHaveCount(0);
  });

  test('a server failure keeps the generic error and Retry, not the session-expired state',
    async ({ page }) => {
      await mockAccount(page, {
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      });
      await mockSubscription(page, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hasSubscription: false }),
      });
      await gotoAccount(page);

      await expect(page.getByTestId('account-settings-load-error')).toBeVisible();
      await expect(page.getByTestId('account-settings-retry')).toBeVisible();
      await expect(page.getByTestId('account-settings-session-expired')).toHaveCount(0);
      // ETP-5443 REVIEW N5: an outage of one section never hides the other.
      await expect(page.getByTestId('SubscriptionSection__none')).toBeVisible();
    });

  test('Sign in again takes the user to the login view', async ({ page }) => {
    await mockAccount(page, unauthorized());
    await mockSubscription(page, unauthorized());
    await gotoAccount(page);
    await expect(page.getByTestId('account-settings-sign-in-again')).toBeVisible();

    // The session is dead server-side, which is what a 401 means: once the shell asks again, it
    // must be told nobody is signed in, or it would restore the session and bounce back.
    await page.route('**/sws/go/session', (route) => route.fulfill(unauthorized()));
    await page.getByTestId('account-settings-sign-in-again').click();

    await expect(page.locator('#login-email')).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/account/);
  });
});
