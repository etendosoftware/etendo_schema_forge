import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Multi-currency Cobros/Pagos modal — smoke (mocked). ETP-4504.
 *
 * Drives the two-step flow on the purchase-invoice window:
 *   list → "Añadir pago" (outstanding badge) → InvoicePaymentHistoryModal
 *   → "+ Añadir pago" → NewPaymentEntryModal.
 *
 * Then asserts the multi-currency behavior wired into NewPaymentEntryModal:
 *   - conversion fields (rate + amount-in-account) appear when the selected
 *     account currency differs from the invoice currency, and auto-calc live;
 *   - they are absent when the currencies match;
 *   - a payment overpayment offers only "Igualar" (no "leave credit", no refund),
 *     and confirmation is blocked until the amount is adjusted.
 *
 * The receipt-side "leave credit present when invoice in org currency" case is
 * covered at the unit level (NewPaymentEntryModal.vitest.jsx) — the sales-invoice
 * receipt entry point is not a stable list-grid button, so it is not driven here.
 *
 * Mock mode only: installs purchase-invoice routes on top of the generic /sws/**
 * mock that login() seeds. Routes must be installed AFTER login() (Playwright
 * matches routes in reverse registration order → specific wins over generic).
 */

const INVOICE_ID = 'pinv-conv-1';
const DOC_NO = 'PINV-CONV-001';

function buildInvoice(invoiceCurrency) {
  return {
    id: INVOICE_ID,
    documentNo: DOC_NO,
    // purchase-invoice list surfaces orderReference as the document text — mirror
    // the value so a single row locator works.
    orderReference: DOC_NO,
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'businessPartner$_identifier': 'Proveedor Multi-Divisa',
    'currency$_identifier': invoiceCurrency,
    grandTotalAmount: 100,
    outstandingAmount: 100,
    invoiceDate: '2026-01-15',
  };
}

/**
 * @param {object} opts
 * @param {string} opts.invoiceCurrency  ISO code of the invoice currency
 * @param {string} opts.accountCurrency  ISO code of the (single) financial account
 * @param {number|null} opts.rate        exchange rate returned by validate-exchange-rate
 * @param {string} opts.orgCurrency      org currency returned by /session
 * @param {Array}  opts.sources          invoiceCreditSources items (same-currency only)
 */
async function installMocks(page, {
  invoiceCurrency, accountCurrency, rate = null, orgCurrency = 'EUR', sources = [],
}) {
  const invoice = buildInvoice(invoiceCurrency);

  const jsonOk = (route, body) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  });

  // List + detail + per-invoice action POSTs all live under /header**.
  await page.route('**/sws/neo/purchase-invoice/header**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (/\/action\/invoiceAccounts/.test(url)) {
      return jsonOk(route, {
        items: [{
          id: 'acc-1', label: `Cuenta ${accountCurrency}`,
          defaultPaymentMethod: 'Transferencia',
          currency: accountCurrency, currencyId: `cur-${accountCurrency}`,
        }],
        bpPreferredAccountId: 'acc-1',
      });
    }
    if (/\/action\/invoicePaymentMethods/.test(url)) {
      return jsonOk(route, { items: [{ id: 'm-1', label: 'Transferencia' }] });
    }
    if (/\/action\/invoiceCreditSources/.test(url)) {
      // Mocked to same-currency items only (backend filters by currency).
      return jsonOk(route, { items: sources });
    }
    if (/\/action\/invoicePayments/.test(url)) {
      return jsonOk(route, { response: { data: [] } });
    }
    if (/\/action\/registerPayment/.test(url)) {
      return jsonOk(route, { response: { data: { id: 'pay-1' } } });
    }
    // Detail GET (…/header/<id>)
    if (req.method() === 'GET' && /\/header\/[^/?]+/.test(url)) {
      return jsonOk(route, { response: { data: [invoice] } });
    }
    // List GET (…/header?…)
    if (req.method() === 'GET') {
      return jsonOk(route, { response: { data: [invoice], totalRows: 1 } });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/purchase-invoice/paymentPlan**', (route) =>
    jsonOk(route, { response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '100' }] } }));

  await page.route('**/sws/neo/session**', (route) =>
    jsonOk(route, { currencyCode: orgCurrency }));

  await page.route('**/sws/neo/validate-exchange-rate**', (route) =>
    jsonOk(route, rate == null ? {} : { rate }));
}

/** list → outstanding badge → history modal → "+ Añadir pago" → NewPaymentEntryModal. */
async function openPaymentEntryModal(page) {
  const row = page.locator('tbody tr').filter({ hasText: DOC_NO }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  // The outstanding-amount badge opens the payment-history modal (aria-label
  // resolves to "Añadir pago" / "Add payment").
  await row.getByRole('button', { name: /añadir pago|add payment/i }).click();

  const addBtn = page.getByTestId('InvoicePaymentHistoryModal__add-btn');
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  const modal = page.getByTestId('cp-new-payment-modal');
  await expect(modal).toBeVisible();
  return modal;
}

test.describe('Multi-currency payment modal (ETP-4504) — purchase-invoice', () => {
  test('shows the conversion fields and auto-calculates when the account currency differs', async ({ page }) => {
    await login(page);
    await installMocks(page, { invoiceCurrency: 'USD', accountCurrency: 'EUR', rate: 0.92 });
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const modal = await openPaymentEntryModal(page);

    // Account (EUR) ≠ invoice (USD) → the conversion block appears.
    await expect(modal.getByTestId('cp-conversion-fields')).toBeVisible();
    const rateInput = modal.getByTestId('cp-conversion-rate-input');
    await expect(rateInput).toHaveValue(/0[.,]92/);

    // 100 (outstanding) × 0.92 = 92 in the account currency.
    const readout = modal.getByTestId('cp-amount-in-account');
    await expect(readout).toContainText(/92/);

    // Recompute live when the rate changes: 100 × 0.5 = 50.
    await rateInput.fill('0.5');
    await expect(readout).toContainText(/50/);
  });

  test('hides the conversion fields when the account currency matches the invoice currency', async ({ page }) => {
    await login(page);
    await installMocks(page, { invoiceCurrency: 'USD', accountCurrency: 'USD' });
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const modal = await openPaymentEntryModal(page);

    // Same currency → no conversion UI. Wait for the account select to settle first.
    await expect(modal.getByTestId('cp-amount-input')).toBeVisible();
    await expect(modal.getByTestId('cp-conversion-fields')).toHaveCount(0);
  });

  test('a payment overpayment offers only "Igualar" (no credit, no refund) and blocks confirm until adjusted', async ({ page }) => {
    await login(page);
    await installMocks(page, { invoiceCurrency: 'EUR', accountCurrency: 'EUR', orgCurrency: 'EUR' });
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const modal = await openPaymentEntryModal(page);

    // Overpay: 100 outstanding, type 150.
    await modal.getByTestId('cp-amount-input').fill('150');

    // Payment (dir "out") → the "leave credit" card and the removed refund radio
    // are both absent; only the inline "adjust the amount" guidance shows.
    await expect(modal.getByTestId('cp-excess-credit')).toHaveCount(0);
    // Confirm stays disabled while the excess is unresolved.
    await expect(modal.getByTestId('cp-confirm')).toBeDisabled();

    // "Igualar" resets the amount to exactly cover the invoice → confirm re-enables.
    await modal.getByTestId('cp-equalize').click();
    await expect(modal.getByTestId('cp-confirm')).toBeEnabled();
  });
});
