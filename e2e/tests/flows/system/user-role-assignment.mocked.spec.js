import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Multi-role user assignment — smoke (mocked), ETP-4906.
 *
 * Covers the "User" window's role-composition surfaces:
 *   - `AssignTemplateRolesControl.jsx` (detail form headerExtra chip picker)
 *   - `UserRolesTab.jsx` ("Roles del usuario" live permission-matrix custom tab)
 *   - `RoleFilterControl.jsx` / `UserHeaderTable.jsx` (Users grid role filter + chips)
 *
 * Mock mode only: this spec installs window-specific routes on top of the generic
 * /sws/** mock that login() seeds, so it does not need a backend. See
 * `docs/e2e-testing-guide.md` and `row-quick-actions.mocked.spec.js` for the
 * conventions this mirrors.
 *
 * Endpoints mocked here are all plain `GET /sws/neo/<webhook>?...` calls (NOT the
 * `<spec>/<entity>` CRUD shape row-quick-actions.mocked.spec.js covers) — see
 * `lib/rolesApi.js`, `lib/userRoleAssignmentsApi.js`, `lib/menuTree.js` for the exact
 * URLs/response shapes each one expects.
 *
 * IMPORTANT — `AppLayout.jsx` calls `useRoleMenu()` (→ `GET /sws/neo/listmenu`) on
 * EVERY route, not just the User form. `login()`'s baseline `/sws/**` catch-all
 * `route.abort()`s that specific URL, which `useRoleMenu()` treats as "webhook
 * unreachable" → fail OPEN (unfiltered sidebar, no gate). The detail-form describe
 * block below overrides `listmenu` with a real (non-empty) tree so the sidebar gate lets
 * the User window through (it must include the User window, `108`) — a real-but-EMPTY tree
 * would instead resolve `allowedIds` to an empty `Set`, which `AppLayout` treats as "zero
 * window access" and renders a full-page "Sin acceso" block-screen instead of the app
 * (verified empirically while building this spec). Since ETP-5485 `UserRolesTab` no longer
 * reads this tree — its rows come from the `matrix` in the `systemroletemplates` /
 * `rolesoverview` mocks below. The grid describe block leaves `listmenu` unmocked and relies
 * on the same default fail-open behavior every other mocked spec in this repo assumes.
 */

const USER_ROW = { id: 'row-001', name: 'Test User', firstName: '', lastName: '', email: 'test.user@example.com', locked: false };

// Per-role `windows[]` only feeds the chip control / grid now; since ETP-5485 `UserRolesTab`'s
// rows and cells come from the `matrix` fixture further down (`MATRIX_ROWS`).
const ROLES = [
  { id: 'role-finance', name: 'Finance', isClientAdmin: false, windows: [{ id: '143', name: 'Pedido de venta', tier: 'full' }] },
  { id: 'role-sales', name: 'Sales', isClientAdmin: false, windows: [{ id: '143', name: 'Pedido de venta', tier: 'readOnly' }] },
  { id: 'role-purchasing', name: 'Purchasing', isClientAdmin: false, windows: [] },
  { id: 'role-inventory', name: 'Inventory', isClientAdmin: false, windows: [] },
  {
    id: 'role-admin',
    name: 'Admin',
    isClientAdmin: true,
    windows: [
      { id: '108', name: 'Usuario', tier: 'full' },
      { id: '143', name: 'Pedido de venta', tier: 'full' },
    ],
  },
];

// DEV wave 7 — `SFSystemRoleTemplates` (`GET /sws/neo/systemroletemplates`) resolves the 4
// FIXED template roles at the SYSTEM client (`ad_client_id='0'`) — no `userCount`, no
// client-admin row at all (there is none at system level, see its own class javadoc). This is
// the ONLY source `AssignTemplateRolesControl.jsx`/`UserRolesTab.jsx` use for the selectable
// template roles now (see `lib/rolesApi.js`'s `fetchTemplateRoles()` doc comment) — the
// tenant-scoped `rolesoverview` mock above is kept for its client-admin row (admin-holder
// detection, and the admin column's matrix), never for the composable template list itself.
const SYSTEM_TEMPLATE_ROLES = ROLES.filter((role) => !role.isClientAdmin);

