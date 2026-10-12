// @covers tools/app-shell/src/components/CommandPalette.jsx
// @covers tools/app-shell/src/lib/globalSearchMenu.js
/**
 * E2E tests for ETP-4003 i18n fixes.
 *
 * CommandPalette i18n — opens on Ctrl+K, shows translated items, hides hidden
 * items, searches visible items, and exercises top-bar scope interactions.
 *
 * Also guards, at 1280x720, the window search ranking (Enter opens the first
 * match), accent-insensitive matching, the no-results state, the window-filter
 * picker's geometry, and that Esc inside the picker closes only the picker.
 *
 * Mock mode only — no Etendo backend required.
 * Run: cd e2e && npx playwright test tests/flows/platform/command-palette-etp4003.mocked.spec.js
 * Requires dev server: make dev (http://localhost:3100)
 */

import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

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


// ─── Group 2: window search and window-filter picker at 1280x720 ─────────────

const VIEWPORT = { width: 1280, height: 720 };
const NO_RESULTS = /No se encontraron resultados|No results found/i;

/** Opens the top-bar search dropdown on `path` and returns its input. */
async function openPalette(page, path) {
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const input = page.getByTestId('global-search-input');
  await input.click();
  await expect(page.locator('[cmdk-dialog], [role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
  return input;
}

const overlaps = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x
  || a.y + a.height <= b.y || b.y + b.height <= a.y);

test.describe('CommandPalette window search and picker (1280x720)', () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await login(page);
    // Record search answers nothing, so every listed item is a window.
    await page.route('**/sws/neo/vectorsearch**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ matches: [] }),
    }));
  });

  test('"Configura" ranks Configuración Fiscal first and Enter opens it', async ({ page }) => {
    const input = await openPalette(page, '/dashboard');
    await input.fill('Configura');
    const firstGroup = page.getByTestId('CommandGroup__73263e').first();
    // A window whose own name matches ranks first, then the rest of the section whose name
    // matches (Organización, Secuencias de documentos, …), then windows that match only by
    // their source label ("Esquema contable", i.e. General Ledger Configuration). Before the
    // tiered ranking, menu order let the accounting section come first and Enter opened
    // /general-ledger-configuration; with sections first, it opened Organización.
    await expect(firstGroup.locator('h3')).toHaveText(/^Configuración$/, { timeout: 5_000 });
    const items = page.locator('[data-global-search-item="true"]');
    await expect(items.first()).toHaveText(/Configuración Fiscal/);
    await expect(items.nth(1)).toHaveText(/Organización/);
    await input.press('Enter');
    await expect(page).toHaveURL(/\/fiscal-config(?:$|[?#])/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/general-ledger-configuration/);
  });

  test('"albaran" finds Albarán regardless of the accent', async ({ page }) => {
    const input = await openPalette(page, '/dashboard');
    await input.fill('albaran');
    await expect(page.locator('[data-global-search-item="true"]').filter({ hasText: /Albarán/ }).first())
      .toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(NO_RESULTS)).toHaveCount(0);
  });

  test('a nonsense query shows the no-results text and lists no window', async ({ page }) => {
    const input = await openPalette(page, '/dashboard');
    await input.fill('qzxwvk');
    await expect(page.getByText(NO_RESULTS)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-global-search-item="true"]')).toHaveCount(0);
  });

  test('the picker stays inside the viewport and off its trigger with a short scope label', async ({ page }) => {
    await openPalette(page, '/product');
    await expect(page.getByTestId('vector-search-scope')).toContainText('Producto');
    const trigger = page.getByTestId('vector-search-target-picker-trigger');
    await trigger.click();
    const picker = page.getByTestId('vector-search-target-picker');
    await expect(picker).toBeVisible();
    await expect(page.getByTestId('vector-search-target-option').first()).toBeVisible();

    const pickerBox = await picker.boundingBox();
    const triggerBox = await trigger.boundingBox();
    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.y).toBeGreaterThanOrEqual(0);
    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(VIEWPORT.height);
    expect(overlaps(pickerBox, triggerBox), `picker ${JSON.stringify(pickerBox)} covers trigger ${JSON.stringify(triggerBox)}`)
      .toBe(false);
  });

  test('Esc with focus on the first checkbox closes only the picker; a second Esc closes the palette', async ({ page }) => {
    await openPalette(page, '/product');
    await page.getByTestId('vector-search-target-picker-trigger').click();
    const picker = page.getByTestId('vector-search-target-picker');
    await expect(picker).toBeVisible();
    // No pointer interaction inside the picker: opening it moves focus to the first checkbox.
    await expect(page.getByTestId('vector-search-target-option').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    // Give the deferred focusout handler its tick before checking the palette survived.
    await page.waitForTimeout(300);
    await expect(page.getByTestId('vector-search-scope-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vector-search-scope-panel')).toBeHidden();
  });

  test('focus leaving a picker checkbox for an element outside the palette closes the palette', async ({ page }) => {
    // The Esc exception (focusout from a picker that removed itself) must not widen to focus
    // leaving: moving it from a mounted checkbox to the sidebar closes everything. Radix keeps
    // Tab inside the picker, so this path is programmatic or assistive technology only.
    await openPalette(page, '/product');
    await page.getByTestId('vector-search-target-picker-trigger').click();
    await expect(page.getByTestId('vector-search-target-option').first()).toBeFocused();

    await page.getByTestId('sidebar-expand').focus();

    await expect(page.getByTestId('vector-search-target-picker')).toBeHidden();
    await expect(page.getByTestId('vector-search-scope-panel')).toBeHidden();
  });
  test('a click on a non-focusable area outside the palette closes it while a picker checkbox has focus', async ({ page }) => {
    // Review B1: the outside click dismisses the picker and drops focus on <body>, the same
    // place Esc leaves it. Unlike Esc, it is the user leaving and must close the palette.
    await openPalette(page, '/product');
    await page.getByTestId('vector-search-target-picker-trigger').click();
    await expect(page.getByTestId('vector-search-target-option').first()).toBeFocused();

    const scope = await page.getByTestId('vector-search-scope-panel').boundingBox();
    const picker = await page.getByTestId('vector-search-target-picker').boundingBox();
    const viewport = page.viewportSize();
    // A spot right of both layers, near the bottom of the page — not a focusable control.
    const x = Math.min(viewport.width - 5, Math.max(scope.x + scope.width, picker.x + picker.width) + 20);
    await page.mouse.click(x, viewport.height - 10);

    await expect(page.getByTestId('vector-search-target-picker')).toBeHidden();
    await expect(page.getByTestId('vector-search-scope-panel')).toBeHidden();
  });
});
