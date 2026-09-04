import { test, expect } from '@playwright/test';
import { navigateTo } from '../helpers/auth.js';
import {
  waitForDetailReady, expectSaveResponse, waitForConfirmResponse, slow,
} from '../helpers/purchase-helpers.js';
import { ensureStockOnHand, DEFAULT_WAREHOUSE_NAME } from '../helpers/inventory-helpers.js';
import { ensureProductSetup, PRODUCT_FIXTURE_ALPHA } from '../helpers/product-helpers.js';
import {
  loginAndAssertJsreport, waitUntilCompleted, downloadAndAssertPdf,
} from '../helpers/printable-helpers.js';

// Both of these used to be literals ('Queso Sardo' / 'Almacen GO') naming rows the
// GOClient onboarding dataset happened to seed. ETP-5079 deleted the four demo
// products and renamed the warehouse, so a fresh tenant has neither — this spec
// was written against the old dataset in parallel and broke on the merge. Name the
// fixture and the shared constant instead: the product is provisioned by the spec
// itself via ensureProductSetup, and the warehouse name lives in one place.
const PRODUCT = PRODUCT_FIXTURE_ALPHA.name;
const WAREHOUSE = DEFAULT_WAREHOUSE_NAME;

/**
 * Printable downloads — sales flow (integration, live backend).
 *
 * Walks a sales flow (order → shipment → invoice) and downloads the printable at
 * every stage, proving the whole chain end to end: app → vite `/jsreport` proxy
 * → jsreport → Chromium → PDF.
 *
 * It deliberately covers BOTH document templates, not three variations of one:
 * the order and the invoice render the *commercial* template (prices, tax,
 * total) while the shipment renders the *movement* one (quantities and a
 * signature, no prices). They are different documents by design, so a break in
 * one would not be caught by the other.
 *
 * Three design choices worth keeping — each one cost a failing run to learn:
 *
 * 1. It CREATES and CONFIRMS its own order instead of opening a seeded one.
 *    A first attempt opened an existing document and broke on a tenant whose
 *    orders were all in another status.
 *
 * 2. It must reach CO before printing. There is no printable on a draft, in ANY
 *    entry point: `hidePrintWhen: { documentStatus: { notEquals: 'CO' } }` keeps
 *    the detail print button from rendering at all, and the row-preview overlay
 *    renders "Descargar PDF" disabled. This is a business rule, not a timing
 *    issue — do not "fix" a failure here by waiting longer.
 *
 * 3. Confirming a freshly created record is also what makes the assertion
 *    meaningful. A pre-existing completed document may serve a CACHED PDF
 *    attachment instead of rendering (`storeCondition: documentStatus !== 'DR'`),
 *    so it could pass with jsreport completely down. A record created seconds
 *    ago has nothing cached, so these bytes always come from a fresh render.
 *
 * Covers ONE of the five entry points that produce a document (the detail print
 * drawer). The two email paths are wired separately in different files and are
 * NOT protected by this spec — see docs/document-printables.md § "Where the
 * printables are used" before assuming coverage.
 */

/**
 * Create a draft document with a customer and one product line.
 *
 * The sales order and the sales quotation share this exact opening — same
 * fields, same callouts, same inline line editor — so it is parametrised by
 * window slug rather than copied.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} windowSlug e.g. "sales-order" or "sales-quotation"
 */
