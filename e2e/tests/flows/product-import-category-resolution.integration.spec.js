import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiAuthHeaders, login, navigateTo } from '../helpers/auth.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';

/**
 * ETP-4905 — Product import against a real Etendo/Tomcat backend.
 *
 * Unlike the mocked UX spec, this test does not intercept any /sws/neo/*
 * request. It creates a unique category through the real import descriptor,
 * commits the product through the real /batch endpoint, and verifies the
 * resulting product/category row in the real Product window.
 */
function loadCredentials() {
  try {
    const credentialsPath = resolve(import.meta.dirname, '../../.auth-credentials.json');
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    if (credentials.email && credentials.password) return credentials;
  } catch { /* Fall back to E2E_USER/E2E_PASSWORD. */ }
  return null;
}

const onboardingCredentials = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_USE_MOCK === '0'
  && Boolean(process.env.E2E_PASSWORD || onboardingCredentials);

test.describe('ETP-4905 — Product import category resolution (Tomcat integration)', () => {
  test.skip(!RUN_INTEGRATION, 'Requires E2E_USE_MOCK=0 and E2E_PASSWORD for a real Etendo backend');
  test.setTimeout(120_000);

  test('imports five priced products with existing and new categories, plus an optional-field row', async ({ page }) => {
    const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
    mkdirSync(evidenceDir, { recursive: true });
    const unique = Date.now();
    const newCategoryName = `E2E Muebles ${unique}`;
    const productRows = [
      { code: `E2E-ETP4905-CODE-${unique}`, name: `E2E Product Code ${unique}`, description: 'Existing category by code', price: '10.50', categoryMode: 'code' },
      { code: `E2E-ETP4905-NAME-${unique}`, name: `E2E Product Name ${unique}`, description: 'Existing category by normalized name', price: '20.00', categoryMode: 'name' },
      { code: `E2E-ETP4905-NEW1-${unique}`, name: `E2E Product New 1 ${unique}`, description: 'Creates a missing category', price: '30.00', categoryMode: 'new' },
      { code: `E2E-ETP4905-NEW2-${unique}`, name: `E2E Product New 2 ${unique}`, description: 'Reuses category creation in the same import', price: '40.00', categoryMode: 'new' },
      { code: `E2E-ETP4905-FALLBACK-${unique}`, name: `E2E Product Fallback ${unique}`, description: 'Existing category through legacy column', price: '50.00', categoryMode: 'fallback' },
    ];
    const optionalRow = {
      code: `E2E-ETP4905-OPTIONAL-${unique}`,
      name: `E2E Product Optional ${unique}`,
    };

    await login(page, onboardingCredentials ? {
      user: onboardingCredentials.email,
      password: onboardingCredentials.password,
    } : {});
    await navigateTo(page, 'product');
    await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 30_000 });

    const categoriesResponse = await page.request.get(
      '/sws/neo/product-category/productCategory?limit=1000',
      { headers: await apiAuthHeaders(page) },
    );
    const categoriesPayload = { status: categoriesResponse.status(), body: await categoriesResponse.json() };
    expect(categoriesPayload.status).toBe(200);
    const categories = categoriesPayload.body?.response?.data ?? categoriesPayload.body?.data ?? [];
    const defaultsResponse = await page.request.get(
      '/sws/neo/product/product/defaults',
      { headers: await apiAuthHeaders(page) },
    );
    const defaultsPayload = { status: defaultsResponse.status(), body: await defaultsResponse.json() };
    expect(defaultsPayload.status).toBe(200);
    const defaultUomId = defaultsPayload.body?.defaults?.uOM;
    const defaultUomLabel = defaultsPayload.body?.defaults?.['uOM$_identifier'];
    expect(defaultUomId, 'expected the product defaults endpoint to provide a UOM').toBeTruthy();
    expect(defaultUomLabel).toBe('Unidad');
    const existingCategory = categories.find((category) => {
      const label = String(category.name ?? category._identifier ?? '').trim().toLowerCase();
      return label === 'otros' || label === 'bebidas';
    });
    expect(existingCategory, 'expected a seeded existing category (Otros or Bebidas)').toBeTruthy();
    const existingCategoryName = existingCategory.name ?? existingCategory._identifier;
    const existingCategoryCode = existingCategory.searchKey ?? existingCategory.value ?? existingCategory._value;
    expect(existingCategoryCode, 'expected the existing category to expose a search key').toBeTruthy();

    const categoryCreateBodies = [];
    const batchBodies = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      if (request.url().includes('/sws/neo/product-category/productCategory')) {
        categoryCreateBodies.push(request.postDataJSON());
      }
      if (request.url().includes('/sws/neo/batch')) {
        batchBodies.push(request.postDataJSON());
      }
    });

    await page.getByTestId('ListView__importButton').click();

    await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
      name: 'products-etp-4905-tomcat.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        // ETP-4995: one `categoria` column instead of three. The cell resolves by exact code
        // first and by name otherwise, so both addressing styles still work from one column.
        'codigo,nombre,descripcion,precio,categoria',
        `${productRows[0].code},${productRows[0].name},${productRows[0].description},${productRows[0].price},${existingCategoryCode}`,
        `${productRows[1].code},${productRows[1].name},${productRows[1].description},${productRows[1].price}, ${String(existingCategoryName).toLowerCase()} `,
        `${productRows[2].code},${productRows[2].name},${productRows[2].description},${productRows[2].price},${newCategoryName}`,
        `${productRows[3].code},${productRows[3].name},${productRows[3].description},${productRows[3].price},${newCategoryName}`,
        `${productRows[4].code},${productRows[4].name},${productRows[4].description},${productRows[4].price},${existingCategoryName}`,
        `${optionalRow.code},${optionalRow.name},,, `,
      ].join('\n')),
    });

    await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('5/5');
    await expect(page.getByTestId('ImportColumnMapping__chip-categoria')).toContainText('Category');
    await captureScreenshot(page, {
      path: resolve(evidenceDir, 'ETP-4905-product-import-tomcat-multi-review.png'),
      fullPage: true,
    });

    await page.getByTestId('ImportDialog__importButton').click();
    await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
    await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('6');
    await captureScreenshot(page, {
      path: resolve(evidenceDir, 'ETP-4905-product-import-tomcat-multi-confirm.png'),
      fullPage: true,
    });
    const categoryResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST'
        && response.url().includes('/sws/neo/product-category/productCategory'),
      { timeout: 30_000 },
    );
    const batchResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST'
        && response.url().includes('/sws/neo/batch'),
      { timeout: 30_000 },
    );
    await page.getByTestId('ImportConfirmStep__confirm').click();
    const [categoryResponse, batchResponse] = await Promise.all([categoryResponsePromise, batchResponsePromise]);
    expect(categoryResponse.status()).toBeLessThan(300);
    expect(batchResponse.status()).toBeLessThan(300);

    await expect.poll(() => batchBodies.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(6);
    expect(categoryCreateBodies.filter((body) => body.name === newCategoryName)).toHaveLength(1);
    for (const row of productRows) {
      const batch = batchBodies.find((body) => body.operations?.some((operation) => operation.body?.searchKey === row.code));
      expect(batch, `expected a batch for ${row.code}`).toBeTruthy();
      const productOperation = batch.operations.find((operation) => operation.body?.searchKey === row.code);
      expect(productOperation.body.description).toBe(row.description);
      expect(productOperation.body.uOM).toBe(defaultUomId);
      expect(batch.operations.some((operation) => operation.entity === 'price' && operation.parentRef === productOperation.id)).toBe(true);
    }
    const optionalBatch = batchBodies.find((body) => body.operations?.some((operation) => operation.body?.searchKey === optionalRow.code));
    expect(optionalBatch, 'expected the row with optional fields omitted to import').toBeTruthy();
    expect(optionalBatch.operations).toHaveLength(1);
    expect(optionalBatch.operations[0].body).not.toHaveProperty('productCategory');
    // Declared blank columns are preserved as empty strings in the product
    // body; absent price/category values intentionally produce no dependent
    // category or price operation.
    expect(optionalBatch.operations[0].body.description).toBe('');
    expect(optionalBatch.operations[0].body.uOM).toBe(defaultUomId);

    await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 30_000 });
    // Etendo generates the persisted row ID; the grid testid therefore cannot
    // be derived from the CSV search key. Assert the unique visible values
    // instead, which also proves the category is rendered on the saved row.
    for (const row of [...productRows, optionalRow]) {
      await expect(page.getByText(row.name, { exact: true })).toBeVisible({ timeout: 30_000 });
    }
    for (const row of productRows.filter((candidate) => candidate.categoryMode !== 'new')) {
      const productTableRow = page.getByText(row.name, { exact: true }).locator('xpath=ancestor::tr');
      await expect(productTableRow.getByText(existingCategoryName, { exact: true })).toBeVisible();
    }
    for (const row of productRows.filter((candidate) => candidate.categoryMode === 'new')) {
      const productTableRow = page.getByText(row.name, { exact: true }).locator('xpath=ancestor::tr');
      await expect(productTableRow.getByText(newCategoryName, { exact: true })).toBeVisible();
    }

    await captureScreenshot(page, {
      path: resolve(evidenceDir, 'ETP-4905-product-import-tomcat-multi-created.png'),
      fullPage: true,
    });
  });
});
