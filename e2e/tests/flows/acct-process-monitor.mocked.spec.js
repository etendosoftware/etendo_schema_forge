import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Accounting process monitor — Configuración > Accounting Process (ETP-5269, mocked).
 *
 * Covers the three things that only show up end to end:
 *
 *   1. **Menu gating.** The `acct-process-monitor` feature flag hides the MENU ENTRY only — the
 *      route is registered unconditionally (same precedent as `/upgrade`) and
 *      `SFAcctProcessMonitor` enforces admin access itself. Both halves are asserted: the entry
 *      appears for an admin with the flag on, and is absent with it off.
 *   2. **Trigger → history refresh.** `?Action=trigger` returns the refreshed history in the SAME
 *      round trip, so the run the admin just started is on screen without a second poll.
 *   3. **The log is never rendered.** `AD_PROCESS_RUN.LOG` is a CLOB of raw process output. The
 *      backend omits it; the fixtures below deliberately send one anyway, so this spec fails if a
 *      future change ever surfaces it in the DOM.
 *
 * The flag is fixed when Vite starts (`VITE_FEATURE_FLAGS`, no runtime override), so the
 * menu-entry tests follow `proof-of-concept-menu.mocked.spec.js` and skip themselves rather than
 * failing when the server was started the other way:
 *
 *   npx vite --port 3105        # flag off (default) — the flag-off menu test runs
 *   VITE_FEATURE_FLAGS='{"acct-process-monitor":true}' npx vite --port 3105
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 E2E_ACCT_PROCESS_MONITOR_FLAG=on \
 *     npx playwright test tests/flows/acct-process-monitor.mocked.spec.js --project=mocked
 *
 * Mock mode only. Routes are installed AFTER `login()` so they beat its generic `/sws/**` stub.
 * Run against plain `make dev`/`npx vite`, never `make dev-mock` — `VITE_MOCK=true` replaces
 * `window.fetch` in-page and silently bypasses every `page.route()` here.
 */

const FLAG_ON = process.env.E2E_ACCT_PROCESS_MONITOR_FLAG === 'on';

/** A CLOB of raw process output a regressed backend might send. Must never reach the DOM. */
const LOG_SENTINEL = 'SECRET-PROCESS-OUTPUT-DO-NOT-LEAK';

const EXISTING_RUNS = [
  {
    id: 'e2e-run-1',
    status: 'SUC',
    startTime: '2026-09-10T18:00:00',
    endTime: '2026-09-10T18:00:01',
    duration: '00:00:01',
    manual: false,
    log: LOG_SENTINEL,
  },
  {
    id: 'e2e-run-2',
    status: 'ERR',
    startTime: '2026-09-10T17:55:00',
    endTime: '2026-09-10T17:55:02',
    duration: '00:00:02',
    manual: true,
    log: LOG_SENTINEL,
  },
];

/** The one-shot the trigger creates — present only in the post-trigger response. */
const TRIGGERED_RUN = {
  id: 'e2e-run-new',
  status: 'PRC',
  startTime: '2026-09-10T18:02:00',
  endTime: null,
  duration: null,
  manual: true,
  log: LOG_SENTINEL,
};

function statusPayload(runs, overrides = {}) {
  return {
    error: false,
    processName: 'Accounting server process',
    scheduled: true,
    nextRunTime: '2026-09-10T18:05:00',
    running: false,
    lastRun: runs[0] ?? null,
    history: runs,
    ...overrides,
  };
}

/**
 * `SFAcctProcessMonitor` answers through the NEO pseudo-spec bridge, which wraps the payload as
 * `{result: "<json-string>"}`. Unlike `rolesApi.js`, `acctProcessMonitorApi.js` passes a
 * `noFallback` resolver, so the envelope is the ONLY shape it accepts — sending a bare object
 * here would make every request reject with "unexpected shape".
 */
function envelope(payload) {
  return JSON.stringify({ result: JSON.stringify(payload) });
}

/**
 * One handler for both actions. The endpoint takes no sub-path, only a query string, so a single
 * glued `**` is enough (see the e2e guide's `{/**,}**` gotcha — it applies to sub-paths, which
 * this endpoint has none of).
 */
