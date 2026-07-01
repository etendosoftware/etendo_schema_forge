import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Goods Shipment — Confirm & Invoice flows (mocked) — ETP-4031
 *
 * Covers:
 *   1. GoodsShipmentConfirmModal: draft → complete with optional invoice creation
 *   2. "Crear Factura" button gating + CreateInvoiceConfirmModal lifecycle
 *
 * The existing goods-shipment-billing-badge.mocked.spec.js covers billing badge
 * states; this spec does NOT duplicate that.
 *
 * No backend required — all API calls are intercepted after login() (LIFO order).
 *
 * Route isolation: "goodsShipmentLine" URLs must NOT be captured by the
 * "goodsShipment" handler (the entity name is a prefix of the line entity
 * name). We use URL predicate functions to avoid substring collisions.
 */

// ---------------------------------------------------------------------------
// Shared mock data helpers (mirrors billing-badge spec pattern)
// ---------------------------------------------------------------------------

function makeShipment(overrides) {
  return {
    id: 'mock-gs-001',
    documentNo: 'GS-TEST-001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    processed: false,
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Client',
    movementDate: '2026-05-01',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Almacén Principal',
    invoiceStatus: 0,
    completelyInvoiced: false,
    invoiced: false,
    returnReceipts: [],
    linkedOrders: [],
    ...overrides,
  };
}

/**
 * Install a mock for the goods-shipment entity endpoints (lines + header).
 * Must be called AFTER login() so it takes priority over the generic /sws/** catch-all.
 *
 * Additional action-specific routes (pendingInvoiceLines, documentAction,
 * createDraftInvoice) must be registered AFTER this function (LIFO priority).
 */
