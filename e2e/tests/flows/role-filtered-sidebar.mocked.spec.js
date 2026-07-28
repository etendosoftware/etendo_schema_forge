import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Role-filtered sidebar — smoke (mocked).
 *
 * Validates ETP-4598: the sidebar filters menu.json-driven items down to what
 * SFListMenu reports the current role can reach. useRoleMenu() fetches
 * `${BASE}/sws/neo/listmenu` (ETP-4513 — moved off the Webhooks module's
 * `/webhooks/SFListMenu`, which required a per-role grant row wiped by
 * `update.database`, onto NEO Headless's own JWT-authenticated bridge) once
 * per authenticated session, and AppLayout.jsx passes the resulting
 * allowed-id Set into filterMenuGroupsByAccess() before rendering SideMenu.
 *
 * Mock mode only: intercepts the listmenu endpoint with a tree that carries
 * only the "user" window's id (108, per tools/app-shell/src/menu.json), so
 * every other AD-window-backed item (e.g. "Purchase Order", windowId 181)
 * must disappear from the rendered sidebar.
 */

async function installMenuTreeMock(page) {
  // Registered AFTER login() — unlike the old `/webhooks/SFListMenu` path,
  // `/sws/neo/listmenu` DOES match login()'s generic page.route('**/sws/**')
  // catch-all, and Playwright matches routes in reverse registration order,
  // so this needs to be registered later to win. See the `page.reload()` in
  // beforeEach below for why the initial useRoleMenu() fetch (fired during
  // login()'s own page.goto('/dashboard'), before this route exists) needs a
  // fresh navigation to actually observe this mock.
  await page.route('**/sws/neo/listmenu**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tree: [
          { name: 'User', label: 'User', windowId: '108' },
        ],
        count: 1,
      }),
    });
  });
}

test.describe('Role-filtered sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMenuTreeMock(page);
    // useRoleMenu()'s effect only depends on `isAuthenticated`, so it already
    // fired (and was served by login()'s generic /sws/** catch-all) during
    // login()'s own navigation. Reload to force a fresh mount/fetch that this
    // now-registered, higher-priority route is active for.
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('shows the allowed "User" menu item', async ({ page }) => {
    // The "user" window (windowId 108) lives in the Settings group alongside
    // items that carry no windowId (smart-scan, oauth2-clients, fiscal-config
    // — never filtered per filterMenuGroupsByAccess), so Settings still holds
    // more than one visible item after filtering and renders as a hover
    // popover rather than a direct link. Hover the group trigger to reveal it.
    // The trigger has no dedicated data-testid (aria-label only, translated
    // group name); mock mode defaults to es_ES per docs/e2e-testing-guide.md.
    const settingsTrigger = page.getByRole('button', { name: /configuraci[oó]n|settings/i });
    await settingsTrigger.hover();
    await expect(page.getByTestId('menu-item-user')).toBeVisible();
  });

  test('hides menu items not present in the SFListMenu tree', async ({ page }) => {
    await expect(page.getByTestId('menu-item-purchase-order')).toHaveCount(0);
  });
});
