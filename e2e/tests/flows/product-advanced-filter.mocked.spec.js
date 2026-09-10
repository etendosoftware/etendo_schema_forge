import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Product grid — Advanced Filter (funnel) coverage for ETP-4609 — mocked.
 *
 * NOTE (ETP-4603): the grid identity cell is now the generic `multiField`
 * cell, NOT the old ETP-4609 `nameAndSearchKey` custom cell. The advanced-
 * filter functional flow below is still the ETP-4609 feature and is
 * unchanged; only the identity-cell + field-selector assertions were
 * realigned to the multiField model (see the inline blocks below).
 *
 * Maps directly to the 5 acceptance-criteria bullets on the Jira ticket:
 *
 *   1. Crear un producto nuevo desde la ventana Producto.
 *   2. Verificar labels correctos en el selector de campos del filtro (sin
 *      claves internas) — the field dropdown must show human AD labels
 *      ("Categoría...", "Tipo", "Unidad de medida...") and never raw
 *      internal keys (`productCategory`, `productType`, `uOM`). Post
 *      ETP-4603 the `multiField` identity column is pre-expanded (via
 *      `expandMultiFieldColumns` in ListView.jsx) into its `parts`, so the
 *      human labels "Nombre" (name) and "Identificador" (searchKey) DO now
 *      appear as filterable options; the never-existed raw key
 *      `nameAndSearchKey` must still not appear.
 *   3. Filtrar por Categoría con operador "Es" y validar que el buscador
 *      funcione — selecting "Es" on the identifier-mode `productCategory`
 *      column opens the `IdentifierMultiPicker` (checkbox popover backed by
 *      `GET .../product?_distinct=productCategory&_distinctSearch=...`);
 *      typing a fragment of the label must narrow the picker's own results,
 *      and applying the filter must narrow the GRID to the matching rows.
 *   4. Filtrar por Tipo (an `enumLabel` column) and validate the grid
 *      narrows correctly — as of ETP-4956 (published in
 *      `@etendosoftware/app-shell-core` 0.3.45), `inSet` ("Es cualquiera de")
 *      was removed from `OPERATORS_BY_MODE.enumLabel`: enum columns no
 *      longer offer it as a freshly-selectable operator, because their
 *      values are now picked through a multi-select checkbox popover
 *      (`DistinctEnumPicker`) instead of a free-text, comma-separated,
 *      case-sensitive-on-the-backend input. That also retires the
 *      case-insensitive-typed-codes concern this bullet used to cover —
 *      there is no free text left to mistype the case of. This spec now
 *      asserts (a) `inSet` is correctly absent from the operator dropdown
 *      for `productType`, and (b) the "Es" (equals) operator drives the same
 *      real narrowing behavior via `DistinctEnumPicker`'s checkbox
 *      multi-select, OR-composed as `equals` (not `iEquals` — the codes come
 *      from checkboxes, never typed, so there is nothing to case-fold).
 *   5. Verificar que campos obligatorios no muestren operadores "Está
 *      vacío"/"No está vacío" — `productCategory` is `required: true`.
 *
 * ProductCustomTable.jsx (tools/app-shell/src/windows/custom/product/) now
 * declares a single generic `multiField` identity column (`key: 'name'`,
 * `column: 'Name'`, `parts` = searchKey→Value + name→Name) that the shared
 * grid renders as ONE cell `cell-<rowId>-name`: a bold title (name) plus a
 * subtitle chip (searchKey). There is no `nameAndSearchKey` column and no
 * local `hiddenColumns` override anymore (see the matching Vitest suite
 * ProductCustomTable.filters.vitest.jsx and docs/list-filters.md).
 *
 * Single comprehensive flow (create → multiField identity-cell check →
 * field-label check → Categoría "Es" + search + grid narrowing → Tipo "Es"
 * checkbox multi-select + grid narrowing (inSet absence asserted) →
 * required-column operator exclusion) per this repo's E2E convention of one
 * flow per describe block.
 *
 * Mocked routes are installed AFTER login() so they win over the generic
 * /sws/** catch-all (Playwright LIFO route matching) — see
 * docs/e2e-testing-guide.md. The mocked list-GET route parses and honors
 * the `criteria` query param (equals / iEquals / AdvancedCriteria-wrapped
 * OR) so grid narrowing can be asserted against real rendered rows, not
 * just the outgoing request shape.
 */

const CATEGORY_OPTION = { id: 'cat-1', label: 'General' };
const OTHER_CATEGORY_OPTION = { id: 'cat-2', label: 'Servicios' };
const UOM_OPTION = { id: 'uom-1', label: 'Unit' };

