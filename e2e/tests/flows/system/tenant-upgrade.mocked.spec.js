import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

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
 *     npx playwright test tests/flows/system/tenant-upgrade.mocked.spec.js --project=mocked
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
 * Seeds a LEGACY key, on purpose, and expects it to change nothing.
 *
 * It used to be the account-level token `getPlatformToken()` read and handed to
 * `buildAuthHeaders`, which puts whatever it receives into `X-Go-CSRF`. ETP-4576 —
 * `purgeLegacyAuthStorage` deletes this key, so the value was always null and both checkout
 * POSTs went out with no proof of intent while the environments GET beside them kept working
 * (the browser attaches the session cookie itself and a read needs no proof). Both readers are
 * gone: the whole flow authenticates with the `__Host-` session `login()` establishes, and
 * `apiFetch` adds the proof on the writes. The seed stays so this file also covers the upgrade
 * running against a browser that still has an entry left over from an older release.
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
 * Mocks entering an already-provisioned environment.
 *
 * ETP-4576 — `switchTo` (`useEnvironmentSwitch.js`) now POSTs to
 * `/sws/go/session/environment`, which UPDATES the backend-managed session rather than minting
 * a token for the client to hold, and reports `status`. It proceeds with its hard
 * `window.location.href` navigation on success; anything else silently no-ops.
 */
async function installEnvironmentLoginMock(page, { roleList } = {}) {
  const requests = [];
  await page.route('**/sws/go/session/environment{/**,}**', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    try { requests.push(JSON.parse(route.request().postData() || '{}')); } catch { /* ignore */ }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', roleList }),
    });
  });
  return requests;
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
