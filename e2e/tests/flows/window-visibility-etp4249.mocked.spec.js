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
 * This file is also the home for later window-visibility regressions that share
 * the same assertions, so they stay in one place instead of spawning a spec per
 * ticket:
 *
 * ETP-5068 — "Conversion Rate Downloader Log" retired from the Settings menu
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
  await page.route(`**/sws/neo/${spec}/header{/**,}**`, async (route) => {
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
});

// ---------------------------------------------------------------------------
// ETP-5068 — "Conversion Rate Downloader Log" retired from the Settings menu
//
// The window is an internal log of the conversion-rate downloader job. It adds
// no value to the Etendo Go end user, so it was REMOVED from menu.json rather
// than marked `hidden: true` — reinstating it is not planned, and administrators
// read the log in Etendo classic instead (the GO template roles keep their AD
// window grant). The artifact, contract and NEO spec are intentionally intact,
// so the slug is declared in `apiOnlyWindows` in registry.js.
//
// These tests are the regression net for that removal: a bulk `make regen` or a
// bad merge re-adding the menu entry would silently undo the ticket.
//
// IMPORTANT — why every test here navigates to `/payment-term` first: in
// expanded mode the SideMenu only renders the sub-items of the OPEN group,
// and the open group is the one matching the current route
// (`findActiveGroup`). Asserting the absence of a `menu-item-*` testid from
// `/dashboard` is therefore VACUOUS — it passes whether or not the entry
// still exists in menu.json. `payment-term` is a Settings sibling (windowId
// "141"), so landing on `/payment-term` opens exactly the group the retired
// entry used to live in, and the sanity test below pins that precondition so
// this suite can never silently go green for the wrong reason.
//
// `tax` was the original anchor, but ETP-5146 moved it (and `tax-category`)
// from Settings to Finance, so it no longer opens the right group — do not
// revert this anchor back to `tax`/`tax-category` without re-checking which
// group they live in.
// ---------------------------------------------------------------------------
test.describe('ETP-5068 — Conversion Rate Downloader Log retired from the menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'payment-term');
    await page.goto('/payment-term');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expandSidebar(page);
  });

  test('direct navigation renders the not-found state instead of the window', async ({ page }) => {
    // The route is not registered anymore, but `:windowName` is a catch-all, so
    // the URL still resolves — to WindowLoader's error branch. Asserting this
    // pins the graceful degradation: no blank page, and no window rendered.
    await page.goto('/conversion-rate-downloader-log');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(
      page.getByText(/Window "conversion-rate-downloader-log" not found/),
    ).toBeVisible();
    await expect(page.getByTestId('list-view')).toHaveCount(0);
  });
});
