import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-4315 — Attachment / Preview sync regression coverage (mocked).
 *
 * Purchase invoices and goods receipts used to have TWO independent,
 * unsynchronized stores for the same record's document file:
 *
 *   1. The real attachment UI (OcrSidePanel sidebar for purchase-invoice,
 *      "Adjuntos" tab — AttachmentsTab — for both windows), backed by the
 *      real AD_Attachment grid: GET /sws/neo/attachments/{tableName}/{recordId}.
 *   2. The document preview opened from the list view (GenericPreviewModal),
 *      backed by a completely separate cache table: GET /sws/neo/preview-file.
 *
 * The fix unified all three surfaces (sidebar, "Adjuntos" tab, and list-view
 * preview) on a single endpoint — GET
 * /sws/neo/attachments/{tableName}/{recordId}/main, which returns the one
 * attachment metadata object marked as the record's "main" document — via
 * `fetchMainAttachment` (listAttachments.js) and the `useMainAttachment` hook
 * (tools/app-shell/src/windows/custom/shared/useMainAttachment.js), so they
 * can no longer diverge by construction. The retired `/sws/neo/preview-file`
 * cache and its `usePreviewAttachment` hook were removed once every window
 * had migrated (see docs/plans/2026-08-03-etp-4315-attachment-preview-sync.md
 * and docs/plans/2026-08-14-etp-4315-attachment-preview-unification-plan.md).
 * `installPreviewFileMock` below still seeds that retired endpoint — it is
 * now dead code from the app's point of view, kept deliberately as a canary:
 * if a future regression ever re-reads it, this fixture returns an
 * obviously-wrong file name that would fail these tests immediately.
 *
 * Separately, ETP-4855 removed OcrSidePanel's tab bar (`role="tablist"` —
 * the "File" / "Messages" / "History" tabs, the latter two permanent
 * "coming soon" placeholders). OcrSidePanel now renders its single view
 * (`FileTab` → `DocumentView`) directly with no tabs at all — see
 * tools/app-shell/src/windows/custom/shared/OcrSidePanel.jsx. `DocumentView`
 * shows the resolved file's name in a plain
 * `<span className="truncate">{storedFile.fileName}</span>`, with no
 * data-testid reaching the DOM on that span or its container — the nearby
 * `FileText` icon carries the codemod-generated `FileText__c851a1` testid
 * (its hash suffix is derived from OcrSidePanel.jsx alone and appears
 * nowhere else in the app), which lucide-react forwards onto the rendered
 * `<svg>`. That icon and the file-name span are both direct children of the
 * same row `<div>`, so scoping through the icon's parent reliably isolates
 * the sidebar's rendered file name from the unrelated "Adjuntos" tab, which
 * fetches the same real-attachments endpoint and stays mounted (hidden, not
 * unmounted) while the "General" tab is active.
 *
 * These two suites render BOTH surfaces for the SAME record id and assert
 * the preview shows the exact same file the sidebar/tab already show. This
 * guards against the ETP-4315 regression: both surfaces resolve through the
 * same `/main` endpoint, so they cannot diverge again without this failing.
 *
 * Routing note: login() installs a `**\/sws/**` catch-all; window-specific
 * mocks are installed AFTER login() so they take priority (LIFO order).
 */

// ── Shared PDF bytes for the mocked preview-file cache ────────────────────────

function fakePreviewFilePayload(fileName) {
  return {
    fileName,
    mimeType: 'application/pdf',
    fileData: Buffer.from(`%PDF-1.4 ${fileName} (wrong cached content)`).toString('base64'),
  };
}

