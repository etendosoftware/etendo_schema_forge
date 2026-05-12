import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Bug: Partner Address dropdown is empty after selecting Business Partner.
 *
 * Recorded flow: login -> enter environment ->
 *   Purchase Order -> New Order -> select a Business Partner ->
 *   Partner Address combobox has no options (should list BP locations).
 *
 * Expected: after selecting a Business Partner, the Partner Address
 * dropdown should load that BP's locations and auto-select the first one
 * (or at least show available options).
 */

test.describe('Purchase Order - Partner Address Bug', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'purchase-order');
  });

  test('Partner Address loads options after selecting Business Partner', async ({ page }) => {
    // Open new order form
    await page.getByTestId('action-new').click();
    await expect(page.getByTestId('detail-view')).toBeVisible();

    // Partner Address should be disabled before BP selection
    const partnerAddress = page.getByTestId('field-partnerAddress');
    await expect(partnerAddress).toBeDisabled();

    // Select the first real backend suggestion without depending on localized labels.
    const bpField = page.getByTestId('field-businessPartner');
    await bpField.click();
    await clickFirstStableOption(page, 'option-businessPartner-');

    // Partner Address should now be enabled
    await expect(partnerAddress).toBeEnabled({ timeout: 5_000 });

    // BUG: The dropdown should have options, not be empty
    // Open the dropdown and check for options
    await partnerAddress.click();

    // There should be at least one selectable option (a BP location)
    await expect(page.locator('[data-testid^="option-partnerAddress-"]').first()).toBeVisible({ timeout: 5_000 });
  });
});

async function clickFirstStableOption(page, testIdPrefix) {
  const options = page.locator(`[data-testid^="${testIdPrefix}"]`);
  await expect(options.first()).toBeVisible({ timeout: 10_000 });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const option = options.first();
    try {
      await option.click({ timeout: 3_000 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await page.waitForTimeout(250);
    }
  }
}
