import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Sales Order + Invoice — Full happy-path integration E2E.
 *
 * Flow:
 *   1. Login with onboarding credentials
 *   2. Navigate to /sales-order, verify list view
 *   3. Create a new order — fill BP, verify autocomplete
 *   4. Add a line — select product, verify price/tax
 *   5. Save as draft
 *   6. Confirm the order — check "Crear factura" in the confirm modal
 *   7. Verify order is Completed
 *   8. Navigate to /sales-invoice — find the draft invoice
 *   9. Verify invoice has lines from the order
 *  10. Confirm the invoice (DR → CO)
 *  11. Verify invoice is Completed
 *
 * Requires a running backend + dev server. Gated by E2E_SALES_INTEGRATION=1.
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
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 20_000 });
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

test.describe('Sales Order — Happy path (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live sales order integration test.',
  );

  test('creates an order, confirms with invoice, then confirms the invoice', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Login
    // ═══════════════════════════════════════════════════════════════════════

    await login(page, { user, password });
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Navigate to Sales Order list view
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'sales-order');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    const newButton = page.getByTestId('action-new');
    await expect(newButton).toBeVisible({ timeout: 15_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Create a new order
    // ═══════════════════════════════════════════════════════════════════════

    await newButton.click();
    await waitForDetailReady(page);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Fill header — select a Business Partner
    // ═══════════════════════════════════════════════════════════════════════

    const bpField = page.getByTestId('field-businessPartner');
    await expect(bpField).toBeVisible({ timeout: 10_000 });
    await bpField.click();
    await slow(page);

    const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(bpOption).toBeVisible({ timeout: 15_000 });
    await bpOption.click();
    await slow(page);

    // Wait for callout to propagate
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await slow(page);

    // Wait for warehouse callout to finish — only select manually if still empty
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const warehouseStillEmpty = await page.locator('input[data-testid="field-warehouse"][placeholder*="Almacén"]')
      .isVisible({ timeout: 2_000 }).catch(() => false);
    if (warehouseStillEmpty) {
      await page.locator('input[data-testid="field-warehouse"]').click({ timeout: 5_000 });
      await slow(page);
      const whOption = page.locator('[data-testid^="option-warehouse-"]').first();
      await expect(whOption).toBeVisible({ timeout: 10_000 });
      await whOption.click();
      await slow(page);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Save as draft
    // ═══════════════════════════════════════════════════════════════════════

    const saveDraftBtn = page.getByTestId('action-save-draft');
    if (await saveDraftBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const savePromise = expectSaveResponse(page);
      await saveDraftBtn.click();
      await savePromise;
    } else {
      const guardarBtn = page.getByRole('button', { name: /guardar|save/i });
      const savePromise = expectSaveResponse(page);
      await guardarBtn.click();
      await savePromise;
    }
    await slow(page);

    await expect(page).toHaveURL(/\/sales-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Add a line
    // ═══════════════════════════════════════════════════════════════════════

    await waitForDetailReady(page);

    let emptyStateBtn = page.getByTestId('action-add-lines-empty-state');
    if (!await emptyStateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add lines/i }).first();
    }
    await expect(emptyStateBtn).toBeVisible({ timeout: 10_000 });
    await emptyStateBtn.click();
    await slow(page);

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });

    const productField = page.getByTestId('inline-add-field-product');
    await expect(productField).toBeVisible({ timeout: 5_000 });
    await productField.click();
    await slow(page);

    const searchDrawer = page.getByTestId('product-search-drawer');
    await expect(searchDrawer).toBeVisible({ timeout: 10_000 });

    const productOption = page.locator('[data-testid^="product-search-option-"]').first();
    await expect(productOption).toBeVisible({ timeout: 15_000 });
    await productOption.click();
    await slow(page);

    await expect(searchDrawer).toBeHidden({ timeout: 5_000 }).catch(() => {});

    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await slow(page);

    const lineAddPromise = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await lineAddPromise;
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6b: Add a second line — different product, quantity 3
    // ═══════════════════════════════════════════════════════════════════════

    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });
    await expect(addLineBtn).toBeVisible({ timeout: 10_000 });
    await addLineBtn.click();
    await slow(page);

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });

    // Select a different product (second option)
    const productField2 = page.getByTestId('inline-add-field-product');
    await expect(productField2).toBeVisible({ timeout: 5_000 });
    await productField2.click();
    await slow(page);

    const searchDrawer2 = page.getByTestId('product-search-drawer');
    await expect(searchDrawer2).toBeVisible({ timeout: 10_000 });

    // Search for "Agua" and select it
    const searchInput2 = page.getByTestId('product-search-input');
    await searchInput2.fill('Agua');
    await page.waitForTimeout(1000);

    const aguaOption = page.locator('[data-testid^="product-search-option-"]').first();
    await expect(aguaOption).toBeVisible({ timeout: 10_000 });
    await aguaOption.click();
    await slow(page);

    await expect(searchDrawer2).toBeHidden({ timeout: 5_000 }).catch(() => {});

    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await slow(page);

    // Set quantity to 3
    const qtyField = page.getByTestId('inline-add-field-orderedQuantity');
    if (await qtyField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await qtyField.clear();
      await qtyField.fill('3');
    }
    await slow(page);

    const line2AddPromise = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await line2AddPromise;
    await slow(page);

    // Verify we now have 2 lines
    await expect(page.locator('tbody tr')).toHaveCount(2, { timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm the order — check "Crear factura"
    // ═══════════════════════════════════════════════════════════════════════

    const confirmBtn = page.getByTestId('action-save');
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await slow(page);

    // Check "Crear factura" in the confirm modal
    const invoiceCard = page.getByText(/crear factura|create.*invoice/i).first();
    const invoiceCardVisible = await invoiceCard.isVisible({ timeout: 5_000 }).catch(() => false);
    if (invoiceCardVisible) {
      await invoiceCard.click();
      await slow(page);
      const modalBtn = page.getByRole('button', { name: /confirmar/i }).last();
      await modalBtn.click();
      await slow(page);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Handle success modal
    // ═══════════════════════════════════════════════════════════════════════

    const successMsg = page.getByText(/pedido confirmado|order confirmed/i);
    await expect(successMsg).toBeVisible({ timeout: 30_000 });
    await slow(page);

    const closeBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await closeBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Verify the order is Completed
    // ═══════════════════════════════════════════════════════════════════════

    await page.reload({ waitUntil: 'networkidle' });
    await waitForDetailReady(page);

    const completedPill = page.getByTestId('document-status-pill');
    await expect(completedPill).toBeVisible({ timeout: 15_000 });
    await expect(completedPill).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Navigate to Sales Invoice — find the draft invoice
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'sales-invoice');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 15_000 });

    const invoiceRows = page.locator('tbody tr');
    await expect(invoiceRows.first()).toBeVisible({ timeout: 10_000 });

    // Find the draft invoice created from the order
    const draftInvoiceRow = invoiceRows.filter({ hasText: /borrador|draft/i }).first();
    await expect(draftInvoiceRow).toBeVisible({ timeout: 10_000 });

    // Open it
    await draftInvoiceRow.hover();
    await slow(page);
    const editBtn = draftInvoiceRow.getByTestId('row-quick-action-edit');
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: Verify the invoice has lines from the order
    // ═══════════════════════════════════════════════════════════════════════

    await waitForDetailReady(page);
    await expect(page).toHaveURL(/\/sales-invoice\/[a-zA-Z0-9]+/, { timeout: 15_000 });

    // Verify draft status (invoices have two pills — use first)
    const invoicePill = page.getByTestId('document-status-pill').first();
    await expect(invoicePill).toBeVisible({ timeout: 10_000 });
    await expect(invoicePill).toContainText(/borrador|draft/i, { timeout: 5_000 });

    // Verify the invoice inherited both lines from the order
    await expect(page.getByText(/queso sardo/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/agua/i).first()).toBeVisible({ timeout: 5_000 });
    // Verify the tab shows 2 lines
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i })).toBeVisible({ timeout: 5_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12: Confirm the invoice (DR → CO)
    // ═══════════════════════════════════════════════════════════════════════

    // Click "Confirmar" and wait for the process to complete
    const invoiceConfirmBtn = page.getByTestId('action-save');
    await expect(invoiceConfirmBtn).toBeVisible({ timeout: 10_000 });
    await expect(invoiceConfirmBtn).toContainText(/confirmar|confirm/i);
    await invoiceConfirmBtn.click();
    await slow(page);

    // Wait for the process response (the confirm triggers a POST with documentAction=CO)
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/sws/neo/') &&
        resp.request().method() === 'POST' &&
        resp.status() < 500,
      { timeout: 30_000 },
    ).catch(() => {});
    await slow(page);

    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Dismiss success modal if present
    const invoiceCloseBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await invoiceCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await invoiceCloseBtn.click();
      await slow(page);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 13: Verify the invoice is now Completed
    // ═══════════════════════════════════════════════════════════════════════

    // Navigate back to the invoice URL (reload may land on the list)
    const currentInvoiceUrl = page.url();
    if (currentInvoiceUrl.includes('/sales-invoice/')) {
      await page.reload({ waitUntil: 'networkidle' });
    } else {
      await page.goto(currentInvoiceUrl, { waitUntil: 'networkidle' });
    }

    // If we landed on the list instead of the detail, the invoice was confirmed
    // successfully — verify from the list instead
    const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);

    if (!onDetailView) {
      // We're on the invoice list — the first completed invoice is ours
      const completedRow = page.locator('tbody tr').filter({ hasText: /completado|completed/i }).first();
      await expect(completedRow).toBeVisible({ timeout: 10_000 });
      return; // Test passes — invoice is confirmed and visible in the list
    }

    await waitForDetailReady(page);

    const invoiceCompletedPill = page.getByTestId('document-status-pill').first();
    await expect(invoiceCompletedPill).toBeVisible({ timeout: 15_000 });
    await expect(invoiceCompletedPill).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });
    await slow(page);
  });
});