async function installPreviewFileMock(page, response) {
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

/**
 * Install the real attachments surface (`/sws/neo/attachments/{tableName}/*`)
 * — the same endpoint family OcrSidePanel (via `fetchMainAttachment` /
 * `useMainAttachment`), AttachmentsTab (useAttachments.js), and now the
 * list-view preview (via `useMainAttachment` too, see GenericPreviewModal's
 * `ManagedLeftPanel`) all consume:
 *
 *   - GET .../attachments/{tableName}/{recordId}/main → the single attachment
 *     object marked as the record's "main" document (what `fetchMainAttachment`
 *     expects). For these fixtures, each scenario only ever seeds one real
 *     attachment, so that one is treated as the marked "main" document.
 *   - GET .../attachments/{tableName}/{recordId} (no `/main` suffix) → the
 *     plain list shape `{ items }`, unchanged — still used by the "Adjuntos"
 *     tab, which intentionally excludes the main-marked attachment by design.
 *
 * PDF bytes are returned for any single-file download GET (`/file/{id}`).
 */
async function installAttachmentsMock(page, tableName, items) {
  await page.route('**/sws/neo/attachments/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (!url.includes(`/attachments/${tableName}/`) && !url.includes('/attachments/file/')) {
      route.fallback();
      return;
    }
    if (url.includes('/zip')) {
      await route.fulfill({ status: 200, contentType: 'application/zip', body: Buffer.from('PK') });
    } else if (url.includes('/file/')) {
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: Buffer.from('%PDF-1.4 real supplier document bytes'),
        });
      } else {
        route.fallback();
      }
    } else if (method === 'GET' && /\/main(?:[/?]|$)/.test(url)) {
      // GET .../attachments/{tableName}/{recordId}/main — single "main"
      // attachment object (fetchMainAttachment expects `.id` on the payload).
      const main = items[0] ?? {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(main),
      });
    } else if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items }),
      });
    } else {
      route.fallback();
    }
  });
}

// Returns the modal's file-view download anchor for a given rendered file
// (ManagedLeftPanel in GenericPreviewModal.jsx renders `title="{label} — {fileName}"`
// on this anchor once a cached file — right or wrong — is resolved).
function previewDownloadAnchor(modal, fileName) {
  return modal.locator(`a[title*="${fileName}"]`);
}

// Scopes to OcrSidePanel's rendered file-name row via the `FileText__c851a1`
// testid — a codemod-generated id whose hash suffix is unique to
// OcrSidePanel.jsx (verified: no other file in the app renders it). OcrSidePanel
// no longer has a tablist (ETP-4855) to anchor on, and neither `DocumentView`'s
// file-name `<span>` nor its container forward a testid to the DOM, so the
// icon — which lucide-react does forward onto its `<svg>` — is the only stable
// anchor. The icon and the file-name span are siblings in the same row `<div>`.
function sidebarFileRow(page) {
  return page.locator('[data-testid="FileText__c851a1"]').locator('xpath=..');
}

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE INVOICE — sidebar (OcrSidePanel) vs. list-view preview modal
// ═══════════════════════════════════════════════════════════════════════════

const PI_ID = 'pi-sync-001';
const PI_REAL_ATTACHMENT = { id: 'att-real-1', name: 'supplier-invoice-real.pdf', size: 51200, uploadedAt: '2026-08-01T10:00:00Z' };
const PI_WRONG_CACHE = fakePreviewFilePayload('wrong-cached-invoice.pdf');

const PI_ROW = {
  id: PI_ID,
  documentNo: 'PI-SYNC-001',
  orderReference: 'SUPPLIER-REF-SYNC',
  invoiceDate: '2026-05-01',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  businessPartner: 'bp-001',
  'businessPartner$_identifier': 'Test Supplier S.A.',
  grandTotalAmount: 1500.0,
  outstandingAmount: 0,
  paymentComplete: true,
  transactionDocument: 'td-001',
  'transactionDocument$_identifier': 'AP Invoice',
};

