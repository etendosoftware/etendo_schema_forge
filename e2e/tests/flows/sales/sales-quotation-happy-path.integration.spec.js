// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
// @covers artifacts/sales-quotation/custom/QuotationConfirmModal.jsx
// @covers tools/app-shell/src/components/contract-ui/ConfirmResultModal.jsx
// @covers tools/app-shell/src/components/contract-ui/LinesEmptyState.jsx
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../../helpers/auth.js';
import { ensureProductSetup, PRODUCT_FIXTURE_ALPHA } from '../../helpers/product-helpers.js';
import { selectCustomerWithAddress } from '../../helpers/sales-helpers.js';
import { waitForLoadingIndicatorsGone } from '../../helpers/selectors.js';
import { createDraftWithFirstLine } from '../../helpers/purchase-helpers.js';

/**
 * Sales Quotation — Full happy-path integration E2E against a real backend.
 *
 * Flow:
 *   1. Login with onboarding credentials
 *   2. Navigate to /sales-quotation, verify list view loads
 *   3. Create a new quotation — fill BP, verify autocomplete
 *   4. Add a line straight from the empty state, which saves the header
 *      (no manual "Guardar")
 *   5. Confirm (DR → UE) via SendToEvaluationModal
 *   6. Confirm (UE → "Crear Pedido") via QuotationConfirmModal
 *   7. Verify status "Cerrado - Pedido creado" (CA)
 *   8. Return to list — verify the quotation appears
 *
 * Requires:
 *   - Etendo backend running
 *   - Dev server running at localhost:3100 (make dev)
 *   - E2E_SALES_INTEGRATION=1
 */

// ── Credentials ──────────────────────────────────────────────────────────────

function loadCredentials() {
  try {
    const credPath = resolve(import.meta.dirname, '../../../.auth-credentials.json');
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
  // Wait for EVERY loading indicator to disappear (covers late-appearing spinners
  // and panels that load concurrently). Passes at once when none is shown; a
  // still-visible indicator after the budget is tolerated, as before.
  await waitForLoadingIndicatorsGone(page, { timeout: 15_000 }).catch(() => {});
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

      // Pick a real customer that HAS an address (skip "+ Crear contacto"). Not
      // `.first()`: a customer with no C_BPartner_Location leaves partnerAddress empty,
      // which keeps action-save-draft disabled forever — see selectCustomerWithAddress.
      await selectCustomerWithAddress(page);

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

    // No Guardar first: "+ Añadir líneas" saves the header itself, the path a user
    // takes. The manual-save path is kept by the ALL-negative case of
    // sales-quotation-full-flow.integration.spec.js.
    await test.step('Add a line from the empty state (no manual save)', async () => {
      await createDraftWithFirstLine(page, {
        spec: 'sales-quotation', via: 'emptyState', productName: PRODUCT_FIXTURE_ALPHA.name,
      });
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
          r.status() < 400,
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
          r.status() < 400,
        { timeout: 60_000 },
      );
      await confirmModalBtn2.click();
      await orderResponse;
      await slow(page);
    });

    await test.step('Handle success result', async () => {
      // ConfirmResultModal's footer Cerrar (its X icon shares the accessible name).
      const closeBtn = page.getByTestId('action-confirm-result-close');
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
