// @covers artifacts/sales-invoice/custom/ImportFromOrderModal.jsx
// @covers artifacts/purchase-invoice/custom/ImportFromPurchaseOrderModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/InvoiceOrderImportModal.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Invoice import — the order-line FK must reach the server (ETP-5381, mocked).
 *
 * The bug
 * -------
 * The sales-invoice import modals posted the invoice-line → order-line FK under the key
 * `cOrderlineId`, which exists in NO NEO spec. `NeoFieldFilter.filterRecord` drops any body
 * key absent from the spec **silently** — HTTP 200, line created, FK NULL. With
 * `C_OrderLine_ID` NULL, `C_INVOICE_POST` never wrote `M_MATCHSO` nor `QtyInvoiced`, so the
 * order stayed invoiceable forever (double invoicing).
 *
 * The write path differs per window, so each one declares how it imports (`importVia`):
 *   - sales-invoice (`ImportFromOrderModal`) — since ETP-6002 the modal sends ONE request,
 *     `POST /sales-invoice/header/{id}/action/importOrderLines`, with
 *     `{ orders: [{ orderId, lines: [{ sourceLineId, quantity }] }], carryGlobalDiscount }`.
 *     The FK travels as `sourceLineId` and the server builds the line; pending quantities are
 *     read through `.../action/availableOrderLines`, never computed in the browser. Since
 *     ETP-5828 the popup also LISTS through the invoice's actions: `availableOrders` for the
 *     orders and one `availableOrderLines` (`includeCovered: true`) per order for the lines, their
 *     price and pending — the order GETs are not read on this path.
 *   - purchase-invoice (`ImportFromPurchaseOrderModal`) — the same unified popup (ETP-5828) on its
 *     client path (`importVia: 'client'`, until QA decides MCP-2): still one
 *     `POST /purchase-invoice/lines` per line, carrying the FK as `salesOrderLine` (the spec's
 *     java_qualifier). Since ETP-6099 it LISTS like sales (availableOrders + one
 *     availableOrderLines with `detail: true` per order, whose row carries the order-line columns
 *     the line body copies), asking `pendingBasis: 'classic'` — the pre-ETP-6099 pending rule,
 *     ordered − invoiced with no draft deduction (product decision).
 *
 * What this spec locks, per window:
 *   1. The FK of the selected order line reaches the server under the key that window's
 *      contract reads, and the dead `cOrderlineId` key is sent nowhere.
 *   2. sales-invoice: no per-line `POST /lines` is sent, and the quantity sent is the server's
 *      `pendingQuantity` (2, drafts counted), not ordered − invoiced (3). purchase-invoice: the
 *      quantity sent is the server's CLASSIC pending, ordered − invoiced (3), as before ETP-6099.
 *
 * Routing notes
 * -------------
 * - `login()` installs a catch-all for `/sws/**`; install specific routes AFTER it so they
 *   win (Playwright matches routes in reverse registration order).
 * - Every endpoint that can receive a sub-path is registered TWICE (`word/**` and `word**`).
 *   A bare `word**` does not cross a `/`, so `/lines/callout` or `/header/{id}` would fall
 *   through to the catch-all and silently answer with the wrong shape. See
 *   docs/e2e-testing-guide.md § "a route pattern ending in a bare `word**`".
 */

const BP_ID = 'bp-import-fk-001';

// Classifies a `.../{entity}/header...` URL as the plain detail GET/PATCH (`/header/{id}`),
// the plain list query (`/header?...`), or null for anything else (selectors, `/action/...`,
// evaluate-display). Anything else MUST fall through to the catch-all: answering a selector
// call with a header-shaped body silently breaks unrelated parts of the detail view.
function classifyHeaderRequest(url, id) {
  const { pathname } = new URL(url);
  const idx = pathname.indexOf('/header');
  if (idx === -1) return null;
  const remainder = pathname.slice(idx + '/header'.length);
  if (remainder === '') return 'list';
  const segs = remainder.split('/').filter(Boolean);
  return (segs.length === 1 && segs[0] === id) ? 'detail' : null;
}

// Same idea for `.../{entity}/lines...` — isolates the plain create (POST `/lines`) and the
// plain list (GET `/lines?parentId=...`) from `/lines/callout`, `/lines/defaults`, etc.
function isPlainLinesPath(url) {
  const { pathname } = new URL(url);
  const idx = pathname.indexOf('/lines');
  if (idx === -1) return false;
  return pathname.slice(idx + '/lines'.length) === '';
}

// ---------------------------------------------------------------------------
// Per-window matrix
// ---------------------------------------------------------------------------