/** Mocks list GET, detail GET, lines GET, and evaluate-display for purchase-invoice. */
async function installPurchaseInvoiceHeaderMocks(page, records) {
  const byId = (id) => records.find((r) => r.id === id) ?? records[0];

  const handler = async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [] } }) });
      return;
    }
    const m = url.match(/\/header\/([^/?]+)/);
    if (m) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [byId(m[1])] } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
    });
  };
  await page.route('**/sws/neo/purchase-invoice/header/**', handler);
  await page.route('**/sws/neo/purchase-invoice/header**', handler);

  await page.route('**/sws/neo/purchase-invoice/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  await page.route('**/sws/neo/purchase-invoice/evaluate-display{/**,}**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.describe('Purchase Invoice — attachment/preview sync (ETP-4315, mocked)', () => {
  test('sidebar (OcrSidePanel) resolves the real attachment for the record', async ({ page }) => {
    await login(page);
    await installAttachmentsMock(page, 'C_Invoice', [PI_REAL_ATTACHMENT]);
    await installPurchaseInvoiceHeaderMocks(page, [PI_ROW]);

    await page.goto(`/purchase-invoice/${PI_ID}`);
    await page.waitForLoadState('domcontentloaded');
    // The sidebar only renders the "has file" branch (the one with the
    // FileText testid sidebarFileRow scopes to) once useMainAttachment's two
    // SEQUENTIAL fetches (fetchMainAttachment, then fetchAttachmentBlobUrl)
    // both resolve — on top of purchase-invoice's own heavier HeaderPage load
    // (combos, lines, evaluate-display). Wait for the network to settle
    // before polling the DOM, so a slow/cold run doesn't race the 15s budget.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // See sidebarFileRow() above for why this is the correct scope now that
    // OcrSidePanel no longer renders a tablist (ETP-4855).
    const fileRow = sidebarFileRow(page);
    await expect(fileRow).toBeVisible({ timeout: 15_000 });
    await expect(fileRow.getByText(PI_REAL_ATTACHMENT.name)).toBeVisible({ timeout: 15_000 });
  });

  test('list-view preview modal must show the SAME file as the sidebar for the same record', async ({ page }) => {
    await login(page);
    await installAttachmentsMock(page, 'C_Invoice', [PI_REAL_ATTACHMENT]);
    await installPreviewFileMock(page, PI_WRONG_CACHE);
    await installPurchaseInvoiceHeaderMocks(page, [PI_ROW]);

    // First confirm the sidebar's ground truth for this exact record, same
    // as the test above — this is the file the preview is expected to match.
    await page.goto(`/purchase-invoice/${PI_ID}`);
    await page.waitForLoadState('domcontentloaded');
    // See the sibling test above for why this wait matters here too.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const fileRow = sidebarFileRow(page);
    await expect(fileRow).toBeVisible({ timeout: 15_000 });
    await expect(fileRow.getByText(PI_REAL_ATTACHMENT.name)).toBeVisible({ timeout: 15_000 });

    // Now open the list-view preview (GenericPreviewModal) for the SAME
    // record and compare. It resolves via useMainAttachment — the same
    // /main endpoint the sidebar uses — so it must show the same file. The
    // mocked /preview-file cache (PI_WRONG_CACHE) is provably unused: this
    // is what would fail if that retired endpoint were ever read again.
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.getByTestId(`row-${PI_ID}`);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.click();

    const modal = page.getByTestId('generic-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Regression check: purchase-invoice's preview now resolves via
    // `useMainAttachment` (the same /main endpoint as the sidebar), so it
    // shows PI_REAL_ATTACHMENT.name here — never PI_WRONG_CACHE's
    // "wrong-cached-invoice.pdf" (the mocked /preview-file cache is now
    // unused for this window, confirming the rewiring took effect).
    await expect(previewDownloadAnchor(modal, PI_REAL_ATTACHMENT.name)).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GOODS RECEIPT — "Adjuntos" tab vs. list-view preview modal
// (no sidebar for this window — the tab is the ground truth)
// ═══════════════════════════════════════════════════════════════════════════

const GR_ID = 'gr-sync-001';
const GR_REAL_ATTACHMENT = { id: 'att-real-2', name: 'delivery-note-real.pdf', size: 40960, uploadedAt: '2026-08-01T10:00:00Z' };
const GR_WRONG_CACHE = fakePreviewFilePayload('wrong-cached-receipt.pdf');

const GR_ROW = {
  id: GR_ID,
  documentNo: 'GR-SYNC-001',
  movementDate: '2026-08-01',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  posted: 'N',
  businessPartner: 'bp-002',
  'businessPartner$_identifier': 'Test Supplier S.A.',
  warehouse: 'wh-001',
  'warehouse$_identifier': 'Almacén Principal',
  invoiceStatus: 0,
};

/**
 * Mocks list GET, detail GET, evaluate-display for goods-receipt's header
 * (`goodsReceipt`) and lines (`goodsReceiptLine`) entities.
 *
 * Uses URL predicate functions (not glob patterns) because "goodsReceipt" is
 * a literal prefix of "goodsReceiptLine" — mirrors the proven pattern in
 * goods-shipment-billing-badge.mocked.spec.js.
 */
async function installGoodsReceiptHeaderMocks(page, records) {
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-receipt/goodsReceiptLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      route.fallback();
    },
  );

  await page.route(
    (url) => url.href.includes('/sws/neo/goods-receipt/goodsReceipt') && !url.href.includes('/goodsReceiptLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() !== 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [] } }) });
        return;
      }
      const detailMatch = url.match(/\/goodsReceipt\/([^/?]+)(\?.*)?$/);
      if (detailMatch && !['evaluate-display', 'defaults', 'selectors'].includes(detailMatch[1])) {
        const found = records.find((r) => r.id === detailMatch[1]) ?? records[0];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [found] } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
      });
    },
  );
}

