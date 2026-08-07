import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Product grid — "Tipo" (productType) badge translation coverage (ETP-4685,
 * mocked). This is the window that originally surfaced the bug: the grid
 * badge showed the raw English AD Name regardless of active UI language.
 *
 * Mock mode only.
 */

const ROWS = [
  {
    id: 'prod-item-1',
    searchKey: 'PROD-ITEM',
    name: 'Item product',
    '_identifier': 'Item product',
    productType: 'I',
    'productType$_identifier': 'Item',
    productCategory: 'cat-1',
    'productCategory$_identifier': 'General',
    uOM: 'uom-1',
    'uOM$_identifier': 'Unit',
  },
  {
    id: 'prod-service-1',
    searchKey: 'PROD-SVC',
    name: 'Service product',
    '_identifier': 'Service product',
    productType: 'S',
    'productType$_identifier': 'Service',
    productCategory: 'cat-1',
    'productCategory$_identifier': 'General',
    uOM: 'uom-1',
    'uOM$_identifier': 'Unit',
  },
];

test.describe('Product grid — Tipo badge translation (ETP-4685)', () => {
  test('grid shows the translated Tipo badge (Artículo/Servicio), not the raw English AD name', async ({ page }) => {
    await login(page);

    await page.route('**/sws/neo/product/product{/**,}**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      if (/\/product\/product\/selectors\//.test(url)) return route.fallback();
      if (/\/product\/product\/defaults/.test(url)) return route.fallback();
      if (method === 'GET' && !/\/product\/product\/[^/?]+/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }) });
      }
      route.fallback();
    });

    await page.goto('/product');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByText('Artículo')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Servicio')).toBeVisible();
    await expect(page.getByText('Item', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Service', { exact: true })).toHaveCount(0);
  });
});
