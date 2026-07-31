import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Product list — `multiField` column (ETP-4603) — mocked spec.
 *
 * Covers the Product window's `name` column, which is declared as a
 * `multiField` (title: name, subtitle: searchKey, media: image, parts:
 * [searchKey, name]) — see `artifacts/product/generated/web/product/ProductTable.jsx`.
 *
 *   Suite A — Per-part header sort
 *     Each part (`Identificador` / `Nombre`) renders its own clickable segment
 *     (`column-header-sort-searchKey`, `column-header-sort-name`). Clicking a
 *     segment sorts on that part's own field (not the host column) and the
 *     request carries `_sortBy=<part.key>`. The direction arrow shows only on
 *     the currently active part.
 *
 *   Suite B — Per-part advanced filter
 *     `expandMultiFieldColumns` exposes each filterable part as its own
 *     pseudo-column in the advanced filter builder, so the user can filter on
 *     `searchKey` and `name` independently even though they share one visual
 *     column. Applying a condition sends a `criteria=` param whose
 *     `fieldName` matches the selected part's key.
 *
 * Mock mode only: routes are installed AFTER login() so they win over the
 * generic /sws/** catch-all (Playwright LIFO route matching).
 */

const ROWS = [
  {
    id: 'prod-001',
    searchKey: 'SK-001',
    name: 'Aluminum Bracket',
    '_identifier': 'Aluminum Bracket',
    productType: 'I',
    'productType$_identifier': 'Item',
  },
  {
    id: 'prod-002',
    searchKey: 'SK-002',
    name: 'Steel Bolt',
    '_identifier': 'Steel Bolt',
    productType: 'I',
    'productType$_identifier': 'Item',
  },
];

/** Install the Product list-endpoint mock. Must run AFTER login(). */
async function installProductListMock(page) {
  await page.route('**/sws/neo/product/product**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/product\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      const m = url.match(/\/product\/([^/?]+)/);
      const found = ROWS.find(r => r.id === m?.[1]) ?? ROWS[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }
    route.fallback();
  });
}

/** Parses the `criteria=` query param (JSON AdvancedCriteria) off a request URL. */
function parseCriteria(url) {
  const match = new URL(url).searchParams.get('criteria');
  return match ? JSON.parse(match) : null;
}

/** Recursively flattens an AdvancedCriteria payload (arbitrarily nested `and`/`or`
 *  groups) down to its leaf conditions (the `{ fieldName, operator, value }` entries). */
function leafConditions(criteria) {
  if (!criteria) return [];
  if (Array.isArray(criteria)) return criteria.flatMap(leafConditions);
  if (Array.isArray(criteria.criteria)) return leafConditions(criteria.criteria);
  return [criteria];
}

test.describe('Product list — multiField column (name: searchKey & name)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installProductListMock(page);
    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('renders one independently sortable segment per part', async ({ page }) => {
    await expect(page.getByTestId('column-header-sort-searchKey')).toBeVisible();
    await expect(page.getByTestId('column-header-sort-name')).toBeVisible();
  });

  test('clicking the "Identificador" segment sorts on searchKey and shows its own arrow', async ({ page }) => {
    const searchKeySegment = page.getByTestId('column-header-sort-searchKey');
    const nameSegment = page.getByTestId('column-header-sort-name');

    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/sws/neo/product/product') && req.url().includes('_sortBy=searchKey')),
      searchKeySegment.click(),
    ]);
    expect(request.url()).toContain('_sortBy=searchKey');

    await expect(searchKeySegment).toContainText(/[▲▼]/);
    await expect(nameSegment).not.toContainText(/[▲▼]/);
  });

  test('clicking the "Nombre" segment sorts on name and moves the arrow off searchKey', async ({ page }) => {
    const searchKeySegment = page.getByTestId('column-header-sort-searchKey');
    const nameSegment = page.getByTestId('column-header-sort-name');

    // First sort on searchKey so the arrow starts there, then move it to name.
    await Promise.all([
      page.waitForRequest(req => req.url().includes('_sortBy=searchKey')),
      searchKeySegment.click(),
    ]);
    await expect(searchKeySegment).toContainText(/[▲▼]/);

    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/sws/neo/product/product') && req.url().includes('_sortBy=name')),
      nameSegment.click(),
    ]);
    expect(request.url()).toContain('_sortBy=name');

    await expect(nameSegment).toContainText(/[▲▼]/);
    await expect(searchKeySegment).not.toContainText(/[▲▼]/);
  });

  test('advanced filter can target searchKey independently of name', async ({ page }) => {
    await page.getByTestId('filter-advanced').click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    await panel.locator('[role="combobox"]', { hasText: 'Selector de campo' }).first().click();
    await page.getByRole('option', { name: /^Identificador$/ }).click();
    await panel.locator('[role="combobox"]', { hasText: 'Seleccionar condición' }).first().click();
    await page.getByRole('option', { name: 'Contiene', exact: true }).click();
    await panel.getByRole('textbox').first().fill('SK-001');

    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/sws/neo/product/product') && req.url().includes('criteria=')),
      panel.getByRole('button', { name: 'Aplicar' }).click(),
    ]);

    const conditions = leafConditions(parseCriteria(request.url()));
    expect(conditions).toContainEqual(expect.objectContaining({ fieldName: 'searchKey', operator: 'iContains', value: 'SK-001' }));
  });

  test('advanced filter can target name independently of searchKey', async ({ page }) => {
    await page.getByTestId('filter-advanced').click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    await panel.locator('[role="combobox"]', { hasText: 'Selector de campo' }).first().click();
    await page.getByRole('option', { name: /^Nombre$/ }).click();
    await panel.locator('[role="combobox"]', { hasText: 'Seleccionar condición' }).first().click();
    await page.getByRole('option', { name: 'Contiene', exact: true }).click();
    await panel.getByRole('textbox').first().fill('Bracket');

    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/sws/neo/product/product') && req.url().includes('criteria=')),
      panel.getByRole('button', { name: 'Aplicar' }).click(),
    ]);

    const conditions = leafConditions(parseCriteria(request.url()));
    expect(conditions).toContainEqual(expect.objectContaining({ fieldName: 'name', operator: 'iContains', value: 'Bracket' }));
  });
});
