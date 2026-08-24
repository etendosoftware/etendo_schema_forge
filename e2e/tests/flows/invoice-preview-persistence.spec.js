import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Invoice Preview — file persistence tests.
 *
 * Tests the GenericPreviewModal.attachmentConfig integration, which is backed
 * by two different hooks depending on the window (see ManagedLeftPanel in
 * GenericPreviewModal.jsx):
 *
 * Purchase invoice scenarios (storeCondition always true) — ETP-4315: this
 * window now uses `useMainAttachment` (the real, marked `Attachment` row
 * shared with OcrSidePanel/"Adjuntos", via GET/POST/DELETE
 * `/sws/neo/attachments/*`), not the ETGO_PREVIEW_FILE cache — see
 * attachment-preview-sync.mocked.spec.js for the sidebar/preview parity
 * coverage this replaces:
 *   · No cached file  → drop zone visible
 *   · Cached file     → file view visible, delete button present
 *   · Delete          → DELETE request sent, drop zone reappears
 *   · File upload     → POST request sent with correct tableName / recordId
 *
 * Sales invoice scenarios — ETP-4315: sales-invoice's `GenericPreviewModal`
 * attachment panel is fully migrated to `useMainAttachment` /
 * `/sws/neo/attachments/**` too (same shared `InvoicePreview.jsx` /
 * `useInvoicePreview.js`, `tableName: 'C_Invoice'`, as purchase-invoice
 * above). The retired `/sws/neo/preview-file` endpoint no longer exists in
 * the backend at all:
 *   · Completed (CO)  → GET .../attachments/C_Invoice/{recordId}/main is called
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
 * Mock the real-attachment `/sws/neo/attachments/*` family that
 * `useMainAttachment` (ManagedLeftPanel, GenericPreviewModal.jsx) consumes
 * for purchase-invoice (ETP-4315):
 *   - GET  .../attachments/{tableName}/{recordId}/main         → `mainAttachment` (or `{}` for none)
 *   - GET  .../attachments/file/{id}                            → `fileBytes` (PDF)
 *   - POST .../attachments/{tableName}/{recordId}?markAsMain=true → the newly uploaded attachment's metadata
 *   - DELETE .../attachments/file/{id}                          → 200 OK
 */
async function mockMainAttachment(page, tableName, mainAttachment, fileBytes) {
  await page.route('**/sws/neo/attachments/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (!url.includes(`/attachments/${tableName}/`) && !url.includes('/attachments/file/')) {
      route.fallback();
      return;
    }
    if (method === 'GET' && /\/main(?:[/?]|$)/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mainAttachment ?? {}),
      });
      return;
    }
    if (method === 'GET' && url.includes('/file/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: fileBytes ?? Buffer.from('%PDF-1.4'),
      });
      return;
    }
    if (method === 'DELETE' && url.includes('/file/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (method === 'POST' && url.includes('markAsMain=true')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'att-uploaded-1', name: 'receipt.pdf', dataType: 'application/pdf' }),
      });
      return;
    }
    route.fallback();
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
    // No attachment marked as "main" yet — GET .../main resolves `{}`,
    // which fetchMainAttachment treats as "none" (no `.id`).
    await mockMainAttachment(page, 'C_Invoice', {});
    await seedPurchaseRows(page);
    await navigateTo(page, 'purchase-invoice');
  });

  test('drop zone is visible when no file is cached', async ({ page }) => {
    await clickRow(page, PURCHASE_ROW.id);

    const modal = page.getByTestId('generic-preview-modal');
    await expect(modal.getByTestId('preview-drop-zone')).toBeVisible({ timeout: 5_000 });
  });

  test('GET .../attachments/{tableName}/{recordId}/main is called for the record', async ({ page }) => {
    // Capture the GET request before opening the preview.
    const getRequest = page.waitForRequest(
      (req) => req.url().includes('/sws/neo/attachments/') && req.url().endsWith('/main') && req.method() === 'GET',
    );

    await clickRow(page, PURCHASE_ROW.id);

    const req = await getRequest;
    expect(req.url()).toContain(`/sws/neo/attachments/C_Invoice/${PURCHASE_ROW.id}/main`);
  });

  test('file input upload triggers POST to .../attachments/{tableName}/{recordId}?markAsMain=true', async ({ page }) => {
    await clickRow(page, PURCHASE_ROW.id);

    // Drop zone must be visible before we can upload
    await expect(page.getByTestId('preview-drop-zone')).toBeVisible({ timeout: 5_000 });

    // Capture the POST request
    const postRequest = page.waitForRequest(
      (req) => req.url().includes(`/sws/neo/attachments/C_Invoice/${PURCHASE_ROW.id}`)
        && req.url().includes('markAsMain=true')
        && req.method() === 'POST',
    );

    // Set a file on the hidden file input inside the drop zone
    const fileInput = page.locator('[data-testid="preview-drop-zone"] input[type="file"]');
    await fileInput.setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 1 0 obj<</Type/Catalog>>endobj%%EOF'),
    });

    const req = await postRequest;
    expect(req.headers()['content-type']).toContain('multipart/form-data');
    expect(req.postData()).toContain('filename="receipt.pdf"');
  });
});

