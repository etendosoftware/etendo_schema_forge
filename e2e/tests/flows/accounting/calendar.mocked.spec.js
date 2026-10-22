// @covers tools/app-shell/src/windows/custom/calendar/YearTableWithCloseStatus.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Calendar window — smoke (mocked).
 *
 * Validates ETP-4478's unified Calendar window: the Finance menu shows only
 * "Calendar" (Fiscal Calendar / Periods retired), the Accounting + Periods
 * secondary tabs render on a year detail, Abrir/Cerrar Periodo hits the
 * mocked action endpoint (global to the whole period, not per document type
 * — that per-document-type breakdown was removed in ETP-4948), and Cerrar
 * Año stays disabled until every period is Closed/Permanently Closed.
 *
 * Mock mode only: installs window-specific routes on top of the generic
 * /sws/** mock that login() seeds, so it does not need a backend.
 *
 * Backend topology (ETP-4478 rework — the `calendar` custom window has no
 * backing NEO spec of its own; it aggregates three separate single-window
 * specs, since `schema_forge_core`'s populate/push mechanism assumes 1 spec =
 * 1 AD window — see GH #35 / ETP-4481):
 * - `fiscal-calendar` — `year` (list/detail) + closeYear/undoCloseYear actions
 * - `open-close-period-control` — `periodControl` (Periods tab)
 * - `end-year-close` — `accounting` (Accounting tab)
 * `tools/app-shell/src/windows/custom/calendar/index.jsx` rewrites the
 * calendar-route `apiBaseUrl` to each of these per panel.
 *
 * Envelope shapes (confirmed by reading the real handlers, not assumed):
 * - `fiscal-calendar/year` list+detail goes through the standard entity CRUD
 *   path (NeoCrudHandler), which wraps as `{ response: { data: ... } }` —
 *   same shape as row-quick-actions.mocked.spec.js's reference pattern.
 * - `open-close-period-control/periodControl` is read by
 *   PeriodsExpandablePanel.jsx via `body?.response?.data` (it matches
 *   useEntity.js's fallback so a genuinely flat array still works too) —
 *   so this mock must wrap rows as `{ response: { data: [...] } }`.
 * - `end-year-close/accounting` is the one endpoint read as a flat
 *   `{ data: [...] }` body, via AccountingPanel.jsx's own `body.data` read.
 */

const YEAR_ROW = { id: 'year-001', fiscalYear: '2027', description: 'FY2027', 'calendar$_identifier': 'Standard Calendar' };

const PERIOD_OPEN = { id: 'period-001', name: 'Jan-2027', status: 'O', periodNo: 1 };
const PERIOD_CLOSED = { id: 'period-002', name: 'Feb-2027', status: 'C', periodNo: 2 };
const ACCOUNTING_ROW = { id: 'fact-001', account: '20000000', debit: '100.00', credit: '0.00', description: 'Year close' };

const NEWER_YEAR_ROW = { id: 'year-002', fiscalYear: '2028', description: 'FY2028', 'calendar$_identifier': 'Standard Calendar' };

async function installYearMock(page, rows = [YEAR_ROW]) {
  await page.route('**/sws/neo/fiscal-calendar/year{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/year\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [YEAR_ROW] } }),
      });
      return;
    }
    route.fallback();
  });
}

/** Mocks periodControl list + the openClose action endpoint. */
async function installPeriodControlMock(page, periods) {
  await page.route('**/sws/neo/open-close-period-control/periodControl{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: periods } }),
      });
      return;
    }
    if (req.method() === 'POST' && /\/action\/openClose/.test(url)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'Period updated' }),
      });
      return;
    }
    route.fallback();
  });
}

/**
 * Also drives useYearCloseStatus.js: a year is "closed" iff this endpoint returns at least one
 * row, so the Cerrar Año guard tests must pass an empty array to keep the year "not closed" —
 * otherwise index.jsx's menuActions swaps to "Deshacer Cierre de Año" and closeYear never renders.
 */
async function installAccountingMock(page, rows = [ACCOUNTING_ROW]) {
  await page.route('**/sws/neo/end-year-close/accounting{/**,}**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: rows }),
    });
  });
}

