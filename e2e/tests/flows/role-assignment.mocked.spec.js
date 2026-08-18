import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Role Assignment — ETP-4512 (mocked).
 *
 * Validates the User settings window's AssignRoleControl headerExtra: open an
 * existing user with no role assigned, pick a new role from the (unrestricted)
 * userRoles.role selector, save, and confirm the role now renders as a status
 * badge on the User list grid (decisions.json → user.defaultRole,
 * columnType: "status").
 *
 * Mock mode only: this spec installs window-specific routes on top of the
 * generic /sws/** mock that login() seeds, so it does not need a backend.
 */

const USER_ID = 'user-e2e-1';
const ROLE_ID_PURCHASING = 'A826430F723E4C1B9A53EBB0746A98C0'; // matches artifacts/user/decisions.json enumValues

// Mutable — the PATCH mock below updates this object in place so a subsequent
// list GET reflects the saved role.
const row = {
  id: USER_ID,
  name: 'Jane Roe',
  username: 'jane.roe',
  email: 'jane.roe@example.test',
  locked: false,
  lastPasswordUpdate: '2026-01-01',
  defaultRole: null,
};

const ROLE_OPTIONS = [
  { id: ROLE_ID_PURCHASING, label: 'Purchasing' },
  { id: '127AE77FE2994067B7FE6495FC21D51E', label: 'Finance' },
];

/**
 * Child tab mock — the userRoles entity is fully read-only (ETP-4512) and has
 * no addLineFields, so an empty envelope is enough to render the tab without
 * errors. `**\/sws/neo/user/userRoles**` also matches the more specific
 * `.../userRoles/selectors/role` selectors URL (substring match), so
 * this handler explicitly falls back on `/selectors/` URLs instead of
 * relying solely on registration order for installRoleSelectorsMock below to
 * win.
 */
async function installUserRolesChildMock(page) {
  await page.route('**/sws/neo/user/userRoles{/**,}**', async (route) => {
    const req = route.request();
    if (req.url().includes('/selectors/')) return route.fallback();
    if (req.method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });
}

/** Header entity mock — list, detail GET, and PATCH (save) for the user record. */
async function installUserRecordMock(page) {
  await page.route('**/sws/neo/user/user{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (method === 'GET' && !/\/user\/user\/[^/?]+/.test(url)) {
      // List fetch
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [row], totalRows: 1 } }),
      });
      return;
    }
    if (method === 'GET') {
      // Detail GET
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [row] } }),
      });
      return;
    }
    if (method === 'PATCH' || method === 'PUT' || method === 'POST') {
      const body = req.postDataJSON() ?? {};
      Object.assign(row, body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [row] } }),
      });
      return;
    }
    route.fallback();
  });
}

/**
 * AssignRoleControl's role-options mock — deliberately a DIFFERENT (broader)
 * selector than defaultRole's own, per the component's doc comment.
 */
async function installRoleSelectorsMock(page) {
  await page.route('**/sws/neo/user/userRoles/selectors/role{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: ROLE_OPTIONS }),
    });
  });
}

test.describe('Role Assignment — user', () => {
  test.beforeEach(async ({ page }) => {
    row.defaultRole = null; // reset mutable fixture between tests
    await login(page);
    await installUserRolesChildMock(page);
    await installUserRecordMock(page);
    await installRoleSelectorsMock(page);
    await page.goto('/user');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('assigns a role via AssignRoleControl and it shows as a badge in the list grid', async ({ page }) => {
    const userRow = page.locator('tbody tr').filter({ hasText: 'jane.roe' }).first();
    await expect(userRow).toBeVisible();

    // Open the detail view via the canonical row quick action.
    await userRow.hover();
    await userRow.getByTestId('row-quick-action-edit').click();
    await expect(page).toHaveURL(new RegExp(`/user/${USER_ID}`));

    // No role assigned yet — the select shows the empty option.
    const select = page.getByTestId('AssignRoleControl__select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('');

    // Assign a role from the unrestricted userRoles.role selector options.
    await select.selectOption(ROLE_ID_PURCHASING);
    await expect(select).toHaveValue(ROLE_ID_PURCHASING);

    // Save persists defaultRole through the normal header PATCH.
    const saveBtn = page.getByTestId('action-save');
    await expect(saveBtn).toBeEnabled();
    const [saveResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/sws/neo/user/user/${USER_ID}`) && r.request().method() === 'PATCH'),
      saveBtn.click(),
    ]);
    expect(saveResponse.ok()).toBe(true);

    // Back on the list, the assigned role now renders as a badge showing the role's own
    // identifier (raw AD_Role.Name, e.g. "Purchasing") — not a translated i18n label. The
    // field used to render via a hardcoded GOClient-only role-id -> i18n-key map
    // (columnType: "status" + enumValues in artifacts/user/decisions.json), which broke for
    // any other tenant (showed the raw role UUID instead). That map was removed (2026-07-27);
    // the column now falls back to the default foreignKey renderer, which resolves the raw
    // identifier correctly for every tenant, at the cost of this one field not being
    // translated for now. See defaultRole's own "reason" in artifacts/user/decisions.json
    // for the full rationale; translating this specific badge (reusing roleNameI18n.js's
    // map, same as AssignRoleControl's dropdown) is a small follow-up, not done here.
    await page.goto('/user');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    const refreshedRow = page.locator('tbody tr').filter({ hasText: 'jane.roe' }).first();
    await expect(refreshedRow).toBeVisible();
    await expect(refreshedRow.getByText('Purchasing')).toBeVisible();
  });

  test('the assign-role select is enabled once options load', async ({ page }) => {
    const userRow = page.locator('tbody tr').filter({ hasText: 'jane.roe' }).first();
    await userRow.hover();
    await userRow.getByTestId('row-quick-action-edit').click();

    const select = page.getByTestId('AssignRoleControl__select');
    await expect(select).toBeVisible();
    await expect(select).toBeEnabled();
  });

  test('Save stays disabled until a different role is picked', async ({ page }) => {
    const userRow = page.locator('tbody tr').filter({ hasText: 'jane.roe' }).first();
    await userRow.hover();
    await userRow.getByTestId('row-quick-action-edit').click();

    const select = page.getByTestId('AssignRoleControl__select');
    await expect(select).toBeVisible();

    const saveBtn = page.getByTestId('action-save');
    await expect(saveBtn).toBeDisabled();

    await select.selectOption(ROLE_ID_PURCHASING);
    await expect(saveBtn).toBeEnabled();
  });
});
