import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Role-filtered sidebar — smoke (mocked).
 *
 * Validates ETP-4598: the sidebar filters menu.json-driven items down to what
 * SFListMenu reports the current role can reach. useRoleMenu() fetches
 * `${BASE}/webhooks/SFListMenu` once per authenticated session and
 * AppLayout.jsx passes the resulting allowed-id Set into
 * filterMenuGroupsByAccess() before rendering SideMenu.
 *
 * Mock mode only: intercepts the SFListMenu webhook with a tree that carries
 * only the "user" window's id (108, per tools/app-shell/src/menu.json), so
 * every other AD-window-backed item (e.g. "Purchase Order", windowId 181)
 * must disappear from the rendered sidebar.
 */

async function installMenuTreeMock(page) {
  // Registered BEFORE login() (unlike the /sws/** override pattern in the
  // e2e guide) because this URL never matches login()'s generic /sws/**
  // catch-all, so there is no LIFO ordering concern — but registering before
  // navigation guarantees this route is already active for the first
  // SFListMenu fetch useRoleMenu() fires right after the page mounts.
  await page.route('**/webhooks/SFListMenu**', async (route) => {
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
    await installMenuTreeMock(page);
    await login(page);
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
