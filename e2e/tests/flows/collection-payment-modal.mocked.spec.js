import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Two-step collection/payment modal — full flow (mocked, no backend).
 *
 * Drives the whole UI chain against synthetic endpoints seeded on top of the
 * generic /sws/** mock that login() installs:
 *   payment-status badge -> invoice payment history popup -> "new collection"
 *   modal -> registerPayment -> popup refreshed with the new movement.
 *
 * Mock mode only — run with `make test-e2e-headless` (no credentials needed).
 */

const INVOICE_ID = 'inv-cp-001';

const INVOICE = {
  id: INVOICE_ID,
  documentNo: 'FV-CP-001',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  grandTotalAmount: 100,
  outstandingAmount: 100,
  'currency$_identifier': 'EUR',
  businessPartner: 'bp-cp-001',
  'businessPartner$_identifier': 'Test Customer',
};

const INSTALLMENT = {
  id: 'sched-cp-1',
  finPaymentScheduleID: 'sched-cp-1',
  amount: '100',
  paidAmount: '0',
  outstandingAmount: '100',
  dueDate: '2026-01-15',
};

/**
 * Install sales-invoice routes for the collection flow. Registered AFTER login()
 * so they win over the generic mock (Playwright matches routes LIFO). The list
 * of registered payments is stateful: empty until registerPayment is called,
 * then it returns the new movement so the refreshed popup shows it.
 */
async function installFlowMock(page) {
  const state = { payments: [] };

  await page.route('**/sws/neo/sales-invoice/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/action/registerPayment') && method === 'POST') {
      const process = req.postDataJSON()?.process ?? 'confirm';
      const movement = {
        id: `pay-${state.payments.length + 1}`,
        documentNo: `PAY-${state.payments.length + 1}`,
        amount: '1',
        paymentDate: '2026-01-15',
        processed: process === 'confirm',
      };
      state.payments = [movement, ...state.payments];
      return json({ response: { data: { ...movement, status: 'RPR' } } });
    }
    if (url.includes('/action/invoicePayments')) {
      return json({ response: { data: state.payments } });
    }
    if (url.includes('/action/invoiceAccounts')) {
      return json({ items: [{ id: 'acc-1', label: 'Caja', defaultPaymentMethod: 'Efectivo' }] });
    }
    if (url.includes('/action/invoicePaymentMethods')) {
      return json({ items: [{ id: 'pm-1', label: 'Efectivo' }] });
    }
    if (url.includes('/action/invoiceCreditSources')) {
      return json({ items: [] });
    }
    if (url.includes('/paymentPlan')) {
      return json({ response: { data: [INSTALLMENT] } });
    }
    if (method === 'GET' && /\/header\/[^/?]+/.test(url)) {
      return json({ response: { data: [INVOICE] } });
    }
    return route.fallback();
  });
}

test.describe('Collection/payment two-step modal (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installFlowMock(page);
    await page.goto(`/sales-invoice/${INVOICE_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  /** badge -> history popup -> "add collection" -> new-collection modal. */
  async function openNewPaymentModal(page) {
    const badge = page.getByTestId('payment-status-badge');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await badge.click();

    const history = page.getByTestId('cp-history-modal');
    await expect(history).toBeVisible();
    await history.getByTestId('cp-add-payment').click();

    const modal = page.getByTestId('cp-new-payment-modal');
    await expect(modal).toBeVisible();
    return { history, modal };
  }

  test('Confirm creates a deposited movement and returns to the popup', async ({ page }) => {
    const { modal } = await openNewPaymentModal(page);

    await modal.getByTestId('cp-amount-input').fill('1');

    const confirmBtn = modal.getByTestId('cp-confirm');
    await expect(confirmBtn).toBeEnabled({ timeout: 15_000 }); // waits for catalogs to load
    await confirmBtn.click();

    const history = page.getByTestId('cp-history-modal');
    await expect(history).toBeVisible();
    await expect(history.getByTestId(/^cp-movement-/)).toHaveCount(1);
    await expect(history.getByText(/Depositado|Deposited/i).first()).toBeVisible();
  });

  test('Save creates a draft movement and returns to the popup', async ({ page }) => {
    const { modal } = await openNewPaymentModal(page);

    await modal.getByTestId('cp-amount-input').fill('1');

    const saveBtn = modal.getByTestId('cp-save-draft');
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 });
    await saveBtn.click();

    const history = page.getByTestId('cp-history-modal');
    await expect(history).toBeVisible();
    await expect(history.getByTestId(/^cp-movement-/)).toHaveCount(1);
    await expect(history.getByText(/Borrador|Draft/i).first()).toBeVisible();
  });
});