async function installMonitorMock(page, { readOverrides = {}, triggered } = {}) {
  const requests = [];
  await page.route('**/sws/neo/acctprocessmonitor**', async (route) => {
    const url = route.request().url();
    requests.push(url);
    const isTrigger = url.includes('Action=trigger');
    if (isTrigger) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(statusPayload([TRIGGERED_RUN, ...EXISTING_RUNS], {
          running: true,
          triggered: triggered ?? { started: true, reason: 'started' },
        })),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(statusPayload(EXISTING_RUNS, readOverrides)),
    });
  });
  return requests;
}

/** Downgrades SFWindowAccessMap to a non-admin shape — see roles-overview.mocked.spec.js. */
async function installNonAdminCapabilities(page) {
  await page.addInitScript(() => {
    const adminFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && url.includes('/sws/neo/windowaccessmap')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            windowAccess: new Proxy({}, { get: () => 'full' }),
            capabilities: { showAccountingFields: false, isAdminOrClientAdmin: false },
          }),
        });
      }
      return adminFetch(input, init);
    };
  });
}

async function openMonitor(page) {
  await page.goto('/acct-process-monitor');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('AcctProcessMonitorPage__content')).toBeVisible();
}

test.describe('Accounting process monitor — page', () => {
  let requests;

  test.beforeEach(async ({ page }) => {
    // login()'s default stub already grants isAdminOrClientAdmin via its full-access Proxy.
    await login(page);
    requests = await installMonitorMock(page);
  });

  test('renders the status card and the run history', async ({ page }) => {
    await openMonitor(page);

    await expect(page.getByTestId('AcctProcessMonitorPage__statusCard')).toBeVisible();
    await expect(page.getByTestId('AcctProcessMonitorPage__lastStatus')).toBeVisible();
    await expect(page.getByTestId('AcctProcessMonitorPage__nextRun')).toBeVisible();
    await expect(page.getByTestId('AcctProcessMonitorPage__historyTable')).toBeVisible();
    for (const run of EXISTING_RUNS) {
      await expect(page.getByTestId(`AcctProcessMonitorPage__row-${run.id}`)).toBeVisible();
    }
  });

  test('the initial read never carries Action, so loading the page cannot fire the process', async ({ page }) => {
    await openMonitor(page);

    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      expect(url).not.toContain('Action');
    }
  });

  test('shows each status as a human label, never the raw three-letter code', async ({ page }) => {
    await openMonitor(page);

    const row = page.getByTestId('AcctProcessMonitorPage__row-e2e-run-1');
    const pill = row.locator('[data-status="SUC"]');
    await expect(pill).toBeVisible();
    await expect(pill).not.toHaveText('SUC');
    await expect(pill).toHaveAttribute('data-tone', 'success');
  });

  test('Run now sends Action=trigger and the freshly created run appears in the history', async ({ page }) => {
    await openMonitor(page);
    await expect(page.getByTestId(`AcctProcessMonitorPage__row-${TRIGGERED_RUN.id}`)).toHaveCount(0);

    const triggerRequest = page.waitForRequest(
      (r) => r.url().includes('/sws/neo/acctprocessmonitor') && r.url().includes('Action=trigger'),
    );
    await page.getByTestId('AcctProcessMonitorPage__runNow').click();
    await triggerRequest;

    await expect(page.getByTestId('AcctProcessMonitorPage__triggerOutcome')).toBeVisible();
    await expect(page.getByTestId('AcctProcessMonitorPage__triggerOutcome'))
      .toHaveAttribute('data-reason', 'started');
    await expect(page.getByTestId(`AcctProcessMonitorPage__row-${TRIGGERED_RUN.id}`)).toBeVisible();
  });

  test('Run now locks itself while the backend reports the run in progress', async ({ page }) => {
    await openMonitor(page);

    await page.getByTestId('AcctProcessMonitorPage__runNow').click();

    // The post-trigger payload carries running:true, which is what keeps a second click from
    // stacking a duplicate one-shot request.
    await expect(page.getByTestId('AcctProcessMonitorPage__running')).toBeVisible();
    await expect(page.getByTestId('AcctProcessMonitorPage__runNow')).toBeDisabled();
  });

  test('a refusal is shown as a message, not as a started run', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await login(page);
    await installMonitorMock(page, {
      triggered: { started: false, reason: 'systemClientNotScopable' },
    });
    await openMonitor(page);

    await page.getByTestId('AcctProcessMonitorPage__runNow').click();

    const outcome = page.getByTestId('AcctProcessMonitorPage__triggerOutcome');
    await expect(outcome).toBeVisible();
    await expect(outcome).toHaveAttribute('data-reason', 'systemClientNotScopable');
  });

  test('never renders the raw process log, before or after a trigger', async ({ page }) => {
    await openMonitor(page);
    await expect(page.locator('body')).not.toContainText(LOG_SENTINEL);

    await page.getByTestId('AcctProcessMonitorPage__runNow').click();
    await expect(page.getByTestId(`AcctProcessMonitorPage__row-${TRIGGERED_RUN.id}`)).toBeVisible();

    await expect(page.locator('body')).not.toContainText(LOG_SENTINEL);
    // No log column, and no per-row drill-down that could reveal one.
    await expect(page.locator('[data-testid*="log" i]')).toHaveCount(0);
    await expect(page.locator('tbody tr button')).toHaveCount(0);
  });

  test('a denial from the backend renders the no-access state, not a crash', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await login(page);
    await page.route('**/sws/neo/acctprocessmonitor**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ error: true, reason: 'notAuthorized', message: 'Not authorized' }),
    }));

    await page.goto('/acct-process-monitor');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('AcctProcessMonitorPage__noAccess')).toBeVisible();
    await expect(page.getByTestId('AcctProcessMonitorPage__runNow')).toHaveCount(0);
  });
});

