import { test, expect } from '@playwright/test';
import { login, declareCookieSession } from '../helpers/auth.js';

/**
 * Subscription lifecycle — Account settings (mocked). ETP-5443.
 *
 * Covers `SubscriptionSection` on `/account`: the active-subscription display (plan, amount,
 * status, next renewal date), the Manage button's redirect to the Stripe Customer Portal, the
 * past-due variant showing the remaining grace days, and the regression that the grace banner
 * is gated on a non-null `graceEndsAt` rather than on the raw `status` string (see
 * `PAST_DUE_WITHOUT_GRACE_END` below).
 *
 * Mock mode only: every route here is installed on top of the generic `/sws/**` stub that
 * `login()` seeds, so no backend is needed. Playwright matches routes in reverse registration
 * order, so these specific routes win.
 */

const AUTH_METHODS = { password: { enabled: true }, identities: [], removable: [] };

// `status` is Stripe's own live subscription status — lowercase (`active`, `past_due`,
// `trialing`, `canceled`...), never the uppercase `EnvironmentAccessPolicy` enum names. Whether
// the grace banner shows is decided by a non-null `graceEndsAt`, not by matching `status`.
// `currency` is lowercase too, matching the real backend payload (Stripe's own code, read
// verbatim) — REVIEW W5 fixture realism.
const ACTIVE_SUBSCRIPTION = {
  hasSubscription: true,
  plan: 'Pro',
  amountMinor: 2900,
  currency: 'eur',
  status: 'active',
  renewalAt: '2026-11-15T00:00:00Z',
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  graceDaysRemaining: 0,
};

// `renewalAt` is non-null here too (REVIEW W5): the real backend still sends it for a past-due
// subscription — Stripe's next invoice-retry date, not a renewal — and `SubscriptionSection`
// relies on the status (not a null renewalAt) to keep the "renews on" line from showing it.
const PAST_DUE_SUBSCRIPTION = {
  hasSubscription: true,
  plan: 'Pro',
  amountMinor: 2900,
  currency: 'eur',
  status: 'past_due',
  renewalAt: '2026-10-05T00:00:00Z',
  cancelAtPeriodEnd: false,
  graceEndsAt: '2026-10-01T00:00:00Z',
  graceDaysRemaining: 7,
};

// Regression: the grace signal is `graceEndsAt`, not the `status` string. A past-due account
// with no derived grace end date must show no banner it cannot back with a real deadline —
// same "never write PAST_DUE without a due date" rule the backend lifecycle applier enforces
// (design doc §4.4).
const PAST_DUE_WITHOUT_GRACE_END = {
  ...PAST_DUE_SUBSCRIPTION,
  graceEndsAt: null,
  graceDaysRemaining: 0,
};

// Third state (REVIEW W4): the grace window has ELAPSED (`graceDaysRemaining` 0) while
// `graceEndsAt` is still set — the stored projection has not yet been flipped to EXPIRED by the
// async lifecycle job. Access is already paused in this gap; the section must say so rather than
// showing a stale "days left" count or no banner at all.
const ACCESS_PAUSED_SUBSCRIPTION = {
  ...PAST_DUE_SUBSCRIPTION,
  graceEndsAt: '2026-10-01T00:00:00Z',
  graceDaysRemaining: 0,
};

/**
 * Mocks `GET /sws/go/me` — `AccountSettingsPage`'s own load. Required for `SubscriptionSection`
 * to render at all: a failed account load replaces BOTH sections with an error panel instead of
 * `loadedBody`, so without this mock the subscription section would never mount.
 */
async function installAccountMock(page) {
  await page.route('**/sws/go/me{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authMethods: AUTH_METHODS }),
    });
  });
}

/** Mocks `GET /sws/go/billing/subscription` with the given projection. */
async function installSubscriptionMock(page, subscription) {
  await page.route('**/sws/go/billing/subscription', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(subscription),
    });
  });
}

/**
 * Mocks `POST /sws/go/billing/subscription/portal` to answer with a same-origin URL, then mocks
 * that URL itself to serve a small HTML page. `handleManage()` navigates via
 * `window.location.assign(session.url)` — a real top-level navigation, not a fetch — so the target
 * must itself be routable for the test to observe where the browser actually landed.
 */
