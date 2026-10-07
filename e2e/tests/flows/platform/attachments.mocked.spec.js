// @covers tools/app-shell/src/components/attachments/AttachmentsTab.jsx
// @covers tools/app-shell/src/components/contract-ui/TabStripButton.jsx
// @covers tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Attachments tab — E2E coverage (mocked).
 *
 * Covers four windows:
 *   • product          (master record, smoke — Suite E)
 *   • sales-order      (transactional, tab in main strip alongside Lines — Suites F–I)
 *   • purchase-order   (new record, no saveBeforeAttach → tab disabled — Suite J)
 *   • purchase-invoice (new record, saveBeforeAttach → save header, then upload — Suite J)
 *
 * Payment In/Out set `attachments: false` in decisions.json (commit 5bd640b91) —
 * the tab is intentionally disabled for those windows, so this file no longer
 * covers them.
 *
 * All API calls are intercepted; no real backend is needed.
 * Routing note: login() installs a `**\/sws/**` catch-all; window-specific mocks
 * must be installed AFTER login() so they take precedence.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

const PRODUCT_ID = 'mock-product-att-001';
const SO_ID = 'mock-so-att-001';

const PRODUCT_HEADER = {
  id: PRODUCT_ID,
  name: 'Test Product',
  searchKey: 'TESTPROD',
  productType: 'I',
  'productType$_identifier': 'Item',
};

// ─── Mock installer ────────────────────────────────────────────────────────────

/**
 * Click the Attachments tab.
 *
 * When `settleOn` is given, retries the click if that locator hasn't appeared
 * yet: onClick is plain React state (no aria-selected/data-state to wait on),
 * so under full-suite concurrency the click can land before the handler is
 * attached and silently no-op — a single long wait then just times out on a
 * panel that will never open. Retrying the click itself, not just the wait,
 * is what fixes that race.
 */
async function openAttachmentsTab(page, settleOn) {
  const tabBtn = page.getByTestId('tab-custom:attachments');
  await tabBtn.waitFor({ state: 'visible', timeout: 8_000 });

  if (!settleOn) {
    await tabBtn.click();
    return;
  }

  const attempts = [2_000, 2_000, 6_000];
  for (let i = 0; i < attempts.length; i += 1) {
    await tabBtn.click();
    try {
      await settleOn.waitFor({ state: 'visible', timeout: attempts[i] });
      return;
    } catch (err) {
      if (i === attempts.length - 1) throw err;
    }
  }
}

// ─── Suite E: Product smoke ───────────────────────────────────────────────────

test.describe('Suite E — Product smoke (mocked)', () => {

  test('E2: upload works on a Product master record', async ({ page }) => {
    const uploaded = [];
    await login(page);

    await page.route(`**/sws/neo/product/product/${PRODUCT_ID}`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
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
        await route.fallback();
      }
    });

    await page.goto(`/product/${PRODUCT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

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

/** Install mocks for a Sales Order detail view + attachments. */
// Non-matching methods use route.fallback(), NOT route.continue(): continue() sends the
// request to the real network, so a request these handlers do not model reached the live
// backend with the fake E2E token and came back 401. That was harmless while a 401 was
// ignored; since ETP-5022 routes an expired session to the login screen, it logged the test
// out and blanked the page. fallback() defers to login()'s /sws/** catch-all instead, which
// is what the rest of this suite already does.
async function installSalesOrderMocks(page, { items = [], onUpload = null, onDelete = null } = {}) {
  let currentItems = [...items];
  let uploadCounter = 0;

  // Header GET
  await page.route(`**/sws/neo/sales-order/header/${SO_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [SO_HEADER] } }),
    });
  });

  // Lines GET — return empty so the Lines tab renders cleanly
  await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
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
        await route.fallback();
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
      await route.fallback();
    }
  });
}

