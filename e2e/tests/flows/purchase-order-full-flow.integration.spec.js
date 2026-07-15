import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, selectVendorBP,
  addProductLine, ensureVendorSetup, openDraftRow, clickConfirmButton,
  waitForConfirmResponse, dismissSuccessModal, expectStatusPill, safeReload,
  readDocumentTotals, verifyTotalsConsistency,
} from '../helpers/purchase-helpers.js';

/**
 * Purchase Order — Full flow: PO → Goods Receipt → Purchase Invoice.
 *
 * Covers:
 *   - 2.x  Create PO header (BP, address, price list)
 *   - 3.x  Add PO lines
 *   - 6.x  Confirm PO with "Create receipt" (receipt only)
 *   - 14.1 Receipt generated from PO has pre-filled data + lines
 *   - 15.2 Confirm receipt with "Create invoice" → stock enters warehouse + invoice created
 *   - 22.1 Confirm invoice → Completed
 *   - 27.x Full end-to-end flow validation
 *   - Required field validation (empty form save attempt)
 *
 * Flow:
 *   1. Login → ensure vendor → create PO with 2 lines
 *   2. Confirm PO (receipt only, no invoice)
 *   3. Open receipt → confirm with "Create invoice" toggle ON
 *   4. Navigate to invoice via result modal → confirm → verify Completed
 *
 * Gated by E2E_SALES_INTEGRATION=1.
 */

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_SALES_INTEGRATION === '1';