// ETP-5485 — the backend `matrix` (built by `RoleAccessMatrix`, same shape for both
// endpoints) that `UserRolesTab` now renders its rows from. Includes the 2 ETP-5071 proxy
// rows the tab used to miss: "Modelos Fiscales" (window id `3E8F…`) and "Documentos no
// contabilizados" (process id `D6AB…`); the real menu.json places both under Finance.
const TAX_MODELS_PROXY_ID = '3E8FEA1EA7404D979306C9EE7FD2E7E8';
const NOT_POSTED_DOCS_PROXY_ID = 'D6AB95CE52D34E1599590526115E26C6';
const MATRIX_ROWS = [
  { category: 'General Setup', id: '108', name: 'User', access: { 'role-finance': 'none', 'role-sales': 'none', 'role-admin': 'full' } },
  { category: 'Sales Management', id: '143', name: 'Sales Order', access: { 'role-finance': 'full', 'role-sales': 'read-only', 'role-admin': 'full' } },
  { category: 'Financial Management', id: TAX_MODELS_PROXY_ID, name: 'Fiscal Models', access: { 'role-finance': 'full', 'role-sales': 'none', 'role-admin': 'full' } },
  { category: 'Other', id: NOT_POSTED_DOCS_PROXY_ID, name: 'Not Posted Documents', access: { 'role-finance': 'read-only', 'role-sales': 'none', 'role-admin': 'full' } },
];

/** Builds a backend `{categories: [{name, windows: [{id, name, access}]}]}` matrix, keeping only `roleIds`' access keys. */
function backendMatrix(roleIds) {
  const byCategory = new Map();
  for (const { category, id, name, access } of MATRIX_ROWS) {
    if (!byCategory.has(category)) byCategory.set(category, []);
    const scoped = Object.fromEntries(roleIds.map((roleId) => [roleId, access[roleId] ?? 'none']));
    byCategory.get(category).push({ id, name, access: scoped });
  }
  return { categories: [...byCategory.entries()].map(([name, windows]) => ({ name, windows })) };
}
const EMPTY_REPORTS_MATRIX = { categories: [] };

const MENU_TREE = {
  tree: [
    { type: 'folder', name: 'Configuracion', children: [{ windowId: '108', name: 'Usuario' }] },
    { type: 'folder', name: 'Comercial', children: [{ windowId: '143', name: 'Pedido de venta' }] },
  ],
  count: 2,
};

/**
 * Installs every route the User DETAIL FORM needs. Must run AFTER login() —
 * Playwright matches routes in reverse registration order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ savedRoleIds?: string[] }} [opts] - the role ids `SFUserRoleAssignments`
 *   single-user mode returns on load, simulating whatever was persisted by a prior
 *   (real) save.
 * @returns {{ assignCalls: {url: string, templateRoleIds: string[]}[], counts: Record<string, number> }}
 *   Mutable trackers the test body reads after interacting with the page.
 */