/** Navigate to a Sales Order detail view and wait for it to settle. */
async function gotoSalesOrder(page) {
  await page.goto(`/sales-order/${SO_ID}`);
  // Bounded — same as every other mocked spec (e.g. amortization.mocked.spec.js). Without
  // an explicit timeout this falls back to Playwright's ~30s navigation timeout, and the
  // Sales Order detail page doesn't reliably go network-idle within that window under load
  // — eating half of every Suite F-I test's 60s budget for a wait whose result is discarded
  // either way, which is what turned F1's real (fast) render into a 60s timeout + "context
  // closed" failure instead of a normal pass.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
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

// ─── Suite G: Upload (Sales Order) ────────────────────────────────────────────

test.describe('Suite G — Sales Order: upload (mocked)', () => {
  test('G1: uploading a PDF adds it to the attachments table', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page, page.getByTestId('attachments-dropzone'));

    await expect(page.getByTestId('attachments-dropzone')).toBeVisible({ timeout: 6_000 });

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'order-confirmation.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 order'),
    });

    await expect(page.getByTestId('attachment-row-so-att-new-1')).toBeVisible({ timeout: 6_000 });
  });

  test('G3: uploading a duplicate filename opens the replace confirmation', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1] });
    await gotoSalesOrder(page);
    await openAttachmentsTab(page, page.getByTestId(`attachment-row-${SO_ATT_1.id}`));

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
    const row = page.getByTestId(`attachment-row-${SO_ATT_1.id}`);
    await openAttachmentsTab(page, row);

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
    const row = page.getByTestId(`attachment-row-${SO_ATT_1.id}`);
    await openAttachmentsTab(page, row);

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
    await openAttachmentsTab(page, page.getByTestId(`attachment-row-${SO_ATT_1.id}`));

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

    await page.route(`**/sws/neo/attachments/file/${SO_ATT_1.id}{/**,}**`, async (route) => {
      if (route.request().method() === 'GET') {
        downloadCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4'),
        });
      } else {
        await route.fallback();
      }
    });

    await gotoSalesOrder(page);
    const row = page.getByTestId(`attachment-row-${SO_ATT_1.id}`);
    await openAttachmentsTab(page, row);

    await expect(row).toBeVisible({ timeout: 6_000 });
    await row.dispatchEvent('mouseover');
    await page.getByTestId(`attachment-download-${SO_ATT_1.id}`).click({ force: true });

    await expect.poll(() => downloadCalled, { timeout: 5_000 }).toBe(true);
  });

  test('I2: Download All (ZIP) calls the zip endpoint', async ({ page }) => {
    let zipCalled = false;
    await login(page);
    await installSalesOrderMocks(page, { items: [SO_ATT_1, SO_ATT_2] });

    await page.route('**/sws/neo/attachments/**/zip{/**,}**', async (route) => {
      zipCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: Buffer.from('PK'),
      });
    });

    await gotoSalesOrder(page);
    await openAttachmentsTab(page, page.getByTestId(`attachment-row-${SO_ATT_1.id}`));

    await expect(page.getByTestId(`attachment-row-${SO_ATT_1.id}`)).toBeVisible({ timeout: 6_000 });
    await page.getByTestId('attachments-download-all').click();

    await expect.poll(() => zipCalled, { timeout: 5_000 }).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEW RECORD — Suite J
//
// Nothing can be attached to a record that does not exist yet. A window WITHOUT
// `saveBeforeAttach` (purchase-order) renders the Attachments tab disabled on
// /new, with the save-first hint as its tooltip, and never POSTs against "new"
// (it used to, and surfaced a raw backend 500). A window WITH `saveBeforeAttach`
// (purchase-invoice) keeps the dropzone: dropping a file saves the header first,
// then uploads against the id the save returned.
// ═════════════════════════════════════════════════════════════════════════════

// Both locales the app can boot in — the tooltip is the translated hint.
const SAVE_FIRST_HINT = /^(Guarda el documento antes de adjuntar archivos|Save the document before attaching files)$/;

/** Records every request to the attachments API (method + URL). */
function trackAttachmentRequests(page) {
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('/sws/neo/attachments/')) {
      requests.push({ method: req.method(), url: req.url() });
    }
  });
  return requests;
}

