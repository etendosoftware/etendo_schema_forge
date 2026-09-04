import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';
import {
  ensureProductFixtures, PRODUCT_FIXTURE_ALPHA, PRODUCT_FIXTURE_BETA,
} from '../helpers/product-helpers.js';

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

test.describe('Sales Order — Happy path (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live sales order integration test.',
  );

  test('creates an order, confirms with invoice, then confirms the invoice', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    await test.step('Login', async () => {
      await login(page, { user, password });
      await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
      await slow(page);
    });

    // ETP-5079: the onboarding dataset no longer seeds any visible product
    // (the demo "Queso Sardo"/"Agua"/"Cerveza"/"Fernet" rows were deleted, and
    // the only remaining product is hidden behind a system category), so the
    // two lines this test adds have nothing to search for unless the suite
    // provisions its own fixtures first. See e2e/tests/helpers/product-helpers.js.
    await test.step('Ensure product fixtures', async () => {
      await ensureProductFixtures(page);
    });

    await test.step('Navigate to Sales Order list view', async () => {
      await navigateTo(page, 'sales-order');
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
      // currency, address, warehouse). Wait until a key derived field is populated —
      // this proves ALL callouts finished, without relying on networkidle.
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
      await expect(page).toHaveURL(/\/sales-order\/[a-zA-Z0-9]+/, { timeout: 20_000 });

      // Wait for the detail to fully load after save redirect
      await waitForDetailReady(page);

      await slow(page);
    });

    await test.step('Add first line — select product', async () => {
      await waitForDetailReady(page);

      // Click "+ Añadir líneas" — wait for the button to appear first (the lines
      // panel may still be loading after the draft save redirect), then retry the
      // click→response→render sequence if the inline-add-row doesn't appear.
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

      // Search for the first fixture product — wait for filtered results to appear
      const searchInput = page.getByTestId('product-search-input');
      await searchInput.fill(PRODUCT_FIXTURE_ALPHA.name);

      const productOption = page.locator('[data-testid^="product-search-option-"]')
        .filter({ hasText: PRODUCT_FIXTURE_ALPHA.name }).first();
      await expect(productOption).toBeVisible({ timeout: 15_000 });

      // Retry click if the product element detaches mid-click (the drawer
      // re-renders its list when waterfall fetches complete — see purchase-helpers.js).
      let productCalloutResponse;
      await expect(async () => {
        productCalloutResponse = page.waitForResponse(
          (resp) => resp.url().includes('/sws/neo/') && resp.status() < 400,
          { timeout: 30_000 },
        );
        await productOption.click({ timeout: 3_000 });
      }).toPass({ timeout: 15_000 });
      await expect(searchDrawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
      await productCalloutResponse;
      await slow(page);

      // Submit the line (qty=1 default)
      const lineAddPromise = expectSaveResponse(page);
      await page.keyboard.press('Enter');
      await lineAddPromise;
      await slow(page);

      // Verify line appeared AND fully rendered (prevents race with second line add)
      await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });

      // Wait for the saved line to render with the product name in the lines list
      await expect(page.getByText(PRODUCT_FIXTURE_ALPHA.name).first()).toBeVisible({ timeout: 15_000 });

      // Wait for any inline-add-row to disappear (save fully committed to table)
      await expect(page.getByTestId('inline-add-row')).toBeHidden({ timeout: 15_000 })
        .catch(() => {}); // OK if already gone
    });

    await test.step('Add second line — different product, quantity 3', async () => {
      // Click "+ Añadir línea" — retry click→inline-add-row
      const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });

      await expect(async () => {
        await addLineBtn.click({ timeout: 3_000 });
        await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      // Click product field — opens ProductSearchDrawer (retry if click doesn't register)
      const productField2 = page.getByTestId('inline-add-field-product');
      const searchDrawer2 = page.getByTestId('product-search-drawer');

      await expect(async () => {
        await productField2.click({ timeout: 3_000 });
        await expect(searchDrawer2).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      // Search for the second fixture product — wait for filtered results to appear
      const searchInput2 = page.getByTestId('product-search-input');
      await searchInput2.fill(PRODUCT_FIXTURE_BETA.name);

      const secondOption = page.locator('[data-testid^="product-search-option-"]')
        .filter({ hasText: PRODUCT_FIXTURE_BETA.name }).first();
      await expect(secondOption).toBeVisible({ timeout: 10_000 });

      // Retry click if the product element detaches mid-click (same drawer
      // re-render issue as the first line — see purchase-helpers.js).
      let productCalloutResponse2;
      await expect(async () => {
        productCalloutResponse2 = page.waitForResponse(
          (resp) => resp.url().includes('/sws/neo/') && resp.status() < 400,
          { timeout: 30_000 },
        );
        await secondOption.click({ timeout: 3_000 });
      }).toPass({ timeout: 15_000 });
      await expect(searchDrawer2).toBeHidden({ timeout: 10_000 }).catch(() => {});
      await productCalloutResponse2;
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
    });

    await test.step('Confirm order — check Crear factura', async () => {
      // Click "Confirmar" — retry click→modal sequence
      const confirmBtn = page.getByTestId('action-save');
      const invoiceCard = page.getByText(/crear factura|create.*invoice/i).first();

      await expect(async () => {
        await confirmBtn.click({ timeout: 3_000 });
        await expect(invoiceCard).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      // Select "Crear factura"
      await invoiceCard.click();
      await slow(page);

      // Click confirm in the modal — wait for the process response
      const modalBtn = page.getByRole('button', { name: /confirmar|confirm/i }).last();
      await expect(modalBtn).toBeVisible({ timeout: 5_000 });

      const confirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') &&
          ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
          r.ok(),
        { timeout: 60_000 },
      );
      await modalBtn.click();
      await confirmResponse;
      await slow(page);
    });

    await test.step('Handle success modal', async () => {
      const successMsg = page.getByText(/pedido confirmado|order confirmed/i);
      await expect(successMsg).toBeVisible({ timeout: 30_000 });
      await slow(page);

      const closeBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      await expect(closeBtn).toBeVisible({ timeout: 5_000 });
      await closeBtn.click();
      await slow(page);
    });

    await test.step('Verify order is Completed', async () => {
      // Reload to get fresh status — use goto on current URL instead of reload
      // to avoid ERR_ABORTED when the confirm process triggers internal navigation
      const currentUrl = page.url();
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDetailReady(page);

      const completedPill = page.getByTestId('document-status-pill');
      await expect(completedPill).toBeVisible({ timeout: 15_000 });
      await expect(completedPill).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });
      await slow(page);
    });

    await test.step('Navigate to Sales Invoice — find draft invoice', async () => {
      await navigateTo(page, 'sales-invoice');
      await slow(page);

      await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 20_000 });

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
    });

    await test.step('Verify invoice has lines from order', async () => {
      await waitForDetailReady(page);
      await expect(page).toHaveURL(/\/sales-invoice\/[a-zA-Z0-9]+/, { timeout: 15_000 });

      // Verify draft status (invoices have two pills — use first)
      const invoicePill = page.getByTestId('document-status-pill').first();
      await expect(invoicePill).toBeVisible({ timeout: 10_000 });
      await expect(invoicePill).toContainText(/borrador|draft/i, { timeout: 5_000 });

      // Verify the invoice inherited both lines from the order
      await expect(page.getByText(PRODUCT_FIXTURE_ALPHA.name).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(PRODUCT_FIXTURE_BETA.name).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i })).toBeVisible({ timeout: 5_000 });
      await slow(page);
    });

    await test.step('Confirm invoice (DR → CO)', async () => {
      // Click "Confirmar" — retry click→modal sequence
      const invoiceConfirmBtn = page.getByTestId('action-save');
      await expect(invoiceConfirmBtn).toBeVisible({ timeout: 10_000 });
      await expect(invoiceConfirmBtn).toContainText(/confirmar|confirm/i);

      // Declare waitForResponse BEFORE the click
      const confirmResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes('/sws/neo/') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 30_000 },
      );
      await invoiceConfirmBtn.click();
      await confirmResponse;
      await slow(page);

      // Dismiss success modal if present
      const invoiceCloseBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      if (await invoiceCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await invoiceCloseBtn.click();
        await slow(page);
      }
    });

    await test.step('Verify invoice is Completed', async () => {
      // After the confirm, the UI may show the detail, the list, or a preview panel.
      // Look for "Completado" anywhere on the page as proof the invoice was confirmed.
      await expect(page.getByText(/completado|completed/i).first())
        .toBeVisible({ timeout: 20_000 });
      await slow(page);
    });
  });
});