// @covers tools/app-shell/src/menu.json
// @covers tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
// @covers tools/app-shell/src/windows/registry.js
// @covers artifacts/payment-term/decisions.json
// @covers tools/app-shell/src/pages/ReportViewerPage.jsx
import { test, expect } from '../../helpers/test.js';
import { login, installNonAdminCapabilities } from '../../helpers/auth.js';

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
 * ETP-6389 — Tesorería group: Cobro, Pago, Cuentas and Informes moved out of Finanzas, and
 *            Condiciones de pago out of Configuración
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
// IMPORTANT — why every test here navigates to `/document-sequence` first: in
// expanded mode the SideMenu only renders the sub-items of the OPEN group,
// and the open group is the one matching the current route
// (`findActiveGroup`). Asserting the absence of a `menu-item-*` testid from
// `/dashboard` is therefore VACUOUS — it passes whether or not the entry
// still exists in menu.json. `document-sequence` is a Settings sibling
// (windowId "112"), so landing on `/document-sequence` opens exactly the group
// the retired entry used to live in.
//
// Anchors that moved out of Settings, so they no longer open the right group:
// `tax`/`tax-category` (ETP-5146, to Finance) and `payment-term` (ETP-6389, to
// Tesorería). Re-check which group an anchor lives in before changing it.
// ---------------------------------------------------------------------------
test.describe('ETP-5068 — Conversion Rate Downloader Log retired from the menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'document-sequence');
    await page.goto('/document-sequence');
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

// ---------------------------------------------------------------------------
// ETP-6389 — Tesorería (Treasury) group
//
// Cobro (payment-in), Pago (payment-out), Cuentas (financial-account), an Informes link
// (report-viewer?category=treasury, the two aging reports) and Condiciones de pago (payment-term,
// last) form their own group, placed right before Finanzas. Neither Finanzas nor Configuración
// holds them any more. The mocked login() is an admin with every report
// grant, so the Informes link (`requiresGroupReport`) is visible.
//
// Same vacuity trap as the block above: in expanded mode only the OPEN groups render their
// items, so every assertion first lands on (or opens) the group it inspects, and the Finanzas
// absence check pins a sibling that must be present.
// ---------------------------------------------------------------------------
test.describe('Tesorería menu group', () => {
  const TREASURY_ITEMS = ['payment-in', 'payment-out', 'financial-account', 'report-viewer-treasury', 'payment-term'];

  /** The `menu-item-*` names rendered under one expanded group, in DOM order. */
  async function itemsOfGroup(page, groupSlug) {
    // The group header button sits in its own wrapper; the items are a sibling of that wrapper.
    const section = page.getByTestId(`menu-group-${groupSlug}`).locator('xpath=../..');
    return section.locator('[data-testid^="menu-item-"]')
      .evaluateAll((els) => els.map((el) => el.dataset.testid.replace(/^menu-item-/, '')));
  }

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/payment-in');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expandSidebar(page);
  });

  test('Tesorería is the group right before Finanzas', async ({ page }) => {
    await expect(page.getByTestId('menu-group-treasury')).toHaveText(/Tesorería|Treasury/);
    const groups = await page.locator('[data-testid^="menu-group-"]')
      .evaluateAll((els) => els.map((el) => el.dataset.testid));
    const treasury = groups.indexOf('menu-group-treasury');
    expect(treasury).toBeGreaterThanOrEqual(0);
    expect(groups.indexOf('menu-group-finance')).toBe(treasury + 1);
  });

  test('Tesorería lists Cobro, Pago, Cuentas, Informes and Condiciones de pago, in that order', async ({ page }) => {
    // /payment-in makes Tesorería the active group, which opens it.
    await expect(page.getByTestId('menu-group-treasury')).toHaveAttribute('aria-expanded', 'true');
    expect(await itemsOfGroup(page, 'treasury')).toEqual(TREASURY_ITEMS);
    await expect(page.getByTestId('menu-item-report-viewer-treasury'))
      .toHaveAttribute('href', '/report-viewer?category=treasury');
  });

  test('Finanzas no longer holds the Treasury entries', async ({ page }) => {
    await page.getByTestId('menu-group-finance').click();
    await expect(page.getByTestId('menu-group-finance')).toHaveAttribute('aria-expanded', 'true');
    const financeItems = await itemsOfGroup(page, 'finance');
    // Sanity: the group really is open and rendered (otherwise the absence below is vacuous).
    expect(financeItems).toContain('report-viewer-finance');
    for (const name of TREASURY_ITEMS) expect(financeItems, name).not.toContain(name);
  });

  test('Configuración no longer lists Condiciones de pago', async ({ page }) => {
    await page.getByTestId('menu-group-settings').click();
    await expect(page.getByTestId('menu-group-settings')).toHaveAttribute('aria-expanded', 'true');
    const settingsItems = await itemsOfGroup(page, 'settings');
    // Sanity: the group really is open and rendered (otherwise the absence below is vacuous).
    expect(settingsItems).toContain('document-sequence');
    expect(settingsItems).not.toContain('payment-term');
  });

  test('opening Cobro shows a Tesorería breadcrumb and highlights the Cobro entry', async ({ page }) => {
    await expect(page.getByTestId('topbar-breadcrumb').first()).toHaveText(/^\s*(Tesorería|Treasury)/);
    await expect(page.getByTestId('menu-item-payment-in')).toHaveClass(/ring-border-control/);
    await expect(page.getByTestId('menu-item-payment-out')).not.toHaveClass(/ring-border-control/);
  });

  test('opening Condiciones de pago shows a Tesorería breadcrumb and highlights its entry', async ({ page }) => {
    await page.goto('/payment-term');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('menu-group-treasury')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('topbar-breadcrumb').first()).toHaveText(/^\s*(Tesorería|Treasury)/);
    await expect(page.getByTestId('menu-item-payment-term')).toHaveClass(/ring-border-control/);
    await expect(page.getByTestId('menu-item-payment-in')).not.toHaveClass(/ring-border-control/);
  });
});

