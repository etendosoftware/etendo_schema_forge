// @covers tools/app-shell/src/layout/AppLayout.jsx
// @covers tools/app-shell/src/App.jsx
import { test, expect } from '../../helpers/test.js';
import { login, declareNoSession } from '../../helpers/auth.js';

/**
 * 401 from NEO with the session alive — `AccessLoadErrorScreen` (ETP-5489).
 *
 * A 401 from a NEO request used to be read as "the session is gone": the shell went anonymous
 * WITHOUT revoking the cookie, `/onboarding` found the live session, entered it
 * (`POST /session/environment`) and reloaded into `/dashboard`, which 401'd again — a loop.
 * The core's `apiFetch` now asks `GET /sws/go/session` before logging out:
 *   (a) session 200 + NEO 401  → no logout; AppLayout shows the error screen (retry / log out).
 *   (b) session 401 at restore → login without re-entry.
 *   (c) restore 200, parallel NEO 401, then probe 401 → one transition to login.
 *
 * `login()` stubs `GET /sws/go/session` with a 200 and aborts `/sws/neo/listmenu` (the fail-open
 * fallback most suites rely on). Routes are matched in reverse registration order, so the ones
 * registered here, after login(), win — and a reload is needed for the boot requests to see them.
 */

async function answerListMenu401(page) {
  const handler = async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Invalid or expired token', status: 401 } }),
    });
  };
  await page.route('**/sws/neo/listmenu/**', handler);
  await page.route('**/sws/neo/listmenu**', handler);
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

  test('(c) parallel NEO 401 after restore 200 confirms expiry with a probe and redirects once', async ({ page }) => {
    await login(page, { awaitFirstStepsRead: true });
    const seen = watchNavigation(page);
    const journal = [];
    const neoResponses = [];
    const probes = [];
    let expired = false;
    let releaseNeo;
    let releaseProbe;
    const bothNeoArrived = new Promise((resolve) => { releaseNeo = resolve; });
    const probeMayAnswer = new Promise((resolve) => { releaseProbe = resolve; });
    const endpoints = new Set(['/sws/neo/listmenu', '/sws/neo/currency-format']);
    const arrived = new Set();

    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.endsWith('/sws/go/session') && response.status() === 200) journal.push('restore-200');
      if (endpoints.has(path) && response.status() === 401) neoResponses.push(path);
    });
    // These requests use real network fetches. In particular, do NOT choose windowaccessmap
    // or myreportaccess: login() serves those in-page, before page.route() can intercept them.
    const refuseNeo = async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const path = new URL(route.request().url()).pathname;
      journal.push(`neo-request:${path}`);
      arrived.add(path);
      // Both calls must be in flight BEFORE either gets a response. No timer-based race.
      if (arrived.size === endpoints.size) releaseNeo();
      await bothNeoArrived;
      expired = true;
      journal.push(`neo-401:${path}`);
      await route.fulfill({
        status: 401, contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Invalid or expired token', status: 401 } }),
      });
    };
    for (const path of endpoints) await page.route(`**${path}**`, refuseNeo);
    await page.route('**/sws/go/session', async (route) => {
      if (route.request().method() !== 'GET' || !expired) return route.fallback();
      // The initial restore still gets login()'s 200. Only a request AFTER the NEO 401
      // can reach this branch; retaining it lets both refusals join the in-flight probe.
      journal.push('probe-request');
      probes.push({ neoRefusals: journal.filter((event) => event.startsWith('neo-401:')).length });
      await probeMayAnswer;
      await route.fulfill({
        status: 401, contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Invalid or expired token', status: 401 } }),
      });
    });
    // Record even a transient error-screen mount, rather than only inspecting the final DOM.
    await page.addInitScript(() => {
      window.__accessLoadErrorShown = false;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="AccessLoadErrorScreen__488148"]')) {
          window.__accessLoadErrorShown = true;
        }
      }).observe(document, { childList: true, subtree: true });
    });

    let previousPath = new URL(page.url()).pathname;
    let loginTransitions = 0;
    const isLogin = (path) => path === '/onboarding' || path.startsWith('/onboarding/');
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const path = new URL(frame.url()).pathname;
      // Onboarding step changes remain inside the same login flow, so count its onset.
      if (isLogin(path) && !isLogin(previousPath)) loginTransitions += 1;
      previousPath = path;
    });

    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(() => neoResponses.length, { timeout: 10_000 }).toBe(2);
      await expect.poll(() => probes.length, { timeout: 10_000 }).toBe(1);
      expect(journal.indexOf('restore-200')).toBeGreaterThanOrEqual(0);
      expect(journal.indexOf('restore-200')).toBeLessThan(journal.findIndex((event) => event.startsWith('neo-request:')));
      expect(probes[0].neoRefusals).toBe(2);
      expect(loginTransitions).toBe(0);
      await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toHaveCount(0);
    } finally {
      // Release held routes even if a precondition assertion fails.
      releaseNeo();
      releaseProbe();
    }

    await expect(page).toHaveURL(/\/onboarding(?:\/|$)/, { timeout: 10_000 });
    await expect(page.locator('#login-email')).toBeVisible();
    await page.waitForTimeout(2_000);
    expect(loginTransitions).toBe(1);
    expect(seen.environmentPosts).toBe(0);
    const firstLogin = seen.urls.findIndex((url) => isLogin(new URL(url).pathname));
    expect(firstLogin).toBeGreaterThanOrEqual(0);
    expect(seen.urls.slice(firstLogin).every((url) => isLogin(new URL(url).pathname))).toBe(true);
    await expect(page.getByTestId('AccessLoadErrorScreen__488148')).toHaveCount(0);
    expect(await page.evaluate(() => window.__accessLoadErrorShown)).toBe(false);
  });
});
