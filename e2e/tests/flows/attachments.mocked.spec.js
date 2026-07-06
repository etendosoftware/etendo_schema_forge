import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Attachments tab — E2E coverage (mocked).
 *
 * Covers three windows:
 *   • payment-in  (transactional, customTabsAfterBottom — Suites A–D)
 *   • product     (master record, smoke — Suite E)
 *   • sales-order (transactional, tab in main strip alongside Lines — Suites F–I)
 *
 * All API calls are intercepted; no real backend is needed.
 * Routing note: login() installs a `**\/sws/**` catch-all; window-specific mocks
 * must be installed AFTER login() so they take precedence.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

const PAYMENT_ID = 'mock-payment-att-001';
const PRODUCT_ID = 'mock-product-att-001';
const SO_ID = 'mock-so-att-001';

const PAYMENT_HEADER = {
  id: PAYMENT_ID,
  documentNo: 'FAP-ATT-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  paymentDate: '2026-05-13',
  'businessPartner$_identifier': 'Test Supplier',
  'currency$_identifier': 'EUR',
  paymentMethod: 'method-1',
  'paymentMethod$_identifier': 'Transferencia',
};

const PRODUCT_HEADER = {
  id: PRODUCT_ID,
  name: 'Test Product',
  searchKey: 'TESTPROD',
  productType: 'I',
  'productType$_identifier': 'Item',
};

const ATT_1 = {
  id: 'att-001',
  name: 'invoice.pdf',
  size: 102400,
  uploadedAt: '2026-05-13T10:00:00Z',
  updatedAt: '2026-05-13T10:00:00Z',
  uploadedBy: { name: 'Admin' },
};

const ATT_2 = {
  id: 'att-002',
  name: 'contract.docx',
  size: 51200,
  uploadedAt: '2026-05-13T09:00:00Z',
  updatedAt: '2026-05-13T09:00:00Z',
  uploadedBy: { name: 'Admin' },
};

// ─── Mock installer ────────────────────────────────────────────────────────────

/**
 * Install route mocks for the payment-in attachments tests.
 * Must be called AFTER login() so specific routes win over the auth catch-all.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {Array}    opts.items    - Initial list of attachment objects.
 * @param {Function} opts.onUpload - Called with the new attachment on upload.
 * @param {Function} opts.onDelete - Called with the deleted attachment id.
 */