test.describe('Purchase invoice — cached file', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockMainAttachment(
      page,
      'C_Invoice',
      { id: 'att-cached-1', name: 'receipt.pdf', dataType: 'application/pdf' },
      Buffer.from(FAKE_PDF_B64, 'base64'),
    );
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
      (req) => req.url().includes('/sws/neo/attachments/file/') && req.method() === 'DELETE',
    );

    await deleteBtn.click();

    // Verify DELETE was sent to the marked attachment's own id
    const req = await deleteRequest;
    expect(req.url()).toContain('/sws/neo/attachments/file/att-cached-1');

    // Drop zone must reappear after deletion
    await expect(modal.getByTestId('preview-drop-zone')).toBeVisible({ timeout: 5_000 });
  });
});

// ── Sales invoice — storeCondition gating ────────────────────────────────────

test.describe('Sales invoice — storeCondition gating', () => {
  test('completed invoice: GET .../attachments/{tableName}/{recordId}/main is called for the record', async ({ page }) => {
    await login(page);
    // No attachment marked as "main" yet — GET .../main resolves `{}`,
    // which fetchMainAttachment treats as "none" (no `.id`).
    await mockMainAttachment(page, 'C_Invoice', {});
    await seedSalesRows(page, [SALES_ROW_COMPLETED]);
    await navigateTo(page, 'sales-invoice');

    const getRequest = page.waitForRequest(
      (req) => req.url().includes('/sws/neo/attachments/') && req.url().endsWith('/main') && req.method() === 'GET',
    );

    await clickRow(page, SALES_ROW_COMPLETED.id);

    const req = await getRequest;
    expect(req.url()).toContain(`/sws/neo/attachments/C_Invoice/${SALES_ROW_COMPLETED.id}/main`);
  });

  test('draft invoice: GET .../attachments/{tableName}/{recordId}/main is NOT called (storeCondition=false)', async ({ page }) => {
    await login(page);

    // Track any GET .../attachments/**/main calls without seeding a real
    // mainAttachment response — the assertion is that this route is never hit.
    let mainGetFired = false;
    await page.route('**/sws/neo/attachments/**', (route) => {
      const req = route.request();
      if (req.method() === 'GET' && /\/main(?:[/?]|$)/.test(req.url())) {
        mainGetFired = true;
      }
      route.fallback();
    });
    await seedSalesRows(page, [SALES_ROW_DRAFT]);
    await navigateTo(page, 'sales-invoice');

    await clickRow(page, SALES_ROW_DRAFT.id);

    // Wait for network to settle, then verify no GET was fired
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    // Small additional wait to let any deferred effects run
    await page.waitForTimeout(500);

    expect(mainGetFired, 'GET .../attachments/{tableName}/{recordId}/main must not be called for draft invoices').toBe(false);
  });
});
