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

/**
 * Override the generic callout stub from auth.login() with one that simulates
 * the C_BPartner callout populating partnerAddress. Registered AFTER login()
 * so it takes priority (Playwright matches routes LIFO).
 */
async function installCalloutMock(page) {
  await page.route('**/sws/neo/purchase-order/**/callout', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        updates: {
          partnerAddress: { value: 'mock-addr-id', classicValue: 'mock-addr-id' },
        },
        combos: {
          partnerAddress: [{ id: 'mock-addr-id', _identifier: 'Main Address' }],
        },
        messages: [],
      }),
    });
  });
}

test.describe('Purchase Order - Partner Address Bug', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await installCalloutMock(page);
    await navigateTo(page, 'purchase-order');
  });

  test('Partner Address loads options after selecting Business Partner', async ({ page }) => {
    // Open new order form
    await page.getByTestId('action-new').click();
    await expect(page.getByTestId('detail-view')).toBeVisible();

    // Partner Address should be disabled before BP selection.
    // The chip overlay (`-chip`) is gated on !isDisabled, so the input is the
    // only rendering in this state — locating it is enough.
    const partnerAddressInput = page.getByTestId('field-partnerAddress');
    const partnerAddressChip  = page.getByTestId('field-partnerAddress-chip');
    await expect(partnerAddressInput).toBeDisabled();

    // Select the first real backend suggestion without depending on localized labels.
    const bpField = page.getByTestId('field-businessPartner');
    await bpField.click();
    await clickFirstStableOption(page, 'option-businessPartner-');

    // Confirm the BP was actually registered — if the chip never appears the
    // callout was never triggered and the rest of the test is meaningless.
    await expect(page.getByTestId('field-businessPartner-chip')).toBeVisible({ timeout: 8_000 });

    // After BP selection, CreatableSearchSelect either:
    //   a) auto-selects the first BP location (FIC parity), which swaps the
    //      input for a Figma chip carrying the address label, or
    //   b) leaves the input enabled — the user opens the dropdown manually.
    // Both paths prove the bug ("empty dropdown") is fixed: in (a) an option
    // was picked, in (b) options are listable. Wait for either state.
    const mode = await waitForPartnerAddressMode(partnerAddressInput, partnerAddressChip);

    if (mode === 'chip') {
      // Auto-selected an address → the chip label is the proof that options loaded.
      await expect(partnerAddressChip).toHaveText(/\S/);
    } else {
      // Manual mode → open the dropdown and assert at least one option.
      // Allow a short grace period: a callout re-fire can transiently disable the field.
      await expect(partnerAddressInput).toBeEnabled({ timeout: 5_000 });
      await partnerAddressInput.click();
      await expect(page.locator('[data-testid^="option-partnerAddress-"]').first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

async function waitForPartnerAddressMode(input, chip) {
  let lastMode = 'pending';

  // Use short intervals early (callout usually resolves in <1s) and back off
  // gradually. 30s total covers slow/cold-start environments. The 'pending'
  // state is normal while the callout is in-flight — the field may be
  // invisible/disabled during that window, which must not be counted as a failure.
  await expect.poll(async () => {
    if (await chip.isVisible().catch(() => false)) {
      lastMode = 'chip';
      return lastMode;
    }
    if (await input.isVisible().catch(() => false) && await input.isEnabled().catch(() => false)) {
      lastMode = 'input';
      return lastMode;
    }
    return 'pending';
  }, { timeout: 30_000, intervals: [100, 200, 200, 500, 500, 1_000] }).not.toBe('pending');

  return lastMode;
}

async function openSelectorOptions(page, fieldKey) {
  const options = page.locator(`[data-testid^="option-${fieldKey}-"]`);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const input = page.getByTestId(`field-${fieldKey}`);
    try {
      await input.click({ timeout: 3_000 });
      await expect(options.first()).toBeVisible({ timeout: 3_000 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await page.waitForTimeout(250);
    }
  }
}

async function clickFirstStableOption(page, testIdPrefix) {
  const options = page.locator(`[data-testid^="${testIdPrefix}"]`);
  await expect(options.first()).toBeVisible({ timeout: 10_000 });

  // Wait for the list to stop growing before clicking — avoids hitting a
  // moving target when the dropdown is still appending results from the server.
  let prevCount = -1;
  await expect.poll(async () => {
    const count = await options.count();
    if (count > 0 && count === prevCount) return true;
    prevCount = count;
    return false;
  }, { timeout: 8_000, intervals: [150, 150, 300] }).toBe(true);

  await options.first().click({ timeout: 10_000 });
}