async function installPaymentMocks(page, { items = [], onUpload = null, onDelete = null } = {}) {
  let currentItems = [...items];
  let uploadCounter = 0;

  // Payment header GET
  await page.route(`**/sws/neo/payment-in/finPayment/${PAYMENT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [PAYMENT_HEADER] } }),
    });
  });

  // Attachments: handles list (GET), upload (POST), file download (GET /file/*),
  // single delete (DELETE /file/*), and download-all (GET /zip).
  await page.route('**/sws/neo/attachments/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/zip')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: Buffer.from('PK'),
      });
    } else if (url.includes('/file/')) {
      if (method === 'DELETE') {
        const id = url.split('/').pop().split('?')[0];
        currentItems = currentItems.filter((i) => i.id !== id);
        onDelete?.(id);
        await route.fulfill({ status: 204 });
      } else if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4'),
        });
      } else {
        await route.continue();
      }
    } else if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: currentItems }),
      });
    } else if (method === 'POST') {
      uploadCounter += 1;
      const uploaded = {
        id: `att-new-${uploadCounter}`,
        name: 'uploaded.pdf',
        size: 1024,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        uploadedBy: { name: 'Admin' },
      };
      currentItems = [uploaded, ...currentItems];
      onUpload?.(uploaded);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: uploaded } }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Navigate to the payment-in detail view and wait for the page to settle. */
async function gotoPayment(page) {
  await page.goto(`/payment-in/${PAYMENT_ID}`);
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Click the Attachments tab (rendered in the customTabsAfterBottom strip,
 * so it lives below the payment activity panel, not in the main tab bar).
 */
async function openAttachmentsTab(page) {
  const tabBtn = page.getByTestId('tab-custom:attachments');
  await tabBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await tabBtn.click();
}

// ─── Suite A: Tab presence ─────────────────────────────────────────────────────

// Payment In/Out set `attachments: false` in decisions.json (commit 5bd640b91) —
// the attachments tab is intentionally disabled for these windows, so Suites
// A-D (which drive the tab via gotoPayment) no longer apply.
test.describe.skip('Suite A — Attachments tab presence (Payment In, mocked)', () => {
  test('A1: tab button is visible in the detail view', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);

    await expect(page.getByTestId('tab-custom:attachments')).toBeVisible({ timeout: 8_000 });
  });

  test('A2: badge is absent or zero when there are no attachments', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await tabBtn.waitFor({ state: 'visible', timeout: 8_000 });

    // Badge span is only rendered when count != null; with zero items it should
    // either be absent or explicitly show '0'.
    const badge = tabBtn.locator('span.inline-flex');
    const count = await badge.count();
    if (count > 0) {
      await expect(badge).toHaveText('0');
    }
  });

  test('A3: empty state is visible when there are no attachments', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 6_000 });
  });
});

// ─── Suite B: Upload ───────────────────────────────────────────────────────────

test.describe.skip('Suite B — Upload (mocked)', () => {
  test('B1: uploading a valid PDF adds it to the attachments table', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'invoice.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock content'),
    });

    await expect(page.getByTestId('attachment-row-att-new-1')).toBeVisible({ timeout: 6_000 });
  });

  test('B2: badge count increments after a successful upload', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    });

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await expect(tabBtn.locator('span.inline-flex')).toHaveText('1', { timeout: 6_000 });
  });

  test('B3: file that exceeds 10 MB shows an error toast and is not added', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    // 10 MB + 1 byte triggers the client-side size guard (maxSizeMB = 10)
    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'huge.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /too large|demasiado/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 3_000 });
  });

  test('B4: file with invalid MIME type shows an error toast and is not added', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /not allowed|no permitido/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 3_000 });
  });

  test('B5: uploading a duplicate filename opens the replace confirmation dialog; cancel aborts', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [ATT_1] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId(`attachment-row-${ATT_1.id}`)).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: ATT_1.name,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF duplicate'),
    });

    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 5_000 });

    await page.getByTestId('confirm-delete-cancel').click();
    await expect(page.getByTestId('confirm-delete-dialog')).not.toBeVisible({ timeout: 3_000 });
    // Original row still present, no new row added
    await expect(page.getByTestId(`attachment-row-${ATT_1.id}`)).toBeVisible({ timeout: 3_000 });
  });
});

// ─── Suite C: Delete ──────────────────────────────────────────────────────────

test.describe.skip('Suite C — Delete (mocked)', () => {
  test('C1: confirming delete removes the row from the table', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [ATT_1] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    const row = page.getByTestId(`attachment-row-${ATT_1.id}`);
    await expect(row).toBeVisible({ timeout: 6_000 });

    // The delete button is opacity-0 until hover; use force to click it.
    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-delete-${ATT_1.id}`).click({ force: true });

    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('confirm-delete-confirm').click();

    await expect(row).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 4_000 });
  });

  test('C2: cancelling delete keeps the row in the table', async ({ page }) => {
    await login(page);
    await installPaymentMocks(page, { items: [ATT_1] });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    const row = page.getByTestId(`attachment-row-${ATT_1.id}`);
    await expect(row).toBeVisible({ timeout: 6_000 });

    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-delete-${ATT_1.id}`).click({ force: true });

    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('confirm-delete-cancel').click();

    await expect(page.getByTestId('confirm-delete-dialog')).not.toBeVisible({ timeout: 3_000 });
    await expect(row).toBeVisible({ timeout: 3_000 });
  });

  test('C3: Delete All clears the table and resets the badge', async ({ page }) => {
    const deleted = [];
    await login(page);
    await installPaymentMocks(page, {
      items: [ATT_1, ATT_2],
      onDelete: (id) => deleted.push(id),
    });
    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId(`attachment-row-${ATT_1.id}`)).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId(`attachment-row-${ATT_2.id}`)).toBeVisible({ timeout: 3_000 });

    await page.getByTestId('attachments-delete-all').click();
    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('confirm-delete-confirm').click();

    await expect(page.getByTestId(`attachment-row-${ATT_1.id}`)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId(`attachment-row-${ATT_2.id}`)).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 4_000 });

    // Badge should be absent or show 0
    const tabBtn = page.getByTestId('tab-custom:attachments');
    const badge = tabBtn.locator('span.inline-flex');
    const badgeVisible = await badge.isVisible().catch(() => false);
    if (badgeVisible) {
      await expect(badge).toHaveText('0', { timeout: 3_000 });
    }
  });
});

// ─── Suite D: Download ────────────────────────────────────────────────────────

test.describe.skip('Suite D — Download (mocked)', () => {
  test('D1: clicking download on a row calls the file download endpoint', async ({ page }) => {
    let downloadCalled = false;
    await login(page);
    await installPaymentMocks(page, { items: [ATT_1] });

    // Register a more specific route after installPaymentMocks so it wins.
    await page.route(`**/sws/neo/attachments/file/${ATT_1.id}**`, async (route) => {
      if (route.request().method() === 'GET') {
        downloadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4'),
        });
      } else {
        await route.continue();
      }
    });

    await gotoPayment(page);
    await openAttachmentsTab(page);

    const row = page.getByTestId(`attachment-row-${ATT_1.id}`);
    await expect(row).toBeVisible({ timeout: 6_000 });
    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-download-${ATT_1.id}`).click({ force: true });

    await expect.poll(() => downloadCalled, { timeout: 5_000 }).toBe(true);
  });

  test('D2: clicking Download All (ZIP) calls the zip endpoint', async ({ page }) => {
    let zipCalled = false;
    await login(page);
    await installPaymentMocks(page, { items: [ATT_1, ATT_2] });

    // Register after installPaymentMocks so it takes priority for /zip requests.
    await page.route('**/sws/neo/attachments/**/zip**', async (route) => {
      zipCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: Buffer.from('PK'),
      });
    });

    await gotoPayment(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId(`attachment-row-${ATT_1.id}`)).toBeVisible({ timeout: 6_000 });

    await page.getByTestId('attachments-download-all').click();

    await expect.poll(() => zipCalled, { timeout: 5_000 }).toBe(true);
  });
});

