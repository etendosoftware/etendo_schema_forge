import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Financial Accounts list (Cuentas) — landing smoke (mocked).
 *
 * Validates the accounts list: the FIN_Financial_Account rows, the left "Saldo" sidebar
 * (balance + currency breakdown + pending reconciliation card) and the toolbar (type filter,
 * search, matching-rules button, new-account button).
 *
 * ETP-4658 moved this screen off the hand-assembled `pages/FinancialAccountsPage.jsx` (which
 * lived on a hardcoded `finance/accounts` route, outside the window system) and onto the
 * `financial-account` window's own list branch: the generated `AccountPage` renders `ListView`
 * with the `AccountsHeaderTable` slot. Three consequences for this spec:
 *
 *   1. Entry point is `/financial-account`. `finance/accounts` is kept as a redirect (asserted
 *      below) so bookmarks and the archive-dialog return keep working.
 *   2. Rows come from the standard W spec — `GET /sws/neo/financial-account/account` — with the
 *      list-only derived fields (`pendingCount`, `bankConnected`, `currencyIso`, `iban`,
 *      `active`, …) injected by FinancialAccountHandler.afterHandle, and the sidebar aggregates
 *      as a `summary` SIBLING of `response.data` on that same request. The bespoke
 *      `financial-accounts-page` R spec no longer feeds this screen.
 *   3. Rows carry the generic DataTable testids — `row-{id}` and `cell-{id}-{column}` — not the
 *      old hand-rolled `account-row-{id}`. The action/toolbar/sidebar testids are unchanged
 *      because those components were kept.
 *
 * Mock mode only: the account route is installed AFTER login() so it wins over the generic
 * /sws/** stub (Playwright matches routes in reverse registration order).
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
    active: true,
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
    active: true,
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
    active: true,
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
    active: true,
  },
  // Archived — must never show in the default view (only under the "Inactivas" filter).
  {
    id: 'acc-5',
    name: 'Caja Antigua',
    type: 'C',
    currentBalance: 0,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: '',
    isDefault: false,
    pendingCount: 0,
    active: false,
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
 * Install the `account` entity mock of the financial-account W spec. Must run AFTER login()
 * so this specific handler wins over the generic /sws/** stub. The list GET answers with the
 * rows plus the `summary` sibling; every other verb/shape (detail GET, DELETE) falls through,
 * so the detail view keeps using its own hooks and a mutation route registered EARLIER in the
 * same test still gets its turn (Playwright resolves `route.fallback()` towards the handler
 * registered before this one).
 *
 * `getRows` is a callback, not an array, so a suite that mutates server state between
 * requests (bulk delete: the archived ids) re-reads it on every fetch and a refetch really
 * reflects the mutation.
 */
async function installAccountsMock(page, getRows = () => ACCOUNTS) {
  await page.route('**/sws/neo/financial-account/account{/**,}**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && !/\/account\/[^/?]+/.test(req.url())) {
      const rows = getRows();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: rows, totalRows: rows.length, summary: SUMMARY },
        }),
      });
      return;
    }
    await route.fallback();
  });
}

