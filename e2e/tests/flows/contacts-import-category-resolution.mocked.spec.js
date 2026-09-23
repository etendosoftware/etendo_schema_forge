import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { login } from '../helpers/auth.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';

/**
 * Contacts import category resolution — deterministic local UX coverage.
 *
 * The page, import dialog, descriptor, and resolver are real. Only the NEO
 * catalog, category CRUD, and batch endpoints are mocked at the network edge.
 */

test('keeps valid contact rows and surfaces ambiguous or failed category rows', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });
  const state = { batchBodies: [] };

  await login(page);
  await page.route('**/sws/neo/business-partner-category/businessPartnerCategory{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [
          { id: 'bpg-valid', searchKey: 'VALID', name: 'Clientes' },
          { id: 'bpg-ambiguous-a', searchKey: 'SERVICES-A', name: 'Servicios' },
          { id: 'bpg-ambiguous-b', searchKey: 'SERVICES-B', name: 'Servicios' },
        ] } }),
      });
    }
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Contact category creation failed' }),
      });
    }
    return route.fallback();
  });
  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [] } }) });
    }
    return route.fallback();
  });
  await page.route('**/sws/neo/batch', async (route) => {
    state.batchBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ committed: true, operations: [{ id: 'bp', recordId: 'valid-4905' }] }) });
  });

  await page.goto('/contacts');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('ListView__importButton').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'contacts-etp-4905-corner-cases.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      // ETP-4995: cif/nif is now required at import level, so every fixture row carries one.
      'nombre comercial,nombre de pila,apellido,categoria,cif/nif,email de contacto',
      'Contacto válido,Val,Id,VALID,B20000006,valid@example.com',
      'Categoría ambigua,Ana,Lopez,Servicios,B20000014,ambiguous@example.com',
      'Error creando categoría,Leo,Diaz,Nueva Categoría,B20000022,error@example.com',
    ].join('\n')),
  });
  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await page.getByTestId('ImportConfirmStep__confirm').click();

  const errorFilter = page.getByTestId('ImportReviewQueue__statusFilter-error');
  await expect(errorFilter).toContainText('2');
  await errorFilter.click();
  await expect(page.getByTestId('ImportReviewQueue__rowError-0')).toContainText(/múltiple|multiple|match|coincid/i);
  await expect(page.getByTestId('ImportReviewQueue__rowError-1')).toContainText(/category|categoría|creation|creación/i);
  await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-category-errors.png'), fullPage: true });

  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations[0].body.businessPartnerCategory).toBe('bpg-valid');
});

test('skips an in-file duplicate tax id before sending the batch', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });
  const state = { batchBodies: [], contacts: [] };

  await login(page);
  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: state.contacts } }) });
    }
    return route.fallback();
  });
  await page.route('**/sws/neo/batch', async (route) => {
    const body = route.request().postDataJSON();
    state.batchBodies.push(body);
    const bp = body.operations.find((operation) => operation.entity === 'businessPartner');
    const contact = { id: 'contact-4905-dedupe', ...bp.body, _identifier: bp.body.name };
    state.contacts.push(contact);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ committed: true, operations: [{ id: 'bp', recordId: contact.id }] }) });
  });

  await page.goto('/contacts');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('ListView__importButton').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'contacts-etp-4905-duplicate.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      // ETP-4995: the dedupe key is taxID, not etgoEmail — email is optional, and a blank key
      // made dedupeRows skip deduplication entirely. Same tax id = same legal entity.
      'nombre comercial,nombre de pila,apellido,cif/nif,email',
      'Contacto original,Lucia,Fernandez,B30000004,original@example.com',
      'Contacto repetido,Lucia,Fernandez,B30000004,repeated@example.com',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportReviewQueue__statusFilter-error')).toContainText('1');
  await page.getByTestId('ImportReviewQueue__statusFilter-error').click();
  await expect(page.getByTestId('ImportReviewQueue__skippedLabel-1')).toBeVisible();
  await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-duplicate-skipped.png'), fullPage: true });

  await page.getByTestId('ImportReviewQueue__statusFilter-ok').click();
  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('1');
  await page.getByTestId('ImportConfirmStep__confirm').click();
  await expect(page.getByText('Contacto original', { exact: true })).toBeVisible();

  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations[0].body.name).toBe('Contacto original');
});

test('imports a minimal company row with only the required legal name and tax id', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });
  const state = { batchBodies: [] };

  await login(page);
  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [] } }) });
    }
    return route.fallback();
  });
  await page.route('**/sws/neo/batch', async (route) => {
    state.batchBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ committed: true, operations: [{ id: 'bp', recordId: 'minimal-4905' }] }) });
  });

  await page.goto('/contacts');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('ListView__importButton').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'contacts-etp-4905-minimal.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'nombre comercial,cif/nif,email',
      'Cliente solo con razón social,B40000002,minimal@example.com',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportDialog__importButton')).toContainText('Importar 1');
  await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-minimal-review.png'), fullPage: true });
  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('1');
  await page.getByTestId('ImportConfirmStep__confirm').click();

  expect(state.batchBodies).toHaveLength(1);
  const bpBody = state.batchBodies[0].operations.find((operation) => operation.entity === 'businessPartner').body;
  expect(bpBody.name).toBe('Cliente solo con razón social');
  expect(bpBody.etgoEmail).toBe('minimal@example.com');
  expect(bpBody.etgoFirstname).toBeUndefined();
  expect(bpBody.etgoLastname).toBeUndefined();
  expect(bpBody.oBTIKTaxIDKey).toBe('1');
});
