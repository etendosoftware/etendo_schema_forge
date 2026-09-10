import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login } from '../helpers/auth.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';

/**
 * ETP-4905 — Product import creates and links a missing category.
 *
 * This is a deterministic local UX E2E: the browser uses the real Product
 * import dialog and the real import descriptor, while NEO collection and
 * batch endpoints are mocked at the network boundary. The descriptor/core
 * resolver is also covered by the Vitest and node:test suites documented in
 * the delivery evidence README.
 */
test('imports a product and creates its missing category', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });

  const state = {
    rows: [],
    categoryCreateBodies: [],
    batchBodies: [],
  };

  await login(page);

  await page.route('**/sws/neo/product/product{/**,}**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: state.rows, totalRows: state.rows.length } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/product-category/productCategory{/**,}**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      state.categoryCreateBodies.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'cat-e2e-4905', ...body }] } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/batch', async (route) => {
    const body = route.request().postDataJSON();
    state.batchBodies.push(body);
    const productOperation = body.operations.find((operation) => operation.entity === 'product');
    const product = {
      id: 'prod-e2e-4905',
      searchKey: productOperation.body.searchKey,
      name: productOperation.body.name,
      _identifier: productOperation.body.name,
      productCategory: productOperation.body.productCategory,
      'productCategory$_identifier': 'Muebles y Hogar',
    };
    state.rows = [product];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ committed: true, operations: [{ id: 'product', recordId: product.id }] }),
    });
  });

  await page.goto('/product');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('ListView__importButton').click();

  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'products-etp-4905.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      // ETP-4995: one `categoria` column replaces categoryCode/categoryName/category.
      'codigo,nombre,categoria',
      'PROD-ETP-4905,Mesa de comedor,Muebles y Hogar',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportColumnMapping__chip-categoria')).toContainText('Category');
  await captureScreenshot(page, {
    path: resolve(evidenceDir, 'ETP-4905-product-import-category-review.png'),
    fullPage: true,
  });

  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await captureScreenshot(page, {
    path: resolve(evidenceDir, 'ETP-4905-product-import-category-confirm.png'),
    fullPage: true,
  });

  await page.getByTestId('ImportConfirmStep__confirm').click();
  await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('cell-prod-e2e-4905-name')).toContainText('Mesa de comedor');
  await expect(page.getByTestId('cell-prod-e2e-4905-productCategory')).toContainText('Muebles y Hogar');

  expect(state.categoryCreateBodies).toEqual([{ searchKey: 'MUEBLES_Y_HOGAR', name: 'Muebles y Hogar' }]);
  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations).toEqual([
    expect.objectContaining({
      entity: 'product',
      body: expect.objectContaining({
        searchKey: 'PROD-ETP-4905',
        name: 'Mesa de comedor',
        productCategory: 'cat-e2e-4905',
      }),
    }),
  ]);

  writeFileSync(resolve(evidenceDir, 'ETP-4905-product-import-http.json'), `${JSON.stringify({
    categoryCreate: { status: 200, body: state.categoryCreateBodies[0] },
    batch: {
      status: 200,
      committed: true,
      product: state.batchBodies[0].operations.find((operation) => operation.entity === 'product')?.body,
    },
  }, null, 2)}\n`);

  await captureScreenshot(page, {
    path: resolve(evidenceDir, 'ETP-4905-product-import-category-created.png'),
    fullPage: true,
  });
});

test('keeps invalid rows out of the batch and allows valid rows to continue', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });
  const state = { batchBodies: [] };

  await login(page);

  await page.route('**/sws/neo/product/product{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/product-category/productCategory{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [
          { id: 'cat-ambiguous-1', searchKey: 'SERV-1', name: 'Servicios' },
          { id: 'cat-ambiguous-2', searchKey: 'SERV-2', name: 'Servicios' },
        ] } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/batch', async (route) => {
    state.batchBodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ committed: true, operations: [{ id: 'product', recordId: 'valid-product-4905' }] }),
    });
  });

  await page.goto('/product');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('ListView__importButton').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();

  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'products-etp-4905-corner-cases.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      // `precio` still maps — it stays an alias of the sales price column (ETP-4995).
      'codigo,nombre,precio,categoria',
      'BAD-PRICE-4905,Producto precio inválido,not-a-number,',
      'AMBIG-4905,Producto categoría ambigua,,Servicios',
      'VALID-4905,Producto válido,,',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('4/4');

  // The two invalid rows fail at DIFFERENT stages, and ETP-4996 is what moved the first one.
  // BAD-PRICE-4905 is caught during REVIEW: `isNumeric` on the price column makes validateRow
  // reject "not-a-number" before anything is sent. It used to be counted as importable and
  // only failed inside buildOperations, once the user had already confirmed.
  const errorFilter = page.getByTestId('ImportReviewQueue__statusFilter-error');
  await expect(errorFilter).toContainText('1');
  await errorFilter.click();
  // A FIELD error, not a row-level one: validateRow reports it against the salesPrice target,
  // so it renders on that cell. Row-level (`rowError-N`) is reserved for errors with no target,
  // which is what the post-send failures below are.
  await expect(page.getByTestId('ImportReviewQueue__fieldError-0-salesPrice'))
    .toContainText(/precio|price|number|número/i);
  await page.getByTestId('ImportReviewQueue__statusFilter-ok').click();

  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  // Two, not three — the invalid price never enters the batch.
  await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('2');
  await page.getByTestId('ImportConfirmStep__confirm').click();

  // AMBIG-4905 still needs the send to fail: its category carries no matchEntity, so it is
  // only resolved server-side. The review queue is rebuilt from the send results here, so
  // this count covers the sent rows alone — BAD-PRICE-4905 was already reported above.
  await expect(errorFilter).toContainText('1');
  await errorFilter.click();
  await expect(page.getByTestId('ImportReviewQueue__rowError-0')).toContainText(/múltiple|multiple|match|coincid/i);
  await captureScreenshot(page, {
    path: resolve(evidenceDir, 'ETP-4905-product-import-corner-errors.png'),
    fullPage: true,
  });

  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations).toHaveLength(1);
  expect(state.batchBodies[0].operations[0].body.searchKey).toBe('VALID-4905');
});

test('rejects a malformed CSV before mapping and offers retry', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });

  await login(page);
  await page.goto('/product');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('ListView__importButton').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'products-etp-4905-malformed.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('codigo,nombre,nombre\nPROD-4905,Mesa,Mesa'),
  });

  await expect(page.getByTestId('ImportFileErrorDialog__title')).toBeVisible();
  await expect(page.getByTestId('ImportFileErrorDialog__message')).toContainText(/duplic|duplicate/i);
  await captureScreenshot(page, {
    path: resolve(evidenceDir, 'ETP-4905-product-import-malformed-file.png'),
    fullPage: true,
  });
  await page.getByTestId('ImportFileErrorDialog__retry').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();
});