const WINDOWS = [
  {
    label: 'sales-invoice ← sales-order',
    invoiceSpec: 'sales-invoice',
    orderSpec: 'sales-order',
    // ui('importFromSalesOrder') — "Import from order" / "Importar desde pedido"
    importButton: /Import from order|Importar desde pedido/i,
    documentType: { transactionDocument: 'doctype-ar-001', 'transactionDocument$_identifier': 'AR Invoice' },
    importVia: 'action',
  },
  {
    label: 'purchase-invoice ← purchase-order',
    invoiceSpec: 'purchase-invoice',
    orderSpec: 'purchase-order',
    // ui('importFromPurchaseOrder') — "Import from PO" / "Importar desde pedido"
    importButton: /Import from PO|Importar desde pedido/i,
    documentType: { transactionDocument: 'doctype-ap-001', 'transactionDocument$_identifier': 'AP Invoice' },
    importVia: 'linePost',
  },
];

function buildFixtures({ invoiceSpec, orderSpec, documentType }) {
  const invoiceId = `mock-${invoiceSpec}-fk-001`;
  const orderId = `mock-${orderSpec}-fk-001`;
  const orderLine1Id = `${orderSpec}-line-fk-1`;
  const orderLine2Id = `${orderSpec}-line-fk-2`;

  return {
    invoiceId,
    orderId,
    orderLine1Id,
    orderLine2Id,
    // A draft invoice with every field resolveCanAddLines requires — without them
    // canAddLine stays false and the empty-state import buttons never render.
    invoiceHeader: {
      id: invoiceId,
      documentNo: `INV-FK-001`,
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      ...documentType,
      businessPartner: BP_ID,
      'businessPartner$_identifier': 'Cliente Test',
      partnerAddress: 'addr-fk-001',
      invoiceDate: '2026-05-01',
      accountingDate: '2026-05-01',
      paymentTerms: 'pt-fk-001',
      paymentMethod: 'pm-fk-001',
      priceList: 'pl-fk-001',
      grandTotalAmount: 0,
      summedLineAmount: 0,
      currency: 'eur-1',
      'currency$_identifier': 'EUR',
    },
    // Completed, same partner, same currency, invoiceStatus < 100 — the three conditions
    // ImportFrom{Sales,Purchase}OrderModal.fetchDocuments filters candidates on.
    order: {
      id: orderId,
      documentNo: 'ORD-FK-001',
      documentStatus: 'CO',
      businessPartner: BP_ID,
      'businessPartner$_identifier': 'Cliente Test',
      orderDate: '2026-04-01',
      currency: 'eur-1',
      invoiceStatus: 0,
    },
    // Two lines: the dedup tests mark line 1 as already invoiced, and line 2 keeps the
    // order visible in the picker (a document whose lines are ALL already imported is
    // filtered out of the list entirely by ImportLinesModal).
    orderLines: [
      {
        id: orderLine1Id,
        product: 'prod-fk-a',
        'product$_identifier': 'Producto Pedido A',
        orderedQuantity: 4,
        invoicedQuantity: 0,
        unitPrice: 10,
        listPrice: 10,
        uOM: 'uom-1',
        tax: 'tax-1',
      },
      {
        id: orderLine2Id,
        product: 'prod-fk-b',
        'product$_identifier': 'Producto Pedido B',
        orderedQuantity: 3,
        invoicedQuantity: 0,
        unitPrice: 20,
        listPrice: 20,
        uOM: 'uom-1',
        tax: 'tax-1',
      },
    ],
    // What `.../action/availableOrderLines` answers (both windows since ETP-6099) under the
    // default rule. Line 2 has pendingQuantity 2 (drafts counted) while ordered − invoiced is 3,
    // which is what the mock answers to `pendingBasis: 'classic'`: the posted quantity tells which
    // rule the modal asked for.
    pendingByLine: [
      { id: orderLine1Id, pendingQuantity: 4 },
      { id: orderLine2Id, pendingQuantity: 2 },
    ],
  };
}