async function installUserDetailMocks(page, { savedRoleIds = [] } = {}) {
  const assignCalls = [];
  const counts = { rolesoverview: 0, systemroletemplates: 0, userroleassignments: 0, listmenu: 0, assignuserroles: 0 };

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/sws/neo/rolesoverview')) counts.rolesoverview++;
    else if (url.includes('/sws/neo/systemroletemplates')) counts.systemroletemplates++;
    else if (url.includes('/sws/neo/userroleassignments')) counts.userroleassignments++;
    else if (url.includes('/sws/neo/listmenu')) counts.listmenu++;
    else if (url.includes('/sws/neo/assignuserroles')) counts.assignuserroles++;
  });

  await page.route('**/sws/neo/rolesoverview**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roles: ROLES,
      matrix: backendMatrix(ROLES.map((role) => role.id)),
      reportsMatrix: EMPTY_REPORTS_MATRIX,
    }),
  }));

  // Missing this mock resolves to the generic `**/sws/**` catch-all's `{ data: [],
  // totalRows: 0 }` shape, which `fetchNeoWebhookRoles` (`lib/rolesApi.js`) rejects as
  // "returned an unexpected shape" (neither `.roles[]` nor `.result`) — every surface that
  // calls `fetchTemplateRoles()` (`AssignTemplateRolesControl`, `UserRolesTab`,
  // `RoleChipsCell`'s `useUserRoleGridData`) then renders its own empty/error state instead
  // of the real template roles, which is exactly what this spec was failing on before this
  // route was added.
  //
  // ETP-5485 — only `UserRolesTab` asks for `?includeMatrix=true`; the other callers get the
  // default roles-only shape, exactly like the real backend.
  await page.route('**/sws/neo/systemroletemplates**', (route) => {
    const includeMatrix = new URL(route.request().url()).searchParams.get('includeMatrix') === 'true';
    const body = includeMatrix
      ? {
        roles: SYSTEM_TEMPLATE_ROLES,
        matrix: backendMatrix(SYSTEM_TEMPLATE_ROLES.map((role) => role.id)),
        reportsMatrix: EMPTY_REPORTS_MATRIX,
      }
      : { roles: SYSTEM_TEMPLATE_ROLES };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.route('**/sws/neo/userroleassignments**', (route) => {
    const url = route.request().url();
    if (url.includes('UserId=')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ userId: USER_ROW.id, templateRoleIds: savedRoleIds }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ assignments: { [USER_ROW.id]: savedRoleIds } }),
    });
  });

  await page.route('**/sws/neo/assignuserroles**', (route) => {
    const url = route.request().url();
    const params = new URL(url).searchParams;
    const templateRoleIds = (params.get('TemplateRoleIds') || '').split(',').filter(Boolean);
    assignCalls.push({ url, templateRoleIds });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        userId: params.get('UserId'),
        personalRoleId: 'personal-role-1',
        templateRoleIds,
        added: templateRoleIds.length,
        removed: 0,
      }),
    });
  });

  await page.route('**/sws/neo/listmenu**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MENU_TREE),
  }));

  // Detail GET (any sub-path, e.g. /user/user/row-001) + PATCH (save).
  await page.route('**/sws/neo/user/user/**', (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [USER_ROW] } }),
      });
    }
    if (req.method() === 'PATCH' || req.method() === 'PUT') {
      // Echo the id back so `onAfterExistingSave`'s `saved.id` matches USER_ROW.id —
      // required for `handleRoleAssignmentSave`'s `if (!saved?.id) return;` guard and
      // for the resulting SFAssignUserRoles URL to carry the right UserId.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...USER_ROW }] } }),
      });
    }
    return route.fallback();
  });
  // Bare /header-equivalent (list) — not used when navigating straight to the detail
  // URL, but registered for completeness per the two-route convention.
  await page.route('**/sws/neo/user/user**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [USER_ROW], totalRows: 1 } }),
      });
    }
    return route.fallback();
  });

  return { assignCalls, counts };
}

