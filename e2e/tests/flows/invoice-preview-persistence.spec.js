import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Invoice Preview — file persistence tests.
 *
 * Tests the usePreviewAttachment + GenericPreviewModal.attachmentConfig integration:
 *
 * Purchase invoice scenarios (storeCondition always true):
 *   · No cached file  → drop zone visible
 *   · Cached file     → file view visible, delete button present
 *   · Delete          → DELETE request sent, drop zone reappears
 *   · File upload     → POST request sent with correct specName / recordId
 *
 * Sales invoice scenarios:
 *   · Completed (CO)  → GET /sws/neo/preview-file called with specName=sales-invoice
 *   · Draft (DR)      → GET NOT called (storeCondition=false)
 *
 * All tests run in mock mode (no BASE_URL). Routes registered after login() take
 * priority over the auth.js catch-all for the specific path patterns used here.
 */

// ── Shared fake data ──────────────────────────────────────────────────────────

const PURCHASE_ROW = {
  id: 'pi-persist-001',
  documentNo: 'PI-PERSIST-001',
  invoiceDate: '2026-05-01',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completed',
  businessPartner: 'bp-001',
  'businessPartner$_identifier': 'Test Supplier S.A.',
  grandTotalAmount: 1500.00,
  outstandingAmount: 0,
  paymentComplete: true,
  eTGODueDate: '2026-06-01',
  eTGODeliveryStatus: 100,
  transactionDocument: 'td-001',
  'transactionDocument$_identifier': 'AP Invoice',
};

const SALES_ROW_COMPLETED = {
  id: 'si-persist-co-001',
  documentNo: 'SI-CO-001',
  invoiceDate: '2026-05-01',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completed',
  businessPartner: 'bp-001',
  'businessPartner$_identifier': 'Test Customer S.A.',
  grandTotalAmount: 2000.00,
  outstandingAmount: 0,
  paymentComplete: true,
  eTGODueDate: '2026-06-01',
  eTGODeliveryStatus: 100,
  transactionDocument: 'td-001',
  'transactionDocument$_identifier': 'AR Invoice',
};

const SALES_ROW_DRAFT = {
  ...SALES_ROW_COMPLETED,
  id: 'si-persist-dr-001',
  documentNo: 'SI-DR-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Draft',
  outstandingAmount: 2000,
  paymentComplete: false,
};

// Minimal base64 string that passes the hook's `!json.fileData` guard.
// Not a real PDF — tests only check UI visibility, not rendering.
const FAKE_PDF_B64 = Buffer.from('%PDF-1.4 1 0 obj<</Type/Catalog>>endobj%%EOF').toString('base64');

// ── Route helpers ─────────────────────────────────────────────────────────────

async function seedPurchaseRows(page, rows = [PURCHASE_ROW]) {
  await page.route('**/sws/neo/purchase-invoice/header{/**,}**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
    });
  });
}

async function seedSalesRows(page, rows) {
  await page.route('**/sws/neo/sales-invoice/header{/**,}**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
    } else {
      route.fallback();
    }
  });
}

/**
 * Mock GET /sws/neo/preview-file to return `response` (JSON).
 * Other methods (POST, DELETE) fall through to the auth.js catch-all.
 */
async function mockPreviewFileGet(page, response) {
  await page.route('**/sws/neo/preview-file{/**,}**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else {
      route.fallback();
    }
  });
}

async function clickRow(page, rowId) {
  const row = page.getByTestId(`row-${rowId}`);
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('generic-preview-modal')).toBeVisible({ timeout: 5_000 });
}

// ── Purchase invoice — drop zone / file view ──────────────────────────────────

