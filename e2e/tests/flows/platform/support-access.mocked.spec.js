// @covers tools/app-shell/src/pages/SupportAccessPage.jsx
// @covers tools/app-shell/src/lib/supportSession.js
// @covers tools/app-shell/src/hooks/useSupportSession.js
// @covers tools/app-shell/src/hooks/useSupportSessionSync.js
// @covers tools/app-shell/src/components/layout/SupportSessionBanner.jsx
// @covers tools/app-shell/src/layout/AppLayout.jsx
// @covers tools/app-shell/src/components/UserAvatarButton.jsx
// @covers tools/app-shell/src/runtime-routes.jsx
import { test, expect } from '@playwright/test';
import { login, MOCK_ORG_ID } from '../../helpers/auth.js';

/**
 * Support access (ETP-5351, mocked).
 *
 * Classic's "Acceder como soporte" opens `<app>/support-access#t=<ticket>`. The page takes the
 * ticket out of the address bar, redeems it (POST /sws/go/session/support-handoff) and enters the
 * app; `GET /sws/go/me` then reports `supportSession`, which turns on the support-mode chrome: a
 * fixed banner (company, expiry, Salir) and the removal of everything that is the customer's —
 * help chat, billing/upgrade, "Mis empresas", account — while Copilot stays.
 *
 * One in-memory "server" per test models the only state that matters: whether the handoff has
 * opened a session. GET /sws/go/session answers 401 until then (the visitor arrives with no
 * session), 200 afterwards, and DELETE ends it. Routes are registered after login(), so they win
 * over its generic `/sws/**` catch-all (Playwright matches in reverse registration order).
 *
 * Locale-independent on purpose: texts are only checked through data-testid, the company name
 * (data) and an HH:MM pattern.
 */

const TICKET = 'abc';
const COMPANY = 'Acme Soporte SA';
const CLIENT_ID = 'e2e-support-client';
const TICKET_ERROR_CODES = ['support_ticket_invalid', 'support_ticket_expired', 'support_ticket_used'];

const json = (route, status, body) => route.fulfill({
  status,
  contentType: 'application/json',
  body: body === undefined ? '' : JSON.stringify(body),
});

function createServer({ handoff = { status: 200 } } = {}) {
  return {
    handoff,
    handoffBodies: [],
    redeemed: false,
    revoked: false,
    revokes: 0,
    // The pass is valid for one hour from now; the banner shows it as a local HH:MM.
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

function sessionPayload() {
  return {
    account: { id: 'e2e-support-account', name: 'Soporte Etendo', email: 'soporte@e2e.test' },
    environment: { clientId: CLIENT_ID, roleId: 'e2e-mock-role', orgId: MOCK_ORG_ID },
    roleList: [{
      id: 'e2e-mock-role',
      name: 'Administrator',
      orgList: [{ id: MOCK_ORG_ID, name: 'E2E Org' }],
    }],
    csrfToken: 'e2e-support-csrf',
  };
}

const sessionIsOpen = (server) => server.redeemed && !server.revoked;

/** Routes session, handoff and /me to the per-test server. Call after login(). */
async function installSupportServer(page, server) {
  await page.route('**/sws/go/session', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return sessionIsOpen(server)
        ? json(route, 200, sessionPayload())
        : json(route, 401, { error: { message: 'Invalid or expired session', status: 401 } });
    }
    if (method === 'DELETE') {
      server.revokes += 1;
      server.revoked = true;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });

  await page.route('**/sws/go/session/support-handoff', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    server.handoffBodies.push(route.request().postDataJSON());
    if (server.handoff.status === 200) {
      server.redeemed = true;
      return json(route, 200, { status: 'success', ...sessionPayload() });
    }
    return json(route, server.handoff.status, { error: server.handoff.code });
  });

  await page.route('**/sws/go/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (!sessionIsOpen(server)) return json(route, 401, { error: { message: 'Unauthorized', status: 401 } });
    return json(route, 200, {
      supportSession: { clientId: CLIENT_ID, clientName: COMPANY, expiresAt: server.expiresAt },
    });
  });
}

/** login() lands on the dashboard with the generic mocks; the support server then takes over. */
async function openSupportAccess(page, server, hash = `#t=${TICKET}`) {
  await login(page);
  await installSupportServer(page, server);
  await page.goto(`/support-access${hash}`);
}

/** Enters the app already redeemed, so the next load is a support session on the dashboard. */
async function enterSupportMode(page, server) {
  await openSupportAccess(page, server);
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
  await expect(page.getByTestId('support-mode-banner')).toBeVisible({ timeout: 10_000 });
}

/** The user menu trigger renders twice (compact topbar and sidebar footer): take the visible one. */
async function openUserMenu(page) {
  await page.locator('[data-testid="topbar-user-menu"]:visible').first().click();
}

const supportChatLauncher = (page) => page.locator('.sc-fab, .sc-overlay');
const copilotButton = (page) => page.locator('button.copilot-btn:visible');