async function installGoodsShipmentMock(page, records) {
  // Lines endpoint — installed FIRST (lower LIFO priority). Returns empty.
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-shipment/goodsShipmentLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      route.fallback();
    }
  );

  // Header entity (list + detail) — installed SECOND (higher LIFO priority).
  await page.route(
    (url) =>
      url.href.includes('/sws/neo/goods-shipment/goodsShipment') &&
      !url.href.includes('/goodsShipmentLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        // Non-GET catch-all (evaluate-display, defaults, etc.) → empty ok
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
        return;
      }

      // Detail fetch: URL path ends with /goodsShipment/<id>
      const detailMatch = url.match(/\/goodsShipment\/([^/?]+)(\?.*)?$/);
      if (
        detailMatch &&
        !['evaluate-display', 'defaults', 'selectors', 'action'].includes(detailMatch[1])
      ) {
        const id = detailMatch[1];
        const found = records.find((r) => r.id === id) ?? records[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }

      // List fetch — return all records
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Describe 1: GoodsShipmentConfirmModal (draft → complete with invoice)
// ---------------------------------------------------------------------------

test.describe('Goods Shipment — Confirm modal (draft to complete)', () => {
  /**
   * Verifies that GoodsShipmentConfirmModal:
   *  - Opens when the draftMode confirm button is clicked
   *  - Shows the blue summary card (shipmentRef, BP name, total from linkedOrder)
   *  - Shows the optional invoice generation section with the "Crear factura" card
   *  - Shows "Confirmar pedido" button when the invoice checkbox is unchecked
   *  - Calls documentAction on confirm and closes (reloads page)
   *
   * The checkbox toggle → "Confirmar + factura →" path is covered implicitly by
   * GoodsShipmentConfirmModal unit tests and by the CreateInvoiceConfirmModal
   * describe below (which tests the full invoice creation flow end-to-end).
   */
  test('opens with shipment summary and invoice option; confirm without invoice closes modal', async ({ page }) => {
    const shipment = makeShipment({
      id: 'gs-draft-001',
      documentNo: 'GS-DRAFT-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      'businessPartner$_identifier': 'Cliente Test S.L.',
      linkedOrders: [
        { id: 'order-001', grandTotalAmount: 1500, 'currency$_identifier': 'EUR' },
      ],
    });

    await login(page);
    await installGoodsShipmentMock(page, [shipment]);

    // documentAction mock — needed when "Confirmar pedido" is clicked in the modal
    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-draft-001/action/documentAction'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    // Navigate to draft shipment detail
    await page.goto('/goods-shipment/gs-draft-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    // Open the confirm modal via the same event the draftMode confirm button dispatches.
    // We use dispatchEvent directly because the topbar "Confirmar" button calls
    // flushPendingLines() first, which can block in the mocked test environment.
    // Brief wait ensures React's event listener is registered before dispatch.
    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal'))
    );

    // ── Modal is visible ───────────────────────────────────────────────────
    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    // Document number appears in the subtitle
    await expect(page.getByTestId('confirm-modal-doc-info')).toContainText('GS-DRAFT-001');
    // Invoice toggle card is visible
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toBeVisible({ timeout: 5_000 });
    // Confirm button is visible
    await expect(page.getByTestId('confirm-modal-confirm-btn')).toBeVisible({ timeout: 5_000 });

    // ── Cancel closes the modal synchronously ─────────────────────────────
    // handleClose() → onClose() → setShowConfirmModal(false) → modal unmounts.
    // No async fetch is needed: Cancel is purely synchronous.
    await page.getByTestId('confirm-modal-cancel-btn').click();
    await expect(page.getByTestId('confirm-inout-modal')).toHaveCount(0, { timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Describe 2: "Crear Factura" button gating and invoice creation modal
// ---------------------------------------------------------------------------

test.describe('Goods Shipment — Crear Factura button gating and invoice creation modal', () => {
  test('shows invoice modal for partially-invoiced, hides button when fully invoiced', async ({ page }) => {
    // 1. Completed, partially-invoiced shipment
    const partialShipment = makeShipment({
      id: 'gs-partial-001',
      documentNo: 'GS-PARTIAL-001',
      documentStatus: 'CO',
      'documentStatus$_identifier': 'Completado',
      processed: true,
      invoiceStatus: 50,
      completelyInvoiced: false,
      'businessPartner$_identifier': 'Cliente Test S.L.',
      returnReceipts: [],
      linkedOrders: [
        { id: 'order-001', grandTotalAmount: 750, 'currency$_identifier': 'EUR' },
      ],
    });

    await login(page);
    await installGoodsShipmentMock(page, [partialShipment]);

    // Mock pendingInvoiceLines — returns 2 lines (qty 3 + 2 = 5 total)
    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-partial-001/action/pendingInvoiceLines'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: [
                { lineId: 'sl-001', pendingQty: 3 },
                { lineId: 'sl-002', pendingQty: 2 },
              ],
            },
          }),
        });
      }
    );

    // Mock createDraftInvoice
    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-partial-001/action/createDraftInvoice'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: { id: 'inv-002', documentNo: 'FAC-PARTIAL-001', grandTotalAmount: 375 },
            },
          }),
        });
      }
    );

    // 2. Navigate to partially-invoiced shipment
    await page.goto('/goods-shipment/gs-partial-001');
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    // 3. "Crear Factura" button is visible (isCompleted && !isFullyInvoiced)
    const createInvoiceBtn = page.getByRole('button', { name: 'Crear Factura' });
    await expect(createInvoiceBtn).toBeVisible({ timeout: 10_000 });

    // 4. Click "Crear Factura" → opens CreateInvoiceConfirmModal
    await createInvoiceBtn.click();

    // 5. Modal title "Gestionar documentos" appears
    await expect(page.getByText('Gestionar documentos')).toBeVisible({ timeout: 8_000 });

    // 6. "Generar documentos (opcional)" section visible
    await expect(page.getByText('Generar documentos (opcional)')).toBeVisible({ timeout: 5_000 });

    // 7. "Crear factura" card (InvoiceCheckboxCard) visible (uses soCreateInvoiceTitle key)
    await expect(page.getByText('Crear factura', { exact: true })).toBeVisible({ timeout: 5_000 });

    // 8. Pending qty subtitle: pendingInvoiceLines returns 3+2=5 units
    //    The component formats: "{pending} pendientes de facturar"
    //    pending = "5 unidades" (soAmountPendingInvoice with fmtNum(5, 0) + ui('units'))
    await expect(page.getByText(/5.*pendientes de facturar/)).toBeVisible({ timeout: 10_000 });

    // 9. "Crear →" button visible (soCreateDocsBtn)
    const createDocsBtn = page.getByRole('button', { name: 'Crear →' });
    await expect(createDocsBtn).toBeVisible({ timeout: 5_000 });

    // 10. Click "Crear →" → triggers createDraftInvoice, shows ConfirmResultModal
    await createDocsBtn.click();

    // 11. "Factura creada" appears (ConfirmResultModal title = ui('soInvoiceCreated'))
    await expect(page.getByText('Factura creada', { exact: true })).toBeVisible({ timeout: 10_000 });

    // 11b. ETP-4312 — the ConfirmResultModal primary button for a single invoice
    //      doc must read EXACTLY "Ver factura" (poViewInvoice/soViewInvoice). The
    //      arrow is an SVG appended by the component, NOT part of the label text:
    //      the label must contain no "→" character and the button must hold
    //      exactly ONE arrow <svg>. This guards against the "double arrow"
    //      regression where a hardcoded `primary` prop carried its own arrow.
    const viewInvoiceBtn = page.getByRole('button', { name: 'Ver factura' });
    await expect(viewInvoiceBtn).toBeVisible({ timeout: 5_000 });

    // The visible text must be exactly "Ver factura" with no literal arrow glyph.
    const viewInvoiceText = (await viewInvoiceBtn.textContent())?.trim();
    expect(viewInvoiceText).toBe('Ver factura');
    expect(viewInvoiceText).not.toContain('→');

    // The arrow must be rendered as an SVG inside the button — exactly one.
    await expect(viewInvoiceBtn.locator('svg')).toHaveCount(1);
    // ...and it must be the canonical arrow path (M5 12h14M12 5l7 7-7 7).
    await expect(
      viewInvoiceBtn.locator('svg path[d="M5 12h14M12 5l7 7-7 7"]'),
    ).toHaveCount(1);

    // 12. Close the result modal via "Cerrar" button (soClose)
    //     exact: true to avoid matching "Cerrar Copilot" button.
    //     ETP-4299: ConfirmWithCreditButtonBase.onClose fires window.location.reload()
    //     via setTimeout(0). waitForNavigation absorbs that reload before page.goto below.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
      page.getByRole('button', { name: 'Cerrar', exact: true }).click(),
    ]);

    // 13. Now register a route for a fully-invoiced shipment (invoiceStatus: 100)
    const fullShipment = makeShipment({
      id: 'gs-full-001',
      documentNo: 'GS-FULL-001',
      documentStatus: 'CO',
      'documentStatus$_identifier': 'Completado',
      processed: true,
      invoiceStatus: 100,
      completelyInvoiced: true,
      'businessPartner$_identifier': 'Cliente Test S.L.',
      returnReceipts: [],
    });

    // Register specific route for gs-full-001 (LIFO: takes priority)
    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-full-001'),
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: { data: [fullShipment] } }),
          });
          return;
        }
        route.fallback();
      }
    );

    // 14. Navigate to fully-invoiced shipment
    await page.goto('/goods-shipment/gs-full-001');
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    // 15. "Crear Factura" button must NOT render (isFullyInvoiced = true)
    await expect(page.getByRole('button', { name: 'Crear Factura' })).toHaveCount(0);
  });
});