test.describe('Purchase Order — Full flow with receipt and invoice (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live purchase full-flow integration test.',
  );

  test('PO → confirm with receipt → confirm receipt with invoice → confirm invoice', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Login
    // ═══════════════════════════════════════════════════════════════════════

    await login(page, { user, password });
    await expect(page, 'Login should redirect to /dashboard').toHaveURL(/dashboard/, { timeout: 30_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Ensure the contact has isVendor = true
    // ═══════════════════════════════════════════════════════════════════════

    await ensureVendorSetup(page, { navigateTo });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Create PO — validate required fields on empty save
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    await page.getByTestId('action-new').click();
    await waitForDetailReady(page);
    await slow(page);

    // Try to save with empty required fields (no BP, no warehouse)
    const guardarBtn = page.getByRole('button', { name: /guardar|save/i });
    await guardarBtn.click();
    await page.waitForTimeout(2_000);

    // Verify inline "Requerido" validation labels appear
    const requiredCount = await page.getByText('Requerido').count();
    expect(requiredCount,
      '[Validation] At least 2 "Requerido" labels should appear (Contacto, Almacén)',
    ).toBeGreaterThanOrEqual(2);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Fill PO header — select vendor BP
    // ═══════════════════════════════════════════════════════════════════════

    await selectVendorBP(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Save PO as draft
    // ═══════════════════════════════════════════════════════════════════════

    await saveDraft(page);

    await expect(page,
      'After saving, URL should include the PO record ID',
    ).toHaveURL(/\/purchase-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Add two product lines
    // ═══════════════════════════════════════════════════════════════════════

    await addProductLine(page, { isFirst: true, productIndex: 0 });
    await addProductLine(page, { productIndex: 1, quantity: '3' });

    await expect(page.locator('tbody tr'),
      'PO should have 2 lines',
    ).toHaveCount(2, { timeout: 10_000 });

    // Verify PO totals: subtotal > 0, tax > 0, total = subtotal + tax
    const poTotals = await readDocumentTotals(page);
    verifyTotalsConsistency(poTotals, 'PO');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm PO — check only "Create receipt" (no invoice)
    // ═══════════════════════════════════════════════════════════════════════

    await clickConfirmButton(page);

    // Wait for the confirm modal to appear
    const confirmModal = page.getByText(/confirmar pedido|confirm order/i).first();
    await expect(confirmModal,
      'Confirm modal should appear with order summary',
    ).toBeVisible({ timeout: 10_000 });

    // Check only the "Create receipt" checkbox — invoice will be created from the receipt
    const receiptCheckbox = page.getByText(/crear albarán|crear recibo|create receipt/i).first();
    await expect(receiptCheckbox,
      '[Plan 6.1] "Crear albarán de proveedor" should be visible in the confirm modal',
    ).toBeVisible({ timeout: 5_000 });
    await receiptCheckbox.click();
    await slow(page);

    // Click the modal confirm button
    const modalConfirmBtn = page.locator('[data-testid="action-confirm-modal"]');
    await expect(modalConfirmBtn).toBeVisible({ timeout: 5_000 });
    await modalConfirmBtn.click();

    // Wait for API calls (confirm + create receipt)
    await page.waitForTimeout(2_000);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Verify success modal shows the created receipt
    // ═══════════════════════════════════════════════════════════════════════

    const successMsg = page.getByText(/pedido.*confirmado|order.*confirmed/i);
    await expect(successMsg,
      '[Plan 6.2] Success modal should confirm PO was completed and receipt was created',
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/entrada|recibo|receipt/i).first(),
      '[Plan 6.2] Success modal should show a link to the created goods receipt',
    ).toBeVisible({ timeout: 5_000 });

    await dismissSuccessModal(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Navigate to goods-receipt, confirm with "Create invoice"
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'goods-receipt');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    await openDraftRow(page, { label: 'goods receipt' });

    // Verify draft status and 2 lines inherited from PO
    await expectStatusPill(page, /borrador|draft/i,
      '[Plan 14.1] Receipt should be in Draft status');

    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      '[Plan 6.3] Receipt should have 2 lines inherited from the PO',
    ).toBeVisible({ timeout: 10_000 });

    // Click "Confirmar" in the topbar
    await clickConfirmButton(page);

    // The receipt confirm modal should appear with "Create invoice" toggle ON by default
    const receiptModal = page.getByTestId('confirm-inout-modal');
    await expect(receiptModal,
      'Receipt confirm modal should appear',
    ).toBeVisible({ timeout: 10_000 });

    // Verify the toggle is ON by default — do NOT click it (would turn it OFF)
    const createInvoiceToggle = receiptModal.getByTestId('confirm-modal-invoice-toggle');
    await expect(createInvoiceToggle).toBeVisible({ timeout: 5_000 });
    await expect(createInvoiceToggle).toHaveAttribute('aria-checked', 'true');

    // Click the confirm button (will confirm receipt + create invoice)
    const receiptConfirmBtn = receiptModal.getByTestId('confirm-modal-confirm-btn');
    await expect(receiptConfirmBtn).toBeVisible({ timeout: 5_000 });
    await receiptConfirmBtn.click();

    await waitForConfirmResponse(page);
    await page.waitForTimeout(2_000);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Navigate to the invoice via the result modal
    // ═══════════════════════════════════════════════════════════════════════

    // The ConfirmResultModal shows a "Ver factura" button to navigate to the invoice
    const viewInvoiceBtn = page.getByRole('button', { name: /ver factura|view invoice/i });
    await expect(viewInvoiceBtn,
      'Result modal should show "Ver factura" button for the created invoice',
    ).toBeVisible({ timeout: 10_000 });
    await viewInvoiceBtn.click();
    await slow(page);

    // Wait for navigation to the invoice detail view
    await expect(page).toHaveURL(/\/purchase-invoice\//, { timeout: 15_000 });
    await waitForDetailReady(page);

    // Verify invoice is in draft status with 2 lines
    await expectStatusPill(page, /borrador|draft/i,
      'Invoice should be in Draft status');

    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      '[Plan 6.3] Invoice should have 2 lines inherited from the receipt',
    ).toBeVisible({ timeout: 10_000 });

    // Verify invoice totals match the PO totals (same lines, same prices)
    const invoiceTotals = await readDocumentTotals(page);
    verifyTotalsConsistency(invoiceTotals, 'Invoice', poTotals);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: Confirm the invoice
    // ═══════════════════════════════════════════════════════════════════════

    await clickConfirmButton(page);
    await waitForConfirmResponse(page);
    await page.waitForTimeout(2_000);
    await dismissSuccessModal(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12: Verify invoice is Completed
    // ═══════════════════════════════════════════════════════════════════════

    const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);

    if (!onDetailView) {
      await safeReload(page);
      const completedRow = page.locator('tbody tr').filter({ hasText: /completado|completed/i }).first();
      await expect(completedRow,
        '[Plan 22.1] Invoice should appear as Completed in the list view',
      ).toBeVisible({ timeout: 10_000 });
    } else {
      await waitForDetailReady(page);
      await expectStatusPill(page, /completado|registrado|booked|completed/i,
        '[Plan 22.1] Invoice should show Completed after confirmation');

      await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
        'Invoice should still have 2 lines after completion',
      ).toBeVisible({ timeout: 10_000 });
    }

    await slow(page);
  });
});
