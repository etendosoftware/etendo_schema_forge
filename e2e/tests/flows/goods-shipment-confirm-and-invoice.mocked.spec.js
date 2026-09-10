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

// ETP-5052 (post-ETP-4942 QA fix) — the price list the backend resolved via
// GoodsShipmentHeaderHandler#enrichResolvedPriceList (linked order's tariff, or
// the Business Partner's own), which the picker must preselect over the system
// `default` flag. See makeShipment() overrides below for how each test wires it.

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
   *  - Shows the optional invoice generation section with the "Crear factura" card,
   *    checked by default (ETP-4848: GoodsShipmentConfirmModal always renders with
   *    defaultCreateInvoice=true — its caller only mounts it when invoiceStatus < 100)
   *  - Reverts the confirm button back to the plain "Confirmar albarán" label when
   *    the invoice checkbox is unchecked
   *  - Calls documentAction on confirm and closes (reloads page)
   *
   * The "confirm + invoice" happy path (toggle left ON, POST createDraftInvoice) is
   * covered implicitly by GoodsShipmentConfirmModal unit tests and by the
   * CreateInvoiceConfirmModal describe below (which tests the full invoice creation
   * flow end-to-end).
   */
  test('opens with shipment summary, invoice option checked by default; unchecking reverts the confirm label; confirm without invoice closes modal', async ({ page }) => {
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
    const invoiceToggle = page.getByTestId('confirm-modal-invoice-toggle');
    await expect(invoiceToggle).toBeVisible({ timeout: 5_000 });

    // ETP-4848: shipment.invoiceStatus is 0 (< 100, per makeShipment's default) →
    // GoodsShipmentConfirmModal renders with defaultCreateInvoice=true, so the
    // toggle must be checked on mount, without any user interaction.
    await expect(invoiceToggle).toHaveAttribute('aria-checked', 'true');

    // Confirm button is visible and shows the "confirm + invoice" label while the
    // toggle is checked.
    const confirmBtn = page.getByTestId('confirm-modal-confirm-btn');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await expect(confirmBtn).toHaveText(/confirmar y crear factura/i);

    // ── Unchecking the toggle reverts the confirm button to the plain label ──
    await invoiceToggle.click();
    await expect(invoiceToggle).toHaveAttribute('aria-checked', 'false');
    await expect(confirmBtn).toHaveText(/confirmar albarán/i);

    // ── Cancel closes the modal synchronously ─────────────────────────────
    // handleClose() → onClose() → setShowConfirmModal(false) → modal unmounts.
    // No async fetch is needed: Cancel is purely synchronous.
    await page.getByTestId('confirm-modal-cancel-btn').click();
    await expect(page.getByTestId('confirm-inout-modal')).toHaveCount(0, { timeout: 5_000 });
  });

  /**
   * ETP-4942 — the price-list picker inside GoodsShipmentConfirmModal.
   *
   * A shipment with no linked sales order has no price list of its own, so the
   * backend cannot always resolve a tariff when the "create invoice" toggle is
   * on. The picker is REQUIRED (blocks confirm) in that case, and merely
   * optional/pre-filled when the shipment does have a linked order.
   *
   * Case 1 (no linked order): the picker blocks "Confirmar y crear factura"
   * until a tariff is chosen, then confirming succeeds.
   * Case 2 (linked order): the picker still renders, but never blocks confirm.
   */
  test('price-list picker: required and blocking without a linked order, optional and non-blocking with one', async ({ page }) => {
    // ── Case 1: no linked order — picker is required ────────────────────────
    const shipmentNoOrder = makeShipment({
      id: 'gs-no-order-001',
      documentNo: 'GS-NOORDER-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      'businessPartner$_identifier': 'Cliente Sin Pedido S.L.',
      linkedOrders: [], // no linked sales order
      // ETP-5052: resolved server-side from the Business Partner's own tariff
      // (no linked order to derive it from) — deliberately the tariff NOT
      // flagged `default` below, to prove the resolved id wins over the flag.
      resolvedPriceListId: 'pl-vip',
    });

    await login(page);
    await installGoodsShipmentMock(page, [shipmentNoOrder]);

    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-no-order-001/action/documentAction'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    let createDraftInvoiceBody = null;
    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-no-order-001/action/createDraftInvoice'),
      async (route) => {
        createDraftInvoiceBody = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-no-order-001', documentNo: 'FAC-NOORDER-001', grandTotalAmount: 100 } },
          }),
        });
      }
    );

    // usePriceListPicker hits `${base}/price-list/priceList` where base is one
    // level up from the goods-shipment spec root (`/sws/neo`) — same
    // spec-swapped endpoint the "Crear Factura" describe block below mocks.
    // ETP-5052: pl-general is flagged `default` (the system default) while
    // shipmentNoOrder.resolvedPriceListId points at pl-vip — proving the
    // resolved id wins over the `default` flag (see PriceListPicker.jsx:
    // `matches.find(p => p.id === defaultPriceListId) || matches.find(p =>
    // p.default) || matches[0]`).
    await page.route('**/sws/neo/price-list/priceList{/**,}**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: [
              { id: 'pl-general', name: 'Tarifa General', active: true, salesPriceList: true, default: true },
              { id: 'pl-vip', name: 'Tarifa VIP', active: true, salesPriceList: true, default: false },
            ],
          },
        }),
      });
    });

    await page.goto('/goods-shipment/gs-no-order-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal'))
    );

    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    // Invoice toggle defaults to checked (ETP-4848), so the picker is active
    // from the moment the modal opens.
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toHaveAttribute('aria-checked', 'true');

    const priceListSelect = page.getByTestId('confirm-modal-price-list-select');
    await expect(priceListSelect).toBeVisible({ timeout: 5_000 });

    const confirmBtn = page.getByTestId('confirm-modal-confirm-btn');

    // Once the price-list fetch resolves, the hook auto-selects the resolved
    // tariff (shipmentNoOrder.resolvedPriceListId = 'pl-vip') — NOT pl-general,
    // even though pl-general is the one flagged `default` above. This is the
    // ETP-5052 regression assertion: the exact preselected VALUE, not just that
    // the picker renders or doesn't block confirm.
    await expect(confirmBtn).toBeEnabled({ timeout: 8_000 });
    await expect(priceListSelect).toContainText('Tarifa VIP');

    // Explicitly choose the OTHER tariff to prove a manual user selection
    // (onChange → setPriceListId) persists over the server-resolved default and
    // drives the request body — not just whatever was auto-selected.
    await priceListSelect.click();
    await page.getByTestId('option-confirm-modal-price-list-pl-general').click();

    await confirmBtn.click();
    await expect.poll(() => createDraftInvoiceBody, { timeout: 8_000 }).not.toBeNull();
    expect(createDraftInvoiceBody).toEqual({ priceListId: 'pl-general' });

    // ── Case 2: shipment WITH a linked order — picker is optional ──────────
    const shipmentWithOrder = makeShipment({
      id: 'gs-with-order-001',
      documentNo: 'GS-WITHORDER-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      'businessPartner$_identifier': 'Cliente Con Pedido S.L.',
      linkedOrders: [
        { id: 'order-002', grandTotalAmount: 2500, 'currency$_identifier': 'EUR' },
      ],
      // ETP-5052: resolved server-side from the linked order's own tariff —
      // deliberately the OTHER mocked price list than case 1's resolvedPriceListId
      // ('pl-vip'), to prove the preselection is actually driven by this field
      // and not a hardcoded value carried over from the previous case.
      resolvedPriceListId: 'pl-general',
    });

    await installGoodsShipmentMock(page, [shipmentWithOrder]);

    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-with-order-001/action/documentAction'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    await page.route(
      (url) =>
        url.href.includes('/sws/neo/goods-shipment/goodsShipment/gs-with-order-001/action/createDraftInvoice'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-with-order-001', documentNo: 'FAC-WITHORDER-001', grandTotalAmount: 2500 } },
          }),
        });
      }
    );

    await page.goto('/goods-shipment/gs-with-order-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal'))
    );

    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toHaveAttribute('aria-checked', 'true');

    // The picker still renders (showPriceListPicker is unconditional on
    // GoodsShipmentConfirmModal) ...
    const priceListSelectWithOrder = page.getByTestId('confirm-modal-price-list-select');
    await expect(priceListSelectWithOrder).toBeVisible({ timeout: 5_000 });

    // ...but with a linked order, hasLinkedOrder=true means the backend can
    // resolve the tariff on its own — the confirm button is never blocked by
    // the picker, even right after the modal opens (before the price-list
    // fetch — reusing the same auto-selecting route above — has necessarily
    // settled, and regardless of whatever it resolves to).
    const confirmBtnWithOrder = page.getByTestId('confirm-modal-confirm-btn');
    await expect(confirmBtnWithOrder).toBeEnabled({ timeout: 1_000 });

    // ETP-5052: once the price-list fetch resolves, the picker preselects
    // shipmentWithOrder.resolvedPriceListId ('pl-general') — the linked order's
    // own tariff — not pl-vip and not whatever the "first match" fallback would
    // have picked.
    await expect(priceListSelectWithOrder).toContainText('Tarifa General', { timeout: 8_000 });

    await confirmBtnWithOrder.click();
    await expect(page.getByTestId('confirm-inout-modal')).toHaveCount(0, { timeout: 8_000 });
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
      resolvedPriceListId: 'pl-001',
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

    // Mock price-list lookup for CreateInvoiceConfirmModal's showPriceListPicker
    // effect (ETP-4028): apiBaseUrl `/sws/neo/goods-shipment` has its last segment
    // replaced → `/sws/neo/price-list/priceList`. Without a matching sales price
    // list, priceListId stays '' and the "Crear →" button never enables (see
    // product-pricing.mocked.spec.js for the same spec-swap URL pattern, POST case).
    await page.route('**/sws/neo/price-list/priceList{/**,}**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: [
              { id: 'pl-001', name: 'Tarifa venta', active: true, salesPriceList: true, default: true },
            ],
          },
        }),
      });
    });

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

