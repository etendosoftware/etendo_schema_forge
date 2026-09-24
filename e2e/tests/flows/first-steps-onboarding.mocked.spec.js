import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-5190 — post-signup First Steps onboarding window (mocked).
 *
 * Covers the browser half of the feature end to end:
 *   1. the page itself — landing at 1/7 when the backend has not exposed transfer, one row open
 *      at a time (but any row openable, in any order), checking off the six writable steps, and
 *      7/7;
 *   2. the dashboard gate — a never-seen account is bounced to /first-steps exactly once,
 *      and an already-seen (or unreadable) state is not bounced at all;
 *   3. ETP-5364 — "Finalizar configuración inicial" at full completion removes the sidebar entry, the
 *      removal survives a reload (it is persisted, not local), Inicio stays reachable
 *      throughout, and the page still offers the way back.
 *
 * There is deliberately NO integration counterpart: the backend half of the endpoint does
 * not compile yet (it needs an entity regeneration), so both endpoints are route-mocked
 * with a per-page in-memory store that behaves like the real one — GET returns the current
 * object, POST replaces it wholesale.
 *
 * Mock mode only. The mock is installed AFTER login() because Playwright matches routes in
 * reverse registration order: login() already stubs this endpoint with a fixed "already
 * seen" state (so every other mocked spec reaches the dashboard instead of being bounced
 * here), and this spec is the one that needs to override it with a real, mutable store.
 */

const STEP_IDS = ['create-account', 'company-data', 'fiscal-config', 'products', 'contacts',
  'invoice-sequence', 'team'];
const TOGGLEABLE = ['company-data', 'fiscal-config', 'products', 'contacts',
  'invoice-sequence', 'team'];
const ALWAYS_DONE = ['create-account'];

/**
 * Installs the first-steps endpoint backed by a live in-memory state.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object|null} [initial] the stored `firstSteps` object, or `null` for a never-saved account
 */
async function installFirstStepsMock(page, initial = null, transferStatus = null) {
  const state = { value: initial };
  const transfer = { status: transferStatus, products: {}, contacts: {} };
  /** every POSTed `firstSteps` body, in order */
  const writes = [];

  await page.route('**/sws/go/onboarding/first-steps**', async (route) => {
    const req = route.request();
    const json = (body) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(body),
    });

    if (req.method() === 'GET') {
      await json({ status: 'success', firstSteps: state.value });
      return;
    }
    if (req.method() === 'POST') {
      const sent = JSON.parse(req.postData() || '{}').firstSteps;
      writes.push(sent);
      state.value = sent;
      await json({ status: 'success' });
      return;
    }
    await route.fallback();
  });

  if (transferStatus !== null) {
    await page.route('**/sws/go/demo-data-transfer', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(transfer),
    }));
  }

  return { writes, state, transfer };
}

/**
 * Keep baseline checklist tests on the flag-off contract. `login()` installs a broad
 * successful `/sws/**` fallback; without this explicit 404, the newly added
 * `/sws/go/demo-data-transfer` endpoint appears enabled and inserts the productive-only
 * transfer row. The real backend uses 404 to mean the `demo-data-transfer` flag is off.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installDemoDataTransferDisabledMock(page) {
  await page.route('**/sws/go/demo-data-transfer', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'error' }),
  }));
}

const progress = (page) => page.getByTestId('first-steps-progress');

/**
 * Opens the sidebar, which starts COLLAPSED.
 *
 * Collapsed, `SideMenu` renders group icons only: the `menu-item-*` links live in a Radix
 * popover that mounts on hover, and the `x/8` badge is replaced by a different element
 * (`menu-first-steps-progress-collapsed`, just the outstanding count — `3/7` does not fit in a
 * 40px tile). So neither `menu-first-steps-progress` nor `menu-item-first-steps` is in the DOM
 * until this runs. Same helper as `window-visibility-etp4249.mocked.spec.js`, kept local for
 * the same reason it is there: it is two lines and anchoring it on the translated aria-label
 * is the only stable handle.
 */
async function expandSidebar(page) {
  const expandBtn = page.getByRole('button', { name: /Expand menu|Expandir menú/i });
  if (await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expandBtn.click();
    // The width transition is 200ms; the items are only hit-testable once it settles.
    await page.waitForTimeout(400);
  }
}

