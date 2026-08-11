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
 * Plus the reopen-a-draft flow (ETP-4841):
 *   list → badge → history popup → click the DRAFT row → NewPaymentEntryModal in
 *   EDIT mode, where the rate stored on the draft (`conversionRate`, now returned
 *   by the invoicePayments action) must win over the system spot rate served by
 *   validate-exchange-rate, and must be re-submitted unchanged on "Guardar".
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

// ETP-4841 — the draft listed in the history popup: a USD invoice paid from the EUR account
// with a hand-typed rate that differs from the system one served by validate-exchange-rate.
const DRAFT_DOC_NO = 'PAY-DRAFT-001';
const DRAFT_PAYMENT_ID = 'pay-draft-1';
const DRAFT_RATE = '0.89';
const SYSTEM_RATE = 0.92;

/**
 * A draft payment row as the `invoicePayments` action returns it. `processed: false` plus a
 * non-paid status keeps InvoicePaymentHistoryModal treating it as a draft, so clicking the row
 * reopens the editable modal instead of navigating to the read-only payment window.
 */
function buildDraftPayment(accountCurrency) {
  return {
    id: DRAFT_PAYMENT_ID,
    documentNo: DRAFT_DOC_NO,
    paymentDate: '2026-01-20',
    paymentMethod: 'Transferencia',
    status: 'RPAP',
    processed: false,
    amount: 100,
    appliedToInvoice: 100,
    accountId: 'acc-1',
    accountName: `Cuenta ${accountCurrency}`,
    accountCurrency,
    creditSourcesUsed: [],
    // The stored rate the user typed before saving the draft (ETP-4841).
    conversionRate: Number(DRAFT_RATE),
  };
}

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
 * @param {Array}  opts.payments         invoicePayments rows (existing payments/drafts)
 */
async function installMocks(page, {
  invoiceCurrency, accountCurrency, rate = null, orgCurrency = 'EUR', sources = [],
  payments = [],
}) {
  const invoice = buildInvoice(invoiceCurrency);

  const jsonOk = (route, body) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  });

  // List + detail + per-invoice action POSTs all live under /header**.
  //
  // NOTE on the glob pattern: Playwright's own glob→regex compiler
  // (playwright-core/lib/utils/isomorphic/urlMatch.js) only treats `**` as
  // "crosses path separators" when it is immediately preceded AND followed by
  // `/` (or start/end of the whole glob). Inside a brace group like
  // `header{/**,}**`, the `**` right before the `,` is followed by `,`, not
  // `/`, so the deep-match special case never triggers and it silently
  // degrades to `[^/]*` — matching only ONE path segment past `/header`
  // (e.g. `/header/acc-1`) and NOT two-or-more (e.g.
  // `/header/<id>/action/invoiceAccounts`). Any POST that needs a
  // `/header/<id>/action/<name>` sub-path therefore fell through to the
  // generic `/sws/**` stub from login() and got its synthetic
  // `{id:'e2e-record-id', ...}` body instead of this mock's data — which is
  // why `selectedAccount`/`selectedMethodObj` stayed undefined and the
  // multi-currency `cp-conversion-fields` block never rendered. Registering
  // the SAME handler under two separate glob patterns sidesteps the bug
  // entirely: `header/**` (bare `**` outside any brace, correctly deep) for
  // any sub-path, and `header**` (also brace-free) for the bare/query-string
  // case. See docs/e2e-testing-guide.md for the broader gotcha writeup.
  const headerHandler = async (route) => {
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
      return jsonOk(route, { response: { data: payments } });
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
  };
  await page.route('**/sws/neo/purchase-invoice/header/**', headerHandler);
  await page.route('**/sws/neo/purchase-invoice/header**', headerHandler);

  await page.route('**/sws/neo/purchase-invoice/paymentPlan{/**,}**', (route) =>
    jsonOk(route, { response: { data: [{ finPaymentScheduleID: 'sched-1', outstandingAmount: '100' }] } }));

  await page.route('**/sws/neo/session{/**,}**', (route) =>
    jsonOk(route, { currencyCode: orgCurrency }));

  await page.route('**/sws/neo/validate-exchange-rate{/**,}**', (route) =>
    jsonOk(route, rate == null ? {} : { rate }));
}

