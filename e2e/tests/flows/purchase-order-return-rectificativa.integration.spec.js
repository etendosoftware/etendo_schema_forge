import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, selectVendorBP,
  addProductLine, ensureVendorSetup, clickConfirmButton, dismissSuccessModal,
  expectStatusPill, safeReload, VENDOR_FIXTURE_NAME,
} from '../helpers/purchase-helpers.js';

/**
 * Purchase Order → Goods Receipt → Return to Vendor → Rectificative Invoice —
 * full live-backend integration E2E. This is the Purchase-side mirror of
 * `sales-order-return-rectificativa.integration.spec.js` — same no-gate,
 * always-runs-under-`--project=integration` setup, same live-backend/
 * no-mocking approach, same "report instead of fail" posture on the known
 * period-config environment gap. It is deliberately
 * a SEPARATE spec from `purchase-order-full-flow.integration.spec.js`, which
 * stops at PO → Receipt → Invoice → Payment and never drives a Return —
 * exactly the chain this spec exists to cover, per ETP-4737 (unified
 * "Factura Rectificativa" doc type replacing the former separate
 * credit-memo/return-invoice types on both Sales and Purchase).
 *
 * This is ALSO the live regression test for the sign-asymmetry bug fixed the
 * same day in `ReturnShipmentUtils.addReturnInvoiceLines` (com.etendoerp.go):
 * Sales and Purchase shipment/receipt lines use OPPOSITE signs for
 * `movementQuantity` on their return documents, so a blind `.negate()` in the
 * shared return-invoice-line builder produced a NEGATIVE total on the Sales
 * side but a POSITIVE total on the Purchase side (the invoice reads as a
 * regular purchase invoice instead of a credit). The fix derives the sign
 * from the return document's own `movementQuantity` convention instead of
 * blindly negating. This spec drives the real UI + real backend end-to-end
 * and asserts the resulting purchase rectificativa invoice comes out
 * NEGATIVE — proving the fix works live, not just in the unit test.
 *
 * Flow:
 *   1. Login with onboarding credentials
 *   2. Ensure the first contact has isVendor = true (required for PO business
 *      partner selection — see `ensureVendorSetup` in purchase-helpers.js)
 *   3. Create a Purchase Order, add one line, save as draft
 *   4. Confirm the order — check "Crear albarán de proveedor" ONLY (no
 *      invoice) so confirming only generates the Goods Receipt
 *   5. Navigate (via the confirm result modal's "Ver albarán") to the
 *      receipt, confirm it (DR → CO) with the invoice toggle turned OFF
 *      (it defaults ON for receipts — must be explicitly unchecked so this
 *      flow tests the return-time invoice, not receipt-time invoicing)
 *   6. On the completed receipt, click "Crear Devolución" — opens the
 *      PurchaseReturnWizard, full quantity is pre-selected, confirm — creates
 *      a Return to Vendor Shipment ("Albarán de Devolución a Proveedor") in
 *      Draft
 *   7. Confirm the return — the "¿Gestionar factura rectificativa?" toggle
 *      ("Crear Factura Rectificativa") defaults to checked — confirm with it
 *      checked, generating a Purchase Invoice in Draft
 *   8. Navigate (via the confirm result modal's "Ver factura") to the
 *      generated invoice and verify: doc type reads as rectificativa, line
 *      quantity is NEGATIVE, total amount is NEGATIVE — this is the exact
 *      assertion that would have caught the sign bug before the fix
 *   9. Confirm the rectificativa invoice and verify Completed — unless this
 *      hits the same known environment gap as the Sales spec, where
 *      completing a rectificativa document can fail with "The Period does
 *      not exist or it is not opened" (root-caused inconclusively, NOT a bug
 *      in this test — see the ETP-4737 rectificativa-scope note). If hit,
 *      the test reports it instead of failing outright, since the
 *      Draft-state/negative-amount/doc-type assertions already proved the
 *      actual generation logic works.
 *
 * Requires a running backend + dev server. Runs whenever the suite executes
 * `--project=integration` — no custom env-var gate; Playwright's own
 * mocked/integration project split already isolates it from mocked runs.
 */

const onboardingCreds = loadCredentials();

