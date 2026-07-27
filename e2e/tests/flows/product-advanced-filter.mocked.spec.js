import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Product grid — Advanced Filter (funnel) coverage for ETP-4609 — mocked.
 *
 * ProductCustomTable.jsx (tools/app-shell/src/windows/custom/product/) declares
 * `productCategory` and `uOM` as `required: true` grid columns, and a purely
 * client-rendered `nameAndSearchKey` (`type: 'custom'`, no `column` / no
 * `backendFilterKey`). docs/list-filters.md documents two behaviors the
 * Advanced Filter builder is supposed to honor for these columns:
 *
 *   1. A `required: true` column must never offer the "Está vacío" /
 *      "No está vacío" (isNull/isNotNull) operators — a mandatory field can
 *      never legitimately be empty.
 *   2. `type: 'custom'` columns with no `column`/`backendFilterKey` are
 *      excluded from the field selector (nothing real to filter against).
 *
 * Neither is implemented yet (see AdvancedFilterBuilder.vitest.jsx for the
 * matching failing unit tests) — THIS SPEC IS EXPECTED TO FAIL on the
 * required-column assertion until a developer implements the fix.
 *
 * A third gap surfaced while writing this spec: ListView.jsx declares its own
 * `hiddenColumns = []` default prop and forwards it to whatever custom Table
 * component the window wires in; ProductCustomTable.jsx spreads `{...props}`
 * AFTER its own local `hiddenColumns={hiddenColumns}`, so ListView's
 * empty-array default silently overwrites the intended `['name', 'searchKey']`
 * override. The create-flow assertion below guards this directly (see the
 * matching regression test in ProductCustomTable.filters.vitest.jsx).
 *
 * The flow also exercises the already-shipped case-insensitive `inSet`
 * filter (PR #946) on the `productType` enum column, since it lives in the
 * same builder and the ticket asks for E2E coverage of "the filters we
 * modified" as a whole.
 *
 * Single comprehensive flow (create → hiddenColumns check → required-column
 * check → inSet check) per this repo's E2E convention of one flow per
 * describe block.
 *
 * Mocked routes are installed AFTER login() so they win over the generic
 * /sws/** catch-all (Playwright LIFO route matching) — see
 * docs/e2e-testing-guide.md.
 */

const CATEGORY_OPTION = { id: 'cat-1', label: 'General' };
const UOM_OPTION = { id: 'uom-1', label: 'Unit' };

test.describe('Product grid — Advanced Filter (ETP-4609)', () => {
  test('creates a product filling its required fields, then checks required-column operator exclusion and the inSet filter', async ({ page }) => {
    const state = { rows: [], postBodies: [] };

    await login(page);

    // Product collection endpoint: list GET, detail GET, create POST.
    await page.route('**/sws/neo/product/product**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (/\/product\/product\/selectors\//.test(url)) return route.fallback();
      if (/\/product\/product\/defaults/.test(url)) return route.fallback();

      if (method === 'GET' && !/\/product\/product\/[^/?]+/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: state.rows, totalRows: state.rows.length } }),
        });
        return;
      }

      if (method === 'GET') {
        const m = url.match(/\/product\/product\/([^/?]+)/);
        const found = state.rows.find((r) => r.id === m?.[1]) ?? state.rows[0] ?? null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: found ? [found] : [] } }),
        });
        return;
      }

      if (method === 'POST' && !/\/product\/product\/[^/?]+/.test(url)) {
        const body = req.postData() ? JSON.parse(req.postData()) : {};
        state.postBodies.push(body);
        const newRow = {
          id: 'prod-new-1',
          searchKey: body.searchKey,
          name: body.name,
          '_identifier': body.name,
          productType: body.productType || 'I',
          'productType$_identifier': 'Item',
          productCategory: body.productCategory,
          'productCategory$_identifier': CATEGORY_OPTION.label,
          uOM: body.uOM,
          'uOM$_identifier': UOM_OPTION.label,
        };
        state.rows = [...state.rows, newRow];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [newRow] } }),
        });
        return;
      }

      route.fallback();
    });

    // Defaults — pre-fills the required fields NOT under test in this flow
    // (productCategory / uOM are filled through their real selector UIs below).
    await page.route('**/sws/neo/product/product/defaults', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          defaults: {
            productType: 'I',
            purchase: 'Y',
            sale: 'Y',
            stocked: 'Y',
            returnable: 'Y',
            taxCategory: 'tax-1',
            'taxCategory$_identifier': 'IVA General',
          },
        }),
      });
    });

    // productCategory (required:true, SelectorInput — Radix Select, lazy-loaded on open).
    await page.route('**/sws/neo/product/product/selectors/M_Product_Category_ID**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: CATEGORY_OPTION.id, label: CATEGORY_OPTION.label }] }),
      });
    });

    // uOM (required:true, SearchInput — free-text combobox, fetched on focus).
    await page.route('**/sws/neo/product/product/selectors/C_UOM_ID**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: UOM_OPTION.id, label: UOM_OPTION.label }] }),
      });
    });

    // ── Step 1: create a product via the "New Product" form, filling the two
    // required grid columns the ticket calls out (productCategory, uOM). ──
    await page.goto('/product/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByTestId('field-name')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('field-name').fill('New filterable product');
    await page.getByTestId('field-searchKey').fill('PROD-NEW');

    // productCategory — Radix Select.
    await page.getByTestId('field-productCategory').click();
    await page.getByTestId(`option-productCategory-${CATEGORY_OPTION.id}`).click();

    // uOM — free-text combobox, opens its option list on focus.
    await page.getByTestId('field-uOM').click();
    await expect(page.getByTestId(`option-uOM-${UOM_OPTION.id}`)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId(`option-uOM-${UOM_OPTION.id}`).click();

    const postPromise = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/sws\/neo\/product\/product(\?|$)/.test(r.url()),
      { timeout: 10_000 },
    );
    await page.getByTestId('action-save').click();
    await postPromise;

    expect(state.postBodies).toHaveLength(1);
    expect(state.postBodies[0].productCategory).toBe(CATEGORY_OPTION.id);
    expect(state.postBodies[0].uOM).toBe(UOM_OPTION.id);

    // Back to the grid — the new product must be visible inside the combined
    // "Identificador & Nombre" avatar cell (nameAndSearchKey). Scoped by
    // data-testid (not getByText) because of a third ETP-4609 gap: ListView.jsx
    // declares its own `hiddenColumns = []` default prop and forwards it to
    // whatever custom Table component the window wires in; ProductCustomTable
    // spreads `{...props}` AFTER its own local `hiddenColumns={hiddenColumns}`,
    // so ListView's empty-array default silently overwrites the intended
    // `['name', 'searchKey']` override (see the matching regression test in
    // ProductCustomTable.filters.vitest.jsx). Today this means `name` /
    // `searchKey` ALSO render as their own separate cells, duplicating the
    // text already shown inside the avatar cell — a plain getByText('New
    // filterable product') would hit a strict-mode violation (2 matches).
    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('cell-prod-new-1-nameAndSearchKey')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('cell-prod-new-1-nameAndSearchKey')).toContainText('New filterable product');

    // The gap this guards: `name` / `searchKey` are declared hidden columns
    // (ProductCustomTable.jsx `hiddenColumns`) — they must NOT also render as
    // their own separate visible cells. Expected to FAIL today.
    await expect(page.getByTestId('cell-prod-new-1-name')).toHaveCount(0);
    await expect(page.getByTestId('cell-prod-new-1-searchKey')).toHaveCount(0);

    // ── Step 2: required-column operator exclusion (ETP-4609 gap) ──
    await page.getByTestId('filter-advanced').click();

    const popover = page.getByTestId('PopoverContent__6d5e90');
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // Positional locators: with a single condition row there are exactly two
    // <select> triggers in DOM order — [field, operator]. Using position
    // (not the trigger's currently-displayed text) keeps these valid across
    // re-selections later in the flow.
    const fieldSelect = popover.getByRole('combobox').first();
    const opSelect = popover.getByRole('combobox').nth(1);

    await fieldSelect.click();
    // Real Spanish AD field label — match loosely to survive minor label wording.
    await page.getByRole('option', { name: /categor/i }).click();

    await opSelect.click();

    // Sanity: the operator list is populated with the identifier-mode operators.
    await expect(page.getByRole('option', { name: 'Es', exact: true })).toBeVisible({ timeout: 5_000 });

    // The gap this test guards: productCategory is required:true, so the
    // empty/not-empty operators must never be offered.
    await expect(page.getByRole('option', { name: 'Está vacío', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'No está vacío', exact: true })).toHaveCount(0);

    // Dismiss the operator dropdown (click a neutral spot still inside the
    // popover) without closing the whole funnel panel.
    await popover.getByText('Donde').click();

    // ── Step 3: already-shipped case-insensitive inSet filter (ETP-4609) ──
    await fieldSelect.click();
    await page.getByRole('option', { name: /tipo de producto/i }).click();

    await opSelect.click();
    await page.getByRole('option', { name: 'Es cualquiera de', exact: true }).click();

    await popover.getByPlaceholder('Valores separados por coma').fill('i,s');

    const listReqPromise = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().includes('/sws/neo/product/product') && r.url().includes('criteria='),
      { timeout: 10_000 },
    );
    await popover.getByRole('button', { name: 'Aplicar', exact: true }).click();
    const listReq = await listReqPromise;

    // The lower-case-typed codes reach the backend request unmodified, OR-composed
    // as case-insensitive `iEquals` criteria (buildRowCriteria → generateInSetCriteria
    // in lib/gridQuery.js) — this is the ETP-4609 fix already shipped in PR #946.
    const criteriaRaw = new URL(listReq.url()).searchParams.get('criteria');
    expect(criteriaRaw).toBeTruthy();
    expect(criteriaRaw).toContain('iEquals');
    expect(criteriaRaw).toContain('"i"');
    expect(criteriaRaw).toContain('"s"');
  });
});
