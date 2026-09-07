import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-5182 — Bug 1: sorting the Contacts list resized every column
 * (regression spec).
 *
 * Bug: clicking a sortable column header in the Contacts list (any window
 * using `ListView`/`DataTable` in normal list-header mode, i.e. `hideHeader`
 * false) visibly resized every column. Root cause:
 * `DataTable.jsx`'s `getTableContainerStyle(hideHeader)` only set
 * `table-layout: fixed` when `hideHeader` was true (the add-row-only inline
 * mode); normal list-header mode got no `table-layout` style at all, so the
 * browser fell back to `table-layout: auto`, which recomputes every column's
 * width from ALL currently-rendered body-row content on every re-render.
 * Sorting re-fetches a different page of rows from the backend
 * (`_sortBy=<field>`), so the visible content per column changed and the
 * browser recalculated — and visibly jumped — every column's width.
 *
 * Fix: `getTableContainerStyle` now always returns
 * `{ tableLayout: 'fixed', width: '100%' }`. Per the CSS table-layout spec,
 * `fixed` derives column widths from the FIRST row's cells (here, the header
 * row — `<TableHeader>` precedes `<TableBody>` in the DOM) ONCE, and does not
 * recompute them from body content afterward — so a sort that swaps in rows
 * with drastically different content no longer changes any column width.
 *
 * This spec mocks the Contacts list (`/sws/neo/contacts/businessPartner`)
 * with a default response whose rows have short `name` values, and a
 * `_sortBy=name desc` response whose `name` values are deliberately very
 * long — the exact shape of content-driven width jump `table-layout: auto`
 * would produce. It captures the `name` column header's
 * `getBoundingClientRect()` width before and after clicking that header to
 * sort, and asserts it is unchanged — the same before/after real-layout
 * technique `lines-overflow-etp5133.mocked.spec.js` (ETP-5133) uses to prove
 * layout stability in a real browser (jsdom, used by the Vitest unit test
 * for `getTableContainerStyle`, has no layout engine and cannot prove this).
 *
 * NOTE on the mock's sort predicate: `artifacts/contacts/decisions.json` sets
 * `listSortBy: "name asc"`, so the Contacts list now opens ALREADY sorted by
 * `name asc` (see `ListView.jsx`'s `parseListSortBy` / `initialSortColumn`).
 * That means the very first request already carries `_sortBy=name asc`, so
 * the mock cannot key off "does the URL mention name" — it must key off
 * DIRECTION. A single click on the (already-sorted) `name` header toggles
 * asc -> desc (see `handleColumnSort` in `ListView.jsx`), so: initial load
 * (`name asc`) -> SHORT_ROWS, first click (`name desc`) -> SORTED_ROWS
 * (long names).
 */

const SHORT_ROWS = [
  { id: 'bp-1', name: 'Ana', customer: true, vendor: false, etgoIsperson: 'Y', eTGOLocation: 'ES', etgoEmail: 'a@x.es', etgoPhone: '1' },
  { id: 'bp-2', name: 'Bea', customer: false, vendor: true, etgoIsperson: 'Y', eTGOLocation: 'ES', etgoEmail: 'b@x.es', etgoPhone: '2' },
  { id: 'bp-3', name: 'Cid', customer: true, vendor: true, etgoIsperson: 'Y', eTGOLocation: 'ES', etgoEmail: 'c@x.es', etgoPhone: '3' },
];

// Deliberately much wider `name` content than SHORT_ROWS — this is the
// content-driven width jump `table-layout: auto` would produce on sort.
const LONG_NAME = 'Distribuciones y Suministros Industriales del Mediterráneo Sociedad Limitada';
const SORTED_ROWS = [
  { id: 'bp-1', name: LONG_NAME, customer: true, vendor: false, etgoIsperson: 'N', eTGOLocation: 'ES', etgoEmail: 'a@x.es', etgoPhone: '1' },
  { id: 'bp-2', name: `${LONG_NAME} Dos`, customer: false, vendor: true, etgoIsperson: 'N', eTGOLocation: 'ES', etgoEmail: 'b@x.es', etgoPhone: '2' },
  { id: 'bp-3', name: `${LONG_NAME} Tres`, customer: true, vendor: true, etgoIsperson: 'N', eTGOLocation: 'ES', etgoEmail: 'c@x.es', etgoPhone: '3' },
];

async function installMocks(page) {
  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();
    if (/\/businessPartner\/[^/?]+/.test(url)) return route.fallback();

    // Contacts opens already sorted `name asc` (decisions.json listSortBy),
    // so distinguish by DIRECTION, not by the mere presence of `_sortBy=name`
    // — both the initial load and the toggled state carry that field name.
    const sortedDesc = /_sortBy=name(\s|\+|%20)desc/.test(url);
    const rows = sortedDesc ? SORTED_ROWS : SHORT_ROWS;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
    });
  });

  // Every other entity this window's secondary tabs / widgets might touch —
  // return empty so nothing else errors out while we exercise the list.
  for (const entity of ['contact', 'bankAccount', 'locationAddress', 'customer', 'vendorCreditor', 'customerAccounting', 'vendorAccounting']) {
    await page.route(`**/sws/neo/contacts/${entity}{/**,}**`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [], totalRows: 0 } }) });
      }
      route.fallback();
    });
  }
}

test.describe('ETP-5182 — Contacts list column widths stay stable across sort (mocked)', () => {
  test('sorting by Name does not resize the Name column header', async ({ page }) => {
    await login(page);
    await installMocks(page);

    await page.goto('/contacts');

    const nameHeader = page.getByTestId('column-header-name');
    await expect(nameHeader).toBeVisible({ timeout: 10_000 });
    // Initial load is already sorted `name asc` (decisions.json listSortBy) —
    // that still resolves to SHORT_ROWS under the direction-based mock above.
    await expect(page.getByText('Ana', { exact: true })).toBeVisible({ timeout: 10_000 });

    const widthBefore = await nameHeader.evaluate((el) => el.getBoundingClientRect().width);

    // The name column is already the active sort (asc), so this click toggles
    // it to desc — not to a fresh "name" sort — per handleColumnSort in
    // ListView.jsx.
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/sws/neo/contacts/businessPartner') && /_sortBy=name(\+|%20)desc/.test(req.url())),
      nameHeader.locator('button').click(),
    ]);
    expect(request.url()).toMatch(/_sortBy=name(\+|%20)desc/);

    // Wait for the long-content sorted rows to actually render before re-measuring.
    await expect(page.getByText(LONG_NAME, { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    const widthAfter = await nameHeader.evaluate((el) => el.getBoundingClientRect().width);

    expect(widthAfter).toBe(widthBefore);
  });
});
