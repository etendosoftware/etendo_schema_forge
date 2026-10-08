// @covers tools/app-shell/src/components/contract-ui/EntityForm.jsx
// @covers tools/app-shell/src/components/contract-ui/formResponsiveLayout.js
// @covers tools/app-shell/src/components/contract-ui/FormShowMoreToggle.jsx
// @covers tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
// @covers tools/app-shell/src/windows/custom/warehouse/index.jsx
// @covers tools/app-shell/src/windows/custom/product/ProductPriceBar.jsx
// @covers artifacts/product/decisions.json
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Form View at the minimum supported resolution (1280×720) — ETP-5513.
 *
 * jsdom has no layout, so the unit suites (`EntityForm-grid.vitest.jsx`,
 * `ProductPriceBar.vitest.jsx`) can only pin the classes and the column count
 * resolved from a STUBBED width. This spec measures the real geometry:
 *
 *   1. Purchase Invoice → New, rail expanded and collapsed: the header form
 *      (measured from its own width, next to the 320 px OCR side panel) lays
 *      out in 3 columns and shows only its first 2 rows; "Mostrar más datos"
 *      reveals the rest and "Mostrar menos datos" hides it again.
 *   2. Product and Warehouse: the detail sidebar is a fixed 320 px column.
 *   3. Product → Precio (Venta and Compra): the price columns stay inside the
 *      tab — nothing scrolls horizontally, nothing ends past the sidebar.
 *
 * Mock mode renders in `es_ES` (the wider locale), so text anchors are Spanish.
 * Run against plain `make dev`, never `make dev-mock` (see the VITE_MOCK gotcha
 * in docs/e2e-testing-guide.md).
 */

const VIEWPORT = { width: 1280, height: 720 };
const EDGE_TOLERANCE_PX = 1;
const SETTLE_MS = 300;

async function openAt(page, path, { railExpanded = true } = {}) {
  // Same key SidebarContext.jsx reads; the minimum layout is WITH the rail expanded.
  await page.addInitScript((value) => {
    try { localStorage.setItem('sidebar-expanded', value); } catch { /* noop */ }
  }, String(railExpanded));
  await page.setViewportSize(VIEWPORT);
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
}

async function expectNoHorizontalPageScroll(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'the page must not scroll horizontally').toBeLessThanOrEqual(clientWidth);
}

/**
 * Geometry of the header grid that hosts the show-more toggle: its column
 * count (distinct left edges of the field cells) and row count (distinct tops).
 */
async function measureHeaderGrid(toggle) {
  return toggle.evaluate((button) => {
    const grid = button.parentElement.parentElement;
    const cells = Array.from(grid.children).filter((c) => c.querySelector('[data-testid^="field-"]'));
    const lefts = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left)));
    const tops = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top)));
    const g = grid.getBoundingClientRect();
    return {
      fields: cells.length,
      columns: lefts.size,
      rows: tops.size,
      right: g.right,
      scrollWidth: grid.scrollWidth,
      clientWidth: grid.clientWidth,
    };
  });
}

async function rectOf(locator) {
  return locator.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, width: b.width };
  });
}

// ---------------------------------------------------------------------------
// 1. Purchase Invoice → New
// ---------------------------------------------------------------------------

test.describe('Form View 1280×720 — Purchase Invoice header (ETP-5513)', () => {
  for (const railExpanded of [true, false]) {
    test(`header in 3 columns, 2 rows + show more — rail ${railExpanded ? 'expanded' : 'collapsed'}`, async ({ page }) => {
      await login(page);
      await openAt(page, '/purchase-invoice/new', { railExpanded });

      const toggle = page.getByTestId('form-show-more-toggle');
      await expect(toggle).toBeVisible({ timeout: 15_000 });
      await settle(page);

      // Collapsed: 3 columns, first 2 rows only.
      const collapsed = await measureHeaderGrid(toggle);
      expect(collapsed.columns, 'header must lay out in 3 columns').toBe(3);
      expect(collapsed.rows, 'only the first 2 rows are shown').toBe(2);
      expect(collapsed.fields).toBe(6);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveText(/Mostrar más datos/);

      // The OCR side panel is a fixed 320 px column and the header ends before it.
      const sidePanel = page.getByText('Subir Factura').locator('xpath=ancestor::div[@style][1]');
      const panel = await rectOf(sidePanel);
      expect(Math.abs(panel.width - 320), `side panel is ${panel.width}px`).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
      expect(collapsed.right, 'header grid runs under the side panel').toBeLessThanOrEqual(panel.left + EDGE_TOLERANCE_PX);
      expect(collapsed.scrollWidth).toBeLessThanOrEqual(collapsed.clientWidth);

      // Expand: more rows, still 3 columns.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveText(/Mostrar menos datos/);
      const expanded = await measureHeaderGrid(toggle);
      expect(expanded.fields).toBeGreaterThan(collapsed.fields);
      expect(expanded.rows).toBeGreaterThan(2);
      expect(expanded.columns).toBe(3);

      // Collapse back to the same 2 rows.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const again = await measureHeaderGrid(toggle);
      expect(again.fields).toBe(collapsed.fields);
      expect(again.rows).toBe(2);

      await expectNoHorizontalPageScroll(page);
    });
  }
});

// ---------------------------------------------------------------------------
// 2 + 3. Product and Warehouse sidebars, Product price tab
// ---------------------------------------------------------------------------

const PRODUCT = {
  id: 'PROD-1280',
  searchKey: 'PROD-1280',
  name: 'Producto 1280',
  _identifier: 'Producto 1280',
  productType: 'I',
  'productType$_identifier': 'Artículo',
  purchase: true,
  sale: true,
  stocked: true,
};

