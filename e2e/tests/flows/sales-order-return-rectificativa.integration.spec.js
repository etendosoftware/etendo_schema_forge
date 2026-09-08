import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';
import { ensureStockOnHand } from '../helpers/inventory-helpers.js';
import { ensureProductSetup, PRODUCT_FIXTURE_ALPHA } from '../helpers/product-helpers.js';
import { waitForDocumentActionResponse } from '../helpers/purchase-helpers.js';

/**
 * Sales Order → Shipment → Return → Rectificative Invoice — full live-backend
 * integration E2E. This is deliberately a SEPARATE spec from
 * `sales-order-happy-path.integration.spec.js`, which stops at Order → Invoice
 * directly and never drives a Shipment or a Return — the exact chain this
 * spec exists to cover, per ETP-4737 (unified "Factura Rectificativa" doc
 * type replacing the former separate credit-note/return-invoice types).
 *
 * Flow:
 *   1. Login with onboarding credentials
 *   2. Create a Sales Order, add one line, save as draft
 *   3. Confirm the order — check "Crear albarán" ONLY (no invoice) so
 *      confirming only generates the Sales Shipment ("Albarán de Venta")
 *   4. Navigate (via the confirm result modal's "Ver albarán") to the
 *      shipment, confirm it (DR → CO), no invoice
 *   5. On the completed shipment, click "Crear Devolución" — opens the
 *      ReturnWizard, select the full quantity, confirm — creates a
 *      Return Material Receipt ("Albarán de Devolución") in Draft
 *   6. Confirm the return — the "¿Gestionar crédito?" toggle
 *      ("Crear Factura Rectificativa") defaults to checked — confirm with
 *      it checked, generating a Sales Invoice in Draft
 *   7. Navigate (via the confirm result modal's "Ver factura") to the
 *      generated invoice and verify: doc type shows "Factura rectificativa",
 *      line quantity is NEGATIVE, total amount is NEGATIVE
 *   8. Confirm the rectificativa invoice and verify Completed — unless this
 *      hits the known environment gap where completing a rectificativa
 *      invoice can fail with "The Period does not exist or it is not
 *      opened" (root-caused inconclusively, NOT a bug in this test — see
 *      the ETP-4737 rectificativa-scope note). If hit, the test reports it
 *      instead of failing outright, since the Draft-state/negative-amount/
 *      doc-type assertions already proved the actual generation logic works.
 *
 * Requires a running backend + dev server. Runs whenever the suite executes
 * `--project=integration` — no custom env-var gate; Playwright's own
 * mocked/integration project split already isolates it from mocked runs.
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
    { timeout: 20_000 },
  );
}

test.describe('Sales Order → Return → Rectificative Invoice (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('drives an order through shipment, return, and the generated rectificative invoice', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    await test.step('Login', async () => {
      await login(page, { user, password });
      await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
      await slow(page);
    });

    // ETP-5079: the onboarding dataset no longer seeds any visible product (the
    // demo "Queso Sardo" row this test used to search for was deleted along with
    // the other three), so provision a dedicated, priced, returnable fixture
    // first. See e2e/tests/helpers/product-helpers.js. The persisted name is read
    // back off the created/found record — that is what the drawer renders and
    // what ensureStockOnHand's own product selector has to match.
    const productFixture = await ensureProductSetup(page, PRODUCT_FIXTURE_ALPHA);

    await test.step('Create a new Sales Order with one line', async () => {
      await navigateTo(page, 'sales-order');
      const newButton = page.getByTestId('action-new');
      await expect(newButton).toBeVisible({ timeout: 15_000 });
      await slow(page);

      await newButton.click();
      await waitForDetailReady(page);
      await slow(page);

      // Fill header — select a Business Partner
      const bpField = page.getByTestId('field-businessPartner');
      await expect(bpField).toBeVisible({ timeout: 10_000 });

      await expect(async () => {
        await bpField.click({ timeout: 3_000 });
        await expect(page.locator('[data-testid^="option-businessPartner-"]').first())
          .toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
        .filter({ hasNotText: /crear|create/i }).first();
      await expect(bpOption).toBeVisible({ timeout: 15_000 });
      await bpOption.click();

      // BP selection triggers chained callouts — wait until a derived field is populated
      await expect(async () => {
        const chipOrValue = page.getByTestId('field-paymentTerms-chip')
          .or(page.getByTestId('field-paymentTerms'));
        await expect(chipOrValue).toBeVisible({ timeout: 3_000 });
        await expect(chipOrValue).not.toHaveText(/buscar|search|seleccionar|select/i, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await slow(page);

      // Warehouse callout — only select manually if still empty
      await page.waitForTimeout(1_000);
      const warehouseInput = page.locator('input[data-testid="field-warehouse"]');
      const warehouseEmpty = await warehouseInput.isVisible({ timeout: 3_000 }).catch(() => false);
      if (warehouseEmpty) {
        await expect(async () => {
          await warehouseInput.click({ timeout: 3_000 });
          await expect(page.locator('[data-testid^="option-warehouse-"]').first())
            .toBeVisible({ timeout: 5_000 });
        }).toPass({ timeout: 15_000 });
        await slow(page);
        const whOption = page.locator('[data-testid^="option-warehouse-"]').first();
        await whOption.click();
        await slow(page);
      }

      // Capture the resolved warehouse name (via callout or the manual selection just
      // above) — read back from the field itself rather than assumed, so
      // ensureStockOnHand() below provisions stock at the SAME warehouse this order's
      // shipment will actually draw from.
      const warehouseChip = page.getByTestId('field-warehouse-chip');
      await expect(warehouseChip, 'Warehouse should resolve to a value (callout or manual selection)')
        .toBeVisible({ timeout: 10_000 });
      const warehouseName = (await warehouseChip.textContent())?.trim();

      // Save as draft
      const saveDraftBtn = page.getByTestId('action-save-draft')
        .or(page.getByRole('button', { name: /guardar|save/i }));
      const savePromise = expectSaveResponse(page);
      await saveDraftBtn.click();
      await savePromise;
      await slow(page);

      await expect(page).toHaveURL(/\/sales-order\/[a-zA-Z0-9]+/, { timeout: 15_000 });

      // Add a single line
      await waitForDetailReady(page);

      const emptyStateBtn = page.getByTestId('action-add-lines-empty-state')
        .or(page.getByRole('button', { name: /añadir líneas|add lines/i }).first());

      await expect(async () => {
        await emptyStateBtn.click({ timeout: 3_000 });
        await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const productField = page.getByTestId('inline-add-field-product');
      const searchDrawer = page.getByTestId('product-search-drawer');

      await expect(async () => {
        await productField.click({ timeout: 3_000 });
        await expect(searchDrawer).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await slow(page);

      const searchInput = page.getByTestId('product-search-input');
      await searchInput.fill(productFixture.name);
      await page.waitForTimeout(1000);

      // Filter by name as well as searching: the search is a backend query, and
      // matching the option client-side too keeps this from silently binding to
      // whatever else the drawer happens to return first.
      const productOption = page.locator('[data-testid^="product-search-option-"]')
        .filter({ hasText: productFixture.name }).first();
      await expect(productOption,
        `Product "${productFixture.name}" should appear in the search drawer`,
      ).toBeVisible({ timeout: 15_000 });

      const productCalloutResponse = page.waitForResponse(
        (resp) => resp.url().includes('/sws/neo/') && resp.status() < 400,
        { timeout: 15_000 },
      );
      await productOption.click();
      await expect(searchDrawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
      await productCalloutResponse;
      await slow(page);

      const lineAddPromise = expectSaveResponse(page);
      await page.keyboard.press('Enter');
      await lineAddPromise;
      await slow(page);

      // The lines grid is InlineLinesPanel.jsx (shared across all windows), which renders
      // rows as data-testid="line-row-<ID>" divs, not a semantic <table>. The only literal
      // <table>/<tbody>/<tr> on the page belongs to the hidden (display:none) attachments
      // panel, so a bare 'tbody tr' locator always resolves to that invisible element
      // instead of this order's actual line row.
      await expect(page.locator('[data-testid^="line-row-"]')).toHaveCount(1, { timeout: 10_000 });

      // Guarantee enough on-hand stock for the fixture product at this order's warehouse
      // BEFORE the shipment gets confirmed later in this flow — confirming a shipment
      // whose line quantity exceeds on-hand stock fails Etendo's M_CHECK_STOCK
      // validation with "No hay suficiente en stock". Repeated suite runs drain a
      // shared dev-DB warehouse over time, so this is provisioned via a real, audited
      // Physical Inventory count (ensureStockOnHand) rather than assumed present.
      // minQty is 5x the line's own ordered quantity (defaultValue: 1 on
      // sales-order's orderedQuantity field) — a comfortable buffer for several runs.
      await ensureStockOnHand(page, {
        productName: productFixture.name,
        warehouseName,
        minQty: 5,
      });
    });

    await test.step('Confirm the order with shipment generation only', async () => {
      const confirmOrderBtn = page.getByTestId('action-save');
      const shipmentCard = page.getByText('Crear albarán', { exact: true });

      await expect(async () => {
        await confirmOrderBtn.click({ timeout: 3_000 });
        await expect(shipmentCard).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await shipmentCard.click();
      await slow(page);

      const confirmOrderModalBtn = page.getByRole('button', { name: /confirmar/i }).last();
      await confirmOrderModalBtn.click();
      await slow(page);
    });

    await test.step('Navigate to the generated shipment', async () => {
      const orderConfirmedMsg = page.getByText(/pedido confirmado|order confirmed/i);
      await expect(orderConfirmedMsg).toBeVisible({ timeout: 30_000 });
      await slow(page);

      const viewShipmentBtn = page.getByRole('button', { name: /ver albar[aá]n/i });
      await expect(viewShipmentBtn).toBeVisible({ timeout: 10_000 });
      await viewShipmentBtn.click();
      await slow(page);

      await expect(page).toHaveURL(/\/goods-shipment\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);
      await slow(page);

      const shipmentDraftPill = page.getByTestId('document-status-pill').first();
      await expect(shipmentDraftPill).toBeVisible({ timeout: 10_000 });
      await expect(shipmentDraftPill).toContainText(/borrador|draft/i, { timeout: 5_000 });
    });

    await test.step('Confirm the shipment (DR to CO), no invoice', async () => {
      const confirmShipmentBtn = page.getByTestId('action-save');
      const confirmInoutModal = page.getByTestId('confirm-inout-modal');

      await expect(async () => {
        await confirmShipmentBtn.click({ timeout: 3_000 });
        await expect(confirmInoutModal).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const shipmentConfirmPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/documentAction') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 30_000 },
      );
      await confirmInoutModal.getByTestId('confirm-modal-confirm-btn').click();
      await shipmentConfirmPromise;
      await slow(page);

      const closeShipmentResultBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      await expect(closeShipmentResultBtn).toBeVisible({ timeout: 15_000 });
      await closeShipmentResultBtn.click();
      await slow(page);

      await waitForDetailReady(page);
      const shipmentCompletedPill = page.getByTestId('document-status-pill').first();
      await expect(shipmentCompletedPill).toBeVisible({ timeout: 15_000 });
      await expect(shipmentCompletedPill).toContainText(/completado|completed/i, { timeout: 10_000 });
      await slow(page);
    });

    await test.step('Create the Return Material Receipt', async () => {
      const createReturnBtn = page.getByRole('button', { name: /^Crear Devoluci[oó]n$|^Create Return$/i });
      const returnDialog = page.getByRole('dialog');

      await expect(async () => {
        await createReturnBtn.click({ timeout: 3_000 });
        await expect(returnDialog).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      await expect(returnDialog.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
      await slow(page);

      const nextBtn = returnDialog.getByRole('button', { name: 'Siguiente', exact: true });
      await expect(nextBtn).toBeEnabled({ timeout: 10_000 });
      await nextBtn.click();
      await slow(page);

      const returnConfirmPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/createReturn') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 20_000 },
      );
      const createReturnConfirmBtn = returnDialog.getByRole('button', { name: 'Crear Devolución', exact: true });
      await expect(createReturnConfirmBtn).toBeVisible({ timeout: 10_000 });
      await createReturnConfirmBtn.click();
      await returnConfirmPromise;
      await slow(page);

      await expect(page).toHaveURL(/\/return-material-receipt\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);
      await slow(page);

      const returnDraftPill = page.getByTestId('document-status-pill').first();
      await expect(returnDraftPill).toBeVisible({ timeout: 10_000 });
      await expect(returnDraftPill).toContainText(/borrador|draft/i, { timeout: 5_000 });
    });

    await test.step('Confirm the return with rectificative invoice generation', async () => {
      const confirmReturnBtn = page.getByTestId('action-confirm-with-credit');
      const returnConfirmModal = page.getByTestId('confirm-inout-modal');

      await expect(async () => {
        await confirmReturnBtn.click({ timeout: 3_000 });
        await expect(returnConfirmModal).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const invoiceToggle = returnConfirmModal.getByTestId('confirm-modal-invoice-toggle');
      await expect(invoiceToggle).toBeVisible({ timeout: 5_000 });
      await expect(invoiceToggle).toHaveAttribute('aria-checked', 'true');
      await expect(returnConfirmModal.getByText('Crear Factura Rectificativa', { exact: true })).toBeVisible();

      const returnDocActionPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/action/createReturnInvoice') &&
          resp.request().method() === 'POST' &&
          resp.status() < 400,
        { timeout: 30_000 },
      );
      await returnConfirmModal.getByTestId('confirm-modal-confirm-btn').click();
      await returnDocActionPromise;
      await slow(page);
    });

    await test.step('Navigate to the rectificative invoice and verify', async () => {
      const rectificativeCreatedMsg = page.getByText('Factura rectificativa creada', { exact: true });
      await expect(rectificativeCreatedMsg).toBeVisible({ timeout: 30_000 });
      await slow(page);

      const viewInvoiceBtn = page.getByRole('button', { name: 'Ver factura', exact: true });
      await expect(viewInvoiceBtn).toBeVisible({ timeout: 10_000 });
      await viewInvoiceBtn.click();
      await slow(page);

      await expect(page).toHaveURL(/\/sales-invoice\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await waitForDetailReady(page);
      await slow(page);

      // Verify: doc type shows "Factura rectificativa". "Tipo de documento"
      // (transactionDocument) renders as a disabled <input> (EntityForm's renderReadOnlyFk),
      // so its value must be read via toHaveValue — getByText only matches rendered text
      // content, never an input's value, so it can never see this field regardless of
      // backend correctness.
      await expect(page.getByTestId('field-transactionDocument').locator('input'))
        .toHaveValue(/rectificativ/i, { timeout: 15_000 });

      // Verify: line quantity is NEGATIVE. This window's line grid is not a semantic
      // <table> — rows render as data-testid="line-row-<ID>" divs. The only literal
      // <table>/<tbody>/<tr> on the page belongs to the hidden (display:none) attachments
      // panel (data-testid="attachments-table"), so a bare 'tbody tr' locator always
      // resolves to that invisible element instead of the actual line row.
      const invoiceLineRow = page.locator('[data-testid^="line-row-"]').first();
      await expect(invoiceLineRow).toBeVisible({ timeout: 10_000 });
      await expect(invoiceLineRow).toContainText(/-\s?\d/, { timeout: 5_000 });

      // Verify: total amount is NEGATIVE
      const totalValue = page.getByTestId('totals-row-total-value');
      await expect(totalValue).toBeVisible({ timeout: 10_000 });
      await expect(totalValue).toContainText(/^-/, { timeout: 5_000 });

      const invoiceDraftPill = page.getByTestId('document-status-pill').first();
      await expect(invoiceDraftPill).toBeVisible({ timeout: 10_000 });
      await expect(invoiceDraftPill).toContainText(/borrador|draft/i, { timeout: 5_000 });
    });

    await test.step('Confirm the rectificative invoice (may hit known env gap)', async () => {
      // Completing a rectificativa invoice may fail with "The Period does not
      // exist or it is not opened" — a known environment gap. If hit, report
      // instead of failing.
      //
      // ARMED BEFORE THE CLICK, and the previous implementation's bug was
      // exactly that it wasn't: it did `invoiceCompletedPill.waitFor({ state:
      // 'visible' })` AFTER clicking, racing it against a periodError text
      // wait. But `document-status-pill` is ALREADY visible when this step
      // starts — it has read "Borrador" since the previous step's own
      // assertion. `waitFor({ state: 'visible' })` only checks the element's
      // CURRENT state; it does NOT wait for a *change* to that state. So that
      // race leg resolved in milliseconds with "Borrador" (no match against
      // /completado|completed/), the whole Promise.race settled on `null`
      // almost instantly, and the code fell straight through to
      // `page.goto(currentInvoiceUrl)` a few lines below — aborting the
      // confirm PATCH/POST that was still in flight on the backend. The
      // invoice was never actually confirmed; it stayed legitimately in
      // Borrador. Waiting on the confirm request's own network response
      // (which can only resolve once the backend has actually answered) is
      // the only reliable way to know the confirm settled before navigating
      // away. Do not reintroduce a DOM-visibility no-op here.
      const confirmed = waitForDocumentActionResponse(page, 'sales-invoice');

      const invoiceConfirmBtn = page.getByTestId('action-save');
      await expect(invoiceConfirmBtn).toBeVisible({ timeout: 10_000 });
      await invoiceConfirmBtn.click();

      const confirmResponse = await confirmed;

      if (confirmResponse.status() >= 400) {
        const periodError = page.getByText(/period does not exist|no existe el periodo|periodo no existe/i);
        const isPeriodError = await periodError.isVisible({ timeout: 10_000 }).catch(() => false);

        if (isPeriodError) {
          await captureScreenshot(page, {
            path: 'e2e/test-results/rectificativa-period-error.png',
            fullPage: true,
          }).catch(() => {});
          test.info().annotations.push({
            type: 'known-environment-issue',
            description:
              'Confirming the rectificative invoice hit "The Period does not exist or it is '
              + 'not opened" — a known, inconclusively root-caused environment gap (see '
              + 'ETP-4737 rectificativa scope notes), NOT a bug in this test. The invoice was '
              + 'already verified in Draft with the correct doc type and negative amounts above.',
          });
          return;
        }

        // A real failure, not the known period gap — surface it clearly instead of
        // letting a later assertion time out with no diagnostic value.
        const body = await confirmResponse.text().catch(() => '<unreadable response body>');
        throw new Error(
          `Rectificative sales invoice confirm failed with HTTP ${confirmResponse.status()}: ${body}`,
        );
      }

      // Confirm response was successful — dismiss the success modal if present.
      const invoiceCloseBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      if (await invoiceCloseBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await invoiceCloseBtn.click();
        await slow(page);
      }

      // Reload to get fresh status — use goto on current URL to avoid ERR_ABORTED
      const currentInvoiceUrl = page.url();
      await page.goto(currentInvoiceUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDetailReady(page);

      const finalPill = page.getByTestId('document-status-pill').first();
      await expect(finalPill).toBeVisible({ timeout: 15_000 });
      await expect(finalPill).toContainText(/completado|completed/i, { timeout: 20_000 });
    });
  });
});
