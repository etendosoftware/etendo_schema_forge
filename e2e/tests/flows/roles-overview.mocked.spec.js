import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Roles Overview — Configuración > Roles (ETP-4907 redesign, mocked).
 *
 * ETP-4907 redesigned this screen from a plain role list (ETP-4513) into:
 * 5 role summary cards (`RoleSummaryCard.jsx` — icon, name, user-count badge,
 * window count) followed by a full category-grouped window x role access
 * matrix (`RolesAccessMatrix.jsx`), each cell tri-state (full / read-only /
 * none) via `AccessTierPill.jsx`. Data comes from `useRolesOverviewData()`
 * (`tools/app-shell/src/pages/roles/useRolesOverviewData.js`), which still
 * calls the real `GET /sws/neo/rolesoverview` (`lib/rolesApi.js`'s
 * `fetchRolesOverview()`, unchanged since ETP-4513 — NEO Headless's own
 * JWT-authenticated bridge, not the Webhooks module's `/webhooks/*` grant
 * table wiped by `update.database`) but adapts the ETP-4907-extended response
 * (`roles[].windowCount`/`roleSource`, plus a brand-new top-level `matrix`)
 * into this page's card/matrix shape.
 *
 * The menu-gating layer (`isAdminOrClientAdmin` capability from
 * `SFWindowAccessMap`, `menu-item-roles` testid, `/roles` route) was NOT
 * touched by ETP-4907 — only the page's internal content changed — so those
 * tests are carried over unchanged from the ETP-4513 spec.
 *
 * Mock mode only: this spec installs its own route/fetch overrides on top of
 * what `login()` seeds, so it does not need a backend. It follows
 * `row-quick-actions.mocked.spec.js` for the overall mocked list/detail shape
 * and keeps its own inline `page.route()` fixture (rather than delegating to
 * `lib/mockFetch.js`'s `handleRolesOverviewRequest()`) for full control over
 * exact test data — matching this spec's own pre-existing convention, and
 * consistent with the guide's `VITE_MOCK=true` gotcha (that mock-mode wiring
 * bypasses `page.route()` entirely, so it's not a substitute here).
 */

// Deliberately NOT already in the canonical display order (Admin, Sales,
// Purchasing, Finance, Inventory — see `ROLE_ORDER` in
// `useRolesOverviewData.js`). The backend's own fixed-name order is
// Finance/Sales/Purchasing/Inventory (Admin wherever it naturally falls) per
// that module's `sortByRoleOrder` JSDoc, so scrambling it here actually
// exercises the client-side re-sort instead of passing by coincidence.
const ROLE_IDS = {
  finance: 'e2e-role-finance',
  purchasing: 'e2e-role-purchasing',
  admin: 'e2e-role-admin',
  inventory: 'e2e-role-inventory',
  sales: 'e2e-role-sales',
};

const ROLE_BOILERPLATE_DESCRIPTION = '*** Please, do not edit this role. Use Copy Record instead ***';

const ROLES_FIXTURE = [
  {
    id: ROLE_IDS.finance,
    name: 'Finance',
    rawDescription: ROLE_BOILERPLATE_DESCRIPTION,
    isClientAdmin: false,
    roleSource: 'tenant',
    userCount: 2,
    windowCount: 27,
    windows: [],
  },
  {
    id: ROLE_IDS.purchasing,
    name: 'Purchasing',
    rawDescription: ROLE_BOILERPLATE_DESCRIPTION,
    isClientAdmin: false,
    roleSource: 'systemTemplate',
    userCount: 1,
    windowCount: 11,
    windows: [],
  },
  {
    id: ROLE_IDS.admin,
    name: 'GOClient Admin',
    rawDescription: 'GOClient Admin',
    isClientAdmin: true,
    roleSource: 'tenant',
    userCount: 2,
    windowCount: 48,
    windows: [],
  },
  {
    id: ROLE_IDS.inventory,
    name: 'Inventory',
    rawDescription: ROLE_BOILERPLATE_DESCRIPTION,
    isClientAdmin: false,
    roleSource: 'tenant',
    userCount: 0,
    windowCount: 13,
    windows: [],
  },
  {
    id: ROLE_IDS.sales,
    name: 'Sales',
    rawDescription: ROLE_BOILERPLATE_DESCRIPTION,
    isClientAdmin: false,
    roleSource: 'tenant',
    userCount: 3,
    windowCount: 13,
    windows: [],
  },
];

// The canonical ETP-4907 display order — see `ROLE_ORDER`/`sortByRoleOrder`
// in `useRolesOverviewData.js`. `RoleSummaryCard.jsx` prefixes its root
// `Card`'s data-testid with `RoleSummaryCard__`, so the DOM order of these
// ids is a direct, un-guessable proxy for the sort the frontend applied.
const EXPECTED_CARD_ORDER = [
  `RoleSummaryCard__${ROLE_IDS.admin}`,
  `RoleSummaryCard__${ROLE_IDS.sales}`,
  `RoleSummaryCard__${ROLE_IDS.purchasing}`,
  `RoleSummaryCard__${ROLE_IDS.finance}`,
  `RoleSummaryCard__${ROLE_IDS.inventory}`,
];

// `matrix.categories[].windows[].access` is keyed by the SAME role ids as
// `roles[].id` (see `useRolesOverviewData.js`'s file-level JSDoc) — real
// tier values are hyphenated (`'read-only'`), normalized client-side to
// `'readOnly'` by `normalizeTier()`. One row below deliberately exercises all
// 3 states across its 5 role columns (full / full / none / read-only / none)
// so the tri-state cell rendering is proven, not just the happy path.
const MATRIX_FIXTURE = {
  categories: [
    {
      name: 'Sales',
      windows: [
        {
          id: 'e2e-window-sales-order',
          name: 'Sales Order',
          access: {
            [ROLE_IDS.admin]: 'full',
            [ROLE_IDS.sales]: 'full',
            [ROLE_IDS.purchasing]: 'none',
            [ROLE_IDS.finance]: 'read-only',
            [ROLE_IDS.inventory]: 'none',
          },
        },
      ],
    },
    {
      name: 'Inventory',
      windows: [
        {
          id: 'e2e-window-warehouse',
          name: 'Warehouse and Storage Bins',
          access: {
            [ROLE_IDS.admin]: 'full',
            [ROLE_IDS.sales]: 'none',
            [ROLE_IDS.purchasing]: 'none',
            [ROLE_IDS.finance]: 'none',
            [ROLE_IDS.inventory]: 'read-only',
          },
        },
      ],
    },
  ],
};

// `GENERAL_ROWS` in `RolesAccessMatrix.jsx` — 3 hardcoded rows (Inicio/
// Favoritos/Copilot) always overlaid ahead of the real `matrix.categories`,
// always full access for every role. Never present in a real backend
// response — this is a pure client-side constant, asserted against directly.
const GENERAL_ROW_IDS = ['dashboard', 'favorites', 'copilot'];

/**
 * `fetchRolesOverview()` (`lib/rolesApi.js`) does: parse JSON, then if
 * `Array.isArray(data.roles)` return `data` as-is — so a plain
 * `{ roles, matrix }` body (no `{ result: "<json-string>" }` wrapping) is a
 * valid, real code path, not a test-only shortcut.
 */
async function installRolesOverviewMock(page) {
  // The real endpoint (`NEO_BASE + '/rolesoverview'`) never receives a
  // sub-path or query string, so a single glued `**` is sufficient — no
  // brace-alternation needed here (see the e2e guide's gotcha on `{/**,}**`
  // silently degrading for multi-segment sub-paths; this endpoint has none).
  await page.route('**/sws/neo/rolesoverview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ roles: ROLES_FIXTURE, matrix: MATRIX_FIXTURE }),
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
      if (url && url.includes('/sws/neo/windowaccessmap')) {
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

  test('renders all 5 role summary cards in the canonical Admin/Sales/Purchasing/Finance/Inventory order', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('RolesOverviewPage__content')).toBeVisible();

    for (const role of ROLES_FIXTURE) {
      const card = page.getByTestId(`RoleSummaryCard__${role.id}`);
      await expect(card).toBeVisible();
      await expect(page.getByTestId(`RoleSummaryCard__content-${role.id}`)).toBeVisible();
      await expect(page.getByTestId(`RoleSummaryCard__userCount-${role.id}`)).toContainText(String(role.userCount));
      // ETP-4999 — the window-count badge/icon was removed from the card
      // entirely (Figma spec); `RoleSummaryCard__windowsIcon-*`/
      // `RoleSummaryCard__windowCount-*` no longer exist in the DOM at all, so
      // the assertions that used to check them here are gone (the fixture
      // still carries `role.windowCount`, unused by this component now).
    }

    // Real DOM order of the card grid's direct children — a direct proxy for
    // `sortByRoleOrder()` having actually run, since the fixture above is
    // deliberately scrambled.
    const renderedOrder = await page
      .locator('[data-testid="RolesOverviewPage__cards"] > [data-testid^="RoleSummaryCard__"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
    expect(renderedOrder).toEqual(EXPECTED_CARD_ORDER);

    // The raw AD_Role boilerplate text must never surface as display copy —
    // only the curated i18n role names render.
    await expect(page.locator('body')).not.toContainText('Please, do not edit this role');
  });

  test('exposes no edit/create/delete affordance anywhere on the page', async ({ page }) => {
    // These 5 roles are product-defined, not editable by any tenant user
    // (2026-07-27 decision — only future user-created roles, out of scope
    // for now, will ever be editable here). ETP-4907's redesign carries this
    // forward: neither the cards nor the matrix expose any edit/create/
    // delete affordance — scope the search to the page's own content so a
    // false positive from unrelated global chrome (topbar, user menu) can't
    // slip through.
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const content = page.getByTestId('RolesOverviewPage__content');
    await expect(content).toBeVisible();

    await expect(content.locator('[data-testid*="edit" i]')).toHaveCount(0);
    await expect(content.locator('[data-testid*="delete" i]')).toHaveCount(0);
    await expect(content.locator('[data-testid*="create" i]')).toHaveCount(0);
    await expect(content.getByRole('button', { name: /new|nuevo/i })).toHaveCount(0);
  });

  test('matrix General section always shows full access for every role', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('RolesAccessMatrix')).toBeVisible();
    await expect(page.getByTestId('RolesAccessMatrix__category-General')).toBeVisible();

    for (const rowId of GENERAL_ROW_IDS) {
      const rowKey = `General::${rowId}`;
      await expect(page.getByTestId(`RolesAccessMatrix__row-${rowKey}`)).toBeVisible();
      for (const role of ROLES_FIXTURE) {
        const cell = page.getByTestId(`RolesAccessMatrix__cell-${rowKey}-${role.id}`);
        // AccessTierPill renders the literal '✓' glyph for 'full' — not an
        // i18n string, so safe to assert exactly across both locales.
        await expect(cell).toHaveText('✓');
      }
    }
  });

  test('matrix renders real categories with correct per-role tri-state access cells', async ({ page }) => {
    await page.goto('/roles');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('RolesAccessMatrix__headerIcon-' + ROLE_IDS.admin)).toBeVisible();

    const salesCategory = MATRIX_FIXTURE.categories[0];
    const salesWindow = salesCategory.windows[0];
    const salesRowKey = `${salesCategory.name}::${salesWindow.id}`;

    await expect(page.getByTestId(`RolesAccessMatrix__category-${salesCategory.name}`)).toBeVisible();
    await expect(page.getByTestId(`RolesAccessMatrix__row-${salesRowKey}`)).toBeVisible();

    // full → literal '✓' glyph
    await expect(page.getByTestId(`RolesAccessMatrix__cell-${salesRowKey}-${ROLE_IDS.admin}`)).toHaveText('✓');
    await expect(page.getByTestId(`RolesAccessMatrix__cell-${salesRowKey}-${ROLE_IDS.sales}`)).toHaveText('✓');

    // none → literal '—' glyph
    await expect(page.getByTestId(`RolesAccessMatrix__cell-${salesRowKey}-${ROLE_IDS.purchasing}`)).toHaveText('—');
    await expect(page.getByTestId(`RolesAccessMatrix__cell-${salesRowKey}-${ROLE_IDS.inventory}`)).toHaveText('—');

    // read-only (normalized from the backend's hyphenated 'read-only' to
    // 'readOnly') → an i18n string, neither of the other two glyphs and
    // non-empty. Avoids hardcoding the locale-specific rendered text while
    // still proving the tri-state (not just full/none) actually renders.
    const readOnlyCell = page.getByTestId(`RolesAccessMatrix__cell-${salesRowKey}-${ROLE_IDS.finance}`);
    await expect(readOnlyCell).toBeVisible();
    const readOnlyText = (await readOnlyCell.textContent())?.trim();
    expect(readOnlyText).not.toBe('✓');
    expect(readOnlyText).not.toBe('—');
    expect(readOnlyText).toBeTruthy();
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

  // NOTE (QA, ETP-4513, carried over unchanged by ETP-4907): a "direct
  // navigation to /roles as a denied non-admin" deep-link test was attempted
  // here and deliberately removed — see the original QA report for why. In
  // short: `mockFetch.js`'s `handleRolesOverviewRequest()` is checked
  // unconditionally, ahead of any capability logic (unlike the real
  // `SFRolesOverview.java`, which does branch on the caller's admin status),
  // so it always serves the fixed 5-role fixture no matter what a test
  // overrides via `page.route()` or an `addInitScript`-wrapped
  // `window.fetch` — neither technique can win against it once `App.jsx`'s
  // async mock-install effect has replaced `window.fetch` (which, for a
  // fetch fired well after page load like `RolesOverviewPage`'s mount-time
  // call, it reliably has by then). The real backend enforcement is proven
  // instead by
  // `SFRolesOverviewTest#testCallerIsAGoClientRoleButNotAdminIsStillDenied`
  // (JUnit), and the frontend's handling of an empty `roles` array is proven
  // by `RolesOverviewPage.vitest.jsx`'s "shows the no-access card when cards
  // resolves to an empty array" test — both already cover this scenario's
  // two halves individually. Wiring them together in a mocked E2E spec would
  // need `handleRolesOverviewRequest()` to gain the same kind of admin-gate
  // `handleWindowAccessMapRequest()` already has (a follow-up for whoever
  // owns `mockFetch.js`, not a QA fix).
});