// ─── Suite E: Product smoke ───────────────────────────────────────────────────

test.describe('Suite E — Product smoke (mocked)', () => {
  test('E1: Attachments tab is visible on a master record (Product)', async ({ page }) => {
    await login(page);

    await page.route(`**/sws/neo/product/product/${PRODUCT_ID}`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [PRODUCT_HEADER] } }),
      });
    });
    await page.route('**/sws/neo/attachments/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    });

    await page.goto(`/product/${PRODUCT_ID}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    await expect(page.getByTestId('tab-custom:attachments')).toBeVisible({ timeout: 8_000 });
  });

  test('E2: upload works on a Product master record', async ({ page }) => {
    const uploaded = [];
    await login(page);

    await page.route(`**/sws/neo/product/product/${PRODUCT_ID}`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [PRODUCT_HEADER] } }),
      });
    });
    await page.route('**/sws/neo/attachments/**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: uploaded }),
        });
      } else if (method === 'POST') {
        const newItem = {
          id: 'prod-att-001',
          name: 'spec.pdf',
          size: 1024,
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        uploaded.push(newItem);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: newItem } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/product/${PRODUCT_ID}`);
    await page.waitForLoadState('networkidle').catch(() => {});

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await tabBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await tabBtn.click();

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'spec.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF spec'),
    });

    await expect(page.getByTestId('attachment-row-prod-att-001')).toBeVisible({ timeout: 6_000 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SALES ORDER — Suites F–I
//
// Sales Order has the attachments tab in the MAIN tab strip (alongside Lines),
// not below the bottom section. The tab data-testid is still
// `tab-custom:attachments` — same selector, different DOM placement.
// API table name: C_Order  |  Header entity: header
// ═════════════════════════════════════════════════════════════════════════════

const SO_HEADER = {
  id: SO_ID,
  documentNo: 'SO-ATT-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 500,
  summedLineAmount: 500,
  totalLines: 500,
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
};

/**
 * Install mocks for a Sales Order detail view + attachments.
 * Mirrors installPaymentMocks but targets /sales-order/header/{id} and C_Order.
 */
async function installSalesOrderMocks(page, { items = [], onUpload = null, onDelete = null } = {}) {
  let currentItems = [...items];
  let uploadCounter = 0;

  // Header GET
  await page.route(`**/sws/neo/sales-order/header/${SO_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [SO_HEADER] } }),
    });
  });

  // Lines GET — return empty so the Lines tab renders cleanly
  await page.route('**/sws/neo/sales-order/lines**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  // Attachments: list, upload, file download, delete, download-all ZIP
  await page.route('**/sws/neo/attachments/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/zip')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: Buffer.from('PK'),
      });
    } else if (url.includes('/file/')) {
      if (method === 'DELETE') {
        const id = url.split('/').pop().split('?')[0];
        currentItems = currentItems.filter((i) => i.id !== id);
        onDelete?.(id);
        await route.fulfill({ status: 204 });
      } else if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4'),
        });
      } else {
        await route.continue();
      }
    } else if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: currentItems }),
      });
    } else if (method === 'POST') {
      uploadCounter += 1;
      const uploaded = {
        id: `so-att-new-${uploadCounter}`,
        name: 'uploaded.pdf',
        size: 2048,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        uploadedBy: { name: 'Admin' },
      };
      currentItems = [uploaded, ...currentItems];
      onUpload?.(uploaded);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: uploaded } }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Navigate to a Sales Order detail view and wait for it to settle. */
async function gotoSalesOrder(page) {
  await page.goto(`/sales-order/${SO_ID}`);
  await page.waitForLoadState('networkidle').catch(() => {});
}

const SO_ATT_1 = {
  id: 'so-att-001',
  name: 'purchase-order.pdf',
  size: 204800,
  uploadedAt: '2026-05-13T08:00:00Z',
  updatedAt: '2026-05-13T08:00:00Z',
  uploadedBy: { name: 'Admin' },
};

const SO_ATT_2 = {
  id: 'so-att-002',
  name: 'delivery-note.pdf',
  size: 98304,
  uploadedAt: '2026-05-13T07:00:00Z',
  updatedAt: '2026-05-13T07:00:00Z',
  uploadedBy: { name: 'Admin' },
};

// ─── Suite F: Tab presence (Sales Order) ──────────────────────────────────────

test.describe('Suite F — Sales Order: tab presence (mocked)', () => {
  test('F1: Attachments tab appears in the main strip alongside the Lines tab', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [] });
    await gotoSalesOrder(page);

    // Both the Lines tab and the Attachments tab must be visible
    await expect(page.getByTestId('tab-lines')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('tab-custom:attachments')).toBeVisible({ timeout: 8_000 });
  });

  test('F2: clicking the Attachments tab shows the empty state', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [] });
    await gotoSalesOrder(page);

    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 6_000 });
  });

  test('F3: switching between Lines and Attachments tabs preserves state', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1] });
    await gotoSalesOrder(page);

    // Open Attachments — attachment should load
    await openAttachmentsTab(page);
    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).toBeVisible({ timeout: 6_000 });

    // Switch to Lines tab and back — attachment row must still be there
    await page.getByTestId('tab-lines').click();
    await openAttachmentsTab(page);
    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).toBeVisible({ timeout: 4_000 });
  });
});

// ─── Suite G: Upload (Sales Order) ────────────────────────────────────────────

test.describe('Suite G — Sales Order: upload (mocked)', () => {
  test('G1: uploading a PDF adds it to the attachments table', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'order-confirmation.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 order'),
    });

    await expect(page.getByTestId('attachment-row-so-att-new-1')).toBeVisible({ timeout: 6_000 });
  });

  test('G2: badge count in the tab increments after upload', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'proforma.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF proforma'),
    });

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await expect(tabBtn.locator('span.inline-flex')).toHaveText('1', { timeout: 6_000 });
  });

  test('G3: uploading a duplicate filename opens the replace confirmation', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: SO_ATT_1.name,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF replace'),
    });

    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 5_000 });
    // Confirm the replace — a new row should appear
    await page.getByTestId('confirm-delete-confirm').click();
    await expect(page.getByTestId('confirm-delete-dialog')).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('attachment-row-so-att-new-1')).toBeVisible({ timeout: 6_000 });
  });
});

// ─── Suite H: Delete (Sales Order) ────────────────────────────────────────────

test.describe('Suite H — Sales Order: delete (mocked)', () => {
  test('H1: confirming delete removes the attachment row', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    const row = page.getByTestId(`attachment-row-${SO_ATT_1.id}`);
    await expect(row).toBeVisible({ timeout: 6_000 });

    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-delete-${SO_ATT_1.id}`).click({ force: true });

    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('confirm-delete-confirm').click();

    await expect(row).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 4_000 });
  });

  test('H2: cancelling delete keeps the attachment in the table', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    const row = page.getByTestId(`attachment-row-${SO_ATT_1.id}`);
    await expect(row).toBeVisible({ timeout: 6_000 });

    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-delete-${SO_ATT_1.id}`).click({ force: true });

    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('confirm-delete-cancel').click();

    await expect(page.getByTestId('confirm-delete-dialog')).not.toBeVisible({ timeout: 3_000 });
    await expect(row).toBeVisible({ timeout: 3_000 });
  });

  test('H3: Delete All removes all attachments and resets the badge', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1, SO_ATT_2] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId(`attachment-row-${SO_ATT_2.id}`)).toBeVisible({ timeout: 3_000 });

    await page.getByTestId('attachments-delete-all').click();
    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible({ timeout: 4_000 });
    await page.getByTestId('confirm-delete-confirm').click();

    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId(`attachment-row-${SO_ATT_2.id}`)).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible({ timeout: 4_000 });

    const tabBtn = page.getByTestId('tab-custom:attachments');
    const badge = tabBtn.locator('span.inline-flex');
    const badgeVisible = await badge.isVisible().catch(() => false);
    if (badgeVisible) {
      await expect(badge).toHaveText('0', { timeout: 3_000 });
    }
  });
});

// ─── Suite I: Download (Sales Order) ──────────────────────────────────────────

test.describe('Suite I — Sales Order: download (mocked)', () => {
  test('I1: clicking download on a row calls the file download endpoint', async ({ page }) => {
    let downloadCalled = false;
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1] });

    await page.route(`**/sws/neo/attachments/file/${SO_ATT_1.id}**`, async (route) => {
      if (route.request().method() === 'GET') {
        downloadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4'),
        });
      } else {
        await route.continue();
      }
    });

    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    const row = page.getByTestId(`attachment-row-${SO_ATT_1.id}`);
    await expect(row).toBeVisible({ timeout: 6_000 });
    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-download-${SO_ATT_1.id}`).click({ force: true });

    await expect.poll(() => downloadCalled, { timeout: 5_000 }).toBe(true);
  });

  test('I2: Download All (ZIP) calls the zip endpoint', async ({ page }) => {
    let zipCalled = false;
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1, SO_ATT_2] });

    await page.route('**/sws/neo/attachments/**/zip**', async (route) => {
      zipCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: Buffer.from('PK'),
      });
    });

    await gotoSalesOrder(page);
    await openAttachmentsTab(page);

    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).toBeVisible({ timeout: 6_000 });
    await page.getByTestId('attachments-download-all').click();

    await expect.poll(() => zipCalled, { timeout: 5_000 }).toBe(true);
  });
});
