/**
 * E2E: Purchase Order — read-only fields when processed
 *
 * Verifies that fields with readOnlyLogic: (record) => record.processed === true
 * are disabled in the form when the order is in a processed state.
 *
 * Covered fields: orderDate, partnerAddress, paymentMethod, businessPartner
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

// Fields that must be disabled when processed=true
const READ_ONLY_WHEN_PROCESSED = [
  { testId: 'field-orderDate',        label: 'Order Date' },
  { testId: 'field-partnerAddress',   label: 'Partner Address' },
  { testId: 'field-paymentMethod',    label: 'Payment Method' },
  { testId: 'field-businessPartner',  label: 'Business Partner' },
];

test.describe('Purchase Order — readOnlyLogic when processed', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/purchase-order');
    await page.getByTestId('list-view').waitFor({ state: 'visible', timeout: 10_000 });

    const processedStatusCell = page.locator([
      '[data-testid^="cell-"][data-testid$="-documentStatus"][data-value="CO"]',
      '[data-testid^="cell-"][data-testid$="-documentStatus"][data-value="CL"]',
    ].join(', ')).first();
    const hasProcessedRow = await processedStatusCell.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasProcessedRow, 'No processed purchase order available in the real backend dataset');

    await processedStatusCell.locator('xpath=ancestor::tr').click();
    await page.getByTestId('detail-view').waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('processed order exposes document status', async ({ page }) => {
    await expect(page.getByTestId('field-documentStatus')).toBeVisible({ timeout: 5_000 });
  });

  for (const field of READ_ONLY_WHEN_PROCESSED) {
    test(`${field.label} is disabled (readOnlyLogic)`, async ({ page }) => {
      const fieldRoot = page.getByTestId(field.testId);
      await expect(fieldRoot).toBeVisible({ timeout: 5_000 });

      const control = fieldRoot.locator('input, button, textarea, select').first();
      await expect(control).toBeDisabled({ timeout: 3_000 });
    });
  }

  test('all header editable fields are disabled when processed', async ({ page }) => {
    // Collect all inputs inside the detail-view form that are NOT in the lines table
    const form = page.getByTestId('detail-view');
    const inputs = form.locator('input:not([type="hidden"]), select').filter({ hasNot: page.locator('[data-testid="list-view"] *') });

    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    let enabledCount = 0;
    for (let i = 0; i < count; i++) {
      const isDisabled = await inputs.nth(i).isDisabled();
      if (!isDisabled) enabledCount++;
    }

    // No editable inputs should exist in a processed order form
    expect(enabledCount).toBe(0);
  });

  test('a draft order has editable fields (contrast check)', async ({ page }) => {
    // Navigate to the list and open the first draft order to verify
    // editable fields ARE enabled for non-processed orders
    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    const draftStatusCell = page.locator('[data-testid^="cell-"][data-testid$="-documentStatus"][data-value="DR"]').first();
    const hasDraft = await draftStatusCell.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasDraft) {
      test.skip(true, 'No draft purchase order available in list to contrast check');
      return;
    }

    await draftStatusCell.locator('xpath=ancestor::tr').click();
    await page.getByTestId('detail-view').waitFor({ state: 'visible', timeout: 10_000 });

    // Order Date field should be enabled on a draft order
    const orderDateField = page.getByTestId('field-orderDate');
    await expect(orderDateField).toBeVisible({ timeout: 5_000 });
    const input = orderDateField.locator('input').first();
    await expect(input).toBeEnabled({ timeout: 3_000 });
  });
});
