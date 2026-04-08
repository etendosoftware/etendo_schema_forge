/**
 * E2E: Purchase Order — read-only fields when processed
 *
 * Verifies that fields with readOnlyLogic: (record) => record.processed === true
 * are disabled in the form when the order is in a processed (Complete) state.
 *
 * Test record: 84341AF962BC4968A99A14405B1D510A (status: Complete)
 *
 * Covered fields: orderDate, partnerAddress, paymentMethod, businessPartner
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

const PROCESSED_RECORD_ID = '84341AF962BC4968A99A14405B1D510A';
const RECORD_URL = `/purchase-order/${PROCESSED_RECORD_ID}`;

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
    await page.goto(RECORD_URL);
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    // Wait for the detail form to render
    await page.getByTestId('detail-view').waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('processed order shows Complete status', async ({ page }) => {
    // Sanity check: the record we're testing is actually processed
    const statusBadge = page.locator('[data-testid="field-documentStatus"], .status-badge, [class*="badge"]').first();
    await expect(statusBadge).toBeVisible({ timeout: 5_000 });
    const statusText = await statusBadge.textContent();
    expect(statusText?.toLowerCase()).toMatch(/complete|co|processed/i);
  });

  for (const field of READ_ONLY_WHEN_PROCESSED) {
    test(`${field.label} is disabled (readOnlyLogic)`, async ({ page }) => {
      const container = page.getByTestId(field.testId);
      await expect(container).toBeVisible({ timeout: 5_000 });

      // Any input/select/button inside the field container should be disabled
      const input = container.locator('input, select, button[role="combobox"]').first();
      await expect(input).toBeDisabled({ timeout: 3_000 });
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

    // Find a row with Draft status — click the first one available
    const draftRow = page.locator('[data-testid^="row-"]').filter({ hasText: /draft|DR/i }).first();
    const hasDraft = await draftRow.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasDraft) {
      test.skip(true, 'No draft purchase order available in list to contrast check');
      return;
    }

    await draftRow.click();
    await page.getByTestId('detail-view').waitFor({ state: 'visible', timeout: 10_000 });

    // Order Date field should be enabled on a draft order
    const orderDateField = page.getByTestId('field-orderDate');
    await expect(orderDateField).toBeVisible({ timeout: 5_000 });
    const input = orderDateField.locator('input').first();
    await expect(input).toBeEnabled({ timeout: 3_000 });
  });
});
