import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order — currency field always editable for draft orders (ETP-4027, mocked).
 *
 * ETP-4027 removed `displayLogicWithCurrencyLock` — the DB trigger that blocked
 * changes to C_Currency_ID when lines existed was deleted and the frontend lock
 * logic was removed from DetailView.jsx. The currency field is now always editable
 * for draft orders, regardless of whether the order has saved lines.
 *
 * Two scenarios:
 *   1. Order has saved lines → currency field is still NOT disabled (lock removed).
 *   2. Order has no saved lines → currency field is also NOT disabled (baseline).
 */

const ORDER_ID = 'order-lock-test-001';

const ORDER = {
  id: ORDER_ID,
  documentNo: 'SO-LOCK-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Draft',
  currency: '100',
  'currency$_identifier': 'USD',
  orderDate: '2026-01-15',
  grandTotalAmount: 500,
  summedLineAmount: 450,
  'businessPartner$_identifier': 'Test BP',
  businessPartner: 'bp-001',
  partnerAddress: 'addr-001',
  priceList: 'pl-001',
  paymentTerms: 'pt-001',
  processed: false,
};

const SAMPLE_LINE = {
  id: 'line-001',
  product: 'prod-001',
  'product$_identifier': 'Test Product',
  orderedQuantity: 2,
  listPrice: 225,
  lineNetAmount: 450,
};

/**
 * Install mocks for the sales-order detail view.
 *
 * Must be called AFTER login() — Playwright matches routes in LIFO order, so
 * the more-specific route registered here wins over the generic /sws/** catch-all
 * seeded by login().
 *
 * @param {import('@playwright/test').Page} page
 * @param {object[]} lines - Child lines to return for the order (may be empty).
 */
async function installDetailMock(page, lines) {
  // Header detail endpoint
  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ORDER] } }),
      });
    } else {
      route.fallback();
    }
  });

  // Header list endpoint (needed on initial load)
  await page.route(`**/sws/neo/sales-order/header`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ORDER], totalRows: 1 } }),
      });
    } else {
      route.fallback();
    }
  });

  // Lines endpoint
  await page.route(`**/sws/neo/sales-order/lines**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: lines, totalRows: lines.length } }),
      });
    } else {
      route.fallback();
    }
  });
}

test.describe('Sales Order — currency field always editable for draft orders (ETP-4027)', () => {
  test('currency field is editable even when order has saved lines', async ({ page }) => {
    await login(page);
    await installDetailMock(page, [SAMPLE_LINE]);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // CurrencyRatePicker renders as the trigger button (data-testid="currency-rate-trigger")
    // inside the field-currency wrapper. It must NOT be disabled after ETP-4027 removed
    // the displayLogicWithCurrencyLock feature.
    const currencyField = page.getByTestId('field-currency');
    await expect(currencyField).toBeVisible({ timeout: 8_000 });

    // The trigger button is the interactive element in CurrencyRatePicker
    const currencyTrigger = currencyField.getByTestId('currency-rate-trigger');
    await expect(currencyTrigger).toBeVisible({ timeout: 5_000 });
    await expect(currencyTrigger).not.toBeDisabled();
  });

  test('currency field is editable when order has no saved lines', async ({ page }) => {
    await login(page);
    await installDetailMock(page, []);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const currencyField = page.getByTestId('field-currency');
    await expect(currencyField).toBeVisible({ timeout: 8_000 });

    const currencyTrigger = currencyField.getByTestId('currency-rate-trigger');
    await expect(currencyTrigger).toBeVisible({ timeout: 5_000 });
    await expect(currencyTrigger).not.toBeDisabled();
  });
});
