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
 *   2. **Trigger → convergence.** The triggering response canNOT contain the new run: the
 *      backend hands the job to Quartz and returns, and the AD_PROCESS_RUN row is written later
 *      on the scheduler's own thread. The page must therefore POLL until the run appears. The
 *      mock models exactly that, so the spec fails if the poll regresses.
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
  // Whether a manual run has been triggered yet. The mock is STATEFUL because the real backend is
  // asynchronous, and a stateless mock can only fake one of the two instants.
  let triggeredAt = null;

  await page.route('**/sws/neo/acctprocessmonitor**', async (route) => {
    const url = route.request().url();
    requests.push(url);

    if (url.includes('Action=trigger')) {
      const outcome = triggered ?? { started: true, reason: 'started' };
      if (outcome.started) triggeredAt = Date.now();
      // WHAT THE REAL BACKEND RETURNS, which is NOT what this mock used to claim:
      //   running: FALSE — triggerManualRun refuses outright when a run is already in progress,
      //     so a SUCCESSFUL trigger response necessarily reports nothing running; and
      //   history WITHOUT the new run — ProcessMonitor writes the AD_PROCESS_RUN row on the
      //     scheduler's thread, so the response that carries `started: true` predates the row.
      // The previous fixture returned running:true and the new run already present. Both were
      // fiction, and asserting them hid a real bug: the hook keyed its poll off `running`, so
      // nothing ever appeared without a manual refresh. Do not "simplify" this back.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(statusPayload(EXISTING_RUNS, {
          running: false,
          triggered: outcome,
        })),
      });
      return;
    }

    // A plain read. Once a run has been triggered, it becomes observable — as it does in reality,
    // a moment later — so only a client that POLLS after the trigger ever sees it.
    const runs = triggeredAt ? [TRIGGERED_RUN, ...EXISTING_RUNS] : EXISTING_RUNS;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(statusPayload(runs, {
        running: Boolean(triggeredAt),
        ...readOverrides,
      })),
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

    // Per-row testid since the codemod-collapsed ids were fixed — no CSS attribute selector.
    const pill = page.getByTestId('AcctProcessMonitorPage__statusPill-e2e-run-1');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-status', 'SUC');
    await expect(pill).not.toHaveText('SUC');
    await expect(pill).toHaveAttribute('data-tone', 'success');

    const failed = page.getByTestId('AcctProcessMonitorPage__statusPill-e2e-run-2');
    await expect(failed).toHaveAttribute('data-status', 'ERR');
    await expect(failed).not.toHaveText('ERR');
  });

  test('Run now converges on the new run by polling, with no manual refresh', async ({ page }) => {
    await openMonitor(page);
    await expect(page.getByTestId(`AcctProcessMonitorPage__row-${TRIGGERED_RUN.id}`)).toHaveCount(0);

    const triggerRequest = page.waitForRequest(
      (r) => r.url().includes('/sws/neo/acctprocessmonitor') && r.url().includes('Action=trigger'),
    );
    await page.getByTestId('AcctProcessMonitorPage__runNow').click();
    await triggerRequest;

    await expect(page.getByTestId('AcctProcessMonitorPage__triggerOutcome'))
      .toHaveAttribute('data-reason', 'started');

    // The triggering response itself does NOT contain the new run — the mock reflects the real
    // backend, where the AD_PROCESS_RUN row is written asynchronously after the response. The row
    // can only arrive via the poll the successful trigger starts. THIS is the assertion that
    // fails if the poll regresses to being keyed off `running` alone, which is exactly the bug
    // the old always-true fixture concealed. Timeout exceeds one 5s poll interval.
    await expect(page.getByTestId(`AcctProcessMonitorPage__row-${TRIGGERED_RUN.id}`))
      .toBeVisible({ timeout: 20_000 });
  });

  test('Run now stays disabled across the gap before the run is observable', async ({ page }) => {
    await openMonitor(page);
    await page.getByTestId('AcctProcessMonitorPage__runNow').click();

    // Immediately after the trigger the backend reports running:false and no new run, so nothing
    // in the payload says "busy". The button must still be locked — otherwise a second click
    // stacks a duplicate one-shot request in precisely the window where it is easiest to do.
    await expect(page.getByTestId('AcctProcessMonitorPage__runNow')).toBeDisabled();
    await expect(page.getByTestId('AcctProcessMonitorPage__running')).toBeVisible();
  });

  test('Run now stays locked once the backend reports the run in progress', async ({ page }) => {
    await openMonitor(page);

    await page.getByTestId('AcctProcessMonitorPage__runNow').click();

    // Once the poll observes the run, the backend reports running:true and the lock is held by
    // that rather than by the post-trigger grace window.
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
    // Wait for the run to arrive VIA THE POLL — the triggering response does not carry it (see
    // installMonitorMock). Without this the assertion below would pass trivially, by checking a
    // page that had not yet rendered the new row at all.
    await expect(page.getByTestId(`AcctProcessMonitorPage__row-${TRIGGERED_RUN.id}`))
      .toBeVisible({ timeout: 20_000 });

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
