import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Environment commercial access block — `BlockedAccessScreen` (ETP-5443 follow-up, ETP-5047).
 *
 * `NeoAuthenticator.enforceEnvironmentAccess` (com.etendoerp.go) answers every NEO request
 * with HTTP 402 once an environment's commercial access is cut off (demo trial expired /
 * subscription payment grace elapsed). Since ETP-5047 the body is the structured
 * `EnvironmentAccessGuard.Denial.errorBody`:
 *
 *   { error: { message: "Environment access is not available: <DECISION>", status: 402,
 *              code: "ENVIRONMENT_ACCESS_DENIED", decision: "<DECISION>" } }
 *
 * A pre-ETP-5047 backend sends only `{ error: { message } }`. `lib/environmentAccessGate.js`
 * (`readEnvironmentAccessDecision`) reads the structured `error.decision` first whenever
 * `error.code === "ENVIRONMENT_ACCESS_DENIED"`, and falls back to parsing the message prefix
 * otherwise. It detects this from the `/sws/neo/windowaccessmap` call `fetchWindowAccess()`
 * (App.jsx) makes on every session bootstrap, and `AppLayoutAccessGate` (layout/AppLayout.jsx)
 * renders `BlockedAccessScreen` instead of the normal sidebar/Outlet whenever a BLOCKING
 * decision (`DEMO_TRIAL_EXPIRED` or `SUBSCRIPTION_REQUIRED`) is recorded — except on `/account`
 * and `/upgrade`, which stay reachable because both resolve through the account's own platform
 * token, independent of the blocked tenant session, and are literally where the screen's own
 * CTA sends the user.
 *
 * Coverage:
 *   - every blocking decision x every body shape (structured = current backend, message-only =
 *     backward-compat fallback for a pre-ETP-5047 backend);
 *   - precedence: when the structured `decision` and the message disagree, the structured
 *     `decision` wins (mirrors the precedence case in `environmentAccessGate.vitest.js`).
 *
 * `login()`'s mocked-mode `window.fetch` monkey-patch (see auth.js) always answers
 * `/sws/neo/windowaccessmap` with full access via a Proxy, so simulating the 402 here needs a
 * SECOND `window.fetch` override registered (via `page.addInitScript`) AFTER `login()`'s own —
 * init scripts run in registration order at each navigation, so the later one wraps the
 * earlier one and can short-circuit the one URL it cares about before delegating everything
 * else down the chain. `addInitScript` only affects FUTURE navigations, so a `page.reload()`
 * is required for it to take effect (see `installEnvironmentAccessBlock` below).
 */

const ENVIRONMENT_ACCESS_PREFIX = 'Environment access is not available: ';
const BLOCKED_SCREEN_TESTID = 'BlockedAccessScreen__488148';

/** Current backend (ETP-5047): `EnvironmentAccessGuard.Denial.errorBody`. */
function structuredDenialBody(decision, { message } = {}) {
  return {
    error: {
      message: message ?? `${ENVIRONMENT_ACCESS_PREFIX}${decision}`,
      status: 402,
      code: 'ENVIRONMENT_ACCESS_DENIED',
      decision,
    },
  };
}

/** Pre-ETP-5047 backend: the decision is only recoverable from the message prefix. */
function messageOnlyDenialBody(decision) {
  return { error: { message: `${ENVIRONMENT_ACCESS_PREFIX}${decision}` } };
}

const BODY_SHAPES = [
  { label: 'structured ETP-5047 body (current backend)', build: structuredDenialBody },
  { label: 'message-only body (backward-compat fallback, pre-ETP-5047 backend)', build: messageOnlyDenialBody },
];

/**
 * What each blocking decision must render. Titles are matched bilingually (the mocked locale
 * defaults to es_ES) so the assertion proves the decision-specific copy, not just "some" screen.
 * `ctaPath` / `landingTestId` are language-independent and pin which decision was recorded.
 */
