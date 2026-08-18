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
    locations: [],
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
      const path = new URL(route.request().url()).pathname;
      const id = path.match(/businessPartner\/([^/]+)$/)?.[1];
      const data = id ? state.contacts.filter((contact) => contact.id === id) : state.contacts;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data, totalRows: data.length } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/contacts/locationAddress{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: state.locations, totalRows: state.locations.length } }),
      });
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/simsearch**', async (route) => {
    const url = new URL(route.request().url());
    const entityName = url.searchParams.get('entityName');
    const items = JSON.parse(url.searchParams.get('items') || '[]');
    const candidates = entityName === 'Country'
      ? [{ id: 'country-spain', name: 'Spain', similarityPercent: '100' }]
      : [{ id: 'region-madrid', name: 'Madrid', similarityPercent: '100' }];
    const response = Object.fromEntries(items.map((_, index) => [`item_${index}`, { data: candidates }]));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  await page.route('**/sws/neo/contacts/region{/**,}**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ country: 'country-spain' }] } }),
    });
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
    const locationOperation = body.operations.find((operation) => operation.entity === 'locationAddress');
    if (locationOperation) {
      state.locations.push({
        id: `location-4905-${state.locations.length + 1}`,
        businessPartner: contact.id,
        ...locationOperation.body,
        address1: locationOperation.body.addressLine1,
        city: locationOperation.body.cityName,
        postal: locationOperation.body.postalCode,
      });
    }
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
      ['nombre comercial', 'nombre', 'apellido', 'email', 'telefono', 'web', 'cif/nif', 'direccion', 'ciudad', 'codigo postal', 'pais', 'region', 'codigocategoria', 'nombrecategoria', 'categoria', 'email de contacto'],
      ['Contacto por código', 'Lucia', 'Fernandez', 'lucia.code@example.com', '+34 910 000 001', 'https://code.example', 'B12345678', 'Calle Mayor 1', 'Madrid', '28013', 'Spain', 'Madrid', 'CLIENTS', '', '', 'lucia.code.person@example.com'],
      ['Contacto por nombre', 'Andres', 'Rojaz', 'andres.name@example.com', '+34 910 000 002', 'https://name.example', 'B12345679', '', '', '', '', '', '', ' clientes ', '', 'andres.name.person@example.com'],
      ['Contacto nuevo uno', 'Paula', 'Gomez', 'paula.one@example.com', '+34 910 000 003', 'https://new-one.example', 'B12345680', '', '', '', '', '', '', '', 'Distribución Especial', 'paula.one.person@example.com'],
      ['Contacto nuevo dos', 'Martin', 'Diaz', 'martin.two@example.com', '+34 910 000 004', 'https://new-two.example', 'B12345681', '', '', '', '', '', '', '', 'Distribución Especial', 'martin.two.person@example.com'],
      ['Contacto legacy', 'Julia', 'Perez', 'julia.legacy@example.com', '+34 910 000 005', 'https://legacy.example', 'B12345682', '', '', '', '', '', '', '', '', 'julia.legacy.person@example.com'],
    ].map((row) => row.join(',')).join('\n')),
  });

  await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('16/16');
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
  expect(state.batchBodies.map((batch) => batch.operations[0].body.businessPartnerCategory).sort()).toEqual([
    'bpg-4905-1', 'bpg-4905-1', 'bpg-4905-clients', 'bpg-4905-clients', undefined,
  ].sort());

  // Open the imported record as a user would from the Contacts list and verify
  // that company identity, tax, communication, and address data survived the
  // composite batch instead of only checking the request body.
  await page.getByText('Contacto por código', { exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/contact-4905-\d+$/);
  await expect(page.getByTestId('field-etgoEmail')).toHaveValue('lucia.code@example.com');
  await expect(page.getByTestId('field-etgoPhone')).toHaveValue('+34 910 000 001');
  await expect(page.getByTestId('field-etgoWeb')).toHaveValue('https://code.example');
  await expect(page.getByTestId('field-taxID')).toHaveValue('B12345678');
  await page.getByTestId('tab-locationAddress').click();
  await expect(page.getByText('Madrid, Calle Mayor 1', { exact: true })).toBeVisible();
  const codeContact = state.contacts.find((contact) => contact.name === 'Contacto por código');
  expect(state.locations.find((location) => location.businessPartner === codeContact?.id)?.postalCode).toBe('28013');
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

test('skips an in-file duplicate company email before sending the batch', async ({ page }) => {
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
      'nombre comercial,nombre,apellido,email',
      'Contacto original,Lucia,Fernandez,duplicate@example.com',
      'Contacto repetido,Lucia,Fernandez,duplicate@example.com',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportReviewQueue__statusFilter-error')).toContainText('1');
  await page.getByTestId('ImportReviewQueue__statusFilter-error').click();
  await expect(page.getByTestId('ImportReviewQueue__skippedLabel-1')).toBeVisible();
  await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-duplicate-skipped.png'), fullPage: true });

  await page.getByTestId('ImportReviewQueue__statusFilter-ok').click();
  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('1');
  await page.getByTestId('ImportConfirmStep__confirm').click();
  await expect(page.getByText('Contacto original', { exact: true })).toBeVisible();

  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations[0].body.name).toBe('Contacto original');
});

test('imports a minimal company row with only legal name and optional email', async ({ page }) => {
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
      'nombre comercial,email',
      'Cliente solo con razón social,minimal@example.com',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportDialog__importButton')).toContainText('Importar 1');
  await page.screenshot({ path: resolve(evidenceDir, 'ETP-4905-contacts-import-minimal-review.png'), fullPage: true });
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
