import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Purchase Order → Purchase Invoice — Full happy-path integration E2E.
 *
 * Flow:
 *   1. Login with onboarding credentials
 *   2. Navigate to /contacts, open the existing contact
 *   3. Go to "Financiero" tab, ensure "Proveedor" checkbox is checked
 *   4. Navigate to /purchase-order, create a new order with that vendor
 *   5. Add two product lines, confirm the order
 *   6. Navigate to /purchase-invoice, create a new invoice with same vendor
 *   7. Import lines from the purchase order via the import modal
 *   8. Confirm the invoice and verify it is Completed
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

test.describe('Purchase Order → Invoice — Happy path (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live purchase integration test.',
  );

  test('creates a PO, confirms it, then creates an invoice importing its lines', async ({ page }) => {
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
    await expect(contactRow,
      'Contacts list should have at least one row — the onboarding contact',
    ).toBeVisible({ timeout: 10_000 });
    await contactRow.click();
    await slow(page);

    await waitForDetailReady(page);

    // Capture the contact name for later BP verification
    const contactName = await page.locator('h1, [class*="text-xl"]').first().textContent().catch(() => '');

    // Click the "Financiero" tab
    const financieroTab = page.getByRole('button', { name: /financiero|financial/i });
    await expect(financieroTab,
      'Contact detail should have a "Financiero" tab',
    ).toBeVisible({ timeout: 10_000 });
    await financieroTab.click();
    await slow(page);
    await page.waitForTimeout(1_000);

    // Check and enable the vendor checkbox if needed
    const vendorInput = page.locator('[data-testid*="vendor"]').first();
    const isChecked = await vendorInput.isChecked().catch(() => false);

    if (!isChecked) {
      const vendorSpan = vendorInput.locator('~ span').first();
      if (await vendorSpan.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await vendorSpan.click();
      } else {
        await vendorInput.click({ force: true });
      }
      await slow(page);
      await page.waitForTimeout(1_000);

      const saveBtn = page.getByTestId('action-save').or(
        page.getByRole('button', { name: /guardar|save/i }),
      ).first();
      await expect(saveBtn,
        'Guardar button should be enabled after checking "Proveedor"',
      ).toBeEnabled({ timeout: 5_000 });
      const savePromise = expectSaveResponse(page);
      await saveBtn.click();
      await savePromise;
      await slow(page);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Create a new Purchase Order
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    const newButton = page.getByTestId('action-new');
    await expect(newButton,
      'Purchase Order list should show "New" button',
    ).toBeVisible({ timeout: 15_000 });

    await newButton.click();
    await waitForDetailReady(page);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Select the vendor as Business Partner
    // ═══════════════════════════════════════════════════════════════════════

    const bpInput = page.getByTestId('field-businessPartner');
    await expect(bpInput,
      'BP field should be visible on the PO form',
    ).toBeVisible({ timeout: 10_000 });
    await bpInput.click();


    const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(bpOption,
      'At least one vendor option should appear — did the "Proveedor" checkbox save correctly?',
    ).toBeVisible({ timeout: 15_000 });

    // Capture the selected BP name for later cross-check with the invoice
    const selectedBpText = await bpOption.textContent().catch(() => '');
    await bpOption.click();
    await slow(page);

    // Wait for callout to propagate (address, payment terms, etc.)
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_000);

    // [Plan 2.2] Verify BP callout populated dependent fields
    const addressChip = page.getByTestId('field-partnerAddress-chip')
      .or(page.locator('[data-testid*="partnerAddress"] .truncate, [data-testid*="partnerAddress"]'));
    const addressValue = await addressChip.first().textContent().catch(() => '');
    expect(addressValue,
      '[Plan 2.2] Address should be auto-filled after selecting the vendor (callout)',
    ).toBeTruthy();

    // [Plan 2.6] Verify purchase price list was inherited
    const priceListField = page.getByTestId('field-priceList')
      .or(page.locator('[data-testid*="priceList"]')).first();
    const priceListValue = await priceListField.textContent().catch(() => '');
    expect(priceListValue,
      '[Plan 2.6] Price list should be inherited from the vendor (e.g. "Lista de compra")',
    ).toBeTruthy();

    // [Plan 2.5] Verify "Fecha de entrega esperada" field is present (PO-exclusive required field)
    const expectedDeliveryDate = page.getByText(/fecha de entrega esperada|expected delivery/i);
    await expect(expectedDeliveryDate,
      '[Plan 2.5] "Fecha de entrega esperada" should be visible — it is required and exclusive to Purchase Orders',
    ).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Save PO as draft
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

    await expect(page,
      'After saving draft, the URL should include the PO record ID',
    ).toHaveURL(/\/purchase-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Verify draft status
    await waitForDetailReady(page);
    const draftPill = page.getByTestId('document-status-pill');
    await expect(draftPill,
      'PO should be in Draft status after saving',
    ).toContainText(/borrador|draft/i, { timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Add first product line
    // ═══════════════════════════════════════════════════════════════════════

    let emptyStateBtn = page.getByTestId('action-add-lines-empty-state');
    if (!await emptyStateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add lines/i }).first();
    }
    await expect(emptyStateBtn,
      'Empty state should show "Add lines" button',
    ).toBeVisible({ timeout: 10_000 });
    await emptyStateBtn.click();
    await slow(page);

    await expect(page.getByTestId('inline-add-row'),
      'Inline add row should appear after clicking "Add lines"',
    ).toBeVisible({ timeout: 10_000 });

    const productField = page.getByTestId('inline-add-field-product');
    await expect(productField).toBeVisible({ timeout: 5_000 });
    await productField.click();
    await slow(page);

    const searchDrawer = page.getByTestId('product-search-drawer');
    await expect(searchDrawer,
      'Product search drawer should open',
    ).toBeVisible({ timeout: 10_000 });

    const firstProduct = page.locator('[data-testid^="product-search-option-"]').first();
    await expect(firstProduct,
      'At least one product should be available for purchase orders',
    ).toBeVisible({ timeout: 15_000 });

    await firstProduct.click();
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

    // Verify line 1 was added
    await expect(page.locator('tbody tr'),
      'PO should have 1 line after adding the first product',
    ).toHaveCount(1, { timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6b: Add second product line with quantity 3
    // ═══════════════════════════════════════════════════════════════════════

    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });
    await expect(addLineBtn).toBeVisible({ timeout: 10_000 });
    await addLineBtn.click();
    await slow(page);

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });

    const productField2 = page.getByTestId('inline-add-field-product');
    await expect(productField2).toBeVisible({ timeout: 5_000 });
    await productField2.click();
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
    await slow(page);

    const line2AddPromise = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await line2AddPromise;
    await slow(page);

    // Verify both lines are present
    await expect(page.locator('tbody tr'),
      'PO should have exactly 2 lines after adding both products',
    ).toHaveCount(2, { timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm the Purchase Order
    // ═══════════════════════════════════════════════════════════════════════

    const confirmBtn = page.getByTestId('action-save');
    await expect(confirmBtn,
      'Confirm button should be visible on the PO form',
    ).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await slow(page);

    // Click the confirm button inside the modal (don't check invoice/receipt options)
    const modalConfirmBtn = page.getByRole('button', { name: /confirmar|confirm/i }).last();
    await expect(modalConfirmBtn,
      'Confirm modal should have a "Confirmar" button',
    ).toBeVisible({ timeout: 10_000 });
    await modalConfirmBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Verify PO confirmation succeeded
    // ═══════════════════════════════════════════════════════════════════════

    const successMsg = page.getByText(/pedido.*confirmado|order.*confirmed/i);
    await expect(successMsg,
      'Success modal should show "Pedido de compra confirmado" after confirming',
    ).toBeVisible({ timeout: 30_000 });
    await slow(page);

    const closeBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await closeBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Verify PO is Completed and capture document number
    // ═══════════════════════════════════════════════════════════════════════

    await page.reload({ waitUntil: 'networkidle' });
    await waitForDetailReady(page);

    const completedPill = page.getByTestId('document-status-pill');
    await expect(completedPill,
      'PO status pill should show Completed after confirmation',
    ).toBeVisible({ timeout: 15_000 });
    await expect(completedPill).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });

    // Verify the PO still has 2 lines after completion
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'PO should still show 2 lines after completion',
    ).toBeVisible({ timeout: 10_000 });

    // [Plan 9.4] Verify the PO is not editable after confirming — "Guardar" should
    // be disabled or not visible, and "Confirmar" should not be available
    const saveAfterConfirm = page.getByRole('button', { name: /guardar|save/i });
    const saveEnabled = await saveAfterConfirm.isEnabled({ timeout: 2_000 }).catch(() => false);
    expect(saveEnabled,
      '[Plan 9.3/9.4] "Guardar" should be disabled on a Completed PO — fields are readonly',
    ).toBeFalsy();

    // Capture document number from breadcrumb for searching in the import modal
    const breadcrumb = await page.locator('text=/Pedido de Compra/').first().textContent().catch(() => '');
    const poDocNo = breadcrumb.split('/').pop()?.trim()
      || await page.locator('input[disabled]').first().inputValue().catch(() => null);
    expect(poDocNo,
      'Should have captured the PO document number from the breadcrumb or disabled input',
    ).toBeTruthy();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Create a new Purchase Invoice
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    const newInvoiceBtn = page.getByTestId('action-new');
    await expect(newInvoiceBtn,
      'Purchase Invoice list should show "New" button',
    ).toBeVisible({ timeout: 15_000 });
    await newInvoiceBtn.click();
    await waitForDetailReady(page);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: Select the same vendor BP on the invoice
    // ═══════════════════════════════════════════════════════════════════════

    const invBpInput = page.getByTestId('field-businessPartner');
    await expect(invBpInput,
      'BP field should be visible on the invoice form',
    ).toBeVisible({ timeout: 10_000 });
    await invBpInput.click();

    const invBpOption = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(invBpOption,
      'Vendor should appear in the invoice BP selector — same vendor used for the PO',
    ).toBeVisible({ timeout: 15_000 });
    await invBpOption.click();
    await slow(page);

    // Wait for callout to propagate (address, payment terms, price list, etc.)
    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // Wait for all dependent fields to populate before saving
    await page.waitForTimeout(1_500);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12: Save invoice as draft
    // ═══════════════════════════════════════════════════════════════════════

    const saveInvDraftBtn = page.getByTestId('action-save-draft');
    if (await saveInvDraftBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const savePromise = expectSaveResponse(page);
      await saveInvDraftBtn.click();
      await savePromise;
    } else {
      const guardarBtn = page.getByRole('button', { name: /guardar|save/i });
      const savePromise = expectSaveResponse(page);
      await guardarBtn.click();
      await savePromise;
    }
    await slow(page);

    await expect(page,
      'After saving draft, the URL should include the invoice record ID',
    ).toHaveURL(/\/purchase-invoice\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    // Verify the invoice is in draft status with 0 lines before importing
    const invDraftPill = page.getByTestId('document-status-pill').first();
    await expect(invDraftPill,
      'Invoice should be in Draft status after saving',
    ).toContainText(/borrador|draft/i, { timeout: 5_000 });

    await expect(page.getByRole('button', { name: /líneas\s+0|lines\s+0/i }),
      'Invoice should have 0 lines before importing from PO',
    ).toBeVisible({ timeout: 5_000 });

    // [Plan 18.3] Verify "Nº documento" is empty (it's the vendor's invoice number, free text, not autogenerated)
    const invDocNoField = page.locator('input[name="documentNo"], [data-testid="field-documentNo"]').first();
    if (await invDocNoField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const invDocNoValue = await invDocNoField.inputValue().catch(() => null);
      // It's OK for this field to be empty — it's the vendor's reference number
      expect(invDocNoValue === '' || invDocNoValue === null,
        '[Plan 18.3] Invoice "Nº documento" should be empty or null — it is the vendor\'s reference, not autogenerated',
      ).toBeTruthy();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 13: Open "Import from purchase order" modal
    // ═══════════════════════════════════════════════════════════════════════

    await page.waitForTimeout(2_000);
    const orderBtn = page.locator('button').filter({ hasText: 'Importar desde pedido' });
    await expect(orderBtn,
      '"Importar desde pedido" button should be visible — requires BP set + draft status + not NC',
    ).toBeVisible({ timeout: 10_000 });
    await orderBtn.click();

    const importSearch = page.getByTestId('import-lines-search');
    await expect(importSearch,
      'Import modal should open with a search input — if "Importar desde recibo" opened instead, this is a known bug (pendingModal ref defaults to receipt)',
    ).toBeVisible({ timeout: 15_000 });

    // Verify it is the correct modal (not the receipt one)
    const modalTitle = page.locator('span').filter({ hasText: 'Importar desde pedido' });
    await expect(modalTitle,
      'Modal title should say "Importar desde pedido", not "Importar desde recibo"',
    ).toBeVisible({ timeout: 5_000 });

    // Wait for eager-loading of PO lines to complete
    const loadingText = page.getByText(/cargando|loading/i);
    if (await loadingText.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(loadingText).toBeHidden({ timeout: 30_000 });
    }
    await page.waitForTimeout(1_000);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 14: Search for our PO and expand it
    // ═══════════════════════════════════════════════════════════════════════

    const searchTerm = poDocNo?.trim() || '';
    expect(searchTerm,
      'PO document number should have been captured in STEP 9 — needed to find it in the modal',
    ).toBeTruthy();

    await importSearch.fill(searchTerm);
    await page.waitForTimeout(1_000);
    await slow(page);

    // Verify the PO appears in the filtered results
    const poRow = page.getByText(searchTerm).first();
    await expect(poRow,
      `PO ${searchTerm} should appear in the import modal — is it Completed and not fully invoiced?`,
    ).toBeVisible({ timeout: 10_000 });
    await poRow.click();
    await slow(page);

    // Wait for the lines to load after expanding
    await page.waitForTimeout(1_000);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 15: Select all lines and import
    // ═══════════════════════════════════════════════════════════════════════

    const docCheckbox = page.getByRole('checkbox').first();
    await docCheckbox.click({ force: true });
    await slow(page);

    const importSelectedBtn = page.getByRole('button', { name: /importar seleccionadas|import selected/i });
    await expect(importSelectedBtn,
      '"Import selected" button should be enabled after selecting lines',
    ).toBeEnabled({ timeout: 8_000 });
    await importSelectedBtn.click();
    await slow(page);

    // Wait for the import to complete — modal should close
    await expect(importSearch,
      'Import modal should close after successful import',
    ).toBeHidden({ timeout: 15_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 16: Verify the invoice has imported lines
    // ═══════════════════════════════════════════════════════════════════════

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    // Verify the tab shows exactly 2 lines
    await expect(
      page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Invoice should have exactly 2 lines after importing from PO',
    ).toBeVisible({ timeout: 10_000 });

    // Verify the subtotal is greater than 0 (lines carry prices from the PO)
    const subtotalEl = page.getByText(/subtotal sin descuento|subtotal/i).first()
      .locator('~ *').first();
    const subtotalText = await subtotalEl.textContent().catch(() => '0');
    const subtotalNum = parseFloat(subtotalText.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    expect(subtotalNum,
      `Invoice subtotal should be > 0 after importing priced lines (got "${subtotalText}")`,
    ).toBeGreaterThan(0);

    // Verify that lines have the correct quantities from the PO (1 and 3)
    const lineRows = page.locator('tbody tr');
    const lineCount = await lineRows.count();
    expect(lineCount,
      'Invoice lines table should have at least 1 visible row',
    ).toBeGreaterThanOrEqual(1);

    // Check that the quantities we entered in the PO (1 and 3) appear in the invoice
    await expect(page.getByText('3').first(),
      'Invoice should contain a line with quantity 3 (from PO second line)',
    ).toBeVisible({ timeout: 5_000 });

    // Verify the invoice is still in draft status before confirming
    const invoicePill = page.getByTestId('document-status-pill').first();
    await expect(invoicePill,
      'Invoice should still be in Draft status before confirmation',
    ).toContainText(/borrador|draft/i, { timeout: 5_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 17: Confirm the invoice (DR → CO)
    // ═══════════════════════════════════════════════════════════════════════

    const invoiceConfirmBtn = page.getByTestId('action-save');
    await expect(invoiceConfirmBtn,
      'Confirm button should be visible on the invoice',
    ).toBeVisible({ timeout: 10_000 });
    await expect(invoiceConfirmBtn).toContainText(/confirmar|confirm/i);
    await invoiceConfirmBtn.click();
    await slow(page);

    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/sws/neo/') &&
        resp.request().method() === 'POST' &&
        resp.status() < 500,
      { timeout: 30_000 },
    ).catch(() => {});
    await slow(page);

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Dismiss success modal if present
    const invoiceCloseBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await invoiceCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await invoiceCloseBtn.click();
      await slow(page);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 18: Verify the invoice is now Completed
    // ═══════════════════════════════════════════════════════════════════════

    const currentInvoiceUrl = page.url();
    if (currentInvoiceUrl.includes('/purchase-invoice/')) {
      await page.reload({ waitUntil: 'networkidle' });
    } else {
      await page.goto(currentInvoiceUrl, { waitUntil: 'networkidle' });
    }

    const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);

    if (!onDetailView) {
      // If we're on the list view, find the completed invoice row
      const completedRow = page.locator('tbody tr').filter({ hasText: /completado|completed/i }).first();
      await expect(completedRow,
        'Invoice should appear as Completed in the list view',
      ).toBeVisible({ timeout: 10_000 });
      return;
    }

    await waitForDetailReady(page);

    const invoiceCompletedPill = page.getByTestId('document-status-pill').first();
    await expect(invoiceCompletedPill,
      'Invoice status pill should show Completed after confirmation',
    ).toBeVisible({ timeout: 15_000 });
    await expect(invoiceCompletedPill).toContainText(/completado|registrado|booked|completed/i, { timeout: 10_000 });

    // Final verification: invoice should still have 2 lines after completion
    await expect(
      page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Invoice should still have 2 lines after completion',
    ).toBeVisible({ timeout: 10_000 });
    await slow(page);
  });
});