test.describe('Goods Receipt — attachment/preview sync (ETP-4315, mocked)', () => {
  test('"Adjuntos" tab resolves the real attachment for the record', async ({ page }) => {
    await login(page);
    await installAttachmentsMock(page, 'M_InOut', [GR_REAL_ATTACHMENT]);
    await installGoodsReceiptHeaderMocks(page, [GR_ROW]);

    await page.goto(`/goods-receipt/${GR_ID}`);

    const tabBtn = page.getByTestId('tab-custom:attachments');
    await tabBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await tabBtn.click();

    await expect(page.getByTestId(`attachment-name-${GR_REAL_ATTACHMENT.id}`)).toHaveText(
      GR_REAL_ATTACHMENT.name,
      { timeout: 8_000 },
    );
  });

  test('list-view preview modal must show the SAME file as the "Adjuntos" tab for the same record', async ({ page }) => {
    await login(page);
    await installAttachmentsMock(page, 'M_InOut', [GR_REAL_ATTACHMENT]);
    await installPreviewFileMock(page, GR_WRONG_CACHE);
    await installGoodsReceiptHeaderMocks(page, [GR_ROW]);

    // Ground truth: the "Adjuntos" tab for this exact record.
    await page.goto(`/goods-receipt/${GR_ID}`);
    const tabBtn = page.getByTestId('tab-custom:attachments');
    await tabBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await tabBtn.click();
    await expect(page.getByTestId(`attachment-name-${GR_REAL_ATTACHMENT.id}`)).toHaveText(
      GR_REAL_ATTACHMENT.name,
      { timeout: 8_000 },
    );

    // Now open the list-view preview for the SAME record. Today it reads
    // /sws/neo/preview-file, a completely separate cache, and shows a
    // different file entirely — the exact bug reported in ETP-4315.
    await page.goto('/goods-receipt');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.getByTestId(`row-${GR_ID}`);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.click();

    const modal = page.getByTestId('generic-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Regression check: goods-receipt's preview now resolves via
    // `useMainAttachment` (the same /main endpoint as the "Adjuntos" tab), so
    // it shows GR_REAL_ATTACHMENT.name here — never GR_WRONG_CACHE's
    // "wrong-cached-receipt.pdf" (see the ETP-4315 unification plan).
    await expect(previewDownloadAnchor(modal, GR_REAL_ATTACHMENT.name)).toBeVisible({ timeout: 5_000 });
  });
});
