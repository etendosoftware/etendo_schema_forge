import { test, expect } from '@playwright/test';
import { login, declareNoSession } from '../../helpers/auth.js';

/**
 * 401 from NEO with the session alive — `AccessLoadErrorScreen` (ETP-5489).
 *
 * A 401 from a NEO request used to be read as "the session is gone": the shell went anonymous
 * WITHOUT revoking the cookie, `/onboarding` found the live session, entered it
 * (`POST /session/environment`) and reloaded into `/dashboard`, which 401'd again — a loop.
 * The core's `apiFetch` now asks `GET /sws/go/session` before logging out:
 *   (a) session 200 + NEO 401  → no logout; AppLayout shows the error screen (retry / log out).
 *   (b) session 401            → a real expiry; exactly one redirect to the login.
 *
 * `login()` stubs `GET /sws/go/session` with a 200 and aborts `/sws/neo/listmenu` (the fail-open
 * fallback most suites rely on). Routes are matched in reverse registration order, so the ones
 * registered here, after login(), win — and a reload is needed for the boot requests to see them.
 */

async function answerListMenu401(page) {
  await page.route('**/sws/neo/listmenu{/**,}**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Invalid or expired token', status: 401 } }),
    });
  });
}

/** Records what the page does after the reload: SPA and full navigations, and the re-entry POST. */
function watchNavigation(page) {
  const seen = { urls: [], environmentPosts: 0, listMenuCalls: 0 };
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.urls.push(frame.url());
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/sws/go/session/environment')) {
      seen.environmentPosts += 1;
    }
    if (request.url().includes('/sws/neo/listmenu')) seen.listMenuCalls += 1;
  });
  return seen;
}

test.describe('NEO 401 with the session alive — AccessLoadErrorScreen', () => {
  test('(a) session 200 + NEO 401 shows the error screen without leaving for /onboarding', async ({ page }) => {
    await login(page);
    await answerListMenu401(page);
    const seen = watchNavigation(page);

    await page.reload();

    await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('access-load-error-title')).toBeVisible();
    await expect(page.getByTestId('AccessLoadErrorRetry__488148')).toBeVisible();
    await expect(page.getByTestId('AccessLoadErrorLogout__488148')).toBeVisible();

    // Give a loop the time it needs to show itself, then check it did not happen.
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toBeVisible();
    expect(page.url()).not.toContain('/onboarding');
    expect(seen.urls.filter((url) => url.includes('/onboarding'))).toHaveLength(0);
    expect(seen.environmentPosts).toBe(0);
  });

  test('(a) Retry asks for the access again instead of staying stuck', async ({ page }) => {
    await login(page);
    await answerListMenu401(page);
    await page.reload();
    await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toBeVisible({ timeout: 10_000 });

    const seen = watchNavigation(page);
    await page.getByTestId('AccessLoadErrorRetry__488148').click();

    await expect.poll(() => seen.listMenuCalls, { timeout: 10_000 }).toBeGreaterThan(0);
    // Still refused, so the screen is back — not a blank layout and not the login.
    await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toBeVisible({ timeout: 10_000 });
    expect(page.url()).not.toContain('/onboarding');
  });

  test('(b) session 401 is a real expiry: it ends on the login and never re-enters, no error screen', async ({ page }) => {
    await login(page);
    await answerListMenu401(page);
    await declareNoSession(page);
    const seen = watchNavigation(page);

    await page.reload();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
    await page.waitForTimeout(2_000);
    expect(page.url()).toContain('/onboarding');
    // The loop's signature is the login view being left again for /dashboard. Not a count of
    // /onboarding navigations: an SPA step change (/onboarding -> /onboarding/<step>) fires
    // `framenavigated` too and would make that flaky.
    const firstLogin = seen.urls.findIndex((url) => url.includes('/onboarding'));
    expect(firstLogin).toBeGreaterThanOrEqual(0);
    expect(seen.urls.slice(firstLogin + 1).filter((url) => url.includes('/dashboard'))).toHaveLength(0);
    await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toHaveCount(0);
    expect(seen.environmentPosts).toBe(0);
  });
});
