import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';
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

    // Both probes below must send the SAME `Accept-Language` the app's own requests send
    // (`authHeaders()` -> `getStoredLocale()`, localStorage key `schema-forge-locale`, default
    // `es_ES`). Without it `NeoAuthenticator.applyRequestLanguage` is a silent no-op and the
    // backend resolves every `*_Trl` name into the user's AD language instead (ETP-4685,
    // ETP-5022) — which since ETP-5079 would make the category `_identifier` read here disagree
    // with the label the product grid actually renders.
    const readNeoJson = (path) => page.evaluate(async (url) => {
      const token = localStorage.getItem('sf_auth_token');
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept-Language': localStorage.getItem('schema-forge-locale') || 'es_ES',
        },
      });
      return { status: response.status, body: await response.json() };
    }, path);

    const categoriesPayload = await readNeoJson('/sws/neo/product-category/productCategory?limit=1000');
    expect(categoriesPayload.status).toBe(200);
    const categories = categoriesPayload.body?.response?.data ?? categoriesPayload.body?.data ?? [];
    const defaultsPayload = await readNeoJson('/sws/neo/product/product/defaults');
    expect(defaultsPayload.status).toBe(200);
    const defaultUomId = defaultsPayload.body?.defaults?.uOM;
    const defaultUomLabel = defaultsPayload.body?.defaults?.['uOM$_identifier'];
    expect(defaultUomId, 'expected the product defaults endpoint to provide a UOM').toBeTruthy();
    expect(defaultUomLabel).toBe('Unidad');
    // ETP-5079 renamed the seeded starter category ("Otros" -> VALUE/NAME "Generic") and gave it
    // an es_ES `M_PRODUCT_CATEGORY_TRL` row ("Genérico"); the other seeded category, "Discounts",
    // is flagged `EM_Etgo_IsSystemCategory='Y'` and is filtered out of every window and selector.
    //
    // Match on the SEARCH KEY, never on a name. The category now has three identifying strings
    // and only one of them is locale-independent:
    //   - `searchKey` (M_Product_Category.Value) is `AD_Column.ISTRANSLATED='N'`, so it reads
    //     "Generic" in every locale — the translation-independent handle;
    //   - `name` (M_Product_Category.Name) is served by `DefaultJsonDataService` with
    //     `DataResolvingMode.FULL`, i.e. `bob.get("name")`, the raw base column: always "Generic";
    //   - `_identifier` is `bob.getIdentifier()`, and Name is `ISTRANSLATED='Y' ISIDENTIFIER='Y'`,
    //     so `IdentifierProvider` resolves it through the `*_Trl` row: "Genérico" in an es_ES
    //     session. `name` and `_identifier` therefore no longer agree.
    const SEEDED_CATEGORY_SEARCH_KEY = 'Generic';
    const existingCategory = categories.find(
      (category) => String(category.searchKey ?? category.value ?? category._value ?? '').trim()
        === SEEDED_CATEGORY_SEARCH_KEY,
    );
    expect(
      existingCategory,
      `expected the seeded starter category with searchKey "${SEEDED_CATEGORY_SEARCH_KEY}"`,
    ).toBeTruthy();
    const existingCategoryCode = existingCategory.searchKey ?? existingCategory.value ?? existingCategory._value;
    expect(existingCategoryCode, 'expected the existing category to expose a search key').toBeTruthy();
    // The CSV cell that addresses the category BY NAME must carry the untranslated base name:
    // `resolveOrAutoCreateDependentEntity` step 2 compares `normalizeText(record.name)` against the
    // cell, and `record` comes from this very payload. `normalizeText` strips diacritics, so
    // "Genérico" collapses to "generico" and would never match "generic".
    const existingCategoryName = existingCategory.name;
    expect(existingCategoryName, 'expected the existing category to expose a base name').toBeTruthy();
    // The grid renders `productCategory$_identifier` (`resolveIdentifier()` -> DataTable), which IS
    // translated — so the DOM assertions below use the identifier, not the base name. Both were the
    // same string before ETP-5079, which is why one variable used to serve both roles.
    const existingCategoryLabel = existingCategory._identifier ?? existingCategoryName;

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
      await expect(productTableRow.getByText(existingCategoryLabel, { exact: true })).toBeVisible();
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
