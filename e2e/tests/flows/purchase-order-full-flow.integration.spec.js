import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Purchase Order — Full flow: PO → Goods Receipt → Purchase Invoice.
 *
 * Covers Test Plan cases:
 *   - 2.x  Create PO header (BP, address, price list, delivery date)
 *   - 3.x  Add PO lines
 *   - 6.x  Confirm PO with "Create receipt + Create invoice" checked
 *   - 14.1 Receipt generated from PO has pre-filled data
 *   - 15.2 Confirm receipt → stock enters warehouse
 *   - 22.1 Confirm invoice → Completed
 *   - 27.x Full end-to-end flow validation
 *   - Required field validation (empty form save attempt)
 *
 * Flow:
 *   1. Login
 *   2. Ensure contact has isVendor = true
 *   3. Create PO → attempt save with empty required fields → verify error
 *   4. Fill header, add 2 lines, confirm with receipt + invoice checked
 *   5. Navigate to goods-receipt → find the generated receipt → confirm it
 *   6. Navigate to purchase-invoice → find the generated invoice → confirm it
 *   7. Verify all documents are Completed
 *
 * Gated by E2E_SALES_INTEGRATION=1.
 */

function loadCredentials() {
  try {
    const credPath = resolve(import.meta.dirname, '../../.auth-credentials.json');
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (creds.email && creds.password) return creds;
  } catch { /* file doesn't exist */ }
  return null;
}

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_SALES_INTEGRATION === '1';
const SLOW_MS = Number(process.env.E2E_SLOW_MS || 0);

async function slow(page) {
  if (SLOW_MS > 0) await page.waitForTimeout(SLOW_MS);
}

async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view'),
    'Detail view should be visible — page may not have loaded correctly',
  ).toBeVisible({ timeout: 20_000 });
  const spinner = page.getByText(/cargando|loading/i);
  if (await spinner.isVisible({ timeout: 500 }).catch(() => false)) {
    await expect(spinner).toBeHidden({ timeout: 15_000 });
  }
}

function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) &&
      resp.status() >= 200 && resp.status() < 300,
    { timeout: 20_000 },
  );
}

