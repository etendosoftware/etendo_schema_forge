import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

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

test.describe('ETP-4905 — Contacts import category resolution (Tomcat integration)', () => {
  test.skip(!RUN_INTEGRATION, 'Requires E2E_USE_MOCK=0 and E2E_PASSWORD for a real Etendo backend');
  test.setTimeout(120_000);

  test('persists contacts with an existing category, a normalized name, and one new shared category', async ({ page }) => {
    const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
    mkdirSync(evidenceDir, { recursive: true });
    const unique = Date.now();
    const newCategoryName = `E2E Contact Category ${unique}`;
    const rows = [
      { name: `E2E Contact Code ${unique}`, first: 'Lucia', last: 'Code', categoryMode: 'code' },
      { name: `E2E Contact Name ${unique}`, first: 'Andres', last: 'Name', categoryMode: 'name' },
      { name: `E2E Contact New One ${unique}`, first: 'Paula', last: 'New', categoryMode: 'new' },
      { name: `E2E Contact New Two ${unique}`, first: 'Martin', last: 'Shared', categoryMode: 'new' },
      { name: `E2E Contact Legacy ${unique}`, first: 'Julia', last: 'Legacy', categoryMode: 'fallback' },
    ];

    await login(page, onboardingCredentials ? {
      user: onboardingCredentials.email,
      password: onboardingCredentials.password,
    } : {});
    await navigateTo(page, 'contacts');
    await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 30_000 });

    const categoriesPayload = await page.evaluate(async () => {
      const token = localStorage.getItem('sf_auth_token');
      const response = await fetch('/sws/neo/business-partner-category/businessPartnerCategory?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: response.status, body: await response.json() };
    });
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
        'nombre comercial,nombre,apellido,codigocategoria,nombrecategoria,categoria,email de contacto',
        `${rows[0].name},${rows[0].first},${rows[0].last},${existingCategoryCode},,,e2e-contact-code-${unique}@example.com`,
        `${rows[1].name},${rows[1].first},${rows[1].last},, ${String(existingCategoryName).toLowerCase()} ,,e2e-contact-name-${unique}@example.com`,
        `${rows[2].name},${rows[2].first},${rows[2].last},,${newCategoryName},,e2e-contact-new-one-${unique}@example.com`,
        `${rows[3].name},${rows[3].first},${rows[3].last},,${newCategoryName},,e2e-contact-new-two-${unique}@example.com`,
        `${rows[4].name},${rows[4].first},${rows[4].last},,,${existingCategoryName},e2e-contact-legacy-${unique}@example.com`,
      ].join('\n')),
    });

    await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('7/7');
    await expect(page.getByTestId('ImportColumnMapping__chip-codigocategoria')).toContainText('Contact Category Code');
    await expect(page.getByTestId('ImportColumnMapping__chip-nombrecategoria')).toContainText('Contact Category Name');
    await expect(page.getByTestId('ImportColumnMapping__chip-categoria')).toContainText('Contact Category');
    await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-review.png'), fullPage: true });

    await page.getByTestId('ImportDialog__importButton').click();
    await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
    await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('5');
    await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-confirm.png'), fullPage: true });
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

    await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 30_000 });
    for (const row of rows) await expect(page.getByText(row.name, { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-created.png'), fullPage: true });
  });
});
