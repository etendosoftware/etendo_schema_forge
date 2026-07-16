import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales/Purchase Invoice — "Rectificaciones" custom tab visibility (mocked).
 *
 * ETP-4404 (TC-11 + tab rendering):
 *   - The reversedInvoices custom tab (ReversedInvoicesPanel, placement 'tab')
 *     is ALWAYS visible regardless of isRectificative — per user decision the
 *     original design does not hide it (TC-01/TC-02 gating intentionally not
 *     implemented). TC-13 still applies: non-rectificative invoices get a
 *     read-only panel (no add).
 *   - The tab strip button testid is `tab-custom:reversedInvoices`
 *     (DetailView emits `tab-${customTabKey(ct)}` with customTabKey = `custom:{key}`).
 *   - The panel container testid is `reversed-invoices-panel`.
 *
 * This spec covers the Rectificaciones tab + panel (the hasRectifications
 * header badge was removed by design — the doc-type badge conveys it).
 *
 * Routing note: login() installs a catch-all for /sws/**, so mocks must be
 * installed AFTER login() (specific routes win, LIFO).
 */

const TAB_TESTID = 'tab-custom:reversedInvoices';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SI_RECTIFICATIVE_ID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const SI_NON_RECTIFICATIVE_ID = 'B2C3D4E5F60718293A4B5C6D7E8F90A1';
const SI_UNENRICHED_ID = 'C3D4E5F60718293A4B5C6D7E8F90A1B2';
const AP_RECTIFICATIVE_ID = 'D4E5F60718293A4B5C6D7E8F90A1B2C3';

/** Base invoice header — complete enough for DetailView to render the form. */
function baseInvoice(overrides = {}) {
  return {
    documentNo: 'FC-00500',
    invoiceDate: '2026-07-01',
    businessPartner: 'bp-tab-001',
    'businessPartner$_identifier': 'Cliente Rectificado S.L.',
    partnerAddress: 'addr-tab-001',
    'partnerAddress$_identifier': 'Calle Tab 1',
    paymentMethod: 'pm-001',
    'paymentMethod$_identifier': 'Transferencia',
    paymentTerms: 'pt-001',
    'paymentTerms$_identifier': '30 días',
    priceList: 'pl-001',
    'priceList$_identifier': 'Tarifa ventas',
    currency: 'eur-001',
    'currency$_identifier': 'EUR',
    transactionDocument: 'td-arc-001',
    'transactionDocument$_identifier': 'AR CreditMemo',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    documentAction: 'CO',
    processed: false,
    posted: 'N',
    grandTotalAmount: 250.0,
    summedLineAmount: 250.0,
    outstandingAmount: 250.0,
    paymentComplete: false,
    hasRectifications: false,
    ...overrides,
  };
}

/** A rectificative sales credit memo — tab must be visible (TC-01). */
const SI_RECTIFICATIVE = baseInvoice({
  id: SI_RECTIFICATIVE_ID,
  documentNo: 'NC-00500',
  isRectificative: true,
});

/** A regular sales invoice — tab must be hidden (TC-02). */
const SI_NON_RECTIFICATIVE = baseInvoice({
  id: SI_NON_RECTIFICATIVE_ID,
  documentNo: 'FC-00600',
  transactionDocument: 'td-ar-001',
  'transactionDocument$_identifier': 'AR Invoice',
  isRectificative: false,
});

/** A record without the enrichment field — tab stays visible (TC-01 edge). */
const SI_UNENRICHED = baseInvoice({
  id: SI_UNENRICHED_ID,
  documentNo: 'NC-00700',
  // isRectificative intentionally absent
});

/** A rectificative purchase invoice — parity check (TC-11). */
const AP_RECTIFICATIVE = baseInvoice({
  id: AP_RECTIFICATIVE_ID,
  documentNo: 'NCP-00800',
  'businessPartner$_identifier': 'Proveedor Rectificado S.A.',
  transactionDocument: 'td-apc-001',
  'transactionDocument$_identifier': 'AP CreditMemo',
  'priceList$_identifier': 'Tarifa compra',
  isRectificative: true,
  hasRectifications: true,
});

/** Existing rectification line served for the purchase parity test. */
const AP_REVERSED_LINE = {
  id: 'revline-001',
  invoice: AP_RECTIFICATIVE_ID,
  reversedInvoice: 'inv-orig-777',
  'reversedInvoice$_identifier': '10000067 - 05-06-2026 - 2854.20',
  aEAT349IsCorrective: 'N',
};

// ---------------------------------------------------------------------------
// Mock installer
// ---------------------------------------------------------------------------

/**
 * Install detail-page mocks for a given spec (sales-invoice / purchase-invoice).
 * Must run AFTER login() so these routes beat its /sws/** catch-all.
 */