test.describe('Purchase invoice — no cached file', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // auth.js catch-all returns { data: [], totalRows: 0 } for GET preview-file,
    // which has no `fileData` field — same effect as returning {}.
    await seedPurchaseRows(page);
    await navigateTo(page, 'purchase-invoice');
  });

  test('drop zone is visible when no file is cached', async ({ page }) => {
    await clickRow(page, PURCHASE_ROW.id);

    const modal = page.getByTestId('generic-preview-modal');
    await expect(modal.getByTestId('preview-drop-zone')).toBeVisible({ timeout: 5_000 });
  });

  test('GET /sws/neo/preview-file is called with correct specName and recordId', async ({ page }) => {
    // Capture the GET request before opening the preview.
    const getRequest = page.waitForRequest(
      (req) => req.url().includes('/sws/neo/preview-file') && req.method() === 'GET',
    );

    await clickRow(page, PURCHASE_ROW.id);

    const req = await getRequest;
    const url = new URL(req.url(), 'http://localhost');
    expect(url.searchParams.get('specName')).toBe('purchase-invoice');
    expect(url.searchParams.get('recordId')).toBe(PURCHASE_ROW.id);
  });

  test('file input upload triggers POST to /sws/neo/preview-file with correct params', async ({ page }) => {
    await clickRow(page, PURCHASE_ROW.id);

    // Drop zone must be visible before we can upload
    await expect(page.getByTestId('preview-drop-zone')).toBeVisible({ timeout: 5_000 });

    // Capture the POST request
    const postRequest = page.waitForRequest(
      (req) => req.url().includes('/sws/neo/preview-file') && req.method() === 'POST',
    );

    // Set a file on the hidden file input inside the drop zone
    const fileInput = page.locator('[data-testid="preview-drop-zone"] input[type="file"]');
    await fileInput.setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 1 0 obj<</Type/Catalog>>endobj%%EOF'),
    });

    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.specName).toBe('purchase-invoice');
    expect(body.recordId).toBe(PURCHASE_ROW.id);
    expect(body.fileName).toBe('receipt.pdf');
    expect(body.mimeType).toBe('application/pdf');
    expect(typeof body.fileData).toBe('string');
    expect(body.fileData.length).toBeGreaterThan(0);
  });
});

test.describe('Purchase invoice — cached file', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPreviewFileGet(page, {
      fileName: 'receipt.pdf',
      mimeType: 'application/pdf',
      fileData: FAKE_PDF_B64,
    });
    await seedPurchaseRows(page);
    await navigateTo(page, 'purchase-invoice');
  });

  test('file view is shown instead of the drop zone when a file is cached', async ({ page }) => {
    await clickRow(page, PURCHASE_ROW.id);

    const modal = page.getByTestId('generic-preview-modal');

    // Drop zone must be absent — the file view replaces it
    await expect(modal.getByTestId('preview-drop-zone')).not.toBeVisible({ timeout: 5_000 });

    // Delete button (aria-label) must be present
    const deleteBtn = modal.getByRole('button', { name: /eliminar|delete/i });
    await expect(deleteBtn).toBeVisible();
  });

  test('clicking the delete button sends DELETE and shows the drop zone again', async ({ page }) => {
    await clickRow(page, PURCHASE_ROW.id);

    const modal = page.getByTestId('generic-preview-modal');
    const deleteBtn = modal.getByRole('button', { name: /eliminar|delete/i });
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });

    // Capture the DELETE request
    const deleteRequest = page.waitForRequest(
      (req) => req.url().includes('/sws/neo/preview-file') && req.method() === 'DELETE',
    );

    await deleteBtn.click();

    // Verify DELETE was sent
    const req = await deleteRequest;
    const url = new URL(req.url(), 'http://localhost');
    expect(url.searchParams.get('specName')).toBe('purchase-invoice');
    expect(url.searchParams.get('recordId')).toBe(PURCHASE_ROW.id);

    // Drop zone must reappear after deletion
    await expect(modal.getByTestId('preview-drop-zone')).toBeVisible({ timeout: 5_000 });
  });
});

// ── Sales invoice — storeCondition gating ────────────────────────────────────

test.describe('Sales invoice — storeCondition gating', () => {
  test('completed invoice: GET /sws/neo/preview-file is called with specName=sales-invoice', async ({ page }) => {
    await login(page);
    await seedSalesRows(page, [SALES_ROW_COMPLETED]);
    await navigateTo(page, 'sales-invoice');

    const getRequest = page.waitForRequest(
      (req) => req.url().includes('/sws/neo/preview-file') && req.method() === 'GET',
    );

    await clickRow(page, SALES_ROW_COMPLETED.id);

    const req = await getRequest;
    const url = new URL(req.url(), 'http://localhost');
    expect(url.searchParams.get('specName')).toBe('sales-invoice');
    expect(url.searchParams.get('recordId')).toBe(SALES_ROW_COMPLETED.id);
  });

  test('draft invoice: GET /sws/neo/preview-file is NOT called (storeCondition=false)', async ({ page }) => {
    await login(page);
    await seedSalesRows(page, [SALES_ROW_DRAFT]);
    await navigateTo(page, 'sales-invoice');

    // Track any preview-file GET calls
    let previewFileGetFired = false;
    await page.route('**/sws/neo/preview-file{/**,}**', (route) => {
      if (route.request().method() === 'GET') previewFileGetFired = true;
      route.fallback();
    });

    await clickRow(page, SALES_ROW_DRAFT.id);

    // Wait for network to settle, then verify no GET was fired
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    // Small additional wait to let any deferred effects run
    await page.waitForTimeout(500);

    expect(previewFileGetFired, 'GET preview-file must not be called for draft invoices').toBe(false);
  });
});
