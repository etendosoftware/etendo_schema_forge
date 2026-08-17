/**
 * Shared helpers for Purchase Order integration E2E tests.
 *
 * Centralizes credential loading, page-wait utilities, save-response
 * listeners, and common interaction patterns (vendor setup, PO creation,
 * line addition) so individual spec files stay focused on their flow.
 */
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Credentials ──────────────────────────────────────────────────────────────

export function loadCredentials() {
  try {
    const credPath = resolve(import.meta.dirname, '../../.auth-credentials.json');
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (creds.email && creds.password) return creds;
  } catch { /* file doesn't exist */ }
  return null;
}

// ── Page-wait utilities ──────────────────────────────────────────────────────

const SLOW_MS = Number(process.env.E2E_SLOW_MS || 0);

export async function slow(page) {
  if (SLOW_MS > 0) await page.waitForTimeout(SLOW_MS);
}

/**
 * Wait for the detail view to be visible and any loading spinner to disappear.
 */
export async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view'),
    'Detail view should be visible — page may not have loaded correctly',
  ).toBeVisible({ timeout: 20_000 });
  const spinner = page.getByText(/cargando|loading/i);
  if (await spinner.isVisible({ timeout: 500 }).catch(() => false)) {
    await expect(spinner).toBeHidden({ timeout: 15_000 });
  }
}

/**
 * Register a listener for a successful save/create/update API response.
 * MUST be called BEFORE the action that triggers the request.
 */
export function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) &&
      resp.status() >= 200 && resp.status() < 300,
    { timeout: 20_000 },
  );
}

/**
 * Wait for any in-flight navigation to settle, then safely reload.
 * Avoids ERR_ABORTED by catching reload failures (e.g. SPA redirect in progress).
 */
