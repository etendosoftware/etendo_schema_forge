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
    //
    // The item's own group ("Configuración") also has its own open/closed
    // state (see SideMenu.jsx's per-group `aria-expanded`/`isOpen`), which is
    // expected to auto-open for the active route — but that derivation runs
    // in a later effect than the sidebar-width expand above, so on a slower
    // CI runner the retry below (re-running expandSidebar, a no-op once the
    // sidebar is already expanded) gives that effect the extra ticks it needs
    // instead of asserting on whatever rendered within a single check.
    await expect(async () => {
      await expandSidebar(page);
      await expect(page.getByTestId('menu-item-tax-category')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 10_000 });
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
// IMPORTANT — why every test here navigates to `/tax` first: in expanded mode
// the SideMenu only renders the sub-items of the OPEN group, and the open group
// is the one matching the current route (`findActiveGroup`). Asserting the
// absence of a `menu-item-*` testid from `/dashboard` is therefore VACUOUS — it
// passes whether or not the entry still exists in menu.json. `tax` is a Settings
// sibling (windowId "137", already covered by TC-37), so landing on `/tax` opens
// exactly the group the retired entry used to live in, and the sanity test below
// pins that precondition so this suite can never silently go green for the wrong
// reason.
// ---------------------------------------------------------------------------
test.describe('ETP-5068 — Conversion Rate Downloader Log retired from the menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'tax');
    await page.goto('/tax');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expandSidebar(page);
  });

  test('precondition — the Settings group is open and renders its items', async ({ page }) => {
    // Guards the whole suite: if this fails, the absence assertions below prove
    // nothing and must be fixed rather than trusted.
    await expect(page.getByTestId('menu-item-tax')).toBeVisible();
    await expect(page.getByTestId('menu-item-fiscal-config')).toBeVisible();
  });

  test('no menu item for conversion-rate-downloader-log exists in the DOM', async ({ page }) => {
    // The SideMenu emits data-testid="menu-item-{name}" for every non-hidden
    // item of the open group. Settings is open (see precondition) and the entry
    // was deleted from menu.json, so the element must be absent.
    await expect(page.getByTestId('menu-item-fiscal-config')).toBeVisible();
    await expect(page.getByTestId('menu-item-conversion-rate-downloader-log')).toHaveCount(0);
  });

  test('no anchor href contains the "conversion-rate-downloader" path segment', async ({ page }) => {
    // Belt-and-suspenders: no sidebar link may point at the retired route,
    // whatever testid naming a future re-add might use. Retried like the
    // tax-category presence check above: the group's own open-state effect
    // can still be settling relative to the sidebar-width expand in
    // beforeEach, so a single read right after can land mid-render on a
    // slower runner.
    await expect(async () => {
      await expect(page.getByTestId('menu-item-fiscal-config')).toBeVisible({ timeout: 2_000 });
      await expect(page.locator('nav a[href*="conversion-rate-downloader"]')).toHaveCount(0);
    }).toPass({ timeout: 10_000 });
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

// ---------------------------------------------------------------------------
// ETP-5068 (companion) — "Conversion Rates" must NOT be collateral damage
//
// `conversion-rates` (Finance group, windowId "116") is the window users
// actually need, and its slug is a prefix-neighbour of the retired one — an
// over-broad deletion or a careless grep-and-remove would take it out too.
// ---------------------------------------------------------------------------
test.describe('ETP-5068 — Conversion Rates window unaffected', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'conversion-rates');
    await page.goto('/conversion-rates');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('conversion-rates route still renders the list view', async ({ page }) => {
    await expect(page.getByTestId('list-view')).toBeVisible();
  });

  test('menu-item for conversion-rates is still present in the navigation', async ({ page }) => {
    // Landing on /conversion-rates makes Finance the active (open) group, so its
    // sub-items are rendered — same mechanism as the Settings note above.
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-conversion-rates')).toBeVisible();
  });
});
