import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../../helpers/auth.js';
import { captureScreenshot } from '../../helpers/captureScreenshot.js';
import { ensureProductSetup, PRODUCT_FIXTURE_ALPHA } from '../../helpers/product-helpers.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, selectVendorBP,
  addProductLine, ensureVendorSetup, dismissSuccessModal,
  expectStatusPill, expectDocumentStatus, pickRectifiableInvoice,
  VENDOR_FIXTURE_NAME,
} from '../../helpers/purchase-helpers.js';

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
 *      ("Crear Factura Rectificativa") defaults to checked. Because step 5
 *      left the receipt uninvoiced, the backend's chain detection finds no
 *      candidate, so ETP-5381 preselects nothing and the confirm button stays
 *      disabled until an invoice to rectify is PICKED by hand — which is the
 *      manual-pick path this spec now also covers. Confirming then generates
 *      the Purchase Invoice.
 *   8. Navigate (via the confirm result modal's "Ver factura") to the
 *      generated invoice and verify: doc type reads as rectificativa, line
 *      quantity is NEGATIVE, total amount is NEGATIVE — this is the exact
 *      assertion that would have caught the sign bug before the fix
 *   9. Verify the rectificativa invoice arrived ALREADY Completed — ETP-5381
 *      creates and confirms it in one step, so it has no draft stage and
 *      renders no Confirmar action. A closed accounting period therefore
 *      fails the createReturnInvoice call in step 7, not a later confirm.
 *
 * <p>PRECONDITION worth knowing: the rectifiable-invoice candidates are
 * filtered by business partner and transaction side
 * (RectifiableInvoiceUtils), so this flow needs at least one CONFIRMED
 * purchase invoice for `E2E Vendor Fixture` to exist. In an
 * `--project=integration` run that is satisfied by
 * `purchase-order-full-flow.integration.spec.js`, which runs earlier
 * (workers: 1, alphabetical) against the same vendor fixture. Run this spec
 * alone against a tenant that has none and `pickRectifiableInvoice` fails
 * fast naming exactly that.
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

    // ETP-5079: the onboarding dataset no longer seeds any visible product, so the
    // single line below has nothing to pick unless the suite provisions its own
    // fixture first. One fixture is enough here — this flow only ever adds one
    // line. See e2e/tests/helpers/product-helpers.js.
    await ensureProductSetup(page, PRODUCT_FIXTURE_ALPHA);

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

      await addProductLine(page, { isFirst: true, productName: PRODUCT_FIXTURE_ALPHA.name });

      // The lines grid is InlineLinesPanel.jsx (shared across all windows), which renders
      // rows as data-testid="line-row-<ID>" divs, not a semantic <table>. The only literal
      // <table>/<tbody>/<tr> on the page belongs to the hidden (display:none) attachments
      // panel, so a bare 'tbody tr' locator never matches this window's grid.
      //
      // That is why the wait below has to be generous, and why it is the FIRST real
      // gate on the line existing at all: addProductLine() ends on
      // `expect(page.locator('tbody tr').first()).toBeVisible()`, which for this window
      // is satisfied by an unrelated table and therefore returns before the line has
      // rendered here. The observed flake was this assertion timing out with the
      // locator resolving to 0 elements for its whole budget — the row arrives late,
      // it does not flash and re-render — so the fix is a longer budget on the right
      // locator, plus the settle below to catch a late re-render on top of that.
      const rectLines = page.locator('[data-testid^="line-row-"]');
      await expect(rectLines,
        'The saved line should render in the InlineLinesPanel grid',
      ).toHaveCount(1, { timeout: 45_000 });
      await page.getByText(/cargando|loading/i)
        .waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await expect(rectLines,
        'Line count should still read 1 after related panels finish loading',
      ).toHaveCount(1, { timeout: 15_000 });
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

      // ETP-5381: a rectificative invoice cannot be confirmed without declaring
      // which invoice it corrects (ETSG_CHECK_RECTIF_INV_DOC), and it is now
      // confirmed at creation — so the choice has to be made here, up front.
      // `useRectifiableInvoices` preselects ONLY when the backend's chain
      // detection reports exactly one candidate; this flow deliberately confirms
      // the receipt with the invoice toggle OFF, so the chain finds none, nothing
      // is preselected and `confirm-modal-confirm-btn` stays correctly disabled
      // until an invoice is picked by hand. That is the case this step now covers.
      await pickRectifiableInvoice(page, returnConfirmModal);

      const returnDocActionPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/createReturnInvoice') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 30_000 },
      );
      await expect(returnConfirmModal.getByTestId('confirm-modal-confirm-btn'),
        '[ETP-5381] The confirm button should enable once an invoice to rectify is selected',
      ).toBeEnabled({ timeout: 10_000 });
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
      // is a DocumentType-reference FK, so EntityForm renders it two different ways
      // depending on readOnlyLogic: a disabled <input> (renderReadOnlyFk) when the
      // record is locked, or a Radix SelectTrigger <button> with the label as rendered
      // text (SelectorInput's `field-${key}` testid, ETP-4600) when it's editable. Since
      // ETP-5274 this field's readOnlyLogic is `@Processed@='Y'`; since ETP-5381 the
      // invoice arrives already CONFIRMED (Processed='Y'), so it now renders read-only —
      // but read the value generically instead of assuming either shape, since that is
      // exactly the kind of thing that flips back.
      const docTypeField = page.getByTestId('field-transactionDocument');
      await expect(docTypeField).toBeVisible({ timeout: 15_000 });
      await expect(async () => {
        const input = docTypeField.locator('input');
        const displayedValue = (await input.count()) > 0
          ? await input.inputValue()
          : await docTypeField.innerText();
        expect(displayedValue).toMatch(/rectificativ/i);
      }).toPass({ timeout: 15_000 });

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

      // ETP-5381: the rectificative invoice is created AND confirmed in one step by
      // createReturnInvoice, so it arrives Completed — there is no Borrador stage any
      // more. Asserted on the language-independent `data-status` code.
      await expectDocumentStatus(page, 'CO',
        '[ETP-5381] The rectificative purchase invoice should arrive already Completed, not Draft');
    });

    await test.step('The rectificative invoice arrives already confirmed (ETP-5381)', async () => {
      // ETP-5381: createReturnInvoice now creates AND confirms the rectificative invoice
      // in one step, so there is no draft stage left to confirm by hand. A completed
      // draftMode document renders no save-actions row at all
      // (shouldRenderSaveActionsRow in DetailView.jsx), so `action-save` is absent.
      //
      // The known "The Period does not exist or it is not opened" environment gap this
      // step used to tolerate can no longer surface HERE: the completion happens inside
      // the createReturnInvoice POST the previous step already waits on, so a closed
      // period fails that call instead, before an invoice exists to navigate to. The
      // screenshot below is kept for exactly that reason — if the persisted status ever
      // comes back as anything but CO, the page is worth looking at.
      await expect(page.getByTestId('action-save'),
        '[ETP-5381] A document that arrives confirmed must offer no Confirmar action',
      ).toBeHidden({ timeout: 10_000 });

      // Re-read the record from the backend so the asserted status is the PERSISTED one,
      // not what the create response painted. goto on the current URL rather than
      // reload(), to avoid ERR_ABORTED when an internal navigation is still settling.
      const currentInvoiceUrl = page.url();
      await page.goto(currentInvoiceUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDetailReady(page);

      const finalPill = page.getByTestId('document-status-pill').first();
      await expect(finalPill).toBeVisible({ timeout: 15_000 });
      if ((await finalPill.getAttribute('data-status')) !== 'CO') {
        await captureScreenshot(page, {
          path: 'e2e/test-results/purchase-rectificativa-not-confirmed.png',
          fullPage: true,
        }).catch(() => {});
      }
      await expectDocumentStatus(page, 'CO',
        '[ETP-5381] The rectificative purchase invoice should still read Completed after a reload',
        20_000);
      await expectStatusPill(page, /completado|completed/i, 'Invoice should be Completed', 20_000);
    });
  });
});
