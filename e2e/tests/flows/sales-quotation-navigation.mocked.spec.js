import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Quotation — navigation regression (ETP-4000, mocked).
 *
 * Bug: clicking a list row or "+ Nuevo presupuesto" updated the URL but did
 * NOT render the detail page — only a manual browser refresh recovered.
 *
 * Root cause (already fixed on this branch): the i18n hooks `useUI`,
 * `useMenuLabel` and `useLabel` returned a new function reference each render,
 * which invalidated a `useMemo(() => buildQuotationColumns(ui), [ui])` in
 * `SalesQuotationWindow`. Fresh column identity propagated through
 * `DataTable.onColumnsReady` → `ListView.setTableColumns`, forming an
 * infinite update loop and a "Maximum update depth exceeded" error that
 * blocked further URL transitions.
 *
 * These tests prove:
 *   1. List → existing record renders WITHOUT a refresh.
 *   2. List → +New renders WITHOUT a refresh.
 *   3. Detail → back to list → another record renders.
 *
 * Each test installs a console-error listener that fails the test if React
 * reports "Maximum update depth exceeded" — the canonical signal for this
 * regression class.
 */

const ROWS = [
  {
    id: 'quot-001',
    documentNo: 'QUOT-001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Draft',
    orderDate: '2026-05-01',
    validUntil: null,
    businessPartner: 'bp-1',
    'businessPartner$_identifier': 'Laura Morat',
    partnerAddress: 'addr-1',
    'partnerAddress$_identifier': 'Rio Cuarto, Santa Fe 488',
    priceList: 'pl-1',
    'priceList$_identifier': 'Tarifa de venta principal',
    paymentMethod: 'pm-1',
    'paymentMethod$_identifier': 'Efectivo',
    paymentTerms: 'pt-1',
    'paymentTerms$_identifier': '30 Días',
    grandTotalAmount: 100,
    summedLineAmount: 100,
    description: '',
    processed: false,
  },
  {
    id: 'quot-002',
    documentNo: 'QUOT-002',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Draft',
    orderDate: '2026-05-02',
    validUntil: null,
    businessPartner: 'bp-2',
    'businessPartner$_identifier': 'Pedro Salinas',
    partnerAddress: 'addr-2',
    'partnerAddress$_identifier': 'Av. Rivadavia 1234',
    priceList: 'pl-1',
    'priceList$_identifier': 'Tarifa de venta principal',
    paymentMethod: 'pm-1',
    'paymentMethod$_identifier': 'Efectivo',
    paymentTerms: 'pt-1',
    'paymentTerms$_identifier': '30 Días',
    grandTotalAmount: 250,
    summedLineAmount: 250,
    description: '',
    processed: false,
  },
];

/**
 * Install handlers for the sales-quotation backend after login() — Playwright
 * matches routes in reverse registration order so this wins over the generic
 * /sws/** stub.
 */
async function installQuotationMock(page) {
  await page.route('**/sws/neo/sales-quotation/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const idx = segments.indexOf('sales-quotation');
    const entity = segments[idx + 1];
    const idOrSubpath = segments[idx + 2];

    // Empty child lists — header navigation is the focus of this spec.
    if (entity === 'quotationLine') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
      return;
    }

    if (entity === 'quotation' && req.method() === 'GET') {
      // Detail GET → /quotation/{id}
      if (idOrSubpath) {
        const found = ROWS.find((r) => r.id === idOrSubpath);
        if (found) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: { data: [found] } }),
          });
          return;
        }
      }
      // List GET → /quotation
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
      return;
    }

    // Anything else (defaults, callouts, selectors, ...) falls through to the
    // auth.js catch-all so its synthetic responses keep the UI happy.
    route.fallback();
  });
}

/**
 * Installs a console-error listener that fails the test if React reports
 * "Maximum update depth exceeded" — the canonical signal for the regression
 * fixed in ETP-4000.
 */
function watchForInfiniteLoop(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('Maximum update depth exceeded')) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    if ((err.message || '').includes('Maximum update depth exceeded')) {
      errors.push(err.message);
    }
  });
  return errors;
}

test.describe('Sales Quotation — navigation without refresh (ETP-4000)', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await installQuotationMock(page);
    consoleErrors = watchForInfiniteLoop(page);
  });

  test.afterEach(() => {
    expect(consoleErrors, 'No infinite update loop should occur during navigation').toEqual([]);
  });

  test('list → existing record renders detail without a manual refresh', async ({ page }) => {
    await page.goto('/sales-quotation');
    const firstRow = page.locator('tbody tr').filter({ hasText: 'QUOT-001' }).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Row click opens the preview panel (documentPreview: true). Navigate to
    // the detail via the Edit button in the row quick-action overlay instead.
    await firstRow.hover();
    await firstRow.getByTestId('row-quick-action-edit').click();

    // URL must transition AND detail must render — no reload allowed.
    await page.waitForURL(/\/sales-quotation\/quot-001/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/sales-quotation\/quot-001/);

    // Detail-only element — must be visible without page.reload().
    const documentNoField = page.getByTestId('field-documentNo');
    await expect(documentNoField).toBeVisible({ timeout: 10_000 });
  });

  test('list → +New navigates to /new and renders the form without a refresh', async ({ page }) => {
    await page.goto('/sales-quotation');
    await expect(page.locator('tbody tr').filter({ hasText: 'QUOT-001' }).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId('action-new').click();

    await page.waitForURL(/\/sales-quotation\/new/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/sales-quotation\/new/);

    // BusinessPartner is one of the principal form fields on the new record
    // form — its presence confirms the detail branch rendered without reload.
    await expect(page.getByTestId('field-businessPartner')).toBeVisible({ timeout: 10_000 });
  });

  test('list → record → back → another record renders', async ({ page }) => {
    // 1. Start at the list — establishes the SPA history so goBack() has a
    //    valid in-app entry to return to (avoids about:blank).
    await page.goto('/sales-quotation');
    const firstRow = page.locator('tbody tr').filter({ hasText: 'QUOT-001' }).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // 2. Navigate to the first detail via the Edit button in the quick-action
    //    overlay (row click opens the preview panel when documentPreview: true).
    await firstRow.hover();
    await firstRow.getByTestId('row-quick-action-edit').click();
    await page.waitForURL(/\/sales-quotation\/quot-001/, { timeout: 10_000 });
    await expect(page.getByTestId('field-documentNo')).toBeVisible({ timeout: 10_000 });

    // 3. Go back to the list view.
    await page.goBack();
    await page.waitForURL(/\/sales-quotation(?:\/)?$/, { timeout: 10_000 });
    const secondRow = page.locator('tbody tr').filter({ hasText: 'QUOT-002' }).first();
    await expect(secondRow).toBeVisible({ timeout: 10_000 });

    // 4. Navigate to a DIFFERENT row — this is the exact case that broke before
    //    the fix (list → detail transition after another navigation, without a
    //    hard reload).
    await secondRow.hover();
    await secondRow.getByTestId('row-quick-action-edit').click();

    await page.waitForURL(/\/sales-quotation\/quot-002/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/sales-quotation\/quot-002/);
    await expect(page.getByTestId('field-documentNo')).toBeVisible({ timeout: 10_000 });
  });
});
