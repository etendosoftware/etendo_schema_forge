import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import {
  ensureProductFixtures, PRODUCT_FIXTURE_ALPHA, PRODUCT_FIXTURE_BETA,
} from '../helpers/product-helpers.js';
import {
  loadCredentials, slow, waitForDetailReady, saveDraft, selectVendorBP,
  addProductLine, ensureVendorSetup, clickConfirmButton, expectStatusPill,
  dismissSuccessModal, safeReload, readDocumentTotals, verifyTotalsConsistency,
  derivedFieldLocator, waitForLinesSettled,
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

  test('creates a PO, confirms it, then creates an invoice importing its lines', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    await test.step('Login', async () => {
      await login(page, { user, password });
      await expect(page, 'Login should redirect to /dashboard').toHaveURL(/dashboard/, { timeout: 30_000 });
      await slow(page);
    });

    await test.step('Ensure the contact has isVendor = true', async () => {
      await ensureVendorSetup(page, { navigateTo });
    });

    // ETP-5079: the onboarding dataset no longer seeds any visible product, so the
    // two lines below have nothing to pick unless the suite provisions its own
    // fixtures first. See e2e/tests/helpers/product-helpers.js.
    await test.step('Ensure product fixtures', async () => {
      await ensureProductFixtures(page);
    });

    await test.step('Create a new Purchase Order', async () => {
      await navigateTo(page, 'purchase-order');
      await slow(page);

      const newButton = page.getByTestId('action-new');
      await expect(newButton).toBeVisible({ timeout: 20_000 });
      await newButton.click();
      await waitForDetailReady(page);
      await slow(page);
    });

    await test.step('Select vendor BP and verify callout fields', async () => {
      await selectVendorBP(page);

      // [Plan 2.2] Verify BP callout populated dependent fields.
      // partnerAddress (column C_BPartner_Location_ID) is special-cased in
      // DependentFkField (EntityForm.jsx) to render via PartnerAddressPicker →
      // CreatableSearchSelect, which shows the value as a `-chip` (SelectorChip)
      // once selected, or the plain `field-partnerAddress` search input
      // otherwise — never both, and never a generic `.truncate` CSS class (the
      // previous CSS fallback here matched an empty node instead). Use a
      // retrying assertion, not a one-shot textContent() sample — selectVendorBP
      // already waits for this field to settle, but that wait covers the modal
      // click above; re-asserting here also guards against future changes to
      // that helper regressing this check silently.
      const addressField = derivedFieldLocator(page, 'partnerAddress');
      await expect(addressField,
        '[Plan 2.2] Address should be auto-filled after selecting the vendor (callout)',
      ).not.toHaveText(/^$|buscar|search|seleccionar|select/i, { timeout: 15_000 });

      // [Plan 2.6] Verify purchase price list was inherited
      const priceListField = derivedFieldLocator(page, 'priceList');
      await expect(priceListField,
        '[Plan 2.6] Price list should be inherited from the vendor',
      ).not.toHaveText(/^$|buscar|search|seleccionar|select/i, { timeout: 15_000 });

      // [Plan 2.5] Verify "Fecha de entrega esperada" is present (PO-exclusive required field)
      await expect(page.getByText(/fecha de entrega esperada|expected delivery/i),
        '[Plan 2.5] "Fecha de entrega esperada" should be visible — PO-exclusive required field',
      ).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Save PO as draft', async () => {
      await saveDraft(page);

      await expect(page,
        'After saving draft, URL should include the PO record ID',
      ).toHaveURL(/\/purchase-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });

      // Wait for the detail to fully load after save redirect
      await waitForDetailReady(page);

      await expectStatusPill(page, /borrador|draft/i,
        'PO should be in Draft status after saving');
    });

    await test.step('Add two product lines', async () => {
      await addProductLine(page, { isFirst: true, productName: PRODUCT_FIXTURE_ALPHA.name });
      await addProductLine(page, { productName: PRODUCT_FIXTURE_BETA.name, quantity: '3' });

      await expect(page.locator('tbody tr'),
        'PO should have 2 lines after adding both products',
      ).toHaveCount(2, { timeout: 10_000 });

      // Verify PO totals: subtotal > 0, tax > 0, total = subtotal + tax
      const poTotals = await readDocumentTotals(page);
      verifyTotalsConsistency(poTotals, 'PO');
    });

    // Store poTotals at a scope accessible by later steps
    let poTotals;

    await test.step('Read PO totals for later comparison', async () => {
      poTotals = await readDocumentTotals(page);
    });

    await test.step('Confirm the Purchase Order (no receipt, no invoice)', async () => {
      await clickConfirmButton(page);

      // Click the confirm button inside the modal — retry click→modal sequence
      const modalConfirmBtn = page.getByRole('button', { name: /^confirmar pedido$|^confirm order$/i });

      await expect(async () => {
        await expect(modalConfirmBtn).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      // Declare response listener BEFORE clicking the modal confirm button
      const confirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') &&
          ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
          r.ok(),
        { timeout: 30_000 },
      );
      await modalConfirmBtn.click();
      await confirmResponse;
      await slow(page);
    });

    await test.step('Verify PO confirmation succeeded', async () => {
      const successMsg = page.getByText(/pedido.*confirmado|order.*confirmed/i);
      await expect(successMsg,
        'Success modal should show "Pedido de compra confirmado"',
      ).toBeVisible({ timeout: 30_000 });

      await dismissSuccessModal(page);
    });

    let poDocNo;
    let invoiceId;

    await test.step('Verify PO is Completed and capture document number', async () => {
      await safeReload(page);
      await waitForDetailReady(page);

      await expectStatusPill(page, /completado|registrado|booked|completed/i,
        'PO status pill should show Completed after confirmation');

      // After a reload the lines count badge may briefly show "0" while the
      // lines fetch is in-flight, and — per waitForLinesSettled's own doc
      // comment — can even flash the right count once and reset before it
      // sticks. This is exactly the reload scenario that helper exists for.
      await waitForLinesSettled(page, 2, 'PO should still show 2 lines after completion');

      // [Plan 9.4] Verify the PO is not editable after confirming
      const saveAfterConfirm = page.getByRole('button', { name: /guardar|save/i });
      const saveEnabled = await saveAfterConfirm.isEnabled({ timeout: 2_000 }).catch(() => false);
      expect(saveEnabled,
        '[Plan 9.4] "Guardar" should be disabled on a Completed PO — fields are readonly',
      ).toBeFalsy();

      // Capture document number from breadcrumb for the import modal search
      const breadcrumb = await page.locator('text=/Pedido de Compra/').first().textContent().catch(() => '');
      poDocNo = breadcrumb.split('/').pop()?.trim()
        || await page.locator('input[disabled]').first().inputValue().catch(() => null);
      expect(poDocNo, 'Should have captured the PO document number').toBeTruthy();
      await slow(page);
    });

    await test.step('Create a new Purchase Invoice', async () => {
      await navigateTo(page, 'purchase-invoice');
      await slow(page);

      const newButton = page.getByTestId('action-new');
      await expect(newButton).toBeVisible({ timeout: 20_000 });
      await newButton.click();
      await waitForDetailReady(page);
      await slow(page);
    });

    await test.step('Select the same vendor BP on the invoice', async () => {
      await selectVendorBP(page);
      // selectVendorBP already waits for derived fields via toPass() — no extra
      // networkidle or waitForTimeout needed.
    });

    await test.step('Save invoice as draft', async () => {
      await saveDraft(page);

      // The save may succeed but the frontend redirect from /new to /{id} can be
      // slow. First give it a generous window to land on the record URL.
      const saved = await page.waitForURL(
        /\/purchase-invoice\/(?!new$)[a-zA-Z0-9]+$/,
        { timeout: 20_000 },
      ).then(() => true).catch(() => false);

      // If we're still on /new the save genuinely failed (callout arrived late,
      // required-field validation). Retry once — selectVendorBP already waited
      // for callouts, but the form may need another save attempt.
      if (!saved && page.url().endsWith('/new')) {
        await saveDraft(page);
      }

      await expect(page,
        'After saving draft, URL should include the invoice record ID',
      ).toHaveURL(/\/purchase-invoice\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 });
      await waitForDetailReady(page);

      // Captured so the post-confirmation check can target THIS invoice's row
      // (`row-{id}`) instead of "the first Completed row", which any leftover
      // invoice from an earlier run also satisfies.
      invoiceId = (page.url().match(/\/purchase-invoice\/([^/?]+)/) || [])[1];
      expect(invoiceId, 'Should have captured the invoice record id from the URL').toBeTruthy();

      await expectStatusPill(page, /borrador|draft/i,
        'Invoice should be in Draft status after saving');

      await expect(page.getByRole('button', { name: /líneas\s+0|lines\s+0/i }),
        'Invoice should have 0 lines before importing from PO',
      ).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Open "Import from purchase order" modal', async () => {
      const orderBtn = page.locator('button').filter({ hasText: /importar desde pedido|import from order/i });

      // Retry click→modal sequence
      const importSearch = page.getByTestId('import-lines-search');
      await expect(async () => {
        await orderBtn.click({ timeout: 3_000 });
        await expect(importSearch).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      // Verify it is the PO import modal (not the receipt one)
      await expect(page.locator('span').filter({ hasText: /importar desde pedido|import from order/i }),
        'Modal title should say "Importar desde pedido"',
      ).toBeVisible({ timeout: 5_000 });

      // Wait for eager-loading of PO lines
      await expect(page.getByText(/cargando|loading/i)).toBeHidden({ timeout: 30_000 })
        .catch(() => {}); // OK if loading indicator never appeared
      await slow(page);
    });

    await test.step('Search for our PO and expand it', async () => {
      const importSearch = page.getByTestId('import-lines-search');
      await importSearch.fill(poDocNo.trim());
      await slow(page);

      const poRow = page.getByText(poDocNo.trim()).first();
      await expect(poRow,
        `PO ${poDocNo} should appear in the import modal`,
      ).toBeVisible({ timeout: 10_000 });
      await poRow.click();
      await slow(page);
    });

    await test.step('Select all lines and import', async () => {
      await page.getByRole('checkbox').first().click({ force: true });
      await slow(page);

      const importSelectedBtn = page.getByRole('button', { name: /importar seleccionadas|import selected/i });
      await expect(importSelectedBtn,
        '"Import selected" button should be enabled after selecting lines',
      ).toBeEnabled({ timeout: 8_000 });
      await importSelectedBtn.click();
      await slow(page);

      // Modal should close after import
      const importSearch = page.getByTestId('import-lines-search');
      await expect(importSearch,
        'Import modal should close after successful import',
      ).toBeHidden({ timeout: 15_000 });
      await slow(page);
    });

    await test.step('Verify the invoice has imported lines', async () => {
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
    });

    await test.step('Confirm the invoice (DR → CO)', async () => {
      // Declare response listener BEFORE clicking confirm
      const confirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') &&
          ['POST', 'PUT', 'PATCH'].includes(r.request().method()) &&
          r.ok(),
        { timeout: 30_000 },
      );
      await clickConfirmButton(page);
      await confirmResponse;
      await dismissSuccessModal(page);
    });

    await test.step('Verify the invoice is now Completed', async () => {
      const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);

      if (!onDetailView) {
        // Confirming navigated back to the list. Wait for the list itself before
        // asserting on a row — safeReload() only awaits domcontentloaded, so the
        // row query used to race the list's own data fetch.
        await safeReload(page);
        await expect(page.getByTestId('list-view'),
          'Reloading after confirmation should land on the purchase-invoice list',
        ).toBeVisible({ timeout: 20_000 });

        // Target THIS invoice by record id, and read its status from the
        // language-independent `data-row-status` attribute (DataTable) rather
        // than from translated cell text.
        const invoiceRow = page.getByTestId(`row-${invoiceId}`);
        await expect(invoiceRow,
          'The confirmed invoice should appear in the list view',
        ).toBeVisible({ timeout: 15_000 });
        await expect(invoiceRow,
          'Invoice should appear as Completed in the list view',
        ).toHaveAttribute('data-row-status', 'CO', { timeout: 10_000 });
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
});
