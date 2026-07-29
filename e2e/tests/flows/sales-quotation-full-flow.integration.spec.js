import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Sales Quotation — Full flow: Presupuesto → Pedido de venta → Albarán →
 * Factura de venta, with a negative-quantity/positive-price line (integration,
 * live backend).
 *
 * Added per QA request (Jira comment 142326, ETP-4567) on top of the
 * developer's fix that removed `min: 0` from `orderedQuantity`/`listPrice`
 * and renamed the `PriceList` column label to "Precio" on the sales
 * quotation/order/invoice windows.
 *
 * Flow:
 *   1. Login, create a quotation, save as draft
 *   2. Add a baseline (positive) line, then a NEGATIVE-quantity line
 *      (positive price via the product callout) — models a return/credit
 *      adjustment on an otherwise regular quotation
 *   3. Confirm (DR → UE) via SendToEvaluationModal
 *   4. Confirm (UE → "Crear Pedido") via QuotationConfirmModal, "Ver pedido"
 *      into the newly-created Sales Order
 *   5. Confirm the order with "Crear albarán" (ship only, no direct invoice),
 *      "Ver albarán" into the newly-created Goods Shipment
 *   6. Confirm the shipment with "Crear factura" ON, "Ver factura" into the
 *      newly-created Sales Invoice
 *   7. Confirm the invoice → Completed
 *
 * At every stage that carries a monetary line (quotation, order, invoice —
 * goods shipments are movement-only and carry no price/amount fields)
 * verifies:
 *   1. The line quantity stays negative (not clamped/flipped to positive)
 *   2. The line gross amount stays negative
 *   3. The document totals reflect the negative line
 *   4. The price column header reads "Precio" (ETP-4567 label rename), never
 *      the old default AD label ("Precio tarifa" / "Net List Price")
 * The goods shipment stage only verifies quantity sign propagation (checks
 * #1/#3 do not apply — no price/amount fields on that document).
 *
 * Requires:
 *   - Etendo backend running
 *   - Dev server running at localhost:3100 (make dev)
 *   - E2E_SALES_INTEGRATION=1
 */

// ── Credentials ──────────────────────────────────────────────────────────────

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
      resp.status() < 500,
    { timeout: 20_000 },
  ).catch(() => {});
}

/**
 * Wait for a NEO API POST response to complete after a confirmation action,
 * mirroring purchase-helpers.js's waitForConfirmResponse.
 */
async function waitForConfirmResponse(page) {
  await page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.request().method() === 'POST' && resp.status() < 500,
    { timeout: 30_000 },
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
}

// ── Price / totals utilities (mirrors purchase-helpers.js) ────────────────────

/**
 * Parse a formatted amount string (e.g. "47,96 EUR", "-20.00 EUR") into a
 * numeric value. Handles Spanish locale (comma as decimal separator).
 */
function parseAmount(text) {
  if (!text) return 0;
  let cleaned = text.replace(/[^0-9.,-]/g, '');
  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.lastIndexOf('.')) {
    cleaned = cleaned.replaceAll('.', '').replace(',', '.');
  }
  return Number.parseFloat(cleaned) || 0;
}

/**
 * Read the document totals panel values (subtotal, tax, total) from the
 * detail view via DocumentTotalsPanel's data-testids (shared across every
 * document window: quotation, order, invoice).
 */
async function readDocumentTotals(page) {
  const totalRow = page.getByTestId('totals-row-total-value');
  await expect(totalRow, 'Total row should be visible in the totals panel').toBeVisible({ timeout: 10_000 });
  await totalRow.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1_000);

  const subtotalEl = page.getByTestId('totals-row-subtotal-value');
  const taxEl = page.getByTestId('totals-row-tax-value');

  const subtotalText = await subtotalEl.textContent({ timeout: 5_000 }).catch(() => '0');
  const taxText = await taxEl.textContent({ timeout: 5_000 }).catch(() => '0');
  const totalText = await totalRow.textContent({ timeout: 5_000 }).catch(() => '0');
  return {
    subtotal: parseAmount(subtotalText),
    tax: parseAmount(taxText),
    total: parseAmount(totalText),
    _raw: { subtotalText, taxText, totalText },
  };
}