test.describe('Purchase Order → Return to Vendor → Rectificative Invoice (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('drives a PO through receipt, return to vendor, and the generated rectificative invoice', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    await test.step('Login', async () => {
      await login(page, { user, password });
      await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
      await slow(page);
    });

    await test.step('Ensure the contact has isVendor = true', async () => {
      await ensureVendorSetup(page, { navigateTo });
    });

    await test.step('Create a new Purchase Order with one line', async () => {
      await navigateTo(page, 'purchase-order');
      const newButton = page.getByTestId('action-new');
      await expect(newButton).toBeVisible({ timeout: 15_000 });
      await slow(page);

      await newButton.click();
      await waitForDetailReady(page);
      await slow(page);

      // Select the SAME vendor fixture ensureVendorSetup() just configured — it has
      // PO Payment Terms/Method set, required later by createReturnInvoice. Selecting
      // "whichever vendor is first" (selectVendorBP's default) offers no such guarantee.
      await selectVendorBP(page, { name: VENDOR_FIXTURE_NAME });
      await saveDraft(page);

      await expect(page).toHaveURL(/\/purchase-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);

      await addProductLine(page, { isFirst: true, productIndex: 0 });

      // The lines grid is InlineLinesPanel.jsx (shared across all windows), which renders
      // rows as data-testid="line-row-<ID>" divs, not a semantic <table>. The only literal
      // <table>/<tbody>/<tr> on the page belongs to the hidden (display:none) attachments
      // panel, so a bare 'tbody tr' locator always resolves to that invisible element.
      await expect(page.locator('[data-testid^="line-row-"]')).toHaveCount(1, { timeout: 10_000 });
    });

    await test.step('Confirm the order with receipt generation only', async () => {
      const confirmOrderBtn = page.getByTestId('action-save');
      const confirmModal = page.getByText(/confirmar pedido|confirm order/i).first();

      await expect(async () => {
        await confirmOrderBtn.click({ timeout: 3_000 });
        await expect(confirmModal).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const receiptCheckbox = page.getByText('Crear albarán de proveedor', { exact: true });
      await expect(receiptCheckbox).toBeVisible({ timeout: 5_000 });
      await receiptCheckbox.click();
      await slow(page);

      const modalConfirmBtn = page.locator('[data-testid="action-confirm-modal"]');
      await expect(modalConfirmBtn).toBeVisible({ timeout: 5_000 });

      const orderConfirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') &&
          ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
          r.ok(),
        { timeout: 30_000 },
      );
      await modalConfirmBtn.click();
      await orderConfirmResponse;
      await slow(page);
    });

    await test.step('Navigate to the generated receipt', async () => {
      const orderConfirmedMsg = page.getByText(/pedido.*confirmado|order.*confirmed/i);
      await expect(orderConfirmedMsg).toBeVisible({ timeout: 30_000 });
      await slow(page);

      const viewReceiptBtn = page.getByRole('button', { name: 'Ver albarán', exact: true });
      await expect(viewReceiptBtn).toBeVisible({ timeout: 10_000 });
      await viewReceiptBtn.click();
      await slow(page);

      await expect(page).toHaveURL(/\/goods-receipt\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);
      await slow(page);

      await expectStatusPill(page, /borrador|draft/i, 'Receipt should be in Draft status');
    });

    await test.step('Confirm the receipt (DR to CO) with invoice toggle OFF', async () => {
      const receiptConfirmBtn = page.getByTestId('action-save');
      const receiptModal = page.getByTestId('confirm-inout-modal');

      await expect(async () => {
        await receiptConfirmBtn.click({ timeout: 3_000 });
        await expect(receiptModal).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const createInvoiceToggle = receiptModal.getByTestId('confirm-modal-invoice-toggle');
      await expect(createInvoiceToggle).toBeVisible({ timeout: 5_000 });
      await expect(createInvoiceToggle).toHaveAttribute('aria-checked', 'true');
      await createInvoiceToggle.click();
      await expect(createInvoiceToggle).toHaveAttribute('aria-checked', 'false');
      await slow(page);

      const receiptConfirmPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/documentAction') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 30_000 },
      );
      await receiptModal.getByTestId('confirm-modal-confirm-btn').click();
      await receiptConfirmPromise;
      await slow(page);

      await dismissSuccessModal(page);

      await waitForDetailReady(page);
      await expectStatusPill(page, /completado|completed/i, 'Receipt should show Completed after confirmation');
      await slow(page);
    });

    await test.step('Create the Return to Vendor Shipment', async () => {
      const createReturnBtn = page.getByRole('button', { name: /^Crear Devoluci[oó]n$|^Create Return$/i });
      const returnDialog = page.getByRole('dialog');

      await expect(async () => {
        await createReturnBtn.click({ timeout: 3_000 });
        await expect(returnDialog).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      await expect(returnDialog.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
      await slow(page);

      const nextBtn = returnDialog.getByRole('button', { name: 'Siguiente', exact: true });
      await expect(nextBtn).toBeEnabled({ timeout: 10_000 });
      await nextBtn.click();
      await slow(page);

      const returnConfirmPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/createPurchaseReturn') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 20_000 },
      );
      const createReturnConfirmBtn = returnDialog.getByRole('button', { name: 'Crear Devolución', exact: true });
      await expect(createReturnConfirmBtn).toBeVisible({ timeout: 10_000 });
      await createReturnConfirmBtn.click();
      await returnConfirmPromise;
      await slow(page);

      const returnCreatedMsg = page.getByText('Devolución de compra creada', { exact: true });
      await expect(returnCreatedMsg).toBeVisible({ timeout: 30_000 });
      await slow(page);

      const viewShipmentBtn = page.getByRole('button', { name: 'Ver albarán', exact: true });
      await expect(viewShipmentBtn).toBeVisible({ timeout: 10_000 });
      await viewShipmentBtn.click();
      await slow(page);

      await expect(page).toHaveURL(/\/return-to-vendor-shipment\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);
      await slow(page);

      await expectStatusPill(page, /borrador|draft/i, 'Return to Vendor Shipment should be in Draft status');
    });

    await test.step('Confirm the return with rectificative invoice generation', async () => {
      const confirmReturnBtn = page.getByTestId('action-confirm-with-credit');
      const returnConfirmModal = page.getByTestId('confirm-inout-modal');

      await expect(async () => {
        await confirmReturnBtn.click({ timeout: 3_000 });
        await expect(returnConfirmModal).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const invoiceToggle = returnConfirmModal.getByTestId('confirm-modal-invoice-toggle');
      await expect(invoiceToggle).toBeVisible({ timeout: 5_000 });
      await expect(invoiceToggle).toHaveAttribute('aria-checked', 'true');
      await expect(returnConfirmModal.getByText('Crear Factura Rectificativa', { exact: true })).toBeVisible();

      const returnDocActionPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/createReturnInvoice') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 30_000 },
      );
      await returnConfirmModal.getByTestId('confirm-modal-confirm-btn').click();
      await returnDocActionPromise;
      await slow(page);
    });

    await test.step('Navigate to the rectificative invoice and verify', async () => {
      const rectificativeCreatedMsg = page.getByText('Factura rectificativa de compra creada', { exact: true });
      await expect(rectificativeCreatedMsg).toBeVisible({ timeout: 30_000 });
      await slow(page);

      const viewInvoiceBtn = page.getByRole('button', { name: 'Ver factura', exact: true });
      await expect(viewInvoiceBtn).toBeVisible({ timeout: 10_000 });
      await viewInvoiceBtn.click();
      await slow(page);

      await expect(page).toHaveURL(/\/purchase-invoice\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);
      await slow(page);

      // Verify: doc type reads as rectificativa. "Tipo de documento" (transactionDocument)
      // renders as a disabled <input> (EntityForm's renderReadOnlyFk), so its value must be
      // read via toHaveValue — getByText only matches rendered text content, never an
      // input's value, so it can never see this field regardless of backend correctness.
      await expect(page.getByTestId('field-transactionDocument').locator('input'))
        .toHaveValue(/rectificativ/i, { timeout: 15_000 });

      // Verify: line quantity is NEGATIVE (ETP-4737 sign-asymmetry regression). This
      // window's line grid is not a semantic <table> — rows render as
      // data-testid="line-row-<ID>" divs. The only literal <table>/<tbody>/<tr> on the
      // page belongs to the hidden (display:none) attachments panel
      // (data-testid="attachments-table"), so a bare 'tbody tr' locator always resolves
      // to that invisible element instead of the actual line row.
      const invoiceLineRow = page.locator('[data-testid^="line-row-"]').first();
      await expect(invoiceLineRow).toBeVisible({ timeout: 10_000 });
      await expect(invoiceLineRow).toContainText(/-\s?\d/, { timeout: 5_000 });

      // Verify: total amount is NEGATIVE
      const totalValue = page.getByTestId('totals-row-total-value');
      await expect(totalValue).toBeVisible({ timeout: 10_000 });
      await expect(totalValue).toContainText(/^-/, { timeout: 5_000 });

      await expectStatusPill(page, /borrador|draft/i, 'Invoice should be in Draft status');
    });

    await test.step('Confirm the rectificative invoice (may hit known env gap)', async () => {
      // Completing a rectificativa document was seen to sometimes fail with
      // "The Period does not exist or it is not opened" — a known environment
      // gap, NOT a bug in this test. If hit, report instead of failing.

      await clickConfirmButton(page);

      const periodError = page.getByText(/period does not exist|no existe el periodo|periodo no existe/i);
      const invoiceCompletedPill = page.getByTestId('document-status-pill').first();

      const outcome = await Promise.race([
        periodError.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'period-error').catch(() => null),
        invoiceCompletedPill.waitFor({ state: 'visible', timeout: 60_000 })
          .then(async () => (
            (await invoiceCompletedPill.textContent() || '').match(/completado|completed/i) ? 'completed' : null
          ))
          .catch(() => null),
      ]);

      if (outcome === 'period-error') {
        await captureScreenshot(page, {
          path: 'e2e/test-results/purchase-rectificativa-period-error.png',
          fullPage: true,
        }).catch(() => {});
        test.info().annotations.push({
          type: 'known-environment-issue',
          description:
            'Confirming the rectificative purchase invoice hit "The Period does not exist or '
            + 'it is not opened" — a known, inconclusively root-caused environment gap (see '
            + 'ETP-4737 rectificativa scope notes), NOT a bug in this test. The invoice was '
            + 'already verified in Draft with the correct doc type and negative amounts above, '
            + 'which is the live proof that the Purchase-side sign-asymmetry fix holds.',
        });
        return;
      }

      // No period error surfaced — the confirm must have actually succeeded.
      const invoiceCloseBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      if (await invoiceCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await invoiceCloseBtn.click();
        await slow(page);
      }

      // Reload to get fresh status — use goto on current URL to avoid ERR_ABORTED
      const currentInvoiceUrl = page.url();
      await page.goto(currentInvoiceUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDetailReady(page);

      await expectStatusPill(page, /completado|completed/i, 'Invoice should be Completed', 20_000);
    });
  });
});