// Classifies `.../header/{id}/action/{name}` and returns `name`, or null for anything else.
function headerActionName(url, id) {
  const { pathname } = new URL(url);
  const m = pathname.match(/\/header\/([^/]+)\/action\/([^/]+)$/);
  return m && m[1] === id ? m[2] : null;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {Array}  opts.existingInvoiceLines invoice lines the modal's fetchDocuments sees
 *                                           (`_endRow=200`); the detail view always gets an
 *                                           empty list so the empty state renders.
 * @param {object} opts.state                mutable capture bag — `state.postBodies` (plain
 *                                           `POST /lines`) and `state.actionCalls`
 *                                           (`{ name, body }` per `/header/{id}/action/*`).
 */
async function installMocks(page, cfg, { existingInvoiceLines = [], state }) {
  const { invoiceSpec, orderSpec } = cfg;
  const { invoiceId, orderId, invoiceHeader, order, orderLines, pendingByLine } = cfg.fixtures;

  // Invoice header — detail GET, plus the PATCH handleImportOrderClick fires before opening
  // the modal (onSave). The PATCH must echo the full header: answering it from the /sws/**
  // catch-all returns a body with no businessPartner, and the modal then filters every
  // candidate order out because bpId is undefined.
  const invoiceHeaderHandler = async (route) => {
    const req = route.request();
    const kind = classifyHeaderRequest(req.url(), invoiceId);
    if (kind !== 'detail') return route.fallback();
    if (req.method() === 'PATCH' || req.method() === 'PUT') {
      const patch = req.postData() ? JSON.parse(req.postData()) : {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...invoiceHeader, ...patch }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [invoiceHeader] } }),
    });
  };
  await page.route(`**/sws/neo/${invoiceSpec}/header/**`, invoiceHeaderHandler);
  await page.route(`**/sws/neo/${invoiceSpec}/header**`, invoiceHeaderHandler);

  // Header actions — the sales-invoice import reads pending quantities and imports through
  // `/header/{id}/action/*` (two segments deep, so only the `header/**` pattern reaches it).
  // Registered after the header handler, so it is tried first; anything that is not one of
  // the two import actions falls back to it and then to the catch-all.
  const invoiceActionHandler = async (route) => {
    const req = route.request();
    const name = headerActionName(req.url(), invoiceId);
    if (req.method() !== 'POST'
      || !['availableOrders', 'availableOrderLines', 'importOrderLines'].includes(name)) {
      return route.fallback();
    }
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    state.actionCalls.push({ name, body });
    let data;
    if (name === 'availableOrders') {
      // The order row as the action reports it (ETP-5828): `date`, `globalDiscount` as a %.
      data = [{
        id: orderId, documentNo: order.documentNo, date: order.orderDate,
        businessPartner: order.businessPartner, 'businessPartner$_identifier': order['businessPartner$_identifier'],
        currency: order.currency, globalDiscount: 0, pendingLines: pendingByLine.length,
      }];
    } else if (name === 'availableOrderLines') {
      // Each line with its product, price and the server's pending (ETP-5828: one call per order).
      data = body.orderId !== orderId ? [] : pendingByLine.map((p, i) => {
        const line = orderLines.find((l) => l.id === p.id);
        return {
          id: p.id, lineNo: (i + 1) * 10, product: line.product,
          'product$_identifier': line['product$_identifier'], uOM: line.uOM,
          // `pendingBasis: 'classic'` (purchases): ordered − invoiced, no draft deduction.
          pendingQuantity: body.pendingBasis === 'classic'
            ? Math.max(0, line.orderedQuantity - line.invoicedQuantity)
            : p.pendingQuantity,
          unitPrice: line.unitPrice, discount: 0,
          // `detail: true` (the purchase client import, ETP-6099): the order-line columns the line
          // body copies.
          ...(body.detail ? {
            listPrice: line.listPrice, grossUnitPrice: 0, tax: line.tax, description: null,
            orderedQuantity: line.orderedQuantity, invoicedQuantity: line.invoicedQuantity,
          } : {}),
        };
      });
    } else {
      data = { importedCount: body.orders?.flatMap(o => o.lines || []).length ?? 0 };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data } }),
    });
  };
  await page.route(`**/sws/neo/${invoiceSpec}/header/**`, invoiceActionHandler);

  // Invoice lines — POST capture, the modal's own-lines lookup (_endRow=200, feeds duplicate
  // detection) and the detail view's own fetch (empty, so the import buttons render).
  const invoiceLinesHandler = async (route) => {
    const req = route.request();
    const url = req.url();
    if (!isPlainLinesPath(url)) return route.fallback();
    if (req.method() === 'POST') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.postBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: `new-inv-line-${state.postBodies.length}`, ...body }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    const isModalFetch = url.includes('_endRow=200');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: isModalFetch ? existingInvoiceLines : [] } }),
    });
  };
  await page.route(`**/sws/neo/${invoiceSpec}/lines/**`, invoiceLinesHandler);
  await page.route(`**/sws/neo/${invoiceSpec}/lines**`, invoiceLinesHandler);

  // Order header list — only read when availableOrders lists nothing (the «none in this currency»
  // fallback); kept so an unexpected read still gets the right shape.
  const orderHeaderHandler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    if (classifyHeaderRequest(req.url(), orderId) !== 'list') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [order] } }),
    });
  };
  await page.route(`**/sws/neo/${orderSpec}/header/**`, orderHeaderHandler);
  await page.route(`**/sws/neo/${orderSpec}/header**`, orderHeaderHandler);
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

async function openImportFromOrderModal(page, cfg) {
  const btn = page.getByText(cfg.importButton).first();
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
  await expect(page.getByTestId('import-lines-search')).toBeVisible({ timeout: 10_000 });
}

