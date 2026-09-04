import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiAuthHeaders, login, navigateTo } from '../helpers/auth.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';

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

async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
  const spinner = page.getByText(/cargando|loading/i);
  if (await spinner.isVisible({ timeout: 500 }).catch(() => false)) {
    await expect(spinner).toBeHidden({ timeout: 10_000 });
  }
}

test.describe('ETP-4905 — Contacts import category resolution (Tomcat integration)', () => {
  test.skip(!RUN_INTEGRATION, 'Requires E2E_USE_MOCK=0 and E2E_PASSWORD for a real Etendo backend');
  test.setTimeout(120_000);

  test('persists contacts with an existing category, a normalized name, and one new shared category', async ({ page }) => {
    const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
    mkdirSync(evidenceDir, { recursive: true });
    const unique = Date.now();
    // The import dedupes on taxID (artifacts/contacts/decisions.json -> window.import.dedupe.key),
    // so a hardcoded CIF makes this spec pass exactly ONCE per environment: the first run creates
    // those business partners, and every later run sees all five rows as "Omitida" (skipped),
    // leaving the dialog on "Importar 0" with the button disabled. Derive the tax IDs from
    // `unique` like every other identifying value here, keeping the last digit distinct per row
    // so they are not in-file duplicates either.
    const taxId = (index) => `B${String(unique).slice(-7)}${index}`;
    const newCategoryName = `E2E Contact Category ${unique}`;
    const rows = [
      { name: `E2E Contact Code ${unique}`, first: `Lucia${unique}`, last: 'Code', categoryMode: 'code' },
      { name: `E2E Contact Name ${unique}`, first: `Andres${unique}`, last: 'Name', categoryMode: 'name' },
      { name: `E2E Contact New One ${unique}`, first: `Paula${unique}`, last: 'New', categoryMode: 'new' },
      { name: `E2E Contact New Two ${unique}`, first: `Martin${unique}`, last: 'Shared', categoryMode: 'new' },
      { name: `E2E Contact Legacy ${unique}`, first: `Julia${unique}`, last: 'Legacy', categoryMode: 'fallback' },
    ];

    await login(page, onboardingCredentials ? {
      user: onboardingCredentials.email,
      password: onboardingCredentials.password,
    } : {});
    await navigateTo(page, 'contacts');
    await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 30_000 });

    const categoriesResponse = await page.request.get(
      '/sws/neo/business-partner-category/businessPartnerCategory?limit=1000',
      { headers: await apiAuthHeaders(page) },
    );
    const categoriesPayload = { status: categoriesResponse.status(), body: await categoriesResponse.json() };
    expect(categoriesPayload.status).toBe(200);
    const categories = categoriesPayload.body?.response?.data ?? categoriesPayload.body?.data ?? [];
    const existingCategory = categories.find((category) => {
      const label = String(category.name ?? category._identifier ?? '').trim().toLowerCase();
      return label === 'clientes' || label === 'otros';
    }) ?? categories.find((category) => category.searchKey ?? category.value ?? category._value);
    expect(existingCategory, 'expected at least one existing business partner category').toBeTruthy();
    const existingCategoryName = existingCategory.name ?? existingCategory._identifier;
    const existingCategoryCode = existingCategory.searchKey ?? existingCategory.value ?? existingCategory._value;
    expect(existingCategoryCode, 'expected the existing category to expose a search key').toBeTruthy();

    const categoryCreateBodies = [];
    const batchBodies = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      if (request.url().includes('/sws/neo/business-partner-category/businessPartnerCategory')) {
        categoryCreateBodies.push(request.postDataJSON());
      }
      if (request.url().includes('/sws/neo/batch')) batchBodies.push(request.postDataJSON());
    });

    await page.getByTestId('ListView__importButton').click();
    await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
      name: 'contacts-etp-4905-tomcat.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        // ETP-4995: one `categoria` column instead of codigocategoria/nombrecategoria/categoria,
        // and "nombre" now maps to the commercial name so the person's first name has its own
        // header. The single cell still resolves by exact code first, then by name.
        'nombre comercial,nombre de pila,apellido,email,telefono,web,cif/nif,direccion,ciudad,codigo postal,pais,region,categoria,email de contacto',
        [rows[0].name, rows[0].first, rows[0].last, `e2e-company-${unique}@example.com`, '+34 910 000 001', `https://e2e-${unique}.example`, taxId(0), 'Calle Mayor 1', 'Madrid', '28013', 'Spain', 'Madrid', existingCategoryCode, `e2e-contact-code-${unique}@example.com`].join(','),
        [rows[1].name, rows[1].first, rows[1].last, `e2e-company-name-${unique}@example.com`, '+34 910 000 002', `https://name-${unique}.example`, taxId(1), '', '', '', '', '', String(existingCategoryName).toLowerCase(), `e2e-contact-name-${unique}@example.com`].join(','),
        [rows[2].name, rows[2].first, rows[2].last, `e2e-company-new-one-${unique}@example.com`, '+34 910 000 003', `https://new-one-${unique}.example`, taxId(2), '', '', '', '', '', newCategoryName, `e2e-contact-new-one-${unique}@example.com`].join(','),
        [rows[3].name, rows[3].first, rows[3].last, `e2e-company-new-two-${unique}@example.com`, '+34 910 000 004', `https://new-two-${unique}.example`, taxId(3), '', '', '', '', '', newCategoryName, `e2e-contact-new-two-${unique}@example.com`].join(','),
        [rows[4].name, rows[4].first, rows[4].last, `e2e-company-legacy-${unique}@example.com`, '+34 910 000 005', `https://legacy-${unique}.example`, taxId(4), '', '', '', '', '', existingCategoryName, `e2e-contact-legacy-${unique}@example.com`].join(','),
      ].join('\n')),
    });

    await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('14/14');
    await expect(page.getByTestId('ImportColumnMapping__chip-categoria')).toContainText('Contact Category');
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-review.png'), fullPage: true });

    await page.getByTestId('ImportDialog__importButton').click();
    await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
    await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('5');
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-confirm.png'), fullPage: true });
    const categoryResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST'
        && response.url().includes('/sws/neo/business-partner-category/businessPartnerCategory'),
      { timeout: 30_000 },
    );
    await page.getByTestId('ImportConfirmStep__confirm').click();
    const categoryResponse = await categoryResponsePromise;
    expect(categoryResponse.status()).toBeLessThan(300);

    await expect.poll(() => batchBodies.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(5);
    expect(categoryCreateBodies.filter((body) => body.name === newCategoryName)).toHaveLength(1);
    for (const row of rows) {
      const batch = batchBodies.find((body) => body.operations?.some((operation) => operation.body?.name === row.name));
      expect(batch, `expected a batch for ${row.name}`).toBeTruthy();
      const bpOperation = batch.operations.find((operation) => operation.body?.name === row.name);
      expect(bpOperation.body.businessPartnerCategory).toBeTruthy();
      expect(batch.operations.some((operation) => operation.entity === 'contact' && operation.parentRef === bpOperation.id)).toBe(true);
    }
    const firstBatch = batchBodies.find((body) => body.operations?.some((operation) => operation.body?.name === rows[0].name));
    const firstLocation = firstBatch.operations.find((operation) => operation.entity === 'locationAddress');
    expect(firstLocation.body.addressLine1).toBe('Calle Mayor 1');
    expect(firstLocation.body.cityName).toBe('Madrid');
    expect(firstLocation.body.postalCode).toBe('28013');

    await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 30_000 });
    for (const row of rows) await expect(page.getByText(row.name, { exact: true })).toBeVisible({ timeout: 30_000 });
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-created.png'), fullPage: true });

    await page.getByText(rows[0].name, { exact: true }).click();
    await waitForDetailReady(page);
    await expect(page.getByTestId('field-etgoEmail')).toHaveValue(`e2e-company-${unique}@example.com`);
    await expect(page.getByTestId('field-etgoPhone')).toHaveValue('+34 910 000 001');
    await expect(page.getByTestId('field-etgoWeb')).toHaveValue(`https://e2e-${unique}.example`);
    await expect(page.getByTestId('field-taxID')).toHaveValue(taxId(0));
    await page.getByTestId('tab-locationAddress').click();
    await expect(page.getByText('Madrid, Calle Mayor 1', { exact: true })).toBeVisible({ timeout: 15_000 });
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-detail.png'), fullPage: true });
  });
});
