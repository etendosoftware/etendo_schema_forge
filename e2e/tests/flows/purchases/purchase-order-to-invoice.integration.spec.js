// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
// @covers artifacts/purchase-order/custom/PurchaseOrderActions.jsx
// @covers artifacts/purchase-invoice/custom/PurchaseInvoiceBottomPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/LinesEmptyState.jsx
import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../../helpers/auth.js';
import { ensureOpenPeriod } from '../../helpers/period-helpers.js';
import { waitForLoadingIndicatorsGone } from '../../helpers/selectors.js';
import { t } from '../../helpers/i18n.js';
import {
  ensureProductFixtures, PRODUCT_FIXTURE_ALPHA, PRODUCT_FIXTURE_BETA,
} from '../../helpers/product-helpers.js';
import {
  loadCredentials, slow, waitForDetailReady, selectVendorBP,
  addProductLine, createDraftWithFirstLine, leaveNewDocumentThroughEmptyLines, ensureVendorSetup, clickConfirmButton, expectStatusPill,
  dismissSuccessModal, safeReload, readDocumentTotals, verifyTotalsConsistency,
  derivedFieldLocator, waitForLinesSettled,
} from '../../helpers/purchase-helpers.js';

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
    // Open the accounting period up front: without it the confirm fails much
    // later on an unrelated UI element with a generic Playwright timeout.
    await ensureOpenPeriod();

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

    // No Guardar first: "+ Añadir líneas" saves the header itself, the path a user takes.
    await test.step('Add two product lines, the first from the empty state (no manual save)', async () => {
      await createDraftWithFirstLine(page, {
        spec: 'purchase-order', via: 'emptyState', productName: PRODUCT_FIXTURE_ALPHA.name,
      });
      await expectStatusPill(page, /borrador|draft/i,
        'PO should be in Draft status once the first line has saved its header');
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
      // ETP-5063/ETP-5674: confirming without a receipt or invoice creates no
      // document, so there is no generated-documents popup — success is the
      // "Pedido de compra confirmado" toast. Scope to the success toast: a loose
      // page-text regex also matched the still-open ConfirmModal's own copy.
      await expect(page.locator('[data-type="success"]').first(),
        'Confirming with no generated document should show the success toast',
      ).toContainText(/Pedido de compra confirmado|Purchase order confirmed/i, { timeout: 30_000 });
      await expect(page.getByTestId('confirm-result-dialog'),
        'No generated-documents popup when nothing was generated',
      ).toHaveCount(0);

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

      // Capture document number from the breadcrumb's current page for the import modal search.
      // ETP-5504: the TopBar breadcrumb is structured — "Pedido de Compra" is its own button and
      // the record title is the `topbar-breadcrumb-current` level — so parsing the text of the
      // node that matches the window name would return the window name, not the document number.
      const currentCrumb = await page.getByTestId('topbar-breadcrumb-current')
        .textContent({ timeout: 5_000 }).catch(() => '');
      const fullCrumb = currentCrumb ? '' : await page.getByTestId('topbar-breadcrumb')
        .textContent({ timeout: 2_000 }).catch(() => '');
      poDocNo = currentCrumb?.trim()
        || fullCrumb?.split(' / ').pop()?.trim()
        || await page.locator('input[disabled]').first().inputValue().catch(() => null);
      expect(poDocNo, 'Should have captured the PO document number').toBeTruthy();
      expect(poDocNo, 'Captured the window name instead of the PO document number')
        .not.toMatch(/^(Pedido de Compra|Purchase Order)$/i);
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

    // No Guardar first: the import button of the empty state saves the invoice header
    // itself and then opens the modal, the path a user takes.
    await test.step('Open "Import from purchase order" from the empty state (no manual save)', async () => {
      // Captured so the post-confirmation check can target THIS invoice's row
      // (`row-{id}`) instead of "the first Completed row", which any leftover
      // invoice from an earlier run also satisfies.
      invoiceId = await leaveNewDocumentThroughEmptyLines(page, {
        spec: 'purchase-invoice',
        via: 'emptyState',
        trigger: page.getByRole('button', { name: t('importFromPurchaseOrder') }),
      });

      await expect(page.getByTestId('import-lines-search'),
        'The import modal should open once the invoice header is saved',
      ).toBeVisible({ timeout: 15_000 });
      await expectStatusPill(page, /borrador|draft/i,
        'Invoice should be in Draft status once the import has saved its header');

      // Verify it is the PO import modal (not the receipt one)
      await expect(page.locator('span').filter({ hasText: /importar desde pedido|import from order/i }),
        'Modal title should say "Importar desde pedido"',
      ).toBeVisible({ timeout: 5_000 });

      // Wait for eager-loading of PO lines
      await waitForLoadingIndicatorsGone(page, { timeout: 30_000 }).catch(() => {});
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
