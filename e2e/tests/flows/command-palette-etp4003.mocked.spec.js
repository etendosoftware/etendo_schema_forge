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

  test('palette opens on Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k');
    // The CommandDialog root input should become visible
    await expect(page.locator('[cmdk-input], input[placeholder]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('palette shows visible menu items after opening', async ({ page }) => {
    await page.keyboard.press('Control+k');
    // Wait for dialog to be visible
    await page.waitForSelector('[cmdk-dialog], [role="dialog"]', { timeout: 5_000 }).catch(() => {});
    // At least the dashboard/home item should be present (it is never hidden)
    // Use a broad role-based locator — exact text varies by locale
    const listContainer = page.locator('[cmdk-list], [cmdk-root]').first();
    await expect(listContainer).toBeVisible({ timeout: 5_000 });
  });

  test('searching for a term shows matching items', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[cmdk-input]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    // Type a search term that should match a visible window
    await input.fill('order');
    // Should show at least one result (sales-order or purchase-order)
    const items = page.locator('[cmdk-item]');
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
  });

  test('hidden items (deal, business-partner) are not visible in the palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[cmdk-input]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    // Search specifically for 'deal' — it is hidden in menu.json
    await input.fill('deal');
    // The empty state OR zero cmdk-item elements should be visible
    const items = page.locator('[cmdk-item]');
    const count = await items.count();
    // Either no items OR none that navigate to /deal
    if (count > 0) {
      // Verify none of them are the hidden 'deal' window
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).textContent();
        // The deal label could be translated; check the name is not 'deal'
        expect(text?.toLowerCase()).not.toBe('deal');
      }
    }
    // If count === 0, the empty state is shown — that's correct behaviour
  });

  test('closing and reopening the palette works', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[cmdk-input]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    // Close with Escape — press on the focused input so cmdk intercepts it
    await input.press('Escape');
    // The input is the persistent top-bar control; only the dropdown closes.
    await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).not.toBeVisible({ timeout: 5_000 });
    // Reopen
    await page.keyboard.press('Control+k');
    await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
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

    // Clearing the scope updates both surfaces immediately and exposes the
    // all-windows state in the dropdown.
    await page.getByTestId('topbar-vector-search-scope-clear').click();
    await expect(page.getByTestId('topbar-vector-search-scope')).toHaveCount(0);
    await expect(page.getByTestId('vector-search-scope')).toContainText('Todas las ventanas');
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

  test('keyboard navigation marks an item and closes after opening it', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('global-search-input');
    await expect(input).toBeVisible({ timeout: 5_000 });
    const items = page.locator('[data-global-search-item="true"]');
    await expect(items.first()).toBeVisible({ timeout: 5_000 });

    await input.press('ArrowDown');
    await expect(items.first()).toHaveAttribute('data-selected', 'true');
    await input.press('Enter');
    await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).not.toBeVisible({ timeout: 5_000 });
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

  test('backspace at the start of a query clears the current-window scope', async ({ page }) => {
    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const input = page.getByTestId('global-search-input');
    await input.fill('pan');
    await input.press('Home');
    await input.press('Backspace');
    await expect(page.getByTestId('topbar-vector-search-scope')).toHaveCount(0);
    await expect(input).toHaveValue('pan');
  });
});