export async function safeReload(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

/**
 * Dismiss the "Cerrar" success modal if it appears after a confirmation action.
 * Waits for the page to settle after dismissal.
 */
export async function dismissSuccessModal(page) {
  const closeBtn = page.getByRole('button', { name: 'Cerrar', exact: true });
  if (await closeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await closeBtn.click();
    await slow(page);
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
}

/**
 * Wait for a NEO API POST response to complete after a confirmation action.
 */
export async function waitForConfirmResponse(page) {
  await page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.request().method() === 'POST' && resp.status() < 500,
    { timeout: 30_000 },
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
}

/**
 * Wait for the "Líneas N" summary button to show the expected count and
 * REMAIN showing it — guards against a transient reload flash observed right
 * after navigating into a freshly-created document (e.g. via a "Ver
 * factura"/"Ver pedido" result-modal link): a related panel (the
 * "Documentos" related-records panel) can finish its own async load right
 * after the header/lines data first renders, momentarily resetting the
 * detail view back to a loading state (0 lines, totals at 0.00) before the
 * real data repopulates. A single toBeVisible() check on the lines button
 * can pass DURING that in-between flash, so line-row assertions that run
 * immediately after would read stale/reset DOM instead of the settled data.
 *
 * Mirrors the spinner-wait idiom already used by waitForDetailReady() — wait
 * for any lingering "cargando/loading" text to clear — then also waits for
 * the network to go idle (covers the related-panel fetch) and RE-ASSERTS the
 * lines count actually stuck, instead of just increasing a timeout.
 */
export async function waitForLinesSettled(page, count, message) {
  const linesPattern = new RegExp(`l[ií]neas\\s+${count}|lines\\s+${count}`, 'i');
  const linesBtn = page.getByRole('button', { name: linesPattern });
  await expect(linesBtn,
    message || `Lines count should reach ${count}`,
  ).toBeVisible({ timeout: 15_000 });

  const spinner = page.getByText(/cargando|loading/i);
  await spinner.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  await expect(linesBtn,
    `Lines count should still read ${count} after related panels finish loading (no reload flash)`,
  ).toBeVisible({ timeout: 15_000 });
}

// ── Common interactions ──────────────────────────────────────────────────────

/**
 * Ensure the first contact in the list has isVendor = true.
 * Navigates to /contacts, opens the first row, checks the vendor checkbox.
 */
export async function ensureVendorSetup(page, { navigateTo }) {
  await navigateTo(page, 'contacts');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await slow(page);

  const contactRow = page.locator('tbody tr').first();
  await expect(contactRow).toBeVisible({ timeout: 10_000 });
  await contactRow.click();
  await slow(page);
  await waitForDetailReady(page);

  const financieroTab = page.getByRole('button', { name: /financiero|financial/i });
  await expect(financieroTab).toBeVisible({ timeout: 10_000 });
  await financieroTab.click();
  await page.waitForTimeout(1_000);

  // The "Proveedor" checkbox is rendered by SquareCheckbox (windows/custom/shared/SquareCheckbox.jsx):
  // a visible <span> box + label text, followed by a visually-hidden (`sr-only`) native
  // <input type="checkbox">, all wrapped in a single <label>. The testid lives on the hidden
  // input, so it must be located with an exact `getByTestId` (not a `[data-testid*="vendor"]`
  // substring match, which is ambiguous — it can also match the conditionally-rendered
  // "BlockingToggle__…-vendor" once the vendor section expands). Because the input itself is
  // not visible, click the wrapping <label> instead — that's the native, hit-testable way a
  // browser toggles a checkbox nested inside a label, and avoids relying on `force: true`
  // clicks against a clipped 1px element.
  const vendorInput = page.getByTestId('SquareCheckbox__7f0756-vendor');
  const isChecked = await vendorInput.isChecked().catch(() => false);

  if (!isChecked) {
    const vendorLabel = vendorInput.locator('xpath=ancestor::label[1]');
    await vendorLabel.click();
    await page.waitForTimeout(1_000);

    const saveBtn = page.getByTestId('action-save').or(
      page.getByRole('button', { name: /guardar|save/i }),
    ).first();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    const savePromise = expectSaveResponse(page);
    await saveBtn.click();
    await savePromise;
    await slow(page);
  }
}

/**
 * Re-pick the currently displayed (or first) option of an EntityForm Select,
 * but ONLY when the field is not already holding a real, valid value.
 *
 * Needed when a callout CLEARS a field's value in the editing state while the
 * shadcn Select keeps displaying the stale label (uncontrolled→controlled):
 * the form looks filled but required-field validation blocks the save. Opening
 * the dropdown and clicking an option commits a real value again.
 */
export async function reselectComboOption(page, fieldKey) {
  const trigger = page.getByTestId(`field-${fieldKey}`);
  if (!await trigger.isVisible({ timeout: 2_000 }).catch(() => false)) return;
  await trigger.click();
  const option = page.getByRole('option').first();
  if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await option.click();
  } else {
    // No options (or not a Select) — close the dropdown and move on.
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(300);
}

/**
 * Select the first vendor BP in a selector field and wait for callout.
 */
export async function selectVendorBP(page) {
  const bpInput = page.getByTestId('field-businessPartner');
  await expect(bpInput).toBeVisible({ timeout: 10_000 });
  await bpInput.click();

  const bpOption = page.locator('[data-testid^="option-businessPartner-"]')
    .filter({ hasNotText: /crear|create/i }).first();
  await expect(bpOption,
    'At least one vendor option should appear',
  ).toBeVisible({ timeout: 15_000 });
  await bpOption.click();
  await slow(page);

  // Wait for callout to propagate (address, payment terms, etc.)
  await page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.status() < 500,
    { timeout: 10_000 },
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
}

/**
 * Save the current document as draft. Tries action-save-draft first, falls back to Guardar.
 * Uses a combined approach: click then wait for networkidle, avoiding response listener
 * race conditions in slow mode.
 */
export async function saveDraft(page) {
  const saveDraftBtn = page.getByTestId('action-save-draft');
  if (await saveDraftBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await saveDraftBtn.click();
  } else {
    const guardarBtn = page.getByRole('button', { name: /guardar|save/i });
    await guardarBtn.click();
  }
  // Wait for the save API call to complete
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  await slow(page);
}

/**
 * Add a product line using the inline-add row.
 * @param {Object} opts
 * @param {number} [opts.productIndex=0] - Which product to pick from the drawer (0-based)
 * @param {string} [opts.quantity] - Optional quantity to set
 * @param {boolean} [opts.isFirst=false] - True if this is the first line (uses empty-state button)
 */
export async function addProductLine(page, { productIndex = 0, quantity, isFirst = false } = {}) {
  if (isFirst) {
    let emptyStateBtn = page.getByTestId('action-add-lines-empty-state');
    if (!await emptyStateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      emptyStateBtn = page.getByRole('button', { name: /añadir líneas|add lines/i }).first();
    }
    await emptyStateBtn.click();
  } else {
    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });
    await expect(addLineBtn).toBeVisible({ timeout: 10_000 });
    await addLineBtn.click();
  }
  await slow(page);

  await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('inline-add-field-product').click();
  await slow(page);

  const searchDrawer = page.getByTestId('product-search-drawer');
  await expect(searchDrawer).toBeVisible({ timeout: 10_000 });

  const product = page.locator('[data-testid^="product-search-option-"]').nth(productIndex);
  if (await product.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await product.click();
  } else {
    await page.locator('[data-testid^="product-search-option-"]').first().click();
  }
  await slow(page);
  await expect(searchDrawer).toBeHidden({ timeout: 5_000 }).catch(() => {});
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

/**
 * Open a draft row from a list view by hovering and clicking the edit button (pencil).
 * Falls back to double-click if the pencil button is not visible.
 */
export async function openDraftRow(page, { label = 'draft row' } = {}) {
  const rows = page.locator('tbody tr');
  await expect(rows.first(),
    `${label} list should have at least one row`,
  ).toBeVisible({ timeout: 10_000 });

  const draftRow = rows.filter({ hasText: /borrador|draft/i }).first();
  await expect(draftRow,
    `There should be a draft ${label}`,
  ).toBeVisible({ timeout: 10_000 });

  await draftRow.hover();
  await slow(page);
  const editBtn = draftRow.locator('[data-testid*="Pencil"], [data-testid*="pencil"], [data-testid="row-quick-action-edit"]').first();
  if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await editBtn.click();
  } else {
    await draftRow.dblclick();
  }
  await slow(page);
  await waitForDetailReady(page);
}