async function createDraftWithLine(page, windowSlug) {
  await test.step(`Create a draft ${windowSlug} with a customer`, async () => {
    await navigateTo(page, windowSlug);
    const newButton = page.getByTestId('action-new');
    await expect(newButton).toBeVisible({ timeout: 20_000 });
    await newButton.click();
    await waitForDetailReady(page);

    const bpField = page.getByTestId('field-businessPartner');
    await expect(bpField).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      await bpField.click({ timeout: 3_000 });
      await expect(page.locator('[data-testid^="option-businessPartner-"]').first())
        .toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });

    const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(bpOption).toBeVisible({ timeout: 15_000 });
    await bpOption.click();

    // Selecting a BP fires chained callouts (price list, payment terms, currency,
    // address, warehouse). Wait for a derived field instead of networkidle.
    await expect(async () => {
      const chipOrValue = page.getByTestId('field-paymentTerms-chip')
        .or(page.getByTestId('field-paymentTerms'));
      await expect(chipOrValue).toBeVisible({ timeout: 3_000 });
      await expect(chipOrValue).not.toHaveText(/buscar|search|seleccionar|select/i, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    const saveBtn = page.getByTestId('action-save-draft')
      .or(page.getByRole('button', { name: /guardar|save/i }));
    const savePromise = expectSaveResponse(page);
    await saveBtn.click();
    await savePromise;

    await expect(page).toHaveURL(new RegExp(`/${windowSlug}/[a-zA-Z0-9]+`), { timeout: 20_000 });
    await waitForDetailReady(page);
    await slow(page);
  });

  await test.step('Add a product line', async () => {
    const emptyStateBtn = page.getByTestId('action-add-lines-empty-state')
      .or(page.getByRole('button', { name: /añadir líneas|add lines/i }).first());
    await expect(emptyStateBtn).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await emptyStateBtn.click({ timeout: 5_000 });
      await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 30_000 });

    const productField = page.getByTestId('inline-add-field-product');
    const searchDrawer = page.getByTestId('product-search-drawer');
    await expect(async () => {
      await productField.click({ timeout: 3_000 });
      await expect(searchDrawer).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });

    await page.getByTestId('product-search-input').fill(PRODUCT);
    const productOption = page.locator('[data-testid^="product-search-option-"]')
      .filter({ hasText: new RegExp(PRODUCT, 'i') }).first();
    await expect(productOption).toBeVisible({ timeout: 15_000 });

    // Retry the click: the drawer re-renders its list when waterfall fetches
    // complete, which can detach the option mid-click (see purchase-helpers.js).
    let productCallout;
    await expect(async () => {
      productCallout = page.waitForResponse(
        (resp) => resp.url().includes('/sws/neo/') && resp.status() < 400,
        { timeout: 30_000 },
      );
      await productOption.click({ timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
    await expect(searchDrawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
    await productCallout;

    const lineAdded = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await lineAdded;

    await expect(page.getByText(PRODUCT).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('inline-add-row')).toBeHidden({ timeout: 15_000 }).catch(() => {});
    await slow(page);
  });
}

test.describe('Printable downloads — sales flow (integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test('every confirmed stage of the sales flow downloads a real PDF', async ({ page }) => {
    await loginAndAssertJsreport(page);
    // The dataset seeds no products at all since ETP-5079, so the drawer would be
    // empty. Provision the fixture before anything tries to pick a line.
    await ensureProductSetup(page, PRODUCT_FIXTURE_ALPHA);

    await createDraftWithLine(page, 'sales-order');

    // Captured before the stock step, which navigates away to run a Physical
    // Inventory count and must come back here.
    const orderUrl = page.url();
    let shipmentDocNo = '';

    await test.step('Ensure there is stock to ship', async () => {
      // Confirming the shipment moves stock out, so repeated runs drain it and
      // the confirm starts failing — which is how this spec first went from
      // passing to failing on its 2nd and 3rd consecutive run. The same drain
      // is documented in sales-quotation-full-flow for this exact product and
      // warehouse. Provisioned through a real, audited Physical Inventory count
      // (never a raw SQL UPDATE); the generous minQty is a buffer meant to
      // survive several runs in a day.
      await ensureStockOnHand(page, {
        productName: PRODUCT,
        warehouseName: WAREHOUSE,
        minQty: 200,
      });
      await page.goto(orderUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForDetailReady(page);
    });

    await test.step('Confirm the order, creating both a shipment and an invoice', async () => {
      // The two CheckboxCards are independent (see OrderConfirmModal.jsx): the
      // order is set to CO either way, then the shipment and the invoice are
      // created for whichever boxes are ticked. Ticking both gets all three
      // documents — and the shipment brings in the movement template, a
      // genuinely different document from the commercial one the order and the
      // invoice share.
      const confirmBtn = page.getByTestId('action-save');
      const shipmentCard = page.getByText(/crear albarán|create shipment/i).first();
      const invoiceCard = page.getByText(/crear factura|create invoice/i).first();
      await expect(async () => {
        await confirmBtn.click({ timeout: 3_000 });
        await expect(shipmentCard).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });
      await shipmentCard.click();
      await invoiceCard.click();

      const modalBtn = page.getByRole('button', { name: /confirmar|confirm/i }).last();
      await expect(modalBtn).toBeVisible({ timeout: 5_000 });
      const confirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/')
          && ['POST', 'PUT', 'PATCH'].includes(r.request().method())
          && r.ok(),
        { timeout: 60_000 },
      );
      await modalBtn.click();
      await confirmResponse;

      // Capture the shipment's document number from the success modal so the
      // later stage targets THAT document instead of "whichever row sorts first".
      //
      // Why not the modal's own "Ver albarán →" button: it only renders when
      // `shipment?.id` is truthy (see OrderConfirmModal.jsx), and the backend's
      // createShipment response does not populate the id where the modal reads
      // it — so neither that button nor "Ver factura →" is ever shown here, even
      // though both documents were created. Worth reporting separately; from a
      // test's point of view the document number is the reliable handle.
      const shipmentPill = page.getByRole('button', { name: /env[íi]o\s*#|albar[áa]n\s*#/i }).first();
      await expect(shipmentPill, 'The success modal should list the created shipment')
        .toBeVisible({ timeout: 30_000 });
      shipmentDocNo = ((await shipmentPill.textContent()) || '').match(/#?\s*(\d{4,})/)?.[1] || '';
      expect(shipmentDocNo, 'Should have read the shipment document number').toBeTruthy();

      const closeBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      await expect(closeBtn).toBeVisible({ timeout: 15_000 });
      await closeBtn.click();
      await slow(page);
    });

    await test.step('Download the sales order printable', async () => {
      await page.goto(orderUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitUntilCompleted(page, 'sales order');
      await downloadAndAssertPdf(page, 'sales order');
    });

    await test.step('Download the goods shipment printable (movement template)', async () => {
      await navigateTo(page, 'goods-shipment');
      await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 20_000 });

      const shipmentRow = page.locator('tbody tr').filter({ hasText: shipmentDocNo }).first();
      await expect(shipmentRow, `Shipment ${shipmentDocNo} should be listed`)
        .toBeVisible({ timeout: 15_000 });
      await shipmentRow.hover();
      const editBtn = shipmentRow.getByTestId('row-quick-action-edit');
      await expect(editBtn).toBeVisible({ timeout: 5_000 });
      await editBtn.click();

      await waitForDetailReady(page);
      await expect(page).toHaveURL(/\/goods-shipment\/[a-zA-Z0-9]+/, { timeout: 15_000 });

      // The order confirm creates the shipment as a draft, so it needs its own
      // confirmation — and unlike the order, the shipment goes through
      // `confirm-inout-modal` (GoodsShipmentConfirmModal), not a plain click.
      const statusPill = page.getByTestId('document-status-pill').first();
      await expect(statusPill).toBeVisible({ timeout: 15_000 });
      if (/borrador|draft/i.test((await statusPill.textContent()) || '')) {
        await page.getByTestId('action-save').click();

        const shipmentModal = page.getByTestId('confirm-inout-modal');
        await expect(shipmentModal).toBeVisible({ timeout: 10_000 });

        // Leave the invoice toggle OFF: the order confirm already produced an
        // invoice, and a second one would only add noise to the tenant.
        const invoiceToggle = shipmentModal.getByTestId('confirm-modal-invoice-toggle');
        if (await invoiceToggle.isVisible({ timeout: 5_000 }).catch(() => false)
          && (await invoiceToggle.getAttribute('aria-checked')) === 'true') {
          await invoiceToggle.click();
        }

        await shipmentModal.getByTestId('confirm-modal-confirm-btn').click();
        await waitForConfirmResponse(page);

        const closeBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
        if (await closeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await closeBtn.click();
        }
        await waitUntilCompleted(page, 'goods shipment');
      }

      await downloadAndAssertPdf(page, 'goods shipment');
    });

    await test.step('Open the invoice the confirm generated', async () => {
      await navigateTo(page, 'sales-invoice');
      await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 20_000 });

      const draftInvoiceRow = page.locator('tbody tr').filter({ hasText: /borrador|draft/i }).first();
      await expect(draftInvoiceRow, 'Confirming the order should have created a draft invoice')
        .toBeVisible({ timeout: 15_000 });
      await draftInvoiceRow.hover();
      const editBtn = draftInvoiceRow.getByTestId('row-quick-action-edit');
      await expect(editBtn).toBeVisible({ timeout: 5_000 });
      await editBtn.click();

      await waitForDetailReady(page);
      await expect(page).toHaveURL(/\/sales-invoice\/[a-zA-Z0-9]+/, { timeout: 15_000 });
      await expect(page.getByText(PRODUCT).first()).toBeVisible({ timeout: 10_000 });
      await slow(page);
    });

    await test.step('Confirm the invoice (DR → CO)', async () => {
      const invoiceConfirmBtn = page.getByTestId('action-save');
      await expect(invoiceConfirmBtn).toBeVisible({ timeout: 10_000 });
      await expect(invoiceConfirmBtn).toContainText(/confirmar|confirm/i);

      const confirmResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') && r.request().method() === 'POST' && r.status() < 400,
        { timeout: 30_000 },
      );
      await invoiceConfirmBtn.click();
      await confirmResponse;

      const closeBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
      if (await closeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await closeBtn.click();
      }

      await waitUntilCompleted(page, 'sales invoice');
      await slow(page);
    });

    await test.step('Download the sales invoice printable', async () => {
      await downloadAndAssertPdf(page, 'sales invoice');
    });
  });

  test('a quotation under evaluation downloads a real PDF', async ({ page }) => {
    await loginAndAssertJsreport(page);
    await ensureProductSetup(page, PRODUCT_FIXTURE_ALPHA);
    await createDraftWithLine(page, 'sales-quotation');

    await test.step('Send the quotation to evaluation (DR → UE)', async () => {
      await page.getByTestId('action-save').click();
      const confirmModalBtn = page.getByTestId('action-confirm-modal');
      await expect(confirmModalBtn).toBeVisible({ timeout: 10_000 });
      await confirmModalBtn.click();

      // A quotation prints from UE onward — `hidePrintWhen` excludes only
      // [UE, CA, ETGO_CI, CJ] — so unlike the other documents it never needs to
      // reach CO. Reaching this status IS the precondition for the download.
      await expect(async () => {
        await page.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await waitForDetailReady(page);
        await expect(page.getByTestId('document-status-pill').first())
          .toContainText(/bajo evaluaci|under eval|en espera/i, { timeout: 5_000 });
      }, 'quotation should reach "under evaluation" after confirming').toPass({ timeout: 90_000 });
      await slow(page);
    });

    await test.step('Download the sales quotation printable', async () => {
      await downloadAndAssertPdf(page, 'sales quotation');
    });
  });
});
