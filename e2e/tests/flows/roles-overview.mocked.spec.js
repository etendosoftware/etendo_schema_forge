import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Roles Overview — Configuración > Roles (ETP-4513, mocked).
 *
 * Validates the read-only "Configuración > Roles" page: the menu entry is
 * gated by the `isAdminOrClientAdmin` capability from `SFWindowAccessMap`
 * (see registry.js's `filterMenuGroupsByAccess` capability axis and
 * AppLayout.jsx's `useCapabilitiesSafe()` wiring), the page lists all 5 fixed
 * GOClient roles from `GET /webhooks/SFRolesOverview`, and Edit only ever
 * opens a "coming soon" notice — no create/delete UI anywhere.
 *
 * Mock mode only: this spec installs its own route/fetch overrides on top of
 * what `login()` seeds, so it does not need a backend. It follows the
 * `role-filtered-sidebar.mocked.spec.js` precedent for gating a menu entry
 * via a webhook-backed signal, and `row-quick-actions.mocked.spec.js` for the
 * overall list/dialog interaction shape.
 *
 * `login()`'s own addInitScript already stubs `/webhooks/SFWindowAccessMap`
 * with a Proxy that resolves every capability key to `true` (full access) —
 * see `e2e/tests/helpers/auth.js`. That covers the admin/client-admin
 * scenario below for free. The non-admin scenario needs to downgrade that
 * flag to `false`, which requires layering a SECOND `addInitScript` (see
 * `installNonAdminCapabilities()` below) rather than a `page.route()`
 * override — `SFWindowAccessMap` is short-circuited entirely inside
 * `window.fetch` before any request reaches the network layer that
 * `page.route()` operates on.
 */

const ROLES_FIXTURE = [
  {
    id: '9B8D736190724807AB256DC95F20EC5E',
    name: 'GOClient Admin',
    rawDescription: 'GOClient Admin',
    userCount: 2,
    windows: [
      { id: '108', name: 'User', tier: 'full' },
      { id: '146', name: 'Price List', tier: 'full' },
    ],
  },
  {
    id: '127AE77FE2994067B7FE6495FC21D51E',
    name: 'Finance',
    rawDescription: '*** Please, do not edit this role. Use Copy Record instead ***',
    userCount: 2,
    windows: [
      { id: 'w-fin-1', name: 'Financial Account', tier: 'full' },
      { id: 'w-fin-2', name: 'Sales Invoice', tier: 'read-only' },
    ],
  },
  {
    id: '2A159DF4F4B944A6AA903202AD35B545',
    name: 'Sales',
    rawDescription: '*** Please, do not edit this role. Use Copy Record instead ***',
    userCount: 1,
    windows: [{ id: 'w-sales-1', name: 'Sales Order', tier: 'full' }],
  },
  {
    id: 'A826430F723E4C1B9A53EBB0746A98C0',
    name: 'Purchasing',
    rawDescription: '*** Please, do not edit this role. Use Copy Record instead ***',
    userCount: 0,
    windows: [{ id: 'w-pur-1', name: 'Purchase Order', tier: 'full' }],
  },
  {
    id: '55E05A4B43514A029D6FB6B8D94B49D4',
    name: 'Inventory',
    rawDescription: '*** Please, do not edit this role. Use Copy Record instead ***',
    userCount: 0,
    windows: [{ id: 'w-inv-1', name: 'Warehouse and Storage Bins', tier: 'read-only' }],
  },
];

async function installRolesOverviewMock(page) {
  await page.route('**/webhooks/SFRolesOverview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ roles: ROLES_FIXTURE }),
    });
  });
}

/**
 * Downgrades the SFWindowAccessMap capabilities to a non-admin shape. Must be
 * registered AFTER login() so its addInitScript runs AFTER login's own
 * full-access override (Playwright runs addInitScripts in registration order
 * on every navigation) — it wraps the already-patched `window.fetch` and
 * overrides just this one path. Because it only takes effect on the NEXT
 * navigation, callers must follow this with a fresh `page.goto()`.
 */
async function installNonAdminCapabilities(page) {
  await page.addInitScript(() => {
    const adminFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && url.includes('/webhooks/SFWindowAccessMap')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            windowAccess: new Proxy({}, { get: () => 'full' }),
            capabilities: { showAccountingFields: false, isAdminOrClientAdmin: false },
          }),
        });
      }
      return adminFetch(input, init);
    };
  });
}