const DECISIONS = {
  SUBSCRIPTION_REQUIRED: {
    title: /access suspended for non-payment|acceso suspendido por falta de pago/i,
    ctaPath: '/account',
    landingTestId: 'account-settings-page',
  },
  DEMO_TRIAL_EXPIRED: {
    title: /your trial period has ended|tu período de prueba terminó/i,
    ctaPath: '/upgrade',
    landingTestId: 'upgrade-page-shell',
  },
};

async function installEnvironmentAccessBlock(page, denialBody) {
  await page.addInitScript((injectedBody) => {
    const previousFetch = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && url.includes('/sws/neo/windowaccessmap')) {
        return Promise.resolve(new Response(JSON.stringify(injectedBody), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return previousFetch(input, init);
    };
  }, denialBody);
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function installAccountMock(page) {
  const meHandler = async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authMethods: { password: { enabled: true }, identities: [], removable: [] } }),
    });
  };
  // Two routes, not a `{/**,}` brace pattern — see the e2e-testing-guide route-glob gotcha.
  await page.route('**/sws/go/me/**', meHandler);
  await page.route('**/sws/go/me**', meHandler);
  await page.route('**/sws/go/billing/subscription', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasSubscription: false }),
    });
  });
}

/**
 * Asserts the blocked screen shows `decision`'s copy, that its CTA leads to that decision's
 * exempt route, and that the block does not follow the user there.
 */
async function expectBlockedScreenFor(page, decision) {
  const expected = DECISIONS[decision];

  await expect(page.getByTestId(BLOCKED_SCREEN_TESTID)).toBeVisible();
  await expect(page.getByTestId('blocked-access-title')).toHaveText(expected.title);
  await expect(page.getByTestId('blocked-access-message')).toBeVisible();

  await page.getByTestId('blocked-access-cta').click();
  await expect(page).toHaveURL(new RegExp(`${expected.ctaPath}$`));

  // The CTA's target is exempt from the gate — the block must not follow the user there.
  await expect(page.getByTestId(BLOCKED_SCREEN_TESTID)).toHaveCount(0);
  await expect(page.getByTestId(expected.landingTestId)).toBeVisible({ timeout: 10_000 });
}

for (const shape of BODY_SHAPES) {
  test.describe(`Environment access block — BlockedAccessScreen — ${shape.label}`, () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installAccountMock(page);
    });

    test('SUBSCRIPTION_REQUIRED shows the blocked screen with a CTA to /account, and /account still renders', async ({ page }) => {
      await installEnvironmentAccessBlock(page, shape.build('SUBSCRIPTION_REQUIRED'));
      await expectBlockedScreenFor(page, 'SUBSCRIPTION_REQUIRED');
    });

    test('DEMO_TRIAL_EXPIRED shows the blocked screen with a CTA to /upgrade, and /upgrade still renders', async ({ page }) => {
      await installEnvironmentAccessBlock(page, shape.build('DEMO_TRIAL_EXPIRED'));
      await expectBlockedScreenFor(page, 'DEMO_TRIAL_EXPIRED');
    });
  });
}

test.describe('Environment access block — structured decision precedence', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountMock(page);
  });

  test('the structured decision wins over a message naming a different decision', async ({ page }) => {
    await installEnvironmentAccessBlock(page, structuredDenialBody('DEMO_TRIAL_EXPIRED', {
      message: `${ENVIRONMENT_ACCESS_PREFIX}SUBSCRIPTION_REQUIRED`,
    }));

    // Had the message been read, the title would say "non-payment" and the CTA would go to /account.
    await expect(page.getByTestId(BLOCKED_SCREEN_TESTID)).toBeVisible();
    await expect(page.getByTestId('blocked-access-title'))
      .not.toHaveText(DECISIONS.SUBSCRIPTION_REQUIRED.title);
    await expectBlockedScreenFor(page, 'DEMO_TRIAL_EXPIRED');
  });
});