test.describe('Suite J — new record (mocked)', () => {
  test('J1: purchase-order /new — the Attachments tab is disabled with the hint and nothing is uploaded', async ({ page }) => {
    await login(page);
    const attachmentRequests = trackAttachmentRequests(page);

    await page.route('**/sws/neo/purchase-order/header/defaults{/**,}**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaults: { documentStatus: 'DR' } }),
      });
    });

    await page.goto('/purchase-order/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await tabBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(tabBtn).toHaveAttribute('aria-disabled', 'true');
    await expect(tabBtn).toHaveAttribute('title', SAVE_FIRST_HINT);

    // Playwright's actionability check honours aria-disabled, so force the click
    // through to prove the handler itself ignores it.
    await expect(tabBtn).toBeDisabled();
    await tabBtn.click({ force: true });
    await expect(page.getByTestId('attachments-dropzone')).toBeHidden();
    await expect(page.getByTestId('attachments-save-first-hint')).toBeHidden();

    expect(attachmentRequests.filter((r) => r.method === 'POST')).toEqual([]);
    expect(attachmentRequests.filter((r) => /\/new(\/|\?|$)/.test(r.url))).toEqual([]);
  });

  test('J2: purchase-invoice /new (saveBeforeAttach) — dropping a file saves the header, then uploads against the saved id', async ({ page }) => {
    const SAVED_ID = '7A7A7A7A00000000000000000000A7A7';
    const capture = { headerPosts: 0, uploadUrls: [] };

    // Every required editable header field pre-filled so the client-side
    // required-field guard passes and the header POST actually fires.
    const defaults = {
      transactionDocument: 'td-api-001', 'transactionDocument$_identifier': 'AP Invoice',
      documentNo: 'FP-NEW-1',
      invoiceDate: '2026-07-16',
      accountingDate: '2026-07-16',
      businessPartner: 'bp-att-001', 'businessPartner$_identifier': 'Proveedor Adjuntos S.L.',
      partnerAddress: 'addr-att-001', 'partnerAddress$_identifier': 'Calle Adjuntos 1',
      paymentMethod: 'pm-001', 'paymentMethod$_identifier': 'Transferencia',
      paymentTerms: 'pt-001', 'paymentTerms$_identifier': '30 días',
      currency: 'eur-001', 'currency$_identifier': 'EUR',
      priceList: 'pl-001', 'priceList$_identifier': 'Tarifa compra',
      documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador',
    };
    const saved = {
      ...defaults,
      id: SAVED_ID,
      processed: false,
      posted: 'N',
      grandTotalAmount: 0,
      summedLineAmount: 0,
    };

    await login(page);
    const attachmentRequests = trackAttachmentRequests(page);

    await page.route('**/sws/neo/purchase-invoice/header{/**,}**', async (route) => {
      const req = route.request();
      const url = req.url();
      const isSubPath = /\/header\/[^/?]+/.test(url);
      if (req.method() === 'POST') {
        // Sub-path POSTs (callout, evaluate-display) are not the header create.
        if (isSubPath) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
          return;
        }
        capture.headerPosts += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [saved] } }),
        });
        return;
      }
      if (req.method() === 'GET' && !isSubPath) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      return route.fallback();
    });

    await page.route('**/sws/neo/purchase-invoice/header/defaults{/**,}**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaults }),
      });
    });

    await page.route(`**/sws/neo/purchase-invoice/header/${SAVED_ID}{/**,}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [saved] } }),
      });
    });

    for (const entity of ['lines', 'paymentPlan', 'reversedInvoices']) {
      await page.route(`**/sws/neo/purchase-invoice/${entity}{/**,}**`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
      });
    }

    let uploadedItems = [];
    await page.route('**/sws/neo/attachments/**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        capture.uploadUrls.push(req.url());
        const item = {
          id: 'pi-att-new-1',
          name: 'factura-proveedor.pdf',
          size: 2048,
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          uploadedBy: { name: 'Admin' },
        };
        uploadedItems = [item];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: item } }),
        });
        return;
      }
      if (req.method() === 'GET' && !req.url().includes('/file/') && !req.url().includes('/zip')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: uploadedItems }),
        });
        return;
      }
      return route.fallback();
    });

    await page.goto('/purchase-invoice/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await tabBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(tabBtn).not.toHaveAttribute('aria-disabled', 'true');
    await openAttachmentsTab(page, page.getByTestId('attachments-dropzone'));
    await expect(page.getByTestId('attachments-save-first-hint')).toHaveCount(0);

    await page.locator('[data-testid="attachments-file-input"]').setInputFiles({
      name: 'factura-proveedor.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 supplier invoice'),
    });

    await expect.poll(() => capture.headerPosts, { timeout: 10_000 }).toBe(1);
    await expect.poll(() => capture.uploadUrls.length, { timeout: 10_000 }).toBe(1);
    expect(capture.uploadUrls[0]).toMatch(new RegExp(`/sws/neo/attachments/C_Invoice/${SAVED_ID}(\\?|$)`));
    expect(attachmentRequests.filter((r) => /\/new(\/|\?|$)/.test(r.url))).toEqual([]);

    await expect(page).toHaveURL(new RegExp(`/purchase-invoice/${SAVED_ID}`), { timeout: 10_000 });
  });
});
