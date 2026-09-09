import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Financial Accounts — real delete (ETP-4871), mocked.
 *
 * ETP-4871 splits Cuentas' generic bulk/row delete from soft-archive: DELETE
 * `/sws/neo/financial-account/account/{id}` now performs a REAL delete gated by the row's
 * `deletable` flag (every FK into `FIN_Financial_Account` is RESTRICT — `deletable` means zero
 * dependent records anywhere), while archiving moved to its own `PATCH {active:false}`. This
 * spec covers, entirely in mock mode (no backend):
 *
 *   1. ListView's generic "Eliminar seleccionados" bar stays ENABLED whatever the selection
 *      holds, including a row with `deletable === false` (ETP-5111 — see below).
 *   2. The row kebab's "Eliminar cuenta" item only appears when `deletable === true`
 *      (`AccountRowMenu.jsx`), opens `DeleteAccountDialog`, and a confirmed delete issues the
 *      real DELETE and drops the row from the list on refetch.
 *   3. The backend's 409 (a dependency appeared between the list load and the confirm) is
 *      shown verbatim and leaves the dialog open / the row in place.
 *
 * ETP-5111 inverted (1). ETP-4871 pre-disabled the bulk trash for an ineligible selection via a
 * generic `isRowDeletable` prop on `ListView`; the unified delete rule replaced that with "always
 * let the user try, then explain the failure", so the prop, its tooltip key
 * (`bulkDeleteBlockedTooltip`) and the wiring in `index.jsx` are all gone. Note (2) is UNCHANGED
 * and deliberately so: the row kebab still reads `row.deletable` directly and hides its own
 * "Eliminar cuenta" item — that per-row affordance was explicitly out of ETP-5111's scope.
 *
 * Exhaustive branch coverage lives at unit level — see:
 *   - tools/app-shell/src/hooks/__tests__/useAccountMutations.vitest.jsx (deleteAccount)
 *   - tools/app-shell/src/windows/custom/financial-account/__tests__/DeleteAccountDialog.vitest.jsx
 *   - tools/app-shell/src/components/financial-accounts/__tests__/AccountRowMenu.vitest.jsx
 *   - tools/app-shell/src/components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx
 *     ("never disabled by row eligibility" — the sentinel that replaced the deleted
 *     ListView.isRowDeletable.vitest.jsx)
 */

const ACCOUNTS = [
  {
    id: 'acc-1',
    name: 'Santander',
    type: 'B',
    currentBalance: 0,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    isDefault: true,
    eTGOPendingCount: 0,
    bankConnected: false,
    active: true,
    // Zero dependent records anywhere — the row kebab and bulk-delete both treat it as deletable.
    deletable: true,
  },
  {
    id: 'acc-2',
    name: 'Galicia',
    type: 'B',
    currentBalance: 1500.5,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000002',
    isDefault: false,
    eTGOPendingCount: 3,
    bankConnected: false,
    active: true,
    // Has movements/reconciliations/etc. — not deletable.
    deletable: false,
  },
  {
    id: 'acc-3',
    name: 'Sabadell',
    type: 'C',
    currentBalance: 0,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: '',
    isDefault: false,
    eTGOPendingCount: 0,
    active: true,
    deletable: true,
  },
];

const SUMMARY = {
  totalBalance: 1500.5,
  byCurrency: [{ currencyIso: 'EUR', total: 1500.5 }],
  pending: { accountsWithPending: 1, suggestionsReady: 0, byRule: 0 },
};

/** The row checkbox: DataTable emits no per-row select testid, so scope the generic one. */
const rowCheckbox = (page, id) => page.getByTestId(`row-${id}`).getByTestId('Checkbox__eb5261');

/**
 * Installs the `account` entity list GET. Reads `getRows` on every call (a callback, not a
 * plain array) so a suite that deletes a row between requests re-reads the current state and a
 * post-delete refetch really reflects it — same pattern as financial-accounts-page.mocked.spec.js.
 */
async function installAccountsListMock(page, getRows = () => ACCOUNTS) {
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

/**
 * Installs the per-account DELETE. Must be registered BEFORE the list mock above (Playwright
 * gives the LATER registration priority; the list handler falls through non-list requests via
 * `route.fallback()`, which resolves towards the earlier-registered handler — same ordering
 * trick `financial-accounts-page.mocked.spec.js`'s bulk-delete suite already relies on).
 *
 * `failWith409For` is a Set of ids the backend rejects with a 409 + human-readable message,
 * modelling "a dependency appeared since the row was loaded" — every other id succeeds.
 */
async function installDeleteMock(page, { deletedIds, failWith409For = new Set() }) {
  await page.route('**/sws/neo/financial-account/account/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'DELETE') {
      route.fallback();
      return;
    }
    const m = req.url().match(/\/account\/([^/?]+)/);
    const id = decodeURIComponent(m?.[1] ?? '');
    if (failWith409For.has(id)) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'No se puede eliminar: la cuenta tiene movimientos pendientes' } }),
      });
      return;
    }
    deletedIds.add(id);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ id }] } }),
    });
  });
}

