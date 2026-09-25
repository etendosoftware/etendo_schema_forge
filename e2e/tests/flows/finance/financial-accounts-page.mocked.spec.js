import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';
import { openAccountRowMenu } from '../../helpers/financial-account-helpers.js';

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
 *      list-only derived fields (`bankConnected`, `currencyIso`, `iban`, `active`, …) injected
 *      by FinancialAccountHandler.afterHandle, and the sidebar aggregates as a `summary`
 *      SIBLING of `response.data` on that same request. The bespoke `financial-accounts-page`
 *      R spec no longer feeds this screen.
 *      "Por conciliar" is NOT one of the injected fields: it is the `EM_ETGO_Pending_Count`
 *      stored computed column, so the generic CRUD serves it as `eTGOPendingCount` — which is
 *      also why the cell testid below is `cell-{id}-eTGOPendingCount`.
 *   3. Rows carry the generic DataTable testids — `row-{id}` and `cell-{id}-{column}` — not the
 *      old hand-rolled `account-row-{id}`. The action/toolbar/sidebar testids are unchanged
 *      because those components were kept.
 *
 * Mock mode only: the account route is installed AFTER login() so it wins over the generic
 * /sws/** stub (Playwright matches routes in reverse registration order).
 */

const LONG_ACCOUNT_NAME = 'Santander Corporate & Investment Banking International Global Treasury Operations Enterprise Account';

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
    eTGOPendingCount: 12,
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
    eTGOPendingCount: 1,
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
    eTGOPendingCount: 5,
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
    eTGOPendingCount: 0,
    active: true,
  },
  {
    id: 'acc-6',
    name: LONG_ACCOUNT_NAME,
    type: 'B',
    currentBalance: 0,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000006',
    isDefault: false,
    eTGOPendingCount: 0,
    bankConnected: false,
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
    eTGOPendingCount: 0,
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
 * Install the DETAIL mock — the bespoke `financial-accounts-page` R spec, which is still what
 * `useFinancialAccount` reads (it fetches the whole list and filters by id client-side; see the
 * "T4 shortcut" note in `hooks/useFinancialAccount.js`). Same payload shape as
 * `financial-account-detail.mocked.spec.js`: `response.data.accounts`.
 *
 * This is NOT optional for any test that lands on `/financial-account/{id}`. Before ETP-5034
 * a detail whose account never loaded still rendered the tab shell, so a spec could get away
 * with letting this request fall through to login()'s generic `/sws/**` stub — that stub answers
 * `{ data: [], totalRows: 0 }` with no `response` envelope, which `useNeoResource` rejects as an
 * unexpected shape, i.e. `error`, not just "no account". ETP-5034 added an early return in
 * `windows/custom/financial-account/index.jsx` that renders `RecordUnavailable` in that case, so
 * the whole detail (tabs, toolbar, automatch) disappears and every assertion below it fails.
 *
 * The R spec kept the flat `pendingCount` key; the W spec's generic CRUD derives its key from the
 * AD column and serves the same value as `eTGOPendingCount`. The shared ACCOUNTS fixture carries
 * the W key, so it is mapped here rather than duplicated.
 */
async function installAccountDetailMock(page, getRows = () => ACCOUNTS) {
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    const accounts = getRows().map(({ eTGOPendingCount, ...rest }) => ({
      ...rest, pendingCount: eTGOPendingCount,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { accounts, summary: SUMMARY } } }),
    });
  });
}

/**
 * Install the `account` entity mock of the financial-account W spec. Must run AFTER login()
 * so this specific handler wins over the generic /sws/** stub. The list GET answers with the
 * rows plus the `summary` sibling; every other verb/shape (per-id GET, DELETE) falls through, so
 * a mutation route registered EARLIER in the same test still gets its turn (Playwright resolves
 * `route.fallback()` towards the handler registered before this one). The detail view reads a
 * different endpoint entirely — see `installAccountDetailMock`, which this installs too so every
 * test that navigates into `/financial-account/{id}` gets a loadable record.
 *
 * `getRows` is a callback, not an array, so a suite that mutates server state between
 * requests (bulk delete: the archived ids) re-reads it on every fetch and a refetch really
 * reflects the mutation.
 */
