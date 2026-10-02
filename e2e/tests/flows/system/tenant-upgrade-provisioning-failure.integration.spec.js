import { test, expect } from '@playwright/test';
import { apiAuthHeaders, login } from '../../helpers/auth.js';
import { loadCredentials } from '../../helpers/purchase-helpers.js';

/**
 * ETP-5548: a paid checkout that fails while claiming its dedicated pool tenant.
 *
 * The local backend fixture creates a PAID checkout for the logged-in account and
 * makes its real pooled finalization fail once. The browser follows the normal
 * checkout-return path and sends the onboarding request itself. Cleanup deletes
 * only the fixture checkout and restores the dedicated pool row to READY.
 */
const RUN = process.env.E2E_PROVISIONING_FAILURE === '1';
const BASE_URL = String(process.env.BASE_URL || 'http://localhost:3100').trim();
const LOCAL_BASE_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(BASE_URL);
const FIXTURE_PATH = '/sws/go/dev/provisioning-failure-fixture';
const credentials = loadCredentials();

async function authenticatedJson(page, path, options = {}) {
  const headers = {
    ...(await apiAuthHeaders(page)),
    ...(options.data ? { 'Content-Type': 'application/json' } : {}),
  };
  return page.request.fetch(path, { ...options, headers });
}

test.describe('Paid pooled tenant provisioning failure — real backend', () => {
  // First run may build the dedicated pool client before the browser starts provisioning.
  test.describe.configure({ timeout: 360_000 });
  test.skip(!RUN, 'The local backend fixture is not configured (E2E_PROVISIONING_FAILURE=1).');

  test('keeps the paid purchase and shows the failed provisioning in the browser', async ({ page }) => {
    expect(LOCAL_BASE_URL,
      `The provisioning fixture must run against a local BASE_URL; received ${BASE_URL}`,
    ).toBe(true);

    // Targeted --no-deps runs may find credentials from a previous onboarding run.
    // A complete explicit pair must win; never combine a saved email with a new password.
    const explicitCredentials = process.env.E2E_USER && process.env.E2E_PASSWORD
      ? { email: process.env.E2E_USER, password: process.env.E2E_PASSWORD }
      : null;
    const { email, password } = explicitCredentials || credentials || {};
    expect(email, 'A local test owner email is required').toBeTruthy();
    expect(password, 'A local test owner password is required').toBeTruthy();
    await login(page, { user: email, password });

    const setup = await authenticatedJson(page, FIXTURE_PATH, {
      method: 'POST',
      data: { clientName: `E2E Pool Failure ${Date.now()}` },
    });
    expect(setup.ok(), `Fixture setup failed (${setup.status()}): ${await setup.text()}`)
      .toBe(true);
    const fixture = await setup.json();
    expect(fixture.requestId).toBeTruthy();
    expect(fixture.clientName).toBeTruthy();
    expect(fixture.cleanupToken).toBeTruthy();

    try {
      await page.evaluate(({ requestId, clientName }) => {
        localStorage.setItem('schema-forge-locale', 'es_ES');
        sessionStorage.setItem('sf_pending_checkout_tenant_name', clientName);
        sessionStorage.setItem('sf_pending_checkout_action', 'create-productive');
        sessionStorage.setItem('sf_pending_checkout_started_at', String(Date.now()));
        sessionStorage.setItem('sf_pending_checkout_data_transfer', '{}');
        window.history.replaceState({}, '', `/upgrade?checkout=success&requestId=${requestId}`);
      }, fixture);

      const onboardingResponses = [];
      page.on('response', response => {
        if (response.url().includes('/sws/go/onboarding')
            && response.request().method() === 'POST') onboardingResponses.push(response);
      });

      await page.goto(`/upgrade?checkout=success&requestId=${encodeURIComponent(fixture.requestId)}`);
      await expect(page.getByTestId('upgrade-error')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('upgrade-provisioning-retry')).toBeVisible();
      await expect(page).not.toHaveURL(/dashboard/);

      expect(onboardingResponses,
        'The checkout-return UI must send exactly one real onboarding request',
      ).toHaveLength(1);
      const onboardingResponse = onboardingResponses[0];
      expect(onboardingResponse.ok(), await onboardingResponse.text()).toBe(true);
      const events = (await onboardingResponse.text())
        .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      const result = events.find(event => event.type === 'result');
      expect(result?.success).toBe(false);
      expect(result?.message).toContain('E2E fixture forced pooled tenant finalization failure');
      const onboardingInput = onboardingResponse.request().postDataJSON();
      expect(onboardingInput.paymentToken).toBe(fixture.requestId);
      expect(onboardingInput.language).toBe('es_ES');

      const checkout = await authenticatedJson(
        page, `/sws/go/checkout/sessions/${encodeURIComponent(fixture.requestId)}`,
      );
      expect(checkout.ok(), await checkout.text()).toBe(true);
      const status = await checkout.json();
      expect(status.requestId).toBe(fixture.requestId);
      expect(status.status).toBe('provisioning_failed');
      expect(status.retryAllowed).toBe(true);
      // The polling contract carries a stable code and a fixed description. The raw cause stays
      // in the backend (it can hold exception text or internal ids), so it must not leak here.
      expect(status.failureCode).toBe('PROVISIONING_FAILED');
      expect(status.failureReason).toBeTruthy();
      expect(status.failureReason).not.toContain('E2E fixture forced');
      expect(Number.isNaN(Date.parse(status.updatedAt))).toBe(false);

      const purchaseResponse = await authenticatedJson(
        page, `/sws/go/billing/purchases/${encodeURIComponent(fixture.requestId)}`,
      );
      expect(purchaseResponse.ok(), await purchaseResponse.text()).toBe(true);
      const purchase = await purchaseResponse.json();
      expect(purchase.purchaseId).toBe(fixture.requestId);
      expect(purchase.status).toBe('PROVISIONING');
    } finally {
      const cleanup = await authenticatedJson(
        page, `${FIXTURE_PATH}/${encodeURIComponent(fixture.cleanupToken)}`, { method: 'DELETE' },
      );
      expect(cleanup.ok(), `Fixture cleanup failed (${cleanup.status()}): ${await cleanup.text()}`)
        .toBe(true);
    }
  });
});
