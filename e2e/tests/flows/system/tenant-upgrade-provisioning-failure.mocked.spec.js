import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Paid checkout recovery at the browser boundary.
 *
 * This is deliberately mocked: it exercises the durable requestId returned by the
 * payment boundary and the failed provisioning response without charging Stripe or
 * touching an Etendo server. The route handlers are installed after login so they win
 * over the generic `/sws/**` fixture.
 */

const REQUEST_ID = 'paid-provisioning-failure-1';
const TENANT_NAME = 'Acme Productive';
const EXISTING_ENVIRONMENTS = [
  {
    clientId: 'demo-client-1',
    clientName: 'Acme Trial',
    adminUserId: 'user-1',
    adminUserName: 'admin',
    plan: 'free',
  },
];

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function failedProvisioningStream() {
  return [
    JSON.stringify({ type: 'progress', step: 'setup', status: 'done', ms: 10 }),
    JSON.stringify({ type: 'progress', step: 'client', status: 'done', ms: 20 }),
    JSON.stringify({
      type: 'progress',
      step: 'organization',
      status: 'error',
      error: 'Pooled tenant finalization failed',
    }),
    JSON.stringify({
      type: 'result',
      success: false,
      error: 'Pooled tenant finalization failed',
    }),
    '',
  ].join('\n');
}

async function installFailureBoundary(page) {
  const state = { onboardingRequests: [], statusReads: 0 };

  await page.route('**/sws/go/environments{/**,}**', route => (
    json(route, { environments: EXISTING_ENVIRONMENTS })
  ));

  await page.route('**/sws/go/billing/offers{/**,}**', route => (
    json(route, {
      amountMinor: 1000,
      currency: 'EUR',
      interval: 'month',
    })
  ));

  // The purchase is durable and account-scoped. The browser must use this same
  // requestId after returning from hosted checkout; it must not invent another one.
  await page.route(`**/sws/go/billing/purchases/${REQUEST_ID}{/**,}**`, route => (
    json(route, {
      purchaseId: REQUEST_ID,
      clientName: TENANT_NAME,
      status: 'PAID',
    })
  ));

  // Payment is confirmed, but the subsequent provisioning state is terminally failed.
  await page.route(`**/sws/go/checkout/sessions/${REQUEST_ID}{/**,}**`, async route => {
    state.statusReads += 1;
    return json(route, {
      requestId: REQUEST_ID,
      status: 'provisioning_failed',
      retryAllowed: true,
      clientName: TENANT_NAME,
      failureReason: 'Pooled tenant finalization failed',
    });
  });

  // Keep this route in place to prove that a terminal failed status is surfaced
  // before a second environment is requested. A correct recovery UI may call the
  // same idempotent request later, but this first render must not provision blindly.
  await page.route('**/sws/go/onboarding{/**,}**', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    state.onboardingRequests.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: failedProvisioningStream(),
    });
  });

  return state;
}

test.describe('Paid tenant provisioning failure recovery', () => {
  test('keeps the paid request visible and retries with the same payment token', async ({ page }) => {
    await login(page);
    const state = await installFailureBoundary(page);

    await page.evaluate(({ requestId, tenantName }) => {
      sessionStorage.setItem('sf_pending_checkout_tenant_name', tenantName);
      sessionStorage.setItem('sf_pending_checkout_action', 'create-productive');
      sessionStorage.setItem('sf_pending_checkout_started_at', String(Date.now()));
      sessionStorage.setItem('sf_pending_checkout_data_transfer', '{}');
      window.history.replaceState({}, '', `/upgrade?checkout=success&requestId=${requestId}`);
    }, { requestId: REQUEST_ID, tenantName: TENANT_NAME });

    await page.goto(`/upgrade?checkout=success&requestId=${REQUEST_ID}`);

    await expect(page.getByTestId('upgrade-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('upgrade-provisioning-retry')).toBeVisible();
    await expect(page).not.toHaveURL(/dashboard/);
    expect(state.statusReads).toBeGreaterThanOrEqual(1);
    expect(state.onboardingRequests).toHaveLength(0);

    await page.getByTestId('upgrade-provisioning-retry').click();
    await expect.poll(() => state.onboardingRequests.length).toBe(1);
    expect(state.onboardingRequests[0].paymentToken).toBe(REQUEST_ID);
    await expect(page.getByTestId('upgrade-error')).toBeVisible();
  });

  for (const checkoutStatus of ['provisioning', 'provisioned']) {
    test(`checkout return in ${checkoutStatus} discovers the existing environment`, async ({ page }) => {
      await login(page);
      const productiveClientId = 'productive-client-1';
      let onboardingPosts = 0;
      let newCheckouts = 0;
      await page.route('**/sws/go/environments', route => json(route, {
        environments: [
          ...EXISTING_ENVIRONMENTS,
          { clientId: productiveClientId, clientName: TENANT_NAME, plan: 'productive' },
        ],
      }));
      await page.route(`**/sws/go/checkout/sessions/${REQUEST_ID}`, route => json(route, {
        requestId: REQUEST_ID,
        status: checkoutStatus,
        clientName: TENANT_NAME,
      }));
      await page.route(`**/sws/go/billing/purchases/${REQUEST_ID}`, route => json(route, {
        purchaseId: REQUEST_ID,
        clientName: TENANT_NAME,
        status: 'PROVISIONED',
        createdClientId: productiveClientId,
      }));
      await page.route('**/sws/go/onboarding', route => {
        if (route.request().method() === 'POST') onboardingPosts += 1;
        return route.fallback();
      });
      await page.route('**/sws/go/billing/purchases', route => {
        if (route.request().method() === 'POST') newCheckouts += 1;
        return route.fallback();
      });

      await page.evaluate(({ requestId, tenantName }) => {
        sessionStorage.setItem('sf_pending_checkout_tenant_name', tenantName);
        sessionStorage.setItem('sf_pending_checkout_action', 'create-productive');
        sessionStorage.setItem('sf_pending_checkout_started_at', String(Date.now()));
        window.history.replaceState({}, '', `/upgrade?checkout=success&requestId=${requestId}`);
      }, { requestId: REQUEST_ID, tenantName: TENANT_NAME });
      await page.goto(`/upgrade?checkout=success&requestId=${REQUEST_ID}`);

      await expect(page.getByTestId('upgrade-success')).toBeVisible({ timeout: 10_000 });
      expect(onboardingPosts).toBe(0);
      expect(newCheckouts).toBe(0);
    });
  }
});
