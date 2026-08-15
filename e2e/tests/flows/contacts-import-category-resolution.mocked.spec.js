import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { login } from '../helpers/auth.js';

/**
 * Contacts import category resolution — deterministic local UX coverage.
 *
 * The page, import dialog, descriptor, and resolver are real. Only the NEO
 * catalog, category CRUD, and batch endpoints are mocked at the network edge.
 */
test('imports contacts with existing, normalized, new, and legacy category inputs', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });
  const state = {
    categories: [
      { id: 'bpg-4905-clients', searchKey: 'CLIENTS', name: 'Clientes' },
      { id: 'bpg-4905-suppliers', searchKey: 'SUPPLIERS', name: 'Proveedores' },
    ],
    categoryCreateBodies: [],
    batchBodies: [],
    contacts: [],
  };

  await login(page);

  await page.route('**/sws/neo/business-partner-category/businessPartnerCategory{/**,}**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: state.categories, totalRows: state.categories.length } }),
      });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      state.categoryCreateBodies.push(body);
      const category = { id: `bpg-4905-${state.categoryCreateBodies.length}`, ...body };
      state.categories.push(category);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [category] } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: state.contacts, totalRows: state.contacts.length } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/batch', async (route) => {
    const body = route.request().postDataJSON();
    state.batchBodies.push(body);
    const bpOperation = body.operations.find((operation) => operation.entity === 'businessPartner');
    const category = state.categories.find((candidate) => candidate.id === bpOperation.body.businessPartnerCategory);
    const contact = {
      id: `contact-4905-${state.contacts.length + 1}`,
      ...bpOperation.body,
      _identifier: bpOperation.body.name,
      'businessPartnerCategory$_identifier': category?.name ?? '',
    };
    state.contacts.push(contact);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ committed: true, operations: [{ id: 'bp', recordId: contact.id }] }),
    });
  });

  await page.goto('/contacts');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('ListView__importButton').click();
  await expect(page.getByTestId('ImportDropzone__zone')).toBeVisible();

  await page.getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'contacts-etp-4905.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'nombre comercial,nombre,apellido,codigocategoria,nombrecategoria,categoria,email de contacto',
      'Contacto por código,Lucia,Fernandez,CLIENTS,,,lucia.code@example.com',
      'Contacto por nombre,Andres,Rojaz,, clientes ,,andres.name@example.com',
      'Contacto nuevo uno,Paula,Gomez,,,Distribución Especial,paula.one@example.com',
      'Contacto nuevo dos,Martin,Diaz,,,Distribución Especial,martin.two@example.com',
      'Contacto legacy,Julia,Perez,,, ,julia.legacy@example.com',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('7/7');
  await expect(page.getByTestId('ImportColumnMapping__chip-codigocategoria')).toContainText('Contact Category Code');
  await expect(page.getByTestId('ImportColumnMapping__chip-nombrecategoria')).toContainText('Contact Category Name');
  await expect(page.getByTestId('ImportColumnMapping__chip-categoria')).toContainText('Contact Category');
  await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-category-review.png'), fullPage: true });

  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('5');
  await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-category-confirm.png'), fullPage: true });
  await page.getByTestId('ImportConfirmStep__confirm').click();

  await expect(page.getByTestId('ListView__importButton')).toBeVisible({ timeout: 10_000 });
  for (const name of ['Contacto por código', 'Contacto por nombre', 'Contacto nuevo uno', 'Contacto nuevo dos', 'Contacto legacy']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  expect(state.categoryCreateBodies).toEqual([{ searchKey: 'DISTRIBUCION_ESPECIAL', name: 'Distribución Especial' }]);
  expect(state.batchBodies).toHaveLength(5);
  expect(state.batchBodies.map((batch) => batch.operations[0].body.businessPartnerCategory)).toEqual([
    'bpg-4905-clients', 'bpg-4905-clients', 'bpg-4905-1', 'bpg-4905-1', undefined,
  ]);
  await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-category-created.png'), fullPage: true });
});

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
      'nombre comercial,nombre,apellido,codigocategoria,nombrecategoria,categoria,email de contacto',
      'Contacto válido,Val,Id,VALID,,,valid@example.com',
      'Categoría ambigua,Ana,Lopez,,Servicios,,ambiguous@example.com',
      'Error creando categoría,Leo,Diaz,,,Nueva Categoría,error@example.com',
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
  await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-category-errors.png'), fullPage: true });

  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations[0].body.businessPartnerCategory).toBe('bpg-valid');
});