/** list → outstanding badge → InvoicePaymentHistoryModal (step 1 of the two-step flow). */
async function openPaymentHistoryModal(page) {
  const row = page.locator('tbody tr').filter({ hasText: DOC_NO }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  // The outstanding-amount badge opens the payment-history modal (aria-label
  // resolves to "Añadir pago" / "Add payment").
  await row.getByRole('button', { name: /añadir pago|add payment/i }).click();
  await expect(page.getByTestId('InvoicePaymentHistoryModal__panel')).toBeVisible();
}

/** list → outstanding badge → history modal → "+ Añadir pago" → NewPaymentEntryModal. */
async function openPaymentEntryModal(page) {
  await openPaymentHistoryModal(page);

  const addBtn = page.getByTestId('InvoicePaymentHistoryModal__add-btn');
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  const modal = page.getByTestId('cp-new-payment-modal');
  await expect(modal).toBeVisible();
  return modal;
}

/**
 * list → badge → history modal → click the DRAFT row → NewPaymentEntryModal in EDIT mode.
 * Draft rows reopen the editable modal (processed rows navigate to the read-only payment window).
 */
async function reopenDraftPaymentModal(page) {
  await openPaymentHistoryModal(page);

  const draftRow = page.getByTestId('InvoicePaymentHistoryModal__row')
    .filter({ hasText: DRAFT_DOC_NO }).first();
  await expect(draftRow).toBeVisible();
  await draftRow.click();

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

/**
 * ETP-4841 — reopening a draft that was saved with a manual conversion rate. The stored rate
 * travels on the invoicePayments row (`conversionRate`) and must be shown back instead of the
 * system spot rate that validate-exchange-rate returns for the same currency pair.
 */
test.describe('Reopened draft keeps its saved conversion rate (ETP-4841) — purchase-invoice', () => {
  const DRAFT_MOCKS = {
    invoiceCurrency: 'USD',
    accountCurrency: 'EUR',
    // The DB/system rate for USD→EUR differs from the 0.89 stored on the draft, so a regression
    // that reseeds from validate-exchange-rate is immediately visible.
    rate: SYSTEM_RATE,
    payments: [buildDraftPayment('EUR')],
  };

  test('shows the rate stored on the draft, not the system rate, with a matching account-currency readout', async ({ page }) => {
    await login(page);
    await installMocks(page, DRAFT_MOCKS);
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const modal = await reopenDraftPaymentModal(page);

    // Account (EUR) ≠ invoice (USD) → the conversion block is present in edit mode too.
    await expect(modal.getByTestId('cp-conversion-fields')).toBeVisible();
    // The persisted 0.89 wins over the system 0.92.
    await expect(modal.getByTestId('cp-conversion-rate-input')).toHaveValue(DRAFT_RATE);

    // The account-currency readout is derived from the SAME rate: 100 × 0.89 = 89 €.
    const readout = modal.getByTestId('cp-amount-in-account');
    await expect(readout).toContainText(/89/);
    await expect(readout).toContainText('€');

    // A valid persisted rate satisfies the foreign-payment gate on its own.
    await expect(modal.getByTestId('cp-save-draft')).toBeEnabled();
    await expect(modal.getByTestId('cp-confirm')).toBeEnabled();
  });

  test('re-saving the reopened draft submits the stored rate unchanged', async ({ page }) => {
    await login(page);
    await installMocks(page, DRAFT_MOCKS);
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const modal = await reopenDraftPaymentModal(page);
    await expect(modal.getByTestId('cp-conversion-rate-input')).toHaveValue(DRAFT_RATE);

    const saveDraft = modal.getByTestId('cp-save-draft');
    await expect(saveDraft).toBeEnabled();
    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/action/registerPayment') && r.method() === 'POST'),
      saveDraft.click(),
    ]);

    const body = JSON.parse(request.postData() || '{}');
    expect(body.process).toBe('draft');
    expect(body.conversionRate).toBe(DRAFT_RATE);
    // Edit mode → the same payment is updated rather than a second one created.
    expect(body.paymentId).toBe(DRAFT_PAYMENT_ID);
  });
});
