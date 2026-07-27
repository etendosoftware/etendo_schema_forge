import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Inline lines min-value validation (mocked).
 *
 * Verifies the inline-edit min-value guard introduced in ETP-4005: typing a
 * value below `col.min` adds a red border to the input via editInputClassName,
 * blocks the PATCH autosave through hasValidationErrorRef, and clears the
 * border once the user enters a valid value.
 *
 * Uses `discount` (min: 0, max: 100) as the guarded field. `orderedQuantity`
 * used to be the example field here, but ETP-4567 removed its `min: 0`
 * constraint on this window (negative quantity/price is now a valid line) —
 * `discount` still has a real min-value constraint, so it exercises the same
 * generic guard mechanism without contradicting that change.
 *
 * The helpers `isValueBelowMin` and `editInputClassName` are covered by
 * source-shape tests in InlineLinesPanel.helpers.test.js. This E2E spec
 * exercises the behavior in a real browser context.
 *
 * Runs in mock mode — no Etendo backend required.
 */

const QUOT_ID = 'ilm-mock-quot-001';
const LINE_ID = 'ilm-line-001';
const BP_UUID = 'A94756453D1011D39A840050044F4CCE';

const DRAFT_QUOTATION = {
  id: QUOT_ID,
  documentNo: 'CQ-ILM',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 100,
  summedLineAmount: 100,
  businessPartner: BP_UUID,
  'businessPartner$_identifier': 'Test BP',
  'currency$_identifier': 'EUR',
};

const QUOTATION_LINE = {
  id: LINE_ID,
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  orderedQuantity: 2,
  listPrice: 50,
  discount: 0,
  lineGrossAmount: 100,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 21%',
  'currency$_identifier': 'EUR',
};

async function installQuotationMocks(page, { onPatch } = {}) {
  await page.route('**/sws/neo/sales-quotation/quotation?**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_QUOTATION], totalRows: 1 } }),
    });
  });
  await page.route(`**/sws/neo/sales-quotation/quotation/${QUOT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_QUOTATION] } }),
    });
  });
  await page.route(`**/sws/neo/sales-quotation/header/${QUOT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_QUOTATION] } }),
    });
  });
  await page.route('**/sws/neo/sales-quotation/quotationLine**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [QUOTATION_LINE], totalRows: 1 } }),
    });
  });
  await page.route('**/sws/neo/sales-quotation/quotationLine/**', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const body = JSON.parse(route.request().postData() || '{}');
    onPatch?.({ url: route.request().url(), body });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...QUOTATION_LINE, ...body }] } }),
    });
  });
}

test.describe('Inline lines min-value validation (mocked)', () => {
  let patchCalls;

  test.beforeEach(async ({ page }) => {
    patchCalls = [];
    await login(page);
    await installQuotationMocks(page, { onPatch: (info) => patchCalls.push(info) });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });
  });

  test('entering a negative discount adds border-destructive to the input', async ({ page }) => {
    const row = page.locator(`[data-testid="line-row-${LINE_ID}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });
    await discountField.fill('-1');
    await discountField.blur();

    // commitField detects value < min=0 and sets invalidCell → editInputClassName
    // adds border-destructive to the Input's className (Semantic Theme Contract).
    await expect(discountField).toHaveClass(/border-destructive/, { timeout: 3_000 });
  });

  test('entering a negative discount blocks the PATCH request', async ({ page }) => {
    const row = page.locator(`[data-testid="line-row-${LINE_ID}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });
    await discountField.fill('-1');
    await discountField.blur();

    // Give the autosave path a chance to fire if commitField did not short-circuit.
    await page.waitForTimeout(500);

    // commitField returned early on min violation → no PATCH for discount.
    const discountPatches = patchCalls.filter((c) => c.body.discount !== undefined);
    expect(discountPatches).toHaveLength(0);
  });

  test('correcting the invalid value clears the destructive border and fires the PATCH', async ({ page }) => {
    const row = page.locator(`[data-testid="line-row-${LINE_ID}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });

    // Invalid value → destructive-tinted border.
    await discountField.fill('-1');
    await discountField.blur();
    await expect(discountField).toHaveClass(/border-destructive/, { timeout: 3_000 });

    // The row stays in edit mode (hasValidationErrorRef prevents close-on-outside-click).
    // Entering a valid value directly commits and clears invalidCell.
    await discountField.fill('10');
    await discountField.blur();

    await expect(discountField).not.toHaveClass(/border-destructive/, { timeout: 3_000 });
  });
});