test.describe('Support access (ETP-5351)', () => {
  test('a valid pass is redeemed, the fragment is dropped and the app opens in support mode',
    async ({ page }) => {
      const server = createServer();
      await openSupportAccess(page, server);

      await page.waitForURL('**/dashboard', { timeout: 10_000 });
      // Exactly one redemption, carrying the ticket from the fragment and nothing else.
      expect(server.handoffBodies).toEqual([{ ticket: TICKET }]);
      expect(page.url()).not.toContain('#');
      expect(page.url()).not.toContain(`t=${TICKET}`);

      const banner = page.getByTestId('support-mode-banner');
      await expect(banner).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('support-mode-banner-message')).toContainText(COMPANY);
      // "Vence a las HH:MM" — only the time shape is asserted, not the locale's wording.
      await expect(page.getByTestId('support-mode-banner-expiry')).toContainText(/\d{1,2}[:.]\d{2}/);
      await expect(page.getByTestId('support-mode-exit')).toBeVisible();
    });

  test.describe('refused pass', () => {
    for (const code of TICKET_ERROR_CODES) {
      test(`${code} shows the access-unavailable error and does not enter`, async ({ page }) => {
        const server = createServer({ handoff: { status: 401, code } });
        await openSupportAccess(page, server);

        await expect(page.getByTestId('support-access-error')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('support-access-error-title')).toBeVisible();
        await expect(page.getByTestId('support-access-error-message')).toBeVisible();

        expect(server.handoffBodies).toEqual([{ ticket: TICKET }]);
        // The ticket is gone from the address bar even though it failed, and we stayed put.
        expect(page.url()).toContain('/support-access');
        expect(page.url()).not.toContain('#');
        expect(server.redeemed).toBe(false);
        await expect(page.getByTestId('support-mode-banner')).toHaveCount(0);
        await expect(page.getByTestId('support-access-redeeming')).toHaveCount(0);
      });
    }
  });

  test('support mode hides help chat, billing and "Mis empresas", redirects /companies, keeps Copilot',
    async ({ page }) => {
      const server = createServer();
      await enterSupportMode(page, server);

      // Help chat (SupportChat): neither the floating button nor its panel is mounted.
      await expect(supportChatLauncher(page)).toHaveCount(0);

      // Customer's billing and account entries are gone from the user menu; "Mis empresas" too
      // (it is additionally behind a feature flag, so its absence here is the weaker half —
      // the /companies redirect below is the real guard).
      await openUserMenu(page);
      await expect(page.getByTestId('user-menu-logout')).toBeVisible();
      await expect(page.getByTestId('menu-tenant-upgrade')).toHaveCount(0);
      await expect(page.getByTestId('menu-my-companies')).toHaveCount(0);
      await expect(page.getByTestId('menu-account')).toHaveCount(0);
      await page.keyboard.press('Escape');

      // No billing banner / upgrade CTA anywhere on the home screen.
      await expect(page.getByTestId('topbar-demo-trial-indicator')).toHaveCount(0);

      // Copilot (AI) stays available by product decision.
      await expect(copilotButton(page).first()).toBeVisible();

      // Typed URLs of the restricted routes land back on the home screen.
      for (const route of ['/companies', '/upgrade', '/account']) {
        await page.goto(route);
        await page.waitForURL('**/dashboard', { timeout: 10_000 });
        await expect(page.getByTestId('support-mode-banner')).toBeVisible({ timeout: 10_000 });
      }
    });

  test('control: outside support mode the help chat and the upgrade entry are present',
    async ({ page }) => {
      // Guards the hiding assertions above against passing because the elements never render.
      await login(page);
      await expect(page.getByTestId('support-mode-banner')).toHaveCount(0);
      await expect(supportChatLauncher(page).first()).toBeVisible({ timeout: 10_000 });
      await openUserMenu(page);
      await expect(page.getByTestId('menu-tenant-upgrade')).toBeVisible();
      await expect(page.getByTestId('menu-account')).toBeVisible();
    });

  test('Salir ends the session and leaves support mode', async ({ page }) => {
    const server = createServer();
    await enterSupportMode(page, server);

    await page.getByTestId('support-mode-exit').first().click();

    // Ordinary logout: the server revokes the session, then the login page is reached.
    await expect(page.locator('#login-email')).toBeVisible({ timeout: 10_000 });
    expect(server.revokes).toBeGreaterThanOrEqual(1);
    expect(server.revoked).toBe(true);
    await expect(page.getByTestId('support-mode-banner')).toHaveCount(0);
    // The persisted marker must not start the next load of this browser in support mode.
    expect(await page.evaluate(() => localStorage.getItem('sf_support_session'))).toBeNull();
  });

  test('reloading after the redemption does not send the pass again', async ({ page }) => {
    const server = createServer();
    await enterSupportMode(page, server);
    expect(server.handoffBodies).toHaveLength(1);

    await page.reload();
    await expect(page.getByTestId('support-mode-banner')).toBeVisible({ timeout: 10_000 });
    expect(server.handoffBodies).toHaveLength(1);

    // Going back to the handoff route without a fragment (history, bookmark) is a refusal that
    // never reaches the backend: the ticket was single-use and the URL no longer holds it.
    await page.goto('/support-access');
    await expect(page.getByTestId('support-access-error')).toBeVisible({ timeout: 10_000 });
    expect(server.handoffBodies).toHaveLength(1);
  });
});