test.describe('Financial Accounts list — Cuentas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountsMock(page);
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('the legacy /finance/accounts path redirects to the window list', async ({ page }) => {
    await page.goto('/finance/accounts');

    await expect(page).toHaveURL(/\/financial-account$/);
    await expect(page.getByTestId('cuentas-card')).toBeVisible();
  });

  test('renders the list through the window ListView with the toolbar and sidebar', async ({ page }) => {
    await expect(page.getByTestId('list-view')).toBeVisible();
    await expect(page.getByTestId('cuentas-card')).toBeVisible();
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    await expect(page.getByTestId('cuentas-sidebar')).toBeVisible();
    await expect(page.getByTestId('balance-card')).toBeVisible();
    await expect(page.getByTestId('pending-reconcile-card')).toBeVisible();
  });

  test('renders every active account row and hides the archived one', async ({ page }) => {
    for (const acc of ACCOUNTS.filter((a) => a.active !== false)) {
      await expect(page.getByTestId(`row-${acc.id}`)).toBeVisible();
    }
    await expect(page.getByTestId('row-acc-5')).toHaveCount(0);
  });

  test('renders the contract-driven columns plus the synthetic actions one', async ({ page }) => {
    // All four data columns come from contract.json (entity `account`, grid + gridOrder) —
    // "Por conciliar" among them, as an `entities.account.virtualFields[]` declaration whose
    // value the NeoHandler injects in afterHandle. Only the row actions are added by the slot.
    for (const key of ['name', 'type', 'currentBalance', 'pendingCount', '_rowActions']) {
      await expect(page.getByTestId(`column-header-${key}`)).toHaveCount(1);
    }
  });

  test('renders the rich cell bodies inside the generic grid cells', async ({ page }) => {
    await expect(page.getByTestId('cell-acc-1-name')).toContainText('Santander');
    // IBAN is chunked in groups of four by the shared TypeCell.
    await expect(page.getByTestId('cell-acc-1-type')).toContainText('ES12 1234 0000 0000 0000 0001');
    await expect(page.getByTestId('cell-acc-1-currentBalance')).toContainText('211.841,01');
  });

  // The sidebar is fed by the `summary` the backend attaches next to `response.data` on the
  // SAME list request: `useEntity` exposes it as `meta`, and ListView now forwards `meta` to
  // the `Table` slot as well as to `headerContent` — `customComponents.headerTable` is
  // generated as `Table`, and AccountsHeaderTable reads `meta?.summary`. Before that the
  // sidebar rendered 0.00 no matter what the backend sent (unit coverage:
  // `tools/app-shell/src/components/contract-ui/__tests__/ListView.headerContentMeta.vitest.jsx`).
  test('sidebar aggregate values match the summary sibling of response.data', async ({ page }) => {
    // formatCurrency uses es-ES locale + EUR (dot-thousands, comma-decimal, symbol-after): "273.853,46 €"
    const balance = page.getByTestId('balance-card');
    await expect(balance).toContainText('273.853,46');
    await expect(balance).toContainText('€');

    await expect(page.getByTestId('balance-by-currency-EUR')).toBeVisible();
    await expect(page.getByTestId('balance-by-currency-USD')).toBeVisible();
  });

  test('account-type filter narrows the table to Tarjeta', async ({ page }) => {
    await page.getByTestId('account-type-filter-trigger').click();
    await page.getByTestId('account-type-filter-option-ca').click();

    await expect(page.getByTestId('row-acc-2')).toBeVisible();
    await expect(page.getByTestId('row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('row-acc-3')).toHaveCount(0);
    await expect(page.getByTestId('row-acc-4')).toHaveCount(0);
  });

  test('the Inactivas filter shows only the archived account', async ({ page }) => {
    await page.getByTestId('account-type-filter-trigger').click();
    await page.getByTestId('account-type-filter-option-inactive').click();

    await expect(page.getByTestId('row-acc-5')).toBeVisible();
    await expect(page.getByTestId('row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('row-acc-4')).toHaveCount(0);
  });

  test('search filters by name (case-insensitive)', async ({ page }) => {
    await page.getByTestId('cuentas-search-input').fill('sabadell');

    await expect(page.getByTestId('row-acc-3')).toBeVisible();
    await expect(page.getByTestId('row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('row-acc-2')).toHaveCount(0);
    await expect(page.getByTestId('row-acc-4')).toHaveCount(0);
  });

  test('Conciliado pill vs pending pill per account', async ({ page }) => {
    // acc-4 has pendingCount = 0 → "Conciliado" pill.
    await expect(
      page.getByTestId('cell-acc-4-pendingCount').getByTestId('reconcile-status-reconciled'),
    ).toBeVisible();

    // acc-1 has pendingCount = 12 → "Conciliar (12)" pending pill.
    const pending = page.getByTestId('cell-acc-1-pendingCount').getByTestId('reconcile-status-pending');
    await expect(pending).toBeVisible();
    await expect(pending).toContainText('12');
  });

  test('the pending pill deep-links to the reconciliation tab without a plain row click', async ({ page }) => {
    await page.getByTestId('cell-acc-1-pendingCount').getByTestId('reconcile-status-pending').click();

    // The detail view's deep-link effect (index.jsx) applies `tab`/`autoMatch` from the URL to
    // local state on mount, then immediately clears the query string with
    // `setSearchParams({}, { replace: true })` — a deliberate one-shot deep link. That effect
    // runs well before Playwright's assertion polling window ever observes the query string, so
    // asserting on the transient URL is not viable. Assert the actual landed state instead: the
    // reconciliation tab is active and the automatch surface (gated by `activeTab ===
    // 'reconciliation'`) rendered — both are only reachable through the deep-link params.
    await expect(page).toHaveURL(/\/financial-account\/acc-1$/);
    await expect(page.getByTestId('detail-tab-reconciliation')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('financial-account-automatch')).toBeVisible();
  });

  test('the row hover actions keep their per-row testids', async ({ page }) => {
    const row = page.getByTestId('row-acc-1');
    await row.hover();

    await expect(row.getByTestId('account-row-edit-acc-1')).toBeVisible();
    // Sync only renders for PSD2-connected accounts.
    await expect(row.getByTestId('account-row-refresh-acc-1')).toBeVisible();
    await expect(row.getByTestId('account-row-menu-trigger-acc-1')).toBeVisible();

    const offline = page.getByTestId('row-acc-3');
    await offline.hover();
    await expect(offline.getByTestId('account-row-refresh-acc-3')).toHaveCount(0);
  });

  // KNOWN BUG — AccountsHeaderTable overrides ListView's row handler with
  // `onNavigate={(id) => navigate(`/financial-account/${id}`)}`, but DataTable invokes it
  // with the WHOLE ROW (`else if (onNavigate) onNavigate(row);`, DataTable.jsx ~1902), so a
  // row click lands on `/financial-account/[object Object]` and the detail never loads. The
  // kebab's "Abrir" and the reconcile pill are unaffected (they pass the account object).
  // `test.fail` keeps the suite green while the bug stands and turns it RED once the handler
  // is fixed, which is the signal to delete this marker.
  // DataTable invokes `onNavigate` with the whole ROW, not an id (DataTable.jsx:1902).
  // AccountsHeaderTable's handler originally destructured it as an id, so a row click
  // navigated to `/financial-account/[object Object]`.
  test('row click navigates to /financial-account/<id>', async ({ page }) => {
    await page.getByTestId('cell-acc-1-name').click();

    await expect(page).toHaveURL(/\/financial-account\/acc-1$/);
  });

  // This list owns its row actions: the canonical RowQuickActions overlay is switched off
  // declaratively (`window.rowQuickActions.enabled: false` in decisions.json) rather than by a
  // prop, so it is never mounted. Note this is INDEPENDENT of multi-select — ETP-4656 restored
  // the checkbox column on this grid, and the overlay stays off regardless. That matters
  // because the overlay is absolutely
  // positioned over the trailing `_rowActions` cell: while it was mounted it added a second
  // edit button plus a delete button and swallowed every pointer event aimed at the slot's own
  // kebab, leaving "Abrir / Nuevo movimiento / Transferir / Desconectar / Archivar"
  // unreachable. This test guards both halves — the overlay is absent AND the slot's actions
  // are genuinely operable.
  test('the slot owns the row actions — no generic quick-actions overlay', async ({ page }) => {
    const row = page.getByTestId('row-acc-1');
    await row.hover();

    // Revealed on hover: DataTable marks its rows with the NAMED group `group/row`
    // (DataTable.jsx ~1201), which AccountRowActions targets alongside the plain `group`.
    await expect(row.getByTestId('account-row-edit-acc-1')).toBeVisible();
    await expect(row.getByTestId('account-row-menu-trigger-acc-1')).toBeVisible();
    // Sync only renders for PSD2-connected accounts (acc-1 is, acc-3 is not).
    await expect(row.getByTestId('account-row-refresh-acc-1')).toBeVisible();

    const offline = page.getByTestId('row-acc-3');
    await offline.hover();
    await expect(offline.getByTestId('account-row-refresh-acc-3')).toHaveCount(0);

    // Nothing from the generic overlay is in the DOM.
    await expect(row.getByTestId('row-quick-actions')).toHaveCount(0);
    await expect(row.getByTestId('row-quick-action-edit')).toHaveCount(0);
    await expect(row.getByTestId('row-quick-action-delete')).toHaveCount(0);

    // The kebab is reachable by a normal click and opens its menu.
    await row.hover();
    await row.getByTestId('account-row-menu-trigger-acc-1').click();
    await expect(page.getByTestId('account-row-menu-open-acc-1')).toBeVisible();
    await expect(page.getByTestId('account-row-menu-archive-acc-1')).toBeVisible();
  });

  test('"Reglas de matcheo" button navigates to the match-rule list', async ({ page }) => {
    await page.getByTestId('cuentas-matching-rules-button').click();

    await expect(page).toHaveURL(/\/match-rule$/);
  });

  test('"Nueva cuenta" button opens the wizard instead of navigating', async ({ page }) => {
    const newBtn = page.getByTestId('cuentas-new-account-button');
    await expect(newBtn).toBeEnabled();

    const urlBefore = page.url();
    await newBtn.click();

    await expect(page.getByTestId('new-account-wizard')).toBeVisible();
    expect(page.url()).toBe(urlBefore);
  });
});

/**
 * Bulk "Delete selected" — ETP-4656 (Gap 1), E2E smoke.
 *
 * There is no hard-delete endpoint for financial accounts: bulk delete issues the exact same
 * `DELETE /sws/neo/financial-account/account/{id}` the single-row "Archivar" kebab action
 * already uses (soft-archive, IsActive='N').
 *
 * This runs entirely through the GENERIC ListView path — `useBulkRowDelete` behind ListView's
 * standardized selection bar — not the bespoke `BulkDeleteSelectionBar` + `useBatchDeleteDialog`
 * pair the retired hand-assembled page used (those are still alive, but only for the detail
 * view's Movimientos / Extractos tabs). Two things make that reachable on this window, and both
 * are what this suite guards end to end:
 *   - `AccountsHeaderTable` does not force `selectable={false}` on its DataTable, so the
 *     checkbox column renders. There is no per-row select testid — DataTable emits none — so
 *     the checkbox is reached as `Checkbox__eb5261` SCOPED INSIDE `row-{id}` (the same testid
 *     is also on the select-all header checkbox).
 *   - `hideListBar` gates only the idle filter bar, so the selection bar itself still renders;
 *     the slot unmounts its own `cuentas-toolbar` while a selection is active, which is why the
 *     swap reads as one bar replacing another.
 *
 * Exhaustive branch coverage lives at unit level:
 *   - ListView's bar + outcome wiring: components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx
 *   - the batch itself + confirm dialog: hooks/__tests__/useBulkRowDelete.vitest.jsx
 *   - the toolbar/selection-bar swap: windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx
 *
 * The mock tracks archived ids in memory so the list mock and the DELETE mock stay consistent
 * across the refetch the batch outcome triggers.
 */
test.describe('Financial Accounts — bulk delete selection bar (ETP-4656)', () => {
  /** @type {{ failIds: Set<string> }} */
  let deleteState;
  let archivedIds;

  /** The row checkbox: DataTable emits no per-row select testid, so scope the generic one. */
  const rowCheckbox = (page, id) => page.getByTestId(`row-${id}`).getByTestId('Checkbox__eb5261');

  test.beforeEach(async ({ page }) => {
    deleteState = { failIds: new Set() };
    archivedIds = new Set();

    await login(page);

    // DELETE /financial-account/account/{id} — the same soft-archive call the single-row
    // "Archivar" action makes. Fails only for ids in failIds.
    //
    // Registered BEFORE the list mock on purpose: both globs match this URL, the later
    // registration wins, and the list handler defers non-list requests with
    // `route.fallback()` — which resolves towards the handler registered earlier, i.e. this one.
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

    // Same W-spec list endpoint the rest of this file mocks, but reading archivedIds on every
    // request so the refetch after a successful delete actually drops the row.
    await installAccountsMock(page, () => ACCOUNTS.filter((a) => !archivedIds.has(a.id)));

    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('selecting rows swaps the toolbar for the selection bar with the right count', async ({ page }) => {
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    await expect(page.getByTestId('selection-count')).toHaveCount(0);

    await rowCheckbox(page, 'acc-1').click();

    // The bar has no wrapper testid — its count and its delete trigger are the two markers.
    await expect(page.getByTestId('selection-count')).toBeVisible();
    await expect(page.getByTestId('bulk-delete-selected')).toBeVisible();
    await expect(page.getByTestId('cuentas-toolbar')).toHaveCount(0);
    await expect(page.getByTestId('selection-count')).toContainText('1');

    await rowCheckbox(page, 'acc-2').click();
    await expect(page.getByTestId('selection-count')).toContainText('2');
    // The trigger carries the count too — "Eliminar seleccionados (2)".
    await expect(page.getByTestId('bulk-delete-selected')).toContainText('2');
  });

  // The generic bar has no cancel button (the bespoke one did): clearing the selection is done
  // by unticking the rows, or from the select-all header checkbox. Same intent — the selection
  // empties, the bar goes away and the window toolbar comes back.
  test('unticking the rows clears the selection and restores the normal toolbar', async ({ page }) => {
    await rowCheckbox(page, 'acc-1').click();
    await rowCheckbox(page, 'acc-2').click();
    await expect(page.getByTestId('selection-count')).toContainText('2');

    await rowCheckbox(page, 'acc-1').click();
    await expect(page.getByTestId('selection-count')).toContainText('1');
    await rowCheckbox(page, 'acc-2').click();

    await expect(page.getByTestId('selection-count')).toHaveCount(0);
    await expect(page.getByTestId('bulk-delete-selected')).toHaveCount(0);
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    // The checkboxes themselves reset with the selection state.
    await expect(rowCheckbox(page, 'acc-1').locator('input')).not.toBeChecked();
    await expect(rowCheckbox(page, 'acc-2').locator('input')).not.toBeChecked();
  });

  test('partial failure: succeeded rows disappear, failed id stays selected, warning toast fires', async ({ page }) => {
    deleteState.failIds.add('acc-2');

    await rowCheckbox(page, 'acc-1').click();
    await rowCheckbox(page, 'acc-2').click();
    await page.getByTestId('bulk-delete-selected').click();

    // useBulkRowDelete renders a confirm dialog before the actual batch runs.
    await expect(page.getByTestId('DialogContent__bulk-delete')).toBeVisible();
    await page.getByTestId('bulk-delete-confirm').click();

    await expect(page.locator('[data-type="warning"]')).toBeVisible({ timeout: 5_000 });

    // acc-1 succeeded -> its row is gone after the refetch.
    await expect(page.getByTestId('row-acc-1')).toHaveCount(0);
    // acc-2 failed -> row stays, and stays selected (bar still up, count back down to 1).
    await expect(page.getByTestId('row-acc-2')).toBeVisible();
    await expect(page.getByTestId('selection-count')).toBeVisible();
    await expect(page.getByTestId('selection-count')).toContainText('1');
    await expect(rowCheckbox(page, 'acc-2').locator('input')).toBeChecked();
  });

  test('all succeed: selection fully clears, list reloads, success toast fires', async ({ page }) => {
    await rowCheckbox(page, 'acc-1').click();
    await rowCheckbox(page, 'acc-3').click();
    await page.getByTestId('bulk-delete-selected').click();

    await expect(page.getByTestId('DialogContent__bulk-delete')).toBeVisible();
    await page.getByTestId('bulk-delete-confirm').click();

    await expect(page.locator('[data-type="success"]')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId('row-acc-1')).toHaveCount(0);
    await expect(page.getByTestId('row-acc-3')).toHaveCount(0);
    await expect(page.getByTestId('selection-count')).toHaveCount(0);
    await expect(page.getByTestId('bulk-delete-selected')).toHaveCount(0);
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
  });
});
