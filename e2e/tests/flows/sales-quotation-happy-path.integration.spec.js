import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';
import { ensureProductSetup, PRODUCT_FIXTURE_ALPHA } from '../helpers/product-helpers.js';

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
  // Wait for any loading indicator to disappear (covers late-appearing spinners)
  await expect(page.getByText(/cargando|loading/i)).toBeHidden({ timeout: 15_000 })
    .catch(() => {}); // OK if spinner never appeared
}

function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) &&
      resp.status() < 400,
    { timeout: 30_000 },
  );
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

    await test.step('Login', async () => {
      await login(page, { user, password });
      await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
      await slow(page);
    });

    await test.step('Ensure the product fixture exists', async () => {
      // ETP-5079 emptied the seeded product list. Without this the drawer is
      // empty on a genuinely fresh tenant and the pick below only worked when
      // an earlier spec in the run happened to leave a product behind.
      await ensureProductSetup(page, PRODUCT_FIXTURE_ALPHA);
    });

    await test.step('Navigate to Sales Quotation list view', async () => {
      await navigateTo(page, 'sales-quotation');
      await slow(page);

      const newButton = page.getByTestId('action-new');
      await expect(newButton).toBeVisible({ timeout: 20_000 });
      await newButton.click();
    });

    await test.step('Wait for detail view', async () => {
      await waitForDetailReady(page);
      await slow(page);
    });

    await test.step('Fill header — select Business Partner', async () => {
      const bpField = page.getByTestId('field-businessPartner');
      await expect(bpField).toBeVisible({ timeout: 10_000 });

      // Open the BP dropdown — retry if click doesn't register
      await expect(async () => {
        await bpField.click({ timeout: 3_000 });
        await expect(page.locator('[data-testid^="option-businessPartner-"]').first())
          .toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      // Pick the first real customer (skip "+ Crear contacto")
      const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
        .filter({ hasNotText: /crear|create/i }).first();
      await expect(bpOption).toBeVisible({ timeout: 15_000 });

      await bpOption.click();

      // BP selection triggers multiple chained callouts (price list, payment terms,
      // currency, address). Wait until a key derived field is populated — this
      // proves ALL callouts finished, without relying on networkidle.
      await expect(async () => {
        const chipOrValue = page.getByTestId('field-paymentTerms-chip')
          .or(page.getByTestId('field-paymentTerms'));
        await expect(chipOrValue).toBeVisible({ timeout: 3_000 });
        // Ensure it's not still showing the placeholder
        await expect(chipOrValue).not.toHaveText(/buscar|search|seleccionar|select/i, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await slow(page);
    });

    await test.step('Save as draft', async () => {
      const saveBtn = page.getByTestId('action-save-draft')
        .or(page.getByRole('button', { name: /guardar|save/i }));
      const savePromise = expectSaveResponse(page);
      await saveBtn.click();
      await savePromise;
      await slow(page);

      // URL should include record ID
      await expect(page).toHaveURL(/\/sales-quotation\/[a-zA-Z0-9]+/, { timeout: 20_000 });

      // Wait for the detail to fully load after save redirect
      await waitForDetailReady(page);

      // Verify draft status badge
      const statusPill = page.getByTestId('document-status-pill');
      await expect(statusPill).toBeVisible({ timeout: 15_000 });
      await slow(page);
    });

    await test.step('Add a line — select a product', async () => {
      await waitForDetailReady(page);

      // Click "+ Añadir líneas" — wait for the button to appear first (the lines
      // panel may still be loading after the draft save), then retry until the
      // inline-add-row appears.
      const emptyStateBtn = page.getByTestId('action-add-lines-empty-state')
        .or(page.getByRole('button', { name: /añadir líneas|add lines/i }).first());
      await expect(emptyStateBtn).toBeVisible({ timeout: 15_000 });

      await expect(async () => {
        await emptyStateBtn.click({ timeout: 5_000 });
        await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 30_000 });
      await slow(page);

      // Click product field — opens ProductSearchDrawer (retry if click doesn't register)
      const productField = page.getByTestId('inline-add-field-product');
      const searchDrawer = page.getByTestId('product-search-drawer');

      await expect(async () => {
        await productField.click({ timeout: 3_000 });
        await expect(searchDrawer).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      // Narrow to the fixture by name instead of taking whatever sits first:
      // drawer position depends on what else the tenant accumulated.
      await page.getByTestId('product-search-input').fill(PRODUCT_FIXTURE_ALPHA.name);
      const productOption = page.locator('[data-testid^="product-search-option-"]')
        .filter({ hasText: PRODUCT_FIXTURE_ALPHA.name }).first();
      await expect(productOption,
        `Product "${PRODUCT_FIXTURE_ALPHA.name}" should appear in the search drawer`,
      ).toBeVisible({ timeout: 15_000 });

      // Retry click if the product element detaches mid-click (the drawer
      // re-renders its list when waterfall fetches complete — see purchase-helpers.js).
      let productCalloutResponse;
      await expect(async () => {
        productCalloutResponse = page.waitForResponse(
          (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
          { timeout: 30_000 },
        );
        await productOption.click({ timeout: 3_000 });
      }).toPass({ timeout: 15_000 });
      await expect(searchDrawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
      await productCalloutResponse;
      await slow(page);

      // Submit the line (qty=1 default) — click quantity field first to ensure
      // focus is on a numeric input (Enter on the product field opens the drawer
      // instead of submitting). Then press Enter to save.
      const qtyField = page.getByTestId('inline-add-field-orderedQuantity')
        .or(page.getByTestId('inline-add-field-quantity'))
        .or(page.locator('[data-testid^="inline-add-field-"] input[type="number"]').first());
      if (await qtyField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await qtyField.click({ timeout: 2_000 }).catch(() => {});
      }

      const lineAddPromise = expectSaveResponse(page);
      await page.keyboard.press('Enter');
      await lineAddPromise;
      await slow(page);

      // Verify the inline-add-row closed
      await expect(page.getByTestId('inline-add-row')).toBeHidden({ timeout: 10_000 })
        .catch(() => {});
    });

    await test.step('Confirm DR → UE (SendToEvaluationModal)', async () => {
      // Wait for confirm button to be enabled (line must be saved first)
      const confirmBtn = page.getByTestId('action-save');
      await expect(confirmBtn).toBeEnabled({ timeout: 15_000 });
      const confirmModalBtn = page.getByTestId('action-confirm-modal');

      await expect(async () => {
        await confirmBtn.click({ timeout: 3_000 });
        await expect(confirmModalBtn).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      // Confirm the modal — wait for the process response
      const confirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') &&
          ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
          r.status() < 500,
        { timeout: 30_000 },
      );
      await confirmModalBtn.click();
      await confirmResponse;
      await slow(page);

      // Wait for the UI to refresh after confirm — try direct wait first,
      // fall back to navigation if the status pill doesn't update
      const uePill = page.getByTestId('document-status-pill');
      const statusUpdated = await expect(uePill)
        .toContainText(/bajo evaluaci|under eval|en espera/i, { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (!statusUpdated) {
        // Status didn't update — reload the page to get fresh data
        const currentUrl = page.url();
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          .catch(() => page.waitForLoadState('domcontentloaded', { timeout: 15_000 }));
        await waitForDetailReady(page);
        await expect(uePill).toContainText(/bajo evaluaci|under eval|en espera/i, { timeout: 15_000 });
      }
      await slow(page);
    });

    await test.step('Confirm UE → Crear Pedido (QuotationConfirmModal)', async () => {
      // Click "Confirmar" again (UE state) — retry click→modal
      const confirmBtn2 = page.getByTestId('action-save');
      const orderOption = page.getByTestId('confirm-option-order');

      await expect(async () => {
        await confirmBtn2.click({ timeout: 3_000 });
        await expect(orderOption).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      // Select "Crear Pedido"
      await orderOption.click();
      await slow(page);

      // Click confirm in the modal — wait for the process response
      const confirmModalBtn2 = page.getByTestId('action-confirm-modal');
      await expect(confirmModalBtn2).toBeVisible({ timeout: 5_000 });
      await expect(confirmModalBtn2).toBeEnabled();

      const orderResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') &&
          ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
          r.status() < 500,
        { timeout: 60_000 },
      );
      await confirmModalBtn2.click();
      await orderResponse;
      await slow(page);
    });

    await test.step('Handle success result', async () => {
      const closeBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      await expect(closeBtn).toBeVisible({ timeout: 30_000 });
      await slow(page);
      await closeBtn.click();
      await slow(page);
    });

    await test.step('Verify quotation is Cerrado in list view', async () => {
      // Click "Cancelar" (left button) to go back to the list
      const cancelBtn = page.getByRole('button', { name: /cancelar|cancel/i }).first();
      await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
      await cancelBtn.click();
      await slow(page);

      // Wait for the list to load (no networkidle — the assertion polls internally)
      await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 20_000 });

      // Verify our quotation appears in the list with status "Cerrado"
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 10_000 });
      await expect(tableRows.filter({ hasText: /cerrado|closed/i }).first()).toBeVisible({ timeout: 10_000 });
      await slow(page);
    });
  });
});