// Long tariff names on purpose: the name column is the one that has to give way.
const PRICE_ROWS = [
  {
    id: 'price-1280-s',
    priceListVersion: 'plv-1280-s',
    'priceListVersion$_identifier': 'Versión tarifa de venta mayorista 2026',
    'priceList$_identifier': 'Tarifa de venta mayorista 2026',
    'priceListVersion$salesPriceList': true,
    standardPrice: '1234.5',
    listPrice: '1499.99',
  },
  {
    id: 'price-1280-p',
    priceListVersion: 'plv-1280-p',
    'priceListVersion$_identifier': 'Versión tarifa de compra proveedores 2026',
    'priceList$_identifier': 'Tarifa de compra proveedores 2026',
    'priceListVersion$salesPriceList': false,
    standardPrice: '987.65',
    listPrice: '1100',
  },
];

/** Detail GET mock for one record; selectors fall through to login()'s catch-all. */
async function mockDetail(page, slug, entity, record) {
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || /\/selectors\//.test(req.url())) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [record] } }),
    });
  };
  // Two routes, never the brace form (docs/e2e-testing-guide.md).
  await page.route(`**/sws/neo/${slug}/${entity}/**`, handler);
  await page.route(`**/sws/neo/${slug}/${entity}**`, handler);
}

async function mockPrices(page) {
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || /\/price\/(selectors|defaults)/.test(req.url())) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: PRICE_ROWS, totalRows: PRICE_ROWS.length } }),
    });
  };
  await page.route('**/sws/neo/product/price/**', handler);
  await page.route('**/sws/neo/product/price**', handler);
}

/** The detail sidebar: the bordered, non-shrinking column that holds `anchor`. */
function sidebarOf(anchor) {
  return anchor.locator("xpath=ancestor::div[contains(@class,'shrink-0') and contains(@class,'border-l')][1]");
}

async function expectSidebar320(sidebar) {
  const r = await rectOf(sidebar);
  expect(Math.abs(r.width - 320), `sidebar is ${r.width}px`).toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
  return r;
}

test.describe('Form View 1280×720 — fixed 320 px sidebars (ETP-5513)', () => {
  test('Product detail sidebar is 320 px', async ({ page }) => {
    await login(page);
    await mockDetail(page, 'product', 'product', PRODUCT);
    await openAt(page, `/product/${PRODUCT.id}`);
    const anchor = page.getByRole('button', { name: 'Almacenes' });
    await expect(anchor).toBeVisible({ timeout: 15_000 });
    await settle(page);

    await expectSidebar320(sidebarOf(anchor));
    await expectNoHorizontalPageScroll(page);
  });

  test('Warehouse detail sidebar is 320 px', async ({ page }) => {
    await login(page);
    await mockDetail(page, 'warehouse', 'warehouse', { id: 'WH-1280', name: 'Almacén 1280', searchKey: 'A1280' });
    await openAt(page, '/warehouse/WH-1280');
    const anchor = page.getByText('Datos de stock');
    await expect(anchor).toBeVisible({ timeout: 15_000 });
    await settle(page);

    await expectSidebar320(sidebarOf(anchor));
    await expectNoHorizontalPageScroll(page);
  });
});

test.describe('Form View 1280×720 — Product price tab fits the form area (ETP-5513)', () => {
  for (const section of ['sales', 'purchase']) {
    test(`price columns stay inside the tab — ${section === 'sales' ? 'Venta' : 'Compra'}`, async ({ page }) => {
      await login(page);
      await mockDetail(page, 'product', 'product', PRODUCT);
      await mockPrices(page);
      await openAt(page, `/product/${PRODUCT.id}`);

      await page.getByTestId('tab-custom:pricing').click();
      if (section === 'purchase') await page.getByTestId('price-tab-purchase').click();
      const row = PRICE_ROWS.find((r) => r['priceListVersion$salesPriceList'] === (section === 'sales'));
      await expect(page.getByTestId(`price-delete-${row.id}`)).toBeAttached({ timeout: 15_000 });
      await settle(page);

      const sidebar = await expectSidebar320(sidebarOf(page.getByRole('button', { name: 'Almacenes' })));

      const m = await page.getByTestId('price-section-header').evaluate((header) => {
        const section = header.parentElement;
        const right = (el) => el.getBoundingClientRect().right;
        let maxRight = 0;
        for (const el of section.querySelectorAll('input, button')) {
          const b = el.getBoundingClientRect();
          if (b.width > 0) maxRight = Math.max(maxRight, b.right);
        }
        // Nearest ancestor that clips or scrolls horizontally = the form area.
        let scroller = section.parentElement;
        while (scroller && !/(auto|scroll|hidden)/.test(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
        return {
          sectionRight: right(section),
          maxControlRight: maxRight,
          sectionScroll: section.scrollWidth - section.clientWidth,
          scrollerScroll: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
          scrollerRight: scroller ? right(scroller) : Infinity,
        };
      });

      expect(m.sectionScroll, 'price section must not overflow horizontally').toBeLessThanOrEqual(0);
      expect(m.scrollerScroll, 'the form area must not scroll horizontally').toBeLessThanOrEqual(0);
      expect(m.maxControlRight, 'a price control ends past the form area').toBeLessThanOrEqual(m.scrollerRight + EDGE_TOLERANCE_PX);
      expect(m.maxControlRight, 'a price control runs under the sidebar').toBeLessThanOrEqual(sidebar.left + EDGE_TOLERANCE_PX);
      await expectNoHorizontalPageScroll(page);
    });
  }
});
