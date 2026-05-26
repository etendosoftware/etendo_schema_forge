import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order — currency field lock (ETP-4027, mocked).
 *
 * The DetailView locks the currency selector when committed lines exist:
 *   displayLogicWithCurrencyLock = hook.children.length > 0
 *     ? { ...displayLogic, readOnly: { ...displayLogic.readOnly, currency: true } }
 *     : displayLogic
 *
 * Two scenarios:
 *   1. Order has saved lines → currency field input is disabled.
 *   2. Order has no saved lines → currency field input is NOT disabled.
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

  // Lines endpoint — drives the currency lock decision
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

test.describe('Sales Order — currency field lock when lines exist', () => {
  test('currency field is disabled when order has saved lines', async ({ page }) => {
    await login(page);
    await installDetailMock(page, [SAMPLE_LINE]);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The currency field renders as a selector input inside the form.
    // EntityForm emits data-testid="field-currency" on the field wrapper.
    const currencyField = page.getByTestId('field-currency');
    await expect(currencyField).toBeVisible({ timeout: 8_000 });

    // When currency is locked, the underlying input/button must be disabled.
    const currencyInput = currencyField.locator('input, button').first();
    await expect(currencyInput).toBeDisabled();
  });

  test('currency field is editable when order has no saved lines', async ({ page }) => {
    await login(page);
    await installDetailMock(page, []);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const currencyField = page.getByTestId('field-currency');
    await expect(currencyField).toBeVisible({ timeout: 8_000 });

    // With no lines the lock does not apply — the field must NOT be disabled.
    const currencyInput = currencyField.locator('input, button').first();
    await expect(currencyInput).not.toBeDisabled();
  });
});