test.describe('Calendar — year detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installYearMock(page);
    await installPeriodControlMock(page, [PERIOD_OPEN, PERIOD_CLOSED]);
    await installAccountingMock(page);
    await page.goto('/calendar/year-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Abrir/Cerrar Periodo hits the mocked openClose endpoint', async ({ page }) => {
    await page.getByTestId('tab-periods').click();
    await expect(page.getByTestId('period-name-period-001')).toBeVisible();

    // openClose requires a param (O/C/P), so the button opens ProcessParamDialog first —
    // it does not fire the request directly.
    await page.getByTestId('period-openclose-period-001').click();
    await page.getByTestId('process-param-select-openClose').click();
    await page.getByTestId('process-param-option-openClose-C').click();

    const requestPromise = page.waitForRequest(
      (r) => r.url().includes('/sws/neo/open-close-period-control/periodControl/period-001/action/openClose')
        && r.method() === 'POST'
    );
    await page.getByTestId('process-param-confirm').click();
    await requestPromise;
  });
});

// ETP-5682: several periods opened from the floating selection bar, one request per period.
test.describe('Calendar — bulk open periods', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installYearMock(page);
    await installPeriodControlMock(page, [
      PERIOD_OPEN,
      PERIOD_CLOSED,
      { ...PERIOD_CLOSED, id: 'period-003', name: 'Mar-2027', periodNo: 3 },
    ]);
    await installAccountingMock(page);
    await page.goto('/calendar/year-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('opens the selected closed periods and skips the one already open', async ({ page }) => {
    await page.getByTestId('tab-periods').click();
    await expect(page.getByTestId('period-name-period-001')).toBeVisible();
    await expect(page.getByTestId('period-bulk-open')).toHaveCount(0);

    await page.getByTestId('period-select-all').click();
    await expect(page.getByTestId('period-bulk-open')).toBeVisible();

    const posted = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/periodControl\/[^/]+\/action\/openClose/.test(r.url())) {
        posted.push(r.url().match(/periodControl\/([^/]+)\//)[1]);
      }
    });

    await page.getByTestId('period-bulk-open').click();
    await expect(page.getByTestId('periods-bulk-confirm-names')).toBeVisible();
    await page.getByTestId('periods-bulk-confirm-ok').click();

    // period-001 is already open: not posted. The others go in date order.
    await expect.poll(() => posted).toEqual(['period-002', 'period-003']);
    await expect(page.getByTestId('period-bulk-open')).toHaveCount(0);
  });
});