test.describe('Roles overview — admin/client-admin', () => {
  test.beforeEach(async ({ page }) => {
    // login()'s default mock already grants isAdminOrClientAdmin: true via
    // its full-access SFWindowAccessMap Proxy stub.
    await login(page);
    await installRolesOverviewMock(page);
  });

  test('sees the Roles menu entry and can navigate to it', async ({ page }) => {
    // The "Settings" group holds several items (price-list, user, roles,
    // smart-scan, ...), so — mirroring role-filtered-sidebar.mocked.spec.js —
    // it renders as a hover popover in the collapsed sidebar rather than a
    // direct link.
    const settingsTrigger = page.getByRole('button', { name: /configuraci[oó]n|settings/i });
    await settingsTrigger.hover();

    const rolesMenuItem = page.getByTestId('menu-item-roles');
    await expect(rolesMenuItem).toBeVisible();

    await rolesMenuItem.click();
    await expect(page).toHaveURL(/\/roles$/);
    await expect(page.getByTestId('RolesOverviewPage')).toBeVisible();
  });

  test('renders all 5 roles with real data-testid selectors (no hardcoded label-string assertions)', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    for (const role of ROLES_FIXTURE) {
      const card = page.getByTestId(`RolesOverviewPage__role-${role.id}`);
      await expect(card).toBeVisible();
      await expect(page.getByTestId(`RolesOverviewPage__userCount-${role.id}`)).toContainText(String(role.userCount));
      for (const w of role.windows) {
        await expect(page.getByTestId(`RolesOverviewPage__window-${role.id}-${w.id}`)).toBeVisible();
      }
    }

    // The raw AD_Role boilerplate text must never surface as display copy —
    // only the curated i18n descriptions render.
    await expect(page.locator('body')).not.toContainText('Please, do not edit this role');
  });

  test('clicking Edit shows the coming-soon notice without any create/delete UI', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const firstRole = ROLES_FIXTURE[0];
    const dialog = page.getByTestId('RolesOverviewPage__editDialog');
    await expect(dialog).toHaveCount(0);

    await page.getByTestId(`RolesOverviewPage__edit-${firstRole.id}`).click();
    await expect(dialog).toBeVisible();

    // No create/delete affordance anywhere on the page — this is a read-only
    // aggregate view (see decisions in docs/plans/2026-07-24-etp-4513-roles-overview.md).
    await expect(page.getByTestId(/delete/i)).toHaveCount(0);
    await expect(page.getByTestId(/create/i)).toHaveCount(0);
    await expect(page.getByTestId(/^RolesOverviewPage__new/i)).toHaveCount(0);

    await page.getByTestId('RolesOverviewPage__editDialogClose').click();
    await expect(dialog).toBeHidden();

    // Still on the roles list — no navigation happened as a side effect of Edit.
    await expect(page).toHaveURL(/\/roles$/);
  });
});

test.describe('Roles overview — non-admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installNonAdminCapabilities(page);
    await installRolesOverviewMock(page);
    // Re-navigate so BOTH addInitScripts re-run in registration order
    // (login()'s full-access stub, then this spec's downgrade on top of it).
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('does NOT see the Roles menu entry', async ({ page }) => {
    const settingsTrigger = page.getByRole('button', { name: /configuraci[oó]n|settings/i });
    await settingsTrigger.hover();
    await expect(page.getByTestId('menu-item-roles')).toHaveCount(0);
  });

  // NOTE (QA, ETP-4513): a "direct navigation to /roles as a denied non-admin" deep-link test
  // was attempted here and deliberately removed — see the QA report for why. In short:
  // `mockFetch.js`'s `handleRolesOverviewRequest()` is checked unconditionally, ahead of any
  // capability logic (unlike the real `SFRolesOverview.java`, which does branch on the caller's
  // admin status), so it always serves the fixed 5-role fixture no matter what a test overrides
  // via `page.route()` or an `addInitScript`-wrapped `window.fetch` — neither technique can win
  // against it once `App.jsx`'s async mock-install effect has replaced `window.fetch` (which, for
  // a fetch fired well after page load like `RolesOverviewPage`'s mount-time call, it reliably
  // has by then). The real backend enforcement is proven instead by
  // `SFRolesOverviewTest#testCallerIsAGoClientRoleButNotAdminIsStillDenied` (JUnit), and the
  // frontend's handling of an empty `roles` array is proven by
  // `RolesOverviewPage.vitest.jsx`'s "shows the no-access card when roles resolves to an empty
  // array" test — both already cover this scenario's two halves individually. Wiring them
  // together in a mocked E2E spec would need `handleRolesOverviewRequest()` to gain the same
  // kind of admin-gate `handleWindowAccessMapRequest()` already has (a follow-up for whoever
  // owns `mockFetch.js`, not a QA fix).
});