async function expandOrder(page) {
  const docRow = page.getByText('ORD-FK-001').first();
  await expect(docRow).toBeVisible({ timeout: 10_000 });
  await docRow.click();
}

// The modal's Checkbox renders its native input sr-only inside a 1px clip-rect, which
// Playwright's mouse-based click cannot reliably hit (same reason the shared
// clickLastCheckbox() helper uses a DOM click). Index 0 is the document-level checkbox, 1 the
// master checkbox of the expanded order's lines table, 2..n the lines in render order.
function modalCheckboxes(page) {
  return page.locator('.fixed.inset-0.z-50').first().getByRole('checkbox');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const win of WINDOWS) {
  const cfg = { ...win, fixtures: buildFixtures(win) };
  const { invoiceId, orderId, orderLine2Id } = cfg.fixtures;

  test.describe(`Import from order — order-line FK (${cfg.label})`, () => {
    test(`the selected order line's FK reaches the server (${cfg.importVia}), and no cOrderlineId key at all`, async ({ page }) => {
      const state = { postBodies: [], actionCalls: [] };

      await login(page);
      await installMocks(page, cfg, { state });

      await page.goto(`/${cfg.invoiceSpec}/${invoiceId}`);
      await page.waitForLoadState('domcontentloaded');

      await openImportFromOrderModal(page, cfg);
      await expandOrder(page);

      await expect(page.getByText('Producto Pedido B').first()).toBeVisible({ timeout: 10_000 });

      // Select the second order line only, so the assertion pins a specific id.
      await modalCheckboxes(page).nth(3).evaluate((el) => el.click());

      // ui('importSelectedOrders') — "Import selected (1)" / "Importar seleccionados (1)"
      const importBtn = page.getByRole('button', { name: /Import selected|Importar seleccionados/i });
      await expect(importBtn).toBeEnabled({ timeout: 5_000 });
      await importBtn.click();

      if (cfg.importVia === 'action') {
        const imports = () => state.actionCalls.filter((c) => c.name === 'importOrderLines');
        await expect.poll(() => imports().length, { timeout: 10_000 }).toBe(1);

        // The orders and the pending quantities came from the server (ETP-5828: listed through
        // availableOrders, lines in ONE availableOrderLines per order, covered ones included).
        // `detail` (ETP-6099): pendingLines leaves out the lines already on this invoice, so an
        // order with nothing selectable is hidden at open; the lines body stays without it.
        expect(state.actionCalls.filter((c) => c.name === 'availableOrders').map((c) => c.body))
          .toContainEqual(expect.objectContaining({ includeCovered: true, detail: true }));
        expect(state.actionCalls.filter((c) => c.name === 'availableOrderLines').map((c) => c.body))
          .toContainEqual({ orderId, includeCovered: true });

        // ONE request: the order, its selected line by FK, the server's pending quantity (2,
        // not ordered − invoiced = 3), and no global discount to carry (the order has none).
        expect(imports()[0].body).toEqual({
          orders: [{ orderId, lines: [{ sourceLineId: orderLine2Id, quantity: 2 }] }],
          carryGlobalDiscount: false,
        });
        // The server builds the line: nothing is POSTed per line any more.
        expect(state.postBodies).toEqual([]);
        expect(JSON.stringify(state.actionCalls)).not.toContain('cOrderlineId');
      } else {
        await expect.poll(() => state.postBodies.length, { timeout: 10_000 }).toBe(1);

        const posted = state.postBodies[0];
        // The FK the backend actually persists (spec java_qualifier for C_OrderLine_ID).
        expect(posted.salesOrderLine).toBe(orderLine2Id);
        // ETP-6099: listed through the actions with the classic pending rule (product decision),
        // so the quantity is ordered − invoiced (3) as before, not the drafts-counted 2; the body
        // is built from the detailed availableOrderLines row (no order-lines GET).
        expect(state.actionCalls.filter((c) => c.name === 'availableOrders').map((c) => c.body))
          .toContainEqual(expect.objectContaining({ pendingBasis: 'classic' }));
        expect(state.actionCalls.filter((c) => c.name === 'availableOrderLines').map((c) => c.body))
          .toContainEqual({ orderId, includeCovered: true, detail: true, pendingBasis: 'classic' });
        expect(Number(posted.invoicedQuantity)).toBe(3);
        expect(posted.tax).toBe('tax-1');
        expect(Number(posted.listPrice)).toBe(20);
        // The dead key must not be present at all — NeoFieldFilter would drop it silently,
        // so sending it "just in case" is indistinguishable from not sending the FK.
        expect(Object.hasOwn(posted, 'cOrderlineId')).toBe(false);
      }
    });
  });
}