/**
 * Until the locale slice resolves, `ui()` returns the raw key, so any copy read before that
 * point is `firstStepsPrepareAccount` rather than the translated string. Anchoring on the
 * key prefix keeps this locale-agnostic.
 */
async function waitForCopyTranslated(page) {
  await expect(page.getByTestId('first-steps-heading')).not.toHaveText(/^firstSteps/);
}

/**
 * login(), then install this spec's endpoint mock on top of it.
 *
 * Registering AFTER login() is what makes this spec's state win: login() stubs the same
 * endpoint with a fixed "already seen" answer (so every OTHER mocked spec reaches the
 * dashboard), and Playwright matches routes in reverse registration order. This is the
 * documented override hook — a spec that needs an unseen account provides its own route.
 */
async function setupFirstSteps(page, initial = null, transferStatus = null) {
  await login(page);
  await installDemoDataTransferDisabledMock(page);
  // Transfer-enabled coverage opts in; all baseline checklist tests retain the flag-off 404.
  const mock = await installFirstStepsMock(page, initial, transferStatus);
  return mock;
}

/**
 * Checks off one step by clicking its row's label — the `<input type="checkbox">` itself is
 * `sr-only` and sits under its own decorative box, so the label is the control a real user
 * actually hits (and clicking it also proves the label/input association is intact).
 */
async function completeStep(page, id) {
  const row = page.getByTestId(`first-steps-step-${id}`);
  await expect(row.getByTestId(`first-steps-toggle-${id}`)).toBeVisible();
  // Scoped to the label that OWNS the toggle, so a row that grows another labelled control
  // later does not make `row.locator('label')` ambiguous.
  await row.locator(`label:has([data-testid="first-steps-toggle-${id}"])`).click();
  await expect(row.getByTestId(`first-steps-done-${id}`)).toBeVisible();
}

