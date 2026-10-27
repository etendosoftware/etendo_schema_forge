// @covers tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiAuthHeaders, login, navigateTo } from '../../helpers/auth.js';
import { captureScreenshot } from '../../helpers/captureScreenshot.js';
import { uniqueValidCif } from '../../helpers/tax-id.js';
import { waitForLoadingIndicatorsGone } from '../../helpers/selectors.js';

/**
 * Contacts import category resolution — live Tomcat backend (E2E_USE_MOCK=0).
 *
 * The category rule follows the `contact-category-type` feature flag, which has TWO halves that
 * must agree: the backend reads `etendo.go.flags.contact-category-type` from Openbravo.properties
 * (Tomcat restart needed after changing it) and the SPA reads `VITE_FEATURE_FLAGS` when Vite starts.
 *
 *  - ON  (ETP-5791): an unknown category is never created (it would carry no contact type); the
 *        rows naming it fail with "create it first" and the rest still import.
 *  - OFF (pre-ETP-5791, ETP-4905): an unknown category is auto-created and the imported contact
 *        points at it; the Cliente / Proveedor columns (ETP-5544) set the contact's roles.
 *
 * Each flag-dependent test skips itself in the other state (same switch as the mocked spec,
 * `contacts-import-category-resolution.mocked.spec.js`):
 *
 *   # flag OFF (default) — property absent or `etendo.go.flags.contact-category-type=false`
 *   cd tools/app-shell && npx vite --port 3105
 *   cd e2e && E2E_USE_MOCK=0 BASE_URL=http://localhost:3105 \
 *     npx playwright test tests/flows/contacts/contacts-import-category-resolution.integration.spec.js --project=integration
 *
 *   # flag ON — `etendo.go.flags.contact-category-type=true` in Openbravo.properties, Tomcat restarted
 *   cd tools/app-shell && VITE_FEATURE_FLAGS='{"contact-category-type":true}' npx vite --port 3106
 *   cd e2e && E2E_USE_MOCK=0 BASE_URL=http://localhost:3106 E2E_CONTACT_CATEGORY_TYPE_FLAG=on \
 *     npx playwright test tests/flows/contacts/contacts-import-category-resolution.integration.spec.js --project=integration
 *
 * Both need E2E_PASSWORD (or `e2e/.auth-credentials.json`). The OFF test names everything it
 * creates with a `QA5791` prefix plus a timestamp and deletes it best-effort at the end.
 */

const FLAG_ON = process.env.E2E_CONTACT_CATEGORY_TYPE_FLAG === 'on';
const isYes = (value) => value === true || value === 'Y' || value === 'true';