async function installDetailMocks(page, spec, invoice, reversedLines = []) {
  await page.route(`**/sws/neo/${spec}/header/${invoice.id}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [invoice] } }),
      });
      return;
    }
    route.fallback();
  });

  for (const entity of ['lines', 'paymentPlan']) {
    await page.route(`**/sws/neo/${spec}/${entity}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
    });
  }

  await page.route(`**/sws/neo/${spec}/reversedInvoices**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: reversedLines, totalRows: reversedLines.length } }),
    });
  });

  await page.route(`**/sws/neo/${spec}/evaluate-display**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Sales Invoice — ETP-4404 Rectificaciones tab visibility (mocked)', () => {

  test('rectificative sales invoice shows the Rectificaciones tab and the panel renders', async ({ page }) => {
    await login(page);
    await installDetailMocks(page, 'sales-invoice', SI_RECTIFICATIVE);

    await page.goto(`/sales-invoice/${SI_RECTIFICATIVE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const tab = page.getByTestId(TAB_TESTID);
    await expect(tab).toBeVisible({ timeout: 8_000 });

    await tab.click();
    await expect(page.getByTestId('reversed-invoices-panel')).toBeVisible();
    // No lines mocked → the panel shows its empty state
    await expect(page.getByText('Sin rectificaciones todavía')).toBeVisible();
  });

  test('TC-13: non-rectificative invoice keeps the tab but the panel is read-only (no add)', async ({ page }) => {
    await login(page);
    await installDetailMocks(page, 'sales-invoice', SI_NON_RECTIFICATIVE);

    await page.goto(`/sales-invoice/${SI_NON_RECTIFICATIVE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Tab stays visible (TC-01/02 gating intentionally not implemented) …
    const tab = page.getByTestId(TAB_TESTID);
    await expect(tab).toBeVisible({ timeout: 8_000 });
    await tab.click();
    await expect(page.getByTestId('reversed-invoices-panel')).toBeVisible();
    // … but a non-rectificative invoice gets no add actions
    await expect(page.getByTestId('btn__addFirstRectificacion')).toHaveCount(0);
    await expect(page.getByTestId('btn__addReversedInvoice')).toHaveCount(0);
  });

  test('record without isRectificative enrichment keeps the tab visible', async ({ page }) => {
    await login(page);
    await installDetailMocks(page, 'sales-invoice', SI_UNENRICHED);

    await page.goto(`/sales-invoice/${SI_UNENRICHED_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId(TAB_TESTID)).toBeVisible({ timeout: 8_000 });
  });

});

test.describe('Purchase Invoice — ETP-4404 Rectificaciones tab parity (mocked)', () => {

  test('TC-11: rectificative purchase invoice shows the tab and renders its lines', async ({ page }) => {
    await login(page);
    await installDetailMocks(page, 'purchase-invoice', AP_RECTIFICATIVE, [AP_REVERSED_LINE]);

    await page.goto(`/purchase-invoice/${AP_RECTIFICATIVE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const tab = page.getByTestId(TAB_TESTID);
    await expect(tab).toBeVisible({ timeout: 8_000 });

    await tab.click();
    const panel = page.getByTestId('reversed-invoices-panel');
    await expect(panel).toBeVisible();
    // The grid derives docNo / date / total from reversedInvoice$_identifier
    await expect(panel.getByText('10000067').first()).toBeVisible();
    await expect(panel.getByText('05/06/2026')).toBeVisible();
  });

});

// ---------------------------------------------------------------------------
// Save-header-first flow (new sales credit memo)
// ---------------------------------------------------------------------------

const NEW_SAVED_ID = 'E5F60718293A4B5C6D7E8F90A1B2C3D4';

/**
 * A picker candidate served by GET /sales-invoice/header on the /new route.
 * The InvoicePickerModal only lists documentStatus === 'CO' rows.
 */
const PICKER_CANDIDATE = {
  id: 'inv-orig-9', documentNo: '10000090', invoiceDate: '2026-05-01',
  documentStatus: 'CO', 'businessPartner$_identifier': 'Cliente Rectificado S.L.',
  grandTotalAmount: 250.0,
};

/**
 * Every required, editable header field pre-filled so the client-side guard
 * (getMissingRequiredFields in useEntity) passes and the header POST actually
 * fires on Guardar — without the user having to touch the header form. Keys and
 * $_identifier companions mirror artifacts/sales-invoice/.../HeaderForm.jsx.
 */
function newInvoiceDefaults() {
  return {
    transactionDocument: 'td-arc-001', 'transactionDocument$_identifier': 'AR CreditMemo',
    documentNo: 'NC-NEW-1',
    invoiceDate: '2026-07-16',
    businessPartner: 'bp-tab-001', 'businessPartner$_identifier': 'Cliente Rectificado S.L.',
    partnerAddress: 'addr-tab-001', 'partnerAddress$_identifier': 'Calle Tab 1',
    paymentMethod: 'pm-001', 'paymentMethod$_identifier': 'Transferencia',
    paymentTerms: 'pt-001', 'paymentTerms$_identifier': '30 días',
    currency: 'eur-001', 'currency$_identifier': 'EUR',
    priceList: 'pl-001', 'priceList$_identifier': 'Tarifa ventas',
    documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador',
  };
}

/**
 * Mocks for the /sales-invoice/new route + save-header-first:
 *   - GET  /header/defaults → a ready-to-save new invoice (passes the required-field guard)
 *   - GET  /header (list)   → picker candidates (only CO rows are listed by the modal)
 *   - POST /header          → returns the saved record with NEW_SAVED_ID (counted)
 *   - GET  /header/{id}     → the saved invoice (post-navigation remount)
 *   - GET/POST /reversedInvoices → empty list / created row (captures the POST body)
 *
 * Installed AFTER login() so these beat its /sws/** catch-all (LIFO).
 */
async function installNewInvoiceMocks(page, capture) {
  const saved = baseInvoice({
    id: NEW_SAVED_ID, documentNo: 'NC-NEW-1', isRectificative: true, ...newInvoiceDefaults(),
  });

  await page.route('**/sws/neo/sales-invoice/header/defaults**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ defaults: newInvoiceDefaults() }),
    });
  });

  await page.route(`**/sws/neo/sales-invoice/header/${NEW_SAVED_ID}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [saved] } }),
    });
  });

  // Header POST (create) → saved record; GET list → picker candidates.
  await page.route('**/sws/neo/sales-invoice/header**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'POST') {
      // Only the bare …/header endpoint is a header CREATE. Sub-path POSTs
      // (e.g. …/header/callout, fired debounced when the new-invoice defaults
      // load) must NOT be mistaken for a header save — answer them with an
      // empty callout body instead of counting them.
      if (/\/header\/[^/?]+/.test(url)) {
        await route.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify({}),
        });
        return;
      }
      capture.headerPosts += 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [saved] } }),
      });
      return;
    }
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [PICKER_CANDIDATE], totalRows: 1 } }),
      });
      return;
    }
    return route.fallback();
  });

  for (const entity of ['lines', 'paymentPlan']) {
    await page.route(`**/sws/neo/sales-invoice/${entity}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
    });
  }

  await page.route('**/sws/neo/sales-invoice/reversedInvoices**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      capture.reversedPosts.push(JSON.parse(req.postData() || '{}'));
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'new-rev-line' }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/evaluate-display**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.describe('Sales Invoice — ETP-4404 save-header-first from /new (mocked)', () => {

  test('add on a new invoice opens the form without navigating; Guardar saves the header then POSTs the line with the saved id', async ({ page }) => {
    const capture = { headerPosts: 0, reversedPosts: [] };
    await login(page);
    await installNewInvoiceMocks(page, capture);

    await page.goto('/sales-invoice/new');
    await page.waitForLoadState('domcontentloaded');

    // The Rectificaciones tab is available on the new-record form.
    const tab = page.getByTestId(TAB_TESTID);
    await expect(tab).toBeVisible({ timeout: 8_000 });
    await tab.click();

    const panel = page.getByTestId('reversed-invoices-panel');
    await expect(panel).toBeVisible();

    // Clicking add opens the draft form WITHOUT saving the header or leaving /new.
    await panel.getByTestId('btn__addFirstRectificacion').click();
    await expect(panel.getByTestId('btn__saveNewLine')).toBeVisible();
    expect(page.url()).toContain('/sales-invoice/new');
    expect(capture.headerPosts).toBe(0);

    // Pick the original invoice through the picker modal ("Seleccionar..." is a
    // literal placeholder in the component, not an i18n key).
    await panel.getByText('Seleccionar...').click();
    await page.getByPlaceholder('Buscar factura...').waitFor({ state: 'visible' });
    await page.getByText('10000090').click();

    // Guardar: persists the header first (1 POST), POSTs the line against the
    // fresh id, then navigates to /sales-invoice/{savedId}.
    await panel.getByTestId('btn__saveNewLine').click();

    await page.waitForURL(`**/sales-invoice/${NEW_SAVED_ID}`, { timeout: 8_000 });
    expect(capture.headerPosts).toBe(1);
    expect(capture.reversedPosts.length).toBe(1);
    expect(capture.reversedPosts[0]).toMatchObject({
      invoice: NEW_SAVED_ID,
      reversedInvoice: 'inv-orig-9',
    });
  });

});
