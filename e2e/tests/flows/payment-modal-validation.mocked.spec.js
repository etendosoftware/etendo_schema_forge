import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Payment modal — date validation, two-step Cobros/Pagos flow (mocked).
 *
 * The payment UI is a TWO-STEP flow (ETP-4331):
 *   Step 1 — clicking the payment badge in the invoice detail opens
 *            InvoicePaymentHistoryModal (history popup,
 *            data-testid="InvoicePaymentHistoryModal__panel"). When the
 *            invoice is completed (CO) and has outstanding amount, it renders
 *            an "+ Añadir pago/cobro" button
 *            (data-testid="InvoicePaymentHistoryModal__add-btn").
 *   Step 2 — clicking that button opens NewPaymentEntryModal
 *            (data-testid="cp-new-payment-modal").
 *
 * The ETP-4005 "date required" rule is now enforced as a DISABLED-BUTTON gate
 * in NewPaymentEntryModal, not a post-click inline error:
 *   - `missingRequired` (which includes `!date`) drives both `saveDisabled`
 *     and `confirmDisabled`, so cp-save-draft and cp-confirm are disabled the
 *     moment the date field is empty.
 *   - Because a disabled button never fires `onClick`, `submit()` — and the
 *     `dateInvalid` / `paymentDateRequired` / `border-red-500` path it used to
 *     set — is no longer reachable through the UI. Tests below assert the
 *     disabled state directly instead of clicking through to that dead path.
 *
 * Runs in mock mode — no Etendo backend required.
 *
 * Flow (updated for the two-step payment UI):
 *   1. Badge click → opens InvoicePaymentHistoryModal (step 1).
 *   2. "+ Añadir pago" button → opens NewPaymentEntryModal (step 2).
 *   3. Date field interactions and disabled-button assertions happen inside step 2.
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
  await expect(
    page.getByTestId('InvoicePaymentHistoryModal__panel')
  ).toBeVisible({ timeout: 5_000 });
}

/** Step 2 — click "Añadir pago" and assert the new-payment modal is visible. */
async function openNewPaymentModal(page) {
  const addPaymentBtn = page.getByTestId('InvoicePaymentHistoryModal__add-btn');
  await expect(addPaymentBtn).toBeVisible({ timeout: 8_000 });
  await addPaymentBtn.click();
  await expect(
    page.locator('[data-testid="cp-new-payment-modal"]')
  ).toBeVisible({ timeout: 3_000 });
}

/** Clear the date field inside the new-payment modal. */
async function clearDateField(page) {
  const modal = page.locator('[data-testid="cp-new-payment-modal"]');
  const dateInput = modal.locator('input[type="text"][inputmode="numeric"]').first();
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
    await expect(
      page.getByTestId('InvoicePaymentHistoryModal__panel')
    ).toBeVisible({ timeout: 3_000 });
  });

  test('Confirm is disabled when the date field is cleared', async ({ page }) => {
    await openPaymentModal(page);
    await openNewPaymentModal(page);
    await clearDateField(page);
    await expect(page.getByTestId('cp-confirm')).toBeDisabled({ timeout: 3_000 });
  });

  test('clearing the date disables Guardar and Confirmar', async ({ page }) => {
    await openPaymentModal(page);
    await openNewPaymentModal(page);
    await clearDateField(page);
    // `missingRequired` (includes `!date`) gates both footer actions — a
    // disabled button can never be clicked, so submit()'s own validation
    // (setDateInvalid / paymentDateRequired) is unreachable from here on.
    await expect(page.getByTestId('cp-save-draft')).toBeDisabled({ timeout: 3_000 });
    await expect(page.getByTestId('cp-confirm')).toBeDisabled({ timeout: 3_000 });
  });

  test('the legacy inline date-required error and red border stay absent (unreachable via UI)', async ({ page }) => {
    await openPaymentModal(page);
    await openNewPaymentModal(page);
    await clearDateField(page);

    // Both actions are disabled while the date is empty (see previous test),
    // so Playwright cannot even dispatch a click that would reach submit().
    // `dateInvalid` — the only state that ever added `border-red-500` to the
    // DateField wrapper or surfaced ui('paymentDateRequired') as an inline
    // error — is set exclusively inside submit(). With no reachable click
    // path to submit(), neither the error text nor the red border can appear
    // anymore. This mirrors the reasoning already documented in
    // NewPaymentEntryModal.vitest.jsx ("submit()-driven dateInvalid/red-border
    // path is no longer reachable via the UI").
    await expect(
      page.getByText(/Payment date is required|La fecha de pago es obligatoria/i),
    ).toHaveCount(0);
    await expect(page.locator('[data-testid="cp-new-payment-modal"] [class*="border-red-500"]')).toHaveCount(0);
  });
});
