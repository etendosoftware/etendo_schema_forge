// @covers tools/app-shell/src/components/contract-ui/CurrencyRatePicker.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Sales Order — CurrencyRatePicker (mocked).
 *
 * Covers the currency change on the sales-order header:
 *   E. Currency with a rate on the order date — the change sticks and shows "{isoCode} — {rate}".
 *   F. Currency without a rate on the order date — the change STILL sticks (no revert, no toast):
 *      the rate shows «—» and the pencil stays available to type it. Saving it empty is refused
 *      by the backend, not by the picker.
 *
 * currencyOptions is fetched with `?date=…&organization=…` (the form's reference date and org),
 * so its route glob ends in `currencyOptions**` to match the query string — see
 * docs/e2e-testing-guide.md, "a route pattern ending in a bare word**". There is no client-side
 * validate-exchange-rate gate any more, so it is not mocked.
 * Unit-level coverage (date/org params, pencil on a new document, null rate staging) lives in
 * CurrencyRatePicker.vitest.jsx.
 */

const ORDER_ID = 'order-picker-test-001';

const ORDER_USD = {
  id: ORDER_ID,
  documentNo: 'SO-PICKER-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Draft',
  currency: '100',
  'currency$_identifier': 'USD',
  eTGOCurrencyRate: 1.15,
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

// EUR is the org currency; ARS has no conversion range on the order date.
const CURRENCY_OPTIONS = [
  { id: '102', isoCode: 'EUR', rate: 1.0, isOrgCurrency: true },
  { id: '100', isoCode: 'USD', rate: 1.15 },
  { id: '103', isoCode: 'ARS', rate: null },
];

/**
 * Install mocks for a sales-order detail view with currency endpoint support.
 * Must be called AFTER login().
 */
async function installOrderMocks(page, {
  order = ORDER_USD,
  lines = [],
  currencyOptions = CURRENCY_OPTIONS,
} = {}) {
  // currencyOptions endpoint — eager fetch on load and on every reference-date/org change,
  // always with a query string.
  await page.route(`**/sws/neo/sales-order/header/${order.id}/action/currencyOptions**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: currencyOptions } }),
      });
    } else {
      route.fallback();
    }
  });

  await page.route(`**/sws/neo/session`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currencyCode: 'EUR',
          currencyId: '102',
        }),
      });
    } else {
      route.fallback();
    }
  });

  // Header detail endpoint
  await page.route(`**/sws/neo/sales-order/header/${order.id}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [order] } }),
      });
    } else if (method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [order] } }),
      });
    } else {
      route.fallback();
    }
  });

  // Header list endpoint
  await page.route(`**/sws/neo/sales-order/header`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [order], totalRows: 1 } }),
      });
    } else {
      route.fallback();
    }
  });

  // Lines endpoint
  await page.route(`**/sws/neo/sales-order/lines{/**,}**`, async (route) => {
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

async function waitForDetailView(page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
}

async function openCurrencyPicker(page) {
  const trigger = page.getByTestId('field-currency').getByTestId('currency-rate-trigger');
  await expect(trigger).toBeVisible({ timeout: 8_000 });
  await trigger.click();
  return trigger;
}

test.describe('CurrencyRatePicker — E: currency with a rate on the order date', () => {
  test('the change sticks and the trigger shows the rate', async ({ page }) => {
    await login(page);
    await installOrderMocks(page, {
      order: { ...ORDER_USD, currency: '102', 'currency$_identifier': 'EUR', eTGOCurrencyRate: 1.0 },
    });

    await page.goto(`/sales-order/${ORDER_ID}`);
    await waitForDetailView(page);

    const trigger = await openCurrencyPicker(page);
    await page.getByRole('option', { name: /USD/ }).last().click();

    await expect(trigger).toContainText('USD', { timeout: 5_000 });
    await expect(trigger).toContainText(/1[,.]15/);
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  });
});

test.describe('CurrencyRatePicker — F: currency without a rate on the order date', () => {
  test('the change sticks with an empty rate («—») and the pencil to type it — no revert, no toast', async ({ page }) => {
    await login(page);
    await installOrderMocks(page);

    await page.goto(`/sales-order/${ORDER_ID}`);
    await waitForDetailView(page);

    const trigger = await openCurrencyPicker(page);
    // The list already tells the user there is no rate on that date.
    await expect(page.getByTestId('currency-rate-option-missing')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('option', { name: /ARS/ }).last().click();

    await expect(trigger).toContainText('ARS', { timeout: 5_000 });
    await expect(trigger).not.toContainText('USD');
    await expect(trigger.getByTestId('currency-rate-missing')).toBeVisible();
    await expect(page.getByTestId('field-currency').getByTestId('currency-rate-pencil')).toBeVisible();
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  });
});
