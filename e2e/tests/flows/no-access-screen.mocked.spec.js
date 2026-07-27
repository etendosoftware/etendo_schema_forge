import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * No-access blocking screen — smoke (mocked).
 *
 * Validates ETP-4514: a user whose role (or lack of one) grants zero
 * window/process access must see a blocking "no access" screen instead of
 * any menu or window content. AppLayout.jsx renders `NoAccessScreen` in
 * place of the sidebar/topbar/Outlet whenever `useRoleMenu()` resolves to a
 * confirmed, real empty `Set` — i.e. SFListMenu answered with an empty tree,
 * not still loading (`undefined`) and not the fail-open `null` case.
 *
 * Mock mode only: intercepts the SFListMenu webhook with an empty tree, so
 * `collectAllowedIds()` resolves to `new Set()` and the guard in
 * AppLayout.jsx fires.
 */

async function installEmptyMenuTreeMock(page) {
  // Registered BEFORE login(), same reasoning as role-filtered-sidebar.mocked.spec.js:
  // this URL never matches login()'s generic /sws/** catch-all, so there is no
  // LIFO ordering concern, but registering before navigation guarantees this
  // route is already active for the first SFListMenu fetch useRoleMenu() fires
  // right after the page mounts.
  await page.route('**/webhooks/SFListMenu**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tree: [], count: 0 }),
    });
  });
}

test.describe('No-access blocking screen', () => {
  test.beforeEach(async ({ page }) => {
    await installEmptyMenuTreeMock(page);
    await login(page);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('renders the blocking screen and hides the sidebar/topbar entirely', async ({ page }) => {
    await expect(page.getByTestId('NoAccessScreen__488148')).toBeVisible();

    // No AD-backed or non-AD-backed menu item should be reachable — the
    // guard replaces the whole AppLayoutInner (sidebar + topbar + Outlet),
    // not just the AD-backed part of the menu.
    await expect(page.locator('[data-testid^="menu-item-"]')).toHaveCount(0);
    await expect(page.getByTestId('topbar-user-menu')).toHaveCount(0);
  });

  test('blocks direct navigation to a known window route', async ({ page }) => {
    await page.goto('/sales-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The guard lives in AppLayout, above the route Outlet, so navigating
    // straight to a window URL still renders the blocking screen instead of
    // the window's list view.
    await expect(page.getByTestId('NoAccessScreen__488148')).toBeVisible();
    await expect(page.getByTestId('list-view')).toHaveCount(0);
  });
});