test.describe('Accounting process monitor — menu gating', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMonitorMock(page);
  });

  test('flag on: an admin sees the menu entry and it opens the page', async ({ page }) => {
    test.skip(!FLAG_ON, 'Requires a dev server started with VITE_FEATURE_FLAGS acct-process-monitor:true');

    // The Settings group holds several items, so in the collapsed sidebar it renders as a hover
    // popover rather than a direct link — same shape as roles-overview.mocked.spec.js.
    await page.getByRole('button', { name: /configuraci[oó]n|settings/i }).hover();

    const entry = page.getByTestId('menu-item-acct-process-monitor');
    await expect(entry).toBeVisible();

    await entry.click();
    await expect(page).toHaveURL(/\/acct-process-monitor$/);
    await expect(page.getByTestId('AcctProcessMonitorPage')).toBeVisible();
  });

  test('flag off: the menu entry is not offered', async ({ page }) => {
    test.skip(FLAG_ON, 'Requires a dev server started without VITE_FEATURE_FLAGS');

    await page.getByRole('button', { name: /configuraci[oó]n|settings/i }).hover();
    await expect(page.getByTestId('menu-item-acct-process-monitor')).toHaveCount(0);
  });

  test('flag off: the route still works — the flag is not the authorization boundary', async ({ page }) => {
    test.skip(FLAG_ON, 'Requires a dev server started without VITE_FEATURE_FLAGS');

    // Deliberate: the route is registered unconditionally and the backend enforces admin access.
    // If this ever starts 404ing, the gating moved to the wrong layer.
    await openMonitor(page);
    await expect(page.getByTestId('AcctProcessMonitorPage__statusCard')).toBeVisible();
  });
});

test.describe('Accounting process monitor — non-admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installNonAdminCapabilities(page);
    await installMonitorMock(page);
    // Re-navigate so both addInitScripts re-run in registration order.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('does NOT see the menu entry, whatever the flag says', async ({ page }) => {
    await page.getByRole('button', { name: /configuraci[oó]n|settings/i }).hover();
    await expect(page.getByTestId('menu-item-acct-process-monitor')).toHaveCount(0);
  });
});