function loadCredentials() {
  try {
    const credentialsPath = resolve(import.meta.dirname, '../../../.auth-credentials.json');
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
  await waitForLoadingIndicatorsGone(page, { timeout: 10_000 });
}

test.describe('ETP-4905 — Contacts import category resolution (Tomcat integration)', () => {
  test.skip(!RUN_INTEGRATION, 'Requires E2E_USE_MOCK=0 and E2E_PASSWORD for a real Etendo backend');
  test.setTimeout(120_000);

  // ETP-5791: the category decides the contact type, so an unknown category is no longer
  // auto-created (it would carry neither type and every contact on it would be refused). Rows
  // naming one fail on their own row with the not-found message; the rest still import.
  test('persists contacts with an existing category by code or name, and fails rows naming an unknown category', async ({ page }) => {
    test.skip(!FLAG_ON, 'Lookup-only category resolution needs contact-category-type ON (E2E_CONTACT_CATEGORY_TYPE_FLAG=on)');
    const evidenceDir = resolve(import.meta.dirname, '../../../../artifacts/delivery-evidence/ETP-4905');
    mkdirSync(evidenceDir, { recursive: true });
    const unique = Date.now();
    // The import dedupes on taxID (artifacts/contacts/decisions.json -> window.import.dedupe.key),
    // so a hardcoded CIF makes this spec pass exactly ONCE per environment: the first run creates
    // those business partners, and every later run sees all five rows as "Omitida" (skipped),
    // leaving the dialog on "Importar 0" with the button disabled. Derive the tax IDs from
    // `unique` like every other identifying value here, keeping the last digit distinct per row
    // so they are not in-file duplicates either.
    // ETP-5031: each value must also be a syntactically valid CIF (check digit and all) — the
    // backend now validates it via SpanishTaxIdValidator when "Clave NIF país residencia" is NIF.
    const taxId = (index) => uniqueValidCif(unique, index);
    const newCategoryName = `E2E Contact Category ${unique}`;
    const rows = [
      { name: `E2E Contact Code ${unique}`, first: `Lucia${unique}`, last: 'Code', categoryMode: 'code' },
      { name: `E2E Contact Name ${unique}`, first: `Andres${unique}`, last: 'Name', categoryMode: 'name' },
      { name: `E2E Contact New One ${unique}`, first: `Paula${unique}`, last: 'New', categoryMode: 'new' },
      { name: `E2E Contact New Two ${unique}`, first: `Martin${unique}`, last: 'Shared', categoryMode: 'new' },
      { name: `E2E Contact Legacy ${unique}`, first: `Julia${unique}`, last: 'Legacy', categoryMode: 'fallback' },
    ];
    const importedRows = rows.filter((row) => row.categoryMode !== 'new');
    const rejectedRows = rows.filter((row) => row.categoryMode === 'new');

    await login(page, onboardingCredentials ? {
      user: onboardingCredentials.email,
      password: onboardingCredentials.password,
    } : {});
    await navigateTo(page, 'contacts');
    await expect(page.getByTestId('action-new-more')).toBeVisible({ timeout: 30_000 });

    const categoriesResponse = await page.request.get(
      '/sws/neo/business-partner-category/businessPartnerCategory?limit=1000',
      { headers: await apiAuthHeaders(page) },
    );
    const categoriesPayload = { status: categoriesResponse.status(), body: await categoriesResponse.json() };
    expect(categoriesPayload.status).toBe(200);
    const categories = categoriesPayload.body?.response?.data ?? categoriesPayload.body?.data ?? [];
    // A category that grants at least one contact type: one with neither (legacy, not yet
    // migrated) gives its contacts no type, which the backend refuses since ETP-5791.
    const typed = categories.filter((category) => isYes(category.etgoIscustomer) || isYes(category.etgoIsvendor));
    const existingCategory = typed.find((category) => {
      const label = String(category.name ?? category._identifier ?? '').trim().toLowerCase();
      return label === 'clientes' || label === 'cliente' || label === 'otros';
    }) ?? typed.find((category) => category.searchKey ?? category.value ?? category._value);
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

    await page.getByTestId('action-new-more').click();

    await page.getByTestId('action-new-import').click();
    await expect(page.getByRole('dialog').getByTestId('ImportDropzone__zone')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('dialog').getByTestId('ImportDropzone__fileInput').setInputFiles({
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

    // ETP-4954: the mapping modal is now field-first — the count is FIELDS with a source out
    // of all importable fields (20 for Contacts: ETP-5791 dropped the Customer/Vendor columns
    // ETP-5544 had added, the type now comes from the category), not columns mapped out of
    // columns present.
    await expect(page.getByTestId('ImportColumnMapping__summaryCount')).toContainText('14/20');
    // ETP-5223: the chip reads `<source column>→<target caption>`, and the target caption
    // is now resolved through `fieldLabelFn` (the AD label dictionary for the SESSION locale)
    // instead of the English `field.label` declared in decisions.json. The locale here is
    // deterministically es_ES — the `integration` project reuses no storageState, `login()`
    // never seeds `schema-forge-locale`, and core's `useLocaleState` defaults to es_ES — so
    // "Categoría de contacto" is what a live run prints for C_BP_Group_ID. The English
    // alternative is deliberate tolerance for a session that DID switch language, not
    // uncertainty: this assertion is about the mapping, not about the UI language. The regex
    // is anchored on `categoria→` so it still asserts the RESOLVED TARGET half — the
    // `categoria` source column on its own can never satisfy it.
    await expect(page.getByTestId('ImportColumnMapping__chip-categoria'))
      .toContainText(/categoria\s*→\s*(Categoría de contacto|Contact Category)/);
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-review.png'), fullPage: true });

    await page.getByTestId('ImportDialog__importButton').click();
    await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
    await expect(page.getByTestId('ImportConfirmStep__importCount')).toContainText('5');
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-confirm.png'), fullPage: true });
    await page.getByTestId('ImportConfirmStep__confirm').click();

    // The two rows naming the unknown category fail on their own row, telling the user to
    // create it first — and nothing tries to create it.
    const errorFilter = page.getByTestId('ImportReviewQueue__statusFilter-error');
    await expect(errorFilter).toContainText(String(rejectedRows.length), { timeout: 30_000 });
    await errorFilter.click();
    for (let i = 0; i < rejectedRows.length; i += 1) {
      await expect(page.getByTestId(`ImportReviewQueue__rowError-${i}`))
        .toContainText(/no existe|does not exist/i);
    }
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-5791-contacts-import-unknown-category.png'), fullPage: true });

    // ETP-5676: rows travel in chunks of up to `batchSize` (10 for Contacts), so the five rows
    // are normally ONE /batch request. Assert on the rows, not on the request count: every row
    // must appear in SOME batch (poll, since the send is async), and a rollback may resend rows
    // one by one, so the request count is bounded by 1 + rows (one batch, then one per row).
    const allBatchOperations = () => batchBodies.flatMap((body) => body.operations ?? []);
    await expect.poll(
      () => importedRows.every((row) => allBatchOperations().some((operation) => operation.body?.name === row.name)),
      { timeout: 30_000 },
    ).toBe(true);
    expect(batchBodies.length).toBeGreaterThanOrEqual(1);
    expect(batchBodies.length).toBeLessThanOrEqual(importedRows.length + 1);
    expect(categoryCreateBodies).toHaveLength(0);
    for (const row of rejectedRows) {
      expect(allBatchOperations().some((operation) => operation.body?.name === row.name), `${row.name} must not be sent`).toBe(false);
    }
    for (const row of importedRows) {
      const batch = batchBodies.find((body) => body.operations?.some((operation) => operation.body?.name === row.name));
      expect(batch, `expected a batch for ${row.name}`).toBeTruthy();
      const bpOperation = batch.operations.find((operation) => operation.body?.name === row.name);
      expect(bpOperation.body.businessPartnerCategory).toBeTruthy();
      expect(batch.operations.some((operation) => operation.entity === 'contact' && operation.parentRef === bpOperation.id)).toBe(true);
    }
    const firstBatch = batchBodies.find((body) => body.operations?.some((operation) => operation.body?.name === rows[0].name));
    const firstBpOperation = firstBatch.operations.find((operation) => operation.body?.name === rows[0].name);
    // Batch ops are prefixed per row (`r<i>.`), so the location is tied to ITS row by parentRef,
    // not by being the first locationAddress in a batch that may hold several rows.
    const firstLocation = firstBatch.operations.find(
      (operation) => operation.entity === 'locationAddress' && operation.parentRef === firstBpOperation.id,
    );
    expect(firstLocation, 'expected the first row to carry its own location').toBeTruthy();
    expect(firstLocation.body.addressLine1).toBe('Calle Mayor 1');
    expect(firstLocation.body.cityName).toBe('Madrid');
    expect(firstLocation.body.postalCode).toBe('28013');

    // The dialog stays on the review queue because of the failed rows: reload the list.
    await navigateTo(page, 'contacts');
    await expect(page.getByTestId('action-new-more')).toBeVisible({ timeout: 30_000 });
    for (const row of importedRows) await expect(page.getByText(row.name, { exact: true })).toBeVisible({ timeout: 30_000 });
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-created.png'), fullPage: true });

    await page.getByText(rows[0].name, { exact: true }).click();
    await waitForDetailReady(page);
    await expect(page.getByTestId('field-etgoEmail')).toHaveValue(`e2e-company-${unique}@example.com`);
    await expect(page.getByTestId('field-etgoPhone')).toHaveValue('+34 910 000 001');
    // ETP-5031 follow-up — etgoWeb is stored WITHOUT its scheme (the form's "https://" chip
    // is a fixed prefix, never part of the value); contactsImportDescriptor now strips a
    // scheme off the CSV's `web` cell the same way, so this must match the bare domain.
    await expect(page.getByTestId('field-etgoWeb')).toHaveValue(`e2e-${unique}.example`);
    await expect(page.getByTestId('field-taxID')).toHaveValue(taxId(0));
    await page.getByTestId('tab-locationAddress').click();
    await expect(page.getByText('Madrid, Calle Mayor 1', { exact: true })).toBeVisible({ timeout: 15_000 });
    await captureScreenshot(page, { path: resolve(evidenceDir, 'ETP-4905-contacts-import-tomcat-detail.png'), fullPage: true });
  });

  test('auto-creates an unknown category once and persists the contacts on it with their Cliente / Proveedor roles', async ({ page }) => {
    test.skip(FLAG_ON, 'Category auto-create and the Cliente / Proveedor columns only exist with contact-category-type OFF');
    const unique = Date.now();
    const newCategoryName = `QA5791 Category ${unique}`;
    // Both rows name the same unknown category: it must be created ONCE and shared.
    const rows = [
      { name: `QA5791 Customer ${unique}`, taxId: uniqueValidCif(unique, 6), cliente: 'Sí', proveedor: 'No', customer: true, vendor: false },
      { name: `QA5791 Vendor ${unique}`, taxId: uniqueValidCif(unique, 7), cliente: 'No', proveedor: 'Sí', customer: false, vendor: true },
    ];

    const categoryCreates = [];
    const batchExchanges = [];
    page.on('response', async (response) => {
      const request = response.request();
      if (request.method() !== 'POST') return;
      const url = response.url();
      const json = await response.json().catch(() => null);
      if (url.includes('/sws/neo/business-partner-category/businessPartnerCategory')) {
        const record = json?.response?.data?.[0] ?? json?.data?.[0] ?? json;
        categoryCreates.push({ body: request.postDataJSON(), status: response.status(), id: record?.id });
      }
      if (url.includes('/sws/neo/batch')) batchExchanges.push({ body: request.postDataJSON(), response: json });
    });

    await login(page, onboardingCredentials ? {
      user: onboardingCredentials.email,
      password: onboardingCredentials.password,
    } : {});
    const headers = await apiAuthHeaders(page);
    const createdContactIds = [];
    try {
      await navigateTo(page, 'contacts');
      await expect(page.getByTestId('action-new-more')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('action-new-more').click();
      await page.getByTestId('action-new-import').click();
      await expect(page.getByRole('dialog').getByTestId('ImportDropzone__zone')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('dialog').getByTestId('ImportDropzone__fileInput').setInputFiles({
        name: 'contacts-qa5791-auto-create.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from([
          'nombre comercial,cif/nif,categoria,cliente,proveedor',
          ...rows.map((row) => [row.name, row.taxId, newCategoryName, row.cliente, row.proveedor].join(',')),
        ].join('\n')),
      });

      await expect(page.getByTestId('ImportDialog__importButton')).toContainText(`Importar ${rows.length}`);
      await page.getByTestId('ImportDialog__importButton').click();
      await expect(page.getByTestId('ImportConfirmStep__confirm')).toBeVisible();
      await page.getByTestId('ImportConfirmStep__confirm').click();

      // Every row's businessPartner operation came back with a persisted recordId.
      const bpResult = (row) => {
        for (const { body, response } of batchExchanges) {
          const op = body.operations?.find((operation) => operation.entity === 'businessPartner' && operation.body?.name === row.name);
          if (!op) continue;
          return { op, result: response?.operations?.find((entry) => entry.id === op.id) };
        }
        return null;
      };
      await expect.poll(() => rows.every((row) => bpResult(row)?.result?.recordId), { timeout: 30_000 }).toBe(true);
      // Recorded before any assertion so the cleanup below still sees them if one fails.
      for (const row of rows) createdContactIds.push(bpResult(row).result.recordId);

      expect(categoryCreates, 'the unknown category must be created exactly once').toHaveLength(1);
      expect(categoryCreates[0].body.name).toBe(newCategoryName);
      expect(categoryCreates[0].status).toBeLessThan(300);
      const createdCategoryId = categoryCreates[0].id;
      expect(createdCategoryId, 'expected the category create to return an id').toBeTruthy();

      for (const row of rows) {
        const { op } = bpResult(row);
        expect(op.body.businessPartnerCategory).toBe(createdCategoryId);
        expect(op.body.customer).toBe(row.customer ? 'Y' : 'N');
        expect(op.body.vendor).toBe(row.vendor ? 'Y' : 'N');
      }

      // Read back what the backend persisted, not only what the SPA sent.
      for (const [index, row] of rows.entries()) {
        const readResponse = await page.request.get(`/sws/neo/contacts/businessPartner/${createdContactIds[index]}`, { headers });
        expect(readResponse.status()).toBe(200);
        const readJson = await readResponse.json();
        const persisted = readJson?.response?.data?.[0] ?? readJson?.data?.[0] ?? readJson;
        expect(persisted.name).toBe(row.name);
        expect(persisted.businessPartnerCategory).toBe(createdCategoryId);
        expect(isYes(persisted.customer), `${row.name} customer`).toBe(row.customer);
        expect(isYes(persisted.vendor), `${row.name} vendor`).toBe(row.vendor);
      }
    } finally {
      // Best-effort cleanup: names are unique per run, so a leftover never breaks a later run.
      for (const id of createdContactIds) {
        await page.request.delete(`/sws/neo/contacts/businessPartner/${id}`, { headers }).catch(() => {});
      }
      for (const { id } of categoryCreates) {
        if (id) await page.request.delete(`/sws/neo/business-partner-category/businessPartnerCategory/${id}`, { headers }).catch(() => {});
      }
    }
  });
});
