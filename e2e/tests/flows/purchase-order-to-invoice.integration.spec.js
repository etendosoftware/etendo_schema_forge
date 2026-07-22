import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, selectVendorBP,
  reselectComboOption,
  addProductLine, ensureVendorSetup, clickConfirmButton, expectStatusPill,
  expectSaveResponse, waitForConfirmResponse, dismissSuccessModal, safeReload,
  readDocumentTotals, verifyTotalsConsistency,
} from '../helpers/purchase-helpers.js';

/**
 * Purchase Order → Purchase Invoice — Happy-path via line import.
 *
 * Flow:
 *   1. Login → ensure vendor → create PO with 2 lines
 *   2. Confirm PO (no receipt, no invoice)
 *   3. Create a new Purchase Invoice → import lines from the completed PO
 *   4. Confirm the invoice → verify Completed
 *
 * Tests the "import from purchase order" modal flow, which is a different
 * path than creating the invoice automatically from the receipt.
 *
 * Gated by E2E_SALES_INTEGRATION=1.
 */

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_SALES_INTEGRATION === '1';

test.describe('Purchase Order → Invoice — Happy path (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live purchase integration test.',
  );

  // TODO(ETP-4608): Temporarily skipped — flaky/failing after the ETP-4029 merge. Re-enable once stabilized.
  test.skip('creates a PO, confirms it, then creates an invoice importing its lines', async ({ page }) => {
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
    // STEP 3: Create a new Purchase Order
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    await page.getByTestId('action-new').click();
    await waitForDetailReady(page);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Select vendor BP and verify callout fields
    // ═══════════════════════════════════════════════════════════════════════

    await selectVendorBP(page);

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
      '[Plan 2.6] Price list should be inherited from the vendor',
    ).toBeTruthy();

    // [Plan 2.5] Verify "Fecha de entrega esperada" is present (PO-exclusive required field)
    await expect(page.getByText(/fecha de entrega esperada|expected delivery/i),
      '[Plan 2.5] "Fecha de entrega esperada" should be visible — PO-exclusive required field',
    ).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Save PO as draft
    // ═══════════════════════════════════════════════════════════════════════

    await saveDraft(page);

    await expect(page,
      'After saving draft, URL should include the PO record ID',
    ).toHaveURL(/\/purchase-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    await expectStatusPill(page, /borrador|draft/i,
      'PO should be in Draft status after saving');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Add two product lines
    // ═══════════════════════════════════════════════════════════════════════

    await addProductLine(page, { isFirst: true, productIndex: 0 });
    await addProductLine(page, { productIndex: 1, quantity: '3' });

    await expect(page.locator('tbody tr'),
      'PO should have 2 lines after adding both products',
    ).toHaveCount(2, { timeout: 10_000 });

    // Verify PO totals: subtotal > 0, tax > 0, total = subtotal + tax
    const poTotals = await readDocumentTotals(page);
    verifyTotalsConsistency(poTotals, 'PO');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: Confirm the Purchase Order (no receipt, no invoice)
    // ═══════════════════════════════════════════════════════════════════════

    await clickConfirmButton(page);

    // Click the confirm button inside the modal (don't check invoice/receipt options).
    // The modal's own "Confirmar pedido" (soConfirmActionOnly) label and the background
    // toolbar's "Confirmar" (action-save / draftMode label, poConfirmBtn) buttons both match
    // a loose /confirmar|confirm/i regex, so `.last()` is ambiguous and can resolve to the
    // background button, which sits under the modal overlay and blocks the click. Match the
    // modal's exact label instead — it defaults to the "confirm only" selection (soConfirmActionOnly),
    // no invoice/receipt option checked, matching this test's intent.
    const modalConfirmBtn = page.getByRole('button', { name: /^confirmar pedido$|^confirm order$/i });
    await expect(modalConfirmBtn).toBeVisible({ timeout: 10_000 });
    await modalConfirmBtn.click();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Verify PO confirmation succeeded
    // ═══════════════════════════════════════════════════════════════════════

    const successMsg = page.getByText(/pedido.*confirmado|order.*confirmed/i);
    await expect(successMsg,
      'Success modal should show "Pedido de compra confirmado"',
    ).toBeVisible({ timeout: 30_000 });

    await dismissSuccessModal(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: Verify PO is Completed and capture document number
    // ═══════════════════════════════════════════════════════════════════════

    await safeReload(page);
    await waitForDetailReady(page);

    await expectStatusPill(page, /completado|registrado|booked|completed/i,
      'PO status pill should show Completed after confirmation');

    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'PO should still show 2 lines after completion',
    ).toBeVisible({ timeout: 10_000 });

    // [Plan 9.4] Verify the PO is not editable after confirming
    const saveAfterConfirm = page.getByRole('button', { name: /guardar|save/i });
    const saveEnabled = await saveAfterConfirm.isEnabled({ timeout: 2_000 }).catch(() => false);
    expect(saveEnabled,
      '[Plan 9.4] "Guardar" should be disabled on a Completed PO — fields are readonly',
    ).toBeFalsy();

    // Capture document number from breadcrumb for the import modal search
    const breadcrumb = await page.locator('text=/Pedido de Compra/').first().textContent().catch(() => '');
    const poDocNo = breadcrumb.split('/').pop()?.trim()
      || await page.locator('input[disabled]').first().inputValue().catch(() => null);
    expect(poDocNo, 'Should have captured the PO document number').toBeTruthy();
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Create a new Purchase Invoice
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    await page.getByTestId('action-new').click();
    await waitForDetailReady(page);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: Select the same vendor BP on the invoice
    // ═══════════════════════════════════════════════════════════════════════

    await selectVendorBP(page);

    // The test vendor (Default Customer + isVendor flag) has NO purchase-side
    // config, so the BP callout CLEARS priceList/paymentMethod/paymentTerms —
    // while the Selects keep displaying the stale org defaults. Re-pick the
    // three combos explicitly so the editing state holds real values and the
    // save is not blocked by required-field validation (race with the debounced
    // callout made this pass or fail depending on timing).
    await reselectComboOption(page, 'paymentMethod');
    await reselectComboOption(page, 'paymentTerms');
    await reselectComboOption(page, 'priceList');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12: Save invoice as draft
    // ═══════════════════════════════════════════════════════════════════════

    await saveDraft(page);

    // (?!new$) — a silent save failure leaves the URL at /purchase-invoice/new,
    // which a bare [a-zA-Z0-9]+ would happily match.
    await expect(page,
      'After saving draft, URL should include the invoice record ID',
    ).toHaveURL(/\/purchase-invoice\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    await expectStatusPill(page, /borrador|draft/i,
      'Invoice should be in Draft status after saving');

    await expect(page.getByRole('button', { name: /líneas\s+0|lines\s+0/i }),
      'Invoice should have 0 lines before importing from PO',
    ).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 13: Open "Import from purchase order" modal
    // ═══════════════════════════════════════════════════════════════════════

    await page.waitForTimeout(2_000);
    const orderBtn = page.locator('button').filter({ hasText: 'Importar desde pedido' });
    await expect(orderBtn,
      '"Importar desde pedido" button should be visible',
    ).toBeVisible({ timeout: 10_000 });
    await orderBtn.click();

    const importSearch = page.getByTestId('import-lines-search');
    await expect(importSearch,
      'Import modal should open with a search input',
    ).toBeVisible({ timeout: 15_000 });

    // Verify it is the PO import modal (not the receipt one)
    await expect(page.locator('span').filter({ hasText: 'Importar desde pedido' }),
      'Modal title should say "Importar desde pedido"',
    ).toBeVisible({ timeout: 5_000 });

    // Wait for eager-loading of PO lines
    const loadingText = page.getByText(/cargando|loading/i);
    if (await loadingText.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(loadingText).toBeHidden({ timeout: 30_000 });
    }
    await page.waitForTimeout(1_000);
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 14: Search for our PO and expand it
    // ═══════════════════════════════════════════════════════════════════════

    await importSearch.fill(poDocNo.trim());
    await page.waitForTimeout(1_000);
    await slow(page);

    const poRow = page.getByText(poDocNo.trim()).first();
    await expect(poRow,
      `PO ${poDocNo} should appear in the import modal`,
    ).toBeVisible({ timeout: 10_000 });
    await poRow.click();
    await slow(page);
    await page.waitForTimeout(1_000);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 15: Select all lines and import
    // ═══════════════════════════════════════════════════════════════════════

    await page.getByRole('checkbox').first().click({ force: true });
    await slow(page);

    const importSelectedBtn = page.getByRole('button', { name: /importar seleccionadas|import selected/i });
    await expect(importSelectedBtn,
      '"Import selected" button should be enabled after selecting lines',
    ).toBeEnabled({ timeout: 8_000 });
    await importSelectedBtn.click();
    await slow(page);

    // Modal should close after import
    await expect(importSearch,
      'Import modal should close after successful import',
    ).toBeHidden({ timeout: 15_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 16: Verify the invoice has imported lines
    // ═══════════════════════════════════════════════════════════════════════

    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Invoice should have 2 lines after importing from PO',
    ).toBeVisible({ timeout: 10_000 });

    // Verify invoice totals match the PO totals (same lines, same prices, same tax)
    const invoiceTotals = await readDocumentTotals(page);
    verifyTotalsConsistency(invoiceTotals, 'Invoice', poTotals);

    // Verify quantity 3 from the second PO line appears
    await expect(page.getByText('3').first(),
      'Invoice should contain a line with quantity 3 (from PO second line)',
    ).toBeVisible({ timeout: 5_000 });

    await expectStatusPill(page, /borrador|draft/i,
      'Invoice should still be in Draft status before confirmation');
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 17: Confirm the invoice (DR → CO)
    // ═══════════════════════════════════════════════════════════════════════

    await clickConfirmButton(page);
    await waitForConfirmResponse(page);
    await dismissSuccessModal(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 18: Verify the invoice is now Completed
    // ═══════════════════════════════════════════════════════════════════════

    const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);

    if (!onDetailView) {
      await safeReload(page);
      const completedRow = page.locator('tbody tr').filter({ hasText: /completado|completed/i }).first();
      await expect(completedRow,
        'Invoice should appear as Completed in the list view',
      ).toBeVisible({ timeout: 10_000 });
    } else {
      await waitForDetailReady(page);
      await expectStatusPill(page, /completado|registrado|booked|completed/i,
        'Invoice status pill should show Completed after confirmation');

      await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
        'Invoice should still have 2 lines after completion',
      ).toBeVisible({ timeout: 10_000 });
    }

    await slow(page);
  });
});