async function installAccountsMock(page, getRows = () => ACCOUNTS) {
  await installAccountDetailMock(page, getRows);
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

  test('renders every active account row and hides the archived one', async ({ page }) => {
    for (const acc of ACCOUNTS.filter((a) => a.active !== false)) {
      await expect(page.getByTestId(`row-${acc.id}`)).toBeVisible();
    }
    await expect(page.getByTestId('row-acc-5')).toHaveCount(0);
  });

  test('a long account name truncates without pushing out the avatar or connection badge', async ({ page }) => {
    const nameCell = page.getByTestId('cell-acc-6-name');
    const name = page.getByTestId('account-row-name-acc-6');
    const avatar = page.getByTestId('account-row-avatar-acc-6');
    const badge = page.getByTestId('account-row-connection-badge-acc-6');

    await expect(nameCell).toBeVisible();
    await expect(avatar).toBeVisible();
    await expect(badge).toBeVisible();
    await expect(name).toHaveCSS('text-overflow', 'ellipsis');
    expect(await name.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(true);

    const [cellBox, avatarBox, badgeBox] = await Promise.all([
      nameCell.boundingBox(), avatar.boundingBox(), badge.boundingBox(),
    ]);
    expect(cellBox).not.toBeNull();
    expect(avatarBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(avatarBox.x).toBeGreaterThanOrEqual(cellBox.x);
    expect(avatarBox.x + avatarBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1);
    expect(badgeBox.x).toBeGreaterThanOrEqual(cellBox.x);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1);

    await name.hover();
    await expect(page.getByTestId('account-row-name-acc-6-tooltip')).toHaveText(LONG_ACCOUNT_NAME);
  });

  test('a short disconnected account keeps its connection badge next to the name', async ({ page }) => {
    const name = page.getByTestId('account-row-name-acc-3');
    const badge = page.getByTestId('account-row-connection-badge-acc-3');

    await expect(name).toBeVisible();
    await expect(badge).toBeVisible();

    const [nameBox, badgeBox] = await Promise.all([name.boundingBox(), badge.boundingBox()]);
    expect(nameBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();

    const horizontalGap = badgeBox.x - (nameBox.x + nameBox.width);
    expect(horizontalGap).toBeGreaterThanOrEqual(0);
    // `gap-1` is 4px; tolerate subpixel rounding while preventing the badge from
    // drifting to the far edge of the account cell as it did with a full-width row.
    expect(horizontalGap).toBeLessThanOrEqual(6);
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

  test('the pending pill deep-links to the reconciliation tab without a plain row click', async ({ page }) => {
    await page.getByTestId('cell-acc-1-eTGOPendingCount').getByTestId('reconcile-status-pending').click();

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

  test('row actions stay pinned to the visible right edge while the table scrolls horizontally', async ({ page }) => {
    const row = page.getByTestId('row-acc-1');
    // Account-specific controls now render inside DataTable's canonical trailing
    // quick-actions cell. It deliberately has no synthetic column key/testid.
    const actionsCell = row.locator(':scope > td:last-child');
    const edit = row.getByTestId('account-row-edit-acc-1');
    // DataTable's <Table> primitive owns the real horizontal scroll element in
    // its direct wrapper; the outer DataTable div only hosts the mirror thumb.
    const scrollContainer = page.getByTestId('Table__eb5261').locator('..');

    await expect.poll(
      () => scrollContainer.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);

    const assertPinnedAt = async (ratio) => {
      await scrollContainer.evaluate((element, nextRatio) => {
        element.scrollLeft = (element.scrollWidth - element.clientWidth) * nextRatio;
        element.dispatchEvent(new Event('scroll'));
      }, ratio);

      const [containerBox, rowBox] = await Promise.all([
        scrollContainer.boundingBox(),
        row.boundingBox(),
      ]);
      expect(containerBox).not.toBeNull();
      expect(rowBox).not.toBeNull();

      // Keep the pointer over the same row after the scroll. This activates the
      // `group-hover/row:sticky` contract without depending on an off-screen cell.
      await page.mouse.move(
        containerBox.x + 48,
        rowBox.y + (rowBox.height / 2),
      );

      await expect(actionsCell).toHaveCSS('position', 'sticky');
      await expect(edit).toBeVisible();

      const pinnedBox = await actionsCell.boundingBox();
      expect(pinnedBox).not.toBeNull();
      expect(Math.abs(
        (pinnedBox.x + pinnedBox.width) - (containerBox.x + containerBox.width),
      )).toBeLessThanOrEqual(2);
    };

    // Cover the same interaction in both scroll directions: left edge, right
    // edge, then back to the middle. The actions must never drift off-screen.
    await assertPinnedAt(0);
    await assertPinnedAt(1);
    await assertPinnedAt(0.5);
  });

  // The canonical sticky quick-actions cell must stay operable beside pending-count variants
  // beyond the plain numeric badge already exercised above — the "Conciliado" pill (acc-4,
  // eTGOPendingCount = 0) and an archived row's extra badges (acc-5, only visible under the
  // "Inactivas" filter).
  test('the row kebab opens on a zero-pending ("Conciliado") row and on an archived row', async ({ page }) => {
    const zeroPendingRow = page.getByTestId('row-acc-4');
    await expect(zeroPendingRow).toBeVisible();
    await openAccountRowMenu(page, 'acc-4');
    await expect(page.getByTestId('account-row-menu-archive-acc-4')).toBeVisible();
    await page.keyboard.press('Escape');

    // Switch to the "Inactivas" filter to reveal the archived row.
    await page.getByTestId('account-type-filter-trigger').click();
    await page.getByTestId('account-type-filter-option-inactive').click();

    const archivedRow = page.getByTestId('row-acc-5');
    await expect(archivedRow).toBeVisible();
    await openAccountRowMenu(page, 'acc-5');
    await expect(page.getByTestId('account-row-menu-unarchive-acc-5')).toBeVisible();
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
 *   - `hideListBar` gates only the idle filter bar, so the selection bar itself still renders.
 *     ETP-5111: the slot KEEPS its own `cuentas-toolbar` mounted while a selection is active, so
 *     the floating pill is an addition rather than a replacement — ticking a row no longer costs
 *     the user the type filter, the search box and Reglas de conciliación.
 *
 * Exhaustive branch coverage lives at unit level:
 *   - ListView's bar + outcome wiring: components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx
 *   - the batch itself + confirm dialog: hooks/__tests__/useBulkRowDelete.vitest.jsx
 *   - the toolbar staying mounted: windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx
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

  // ETP-5111 — the toolbar no longer goes away while a selection is active (CP-9). It used to be
  // unmounted, so ticking one row cost the user the type filter, the search box and Reglas de
  // conciliación; the floating pill is an ADDITION now, not a replacement.
  test('selecting rows adds the selection bar and keeps the toolbar, with the right count', async ({ page }) => {
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    await expect(page.getByTestId('selection-count')).toHaveCount(0);

    await rowCheckbox(page, 'acc-1').click();

    // The bar has no wrapper testid — its count and its delete trigger are the two markers.
    await expect(page.getByTestId('selection-count')).toBeVisible();
    await expect(page.getByTestId('bulk-delete-selected')).toBeVisible();
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    await expect(page.getByTestId('selection-count')).toContainText('1');

    await rowCheckbox(page, 'acc-2').click();
    await expect(page.getByTestId('selection-count')).toContainText('2');
    // ETP-4972 made the trigger icon-only (no "Eliminar seleccionados (2)" text at all,
    // deliberately — the pill's own counter segment above already shows the count), so this
    // only checks the button is still there and enabled, not any text content.
    await expect(page.getByTestId('bulk-delete-selected')).toBeEnabled();
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
