// @covers tools/app-shell/src/windows/custom/contacts/ContactsEmptyState.jsx
// @covers tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
// @covers tools/app-shell/src/lib/walkthrough/useLaunchWalkthrough.js
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Contacts — the full-area "start here" state of an EMPTY Contacts list (mocked).
 *
 * ListView hands the Table an `emptyListContext` only when the fetch SUCCEEDED, returned no rows
 * and nothing the user chose narrowed it; ContactsTable then renders ContactsEmptyState instead
 * of the grid. "Succeeded" is read from the response envelope (`hook.meta`), so the list mock
 * below returns a NEO-like envelope with `status` / `startRow` / `totalRows` — a bare
 * `{ response: { data: [] } }` leaves `meta` null and the empty state never renders.
 *
 * Run against plain `make dev` (not `make dev-mock`): the data comes from `page.route()`.
 */

const EMPTY_LIST = { response: { status: 0, startRow: 0, endRow: -1, totalRows: 0, data: [] } };

/** The Contacts list endpoint answers an empty, successful page. Sub-paths fall through. */
async function installEmptyContactsList(page) {
  const handler = async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && !/\/businessPartner\/[^/?]+/.test(req.url())) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_LIST) });
    }
    return route.fallback();
  };
  // Two routes on purpose: a glued `businessPartner**` does not cross a `/` (see
  // docs/e2e-testing-guide.md, "a route pattern ending in a bare `word**`").
  await page.route('**/sws/neo/contacts/businessPartner**', handler);
  await page.route('**/sws/neo/contacts/businessPartner/**', handler);
}

async function openContacts(page) {
  await page.goto('/contacts');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('Contacts — empty list state (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installEmptyContactsList(page);
  });

  test('an empty tenant sees the start-here state instead of an empty grid', async ({ page }) => {
    await openContacts(page);

    await expect(page.getByTestId('contacts-empty-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('contacts-empty-state-dropzone')).toBeVisible();
    await expect(page.getByTestId('column-header-name')).toHaveCount(0);
  });

  test('"Nuevo contacto" opens the new-contact form', async ({ page }) => {
    await openContacts(page);

    await page.getByTestId('contacts-empty-state-new').click();

    await expect(page).toHaveURL(/\/contacts\/new$/);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
  });

  test('a filter that matches nothing keeps the grid, not the start-here state', async ({ page }) => {
    // The user filtered the list by type, left it and came back: ListView restores the
    // filter from the session snapshot (lib/listViewSession.js), the server answers an empty
    // page, and an empty page under a user filter is "no results", not "no contacts".
    await page.addInitScript(() => {
      sessionStorage.setItem('listState:contacts', JSON.stringify({
        v: 1,
        columnFilters: { __contactType: { mode: 'enumLabel', value: ['vendor'], originalValue: 'vendor' } },
        advancedFilter: null,
        subsetIndex: null,
        quickFilterIndices: [],
        sortColumn: null,
        sortDirection: null,
      }));
    });
    await openContacts(page);

    await expect(page.getByTestId('column-header-name')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('contacts-empty-state')).toHaveCount(0);
  });

  test('"Ver guía" starts the create-contact walkthrough at its first step', async ({ page }) => {
    await openContacts(page);

    await page.getByTestId('contacts-empty-state-view-guide').click();

    const overlay = page.getByTestId('walkthrough-overlay');
    await expect(overlay).toHaveAttribute('data-walkthrough-flow', 'create-contact', { timeout: 10_000 });
    await expect(overlay).toHaveAttribute('data-walkthrough-step', 'open-new');
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
  });

  test('dropping a file on the start-here zone opens the import dialog', async ({ page }) => {
    await openContacts(page);
    const zone = page.getByTestId('contacts-empty-state-dropzone').getByTestId('ImportDropzone__zone');
    await expect(zone).toBeVisible({ timeout: 10_000 });

    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['Nombre comercial\nAcme Iberia\n'], 'contacts.csv', { type: 'text/csv' }));
      return dt;
    });
    await zone.dispatchEvent('drop', { dataTransfer });

    // Only the opening is asserted: whether the dialog starts on the mapping step with the
    // dropped file preloaded depends on the core ImportDialog `initialFile` support.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  });
});
