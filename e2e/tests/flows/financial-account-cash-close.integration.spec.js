import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import { openSelectorField } from '../helpers/selectors.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, addProductLine,
  // Generic despite the name: it picks the first real option of `field-businessPartner`, with no
  // vendor-specific step. Aliased so the call site reads correctly in a sales flow.
  selectVendorBP as selectBusinessPartner,
  clickConfirmButton, waitForConfirmResponse, waitForDocumentActionResponse, dismissSuccessModal,
  expectStatusPill, parseAmount,
} from '../helpers/purchase-helpers.js';
import { ensureOpenPeriod } from '../helpers/period-helpers.js';

/**
 * Cash close (ETP-4795) — REAL BACKEND.
 *
 * QA returned ETP-4795 asking for integration coverage: the cash close creates a
 * FIN_Reconciliation, can post a difference transaction against a GL Item and moves accounting
 * balances, and nothing but frontend unit tests (`cashCloseMath`) covered it.
 *
 * Cases covered:
 *   - Case 1: happy path — a sales invoice collected in cash into a brand-new drawer, ticked,
 *             declared at the calculated balance, and closed.
 *
 * Cases worth adding next, each as its own `test('Case N: …')` in this same file (the numbering is
 * a stable reference, so never renumber an existing one):
 *   - a close with a difference and a GL Item Difference configured → exactly one BPD/BPW
 *     adjustment transaction against that GL Item, linked to the reconciliation and processed;
 *   - a close with a difference and NO GL Item Difference → explanatory rejection, no side effects;
 *   - "Guardar borrador" → reopening the tab restores the ticked movements and declared balance;
 *   - a statement date inside a closed accounting period → rejected by the period guard;
 *   - unticked movements staying pending across two consecutive closes.
 *
 * Case 1 walks the whole chain that puts a movement in a cash drawer and then closes it:
 *
 *   1. Log in with the credentials the onboarding-setup project produced.
 *   2. Create a BRAND-NEW cash account through the account wizard.
 *   3. Create a sales invoice with payment method Efectivo and one product line, and confirm it.
 *   4. Collect it in full, with payment method Efectivo, into the account created in step 2 — which
 *      is what makes Core write the FIN_FinaccTransaction into the drawer.
 *   5. Open that account's Conciliación tab and verify the collection is the ONLY pending movement,
 *      for exactly the amount that was collected.
 *   6. Tick it and declare the calculated balance → the drawer balances.
 *   7. Confirm the close → no difference dialog, no GL Item Difference needed.
 *   8. Verify the close lands in the Reconciliaciones tab as "Completado" with NO page refresh.
 *   9. Reload and verify, from the backend's own payloads, that the balance carried forward, no
 *      draft was left behind and the movement is no longer pending.
 *
 * Why it creates its own account instead of using the seeded "Caja": a fresh drawer starts with an
 * initial balance of 0 and zero movements, so the expected figures are exact rather than derived
 * from whatever the tenant happens to hold, and the spec is repeatable — it never consumes shared
 * seed data. It also covers the account wizard's own contract: `FinancialAccountSupport`
 * auto-assigns Efectivo to every type-'C' account on creation, which is precisely what makes
 * step 4 possible.
 *
 * A sales invoice (not a purchase one) on purpose: the collection is money coming IN, so the drawer
 * ends up with a POSITIVE counted balance — the way a cash desk actually reads. Paying a purchase
 * invoice would leave the only movement as an outflow and the balanced close would have to declare
 * a negative balance.
 *
 * Every figure asserted comes from the backend's JSON (captured from the app's own requests), never
 * from parsing formatted currency out of the DOM — the formatting is covered by unit tests, and
 * re-parsing "1.234,56 €" here would only add locale brittleness. The two UI-level assertions about
 * the arithmetic are deliberately boolean (`cash-close-unbalanced-note` before declaring,
 * `cash-close-balanced-pill` after), which is what proves the live recalculation without pinning a
 * number to a locale.
 *
 * Requires a live Etendo backend + a provisioned tenant. Gated by E2E_FINANCE_INTEGRATION=1
 * (domain-level flag, same shape as E2E_SALES_INTEGRATION), exported by scripts/run-e2e-full.sh.
 */

