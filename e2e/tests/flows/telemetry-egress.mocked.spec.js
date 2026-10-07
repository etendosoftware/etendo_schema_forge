import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Telemetry egress (ETP-4578): what the browser sends to the telemetry providers' hosts.
 *
 * Every request to a provider host is intercepted and aborted, so nothing ever leaves the test
 * machine, and each one is recorded. The bundle under test decides which scenario applies,
 * because providers are configured at BUILD time (VITE_DATADOG_*, VITE_MIXPANEL_*, VITE_RUM_*):
 *
 *  1. DEFAULT (`run-e2e-full.sh` as it is): a bundle with no provider configuration. Zero
 *     requests. This guards against an SDK that starts on its own defaults or a hardcoded key.
 *  2. KILLED (`E2E_TELEMETRY=killed`): a bundle built WITH fake provider configuration and
 *     `VITE_TELEMETRY_KILL=true`. Zero requests: the kill switch stops providers that are
 *     otherwise fully configured.
 *  3. CONFIGURED (`E2E_TELEMETRY=configured`): the same fake configuration WITHOUT the kill.
 *     A positive control: at least one request must be attempted, otherwise the "zero" of the
 *     other two scenarios would prove nothing (a broken interceptor also sees zero).
 *
 * The interceptor is registered BEFORE `login()`, which navigates and boots the app: telemetry is
 * initialized (and `app_started`, the session and group events go out) during that boot, so
 * installing it afterwards would leave exactly that stretch unobserved. Requests seen up to the
 * end of login are snapshotted as `bootAttempts`, and the positive control requires some, which is
 * what proves the interceptor really covers the boot.
 *
 * Scenarios 2 and 3 need their own bundle, see docs/ops/app-shell-observability.md (Kill Switch).
 */

const SCENARIO = process.env.E2E_TELEMETRY || 'default';

// The hosts the providers talk to. Deliberately narrow: the app's own backend is never matched.
const PROVIDER_HOSTS = [
  // Datadog intake (`browser-intake-datadoghq.eu`), its remote configuration and every site.
  /(^|[.-])datadoghq\.(eu|com)$/,
  /(^|[.-])ddog-gov\.com$/,
  /(^|\.)mixpanel\.com$/,
  /(^|\.)mxpnl\.com$/,
  /(^|\.)dataplane\.rum\.[a-z0-9-]+\.amazonaws\.com$/,
  /(^|\.)cognito-identity\.[a-z0-9-]+\.amazonaws\.com$/,
  /(^|\.)client\.rum\.[a-z0-9-]+\.amazonaws\.com$/,
];

const isProviderHost = (hostname) => PROVIDER_HOSTS.some((pattern) => pattern.test(hostname));

/** Aborts and records every request to a provider host. */
async function trackProviderRequests(page) {
  const attempts = [];
  await page.route((url) => isProviderHost(url.hostname), async (route) => {
    attempts.push(`${route.request().method()} ${new URL(route.request().url()).hostname}`);
    await route.abort();
  });
  return attempts;
}

async function visit(page, path) {
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  // Telemetry batches on a timer; give any SDK the chance to flush before we count.
  await page.waitForTimeout(1500);
}

test.describe('telemetry egress', () => {
  let attempts;
  let bootAttempts;

  test.beforeEach(async ({ page }) => {
    // Order matters: the interceptor first, then the login that boots the app.
    attempts = await trackProviderRequests(page);
    await login(page);
    // Let the first batch of startup telemetry go out before the snapshot.
    await page.waitForTimeout(1500);
    bootAttempts = [...attempts];
  });

  test('sends nothing to a provider host in the default bundle', async ({ page }) => {
    test.skip(SCENARIO !== 'default', 'this bundle has provider configuration; see E2E_TELEMETRY');
    await visit(page, '/dashboard');
    await visit(page, '/sales-order');
    await visit(page, '/first-steps');

    expect(attempts, `requests to telemetry providers: ${attempts.join(', ')}`).toEqual([]);
  });

  test('sends nothing when the providers are configured but the kill switch is on', async ({ page }) => {
    test.skip(SCENARIO !== 'killed', 'needs a bundle built with fake provider config and VITE_TELEMETRY_KILL=true');
    await visit(page, '/dashboard');
    await visit(page, '/sales-order');

    expect(attempts, `requests to telemetry providers: ${attempts.join(', ')}`).toEqual([]);
  });

  test('attempts requests when the providers are configured and not killed (positive control)', async ({ page }) => {
    test.skip(SCENARIO !== 'configured', 'needs a bundle built with fake provider config, without the kill');
    await visit(page, '/dashboard');

    expect(attempts.length, 'a configured bundle must reach at least one provider host, or the kill test proves nothing').toBeGreaterThan(0);
    expect(
      bootAttempts.length,
      'the interceptor must see the requests made while the app boots (login), not only later navigations',
    ).toBeGreaterThan(0);
  });
});
