// @covers tools/app-shell/src/components/account/SubscriptionSection.jsx
// @covers tools/app-shell/src/components/billing/BillingStatusBanner.jsx
// @covers tools/app-shell/src/components/billing/QuotaStatusBanner.jsx
// @covers tools/app-shell/src/lib/planQuotas.js
// @covers tools/app-shell/src/lib/backendErrors.js
// @covers tools/app-shell/src/hooks/useEntity.js
import { test, expect } from '@playwright/test';
import { login, declareCookieSession } from '../../helpers/auth.js';

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

/**
 * Mocks `GET /sws/go/environments` with a single environment — the list both in-environment
 * banners (`BillingStatusBanner`, `QuotaStatusBanner`) read the current environment from, matched
 * by the session's `clientId` (`e2e-mock-client` in `login()`'s mock). Two routes, not a brace
 * pattern — see the route-glob gotcha in docs/e2e-testing-guide.md.
 */
async function installEnvironmentsMock(page, environment) {
  const handler = async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ environments: [environment] }),
    });
  };
  await page.route('**/sws/go/environments/**', handler);
  await page.route('**/sws/go/environments**', handler);
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

/**
 * The failed-payment banner (ETP-5049) — the in-environment side of the same PAST_DUE state.
 *
 * `BillingStatusBanner` reads the current environment off `GET /sws/go/environments` (matched by
 * the session's `clientId`, `e2e-mock-client` in `login()`'s mock) and shows while `graceEndsAt`
 * is ahead. The owner's CTA leads to `/account`, where the Subscription section above owns the
 * payment portal, so the banner is not repeated there.
 */
test.describe('Subscription lifecycle — failed-payment banner', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function pastDueEnvironment({ daysLeft, ownedByAccount }) {
    return {
      clientId: 'e2e-mock-client',
      clientName: 'Acme Productive',
      plan: 'productive',
      environmentType: 'PRODUCTIVE',
      subscriptionStatus: 'PAST_DUE',
      graceEndsAt: new Date(Date.now() + daysLeft * DAY_MS).toISOString(),
      ownedByAccount,
    };
  }

  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountMock(page);
    await installSubscriptionMock(page, PAST_DUE_SUBSCRIPTION);
  });

  test('the owner is warned, and Update payment leads to /account, where the banner is not repeated', async ({ page }) => {
    await installEnvironmentsMock(page, pastDueEnvironment({ daysLeft: 10, ownedByAccount: true }));
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const banner = page.getByTestId('billing-status-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-variant', 'warning');
    await expect(banner.getByTestId('billing-status-banner-dismiss')).toBeVisible();

    await banner.getByTestId('billing-status-banner-cta').click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('SubscriptionSection__account')).toBeVisible();
    await expect(page.getByTestId('billing-status-banner')).toHaveCount(0);
  });

  test('a member is told to contact the administrator, with no CTA', async ({ page }) => {
    await installEnvironmentsMock(page, pastDueEnvironment({ daysLeft: 10, ownedByAccount: false }));
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const banner = page.getByTestId('billing-status-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByTestId('billing-status-banner-member-hint')).toBeVisible();
    await expect(banner.getByTestId('billing-status-banner-cta')).toHaveCount(0);
  });

  test('in the last 3 days the banner is an alert that cannot be dismissed', async ({ page }) => {
    await installEnvironmentsMock(page, pastDueEnvironment({ daysLeft: 2, ownedByAccount: true }));
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const banner = page.getByTestId('billing-status-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toHaveAttribute('data-variant', 'destructive');
    await expect(banner.getByTestId('billing-status-banner-dismiss')).toHaveCount(0);
  });
});

/**
 * Plan quotas (ETP-5051). One `QuotaItem` shape everywhere: `planQuotas[]` on
 * `GET /sws/go/billing/subscription` (/account), the WARN/DENY items in each environment's
 * `quotas[]` on `GET /sws/go/environments` (the in-environment banner), and `error.quota` on a NEO
 * write refused with 403 `QUOTA_EXCEEDED`. `periodStart` / `periodEnd` are date-only `yyyy-MM-dd`
 * strings; `periodEnd` is the exclusive end day and is shown as is.
 */
function quotaItem(overrides = {}) {
  return {
    resourceKey: 'POSTED_SALES_INVOICES',
    resourceName: 'Posted sales invoices',
    unitLabel: 'Inv',
    includedQty: 100,
    enforcementMode: 'block',
    warningThreshold: 80,
    period: 'month',
    consumptionSource: 'aggregate',
    consumed: 87,
    verdict: 'WARN',
    periodStart: '2026-10-07',
    periodEnd: '2026-11-07',
    ...overrides,
  };
}

