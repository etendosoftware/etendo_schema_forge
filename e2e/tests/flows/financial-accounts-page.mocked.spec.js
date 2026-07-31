import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Financial Accounts page (Cuentas) — landing smoke (mocked).
 *
 * Validates the ETP-4095 T1 landing page that lists FIN_Financial_Account rows
 * with the right-hand "Saldo" sidebar (balance + currency breakdown + pending
 * reconciliation card) and the toolbar (type filter, search, matching-rules
 * button, new-account button).
 *
 * Mock mode only: installs a /sws/neo/financial-accounts-page route AFTER the
 * generic /sws/** catch-all that login() seeds, so it wins (Playwright LIFO).
 */

const ACCOUNTS = [
  {
    id: 'acc-1',
    name: 'Santander',
    type: 'B',
    currentBalance: 211841.01,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    isDefault: true,
    pendingCount: 12,
    bankConnected: true,
  },
  {
    id: 'acc-2',
    name: 'Galicia',
    type: 'CA',
    currentBalance: -95.59,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000002',
    isDefault: false,
    pendingCount: 1,
    bankConnected: true,
  },
  {
    id: 'acc-3',
    name: 'Sabadell',
    type: 'B',
    currentBalance: 62108.04,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000003',
    isDefault: false,
    pendingCount: 5,
    bankConnected: false,
  },
  {
    id: 'acc-4',
    name: 'Efectivo Dolar',
    type: 'C',
    currentBalance: 0,
    currencyId: '100',
    currencyIso: 'USD',
    iban: '',
    isDefault: false,
    pendingCount: 0,
  },
];

const SUMMARY = {
  totalBalance: 273853.46,
  byCurrency: [
    { currencyIso: 'EUR', total: 273853.46 },
    { currencyIso: 'USD', total: 0 },
  ],
  pending: { accountsWithPending: 3, suggestionsReady: 0, byRule: 0 },
};

/**
 * Install the financial-accounts-page endpoint mock. Must run AFTER login()
 * so this specific handler wins over the generic /sws/** stub.
 */
async function installAccountsMock(page) {
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: { accounts: ACCOUNTS, summary: SUMMARY } },
      }),
    });
  });
}