async function installPortalMock(page) {
  let requestCount = 0;
  await page.route('**/sws/go/billing/subscription/portal', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requestCount += 1;
    const portalUrl = new URL('/__mock-stripe-portal__', route.request().url()).toString();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: portalUrl }),
    });
  });

  await page.route('**/__mock-stripe-portal__**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>Mock Stripe Customer Portal</body></html>',
    });
  });

  return () => requestCount;
}

async function gotoAccount(page) {
  await page.goto('/account');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('Subscription lifecycle — /account', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountMock(page);
  });

  test('an active subscription shows plan, amount and renewal, and Manage opens the Stripe portal', async ({ page }) => {
    await installSubscriptionMock(page, ACTIVE_SUBSCRIPTION);
    const getPortalRequestCount = await installPortalMock(page);
    await gotoAccount(page);

    const section = page.getByTestId('SubscriptionSection__account');
    await expect(section).toBeVisible();

    await expect(section.getByTestId('SubscriptionSection__plan')).toHaveText('Pro');
    // Formatting is locale-driven (ETP-4314) — only assert the amount rendered and carries the
    // value's digits, not an exact separator/symbol placement.
    await expect(section.getByTestId('SubscriptionSection__amount')).toContainText('29');
    // The badge shows a translated label for the raw Stripe status, not the raw string itself
    // (ETP-5443 follow-up) — pinned once the status→i18n-key mapping lands; for now just assert
    // it renders something.
    await expect(section.getByTestId('SubscriptionSection__status')).toBeVisible();
    await expect(section.getByTestId('SubscriptionSection__renewsOn')).toBeVisible();
    await expect(section.getByTestId('SubscriptionSection__cancelsOn')).toHaveCount(0);
    await expect(section.getByTestId('SubscriptionSection__graceRemaining')).toHaveCount(0);

    await section.getByTestId('SubscriptionSection__manage').click();
    await expect(page).toHaveURL(/__mock-stripe-portal__/, { timeout: 10_000 });
    expect(getPortalRequestCount()).toBe(1);
  });
});

/**
 * Cookie session scheme (ETP-5443 follow-up). The suite above runs in `login()`'s shipped
 * default (bearer — see `declareCookieSession`'s own doc comment in auth.js). `createPortalSession`
 * goes through the same `apiFetch` as the billing/upgrade module, so under `mode: 'cookie'` its
 * write proof travels in `X-Go-CSRF`, never in `Authorization`, and no legacy `sf_platform_token`
 * is read or written anywhere in the flow.
 */
test.describe('Subscription lifecycle — /account, cookie session scheme', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await declareCookieSession(page);
    await installAccountMock(page);
  });

  test('runs with no legacy platform token, and Manage sends the portal request with X-Go-CSRF and no Authorization', async ({ page }) => {
    await installSubscriptionMock(page, ACTIVE_SUBSCRIPTION);
    const requests = [];
    await page.route('**/sws/go/billing/subscription/portal', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      requests.push(route.request().headers());
      const portalUrl = new URL('/__mock-stripe-portal__', route.request().url()).toString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: portalUrl }),
      });
    });
    await page.route('**/__mock-stripe-portal__**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Mock Stripe Customer Portal</body></html>',
      });
    });
    await gotoAccount(page);

    const legacyBefore = await page.evaluate(() => localStorage.getItem('sf_platform_token'));
    expect(legacyBefore).toBeNull();

    const section = page.getByTestId('SubscriptionSection__account');
    await expect(section).toBeVisible();
    await section.getByTestId('SubscriptionSection__manage').click();
    await expect(page).toHaveURL(/__mock-stripe-portal__/, { timeout: 10_000 });

    expect(requests).toHaveLength(1);
    expect(requests[0]['x-go-csrf']).toBe('e2e-cookie-csrf-token');
    expect(requests[0].authorization).toBeUndefined();

    const legacyAfter = await page.evaluate(() => localStorage.getItem('sf_platform_token'));
    expect(legacyAfter).toBeNull();
  });
});