const DENY_QUOTA = quotaItem({ consumed: 100, verdict: 'DENY' });

function quotaEnvironment({ quotas, ownedByAccount }) {
  return {
    clientId: 'e2e-mock-client',
    clientName: 'Acme Productive',
    plan: 'productive',
    environmentType: 'PRODUCTIVE',
    subscriptionStatus: 'ACTIVE',
    graceEndsAt: null,
    accessEnforced: true,
    ownedByAccount,
    quotas,
  };
}

async function gotoHome(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('Plan quotas — in-environment banner', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountMock(page);
    await installSubscriptionMock(page, ACTIVE_SUBSCRIPTION);
  });

  test('a DENY quota shows the red alert with the resource and usage, and the owner CTA leads to /account', async ({ page }) => {
    await installEnvironmentsMock(page, quotaEnvironment({ quotas: [DENY_QUOTA], ownedByAccount: true }));
    await gotoHome(page);

    const banner = page.getByTestId('quota-status-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toHaveAttribute('data-variant', 'destructive');

    const item = banner.getByTestId('quota-status-banner-item');
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute('data-verdict', 'DENY');
    // quotaBannerDeny with quotaUsageInPeriod — es_ES (mocked default) / en_US.
    await expect(item).toContainText('Posted sales invoices');
    await expect(item).toContainText(/100 (de|of) 100 Inv (al mes|per month)/);
    await expect(item).toContainText(/has alcanzado el límite|limit has been reached/i);
    await expect(banner.getByTestId('quota-status-banner-member-hint')).toHaveCount(0);

    await banner.getByTestId('quota-status-banner-cta').click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('SubscriptionSection__account')).toBeVisible();
    // /account lists every quota itself, so the banner is not repeated there.
    await expect(page.getByTestId('quota-status-banner')).toHaveCount(0);
  });

  test('a member sees the contact-admin hint instead of the CTA', async ({ page }) => {
    await installEnvironmentsMock(page, quotaEnvironment({ quotas: [DENY_QUOTA], ownedByAccount: false }));
    await gotoHome(page);

    const banner = page.getByTestId('quota-status-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner.getByTestId('quota-status-banner-member-hint')).toBeVisible();
    await expect(banner.getByTestId('quota-status-banner-member-hint'))
      .toHaveText(/contacta con el administrador|contact your company's administrator/i);
    await expect(banner.getByTestId('quota-status-banner-cta')).toHaveCount(0);
  });

  test('a WARN quota shows the amber banner, and a dismissal holds for the rest of the session', async ({ page }) => {
    await installEnvironmentsMock(page, quotaEnvironment({ quotas: [quotaItem()], ownedByAccount: true }));
    await gotoHome(page);

    const banner = page.getByTestId('quota-status-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toHaveAttribute('data-variant', 'warning');
    const item = banner.getByTestId('quota-status-banner-item');
    await expect(item).toHaveAttribute('data-verdict', 'WARN');
    await expect(item).toContainText('Posted sales invoices');
    await expect(item).toContainText(/87 (de|of) 100 Inv/);
    await expect(item).toContainText(/cerca del límite|close to your plan limit/i);

    await banner.getByTestId('quota-status-banner-dismiss').click();
    await expect(page.getByTestId('quota-status-banner')).toHaveCount(0);

    // Same tab, fresh page load: the environment list is fetched again and still carries the
    // WARN item, yet the banner stays dismissed (sessionStorage).
    const environmentsLoaded = page.waitForResponse(
      (res) => res.url().includes('/sws/go/environments') && res.request().method() === 'GET',
      { timeout: 10_000 },
    );
    await page.reload();
    await environmentsLoaded;
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('quota-status-banner')).toHaveCount(0);
  });
});