// Pre-existing products (not created through the UI — only the "new" one is,
// per acceptance bullet 1) used to exercise real grid narrowing:
//   - prod-other-category: different productCategory (cat-2) and productType 'S'.
//   - prod-same-category:  same productCategory as the new product (cat-1), but
//     a different productType ('R') so the two filter steps disagree on it.
const SEED_ROWS = [
  {
    id: 'prod-other-category',
    searchKey: 'PROD-SVC',
    name: 'Existing service product',
    '_identifier': 'Existing service product',
    productType: 'S',
    'productType$_identifier': 'Service',
    productCategory: OTHER_CATEGORY_OPTION.id,
    'productCategory$_identifier': OTHER_CATEGORY_OPTION.label,
    uOM: UOM_OPTION.id,
    'uOM$_identifier': UOM_OPTION.label,
  },
  {
    id: 'prod-same-category',
    searchKey: 'PROD-RES',
    name: 'Existing resource product',
    '_identifier': 'Existing resource product',
    productType: 'R',
    'productType$_identifier': 'Resource',
    productCategory: CATEGORY_OPTION.id,
    'productCategory$_identifier': CATEGORY_OPTION.label,
    uOM: UOM_OPTION.id,
    'uOM$_identifier': UOM_OPTION.label,
  },
];

/**
 * Minimal server-side criteria evaluator for the mocked list GET — only
 * supports what THIS spec's filters actually emit (equals / iEquals, plus
 * the AdvancedCriteria OR wrapper `buildAdvancedFilterCriteria` uses for
 * multi-value inSet). See lib/gridQuery.js buildRowCriteria/buildOrCriteria.
 */
function rowMatchesCriteriaNode(row, node) {
  if (!node) return true;
  if (node._constructor === 'AdvancedCriteria') {
    const combinator = node.operator === 'or' ? 'some' : 'every';
    return (node.criteria || [])[combinator]((c) => rowMatchesCriteriaNode(row, c));
  }
  const { fieldName, operator, value } = node;
  const raw = row[fieldName];
  if (operator === 'iEquals') {
    return String(raw ?? '').toLowerCase() === String(value ?? '').toLowerCase();
  }
  if (operator === 'equals') {
    return String(raw ?? '') === String(value ?? '');
  }
  // Every other operator used elsewhere in this spec's flow (isNull checks
  // that never get applied, etc.) is a no-op pass-through.
  return true;
}

function filterRowsByCriteria(rows, criteriaRaw) {
  if (!criteriaRaw) return rows;
  let criteria;
  try {
    criteria = JSON.parse(criteriaRaw);
  } catch {
    return rows;
  }
  if (!Array.isArray(criteria)) criteria = [criteria];
  return rows.filter((r) => criteria.every((node) => rowMatchesCriteriaNode(r, node)));
}