/**
 * Locate the first line row (rendered by the shared InlineLinesPanel —
 * `data-testid="line-row-{id}"`, `data-cell-key="{fieldKey}"` per cell, see
 * tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx) whose
 * `qtyFieldKey` cell holds a negative value. Reading the actual cell value
 * (rather than pattern-matching the row's rendered text) avoids false
 * positives from unrelated hyphens in a product name/description.
 */
async function findNegativeLineRow(page, qtyFieldKey) {
  const rows = page.locator('[data-testid^="line-row-"]');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const qtyText = await row.locator(`[data-cell-key="${qtyFieldKey}"]`).textContent().catch(() => '');
    if (parseAmount(qtyText) < 0) return row;
  }
  throw new Error(`No line row with a negative "${qtyFieldKey}" was found`);
}

/**
 * Add a product line to the quotation's inline-add row (shared component
 * across every document window — mirrors purchase-helpers.js's
 * addProductLine, adapted to the quotation's "orderedQuantity" field key).
 */
async function addLine(page, { productIndex = 0, quantity, isFirst = false } = {}) {
  if (isFirst) {
    let emptyStateBtn = page.getByTestId('action-add-lines-empty-state');
    if (!await emptyStateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add lines/i }).first();
    }
    await expect(emptyStateBtn).toBeVisible({ timeout: 10_000 });
    await emptyStateBtn.click();
  } else {
    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });
    await expect(addLineBtn).toBeVisible({ timeout: 10_000 });
    await addLineBtn.click();
  }
  await slow(page);

  const inlineAddRow = page.getByTestId('inline-add-row');
  await expect(inlineAddRow).toBeVisible({ timeout: 10_000 });

  const productField = page.getByTestId('inline-add-field-product');
  await expect(productField).toBeVisible({ timeout: 5_000 });
  await productField.click();
  await slow(page);

  const searchDrawer = page.getByTestId('product-search-drawer');
  await expect(searchDrawer).toBeVisible({ timeout: 10_000 });

  const productOption = page.locator('[data-testid^="product-search-option-"]').nth(productIndex);
  if (await productOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await productOption.click();
  } else {
    await page.locator('[data-testid^="product-search-option-"]').first().click();
  }
  await slow(page);
  await expect(searchDrawer).toBeHidden({ timeout: 5_000 }).catch(() => {});

  // Wait for the callout to fill price/tax before touching quantity.
  await page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
    { timeout: 10_000 },
  ).catch(() => {});
  await slow(page);

  if (quantity) {
    const qtyField = page.getByTestId('inline-add-field-orderedQuantity');
    if (await qtyField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await qtyField.clear();
      await qtyField.fill(quantity);
    }
  }

  const linePromise = expectSaveResponse(page);
  await page.keyboard.press('Enter');
  await linePromise;
  await slow(page);
}

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe('Sales Quotation — Full flow to invoice with a negative-quantity line (integration)', () => {
  test.describe.configure({ timeout: 360_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_SALES_INTEGRATION=1 to run this live sales quotation full-flow integration test.',
  );

  test('Presupuesto → Pedido → Albarán → Factura propagates a negative-quantity/positive-price line at every stage', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Login
    // ═══════════════════════════════════════════════════════════════════════

    await login(page, { user, password });
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Create a quotation, select a Business Partner, save as draft
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'sales-quotation');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await slow(page);

    const newButton = page.getByTestId('action-new');
    await expect(newButton).toBeVisible({ timeout: 15_000 });
    await newButton.click();
    await waitForDetailReady(page);
    await slow(page);

    const bpField = page.getByTestId('field-businessPartner');
    await expect(bpField).toBeVisible({ timeout: 10_000 });
    await bpField.click();
    await slow(page);

    const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(bpOption).toBeVisible({ timeout: 15_000 });
    await bpOption.click();
    await slow(page);

    await page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
      { timeout: 10_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await slow(page);

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

    await expect(page).toHaveURL(/\/sales-quotation\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    await expect(page.getByTestId('document-status-pill')).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await waitForDetailReady(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Add a baseline positive line, capture totals BEFORE the
    // negative line is added
    // ═══════════════════════════════════════════════════════════════════════

    await addLine(page, { isFirst: true, productIndex: 0 });

    // [ETP-4567 check #4] Price column header reads "Precio", not the old
    // default AD label ("Precio tarifa" / "Net List Price"). Checked here,
    // right after the first line is added — the column header testid only
    // renders once at least one line exists. Right after adding a line the
    // inline add-row stays open (ready for the next line), which mounts a
    // second, hidden `DataTable` (`hideHeader hideDataRows`, see
    // HeaderTable.jsx) that carries the same `column-header-listPrice`
    // testid — scope to the visible `inline-lines-panel` container to avoid
    // a strict-mode match on the hidden duplicate.
    await expect(page.getByTestId('inline-lines-panel').getByTestId('column-header-listPrice'),
      '[ETP-4567] Quotation lines price column should read "Precio"',
    ).toHaveText('Precio', { timeout: 10_000 });

    const totalsBeforeNegative = await readDocumentTotals(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Add a NEGATIVE-quantity line (positive price via the product
    // callout) — models a return/credit adjustment on an otherwise regular
    // quotation
    // ═══════════════════════════════════════════════════════════════════════

    await addLine(page, { productIndex: 1, quantity: '-2' });

    // Row-count-aware wait (mirrors purchase-order-full-flow.integration.spec.js) —
    // waiting for "at least one line row" was satisfied by the STEP 3 baseline
    // line alone, racing findNegativeLineRow against the second row's render.
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Quotation should have 2 lines (baseline + negative)',
    ).toBeVisible({ timeout: 10_000 });

    // [Checks #1 & #2] Locate the negative line by its actual quantity cell
    // value and verify it — and its gross amount — stayed negative.
    const negQuotationRow = await findNegativeLineRow(page, 'orderedQuantity');

    const quotQtyText = await negQuotationRow.locator('[data-cell-key="orderedQuantity"]').textContent();
    expect(parseAmount(quotQtyText),
      '[ETP-4567] Line quantity should remain negative',
    ).toBeLessThan(0);

    const quotGrossText = await negQuotationRow.locator('[data-cell-key="lineGrossAmount"]').textContent();
    expect(parseAmount(quotGrossText),
      '[ETP-4567] Line gross amount should be negative for a negative-quantity line',
    ).toBeLessThan(0);

    // [Check #3] Document totals should shift downward once the negative
    // line is added.
    const totalsAfterNegative = await readDocumentTotals(page);
    expect(totalsAfterNegative.subtotal,
      '[ETP-4567] Quotation subtotal should decrease once the negative line is added',
    ).toBeLessThan(totalsBeforeNegative.subtotal);
    expect(totalsAfterNegative.total,
      '[ETP-4567] Quotation total should decrease once the negative line is added',
    ).toBeLessThan(totalsBeforeNegative.total);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Confirm (DR → UE) — SendToEvaluationModal
    // ═══════════════════════════════════════════════════════════════════════

    const confirmBtn = page.getByTestId('action-save');
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    await slow(page);

    const confirmModalBtn = page.getByTestId('action-confirm-modal');
    await expect(confirmModalBtn).toBeVisible({ timeout: 10_000 });
    await confirmModalBtn.click();
    await slow(page);

    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.reload({ waitUntil: 'networkidle' });
    await waitForDetailReady(page);

    const uePill = page.getByTestId('document-status-pill');
    await expect(uePill).toBeVisible({ timeout: 15_000 });
    await expect(uePill).toContainText(/bajo evaluaci|under eval|en espera/i, { timeout: 10_000 });
    await slow(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Confirm (UE → "Crear Pedido") — QuotationConfirmModal, then
    // navigate straight into the new order via "Ver pedido"
    // ═══════════════════════════════════════════════════════════════════════

    const confirmBtn2 = page.getByTestId('action-save');
    await expect(confirmBtn2).toBeVisible({ timeout: 10_000 });
    await confirmBtn2.click();
    await slow(page);

    const orderOption = page.getByTestId('confirm-option-order');
    await expect(orderOption).toBeVisible({ timeout: 10_000 });
    await orderOption.click();
    await slow(page);

    const confirmModalBtn2 = page.getByTestId('action-confirm-modal');
    await expect(confirmModalBtn2).toBeVisible({ timeout: 5_000 });
    await expect(confirmModalBtn2).toBeEnabled();
    await confirmModalBtn2.click();
    await slow(page);

    // "Ver pedido" navigates directly into the newly-created Sales Order —
    // sturdier than closing the modal and searching the order list.
    const viewOrderBtn = page.getByRole('button', { name: /ver pedido|view order/i });
    await expect(viewOrderBtn).toBeVisible({ timeout: 30_000 });
    await viewOrderBtn.click();
    await slow(page);

    await expect(page).toHaveURL(/\/sales-order\//, { timeout: 15_000 });
    await waitForDetailReady(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: On the Sales Order — verify the negative line + totals + price
    // label survived the Quotation → Order conversion
    // ═══════════════════════════════════════════════════════════════════════

    // Row-count-aware wait before touching line rows — same race guard used
    // throughout purchase-order-full-flow.integration.spec.js.
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Order should have 2 lines inherited from the quotation',
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('column-header-listPrice'),
      '[ETP-4567] Order lines price column should read "Precio"',
    ).toHaveText('Precio', { timeout: 10_000 });

    const negOrderRow = await findNegativeLineRow(page, 'orderedQuantity');
    const orderQtyText = await negOrderRow.locator('[data-cell-key="orderedQuantity"]').textContent();
    expect(parseAmount(orderQtyText),
      '[ETP-4567] Order line quantity should still be negative after Quotation → Order conversion',
    ).toBeLessThan(0);

    const orderGrossText = await negOrderRow.locator('[data-cell-key="lineGrossAmount"]').textContent();
    expect(parseAmount(orderGrossText),
      '[ETP-4567] Order line gross amount should still be negative',
    ).toBeLessThan(0);

    const orderTotals = await readDocumentTotals(page);
    expect(Math.abs(orderTotals.subtotal - totalsAfterNegative.subtotal),
      '[ETP-4567] Order subtotal should match the quotation subtotal (same lines, same prices)',
    ).toBeLessThanOrEqual(0.05);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: Confirm the order — "Crear albarán" only (ship, no direct
    // invoice) — then navigate into the new shipment via "Ver albarán"
    // ═══════════════════════════════════════════════════════════════════════

    const orderConfirmBtn = page.getByTestId('action-save');
    await expect(orderConfirmBtn).toBeVisible({ timeout: 10_000 });
    await orderConfirmBtn.click();
    await slow(page);

    const orderModalTitle = page.getByText(/confirmar pedido/i).first();
    await expect(orderModalTitle,
      'Order confirm modal should appear with the "Confirmar pedido" title',
    ).toBeVisible({ timeout: 10_000 });
    const orderConfirmCard = orderModalTitle.locator('xpath=ancestor::div[contains(@style,"width")][1]');

    await orderConfirmCard.getByText('Crear albarán', { exact: false }).first().click();
    await slow(page);

    await orderConfirmCard.getByRole('button', { name: /Confirmar \+ albarán/i }).click();
    await slow(page);

    const orderResultTitle = page.getByText(/pedido confirmado|documentos creados/i);
    await expect(orderResultTitle).toBeVisible({ timeout: 30_000 });

    const viewShipmentBtn = page.getByRole('button', { name: /ver albarán|view shipment/i });
    await expect(viewShipmentBtn).toBeVisible({ timeout: 10_000 });
    await viewShipmentBtn.click();
    await slow(page);

    await expect(page).toHaveURL(/\/goods-shipment\//, { timeout: 15_000 });
    await waitForDetailReady(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: On the Goods Shipment — verify the negative quantity survived
    // the Order → Shipment conversion. Shipments carry no price/amount
    // fields, so checks #2 (gross amount), #3 (totals) and #4 (price label)
    // intentionally do not apply on this stage.
    // ═══════════════════════════════════════════════════════════════════════

    // Row-count-aware wait before touching line rows — same race guard used
    // throughout purchase-order-full-flow.integration.spec.js.
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Shipment should have 2 lines inherited from the order',
    ).toBeVisible({ timeout: 10_000 });

    const negShipmentRow = await findNegativeLineRow(page, 'movementQuantity');
    const shipmentQtyText = await negShipmentRow.locator('[data-cell-key="movementQuantity"]').textContent();
    expect(parseAmount(shipmentQtyText),
      '[ETP-4567] Shipment movement quantity should still be negative after Order → Shipment conversion',
    ).toBeLessThan(0);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 10: Confirm the shipment with "Crear factura" ON — then navigate
    // into the new invoice via "Ver factura"
    // ═══════════════════════════════════════════════════════════════════════

    const shipmentConfirmBtn = page.getByTestId('action-save');
    await expect(shipmentConfirmBtn).toBeVisible({ timeout: 10_000 });
    await shipmentConfirmBtn.click();
    await slow(page);

    const shipmentModal = page.getByTestId('confirm-inout-modal');
    await expect(shipmentModal).toBeVisible({ timeout: 10_000 });
    const shipmentInvoiceToggle = shipmentModal.getByTestId('confirm-modal-invoice-toggle');
    await expect(shipmentInvoiceToggle).toBeVisible({ timeout: 5_000 });
    if ((await shipmentInvoiceToggle.getAttribute('aria-checked')) !== 'true') {
      await shipmentInvoiceToggle.click();
      await slow(page);
    }

    const shipmentConfirmModalBtn = shipmentModal.getByTestId('confirm-modal-confirm-btn');
    await expect(shipmentConfirmModalBtn).toBeVisible({ timeout: 5_000 });
    await shipmentConfirmModalBtn.click();

    await waitForConfirmResponse(page);
    await page.waitForTimeout(2_000);

    const viewInvoiceBtn = page.getByRole('button', { name: /ver factura|view invoice/i });
    await expect(viewInvoiceBtn).toBeVisible({ timeout: 10_000 });
    await viewInvoiceBtn.click();
    await slow(page);

    await expect(page).toHaveURL(/\/sales-invoice\//, { timeout: 15_000 });
    await waitForDetailReady(page);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11: On the Sales Invoice — verify the negative line + totals +
    // price label survived the Shipment → Invoice conversion
    // ═══════════════════════════════════════════════════════════════════════

    // Row-count-aware wait before touching line rows — same race guard used
    // throughout purchase-order-full-flow.integration.spec.js.
    await expect(page.getByRole('button', { name: /líneas\s+2|lines\s+2/i }),
      'Invoice should have 2 lines inherited from the shipment',
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('column-header-listPrice'),
      '[ETP-4567] Invoice lines price column should read "Precio"',
    ).toHaveText('Precio', { timeout: 10_000 });

    const negInvoiceRow = await findNegativeLineRow(page, 'invoicedQuantity');
    const invQtyText = await negInvoiceRow.locator('[data-cell-key="invoicedQuantity"]').textContent();
    expect(parseAmount(invQtyText),
      '[ETP-4567] Invoiced quantity should still be negative after Shipment → Invoice conversion',
    ).toBeLessThan(0);

    // Note: sales-invoice's line-level gross-amount field key is
    // "grossAmount" (not "lineGrossAmount" as on the quotation/order) — see
    // artifacts/sales-invoice/generated/web/sales-invoice/LinesTable.jsx.
    const invGrossText = await negInvoiceRow.locator('[data-cell-key="grossAmount"]').textContent();
    expect(parseAmount(invGrossText),
      '[ETP-4567] Invoice line gross amount should still be negative',
    ).toBeLessThan(0);

    const invoiceTotals = await readDocumentTotals(page);
    expect(Math.abs(invoiceTotals.subtotal - totalsAfterNegative.subtotal),
      '[ETP-4567] Invoice subtotal should match the quotation subtotal (same lines, same prices)',
    ).toBeLessThanOrEqual(0.05);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12: Confirm the invoice — the negative sign must survive
    // completion
    // ═══════════════════════════════════════════════════════════════════════

    const invoiceConfirmBtn = page.getByTestId('action-save');
    await expect(invoiceConfirmBtn).toBeVisible({ timeout: 10_000 });
    await invoiceConfirmBtn.click();
    await waitForConfirmResponse(page);
    await page.waitForTimeout(2_000);

    const closeBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await closeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await closeBtn.click();
      await slow(page);
    }

    const onDetailView = await page.getByTestId('detail-view').isVisible({ timeout: 5_000 }).catch(() => false);
    if (onDetailView) {
      await waitForDetailReady(page);
      const statusPill = page.getByTestId('document-status-pill').first();
      await expect(statusPill,
        '[ETP-4567] Invoice should show Completed after confirmation, negative line still present',
      ).toContainText(/completado|registrado|booked|completed/i, { timeout: 15_000 });

      const negCompletedRow = await findNegativeLineRow(page, 'invoicedQuantity');
      const completedQtyText = await negCompletedRow.locator('[data-cell-key="invoicedQuantity"]').textContent();
      expect(parseAmount(completedQtyText),
        '[ETP-4567] Invoiced quantity should remain negative after the invoice is completed',
      ).toBeLessThan(0);
    }
    await slow(page);
  });
});
