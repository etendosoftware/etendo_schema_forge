import { test, expect } from '@playwright/test';
import { login, MOCK_ORG_ID } from '../helpers/auth.js';

/**
 * Two tabs, one browser session (ETP-5550).
 *
 * The `__Host-` session cookie belongs to the whole browser, but the CSRF proof lives in memory
 * per tab and is only loaded when the tab boots. When one tab rotates the session (entering an
 * environment, changing the password, logging in again), every other tab kept sending the proof
 * of the revoked session, and every write answered 403 "CSRF validation failed" until F5. A logout
 * from such a tab answered 403 as well and left the session alive on the server.
 *
 * Both tabs share one in-memory session "server" living in the test process, so a rotation is seen
 * by the two of them exactly as the backend would show it: GET /sws/go/session answers the live
 * proof, and any unsafe request carrying another one is refused with the backend's real message.
 * The rotation itself is applied to that server directly — which tab triggered it is not what is
 * under test; what the OTHER tab does afterwards is.
 */

const FIRST_PROOF = 'e2e-csrf-before-rotation';
const ROTATED_PROOF = 'e2e-csrf-after-rotation';
const STALE_PROOF_REFUSAL = { error: { message: 'CSRF validation failed', status: 403 } };

function createSessionServer() {
  return {
    csrf: FIRST_PROOF,
    clientId: 'e2e-mock-client',
    revoked: false,
    revokes: [],
    purchases: [],
    environmentEntries: 0,
  };
}

/** Another tab rotated the session: the old proof is revoked from now on. */
function rotate(server, { clientId = server.clientId } = {}) {
  server.csrf = ROTATED_PROOF;
  server.clientId = clientId;
}

function sessionPayload(server) {
  return {
    account: { name: 'admin', email: 'admin@e2e.test' },
    environment: { clientId: server.clientId, roleId: 'e2e-mock-role', orgId: MOCK_ORG_ID },
    roleList: [{
      id: 'e2e-mock-role',
      name: 'Administrator',
      orgList: [{ id: MOCK_ORG_ID, name: 'E2E Org' }],
    }],
    csrfToken: server.csrf,
  };
}

const json = (route, status, body) => route.fulfill({
  status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body),
});

/** Routes this tab's session and write endpoints to the shared server. */
async function installSessionServer(page, server) {
  // Registered after login(), so these win over its `**/sws/**` catch-all (Playwright is LIFO).
  await page.route('**/sws/go/session', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return server.revoked ? json(route, 401, { error: { message: 'Invalid or expired session' } })
        : json(route, 200, sessionPayload(server));
    }
    if (request.method() === 'DELETE') {
      const proof = request.headers()['x-go-csrf'];
      server.revokes.push(proof);
      if (proof !== server.csrf) return json(route, 403, STALE_PROOF_REFUSAL);
      server.revoked = true;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  await page.route('**/sws/go/session/environment', async (route) => {
    server.environmentEntries += 1;
    return json(route, 200, { status: 'success', ...sessionPayload(server) });
  });
  await page.route('**/sws/go/environments{/**,}**', (route) => json(route, 200, {
    environments: [{
      clientId: 'e2e-mock-client', clientName: 'Acme Trial', adminUserId: 'user-1',
      adminUserName: 'admin', plan: 'free',
    }],
  }));
  await page.route('**/sws/go/billing/purchases', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const proof = request.headers()['x-go-csrf'];
    server.purchases.push(proof);
    if (proof !== server.csrf) return json(route, 403, STALE_PROOF_REFUSAL);
    return json(route, 201, {
      requestId: 'purchase-request-1',
      checkoutUrl: new URL('/__mock-checkout__', request.url()).toString(),
    });
  });
  await page.route('**/__mock-checkout__**', (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Mock checkout</body></html>',
  }));
}

/** Boots a tab on the shared session: login() mocks, then a reload so the restore reads it. */
async function openTab(page, server, path = '/dashboard') {
  await login(page);
  await installSessionServer(page, server);
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/** Plan → Addons → Payment on /upgrade, ready to submit (see UpgradePage.jsx). */
async function reachPaymentStep(page) {
  await page.getByTestId('upgrade-plan-select').click();
  await page.getByTestId('upgrade-addons-continue').click();
  await expect(page.getByTestId('upgrade-checkout')).toBeVisible();
  await page.getByTestId('upgrade-tenant-name-input').fill('Acme Productive');
}

test.describe('A session rotated in another tab (ETP-5550)', () => {
  test('the stale tab re-reads the live proof and its write goes through, without F5', async ({ page, context }) => {
    const server = createSessionServer();
    const stale = page;
    await openTab(stale, server, '/upgrade');
    await reachPaymentStep(stale);
    const other = await context.newPage();
    await openTab(other, server);

    rotate(server);
    await stale.getByTestId('upgrade-submit').click();

    await expect(stale).toHaveURL(/__mock-checkout__/, { timeout: 10_000 });
    expect(server.purchases).toEqual([FIRST_PROOF, ROTATED_PROOF]);
  });

  test('the stale tab does not adopt the proof once the session moved to another company', async ({ page, context }) => {
    const server = createSessionServer();
    const stale = page;
    await openTab(stale, server, '/upgrade');
    await reachPaymentStep(stale);
    const other = await context.newPage();
    await openTab(other, server);

    rotate(server, { clientId: 'e2e-another-company' });
    await stale.getByTestId('upgrade-submit').click();

    // A record prepared for one company must not be written into the one the other tab entered.
    // The error is shown only once apiFetch has settled, so no resend can still be on its way.
    await expect(stale.getByTestId('upgrade-error')).toBeVisible({ timeout: 10_000 });
    expect(server.purchases).toEqual([FIRST_PROOF]);
    await expect(stale).toHaveURL(/\/upgrade/);
  });

  test('logging out from the stale tab revokes the session and does not enter it again', async ({ page, context }) => {
    const server = createSessionServer();
    const stale = page;
    await openTab(stale, server);
    const other = await context.newPage();
    await openTab(other, server);
    const entriesBeforeLogout = server.environmentEntries;

    rotate(server);
    // The trigger renders twice (compact topbar and expanded sidebar footer); use the visible one.
    await stale.locator('[data-testid="topbar-user-menu"]:visible').first().click();
    await stale.getByTestId('user-menu-logout').click();

    await expect(stale.locator('#login-email')).toBeVisible({ timeout: 10_000 });
    expect(server.revokes).toEqual([FIRST_PROOF, ROTATED_PROOF]);
    expect(server.revoked).toBe(true);
    // The onboarding on /login read the session only after the revoke settled.
    expect(server.environmentEntries).toBe(entriesBeforeLogout);
  });
});
