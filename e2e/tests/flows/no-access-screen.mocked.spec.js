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
 * Mock mode only: intercepts `/sws/neo/listmenu` (ETP-4513 — moved off the
 * Webhooks module's `/webhooks/SFListMenu`, see menuTree.js and auth.js) with
 * an empty tree, so `collectAllowedIds()` resolves to `new Set()` and the
 * guard in AppLayout.jsx fires.
 */

async function installEmptyMenuTreeMock(page) {
  // Registered AFTER login() — login()'s own generic /sws/** catch-all
  // explicitly aborts /sws/neo/listmenu (to reproduce the real "webhook
  // unreachable" fail-open fallback that most other suites rely on), and
  // Playwright matches routes in reverse registration order, so this route
  // must be registered later to win over that abort. See the page.reload()
  // below for why the initial useRoleMenu() fetch (fired during login()'s own
  // page.goto('/dashboard'), before this route exists) needs a fresh
  // navigation to actually observe this mock.
  await page.route('**/sws/neo/listmenu{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tree: [], count: 0 }),
    });
  });
}

test.describe('No-access blocking screen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installEmptyMenuTreeMock(page);
    // useRoleMenu()'s effect only depends on `isAuthenticated`, so it already
    // fired (and was aborted by login()'s generic /sws/** catch-all) during
    // login()'s own navigation. Reload to force a fresh mount/fetch that this
    // now-registered, higher-priority route is active for.
    //
    // Wait for the actual mocked response, not just `networkidle` — proves
    // the post-reload useRoleMenu() fetch really landed on our route and got
    // the empty-tree body, instead of assuming it from an idle heuristic. If
    // this ever times out, the failure points straight at the route/reload
    // wiring instead of surfacing later as a confusing "NoAccessScreen not
    // found" (the guard needs a resolved, real empty Set — see AppLayout.jsx —
    // so any request that errors/aborts here falls into useRoleMenu()'s
    // fail-open `null` branch and never renders the blocking screen at all).
    const listMenuResponse = page.waitForResponse(
      (res) => res.url().includes('/sws/neo/listmenu') && res.status() === 200,
      { timeout: 10_000 },
    );
    await page.reload();
    await listMenuResponse;
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