const RUN_INTEGRATION = process.env.E2E_FINANCE_INTEGRATION === '1';

/** Same tolerance the frontend (cashCloseMath) and the backend (CashCloseHandler) use. */
const TOLERANCE = 0.005;

const onboardingCreds = loadCredentials();

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Resolves with the `response.data` payload of the next NEO response whose URL matches.
 *
 * Reading the app's OWN traffic rather than issuing a parallel `fetch` keeps the assertions on the
 * exact bytes the UI rendered, and sidesteps having to reconstruct `getApiBase()`'s build-time
 * `VITE_API_BASE` inside `page.evaluate`.
 */
function waitForNeoData(page, matcher, { method = 'GET', timeout = 60_000 } = {}) {
  return page
    .waitForResponse(
      // Deliberately NOT filtered by status: a rejected request must fail this test with the
      // backend's own message, not stall until the timeout. Requiring `status() === 200` here is
      // what turned an immediate HTTP 400 ("No 'REC' document type configured for organization…")
      // into a 3-minute "waiting for event response" hang with nothing to diagnose.
      (resp) => matcher(resp.url()) && resp.request().method() === method,
      { timeout },
    )
    .then(async (resp) => {
      const body = await resp.text();
      if (!resp.ok()) {
        throw new Error(`${method} ${resp.url()} → HTTP ${resp.status()}: ${body.slice(0, 600)}`);
      }
      try {
        return JSON.parse(body)?.response?.data ?? null;
      } catch {
        throw new Error(`${method} ${resp.url()} → non-JSON body: ${body.slice(0, 200)}`);
      }
    });
}

const isCashPending = (url) => url.includes('/sws/neo/cash-close') && url.includes('action=pending');
const isCashConfirm = (url) => url.includes('/sws/neo/cash-close') && url.includes('action=confirm');
const isReconciliations = (url) => url.includes('/sws/neo/financial-account/reconciliations');

/**
 * Creates a cash account through the wizard and returns its name.
 *
 * Cash is the wizard's short path — picking the type jumps straight to the form (no bank
 * connection, no institution), and the form only asks for a name: the currency arrives prefilled
 * from `fetchDefaults`, and IBAN/BIC are bank-only fields.
 */
