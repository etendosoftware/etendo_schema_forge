import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Window visibility smoke tests — ETP-4249.
 *
 * Validates that windows removed/added in this branch are reflected correctly
 * in the navigation menu and are accessible (or inaccessible) at their routes.
 *
 * TC-33 — "Combinación de cuentas" absent from menu
 * TC-34 — "Categoría de Libro Mayor" absent from menu
 * TC-35 — Tax Category window is accessible (partial)
 * TC-37 — Existing Tax Rate window unaffected by this PR
 *
 * All specs run in mock mode (no real Etendo backend required).
 */

/**
 * Install a minimal list-endpoint mock for the given spec so the ListView
 * renders without a real backend. Must be called AFTER login() — Playwright
 * matches routes in reverse registration order; specific routes beat the
 * generic /sws/** catch-all installed by login().
 */
async function installListMock(page, spec) {
  await page.route(`**/sws/neo/${spec}/header**`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
      return;
    }
    route.fallback();
  });
}

/**
 * Expand the sidebar so that all menu-item-{slug} elements are in the DOM.
 *
 * In collapsed mode the SideMenu renders only group icons. Sub-item NavLinks
 * (which carry data-testid="menu-item-*") are rendered inside a Radix Popover
 * that mounts on hover — they are not in the DOM until the popover opens. In
 * expanded mode every item is always rendered, so assertions on individual
 * menu items work reliably.
 *
 * The toggle button aria-label is translated via useUI('expandMenu'):
 *   en_US → "Expand menu"
 *   es_ES → "Expandir menú"
 */
async function expandSidebar(page) {
  // Only click if the sidebar is currently collapsed (expand button present).
  const expandBtn = page.getByRole('button', { name: /Expand menu|Expandir menú/i });
  if (await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expandBtn.click();
    // Wait for the CSS width transition (200ms) to settle.
    await page.waitForTimeout(400);
  }
}

// ---------------------------------------------------------------------------
// TC-33 — "Combinación de cuentas" absent from menu
// ---------------------------------------------------------------------------
test.describe('TC-33 — Account Combination absent from menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expandSidebar(page);
  });

  test('no menu item for account-combination exists in the DOM', async ({ page }) => {
    // The SideMenu emits data-testid="menu-item-{name}" for every item in menu.json.
    // account-combination was never added to menu.json for ETP-4249, so the
    // element must not be present in the rendered navigation.
    await expect(page.getByTestId('menu-item-account-combination')).toHaveCount(0);
  });

  test('no menu item for combinacion-de-cuentas exists in the DOM', async ({ page }) => {
    // Guard against a hypothetical Spanish-slug variant.
    await expect(page.getByTestId('menu-item-combinacion-de-cuentas')).toHaveCount(0);
  });

  test('no anchor href contains "combination" path segment', async ({ page }) => {
    // Belt-and-suspenders: assert no <a> in the sidebar points at any
    // combination-related route, regardless of testid naming.
    const combinationLinks = page.locator('nav a[href*="combination"]');
    await expect(combinationLinks).toHaveCount(0);
  });

  test('no anchor href contains "combinacion" path segment', async ({ page }) => {
    const combinacionLinks = page.locator('nav a[href*="combinacion"]');
    await expect(combinacionLinks).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// TC-34 — "Categoría de Libro Mayor" absent from menu
// ---------------------------------------------------------------------------
test.describe('TC-34 — GL Category absent from menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expandSidebar(page);
  });

  test('no menu item for gl-category exists in the DOM', async ({ page }) => {
    // gl-category was intentionally excluded from menu.json — assert absence.
    await expect(page.getByTestId('menu-item-gl-category')).toHaveCount(0);
  });

  test('no menu item for libro-mayor exists in the DOM', async ({ page }) => {
    // Guard against a Spanish-slug variant.
    await expect(page.getByTestId('menu-item-libro-mayor')).toHaveCount(0);
  });

  test('no anchor href contains "gl-category" path segment', async ({ page }) => {
    const glCategoryLinks = page.locator('nav a[href*="gl-category"]');
    await expect(glCategoryLinks).toHaveCount(0);
  });

  test('no anchor href contains "gl_category" path segment', async ({ page }) => {
    const glCategoryLinks = page.locator('nav a[href*="gl_category"]');
    await expect(glCategoryLinks).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// TC-35 (partial) — Tax Category accessible
//
// TC-35 row 3 (role restriction) and TC-36 (API-level denial) are DEFERRED —
// no roles system in V1.
// ---------------------------------------------------------------------------
test.describe('TC-35 — Tax Category window accessible', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'tax-category');
    await page.goto('/tax-category');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('tax-category route renders the list view', async ({ page }) => {
    // The ListView component emits data-testid="list-view" on its container.
    await expect(page.getByTestId('list-view')).toBeVisible();
  });

  test('menu-item for tax-category is present in the navigation', async ({ page }) => {
    // tax-category is declared in menu.json (Settings group, windowId "138").
    // Expand the sidebar so sub-items are rendered in the DOM (collapsed mode
    // only renders group icons via a hover-triggered Popover).
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-tax-category')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// TC-37 — Existing "Tax Rate" window unaffected by this PR
// ---------------------------------------------------------------------------
test.describe('TC-37 — Tax Rate window unaffected', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'tax');
    await page.goto('/tax');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('tax route still renders the list view', async ({ page }) => {
    // The tax window predates ETP-4249. It must continue to render after this PR.
    await expect(page.getByTestId('list-view')).toBeVisible();
  });

  test('menu-item for tax is still present in the navigation', async ({ page }) => {
    // tax is declared in menu.json (Settings group, windowId "137").
    // Expand the sidebar so sub-items are rendered in the DOM.
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-tax')).toBeVisible();
  });
});