/**
 * Click the confirm button (action-save) on a draft document.
 * In draft mode, action-save is the "Confirmar" button.
 */
export async function clickConfirmButton(page) {
  const confirmBtn = page.getByTestId('action-save');
  await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
  await confirmBtn.click();
  await slow(page);
}

/**
 * Verify a document's status pill contains the expected text.
 */
export async function expectStatusPill(page, pattern, message) {
  const pill = page.getByTestId('document-status-pill').first();
  await expect(pill, message).toContainText(pattern, { timeout: 10_000 });
}

// ── Price / totals utilities ─────────────────────────────────────────────────

/**
 * Parse a formatted amount string (e.g. "47,96 EUR", "38.00 EUR", "-20.00 EUR")
 * into a numeric value. Handles Spanish locale (comma as decimal separator).
 */
export function parseAmount(text) {
  if (!text) return 0;
  // Remove currency symbols, letters, spaces — keep digits, dots, commas, minus
  let cleaned = text.replace(/[^0-9.,-]/g, '');
  // If the text uses comma as decimal separator (Spanish: "1.234,56"), convert
  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.lastIndexOf('.')) {
    cleaned = cleaned.replaceAll('.', '').replace(',', '.');
  }
  return Number.parseFloat(cleaned) || 0;
}

/**
 * Read the document totals panel values (subtotal, tax, total) from the detail view.
 * Uses the data-testid attributes on DocumentTotalsPanel.
 * Scrolls the total row into view first to ensure values are rendered.
 * @returns {{ subtotal: number, tax: number, total: number }}
 */
export async function readDocumentTotals(page) {
  // Wait for the totals panel to render and scroll it into view
  const totalRow = page.getByTestId('totals-row-total-value');
  await expect(totalRow, 'Total row should be visible in the totals panel').toBeVisible({ timeout: 10_000 });
  await totalRow.scrollIntoViewIfNeeded().catch(() => {});

  // Wait for totals to compute from the latest lines
  await page.waitForTimeout(1_000);

  const subtotalEl = page.getByTestId('totals-row-subtotal-value');
  const taxEl = page.getByTestId('totals-row-tax-value');

  const subtotalText = await subtotalEl.textContent({ timeout: 5_000 }).catch(() => '0');
  const taxText = await taxEl.textContent({ timeout: 5_000 }).catch(() => '0');
  const totalText = await totalRow.textContent({ timeout: 5_000 }).catch(() => '0');
  const result = {
    subtotal: parseAmount(subtotalText),
    tax: parseAmount(taxText),
    total: parseAmount(totalText),
    _raw: { subtotalText, taxText, totalText },
  };
  return result;
}

/**
 * Verify that the document totals are internally consistent and match expected constraints.
 * Checks: subtotal > 0, tax >= 0, total ≈ subtotal + tax (within rounding tolerance).
 * Optionally compares against a reference totals object (e.g. PO totals should match invoice totals).
 *
 * @param {object} totals - { subtotal, tax, total } from readDocumentTotals
 * @param {string} docLabel - Label for assertion messages (e.g. 'PO', 'Invoice')
 * @param {object} [referenceTotals] - Optional reference to compare against
 */
export function verifyTotalsConsistency(totals, docLabel, referenceTotals) {
  const { subtotal, tax, total, _raw } = totals;

  expect(subtotal,
    `[${docLabel}] Subtotal should be > 0 — lines should carry prices (raw: "${_raw?.subtotalText}")`,
  ).toBeGreaterThan(0);

  // Tax can be negative in purchase invoices (e.g. deductible VAT with RE surcharge)
  expect(tax,
    `[${docLabel}] Tax amount should not be zero — tax should be applied (raw: "${_raw?.taxText}")`,
  ).not.toBe(0);

  // Total should equal subtotal + tax within rounding tolerance (0.05 EUR for multi-line tax rounding)
  const expectedTotal = subtotal + tax;
  expect(Math.abs(total - expectedTotal),
    `[${docLabel}] Total (${total}) should ≈ subtotal (${subtotal}) + tax (${tax}) = ${expectedTotal.toFixed(2)} (raw: "${_raw?.totalText}")`,
  ).toBeLessThanOrEqual(0.05);

  // Compare subtotals between documents (e.g. PO vs Invoice should have same line amounts).
  // Tax and total may differ between document types (e.g. purchase invoices compute tax differently
  // from POs when using net-price lists with deductible VAT), so only subtotals are compared.
  if (referenceTotals) {
    expect(Math.abs(subtotal - referenceTotals.subtotal),
      `[${docLabel}] Subtotal (${subtotal}) should match reference (${referenceTotals.subtotal})`,
    ).toBeLessThanOrEqual(0.05);
  }
}