async function createCashAccount(page, name) {
  await navigateTo(page, 'financial-account');
  await expect(page.getByTestId('cuentas-card')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('cuentas-new-account-button').click();
  await expect(page.getByTestId('new-account-wizard')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('new-account-type-C').click();
  const nameInput = page.getByTestId('account-form-name');
  await expect(nameInput, 'Cash type must jump straight to the form').toBeVisible({ timeout: 10_000 });
  await nameInput.fill(name);

  const submit = page.getByTestId('account-form-submit');
  await expect(submit, 'Submit stays disabled until name + currency are set').toBeEnabled({ timeout: 10_000 });
  await submit.click();

  await expect(page.getByTestId('new-account-wizard')).toBeHidden({ timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  return name;
}

/** Opens an account from the list by name, using the toolbar search, and returns its record id. */
async function openAccountByName(page, name) {
  await navigateTo(page, 'financial-account');
  await expect(page.getByTestId('cuentas-card')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('cuentas-search-input').fill(name);
  await page.waitForTimeout(1_000);

  const row = page.locator('tr[data-testid^="row-"]').filter({ hasText: name }).first();
  await expect(row, `the account "${name}" should be in the list`).toBeVisible({ timeout: 20_000 });
  await row.click();

  await expect(page).toHaveURL(/\/financial-account\/[A-Za-z0-9]+/, { timeout: 20_000 });
  const accountId = page.url().match(/\/financial-account\/([A-Za-z0-9]+)/)?.[1];
  expect(accountId, `could not read the account id out of ${page.url()}`).toBeTruthy();
  return accountId;
}

/** Picks an option of a CreatableSearchSelect by its visible text. */
async function pickSelectorOption(page, fieldKey, pattern, description) {
  await openSelectorField(page, fieldKey);
  const option = page.locator(`[data-testid^="option-${fieldKey}-"]`)
    .filter({ hasText: pattern })
    .filter({ hasNotText: /crear|create/i })
    .first();
  await expect(option, description).toBeVisible({ timeout: 15_000 });
  await option.click();
  await slow(page);
}

test.describe('Cash close (real backend)', () => {
  test.describe.configure({ timeout: 600_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_FINANCE_INTEGRATION=1 to run the live financial-account integration tests.',
  );

  test('Case 1: happy path — sales invoice collected in cash, drawer balances, close completes', async ({ page }) => {
    // ETP-4567 — open the accounting period for the doc types this flow
    // confirms, instead of timing out ~10s later on an unrelated UI
    // element with a confusing generic Playwright timeout.
    await ensureOpenPeriod();

    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;
    const accountName = `Caja E2E ${Date.now()}`;

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 1: Log in
    // ═════════════════════════════════════════════════════════════════════════

    await login(page, { user, password });
    await expect(page, 'Login should redirect to /dashboard').toHaveURL(/dashboard/, { timeout: 30_000 });
    await slow(page);

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 2: Create a brand-new cash account
    // ═════════════════════════════════════════════════════════════════════════

    await createCashAccount(page, accountName);

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 3: Create a sales invoice with one line and confirm it
    // ═════════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'sales-invoice');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.getByTestId('action-new').click();
    await waitForDetailReady(page);

    await selectBusinessPartner(page);

    // Efectivo on the invoice itself, not just on the collection: a cash sale carries the cash
    // payment method, and it is what the payment modal then defaults to. Set AFTER the business
    // partner, whose callout fills payment terms/method with the customer's own defaults and would
    // otherwise overwrite this.
    await pickSelectorOption(page, 'paymentMethod', /efectivo|cash/i,
      'Efectivo should be offered as the invoice payment method');

    await saveDraft(page);
    await expect(page,
      'After saving, the URL should include the invoice record id',
    ).toHaveURL(/\/sales-invoice\/[a-zA-Z0-9]+/, { timeout: 20_000 });
    const invoiceId = page.url().match(/\/sales-invoice\/([a-zA-Z0-9]+)/)?.[1];
    expect(invoiceId, `could not read the invoice id out of ${page.url()}`).toBeTruthy();
    await waitForDetailReady(page);

    await addProductLine(page, { isFirst: true });

    // Saving a line with Enter leaves a FRESH, empty inline-add row open for rapid entry. Escape
    // closes it, so the confirm below does not run against a dirty row — and so the line count is
    // read off the saved lines only.
    await page.keyboard.press('Escape');
    await slow(page);

    // The tab badge counts the SAVED lines. Counting `tbody tr` instead would also pick up the
    // inline-add row (that is what made this assertion fail with 2 instead of 1).
    await expect(page.getByRole('button', { name: /líneas\s+1|lines\s+1/i }),
      'The invoice should have exactly 1 saved line',
    ).toBeVisible({ timeout: 15_000 });

    await clickConfirmButton(page);
    // Precise wait for the sales-invoice documentAction confirmation itself — the generic
    // waitForConfirmResponse() resolves on ANY successful NEO write and can race ahead of the
    // actual confirmation request, letting the pill assertion below read the stale "Borrador"
    // status before the invoice has actually finished completing on the backend.
    await waitForDocumentActionResponse(page, 'sales-invoice');
    await dismissSuccessModal(page);

    // Confirming navigates back to the invoice list, so go back to the record by id instead of
    // hunting for it in the grid — the payment badge lives on the detail view.
    await page.goto(`/sales-invoice/${invoiceId}`);
    await waitForDetailReady(page);
    await expectStatusPill(page, /completado|registrado|booked|completed/i,
      'The invoice should be Completed before it can be collected');

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 4: Collect it in full, in cash, into the new account
    // ═════════════════════════════════════════════════════════════════════════

    // The payment UI is two-step: the topbar badge opens the payment history, whose add button
    // ("Añadir cobro" on a sales invoice, "Añadir pago" on a purchase one) opens the entry modal.
    // Located by testid rather than by label, so it is neither locale- nor side-dependent.
    const paymentBadge = page.getByTestId('payment-status-badge');
    await expect(paymentBadge,
      'A completed invoice with an outstanding amount shows the payment badge',
    ).toBeVisible({ timeout: 15_000 });
    await paymentBadge.click();
    await slow(page);

    const addPaymentBtn = page.getByTestId('InvoicePaymentHistoryModal__add-btn');
    await expect(addPaymentBtn).toBeVisible({ timeout: 15_000 });
    await addPaymentBtn.click();

    const paymentModal = page.getByTestId('cp-new-payment-modal');
    await expect(paymentModal).toBeVisible({ timeout: 20_000 });

    // The amount arrives prefilled with the invoice's outstanding total. That figure is the exact
    // amount the drawer must end up holding, so it drives every assertion from here on.
    const amountInput = page.getByTestId('cp-amount-input');
    await expect(amountInput).toBeVisible({ timeout: 10_000 });
    const collectedAmount = round2(parseAmount(await amountInput.inputValue()));
    expect(collectedAmount,
      'The collection amount should be prefilled with the invoice outstanding',
    ).toBeGreaterThan(0);

    // Efectivo first: the account list is filtered by the chosen method, and the account select is
    // keyed on it (so it remounts). Picking the account before the method would lose the choice.
    await pickSelectorOption(page, 'paymentMethod', /efectivo|cash/i,
      'Efectivo should be offered as a payment method');
    await pickSelectorOption(page, 'account', accountName,
      'A type-C account must be collectable in cash — FinancialAccountSupport assigns Efectivo on creation');

    const paymentConfirm = page.getByTestId('cp-confirm');
    await expect(paymentConfirm).toBeEnabled({ timeout: 10_000 });
    await paymentConfirm.click();
    await waitForConfirmResponse(page);
    await page.waitForTimeout(3_000);

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 5: The collection is the only pending movement of the new drawer
    // ═════════════════════════════════════════════════════════════════════════

    const accountId = await openAccountByName(page, accountName);

    const reconciliationTab = page.getByTestId('detail-tab-reconciliation');
    await expect(reconciliationTab).toBeVisible({ timeout: 20_000 });
    // Tab strip proves the account was resolved as Cash: Statements is bank-only, the
    // Reconciliations history is cash-only (DetailTabs TAB_DEFS).
    await expect(page.getByTestId('detail-tab-reconciliation-list')).toBeVisible();
    await expect(page.getByTestId('detail-tab-statements')).toHaveCount(0);

    const pendingPromise = waitForNeoData(page, isCashPending);
    await reconciliationTab.click();
    const pending = await pendingPromise;

    await expect(page.getByTestId('cash-close-tab')).toBeVisible({ timeout: 20_000 });

    const movements = Array.isArray(pending?.movements) ? pending.movements : [];
    expect(
      movements.length,
      'Processing the collection must have written exactly one transaction into this brand-new '
      + `drawer. Got ${movements.length}: ${JSON.stringify(movements)}`,
    ).toBe(1);

    const movement = movements[0];
    // A sales collection enters the drawer, so the signed amount (deposit - payment) is positive.
    expect(Number(movement.amount),
      'The pending movement should be the cash collection, as an inflow',
    ).toBeCloseTo(collectedAmount, 2);
    // A fresh account has no previous close and an initial balance of 0.
    expect(Number(pending?.openingBalance), 'A brand-new drawer opens at 0').toBeCloseTo(0, 2);
    expect(pending?.draft ?? null, 'A brand-new drawer has no draft close').toBeNull();

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 6: Tick it and declare the calculated balance
    // ═════════════════════════════════════════════════════════════════════════

    const movementCheckbox = page.getByTestId(`cash-close-check-${movement.id}`);
    await expect(movementCheckbox).toBeVisible({ timeout: 15_000 });
    await movementCheckbox.click();

    await expect(page.getByTestId('cash-close-marked-footer')).toContainText(
      /1\s+(de|of)\s+1/, { timeout: 10_000 },
    );

    // Opening 0 plus the single inflow: what the drawer should be holding once counted. Declaring
    // exactly that is what makes the close balance — the point of this test.
    const calculated = round2(0 + Number(movement.amount));

    const declaredInput = page.getByTestId('cash-close-declared-balance');
    // Empty box parses as a declared 0, so the close starts out unbalanced.
    if (Math.abs(calculated) >= TOLERANCE) {
      await expect(page.getByTestId('cash-close-unbalanced-note')).toBeVisible({ timeout: 10_000 });
    }

    // `parseDeclaredAmount` reads "-47.96" as a decimal point (a single dot + 1-2 digits), so a
    // plain toFixed(2) is locale-independent here.
    await declaredInput.fill(calculated.toFixed(2));

    // The summary recomputes on every keystroke: declaring exactly the calculated balance zeroes
    // the difference and flips the panel to its balanced state.
    await expect(page.getByTestId('cash-close-balanced-pill')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('cash-close-unbalanced-note')).toHaveCount(0);

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm — a balanced close skips the difference dialog
    // ═════════════════════════════════════════════════════════════════════════

    const confirmPromise = waitForNeoData(page, isCashConfirm, { method: 'POST', timeout: 180_000 });
    await page.getByTestId('cash-close-confirm').click();
    const confirmData = await confirmPromise;

    // The dialog only exists to warn about an adjustment transaction; a balanced close has none —
    // and this account has no GL Item Difference configured, so an unbalanced one would be rejected.
    await expect(page.getByTestId('cash-close-confirm-dialog')).toHaveCount(0);

    expect(confirmData?.confirmed, JSON.stringify(confirmData)).toBe(true);
    expect(Number(confirmData?.updatedBalance)).toBeCloseTo(calculated, 2);
    const reconciliationId = confirmData?.reconciliationId;
    expect(reconciliationId, JSON.stringify(confirmData)).toBeTruthy();

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /Cierre de caja confirmado|Cash close confirmed/i }),
    ).toBeVisible({ timeout: 20_000 });

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 8: The close appears in the Reconciliations tab WITHOUT a page refresh
    // ═════════════════════════════════════════════════════════════════════════

    // The reconciliations list is fetched by the window, not by the tab, so confirming has to
    // reload it explicitly (`onCloseSuccess`). It did not, and the close only showed up after the
    // user refreshed the page by hand — hence this assertion runs before any navigation.
    await page.getByTestId('detail-tab-reconciliation-list').click();
    const liveRow = page.getByTestId(`reconciliation-row-${reconciliationId}`);
    await expect(liveRow).toBeVisible({ timeout: 20_000 });
    await expect(liveRow).toContainText(/Completado|Completed/i);

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 9: Re-read the account from the backend after a full page load
    // ═════════════════════════════════════════════════════════════════════════

    // A fresh navigation (not just the component's own reload) proves the close was persisted,
    // rather than only reflected in local state.
    const pendingAfterPromise = waitForNeoData(page, isCashPending);
    const reconciliationsPromise = waitForNeoData(page, isReconciliations);
    await page.goto(`/financial-account/${accountId}?tab=reconciliation`);
    const pendingAfter = await pendingAfterPromise;
    const reconciliationsAfter = await reconciliationsPromise;

    // The confirmed close's ending balance becomes the opening balance of the next one — this is
    // the account balance moving forward, read back from the server.
    expect(Number(pendingAfter?.openingBalance)).toBeCloseTo(calculated, 2);
    // Nothing left in draft: the document was completed, not parked.
    expect(pendingAfter?.draft ?? null).toBeNull();
    // The closed movement is no longer available to close, and nothing else took its place.
    expect(pendingAfter?.movements ?? [],
      'A drawer whose only movement was just closed has nothing left pending',
    ).toHaveLength(0);

    // The reconciliation document itself, straight from the generic CRUD entity.
    const reconciliationRows = Array.isArray(reconciliationsAfter)
      ? reconciliationsAfter
      : (reconciliationsAfter?.rows ?? []);
    const closed = reconciliationRows.find((r) => r.id === reconciliationId);
    expect(closed, `reconciliation ${reconciliationId} not in ${JSON.stringify(reconciliationRows)}`)
      .toBeTruthy();
    expect(closed.documentStatus).toBe('CO');
    expect(Number(closed.endingBalance)).toBeCloseTo(calculated, 2);
  });
});
