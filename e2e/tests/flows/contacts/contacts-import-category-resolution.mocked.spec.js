// @covers tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
import { test, expect } from '../../helpers/test.js';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { login } from '../../helpers/auth.js';
import { captureScreenshot } from '../../helpers/captureScreenshot.js';

/**
 * Contacts import category resolution — deterministic local UX coverage.
 *
 * The page, import dialog, descriptor, and resolver are real. Only the NEO
 * catalog, category CRUD, and batch endpoints are mocked at the network edge.
 *
 * The category rule follows the `contact-category-type` feature flag, read by the descriptor:
 *
 *  - ON  (ETP-5791): a category the file names but the catalogue does not have is never created
 *        (it would carry no contact type): the row fails with "create it first".
 *  - OFF (pre-ETP-5791, ETP-4905): an unknown category is auto-created and the contact points at
 *        it; the Cliente / Proveedor columns (ETP-5544) set the contact's roles.
 *
 * The flag is fixed when Vite starts (`VITE_FEATURE_FLAGS`, no runtime override), so the
 * flag-dependent tests skip themselves rather than failing when the server was started the other
 * way (same pattern as `accounting/acct-process-monitor.mocked.spec.js`). The rest run in both:
 *
 *   # flag OFF (default, what CI runs) — the OFF test runs, the ON test skips
 *   cd tools/app-shell && npx vite --port 3105
 *   cd e2e && E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 \
 *     npx playwright test tests/flows/contacts/contacts-import-category-resolution.mocked.spec.js --project=mocked
 *
 *   # flag ON — the ON test runs, the OFF test skips
 *   cd tools/app-shell && VITE_FEATURE_FLAGS='{"contact-category-type":true}' npx vite --port 3106
 *   cd e2e && E2E_USE_MOCK=1 BASE_URL=http://localhost:3106 E2E_CONTACT_CATEGORY_TYPE_FLAG=on \
 *     npx playwright test tests/flows/contacts/contacts-import-category-resolution.mocked.spec.js --project=mocked
 *
 * Run against plain `npx vite`/`make dev`, never `make dev-mock` — `VITE_MOCK=true` replaces
 * `window.fetch` in-page and silently bypasses every `page.route()` here.
 */

const FLAG_ON = process.env.E2E_CONTACT_CATEGORY_TYPE_FLAG === 'on';

test('keeps valid contact rows and surfaces ambiguous or unknown category rows', async ({ page }) => {
  test.skip(!FLAG_ON, 'Lookup-only category resolution needs contact-category-type ON (E2E_CONTACT_CATEGORY_TYPE_FLAG=on)');
  const evidenceDir = resolve(import.meta.dirname, '../../../../artifacts/delivery-evidence/ETP-4905');
  mkdirSync(evidenceDir, { recursive: true });
  const state = { batchBodies: [], categoryPosts: 0 };

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
      // Must never happen: counted so the spec fails if the import tries to create it.
      state.categoryPosts += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'unexpected create' }) });
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
  await page.getByTestId('action-new-more').click();
  await page.getByTestId('action-new-import').click();
  await expect(page.getByRole('dialog').getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByRole('dialog').getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'contacts-etp-4905-corner-cases.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      // ETP-4995: cif/nif is now required at import level, so every fixture row carries one.
      'nombre comercial,nombre de pila,apellido,categoria,cif/nif,email de contacto',
      'Contacto válido,Val,Id,VALID,B20000006,valid@example.com',
      'Categoría ambigua,Ana,Lopez,Servicios,B20000014,ambiguous@example.com',
      'Categoría inexistente,Leo,Diaz,Nueva Categoría,B20000022,error@example.com',
    ].join('\n')),
  });
  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await page.getByTestId('ImportConfirmStep__confirm').click();

  const errorFilter = page.getByTestId('ImportReviewQueue__statusFilter-error');
  await expect(errorFilter).toContainText('2');
  await errorFilter.click();
  await expect(page.getByTestId('ImportReviewQueue__rowError-0')).toContainText(/múltiple|multiple|match|coincid/i);
  await expect(page.getByTestId('ImportReviewQueue__rowError-1')).toContainText(/"Nueva Categoría".*(no existe|does not exist)/i);
  await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-category-errors.png'), fullPage: true });

  expect(state.batchBodies).toHaveLength(1);
  expect(state.batchBodies[0].operations[0].body.businessPartnerCategory).toBe('bpg-valid');
  expect(state.categoryPosts).toBe(0);
});

test('auto-creates an unknown category and applies the Cliente / Proveedor columns', async ({ page }) => {
  test.skip(FLAG_ON, 'Category auto-create and the Cliente / Proveedor columns only exist with contact-category-type OFF');
  const state = { batchBodies: [], categoryPosts: [] };

  await login(page);
  await page.route('**/sws/neo/business-partner-category/businessPartnerCategory{/**,}**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'bpg-valid', searchKey: 'VALID', name: 'Clientes' }] } }),
      });
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      state.categoryPosts.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'bpg-created', ...body }] } }),
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ committed: true, operations: [{ id: 'bp', recordId: 'vendor-4905' }] }) });
  });

  await page.goto('/contacts');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('action-new-more').click();
  await page.getByTestId('action-new-import').click();
  await expect(page.getByRole('dialog').getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByRole('dialog').getByTestId('ImportDropzone__fileInput').setInputFiles({
    name: 'contacts-unknown-category-auto-create.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'nombre comercial,categoria,cif/nif,cliente,proveedor',
      'Proveedor nuevo,Nueva Categoría,B20000022,No,Sí',
    ].join('\n')),
  });

  await expect(page.getByTestId('ImportDialog__importButton')).toContainText('Importar 1');
  await page.getByTestId('ImportDialog__importButton').click();
  await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
  await page.getByTestId('ImportConfirmStep__confirm').click();

  await expect.poll(() => state.batchBodies.length).toBe(1);
  expect(state.categoryPosts).toHaveLength(1);
  expect(state.categoryPosts[0].name).toBe('Nueva Categoría');
  const bpBody = state.batchBodies[0].operations.find((operation) => operation.entity === 'businessPartner').body;
  expect(bpBody.name).toBe('Proveedor nuevo');
  expect(bpBody.businessPartnerCategory).toBe('bpg-created');
  expect(bpBody.customer).toBe('N');
  expect(bpBody.vendor).toBe('Y');
});

test('skips an in-file duplicate tax id before sending the batch', async ({ page }) => {
  const evidenceDir = resolve(import.meta.dirname, '../../../../artifacts/delivery-evidence/ETP-4905');
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
  await page.getByTestId('action-new-more').click();
  await page.getByTestId('action-new-import').click();
  await expect(page.getByRole('dialog').getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByRole('dialog').getByTestId('ImportDropzone__fileInput').setInputFiles({
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
  const evidenceDir = resolve(import.meta.dirname, '../../../../artifacts/delivery-evidence/ETP-4905');
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
  await page.getByTestId('action-new-more').click();
  await page.getByTestId('action-new-import').click();
  await expect(page.getByRole('dialog').getByTestId('ImportDropzone__zone')).toBeVisible();
  await page.getByRole('dialog').getByTestId('ImportDropzone__fileInput').setInputFiles({
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