test.describe('Product grid — Advanced Filter (ETP-4609)', () => {
  test('creates a product, then validates field labels, Categoría search+equals, Tipo equals multi-select (inSet no longer offered for enum columns, ETP-4956), and required-column operator exclusion', async ({ page }) => {
    const state = { rows: [...SEED_ROWS], postBodies: [] };

    await login(page);

    // Product collection endpoint: list GET (criteria-aware), detail GET,
    // create POST, and the `_distinct` endpoint backing IdentifierMultiPicker.
    await page.route('**/sws/neo/product/product{/**,}**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (/\/product\/product\/selectors\//.test(url)) return route.fallback();
      if (/\/product\/product\/defaults/.test(url)) return route.fallback();

      if (method === 'GET' && url.includes('_distinct=')) {
        const parsed = new URL(url);
        const field = parsed.searchParams.get('_distinct');
        const search = (parsed.searchParams.get('_distinctSearch') || '').toLowerCase();
        let entries = [];
        if (field === 'productCategory') {
          entries = [
            { id: CATEGORY_OPTION.id, _identifier: CATEGORY_OPTION.label },
            { id: OTHER_CATEGORY_OPTION.id, _identifier: OTHER_CATEGORY_OPTION.label },
          ];
        }
        if (field === 'productType') {
          // DistinctEnumPicker only reads `id` from these entries — labels
          // come from the column's own `enumLabels` i18n keys, not from
          // `_identifier` (see labelFor() in AdvancedFilterBuilder.jsx).
          entries = ['I', 'S', 'R', 'E'].map((id) => ({ id, _identifier: id }));
        }
        if (search) {
          entries = entries.filter((e) => e._identifier.toLowerCase().includes(search));
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: entries, hasMore: false } }),
        });
        return;
      }

      if (method === 'GET' && !/\/product\/product\/[^/?]+/.test(url)) {
        const parsed = new URL(url);
        const rows = filterRowsByCriteria(state.rows, parsed.searchParams.get('criteria'));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
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
    await page.route('**/sws/neo/product/product/selectors/M_Product_Category_ID{/**,}**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: CATEGORY_OPTION.id, label: CATEGORY_OPTION.label }] }),
      });
    });

    // uOM (required:true, SearchInput — free-text combobox, fetched on focus).
    await page.route('**/sws/neo/product/product/selectors/C_UOM_ID{/**,}**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: UOM_OPTION.id, label: UOM_OPTION.label }] }),
      });
    });

    // ── Bullet 1: create a product via the "New Product" form, filling the
    // two required grid columns the ticket calls out (productCategory, uOM). ──
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

    // Back to the grid — the new product must be visible inside the generic
    // `multiField` identity cell (ETP-4603). Scoped by data-testid (not
    // getByText): the shared grid renders the multiField column as ONE cell
    // `cell-<rowId>-name` (pattern `cell-${row.id}-${col.key}`, col.key='name')
    // whose body is a bold title (the `name` value) plus a subtitle chip (the
    // `searchKey` value). searchKey is the subtitle chip INSIDE the name cell,
    // so it must NOT render as its own separate `cell-prod-new-1-searchKey`.
    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('cell-prod-new-1-name')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('cell-prod-new-1-name')).toContainText('New filterable product');
    // The searchKey value ('PROD-NEW') is the subtitle chip inside the same cell.
    await expect(page.getByTestId('cell-prod-new-1-name')).toContainText('PROD-NEW');
    await expect(page.getByTestId('cell-prod-new-1-searchKey')).toHaveCount(0);

    // ── Open the funnel and the field selector dropdown ──
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

    // ── Bullet 2: field selector shows human labels, never raw internal
    // keys. The never-existed key `nameAndSearchKey` must still not appear as
    // an option. ──
    for (const rawKey of ['productCategory', 'nameAndSearchKey', 'productType', 'uOM']) {
      await expect(page.getByRole('option', { name: rawKey, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('option', { name: /categor/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('option', { name: 'Tipo', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: /unidad/i })).toBeVisible();
    // ETP-4603: the `multiField` identity column is pre-expanded into its
    // `parts`, so filtering by name/searchKey is now enabled — their human
    // labels "Nombre" and "Identificador" appear as filterable options
    // (mocked locale defaults to es_ES).
    await expect(page.getByRole('option', { name: /nombre/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /identificador/i })).toBeVisible();

    await page.getByRole('option', { name: /categor/i }).click();

    await opSelect.click();

    // ── Bullet 5: productCategory is required:true — the empty/not-empty
    // operators must never be offered. ──
    await expect(page.getByRole('option', { name: 'Es', exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('option', { name: 'Está vacío', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'No está vacío', exact: true })).toHaveCount(0);

    // ── Bullet 3: Filtrar por Categoría con operador "Es" y validar que el
    // buscador funcione. ──
    await page.getByRole('option', { name: 'Es', exact: true }).click();

    // Identifier-mode "Es" (equals, not a textual op) opens the
    // IdentifierMultiPicker — a checkbox popover backed by the `_distinct`
    // endpoint, not a free-text input. Its PopoverContent portals to
    // document.body as its own top-level dialog (a sibling of the funnel
    // panel's own portal, not a DOM descendant of it) — so it must be
    // located at the page level, not scoped to `popover`.
    const valueTrigger = popover.getByRole('button', { name: 'Seleccionar valor' });
    await valueTrigger.click();

    // The global search bar also contains a longer placeholder beginning with
    // "Buscar". Use the picker input's exact placeholder to avoid matching
    // both controls now that global search is present on every window.
    const searchInput = page.locator('input[placeholder="Buscar"]');
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Validate the searcher: typing a fragment of the label narrows the
    // picker's own option list (proves it round-trips through
    // `_distinctSearch`, not just a static/local filter).
    await searchInput.fill('Gen');
    await expect(page.getByRole('button', { name: CATEGORY_OPTION.label, exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: OTHER_CATEGORY_OPTION.label, exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: CATEGORY_OPTION.label, exact: true }).click();

    // Close the value picker (Escape only closes the innermost open Radix
    // Popover, mirroring the operator-select dismissal above) without
    // closing the outer funnel panel.
    await page.keyboard.press('Escape');
    await expect(searchInput).toHaveCount(0);

    const categoryListReqPromise = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().includes('/sws/neo/product/product') && r.url().includes('criteria='),
      { timeout: 10_000 },
    );
    await popover.getByRole('button', { name: 'Aplicar', exact: true }).click();
    const categoryListReq = await categoryListReqPromise;

    const categoryCriteriaRaw = new URL(categoryListReq.url()).searchParams.get('criteria');
    expect(categoryCriteriaRaw).toBeTruthy();
    expect(categoryCriteriaRaw).toContain('"productCategory"');
    expect(categoryCriteriaRaw).toContain('"equals"');
    expect(categoryCriteriaRaw).toContain(`"${CATEGORY_OPTION.id}"`);

    // The grid actually narrows to the two products sharing CATEGORY_OPTION
    // (the newly created one + the pre-existing same-category seed row) —
    // the different-category seed row disappears.
    await expect(page.getByTestId('row-prod-new-1')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('row-prod-same-category')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('row-prod-other-category')).toHaveCount(0);

    // ── Bullet 4: Filtrar por Tipo (enumLabel column) — "Es cualquiera de"
    // (inSet) must NOT be a freshly-selectable operator (ETP-4956); "Es"
    // (equals) drives the same real narrowing via DistinctEnumPicker's
    // checkbox multi-select. ──
    await page.getByTestId('filter-advanced').click();
    await expect(popover).toBeVisible({ timeout: 5_000 });

    await fieldSelect.click();
    // Field label is the short AD field label ("Tipo"), not the column's
    // internal English key/name — match the actual rendered option text.
    await page.getByRole('option', { name: 'Tipo', exact: true }).click();

    await opSelect.click();

    // Regression guard for ETP-4956: enum columns no longer offer inSet as a
    // fresh choice — only "Es"/"No es" (equals/notEqual).
    await expect(page.getByRole('option', { name: 'Es cualquiera de', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Es', exact: true })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('option', { name: 'Es', exact: true }).click();

    // "Es" on an enumLabel column opens DistinctEnumPicker — a checkbox
    // popover backed by the same `_distinct` endpoint as Categoría's
    // IdentifierMultiPicker above, but rendering the column's own
    // `enumLabels` i18n labels rather than raw codes or `_identifier`s.
    const typeValueTrigger = popover.getByRole('button', { name: 'Seleccionar valor' });
    await typeValueTrigger.click();

    // DistinctEnumPicker's own search input uses a different placeholder
    // ("Buscar valor...") than IdentifierMultiPicker's ("Buscar") above.
    await expect(page.getByPlaceholder('Buscar valor...')).toBeVisible({ timeout: 5_000 });

    // Multi-select: the popover stays open across clicks so both codes can
    // be ticked in one pass — mirrors real user behavior for "is any of".
    await page.getByRole('button', { name: 'Artículo', exact: true }).click();
    await page.getByRole('button', { name: 'Servicio', exact: true }).click();

    // Close the value picker without closing the outer funnel panel.
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Buscar valor...')).toHaveCount(0);

    const typeListReqPromise = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().includes('/sws/neo/product/product') && r.url().includes('criteria='),
      { timeout: 10_000 },
    );
    await popover.getByRole('button', { name: 'Aplicar', exact: true }).click();
    const typeListReq = await typeListReqPromise;

    // The checked codes reach the backend OR-composed as plain `equals`
    // criteria (buildRowCriteria → buildOrCriteria in lib/gridQuery.js) —
    // never `iEquals`/`inSet`: values come from checkboxes bound to real
    // backend codes, not typed free text, so there is nothing to case-fold.
    const typeCriteriaRaw = new URL(typeListReq.url()).searchParams.get('criteria');
    expect(typeCriteriaRaw).toBeTruthy();
    expect(typeCriteriaRaw).toContain('"productType"');
    expect(typeCriteriaRaw).toContain('"equals"');
    expect(typeCriteriaRaw).not.toContain('iEquals');
    expect(typeCriteriaRaw).not.toContain('inSet');
    expect(typeCriteriaRaw).toContain('"I"');
    expect(typeCriteriaRaw).toContain('"S"');

    // The grid narrows to the case-insensitively-matching productType rows:
    // the new product (backend code "I") and the different-category seed row
    // (backend code "S") — the same-category seed row ("R") disappears, even
    // though it matched the previous (now-replaced) Categoría filter.
    await expect(page.getByTestId('row-prod-new-1')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('row-prod-other-category')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('row-prod-same-category')).toHaveCount(0);
  });
});
