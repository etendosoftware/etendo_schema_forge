import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Payment modal — date validation, two-step Cobros/Pagos flow (mocked).
 *
 * The payment UI is a TWO-STEP flow (ETP-4331):
 *   Step 1 — clicking the payment badge in the invoice detail opens
 *            InvoicePaymentModal (history popup, data-testid="cp-history-modal").
 *            When the invoice is completed (CO) and has outstanding amount, it
 *            renders an "+ Add payment" button (data-testid="cp-add-payment").
 *   Step 2 — clicking cp-add-payment opens NewPaymentEntryModal
 *            (data-testid="cp-new-payment-modal").
 *
 * The ETP-4005 "date required" validation now lives in NewPaymentEntryModal:
 *   - cp-confirm is DISABLED while the date field is empty.
 *   - cp-save-draft runs the same validation; clicking it with an empty date
 *     sets the translated error ui('paymentDateRequired') and adds the
 *     border-red-500 class to the DateField wrapper.
 *
 * Runs in mock mode — no Etendo backend required.
 *
 * Locale note: the app loads real locale files in mock mode and defaults to
 * es_ES for anonymous sessions. All text assertions use /EN|ES/i style regexes
 * to remain locale-agnostic.
 */

const INV_ID = 'pmv-mock-inv-001';

const COMPLETED_INVOICE = {
  id: INV_ID,
  documentNo: 'PINV-PMV',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  grandTotalAmount: 500,
  outstandingAmount: 500,
  'currency$_identifier': 'EUR',
  paymentComplete: false,
};

async function installInvoiceMocks(page) {
  await page.route('**/sws/neo/purchase-invoice/header', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [COMPLETED_INVOICE], totalRows: 1 } }),
    });
  });
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [COMPLETED_INVOICE] } }),
    });
  });
  await page.route('**/sws/neo/purchase-invoice/header?**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [COMPLETED_INVOICE], totalRows: 1 } }),
    });
  });
  await page.route('**/sws/neo/purchase-invoice/paymentPlan**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        response: {
          data: [{
            id: 'sched-001',
            finPaymentScheduleID: 'sched-001',
            amount: '500',
            paidAmount: '0',
            outstandingAmount: '500',
            dueDate: '2024-12-31',
          }],
        },
      }),
    });
  });
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}/action/invoicePayments`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
  // Step-2 (NewPaymentEntryModal) catalogs.
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}/action/invoiceAccounts`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'acc-1', label: 'Main Account' }] }),
    });
  });
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}/action/invoicePaymentMethods`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 'm-1', label: 'Transfer' }] }),
    });
  });
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}/action/invoiceCreditSources`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

/** Step 1 — click the payment badge and assert the history modal is visible. */
async function openPaymentModal(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
  const badge = page.locator('[style*="cursor: pointer"]').filter({ hasText: /500/ }).first();
  await expect(badge).toBeVisible({ timeout: 5_000 });
  await badge.click();
  await expect(page.getByTestId('cp-history-modal')).toBeVisible({ timeout: 5_000 });
}

/** Step 2 — click "+ Add payment" and assert the new-payment modal is visible. */
async function openNewPaymentModal(page) {
  const addBtn = page.getByTestId('cp-add-payment');
  await expect(addBtn).toBeVisible({ timeout: 8_000 });
  await addBtn.click();
  await expect(page.getByTestId('cp-new-payment-modal')).toBeVisible({ timeout: 5_000 });
}

/** Clear the date field inside the new-payment modal. */
async function clearDateField(page) {
  const dateInput = page.getByTestId('DateField__7727b3');
  await dateInput.click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  await page.keyboard.press('Tab');
  return dateInput;
}

test.describe('Payment modal date validation (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installInvoiceMocks(page);
    await page.goto(`/purchase-invoice/${INV_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('completed invoice detail shows the payment status badge', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
    const badge = page.locator('[style*="cursor: pointer"]').filter({ hasText: /500/ }).first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
  });

  test('clicking the payment badge opens the payment history modal', async ({ page }) => {
    await openPaymentModal(page);
    await expect(page.getByTestId('cp-history-modal')).toBeVisible({ timeout: 3_000 });
  });

  test('Confirm is disabled when the date field is cleared', async ({ page }) => {
    await openPaymentModal(page);
    await openNewPaymentModal(page);
    await clearDateField(page);
    await expect(page.getByTestId('cp-confirm')).toBeDisabled({ timeout: 3_000 });
  });

  test('saving with empty date shows a date-required error', async ({ page }) => {
    await openPaymentModal(page);
    await openNewPaymentModal(page);
    await clearDateField(page);
    await page.getByTestId('cp-save-draft').click();
    await expect(
      page.getByText(/Payment date is required|La fecha de pago es obligatoria/i),
    ).toBeVisible({ timeout: 3_000 });
  });

  test('date field gets a red border after an empty-date save attempt', async ({ page }) => {
    await openPaymentModal(page);
    await openNewPaymentModal(page);
    await clearDateField(page);
    await page.getByTestId('cp-save-draft').click();
    await expect(page.locator('[class*="border-red-500"]')).toBeVisible({ timeout: 3_000 });
  });
});