test.describe('Calendar — Cerrar Año guard', () => {
  test('stays disabled while a period is still open', async ({ page }) => {
    await login(page);
    await installYearMock(page);
    await installPeriodControlMock(page, [PERIOD_OPEN, PERIOD_CLOSED]);
    // Empty accounting rows → useYearCloseStatus resolves "not closed" → menuActions offers
    // "closeYear" (not "undoCloseYear").
    await installAccountingMock(page, []);
    await page.goto('/calendar/year-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('action-more').click();
    await page.getByTestId('menu-action-closeYear').click();
    await expect(page.getByTestId('close-year-confirm')).toBeDisabled();
  });

  test('enables once all periods are Closed or Permanently Closed', async ({ page }) => {
    await login(page);
    await installYearMock(page);
    await installPeriodControlMock(page, [
      { ...PERIOD_CLOSED, id: 'period-003', name: 'Mar-2027' },
      { ...PERIOD_CLOSED, id: 'period-004', name: 'Apr-2027', status: 'P' },
    ]);
    await installAccountingMock(page, []);
    await page.goto('/calendar/year-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('action-more').click();
    await page.getByTestId('menu-action-closeYear').click();
    await expect(page.getByTestId('close-year-confirm')).not.toBeDisabled();
  });
});

/**
 * ETP-5577 — the `accounting-calendar` guided tour (`walkthrough/flows/accounting-calendar.json`),
 * run end to end so every selector it names is proven against the real window: the menu path, the
 * list's New action, the year row, the Periods tab and the open/close button, plus "Atrás" from
 * inside a year. Also covers its launcher in the First Steps calendar review row.
 *
 * @covers tools/app-shell/src/walkthrough/flows/accounting-calendar.json
 * @covers tools/app-shell/src/pages/first-steps/CalendarReviewPanel.jsx
 */
test.describe('Calendar — guided tour (ETP-5577)', () => {
  test('walks list → next year → year → Periods → open/close, and back', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await installYearMock(page);
    await installPeriodControlMock(page, [PERIOD_OPEN, PERIOD_CLOSED]);
    await installAccountingMock(page);
    // Started where a new productive tenant meets it: the "Revisar calendario contable" row in
    // Primeros pasos. Not Calendar itself, so step 1 has to travel the menu path.
    await page.route('**/sws/go/onboarding/calendar-review**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ required: true, reviewed: false, canRegenerate: true, year: '2027' }),
    }));
    await page.goto('/first-steps');
    await page.getByTestId('first-steps-title-calendar-review').click();
    await page.getByTestId('first-steps-calendar-review-view-guide').click();

    const overlay = page.getByTestId('walkthrough-overlay');
    const atStep = (id) => expect(overlay).toHaveAttribute('data-walkthrough-step', id, { timeout: 20_000 });
    const card = page.getByTestId('walkthrough-card');

    await atStep('calendar-list');
    // The menu path is three animated hops of up to 3s each (`navPathSpeedMs`).
    await expect(page).toHaveURL(/\/calendar$/, { timeout: 20_000 });
    await expect(card).not.toContainText(/walkthroughCalendar/);
    await page.getByTestId('walkthrough-next').click();

    await atStep('next-year');
    await expect(page.getByTestId('walkthrough-error-message')).toHaveCount(0);
    await page.getByTestId('walkthrough-next').click();

    await atStep('open-year');
    await page.locator('[data-current-fiscal-year]').click();

    await atStep('periods-tab');
    await page.getByTestId('tab-periods').click();

    await atStep('open-close-period');
    await expect(page.getByTestId('walkthrough-error-message')).toHaveCount(0);

    // "Atrás" from inside the year: the list steps declare `route`, so going back returns to the
    // year list instead of looking for its rows on the year's own screen.
    await page.getByTestId('walkthrough-previous').click();
    await atStep('periods-tab');
    await page.getByTestId('walkthrough-previous').click();
    await atStep('open-year');
    await expect(page).toHaveURL(/\/calendar$/, { timeout: 20_000 });
    await expect(page.getByTestId('walkthrough-error-message')).toHaveCount(0);
    await page.locator('[data-current-fiscal-year]').click();
    await atStep('periods-tab');
    await page.getByTestId('tab-periods').click();

    await atStep('open-close-period');
    await expect(page.getByTestId('walkthrough-error-message')).toHaveCount(0);
    await page.getByTestId('walkthrough-finish').click();
    // The completion card; the last flow in the registry offers no next tour.
    await expect(page.getByTestId('walkthrough-next-flow')).toHaveCount(0);
    await page.getByTestId('walkthrough-close').click();
    await expect(overlay).toHaveCount(0, { timeout: 10_000 });
  });

  // QA repros: a newer year without periods is listed first; the tour must open the CURRENT year.
  test('targets the current year, not the first row, and ignores the row checkbox', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await installYearMock(page, [NEWER_YEAR_ROW, YEAR_ROW]);
    await installPeriodControlMock(page, [PERIOD_OPEN, PERIOD_CLOSED]);
    await installAccountingMock(page);
    await page.route('**/sws/go/onboarding/calendar-review**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ required: true, reviewed: false, canRegenerate: true, year: '2027' }),
    }));
    await page.goto('/first-steps');
    await page.getByTestId('first-steps-title-calendar-review').click();
    await page.getByTestId('first-steps-calendar-review-view-guide').click();

    const overlay = page.getByTestId('walkthrough-overlay');
    const atStep = (id) => expect(overlay).toHaveAttribute('data-walkthrough-step', id, { timeout: 20_000 });
    await atStep('calendar-list');
    await page.getByTestId('walkthrough-next').click();
    await atStep('next-year');
    await page.getByTestId('walkthrough-next').click();
    await atStep('open-year');

    // Only the current year's row is marked, even though the newer one is first.
    await expect(page.locator('[data-current-fiscal-year]')).toHaveCount(1);
    await expect(page.getByTestId('row-year-001').locator('[data-current-fiscal-year]')).toHaveCount(1);

    // Ticking the selection checkbox must not advance the step.
    // dispatchEvent fires on the checkbox itself, so it cannot be swallowed by the overlay.
    const checkbox = page.getByTestId('row-year-001').getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();
    await checkbox.dispatchEvent('click');
    await expect(checkbox).toBeChecked();
    await expect(overlay).toHaveAttribute('data-walkthrough-step', 'open-year');

    await page.locator('[data-current-fiscal-year]').click();
    await atStep('periods-tab');
    await page.getByTestId('tab-periods').click();
    await atStep('open-close-period');
    await expect(page.getByTestId('walkthrough-error-message')).toHaveCount(0);
  });
});
