import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

// @covers artifacts/chart-of-accounts/custom/AccountTreeView.jsx
// @covers artifacts/chart-of-accounts/custom/ChartOfAccountsToolbarSlot.jsx
// @covers artifacts/chart-of-accounts/custom/NewSubAccountCreateModal.jsx
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx

/**
 * Chart of Accounts — the tree inside ListView's single toolbar row.
 *
 * The tree has no toolbar of its own: its controls (expand/collapse all, search,
 * account type) are `AccountTreeView.ToolbarQuickFilter`, rendered by ListView next to
 * Share / Sort / Refresh / Print and the New button ("Nueva subcuenta",
 * `newRecordComponent`). Filters live in the URL so the Share link reproduces the view.
 *
 * Mock mode only — the tree self-fetches `/elementValue?_startRow=0&_endRow=9999`.
 */

const anc = (value, name, elementLevel) => ({ value, name, elementLevel });
const ACTIVO = anc('A', 'ACTIVO', 'E');
const PASIVO = anc('P', 'PASIVO', 'E');
const GASTOS = anc('6', 'COMPRAS Y GASTOS', 'E');

const leaf = (id, searchKey, name, accountType, ancestors) => ({
  id, searchKey, name, accountType, ancestors,
  summaryLevel: 'N', elementLevel: 'S', active: true, updated: '2026-01-01T00:00:00Z',
});

const ROWS = [
  leaf('acc-20000001', '20000001', 'Investigación aplicada', 'A', [ACTIVO, anc('200', 'Investigación', 'C')]),
  leaf('acc-21000001', '21000001', 'Terrenos', 'A', [ACTIVO, anc('210', 'Terrenos', 'C')]),
  leaf('acc-40000001', '40000001', 'Proveedor Uno', 'L', [PASIVO, anc('400', 'Proveedores', 'C')]),
  leaf('acc-60000001', '60000001', 'Compras de mercaderías', 'E', [GASTOS, anc('600', 'Compras', 'C')]),
];

async function installMocks(page) {
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || /\/elementValue\/[^/?]+/.test(new URL(req.url()).pathname)) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
    });
  };
  await page.route('**/sws/neo/chart-of-accounts/elementValue/**', handler);
  await page.route('**/sws/neo/chart-of-accounts/elementValue**', handler);
}

const row = (page, id) => page.getByTestId(`account-tree-row-${id}`);

test.describe('Chart of Accounts — tree toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto('/chart-of-accounts');
    await expect(page.getByTestId('account-tree-table')).toBeVisible();
    // The wrapper keeps its own id inside ListView (ListView passes every table a generic one).
    await expect(page.getByTestId('account-tree')).toBeVisible();
  });

  test('shows every control in the list toolbar row and counts root accounts', async ({ page }) => {
    const mainRow = page.getByTestId('list-toolbar-main-row');
    for (const id of ['coa-toggle-expand-all', 'coa-search-input', 'coa-filter-account-type', 'list-share-link', 'action-new']) {
      await expect(mainRow.getByTestId(id)).toBeVisible();
    }
    // Three roots (A, P, 6), not four leaves.
    await expect(page.getByTestId('topbar-record-count')).toHaveText('3');
  });

  test('the expand button opens every folder, then collapses them', async ({ page }) => {
    const toggle = page.getByTestId('coa-toggle-expand-all');
    await expect(row(page, 'acc-40000001')).toHaveCount(0);

    await toggle.click();
    await expect(row(page, 'acc-40000001')).toBeVisible();
    await expect(page.getByTestId('ArrowUp__coa')).toBeVisible();

    await toggle.click();
    await expect(row(page, 'acc-40000001')).toHaveCount(0);
    await expect(page.getByTestId('ArrowDown__coa')).toBeVisible();
  });

  test('search and account type filter the tree and are kept in the URL', async ({ page }) => {
    await page.getByTestId('coa-search-input').fill('2100');
    await expect(row(page, 'acc-21000001')).toBeVisible();
    await expect(row(page, 'acc-20000001')).toHaveCount(0);
    await expect(row(page, 'group-P')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]q=2100/);

    // Clear the search and pick a type right away, while the cleared search may still be
    // pending: both must end up in the URL (a stale pending write used to drop the type).
    await page.getByTestId('coa-search-input').fill('');
    await page.getByTestId('coa-filter-account-type').click();
    // The option rows carry no ids of their own. The list renders "all" first, then the
    // six types sorted by translated label; the mock session is es_ES (see
    // docs/e2e-testing-guide.md), where the first type is "Activo" (A).
    const popover = page.getByTestId('PopoverContent__cd3aa9');
    await popover.getByRole('button').nth(1).click();
    await expect(page).toHaveURL(/[?&]accountType=A/);
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(row(page, 'group-A')).toBeVisible();
    await expect(row(page, 'group-P')).toHaveCount(0);
    await expect(row(page, 'group-6')).toHaveCount(0);
  });

  test('a search typed just before picking a type keeps both filters', async ({ page }) => {
    await page.getByTestId('coa-search-input').fill('2100');
    await page.getByTestId('coa-filter-account-type').click();
    await page.getByTestId('PopoverContent__cd3aa9').getByRole('button').nth(1).click(); // es_ES: Activo
    await expect(page).toHaveURL(/[?&]q=2100/);
    await expect(page).toHaveURL(/[?&]accountType=A/);
    await expect(row(page, 'acc-21000001')).toBeVisible();
  });

  test('a shared link with filters reproduces the view', async ({ page }) => {
    await page.goto('/chart-of-accounts?accountType=L');
    await expect(row(page, 'acc-40000001')).toBeVisible();
    await expect(row(page, 'group-A')).toHaveCount(0);
  });

  test('"Nueva subcuenta" opens the create modal from the toolbar', async ({ page }) => {
    await page.getByTestId('action-new').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