test.describe('Purchase Order — Full flow with receipt and invoice (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live purchase full-flow integration test.',
  );

  test('PO → confirm with receipt+invoice → confirm receipt → confirm invoice', async ({ page }) => {
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

    await navigateTo(page, 'contacts');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    const contactRow = page.locator('tbody tr').first();
    await expect(contactRow).toBeVisible({ timeout: 10_000 });
    await contactRow.click();
    await slow(page);
    await waitForDetailReady(page);

    const financieroTab = page.getByRole('button', { name: /financiero|financial/i });
    await expect(financieroTab).toBeVisible({ timeout: 10_000 });
    await financieroTab.click();
    await page.waitForTimeout(1_000);

    const vendorInput = page.locator('[data-testid*="vendor"]').first();
    const isChecked = await vendorInput.isChecked().catch(() => false);

    if (!isChecked) {
      const vendorSpan = vendorInput.locator('~ span').first();
      if (await vendorSpan.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await vendorSpan.click();
      } else {
        await vendorInput.click({ force: true });
      }
      await page.waitForTimeout(1_000);

      const saveBtn = page.getByTestId('action-save').or(
        page.getByRole('button', { name: /guardar|save/i }),
      ).first();
      await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
      const savePromise = expectSaveResponse(page);
      await saveBtn.click();
      await savePromise;
      await slow(page);
    }

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

    // Verify inline "Requerido" validation labels appear under empty required fields
    const requiredLabels = page.getByText('Requerido');
    const requiredCount = await requiredLabels.count();
    expect(requiredCount,
      '[Validation] At least 2 "Requerido" labels should appear when saving with empty required fields (Contacto, Almacén)',
    ).toBeGreaterThanOrEqual(2);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Fill PO header — select vendor BP
    // ═══════════════════════════════════════════════════════════════════════

    const bpInput = page.getByTestId('field-businessPartner');
    await expect(bpInput).toBeVisible({ timeout: 10_000 });
    await bpInput.click();

    const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(bpOption,
      'At least one vendor option should appear',
    ).toBeVisible({ timeout: 15_000 });
    await bpOption.click();
    await slow(page);

    // Wait for callout
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_000);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Save PO as draft
    // ═══════════════════════════════════════════════════════════════════════

    const saveDraftBtn = page.getByTestId('action-save-draft');
    if (await saveDraftBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const savePromise = expectSaveResponse(page);
      await saveDraftBtn.click();
      await savePromise;
    } else {
      const savePromise = expectSaveResponse(page);
      await guardarBtn.click();
      await savePromise;
    }
    await slow(page);

    await expect(page,
      'After saving, URL should include the PO record ID',
    ).toHaveURL(/\/purchase-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Add two product lines
    // ═══════════════════════════════════════════════════════════════════════

    let emptyStateBtn = page.getByTestId('action-add-lines-empty-state');
    if (!await emptyStateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add lines/i }).first();
    }
    await emptyStateBtn.click();
    await slow(page);

    // Line 1
    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });
    const productField = page.getByTestId('inline-add-field-product');
    await productField.click();
    await slow(page);

    const searchDrawer = page.getByTestId('product-search-drawer');
    await expect(searchDrawer).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-testid^="product-search-option-"]').first().click();
    await slow(page);
    await expect(searchDrawer).toBeHidden({ timeout: 5_000 }).catch(() => {});
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await slow(page);

    const line1Promise = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await line1Promise;
    await slow(page);

    // Line 2
    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });
    await expect(addLineBtn).toBeVisible({ timeout: 10_000 });
    await addLineBtn.click();
    await slow(page);

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('inline-add-field-product').click();
    await slow(page);

    const searchDrawer2 = page.getByTestId('product-search-drawer');
    await expect(searchDrawer2).toBeVisible({ timeout: 10_000 });

    const secondProduct = page.locator('[data-testid^="product-search-option-"]').nth(1);
    if (await secondProduct.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await secondProduct.click();
    } else {
      await page.locator('[data-testid^="product-search-option-"]').first().click();
    }
    await slow(page);
    await expect(searchDrawer2).toBeHidden({ timeout: 5_000 }).catch(() => {});
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await slow(page);

    const qtyField = page.getByTestId('inline-add-field-orderedQuantity');
    if (await qtyField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await qtyField.clear();
      await qtyField.fill('3');
    }

    const line2Promise = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await line2Promise;
    await slow(page);

    await expect(page.locator('tbody tr'),
      'PO should have 2 lines',
    ).toHaveCount(2, { timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm PO — check both "Create receipt" and "Create invoice"
    // ═══════════════════════════════════════════════════════════════════════

    const confirmBtn = page.getByTestId('action-save');
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await slow(page);

    // Wait for the confirm modal to appear
    const confirmModal = page.getByText(/confirmar pedido|confirm order/i).first();
    await expect(confirmModal,
      'Confirm modal should appear with order summary',
    ).toBeVisible({ timeout: 10_000 });

    // Check the "Create receipt" checkbox (📦)
    const receiptCheckbox = page.getByText(/crear albarán|crear recibo|create receipt/i).first();
    await expect(receiptCheckbox,
      '[Plan 6.1] "Crear albarán de proveedor" option should be visible in the confirm modal',
    ).toBeVisible({ timeout: 5_000 });
    await receiptCheckbox.click();
    await slow(page);

    // Check the "Create invoice" checkbox (🧾)
    const invoiceCheckbox = page.getByText(/crear factura|create invoice/i).first();
    await expect(invoiceCheckbox,
      '[Plan 6.1] "Crear factura de compra" option should be visible in the confirm modal',
    ).toBeVisible({ timeout: 5_000 });
    await invoiceCheckbox.click();
    await slow(page);

    // Click the confirm button in the modal
    const modalConfirmBtn = page.locator('[data-testid="action-confirm-modal"]');
    await expect(modalConfirmBtn).toBeVisible({ timeout: 5_000 });
    await modalConfirmBtn.click();

    // Wait for all 3 API calls (confirm + create receipt + create invoice)
    await page.waitForTimeout(2_000);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Verify success modal shows created documents
    // ═══════════════════════════════════════════════════════════════════════

    const successMsg = page.getByText(/pedido.*confirmado|order.*confirmed/i);
    await expect(successMsg,
      '[Plan 6.2] Success modal should confirm the PO was completed and documents were created',
    ).toBeVisible({ timeout: 30_000 });

    // Verify the success modal shows links to the created receipt and invoice
    const receiptLink = page.getByText(/entrada|recibo|receipt/i).first();
    const invoiceLink = page.getByText(/factura.*compra|purchase.*invoice/i).first();
    await expect(receiptLink,
      '[Plan 6.2] Success modal should show a link to the created goods receipt',
    ).toBeVisible({ timeout: 5_000 });
    await expect(invoiceLink,
      '[Plan 6.2] Success modal should show a link to the created purchase invoice',
    ).toBeVisible({ timeout: 5_000 });

    // Close the success modal
    const closeBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await closeBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Navigate to goods-receipt, find and confirm the receipt
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'goods-receipt');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    // Find the draft receipt (most recent, created from our PO)
    const receiptRows = page.locator('tbody tr');
    await expect(receiptRows.first(),
      '[Plan 14.1] Goods receipt list should have at least one row',
    ).toBeVisible({ timeout: 10_000 });

    // Click the first draft receipt row
    const draftReceiptRow = receiptRows.filter({ hasText: /borrador|draft/i }).first();
    await expect(draftReceiptRow,
      'There should be a draft goods receipt generated from the PO',
    ).toBeVisible({ timeout: 10_000 });

    // Hover the row to reveal quick actions, then click the pencil icon to edit
    await draftReceiptRow.hover();
    await slow(page);
    const editReceiptBtn = draftReceiptRow.locator('[data-testid*="Pencil"], [data-testid*="pencil"], [data-testid="row-quick-action-edit"]').first();
    if (await editReceiptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editReceiptBtn.click();
    } else {
      // Fallback: double-click the row
      await draftReceiptRow.dblclick();
    }
    await slow(page);

    await waitForDetailReady(page);

    // Verify it's in draft status
    const receiptPill = page.getByTestId('document-status-pill').first();
    await expect(receiptPill,
      '[Plan 14.1] Receipt should be in Draft status',
    ).toContainText(/borrador|draft/i, { timeout: 5_000 });

    // [Plan 14.1] Verify receipt has lines inherited from the PO
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      '[Plan 6.3] Receipt should have 2 lines inherited from the PO',
    ).toBeVisible({ timeout: 10_000 });

    // Confirm the receipt — click the "Confirmar" button in the topbar
    const confirmReceiptBtn = page.getByTestId('action-save');
    await expect(confirmReceiptBtn).toBeVisible({ timeout: 10_000 });
    await confirmReceiptBtn.click();
    await page.waitForTimeout(1_000);

    // The receipt confirm modal (confirm-inout-modal) may appear with a "Create invoice"
    // checkbox. Since the invoice was already created from the PO, we leave it unchecked.
    const receiptModal = page.getByTestId('confirm-inout-modal');
    if (await receiptModal.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Click the confirm button INSIDE the modal
      const modalConfirm = receiptModal.getByRole('button', { name: /confirmar|confirm/i });
      await expect(modalConfirm,
        'Receipt confirm modal should have a "Confirmar" button',
      ).toBeVisible({ timeout: 5_000 });
      await modalConfirm.click();
    }

    // Wait for the confirmation process to complete
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.request().method() === 'POST' && resp.status() < 500,
      { timeout: 30_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_000);

    // Dismiss success modal if present
    const receiptCloseBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await receiptCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await receiptCloseBtn.click();
      await slow(page);
    }

    // Verify receipt is Completed
    await page.reload({ waitUntil: 'networkidle' });
    await waitForDetailReady(page);

    const receiptCompletedPill = page.getByTestId('document-status-pill').first();
    await expect(receiptCompletedPill,
      '[Plan 15.2] Receipt should be Completed after confirmation — stock should have entered the warehouse',
    ).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Navigate to purchase-invoice, find and confirm the invoice
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    // Find the draft invoice
    const invoiceRows = page.locator('tbody tr');
    await expect(invoiceRows.first(),
      'Purchase invoice list should have at least one row',
    ).toBeVisible({ timeout: 10_000 });

    const draftInvoiceRow = invoiceRows.filter({ hasText: /borrador|draft/i }).first();
    await expect(draftInvoiceRow,
      'There should be a draft purchase invoice generated from the PO',
    ).toBeVisible({ timeout: 10_000 });

    // Hover the row to reveal quick actions, then click the pencil icon to edit
    await draftInvoiceRow.hover();
    await slow(page);
    const editInvBtn = draftInvoiceRow.locator('[data-testid*="Pencil"], [data-testid*="pencil"], [data-testid="row-quick-action-edit"]').first();
    if (await editInvBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editInvBtn.click();
    } else {
      await draftInvoiceRow.dblclick();
    }
    await slow(page);

    await waitForDetailReady(page);

    // Verify it's in draft status
    const invPill = page.getByTestId('document-status-pill').first();
    await expect(invPill,
      'Invoice should be in Draft status',
    ).toContainText(/borrador|draft/i, { timeout: 5_000 });

    // [Plan 6.3] Verify invoice has lines from the PO
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      '[Plan 6.3] Invoice should have 2 lines inherited from the PO',
    ).toBeVisible({ timeout: 10_000 });

    // Verify subtotal > 0
    const subtotalEl = page.getByText(/subtotal sin descuento|subtotal/i).first()
      .locator('~ *').first();
    const subtotalText = await subtotalEl.textContent().catch(() => '0');
    const subtotalNum = parseFloat(subtotalText.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    expect(subtotalNum,
      '[Plan 6.3] Invoice subtotal should be > 0 — lines should carry prices from the PO',
    ).toBeGreaterThan(0);

    // Confirm the invoice
    const confirmInvoiceBtn = page.getByTestId('action-save');
    await expect(confirmInvoiceBtn).toBeVisible({ timeout: 10_000 });
    await expect(confirmInvoiceBtn).toContainText(/confirmar|confirm/i);
    await confirmInvoiceBtn.click();
    await slow(page);

    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.request().method() === 'POST' && resp.status() < 500,
      { timeout: 30_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Dismiss success modal if present
    const invCloseBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await invCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await invCloseBtn.click();
      await slow(page);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: Verify invoice is Completed
    // ═══════════════════════════════════════════════════════════════════════

    const currentUrl = page.url();
    if (currentUrl.includes('/purchase-invoice/')) {
      await page.reload({ waitUntil: 'networkidle' });
    }

    const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);

    if (!onDetailView) {
      // On list view — verify completed row exists
      const completedRow = page.locator('tbody tr').filter({ hasText: /completado|completed/i }).first();
      await expect(completedRow,
        '[Plan 22.1] Invoice should appear as Completed in the list view',
      ).toBeVisible({ timeout: 10_000 });
    } else {
      await waitForDetailReady(page);
      const invoiceCompletedPill = page.getByTestId('document-status-pill').first();
      await expect(invoiceCompletedPill,
        '[Plan 22.1] Invoice status pill should show Completed after confirmation',
      ).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });

      // Final verification: invoice should still have 2 lines
      await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
        'Invoice should still have 2 lines after completion',
      ).toBeVisible({ timeout: 10_000 });
    }

    await slow(page);
  });
});