test.describe('Financial Accounts — bulk delete is never pre-blocked by row eligibility (ETP-5111)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installAccountsListMock(page);
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('selecting only deletable accounts leaves "Eliminar seleccionados" enabled with the plain delete tooltip', async ({ page }) => {
    await rowCheckbox(page, 'acc-1').click();
    await rowCheckbox(page, 'acc-3').click();

    const bulkDelete = page.getByTestId('bulk-delete-selected');
    await expect(bulkDelete).toBeVisible();
    await expect(bulkDelete).toBeEnabled();
    // ETP-4972 made this button icon-only (no visible "Eliminar" label), so it always carries a
    // `title` for hover discoverability — "Eliminar" (es_ES, mock-mode default).
    await expect(bulkDelete).toHaveAttribute('title', 'Eliminar');
  });

  // ETP-5111 — this used to assert the opposite (disabled, with an explanatory blocked-count
  // tooltip). The refusal is not pre-empted any more: the delete is attempted and an account
  // with dependent records comes back as a per-row 409, reported by the outcome toast.
  test('selecting a mix that includes a non-deletable account leaves the button enabled', async ({ page }) => {
    await rowCheckbox(page, 'acc-1').click(); // deletable
    await rowCheckbox(page, 'acc-2').click(); // NOT deletable

    const bulkDelete = page.getByTestId('bulk-delete-selected');
    await expect(bulkDelete).toBeVisible();
    await expect(bulkDelete).toBeEnabled();
    // The plain delete label, never the retired `bulkDeleteBlockedTooltip` ("{count}
    // registro(s) seleccionado(s) no se pueden eliminar."), whose only digit was the count.
    await expect(bulkDelete).toHaveAttribute('title', 'Eliminar');
  });

  test('the button stays enabled with ONLY a non-deletable account selected', async ({ page }) => {
    await rowCheckbox(page, 'acc-2').click(); // NOT deletable, and nothing else

    const bulkDelete = page.getByTestId('bulk-delete-selected');
    await expect(bulkDelete).toBeVisible();
    await expect(bulkDelete).toBeEnabled();
    await expect(bulkDelete).toHaveAttribute('title', 'Eliminar');
  });

  // The toolbar swap ETP-4656 introduced was retired in the same ticket: ticking a checkbox used
  // to unmount `cuentas-toolbar` (and with it "Nueva cuenta", the filters and "Ordenar por"),
  // which the floating selection pill never actually replaced.
  test('the window toolbar stays on screen while rows are selected', async ({ page }) => {
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();

    await rowCheckbox(page, 'acc-1').click();

    await expect(page.getByTestId('bulk-delete-selected')).toBeVisible();
    await expect(page.getByTestId('cuentas-toolbar')).toBeVisible();
    await expect(page.getByTestId('cuentas-new-account-button')).toBeVisible();
  });
});

test.describe('Financial Accounts — row kebab delete (ETP-4871)', () => {
  let deletedIds;

  test.beforeEach(async ({ page }) => {
    deletedIds = new Set();
    await login(page);
    await installDeleteMock(page, { deletedIds });
    await installAccountsListMock(page, () => ACCOUNTS.filter((a) => !deletedIds.has(a.id)));
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  // ETP-5111 inverted this: the item used to be hidden on a non-deletable row, which left the
  // user unable to tell an account that CANNOT be deleted from one where the action does not
  // exist. It is offered on every row now, and the refusal is explained after confirming.
  test('offers "Eliminar cuenta" on every row, deletable or not', async ({ page }) => {
    // The kebab trigger sits behind `opacity-0 group-hover:opacity-100` — hover the row first,
    // same as the existing financial-accounts-page.mocked.spec.js row-actions coverage.
    await page.getByTestId('row-acc-1').hover();
    await page.getByTestId('account-row-menu-trigger-acc-1').click();
    await expect(page.getByTestId('account-row-menu-delete-acc-1')).toBeVisible();
    await page.keyboard.press('Escape');

    // acc-2 is the NON-deletable fixture — the one that used to have no item at all.
    await page.getByTestId('row-acc-2').hover();
    await page.getByTestId('account-row-menu-trigger-acc-2').click();
    await expect(page.getByTestId('account-row-menu-delete-acc-2')).toBeVisible();
  });

  test('confirming the delete removes the row and shows a success toast', async ({ page }) => {
    await page.getByTestId('row-acc-1').hover();
    await page.getByTestId('account-row-menu-trigger-acc-1').click();
    await page.getByTestId('account-row-menu-delete-acc-1').click();

    const dialog = page.getByTestId('delete-account-dialog');
    await expect(dialog).toBeVisible();

    await page.getByTestId('delete-account-confirm').click();

    await expect(page.locator('[data-type="success"]')).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('row-acc-1')).toHaveCount(0);
  });

  test('cancel dismisses the dialog without deleting', async ({ page }) => {
    await page.getByTestId('row-acc-1').hover();
    await page.getByTestId('account-row-menu-trigger-acc-1').click();
    await page.getByTestId('account-row-menu-delete-acc-1').click();

    const dialog = page.getByTestId('delete-account-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('Button__delete-account-cancel').click();

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('row-acc-1')).toBeVisible();
    expect(deletedIds.has('acc-1')).toBe(false);
  });
});

test.describe('Financial Accounts — delete rejected with 409 (ETP-4871)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installDeleteMock(page, { deletedIds: new Set(), failWith409For: new Set(['acc-1']) });
    await installAccountsListMock(page);
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('shows the backend message verbatim and keeps the dialog open and the row in place', async ({ page }) => {
    await page.getByTestId('row-acc-1').hover();
    await page.getByTestId('account-row-menu-trigger-acc-1').click();
    await page.getByTestId('account-row-menu-delete-acc-1').click();

    const dialog = page.getByTestId('delete-account-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('delete-account-confirm').click();

    const errorToast = page.locator('[data-type="error"]');
    await expect(errorToast).toBeVisible({ timeout: 5_000 });
    await expect(errorToast).toContainText('No se puede eliminar');

    // The dialog stays open (no onClose on failure) and the row is still there.
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('row-acc-1')).toBeVisible();
  });
});