test.describe('User role assignment — detail form (existing user)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('toggling role chips updates the "Roles del usuario" matrix instantly with zero extra network calls', async ({ page }) => {
    const { counts } = await installUserDetailMocks(page, { savedRoleIds: [] });

    await page.goto(`/user/${USER_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The native `userRoles` (AD_User_Roles) detail tab used to duplicate this same
    // "Roles del usuario" label (an AD tab-name coincidence) until DEV wave 6 fix #4
    // excluded it entirely (`decisions.json`'s `userRoles: { exclude: true }`) — this
    // custom tab is now the only one with that label. Still target it by its stable
    // `tab-custom:<key>` testid rather than visible text, as a matter of convention.
    await page.getByTestId('tab-custom:roles').click();
    // `UserRolesTab.jsx` only stamps the `UserRolesTab` container testid on its FINAL
    // (non-empty) return — the empty-state early return only carries
    // `UserRolesTab__empty`. With zero roles selected, that's what's on screen.
    await expect(page.getByTestId('UserRolesTab__empty')).toBeVisible({ timeout: 10_000 });

    // Let the independent mount-time fetches (AssignTemplateRolesControl's own + UserRolesTab's
    // Promise.all([fetchRolesOverview, fetchTemplateRoles({ includeMatrix: true })]))
    // fully settle before taking the "before" snapshot.
    await page.waitForTimeout(300);
    const before = { ...counts };

    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-role-finance').click();
    // Chips (`AssignTemplateRolesControl__chip-*`) render in both the collapsed and
    // expanded (`isEditing`) trigger view (DEV wave 6 fix #2 removed the `!isEditing`
    // guard so the trigger is never blank while editing) — the editor is closed here
    // anyway, matching the natural end-of-interaction state, not because it's required
    // for the chips themselves to appear.
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-finance')).toBeVisible();

    // Matrix updates instantly off local selection state — no empty state anymore, a
    // "Finanzas" column appears, and each row reflects that role's declared
    // `windows[]`/tier (ETP-5196 removed the hardcoded "General" rows overlay, so
    // there is no longer a class of row that is unconditionally ✓).
    const matrix = page.getByTestId('UserRolesTab');
    await expect(matrix).toBeVisible();
    await expect(page.getByTestId('UserRolesTab__empty')).toHaveCount(0);
    await expect(matrix.getByRole('columnheader', { name: 'Finanzas' })).toBeVisible();
    // row-108 ("Usuario") is 'none' for role-finance in the mocked matrix → '—'.
    // row-143 ("Pedido de venta") is 'full' → '✓'.
    await expect(matrix.getByTestId('UserRolesTab__row-108')).toContainText('—');
    await expect(matrix.getByTestId('UserRolesTab__row-143')).toContainText('✓');
    // ETP-5485 — the 2 ETP-5071 proxy rows are present, with Finance's real tier, under the
    // Finance category (menu.json overrides the backend's raw categories).
    const financeCategory = matrix.getByTestId('UserRolesTab__category-Finance');
    await expect(financeCategory).toBeVisible();
    await expect(matrix.getByTestId(`UserRolesTab__row-${TAX_MODELS_PROXY_ID}`)).toContainText('✓');
    await expect(matrix.getByTestId(`UserRolesTab__row-${NOT_POSTED_DOCS_PROXY_ID}`)).toBeVisible();
    await expect(matrix.getByTestId(`UserRolesTab__row-${NOT_POSTED_DOCS_PROXY_ID}`)).not.toContainText('✓');

    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-role-sales').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toBeVisible();
    await expect(matrix.getByRole('columnheader', { name: 'Ventas' })).toBeVisible();

    // Hard functional constraint (plan's Global Constraints — "Role-chip edits are
    // local-only until Guardar ... zero extra network calls per chip toggle").
    expect(counts).toEqual(before);
  });

  /**
   * `windows/custom/user/index.jsx` computes `hasUnsavedRoleChange` (via the `sameIdSet`
   * helper, comparing live `selectedRoleIds` state against `appliedRoleIdsRef`) and passes
   * it to `UserPage` as `additionalDirtyState` — `DetailView.jsx`'s "extra dirty source"
   * prop, `computeIsDirty`'s `... || additionalDirtyState === true`. Since
   * `AssignTemplateRolesControl` never calls plain `onChange(...)` (role composition is not
   * a field write, by design), this is the only mechanism that unblocks Guardar for a
   * role-only edit. This test proves the full round trip: toggling roles alone enables
   * Guardar, toggling back to the originally-loaded set disables it again, and once enabled
   * a click fires `SFAssignUserRoles` exactly once with the full desired role-id set — with
   * no other field ever touched.
   */
  test('a role-only chip change enables Guardar and, once clicked, calls SFAssignUserRoles exactly once with the full desired role-id set', async ({ page }) => {
    const { assignCalls } = await installUserDetailMocks(page, { savedRoleIds: ['role-finance'] });

    await page.goto(`/user/${USER_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('action-save')).toBeDisabled();

    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-role-sales').click(); // finance (saved) + sales (new)
    // Chips render regardless of isEditing (DEV wave 6 fix #2) — closed here just to
    // mirror the natural end-of-interaction state before asserting on the trigger.
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-finance')).toBeVisible();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toBeVisible();

    // Role-only change alone — no other field touched — enables Guardar.
    await expect(page.getByTestId('action-save')).toBeEnabled();

    // Toggling back to the originally-loaded set disables Guardar again (proves the dirty
    // flag tracks live set-equality, not "was ever touched").
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-role-sales').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toHaveCount(0);
    await expect(page.getByTestId('action-save')).toBeDisabled();

    // Re-select sales and click Guardar.
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-role-sales').click();
    await page.getByTestId('AssignTemplateRolesControl__toggle-expand').click();
    await expect(page.getByTestId('action-save')).toBeEnabled();

    await page.getByTestId('action-save').click();
    await expect.poll(() => assignCalls.length, { timeout: 5_000 }).toBe(1);

    const call = assignCalls[0];
    expect(new Set(call.templateRoleIds)).toEqual(new Set(['role-finance', 'role-sales']));

    // Post-save, Guardar is disabled again (the confirmed set is mirrored back into state,
    // not just the ref — the regression this test locks in).
    await expect(page.getByTestId('action-save')).toBeDisabled();

    // A second, unrelated save (no role selection change) must not re-fire the webhook —
    // `index.jsx`'s `sameIdSet` no-op guard — verified via an unrelated field edit, which
    // is the only way to re-enable Guardar without changing roles again. (`firstName`/
    // `lastName` were discarded from the User window in DEV wave 12; `email` is ALSO no
    // longer a valid fallback as of ETP-4830, which added `readOnlyLogicJs: "!!record.id"`
    // to the `email` field — it locks read-only for any already-persisted user, since
    // email seeds username + the linked account row at creation only. `name` is the
    // standard, always-editable field used instead — see `USER_ROW` above, which carries
    // a `name`.)
    await page.getByTestId('field-name').fill('Ipsen Updated');
    await expect(page.getByTestId('action-save')).toBeEnabled();
    await page.getByTestId('action-save').click();
    await page.waitForTimeout(500);
    expect(assignCalls.length).toBe(1);
  });

  test('reload re-fetches and displays the previously-saved role selection (SFUserRoleAssignments single-user mode)', async ({ page }) => {
    await installUserDetailMocks(page, { savedRoleIds: ['role-finance', 'role-sales'] });

    await page.goto(`/user/${USER_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-finance')).toBeVisible();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toBeVisible();

    // Simulate a hard reload (fresh mount, same mocks) — the persisted set must survive.
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-finance')).toBeVisible();
    await expect(page.getByTestId('AssignTemplateRolesControl__chip-role-sales')).toBeVisible();
  });
});

// ETP-5188 — the role quick-filter no longer renders inside `UserHeaderTable`'s own
// markup (that `UserHeaderTable__toolbar` wrapper is gone). It moved to `ListView`'s
// own toolbar row via the `Table.ToolbarQuickFilter` convention
// (`RoleQuickFilterToolbarSlot.jsx`), which renders `RoleFilterControl` under the
// `RoleFilterControl__toolbar` testid.
//
// `DistinctValuesFilter` popover option rows have no stable data-testid (the
// `data-testid` prop `RoleFilterControl.jsx` passes it is silently dropped — the
// component never destructures it) — scope by the popover's own structural class
// (`w-64 p-0`, from `DistinctValuesFilter.jsx`'s `popoverWidth` + `p-0`) to
// disambiguate from same-labeled sidebar icon buttons ("Finanzas" is also an app
// icon in the left rail).
async function openRoleQuickFilter(page) {
  const filterTrigger = page.getByTestId('RoleFilterControl__toolbar').locator('button').first();
  const popover = page.locator('.w-64.p-0');
  await filterTrigger.click();
  return popover;
}

test.describe('User role assignment — Users grid role filter', () => {
  const GRID_ROWS = [
    { id: 'row-001', name: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', locked: false, defaultRole: 'role-personal-ada' },
    { id: 'row-002', name: 'Grace Hopper', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', locked: false, defaultRole: 'role-admin' },
    { id: 'row-003', name: 'Linus Torvalds', firstName: 'Linus', lastName: 'Torvalds', email: 'linus@example.com', locked: false, defaultRole: 'role-personal-linus' },
  ];
  const ASSIGNMENTS = {
    'row-001': ['role-finance'],
    'row-003': ['role-sales', 'role-inventory'],
    // row-002 (Grace) is classic Admin — zero entries in the bulk map by design
    // (`getAppliedTemplateRoleIdsForClient` only walks a *personal* role's
    // inheritance; an Admin user never has one). Detected via defaultRole===adminRoleId.
  };

  test.beforeEach(async ({ page }) => {
    await login(page);
    // Deliberately NOT overriding listmenu here — see the file-level docstring.

    await page.route('**/sws/neo/rolesoverview**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ roles: ROLES }),
    }));
    // See the detail-form `installUserDetailMocks`'s identical route for why this is
    // required — `RoleChipsCell.jsx`'s `useUserRoleGridData` also calls `fetchTemplateRoles()`.
    await page.route('**/sws/neo/systemroletemplates**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ roles: SYSTEM_TEMPLATE_ROLES }),
    }));
    await page.route('**/sws/neo/userroleassignments**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ assignments: ASSIGNMENTS }),
    }));
    await page.route('**/sws/neo/user/user**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: GRID_ROWS, totalRows: GRID_ROWS.length } }),
        });
      }
      return route.fallback();
    });

    await page.goto('/user');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('filtering by a template role narrows the grid to users carrying that composed role', async ({ page }) => {
    const popover = await openRoleQuickFilter(page);
    await popover.getByRole('button', { name: 'Finanzas' }).click();

    await expect(page.locator('tbody tr').filter({ hasText: 'Ada Lovelace' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'Grace Hopper' })).toHaveCount(0);
    await expect(page.locator('tbody tr').filter({ hasText: 'Linus Torvalds' })).toHaveCount(0);
  });
});
