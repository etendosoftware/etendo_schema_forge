/**
 * E2E tests for ETP-4003 i18n fixes.
 *
 * CommandPalette i18n — opens on Ctrl+K, shows translated items, hides hidden
 * items, searches visible items, and exercises top-bar scope interactions.
 *
 * Mock mode only — no Etendo backend required.
 * Run: cd e2e && npx playwright test tests/flows/command-palette-etp4003.mocked.spec.js
 * Requires dev server: make dev (http://localhost:3100)
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

// ─── Group 1: CommandPalette i18n ─────────────────────────────────────────────

test.describe('CommandPalette i18n (ETP-4003)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('top-bar search keeps scope controls synchronized with the dropdown', async ({ page }) => {
    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const input = page.getByTestId('global-search-input');
    await input.click();
    const dialog = page.locator('[cmdk-dialog], [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Product is the current window scope and is represented consistently in
    // both the persistent top-bar pill and the open dropdown.
    await expect(page.getByTestId('topbar-vector-search-scope')).toContainText('Producto');
    await expect(page.getByTestId('vector-search-scope')).toContainText('Producto');

    // Clearing the scope updates both surfaces immediately. With no scoped
    // targets, the dropdown correctly omits the scope control.
    await page.getByTestId('topbar-vector-search-scope-clear').click();
    await expect(page.getByTestId('topbar-vector-search-scope')).toHaveCount(0);
    await expect(page.getByTestId('vector-search-scope')).toHaveCount(0);
  });

  test('selecting every window removes the redundant all-windows top-bar pill', async ({ page }) => {
    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('global-search-input').click();
    await expect(page.getByTestId('vector-search-target-picker-trigger')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('vector-search-target-picker-trigger').click();

    const options = page.getByTestId('vector-search-target-option');
    await expect(options.first()).toBeVisible({ timeout: 5_000 });
    const optionCount = await options.count();
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index);
      if (!(await option.isChecked())) await option.check();
    }

    await expect(page.getByTestId('topbar-vector-search-scope')).toHaveCount(0);
    await page.getByTestId('vector-search-target-picker-trigger').click();
    await expect(page.getByTestId('vector-search-scope')).toContainText('Todas las ventanas');
  });

  test('clicking a menu item navigates and resets the global query', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('global-search-input');
    await input.fill('contacts');
    const contactsItem = page.locator('[data-global-search-item="true"]').filter({ hasText: /Contactos|Contacts/i }).first();
    await expect(contactsItem).toBeVisible({ timeout: 5_000 });
    await contactsItem.click();
    await expect(page).toHaveURL(/\/contacts(?:$|\?)/, { timeout: 8_000 });
    await expect(input).toHaveValue('');
  });
});