// ---------------------------------------------------------------------------
// ETP-6389 — a legacy aging-report link (from before the aging reports moved to Tesorería)
//
// `report-viewer?category=finance&report=aging-receivable` is re-pointed to category=treasury with a
// history REPLACE: the breadcrumb and the highlighted menu entry say Tesorería › Informes, Back goes
// to the page before the link (never back to the legacy URL, which would bounce again), Forward
// returns to the treasury URL, and a reload keeps all of it.
// ---------------------------------------------------------------------------
test.describe('Legacy aging-report link opens under Tesorería', () => {
  const LEGACY = '/report-viewer?category=finance&report=aging-receivable';
  const TREASURY_URL = /\/report-viewer\?(?=.*category=treasury)(?=.*report=aging-receivable)/;
  const ACTIVE = /ring-border-control/;
  const idle = (page) => page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  async function expectTreasuryReportView(page) {
    await expect(page).toHaveURL(TREASURY_URL);
    await expect(page).not.toHaveURL(/category=finance/);
    await expect(page.getByTestId('topbar-breadcrumb').first())
      .toHaveText(/^\s*(Tesorería|Treasury)[\s\S]*(Informes|Reports)/);
    await expandSidebar(page);
    await expect(page.getByTestId('menu-item-report-viewer-treasury')).toHaveClass(ACTIVE);
    // Finanzas › Informes is not highlighted (it is not even rendered while Finanzas is closed).
    const finance = page.getByTestId('menu-item-report-viewer-finance');
    if (await finance.count()) await expect(finance).not.toHaveClass(ACTIVE);
  }

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await idle(page);
  });

  test('is rewritten to category=treasury with the Tesorería breadcrumb and menu highlight', async ({ page }) => {
    await page.goto(LEGACY);
    await idle(page);
    await expectTreasuryReportView(page);
  });

  test('Back returns to the previous page and Forward to the treasury URL', async ({ page }) => {
    await page.goto(LEGACY);
    await idle(page);
    await expect(page).toHaveURL(TREASURY_URL);

    await page.goBack();
    await idle(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goForward();
    await idle(page);
    await expect(page).toHaveURL(TREASURY_URL);
  });

  test('a reload keeps the treasury URL, breadcrumb and highlight', async ({ page }) => {
    await page.goto(LEGACY);
    await idle(page);
    await expect(page).toHaveURL(TREASURY_URL);
    await page.reload();
    await idle(page);
    await expectTreasuryReportView(page);
  });
});

// ---------------------------------------------------------------------------
// ETP-6389 — Tesorería › Informes for a NON-admin role
//
// The Informes link is `requiresGroupReport`: it needs a grant on one of the group's own reports
// (the two aging reports); full window access alone does not reveal it. `installNonAdminCapabilities`
// drops the admin bypass (every window stays "full"), and the init script below answers
// `/sws/neo/myreportaccess` with the grants under test. listmenu stays unmocked (login() aborts it),
// so the window entries are not filtered by role membership.
// ---------------------------------------------------------------------------
test.describe('Tesorería › Informes for a non-admin role', () => {
  async function installReportAccess(page, reportAccess) {
    await page.addInitScript((grants) => {
      const previousFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (url && url.includes('/sws/neo/myreportaccess')) {
          const body = { reportAccess: grants };
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(body)),
            json: () => Promise.resolve(body),
          });
        }
        return previousFetch(input, init);
      };
    }, reportAccess);
  }

  async function openTreasury(page, reportAccess) {
    await login(page);
    await installNonAdminCapabilities(page);
    await installReportAccess(page, reportAccess);
    await page.goto('/payment-in');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expandSidebar(page);
    await expect(page.getByTestId('menu-group-treasury')).toHaveAttribute('aria-expanded', 'true');
  }

  test('without an aging grant: Cobro, Pago and Cuentas are listed, Informes is not', async ({ page }) => {
    await openTreasury(page, { 'tax-report': 'full' });
    for (const name of ['payment-in', 'payment-out', 'financial-account']) {
      await expect(page.getByTestId(`menu-item-${name}`), name).toBeVisible();
    }
    await expect(page.getByTestId('menu-item-report-viewer-treasury')).toHaveCount(0);
  });

  test('with a single aging grant: Informes is listed', async ({ page }) => {
    await openTreasury(page, { 'aging-payable': 'read-only' });
    await expect(page.getByTestId('menu-item-payment-in')).toBeVisible();
    await expect(page.getByTestId('menu-item-report-viewer-treasury')).toBeVisible();
  });
});