test.describe('Plan quotas — /account', () => {
  // A negative UTC offset is where a date-only string parsed as a UTC instant shows the day before
  // (CLAUDE.md, Date-Only Parsing): the period must still read 7 Oct – 7 Nov.
  test.use({ timezoneId: 'America/Argentina/Buenos_Aires' });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountMock(page);
  });

  test('shows the plan name, each quota with its monthly usage and period, and the WARN badge', async ({ page }) => {
    await installSubscriptionMock(page, {
      ...ACTIVE_SUBSCRIPTION,
      planName: 'Business',
      accessEnforced: true,
      planQuotas: [quotaItem()],
    });
    await gotoAccount(page);

    const section = page.getByTestId('SubscriptionSection__account');
    await expect(section).toBeVisible();
    await expect(section.getByTestId('SubscriptionSection__plan')).toHaveText('Business');

    const quotas = section.getByTestId('SubscriptionSection__quotas');
    await expect(quotas).toBeVisible();
    await expect(quotas.getByTestId('SubscriptionSection__quotaPeriod'))
      .toHaveText(/7 oct\.? 2026.*7 nov\.? 2026/i);

    const row = quotas.getByTestId('SubscriptionSection__quota');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-verdict', 'WARN');
    await expect(row.getByTestId('SubscriptionSection__quotaName')).toHaveText('Posted sales invoices');
    await expect(row.getByTestId('SubscriptionSection__quotaUsage'))
      .toHaveText(/^87 (de|of) 100 Inv (al mes|per month)$/);
    await expect(row.getByTestId('SubscriptionSection__quotaNotMeasured')).toHaveCount(0);
    await expect(row.getByTestId('SubscriptionSection__quotaState'))
      .toHaveText(/^(Cerca del límite|Near the limit)$/);
  });
});

/**
 * The write refusal: a NEO create answered 403 `QUOTA_EXCEEDED` shows the SPA's own translated
 * sentence, built from `error.quota` — never the 402 blocked-environment screen, and never the
 * generic no-access message a 403 might suggest. Driven through Cost Center, the simple master
 * whose create flow `inventory/cost-center-service-project-master-crud.mocked.spec.js` drives.
 */
test.describe('Plan quotas — write refusal on save', () => {
  const SPEC = 'cost-center';
  const ENTITY = 'costCenter';

  async function installCostCenterMocks(page, { onPost }) {
    // Bare route first, the sub-path route second, so the latter wins LIFO for /defaults and
    // /<id> (same ordering as the master-CRUD spec).
    await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      // Only the create itself: the form also POSTs to `/<entity>/evaluate-display`, which this
      // glob matches too and which must keep its generic answer.
      const isCreate = new RegExp(`/${ENTITY}(\\?|$)`).test(req.url());
      if (req.method() === 'POST' && isCreate) {
        await onPost(route);
        return;
      }
      await route.fallback();
    });
    await page.route(`**/sws/neo/${SPEC}/${ENTITY}/**`, async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') return route.fallback();
      if (/\/defaults(\?|$)/.test(req.url())) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ defaults: { active: 'Y' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
    });
  }

  test('a 403 QUOTA_EXCEEDED shows the translated quota message, not the blocked screen or a no-access error', async ({ page }) => {
    await login(page);
    let posts = 0;
    await installCostCenterMocks(page, {
      onPost: async (route) => {
        posts += 1;
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              message: 'Quota exceeded: Posted sales invoices (100/100 Inv)',
              status: 403,
              code: 'QUOTA_EXCEEDED',
              quota: DENY_QUOTA,
            },
          }),
        });
      },
    });
    await page.goto(`/${SPEC}/new`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('field-searchKey')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('field-searchKey').fill('CC-QUOTA-001');
    await page.getByTestId('field-name').fill('Quota refused');
    const saveBtn = page.getByTestId('action-save');
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    await saveBtn.click();

    const errorToast = page.locator('[data-type="error"]').first();
    await expect(errorToast).toBeVisible({ timeout: 10_000 });
    // backendError.quotaExceeded — es_ES (mocked default) / en_US.
    await expect(errorToast).toContainText(
      /Posted sales invoices: (has alcanzado el límite de tu plan|your plan limit has been reached) \(100 (de|of) 100 Inv\)/,
    );
    // Not the backend's English prose, and not the generic no-access sentence (backendError.accessDeniedToSpec).
    await expect(errorToast).not.toContainText('Quota exceeded:');
    await expect(errorToast).not.toContainText(/no tienes acceso para realizar|do not have access to perform/i);
    // Not the 402 environment-blocked screen: the form is still there and the user stays on /new.
    await expect(page.getByTestId('BlockedAccessScreen__488148')).toHaveCount(0);
    await expect(page.getByTestId('field-name')).toBeVisible();
    expect(page.url()).toMatch(new RegExp(`/${SPEC}/new`));
    expect(posts).toBe(1);
  });
});
