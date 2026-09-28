import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Environment commercial access block — `BlockedAccessScreen` (ETP-5443 follow-up).
 *
 * `NeoAuthenticator.enforceEnvironmentAccess` (com.etendoerp.go) answers every NEO request
 * with HTTP 402 `{ error: { message: "Environment access is not available: <DECISION>" } }`
 * once an environment's commercial access is cut off (demo trial expired / subscription
 * payment grace elapsed). `lib/environmentAccessGate.js` detects this from the
 * `/sws/neo/windowaccessmap` call `fetchWindowAccess()` (App.jsx) makes on every session
 * bootstrap, and `AppLayoutAccessGate` (layout/AppLayout.jsx) renders `BlockedAccessScreen`
 * instead of the normal sidebar/Outlet whenever a BLOCKING decision (`DEMO_TRIAL_EXPIRED` or
 * `SUBSCRIPTION_REQUIRED`) is recorded — except on `/account` and `/upgrade`, which stay
 * reachable because both resolve through the account's own platform token, independent of
 * the blocked tenant session, and are literally where the screen's own CTA sends the user.
 *
 * `login()`'s mocked-mode `window.fetch` monkey-patch (see auth.js) always answers
 * `/sws/neo/windowaccessmap` with full access via a Proxy, so simulating the 402 here needs a
 * SECOND `window.fetch` override registered (via `page.addInitScript`) AFTER `login()`'s own —
 * init scripts run in registration order at each navigation, so the later one wraps the
 * earlier one and can short-circuit the one URL it cares about before delegating everything
 * else down the chain. `addInitScript` only affects FUTURE navigations, so a `page.reload()`
 * is required for it to take effect (see `installEnvironmentAccessBlock` below).
 */

async function installEnvironmentAccessBlock(page, decision) {
  await page.addInitScript((injectedDecision) => {
    const previousFetch = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && url.includes('/sws/neo/windowaccessmap')) {
        return Promise.resolve({
          ok: false,
          status: 402,
          json: () => Promise.resolve({
            error: { message: `Environment access is not available: ${injectedDecision}` },
          }),
        });
      }
      return previousFetch(input, init);
    };
  }, decision);
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function installAccountMock(page) {
  await page.route('**/sws/go/me{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authMethods: { password: { enabled: true }, identities: [], removable: [] } }),
    });
  });
  await page.route('**/sws/go/billing/subscription', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasSubscription: false }),
    });
  });
}

test.describe('Environment access block — BlockedAccessScreen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('SUBSCRIPTION_REQUIRED shows the blocked screen with a CTA to /account, and /account still renders', async ({ page }) => {
    await installAccountMock(page);
    await installEnvironmentAccessBlock(page, 'SUBSCRIPTION_REQUIRED');

    const screen = page.getByTestId('BlockedAccessScreen__488148');
    await expect(screen).toBeVisible();
    await expect(page.getByTestId('blocked-access-title')).toBeVisible();
    await expect(page.getByTestId('blocked-access-message')).toBeVisible();

    await page.getByTestId('blocked-access-cta').click();
    await expect(page).toHaveURL(/\/account$/);

    // /account is exempt from the gate — the block must not follow the user there.
    await expect(page.getByTestId('BlockedAccessScreen__488148')).toHaveCount(0);
    await expect(page.getByTestId('account-settings-page')).toBeVisible({ timeout: 10_000 });
  });

  test('DEMO_TRIAL_EXPIRED shows the blocked screen with a CTA to /upgrade, and /upgrade still renders', async ({ page }) => {
    await installEnvironmentAccessBlock(page, 'DEMO_TRIAL_EXPIRED');

    const screen = page.getByTestId('BlockedAccessScreen__488148');
    await expect(screen).toBeVisible();

    await page.getByTestId('blocked-access-cta').click();
    await expect(page).toHaveURL(/\/upgrade$/);

    // /upgrade is exempt from the gate — the block must not follow the user there.
    await expect(page.getByTestId('BlockedAccessScreen__488148')).toHaveCount(0);
    await expect(page.getByTestId('upgrade-page-shell')).toBeVisible({ timeout: 10_000 });
  });
});