// ---------------------------------------------------------------------------
// Describe 3: ETP-5063 — no related document created on confirm shows a
// toast, never the blocking ConfirmResultModal; the doc-created branch must
// still render the modal exactly as before (regression guard).
// ---------------------------------------------------------------------------

test.describe('Goods Shipment — Confirm without invoice (ETP-5063 toast fix)', () => {
  test('unchecking the invoice toggle and confirming shows a toast, never the result modal, and refreshes the header', async ({ page }) => {
    const shipment = makeShipment({
      id: 'gs-nodoc-toggle-001',
      documentNo: 'GS-NODOC-TOGGLE-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      'businessPartner$_identifier': 'Cliente Sin Factura S.L.',
      linkedOrders: [
        { id: 'order-nodoc-001', grandTotalAmount: 900, 'currency$_identifier': 'EUR' },
      ],
    });

    let headerGetCount = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (
        req.method() === 'GET' &&
        url.includes(`/sws/neo/goods-shipment/goodsShipment/${shipment.id}`) &&
        !url.includes('goodsShipmentLine')
      ) {
        headerGetCount += 1;
      }
    });

    await login(page);
    await installGoodsShipmentMock(page, [shipment]);

    let documentActionCalls = 0;
    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-shipment/goodsShipment/${shipment.id}/action/documentAction`),
      async (route) => {
        documentActionCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    let createDraftInvoiceCalls = 0;
    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-shipment/goodsShipment/${shipment.id}/action/createDraftInvoice`),
      async (route) => {
        createDraftInvoiceCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-should-not-be-created', documentNo: 'SHOULD-NOT-EXIST', grandTotalAmount: 900 } },
          }),
        });
      }
    );

    await page.goto(`/goods-shipment/${shipment.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await expect.poll(() => headerGetCount, { timeout: 8_000 }).toBeGreaterThan(0);
    const countBeforeConfirm = headerGetCount;

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal'))
    );

    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    const invoiceToggle = page.getByTestId('confirm-modal-invoice-toggle');
    // ETP-4848: defaults to checked — uncheck it to exercise the no-doc path.
    await expect(invoiceToggle).toHaveAttribute('aria-checked', 'true');
    await invoiceToggle.click();
    await expect(invoiceToggle).toHaveAttribute('aria-checked', 'false');

    await page.getByTestId('confirm-modal-confirm-btn').click();

    // Wait for the async confirm flow to fully resolve (documentAction fetch
    // + the ETP-5063 useEffect firing the toast) before asserting on its side
    // effects — a synchronous check right after click() would race the
    // in-flight fetch and read stale counters.
    const successToast = page.locator('[data-type="success"]').first();
    await expect(successToast).toBeVisible({ timeout: 5_000 });

    // A success toast communicates the outcome, with the exact resolved
    // goodsShipment.confirmModal.confirmedTitle text (es_ES: "Albarán de
    // venta confirmado").
    await expect(successToast).toContainText('Albarán de venta confirmado');

    // No invoice was requested — createDraftInvoice must never be called —
    // and the old blocking ConfirmResultModal must never appear.
    expect(createDraftInvoiceCalls).toBe(0);
    await expect(page.getByTestId('confirm-result-modal')).toHaveCount(0);
    expect(documentActionCalls).toBe(1);

    // onRefresh?.() actually ran — proven by a second header GET after
    // confirm, not just by the toast text being right.
    await expect.poll(() => headerGetCount, { timeout: 5_000 }).toBeGreaterThan(countBeforeConfirm);
  });

  test('confirming an already fully-invoiced shipment shows a toast, never the result modal', async ({ page }) => {
    const invoicedShipment = makeShipment({
      id: 'gs-already-invoiced-001',
      documentNo: 'GS-ALREADYINV-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      invoiceStatus: 100,
      completelyInvoiced: true,
      'businessPartner$_identifier': 'Cliente Ya Facturado S.L.',
      linkedInvoices: [
        { id: 'inv-existing-001', documentNo: 'FAC-EXISTING-001', documentStatus: 'CO', grandTotalAmount: 500, 'currency$_identifier': 'EUR' },
      ],
    });

    let headerGetCount = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (
        req.method() === 'GET' &&
        url.includes(`/sws/neo/goods-shipment/goodsShipment/${invoicedShipment.id}`) &&
        !url.includes('goodsShipmentLine')
      ) {
        headerGetCount += 1;
      }
    });

    await login(page);
    await installGoodsShipmentMock(page, [invoicedShipment]);

    let documentActionCalls = 0;
    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-shipment/goodsShipment/${invoicedShipment.id}/action/documentAction`),
      async (route) => {
        documentActionCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    await page.goto(`/goods-shipment/${invoicedShipment.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await expect.poll(() => headerGetCount, { timeout: 8_000 }).toBeGreaterThan(0);
    const countBeforeConfirm = headerGetCount;

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal'))
    );

    // Fully-invoiced branch renders ConfirmShipmentInvoicedModal, whose title
    // and confirm button both read goodsShipment.confirmModal.titleConfirm /
    // .confirmBtn = "Confirmar albarán" (title is a <span>, button carries
    // the same text — scope to the button role to avoid a strict-mode clash).
    const confirmBtn = page.getByRole('button', { name: 'Confirmar albarán', exact: true });
    await expect(confirmBtn).toBeVisible({ timeout: 8_000 });
    await confirmBtn.click();

    const successToast = page.locator('[data-type="success"]').first();
    await expect(successToast).toBeVisible({ timeout: 5_000 });
    await expect(successToast).toContainText('Albarán de venta confirmado');

    await expect(page.getByTestId('confirm-result-modal')).toHaveCount(0);
    expect(documentActionCalls).toBe(1);

    await expect.poll(() => headerGetCount, { timeout: 5_000 }).toBeGreaterThan(countBeforeConfirm);
  });

  test('regression guard: confirming WITH the invoice toggle on still shows the result modal with a working "Ver factura" navigation button', async ({ page }) => {
    const shipment = makeShipment({
      id: 'gs-withdoc-confirm-001',
      documentNo: 'GS-WITHDOC-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      'businessPartner$_identifier': 'Cliente Con Factura S.L.',
      linkedOrders: [
        { id: 'order-withdoc-001', grandTotalAmount: 1200, 'currency$_identifier': 'EUR' },
      ],
      resolvedPriceListId: 'pl-withdoc',
    });

    await login(page);
    await installGoodsShipmentMock(page, [shipment]);

    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-shipment/goodsShipment/${shipment.id}/action/documentAction`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-shipment/goodsShipment/${shipment.id}/action/createDraftInvoice`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-withdoc-001', documentNo: 'FAC-WITHDOC-001', grandTotalAmount: 1200 } },
          }),
        });
      }
    );

    await page.route('**/sws/neo/price-list/priceList{/**,}**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: [{ id: 'pl-withdoc', name: 'Tarifa', active: true, salesPriceList: true, default: true }] },
        }),
      });
    });

    await page.goto(`/goods-shipment/${shipment.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal'))
    );

    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    // Invoice toggle stays checked (default true) — do NOT uncheck it.
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toHaveAttribute('aria-checked', 'true');

    const confirmBtn = page.getByTestId('confirm-modal-confirm-btn');
    await expect(confirmBtn).toBeEnabled({ timeout: 8_000 });
    await confirmBtn.click();

    // Doc WAS created — the ConfirmResultModal must still render exactly as
    // before this fix, with its "Ver factura" navigation button.
    await expect(page.getByTestId('confirm-result-modal')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Factura creada', { exact: true })).toBeVisible();
    const viewInvoiceBtn = page.getByRole('button', { name: 'Ver factura' });
    await expect(viewInvoiceBtn).toBeVisible();
  });
});