test.describe('First Steps page — completion run', () => {
  /** @type {Awaited<ReturnType<typeof installFirstStepsMock>>} */
  let mock;

  test.beforeEach(async ({ page }) => {
    mock = await setupFirstSteps(page, null);
    await page.goto('/first-steps');
    await expect(page.getByTestId('first-steps-page')).toBeVisible();
    await waitForCopyTranslated(page);
  });

  test('lands at 1/7 when the backend does not expose the transfer row', async ({ page }) => {
    await expect(progress(page)).toContainText('1/7');

    for (const id of STEP_IDS) {
      await expect(page.getByTestId(`first-steps-step-${id}`)).toBeVisible();
    }
    for (const id of ALWAYS_DONE) {
      await expect(page.getByTestId(`first-steps-done-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('first-steps-step-demo-data-transfer')).toHaveCount(0);
    for (const id of TOGGLEABLE) {
      await expect(page.getByTestId(`first-steps-done-${id}`)).toHaveCount(0);
    }
    // The empty status circle is the expanded row's alone; the collapsed pending rows below
    // it show only their time estimate (see the design).
    await expect(page.getByTestId(`first-steps-pending-${TOGGLEABLE[0]}`)).toBeVisible();
  });

  test('offers no way to change an always-done step', async ({ page }) => {
    for (const id of ALWAYS_DONE) {
      await expect(page.getByTestId(`first-steps-configure-${id}`)).toHaveCount(0);
      await expect(page.getByTestId(`first-steps-toggle-${id}`)).toHaveCount(0);
    }
  });

  test('opens exactly one row by default, the first incomplete writable step', async ({ page }) => {
    await expect(page.getByTestId('first-steps-toggle-company-data')).toBeVisible();
    await expect(page.getByTestId('first-steps-configure-company-data')).toBeVisible();
    for (const id of TOGGLEABLE.slice(1)) {
      await expect(page.getByTestId(`first-steps-toggle-${id}`)).toHaveCount(0);
    }
  });

  test('lets any row be opened and completed without doing the ones above it', async ({ page }) => {
    // REGRESSION GUARD. The checklist is not a wizard: `team` must be completable while
    // `company-data` is still untouched.
    await page.getByTestId('first-steps-title-team').click();
    await expect(page.getByTestId('first-steps-toggle-company-data')).toHaveCount(0);
    await completeStep(page, 'team');

    await expect(progress(page)).toContainText('2/7');
    await expect(page.getByTestId('first-steps-done-company-data')).toHaveCount(0);
  });

  test('runs the product import in place instead of leaving for the list view', async ({ page }) => {
    await page.getByTestId('first-steps-title-products').click();
    await expect(page.getByTestId('first-steps-import-products')).toBeVisible();
    await expect(page.getByTestId('first-steps-configure-products')).toHaveCount(0);

    await page.getByTestId('first-steps-import-products').click();
    // The dialog opens over the checklist — the URL must not change.
    await expect(page).toHaveURL(/\/first-steps/);
  });

  test('sends the numbering step to the Document Sequence window', async ({ page }) => {
    // The prefix and starting number used to be edited inline on this row. They now live in a
    // real window, so this step is an ordinary Configure that navigates away.
    await page.getByTestId('first-steps-title-invoice-sequence').click();
    await page.getByTestId('first-steps-configure-invoice-sequence').click();
    await expect(page).toHaveURL(/\/document-sequence/);
  });

  test('sends the fiscal step to the Fiscal Configuration window', async ({ page }) => {
    await page.getByTestId('first-steps-title-fiscal-config').click();
    // ETP-5364: the row asks whether the tenant reports to a SIF at all before it offers the
    // window. "Yes" is what puts the Configure button on screen.
    await page.getByTestId('first-steps-gate-yes-fiscal-config').click();
    await page.getByTestId('first-steps-configure-fiscal-config').click();
    await expect(page).toHaveURL(/\/fiscal-config/);
  });

  test('completes the fiscal step outright when the tenant reports to no SIF', async ({ page }) => {
    // ETP-5364 — "No" is not a dismissal: a tenant that reports to no invoicing system has
    // nothing to configure, so the answer IS the completed state and it persists like any
    // other tick.
    await page.getByTestId('first-steps-title-fiscal-config').click();
    await expect(page.getByTestId('first-steps-gate-fiscal-config')).toBeVisible();
    await expect(page.getByTestId('first-steps-configure-fiscal-config')).toHaveCount(0);

    await page.getByTestId('first-steps-gate-no-fiscal-config').click();

    await expect(page.getByTestId('first-steps-done-fiscal-config')).toBeVisible();
    await expect(progress(page)).toContainText('2/7');
    await expect(page.getByTestId('first-steps-gate-fiscal-config')).toHaveCount(0);
    expect(mock.writes.at(-1).completed).toContain('fiscal-config');
  });

  test('asks the fiscal question again after the step is unticked', async ({ page }) => {
    // The answer is deliberately not persisted — only the step's completed flag is. Unticking
    // is therefore the escape hatch for someone who answered wrongly.
    await page.getByTestId('first-steps-title-fiscal-config').click();
    await page.getByTestId('first-steps-gate-no-fiscal-config').click();
    await expect(page.getByTestId('first-steps-done-fiscal-config')).toBeVisible();

    const row = page.getByTestId('first-steps-step-fiscal-config');
    await row.locator('label:has([data-testid="first-steps-toggle-fiscal-config"])').click();

    await expect(page.getByTestId('first-steps-gate-fiscal-config')).toBeVisible();
    await expect(page.getByTestId('first-steps-configure-fiscal-config')).toHaveCount(0);
  });

  test('locks a completed step controls, and unlocks them when it is unticked', async ({ page }) => {
    // Ticking a step is what stops an already-run import from being run again by a stray click.
    await page.getByTestId('first-steps-title-products').click();
    await expect(page.getByTestId('first-steps-import-products')).toBeEnabled();

    // No second click on the title here: the row is still open (completeStep ticks the
    // checkbox INSIDE the expanded row) and the title is a disclosure toggle, so clicking it
    // again would collapse the row and take the import button out of the DOM entirely.
    await completeStep(page, 'products');
    await expect(page.getByTestId('first-steps-import-products')).toBeDisabled();

    // Fully reversible — the checkbox is the switch, not a one-way door.
    await page.locator('label:has([data-testid="first-steps-toggle-products"])').click();
    await expect(page.getByTestId('first-steps-import-products')).toBeEnabled();
  });

  test('keeps company data reachable once ticked, unlike every other step', async ({ page }) => {
    await completeStep(page, 'company-data');
    await page.getByTestId('first-steps-title-company-data').click();
    await expect(page.getByTestId('first-steps-configure-company-data')).toBeEnabled();
  });

  test('walks 1/7 -> 7/7 as writable steps are checked off, one row open at a time', async ({ page }) => {
    const expected = [
      { done: 'company-data', progress: '2/7', next: 'fiscal-config' },
      { done: 'fiscal-config', progress: '3/7', next: 'products' },
      { done: 'products', progress: '4/7', next: 'contacts' },
      { done: 'contacts', progress: '5/7', next: 'invoice-sequence' },
      { done: 'invoice-sequence', progress: '6/7', next: 'team' },
      { done: 'team', progress: '7/7', next: null },
    ];

    for (const step of expected) {
      await completeStep(page, step.done);
      await expect(progress(page)).toContainText(step.progress);
      // The row just completed collapses, and only the next one opens.
      await expect(page.getByTestId(`first-steps-toggle-${step.done}`)).toHaveCount(0);
      if (step.next) {
        await expect(page.getByTestId(`first-steps-toggle-${step.next}`)).toBeVisible();
      }
    }

    // Every writable step reads as done and no row is left expanded.
    for (const id of TOGGLEABLE) {
      await expect(page.getByTestId(`first-steps-done-${id}`)).toBeVisible();
      await expect(page.getByTestId(`first-steps-toggle-${id}`)).toHaveCount(0);
    }
  });

  test('persists only the six writable ids, and the final state is the full set', async ({ page }) => {
    for (const id of TOGGLEABLE) await completeStep(page, id);
    await expect(progress(page)).toContainText('7/7');

    expect(mock.writes.length).toBe(TOGGLEABLE.length);
    for (const body of mock.writes) {
      for (const id of ALWAYS_DONE) {
        expect(body.completed, JSON.stringify(body)).not.toContain(id);
      }
      expect(body.completed, JSON.stringify(body)).not.toContain('demo-data-transfer');
    }
    expect(mock.writes.at(-1).completed.slice().sort()).toEqual(TOGGLEABLE.slice().sort());
  });

  test('reaches the all-set state: copy swaps and "Create invoice" appears only at 7/7', async ({ page }) => {
    const heading = page.getByTestId('first-steps-heading');
    const subtitle = page.getByTestId('first-steps-subtitle');

    const initialHeading = (await heading.textContent())?.trim();
    const initialSubtitle = (await subtitle.textContent())?.trim();
    await expect(page.getByTestId('first-steps-create-invoice')).toHaveCount(0);

    for (const id of TOGGLEABLE.slice(0, -1)) await completeStep(page, id);
    // Still not all set at 6/7 — the button must not appear early and the copy must not swap.
    await expect(progress(page)).toContainText('6/7');
    await expect(page.getByTestId('first-steps-create-invoice')).toHaveCount(0);
    expect((await heading.textContent())?.trim()).toBe(initialHeading);

    await completeStep(page, 'team');
    await expect(progress(page)).toContainText('7/7');

    // Locale-agnostic: assert the copy CHANGED rather than pinning a translated string.
    await expect(page.getByTestId('first-steps-create-invoice')).toBeVisible();
    expect((await heading.textContent())?.trim()).not.toBe(initialHeading);
    expect((await subtitle.textContent())?.trim()).not.toBe(initialSubtitle);
  });

  test('"Create invoice" navigates to the new sales invoice form', async ({ page }) => {
    for (const id of TOGGLEABLE) await completeStep(page, id);
    await page.getByTestId('first-steps-create-invoice').click();
    await expect(page).toHaveURL(/\/sales-invoice\/new/);
  });

  test('a checked step survives a reload, because it was persisted server-side', async ({ page }) => {
    await completeStep(page, 'company-data');
    await expect(progress(page)).toContainText('2/7');

    await page.reload();
    await expect(page.getByTestId('first-steps-page')).toBeVisible();
    await expect(progress(page)).toContainText('2/7');
    await expect(page.getByTestId('first-steps-done-company-data')).toBeVisible();
    // The default expansion follows the persisted state, not the page load order: with
    // company-data ticked, findExpandedStepId() opens the next incomplete row, which is
    // fiscal-config. The toggle only exists inside an expanded row, so its presence IS the
    // assertion that the right row opened.
    await expect(page.getByTestId('first-steps-toggle-fiscal-config')).toBeVisible();
  });

  test('Configure on the expanded row opens that step target window', async ({ page }) => {
    await page.getByTestId('first-steps-configure-company-data').click();
    await expect(page).toHaveURL(/\/organization/);
  });

  test('mirrors the progress on the sidebar entry, live', async ({ page }) => {
    // The badge and the page read one shared state, so ticking a step here must move the
    // sidebar count in the same commit — no reload. Before that was shared they disagreed.
    await expandSidebar(page);
    const badge = page.getByTestId('menu-first-steps-progress');
    await expect(badge).toHaveText('1/7');

    await completeStep(page, 'company-data');
    await expect(badge).toHaveText('2/7');
  });

  test('never hides the sidebar entry, not even at 7/7', async ({ page }) => {
    // The acceptance criterion, stated as a test: at 7/7 this link is the only way back in to
    // un-tick a step, so it must survive completion.
    for (const id of TOGGLEABLE) await completeStep(page, id);
    await expect(progress(page)).toContainText('7/7');
    await expandSidebar(page);
    await expect(page.getByTestId('menu-first-steps-progress')).toHaveText('7/7');
    await expect(page.getByTestId('menu-item-first-steps')).toBeVisible();
  });
});

test.describe('First Steps transfer and plan gates', () => {
  test('the server controls transfer completion and the final action', async ({ page }) => {
    const mock = await setupFirstSteps(page,
      { v: 1, seen: true, dismissed: false, completed: TOGGLEABLE }, 'RUNNING');
    await page.goto('/first-steps');
    await expect(progress(page)).toContainText('7/8');
    await expect(page.getByTestId('first-steps-done-demo-data-transfer')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-data-transfer-progress')).toBeVisible();
    await expect(page.getByTestId('first-steps-toggle-demo-data-transfer')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-finish-setup')).toHaveCount(0);
    expect(mock.writes).toHaveLength(0);

    mock.transfer.status = 'COMPLETED';
    await page.reload();
    await expect(progress(page)).toContainText('8/8');
    await expect(page.getByTestId('first-steps-done-demo-data-transfer')).toBeVisible();
    await expect(page.getByTestId('first-steps-finish-setup')).toBeVisible();
    expect(mock.writes).toHaveLength(0);
  });

  test('a trial sees five steps and no transfer row', async ({ page }) => {
    await setupFirstSteps(page);
    await page.route('**/sws/go/environments', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ environments: [{
        clientId: 'e2e-mock-client', clientName: 'Trial', plan: 'free',
      }] }),
    }));
    await page.goto('/first-steps');
    await expect(progress(page)).toContainText('1/5');
    await expect(page.getByTestId('first-steps-step-demo-data-transfer')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-step-fiscal-config')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-step-invoice-sequence')).toHaveCount(0);
  });
});

test.describe('First Steps page — degraded backend', () => {
  test('still renders the list when the state cannot be read', async ({ page }) => {
    await login(page);
    await installDemoDataTransferDisabledMock(page);
    await page.route('**/sws/go/onboarding/first-steps**', (route) => route.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ status: 'error' }),
    }));
    await page.goto('/first-steps');

    // Degrades to no user-completed steps; only account creation counts as completed.
    await expect(page.getByTestId('first-steps-page')).toBeVisible();
    await expect(progress(page)).toContainText('1/7');
    for (const id of STEP_IDS) {
      await expect(page.getByTestId(`first-steps-step-${id}`)).toBeVisible();
    }
  });
});

test.describe('Dashboard gate — the one-time redirect', () => {
  test('bounces a never-seen account to /first-steps and records the visit once', async ({ page }) => {
    const mock = await setupFirstSteps(page, null);

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/first-steps/);
    await expect(page.getByTestId('first-steps-page')).toBeVisible();

    await expect.poll(() => mock.writes.length).toBe(1);
    expect(mock.writes[0].seen).toBe(true);
  });

  test('does not bounce again on the next dashboard visit', async ({ page }) => {
    const mock = await setupFirstSteps(page, null);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/first-steps/);
    await expect.poll(() => mock.writes.length).toBe(1);

    // The visit is now recorded server-side, so the next visit stays put.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('first-steps-page')).toHaveCount(0);

    // Exactly once, ever — no second POST.
    expect(mock.writes.length).toBe(1);
  });

  test('leaves an already-seen account on the dashboard and writes nothing', async ({ page }) => {
    const mock = await setupFirstSteps(page, { v: 1, seen: true, completed: [] });

    await page.goto('/dashboard');
    await page.waitForTimeout(1_500);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('first-steps-page')).toHaveCount(0);
    expect(mock.writes.length).toBe(0);
  });

  test('does not bounce when the state cannot be read — `seen` is unknown, not false', async ({ page }) => {
    await login(page);
    await installDemoDataTransferDisabledMock(page);
    const counter = { posts: 0 };
    await page.route('**/sws/go/onboarding/first-steps**', (route) => {
      if (route.request().method() === 'POST') counter.posts += 1;
      return route.fulfill({
        status: 500, contentType: 'application/json', body: JSON.stringify({ status: 'error' }),
      });
    });

    await page.goto('/dashboard');
    await page.waitForTimeout(1_500);

    // Assuming "not seen" here would bounce a user who had already dismissed the page.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('first-steps-page')).toHaveCount(0);
    expect(counter.posts).toBe(0);
  });
});

test.describe('Finalizar configuración inicial — ETP-5364', () => {
  test('is offered only at 7/7, and removes the sidebar entry when pressed', async ({ page }) => {
    const mock = await setupFirstSteps(page, null);
    await page.goto('/first-steps');
    await waitForCopyTranslated(page);

    // Below 7/7 the button does not exist: closing the checklist is the end of the run, not
    // an escape hatch from it.
    await expect(page.getByTestId('first-steps-finish-setup')).toHaveCount(0);

    for (const id of TOGGLEABLE) await completeStep(page, id);
    await expect(progress(page)).toContainText('7/7');

    // Still there at 7/7 — completing the list does NOT dismiss on its own.
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-first-steps')).toBeVisible();

    await page.getByTestId('first-steps-finish-setup').click();

    await expect(page.getByTestId('menu-item-first-steps')).toHaveCount(0);
    // And it is a real write, not a local flag.
    await expect.poll(() => mock.state.value?.dismissed).toBe(true);
    // The rest of the state rides along — a POST carrying only `dismissed` would wipe it.
    expect(mock.state.value.completed).toEqual(
      expect.arrayContaining(TOGGLEABLE.filter((id) => !ALWAYS_DONE.includes(id))),
    );
  });

  test('stays hidden after a reload, because the state is on the account', async ({ page }) => {
    await setupFirstSteps(page, { v: 1, seen: true, dismissed: true, completed: TOGGLEABLE });

    await page.goto('/dashboard');
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-first-steps')).toHaveCount(0);
  });

  // The ticket's other acceptance criterion: the dashboard must never become unreachable
  // because of the First Steps state, in either direction. Two tests rather than one, because
  // `setupFirstSteps` logs in — calling it twice in a single test would re-run login().
  test('keeps Inicio reachable mid-checklist', async ({ page }) => {
    await setupFirstSteps(page, { v: 1, seen: true, completed: ['company-data'] });
    await page.goto('/first-steps');
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-first-steps')).toBeVisible();
    await page.getByTestId('menu-item-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('keeps Inicio reachable once the checklist is dismissed', async ({ page }) => {
    await setupFirstSteps(page, { v: 1, seen: true, dismissed: true, completed: TOGGLEABLE });
    await page.goto('/first-steps');
    await expandSidebar(page);
    // The checklist entry is gone; Inicio is a different menu.json group and is not.
    await expect(page.getByTestId('menu-item-first-steps')).toHaveCount(0);
    await page.getByTestId('menu-item-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('does not bounce a dismissed account that never spent the redirect', async ({ page }) => {
    // `seen: false` + `dismissed: true` is the real shape for a user who opened /first-steps
    // from the sidebar and closed it there. Without the gate's extra clause the very next
    // dashboard visit would drag them back onto the page they just put away.
    const mock = await setupFirstSteps(page,
      { v: 1, seen: false, dismissed: true, completed: TOGGLEABLE });

    await page.goto('/dashboard');
    await page.waitForTimeout(1_500);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('first-steps-page')).toHaveCount(0);
    expect(mock.writes.length).toBe(0);
  });

  test('brings the entry back from the page, which stays routable', async ({ page }) => {
    // Hiding a menu entry with no way back is a trap. The page is still reachable by URL and
    // carries the undo.
    const mock = await setupFirstSteps(page,
      { v: 1, seen: true, dismissed: true, completed: TOGGLEABLE });

    await page.goto('/first-steps');
    await expect(page.getByTestId('first-steps-dismissed-notice')).toBeVisible();
    await expect(page.getByTestId('first-steps-finish-setup')).toHaveCount(0);

    await page.getByTestId('first-steps-reopen').click();

    await expect.poll(() => mock.state.value?.dismissed).toBe(false);
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-first-steps')).toBeVisible();
  });
});
