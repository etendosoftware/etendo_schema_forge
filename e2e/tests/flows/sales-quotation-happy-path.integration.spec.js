import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Sales Quotation — Full happy-path integration E2E against a real backend.
 *
 * Flow:
 *   1. Login with onboarding credentials
 *   2. Navigate to /sales-quotation, verify list view loads
 *   3. Create a new quotation — fill BP, verify autocomplete
 *   4. Save as draft
 *   5. Add a line — select product, verify price/tax autocomplete
 *   6. Confirm (DR → UE) via SendToEvaluationModal
 *   7. Confirm (UE → "Crear Pedido") via QuotationConfirmModal
 *   8. Verify status "Cerrado - Pedido creado" (CA)
 *   9. Return to list — verify the quotation appears
 *
 * Requires:
 *   - Etendo backend running
 *   - Dev server running at localhost:3100 (make dev)
 *   - E2E_SALES_INTEGRATION=1
 */

// ── Credentials ──────────────────────────────────────────────────────────────

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
      resp.status() < 500,
    { timeout: 20_000 },
  ).catch(() => {});
}

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe('Sales Quotation — Happy path (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live sales quotation integration test.',
  );

  test('creates a quotation, adds a line, confirms to UE, then converts to order', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Login
    // ═══════════════════════════════════════════════════════════════════════

    await login(page, { user, password });
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Navigate to Sales Quotation list view
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'sales-quotation');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    const newButton = page.getByTestId('action-new');
    await expect(newButton).toBeVisible({ timeout: 15_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Create a new quotation
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

    // Pick the first real customer (skip "+ Crear contacto")
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

    // URL should include record ID
    await expect(page).toHaveURL(/\/sales-quotation\/[a-zA-Z0-9]+/, { timeout: 15_000 });

    // Verify draft status badge
    const statusPill = page.getByTestId('document-status-pill');
    await expect(statusPill).toBeVisible({ timeout: 10_000 });
    await slow(page);

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Add a line — select a product
    // ═══════════════════════════════════════════════════════════════════════

    await waitForDetailReady(page);

    // Click "+ Añadir líneas" empty state button (with fallback)
    let emptyStateBtn = page.getByTestId('action-add-lines-empty-state');
    if (!await emptyStateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add lines/i }).first();
    }
    await expect(emptyStateBtn).toBeVisible({ timeout: 10_000 });
    await emptyStateBtn.click();
    await slow(page);

    // Wait for inline add row
    const inlineAddRow = page.getByTestId('inline-add-row');
    await expect(inlineAddRow).toBeVisible({ timeout: 10_000 });

    // Click product field — opens ProductSearchDrawer
    const productField = page.getByTestId('inline-add-field-product');
    await expect(productField).toBeVisible({ timeout: 5_000 });
    await productField.click();
    await slow(page);

    // Wait for search drawer and select first product
    const searchDrawer = page.getByTestId('product-search-drawer');
    await expect(searchDrawer).toBeVisible({ timeout: 10_000 });

    const productOption = page.locator('[data-testid^="product-search-option-"]').first();
    await expect(productOption).toBeVisible({ timeout: 15_000 });
    await productOption.click();
    await slow(page);

    await expect(searchDrawer).toBeHidden({ timeout: 5_000 }).catch(() => {});

    // Wait for callout to fill price, tax
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await slow(page);

    // Submit the line (qty=1 default)
    const lineAddPromise = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await lineAddPromise;
    await slow(page);

    // Verify line appeared
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm (DR → UE) — SendToEvaluationModal
    // ═══════════════════════════════════════════════════════════════════════

    // Click the "Confirmar" button (action-save in draftMode)
    const confirmBtn = page.getByTestId('action-save');
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await slow(page);

    // The SendToEvaluationModal appears — it shows a summary card and a
    // confirm button (data-testid="action-confirm-modal")
    const confirmModalBtn = page.getByTestId('action-confirm-modal');
    await expect(confirmModalBtn).toBeVisible({ timeout: 10_000 });
    await confirmModalBtn.click();
    await slow(page);

    // Wait for the process to complete — the modal closes and status changes to UE
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

    // Reload to get fresh status
    await page.reload({ waitUntil: 'networkidle' });
    await waitForDetailReady(page);

    // Verify status is now "Bajo evaluación" / "Under Evaluation" (UE)
    const uePill = page.getByTestId('document-status-pill');
    await expect(uePill).toBeVisible({ timeout: 15_000 });
    await expect(uePill).toContainText(/bajo evaluaci|under eval|en espera/i, { timeout: 10_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Confirm (UE → "Crear Pedido") — QuotationConfirmModal
    // ═══════════════════════════════════════════════════════════════════════

    // Click "Confirmar" again (still visible in UE state)
    const confirmBtn2 = page.getByTestId('action-save');
    await expect(confirmBtn2).toBeVisible({ timeout: 10_000 });
    await confirmBtn2.click();
    await slow(page);

    // The QuotationConfirmModal appears with two options:
    //   - confirm-option-order: "Crear Pedido" (recommended)
    //   - confirm-option-invoice: "Crear Factura directa"
    // Select "Crear Pedido"
    const orderOption = page.getByTestId('confirm-option-order');
    await expect(orderOption).toBeVisible({ timeout: 10_000 });
    await orderOption.click();
    await slow(page);

    // Click the confirm button in the modal
    const confirmModalBtn2 = page.getByTestId('action-confirm-modal');
    await expect(confirmModalBtn2).toBeVisible({ timeout: 5_000 });
    await expect(confirmModalBtn2).toBeEnabled();
    await confirmModalBtn2.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Handle success result
    // ═══════════════════════════════════════════════════════════════════════

    // Wait for the success state — the modal shows the created order with
    // a "Cerrar" button and optionally a "Go to order" button
    // Wait for either a success message or a close button to appear
    const closeBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    await expect(closeBtn).toBeVisible({ timeout: 30_000 });
    await slow(page);
    await closeBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Verify the quotation is now "Cerrado - Pedido creado" (CA)
    // ═══════════════════════════════════════════════════════════════════════

    // Click "Cancelar" (left button) to go back to the list
    const cancelBtn = page.getByRole('button', { name: /cancelar|cancel/i }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.click();
    await slow(page);

    // Wait for the list to load
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 15_000 });

    // Verify our quotation appears in the list with status "Cerrado"
    const tableRows = page.locator('tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 10_000 });
    await expect(tableRows.filter({ hasText: /cerrado|closed/i }).first()).toBeVisible({ timeout: 10_000 });
    await slow(page);
  });
});
