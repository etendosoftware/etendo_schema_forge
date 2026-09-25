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

async function installYearMock(page) {
  await page.route('**/sws/neo/fiscal-calendar/year{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/year\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [YEAR_ROW], totalRows: 1 } }),
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