test.describe('Financial Accounts page — Cuentas (T1)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountsMock(page);
    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('renders the page with breadcrumb, all account rows, and sidebar widgets', async ({ page }) => {
    // Breadcrumb appears in the topbar. Use a regex to be tolerant to whitespace.
    await expect(page.getByText(/Finanzas\s*\/\s*Cuentas/)).toBeVisible();

    // All four account rows present
    for (const acc of ACCOUNTS) {
      await expect(page.getByTestId(`account-row-${acc.id}`)).toBeVisible();
    }

    // Sidebar widgets
    await expect(page.getByTestId('cuentas-sidebar')).toBeVisible();
    await expect(page.getByTestId('balance-card')).toBeVisible();
    await expect(page.getByTestId('pending-reconcile-card')).toBeVisible();
  });

  test('sidebar aggregate values match the summary mock', async ({ page }) => {
    // formatCurrency uses es-ES locale + EUR (dot-thousands, comma-decimal, symbol-after): "273.853,46 €"
    const balance = page.getByTestId('balance-card');
    await expect(balance).toBeVisible();
    await expect(balance).toContainText('273.853,46');
    await expect(balance).toContainText('€'); // €

    // EUR row visible inside the sidebar
    await expect(page.getByTestId('balance-by-currency-EUR')).toBeVisible();
    await expect(page.getByTestId('balance-by-currency-USD')).toBeVisible();
  });

  test('account-type filter narrows the table to Tarjeta', async ({ page }) => {
    await page.getByTestId('account-type-filter-trigger').click();
    await page.getByTestId('account-type-filter-option-ca').click();

    // Only the Tarjeta row (acc-2) remains
    await expect(page.getByTestId('account-row-acc-2')).toBeVisible();
    await expect(page.getByTestId('account-row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('account-row-acc-3')).toHaveCount(0);
    await expect(page.getByTestId('account-row-acc-4')).toHaveCount(0);
  });

  test('search filters by name (case-insensitive)', async ({ page }) => {
    await page.getByTestId('cuentas-search-input').fill('sabadell');

    await expect(page.getByTestId('account-row-acc-3')).toBeVisible();
    await expect(page.getByTestId('account-row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('account-row-acc-2')).toHaveCount(0);
    await expect(page.getByTestId('account-row-acc-4')).toHaveCount(0);
  });

  test('Conciliado pill vs pending pill per account', async ({ page }) => {
    // acc-4 has pendingCount = 0 → shows "Conciliado" pill
    const acc4 = page.getByTestId('account-row-acc-4');
    await expect(acc4.getByTestId('reconcile-status-reconciled')).toBeVisible();

    // acc-1 has pendingCount = 12 → shows "Conciliar (12)" pending pill
    const acc1 = page.getByTestId('account-row-acc-1');
    const pending = acc1.getByTestId('reconcile-status-pending');
    await expect(pending).toBeVisible();
    await expect(pending).toContainText('12');
  });

  test('row click navigates to /financial-account/<id>', async ({ page }) => {
    await page.getByTestId('account-row-acc-1').click();
    await expect(page).toHaveURL(/\/financial-account\/acc-1$/);
  });

  test('"Reglas de matcheo" button navigates to the match-rule list', async ({ page }) => {
    await page.getByTestId('cuentas-matching-rules-button').click();
    await expect(page).toHaveURL(/\/match-rule$/);
  });

  test('"Nueva cuenta" button is enabled and does not navigate (T1 placeholder)', async ({ page }) => {
    const newBtn = page.getByTestId('cuentas-new-account-button');
    await expect(newBtn).toBeVisible();
    await expect(newBtn).toBeEnabled();

    const urlBefore = page.url();
    await newBtn.click();
    // Give any potential navigation a beat — URL must not change.
    await page.waitForTimeout(300);
    expect(page.url()).toBe(urlBefore);
  });
});

/**
 * Bulk "Delete selected" — ETP-4656 (Gap 1), E2E smoke.
 *
 * FinancialAccountsPage.jsx has no hard-delete endpoint for financial
 * accounts: bulk delete calls the exact same
 * `DELETE /sws/neo/financial-account/account/{id}` the single-row "Archivar"
 * kebab action already uses (soft-archive, IsActive='N') via
 * `useAccountMutations().archiveAccount`. This is a smoke test proving the
 * full stack (mocked network -> React render -> user clicks -> toast) works
 * for the new BulkDeleteSelectionBar + useBatchDeleteDialog pattern — the
 * exhaustive branch coverage (toolbar swap, selection toggle, cancel, all 3
 * outcome branches) already lives in
 * tools/app-shell/src/pages/__tests__/FinancialAccountsPage.handlers.vitest.jsx.
 *
 * The mock tracks archived ids in memory so the list mock and the DELETE mock
 * stay consistent across a reload() triggered by the batch outcome.
 */
test.describe('Financial Accounts — bulk delete selection bar (ETP-4656)', () => {
  /** @type {{ failIds: Set<string> }} */
  let deleteState;
  let archivedIds;

  test.beforeEach(async ({ page }) => {
    deleteState = { failIds: new Set() };
    archivedIds = new Set();

    await login(page);

    // List endpoint — reflects archivedIds so a reload() after a successful
    // delete actually drops the row, mirroring the real backend.
    await page.route('**/sws/neo/financial-accounts-page', async (route) => {
      const visible = ACCOUNTS.filter((a) => !archivedIds.has(a.id));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: { accounts: visible, summary: SUMMARY } },
        }),
      });
    });

    // DELETE /financial-account/account/{id} — the same soft-archive call the
    // single-row "Archivar" action makes. Fails only for ids in failIds.
    await page.route('**/sws/neo/financial-account/account/**', async (route) => {
      const req = route.request();
      if (req.method() !== 'DELETE') {
        route.fallback();
        return;
      }
      const m = req.url().match(/\/account\/([^/?]+)/);
      const id = decodeURIComponent(m?.[1] ?? '');
      if (deleteState.failIds.has(id)) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'boom' } }),
        });
        return;
      }
      archivedIds.add(id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id }] } }),
      });
    });

    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('selecting rows swaps the toolbar for the selection bar with the right count', async ({ page }) => {
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    await expect(page.getByTestId('bulk-delete-selection-bar')).toHaveCount(0);

    await page.getByTestId('account-select-acc-1').click();

    await expect(page.getByTestId('bulk-delete-selection-bar')).toBeVisible();
    await expect(page.getByTestId('cuentas-toolbar')).toHaveCount(0);
    await expect(page.getByTestId('bulk-delete-selection-count')).toContainText('1');

    await page.getByTestId('account-select-acc-2').click();
    await expect(page.getByTestId('bulk-delete-selection-count')).toContainText('2');
  });

  test('cancel clears the selection and restores the normal toolbar', async ({ page }) => {
    await page.getByTestId('account-select-acc-1').click();
    await page.getByTestId('account-select-acc-2').click();
    await expect(page.getByTestId('bulk-delete-selection-bar')).toBeVisible();

    await page.getByTestId('bulk-delete-selection-cancel').click();

    await expect(page.getByTestId('bulk-delete-selection-bar')).toHaveCount(0);
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    // Checkboxes themselves reset to unchecked once selection state is cleared.
    await expect(page.getByTestId('account-select-acc-1').locator('input')).not.toBeChecked();
  });

  test('partial failure: succeeded rows disappear, failed id stays selected, warning toast fires', async ({ page }) => {
    deleteState.failIds.add('acc-2');

    await page.getByTestId('account-select-acc-1').click();
    await page.getByTestId('account-select-acc-2').click();
    await page.getByTestId('bulk-delete-selection-trigger').click();

    // useBatchDeleteDialog renders a confirm dialog before the actual batch runs.
    await expect(page.getByTestId('DialogContent__batch-delete')).toBeVisible();
    await page.getByTestId('batch-delete-confirm').click();

    await expect(page.locator('[data-type="warning"]')).toBeVisible({ timeout: 5_000 });

    // acc-1 succeeded -> its row is gone after the reload().
    await expect(page.getByTestId('account-row-acc-1')).toHaveCount(0);
    // acc-2 failed -> row stays, and stays selected (bar still shows, count 1).
    await expect(page.getByTestId('account-row-acc-2')).toBeVisible();
    await expect(page.getByTestId('bulk-delete-selection-bar')).toBeVisible();
    await expect(page.getByTestId('bulk-delete-selection-count')).toContainText('1');
  });

  test('all succeed: selection fully clears, list reloads, success toast fires', async ({ page }) => {
    await page.getByTestId('account-select-acc-1').click();
    await page.getByTestId('account-select-acc-3').click();
    await page.getByTestId('bulk-delete-selection-trigger').click();

    await expect(page.getByTestId('DialogContent__batch-delete')).toBeVisible();
    await page.getByTestId('batch-delete-confirm').click();

    await expect(page.locator('[data-type="success"]')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('account-row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('account-row-acc-3')).toHaveCount(0);
    await expect(page.getByTestId('bulk-delete-selection-bar')).toHaveCount(0);
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
  });
});
