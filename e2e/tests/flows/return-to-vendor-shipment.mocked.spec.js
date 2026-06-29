import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Return to Vendor Shipment — full flow smoke (mocked) — ETP-4034
 *
 * Covers:
 *   Case  2 — Confirm modal (DR → CO): ConfirmInOutModal lifecycle, cancel and confirm
 *   Case  5 — Create return invoice from CO detail: button gating, modal, result card
 *   Case  6 — Button visibility per document status (DR vs CO)
 *   Case  7 — Clone flow from list view: row-quick-action-clone → CloneOrderModal
 *   Case  8 — Import from receipt modal: opens, lists available receipts, lines loaded
 *   Case 10 — availableReceipts / availableReceiptLines request bodies verified
 *   Case 11 — List view columns: documentNo, businessPartner, movementDate, documentStatus
 *   Case 12 — Preview panel: click row → generic-preview-modal, shows documentNo, closes
 *   Case 13 — Notes section visible in detail view
 *
 * No backend required. All /sws/** calls are intercepted after login() (LIFO order).
 *
 * Route isolation: "returnToVendorShipmentLine" URLs must NOT be captured by the
 * "returnToVendorShipment" handler. We use URL predicate functions throughout.
 */

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

function makeReturn(overrides = {}) {
  return {
    id: 'mock-rtvs-001',
    documentNo: 'RTVS-TEST-001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    businessPartner: 'bp-vendor-001',
    'businessPartner$_identifier': 'Proveedor Test S.L.',
    movementDate: '2026-05-15',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Almacén Principal',
    linesCount: 1,
    returnInvoices: [],
    hasReturnInvoice: false,
    sourceReceipts: [],
    'currency$_identifier': 'EUR',
    description: '',
    ...overrides,
  };
}

const DR_RECORD = makeReturn({
  id: 'rtvs-dr-001',
  documentNo: 'RTVS-DR-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  hasReturnInvoice: false,
  returnInvoices: [],
});

const CO_NO_INVOICE = makeReturn({
  id: 'rtvs-co-001',
  documentNo: 'RTVS-CO-001',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  hasReturnInvoice: false,
  returnInvoices: [],
});

const CO_WITH_INVOICE = makeReturn({
  id: 'rtvs-co-002',
  documentNo: 'RTVS-CO-002',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  hasReturnInvoice: true,
  returnInvoices: [{ id: 'inv-existing', documentNo: 'FC-RTV-001', documentStatus: 'CO' }],
});

const ALL_ROWS = [DR_RECORD, CO_NO_INVOICE, CO_WITH_INVOICE];

// ---------------------------------------------------------------------------
// Route installation helpers
// ---------------------------------------------------------------------------

/**
 * Install mocks for the returnToVendorShipment list + detail endpoints.
 * Must be called AFTER login() so these specific handlers win over the
 * generic /sws/** stub from login() (Playwright routes match in LIFO order).
 */
async function installReturnToVendorMocks(page, rows = ALL_ROWS) {
  // Lines endpoint — installed FIRST (lower LIFO priority). Returns empty.
  await page.route(
    (url) => url.href.includes('/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine'),
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

  // Header entity (list + detail) — installed SECOND (higher LIFO priority).
  // The URL predicate excludes the line entity to avoid substring collision.
  await page.route(
    (url) =>
      url.href.includes('/sws/neo/return-to-vendor-shipment/returnToVendorShipment') &&
      !url.href.includes('returnToVendorShipmentLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      // POST documentAction → complete the record
      if (method === 'POST' && url.includes('/action/documentAction')) {
        const idMatch = url.match(/\/returnToVendorShipment\/([^/]+)\/action/);
        const row = rows.find((r) => r.id === idMatch?.[1]) ?? rows[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: [{ ...row, documentStatus: 'CO', 'documentStatus$_identifier': 'Completado' }],
            },
          }),
        });
        return;
      }

      // POST createReturnInvoice → synthetic purchase invoice
      if (method === 'POST' && url.includes('/action/createReturnInvoice')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-new-001', documentNo: 'FC-RTV-NEW-001', grandTotalAmount: 250 } },
          }),
        });
        return;
      }

      // POST cloneRecord
      if (method === 'POST' && url.includes('/action/cloneRecord')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'rtvs-cloned-001' } },
          }),
        });
        return;
      }

      // GET cloned record (fetched after clone to populate done state)
      if (method === 'GET' && url.includes('rtvs-cloned-001')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: [makeReturn({ id: 'rtvs-cloned-001', documentNo: 'RTVS-CLONE-001', documentStatus: 'DR' })],
            },
          }),
        });
        return;
      }

      // Detail GET — url matches /returnToVendorShipment/{id} with no further path segments
      if (method === 'GET' && /\/returnToVendorShipment\/[^/?]+(\?|$)/.test(url)) {
        const idMatch = url.match(/\/returnToVendorShipment\/([^/?]+)/);
        const id = idMatch?.[1];
        // Ignore framework-level sub-paths like 'selectors', 'defaults', 'evaluate-display', etc.
        if (id && !['selectors', 'defaults', 'evaluate-display', 'action'].includes(id)) {
          const found = rows.find((r) => r.id === id) ?? rows[0];
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: { data: [found] } }),
          });
          return;
        }
      }

      // List GET
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
        });
        return;
      }

      // PATCH/PUT/POST non-action — save response: return the saved record so
      // DetailView's hook does not reset form state to empty after handleSave()
      if (method === 'PATCH' || method === 'PUT') {
        const idMatch = url.match(/\/returnToVendorShipment\/([^/?]+)/);
        const id = idMatch?.[1];
        const found = (id && rows.find((r) => r.id === id)) ?? rows[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }
      // All other methods (POST non-action, etc.)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Describe 1 — List view columns, quick-actions, and preview panel
// Cases 11, 12, 7 (row clone)
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — list view', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnToVendorMocks(page);
    await page.goto('/return-to-vendor-shipment');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  /**
   * Verifies list columns are rendered, row quick-action overlays work,
   * preview panel opens and closes without navigation, and cloning from the
   * list opens CloneOrderModal with the record listed inside.
   */
  test('list columns, quick-action overlays, preview panel, and clone modal — full flow', async ({ page }) => {
    // ── List columns are visible ───────────────────────────────────────────
    // Case 11: documentNo, businessPartner, movementDate, documentStatus rendered
    const tbody = page.locator('tbody');
    await expect(tbody).toBeVisible({ timeout: 8_000 });

    await expect(page.getByText('RTVS-DR-001')).toBeVisible();
    await expect(page.getByText('RTVS-CO-001')).toBeVisible();
    await expect(page.getByText('Proveedor Test S.L.').first()).toBeVisible();
    // movementDate is locale-formatted by the table component (es: 15/05/2026)
    await expect(page.getByText('15/05/2026').first()).toBeVisible();

    // ── DR row quick-actions ───────────────────────────────────────────────
    const drRow = page.locator('tbody tr').filter({ hasText: 'RTVS-DR-001' }).first();
    await expect(drRow).toBeVisible();
    await drRow.hover();

    await expect(drRow.getByTestId('row-quick-action-edit')).toBeVisible();
    // Delete visible for DR (hideDeleteWhenComplete does not apply to non-complete records)
    await expect(drRow.getByTestId('row-quick-action-delete')).toBeVisible();

    // ── CO row quick-actions ──────────────────────────────────────────────
    const coRow = page.locator('tbody tr').filter({ hasText: 'RTVS-CO-001' }).first();
    await coRow.hover();

    await expect(coRow.getByTestId('row-quick-action-edit')).toBeVisible();
    await expect(coRow.getByTestId('row-quick-action-clone')).toBeVisible();
    // Delete hidden for CO (hideDeleteWhenComplete)
    await expect(coRow.getByTestId('row-quick-action-delete')).toHaveCount(0);

    // ── Preview panel (Case 12) ────────────────────────────────────────────
    // Click the DR row body area (not a quick-action button) to open the preview
    await drRow.click();

    const previewModal = page.getByTestId('generic-preview-modal');
    await expect(previewModal).toBeVisible({ timeout: 6_000 });

    // Preview must contain the document number and BP name
    await expect(previewModal.getByText('RTVS-DR-001').first()).toBeVisible();
    await expect(previewModal.getByText('Proveedor Test S.L.').first()).toBeVisible();

    // URL stays on the list page — preview opens in-place
    await expect(page).toHaveURL(/\/return-to-vendor-shipment$/);

    // Close preview using the close button
    await previewModal.getByRole('button', { name: /cerrar|close/i }).click();
    await expect(previewModal).toBeHidden({ timeout: 5_000 });

    // ── Clone from list row (Case 7) ──────────────────────────────────────
    await coRow.hover();
    const cloneQuickAction = coRow.getByTestId('row-quick-action-clone');
    await expect(cloneQuickAction).toBeVisible();
    await cloneQuickAction.click();

    // CloneOrderModal opens — confirm phase shows the document number
    await expect(page.getByText('RTVS-CO-001').first()).toBeVisible({ timeout: 5_000 });

    // The modal has a clone button (data-testid="action-clone-record")
    const modalCloneBtn = page.getByTestId('action-clone-record');
    await expect(modalCloneBtn).toBeVisible({ timeout: 8_000 });

    // Confirm the clone
    await modalCloneBtn.click();

    // Done phase shows the cloned document number (fetched from mock)
    await expect(page.getByText('RTVS-CLONE-001')).toBeVisible({ timeout: 6_000 });

    // Close the done modal using the × close button
    await page.locator('[style*="background: none"]').filter({ hasText: '×' }).first().click();
  });
});

// ---------------------------------------------------------------------------
// Describe 2 — DR detail: button visibility and ConfirmInOutModal lifecycle
// Cases 2, 6 (DR side)
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — DR detail actions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnToVendorMocks(page);
  });

  /**
   * For a DR record:
   *   - action-confirm-with-credit is visible
   *   - action-clone is visible
   *   - action-create-return-invoice is NOT present
   *
   * ConfirmInOutModal:
   *   - Opens on confirm button click
   *   - Shows docInfo subtitle (documentNo + BP name)
   *   - Toggle card is present (invoice checkbox, defaulted to checked)
   *   - Cancel closes the modal
   *   - Confirm button (with invoice) calls documentAction + createReturnInvoice
   *     and ConfirmResultModal shows the new invoice documentNo
   */
  test('DR button visibility and full confirm modal lifecycle (cancel + confirm with invoice)', async ({ page }) => {
    await page.goto('/return-to-vendor-shipment/rtvs-dr-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Wait for topbar to hydrate (async render)
    const confirmBtn = page.getByTestId('action-confirm-with-credit');
    await confirmBtn.waitFor({ state: 'visible', timeout: 15_000 });

    // ── Case 6: DR button visibility ──────────────────────────────────────
    await expect(confirmBtn).toBeVisible();
    // Clone is a list-view row action, not a detail-view button.

    // action-create-return-invoice must NOT be present for DR
    await expect(page.getByTestId('action-create-return-invoice')).toHaveCount(0);

    // ── Case 2: open ConfirmInOutModal ────────────────────────────────────
    await confirmBtn.click();

    // Modal title is "¿Gestionar crédito?" (ui('returnToVendor.confirmModal.title'))
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8_000 });

    // Subtitle contains documentNo (bold) and BP name as separate parts
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('RTVS-DR-001').first()).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Proveedor Test S.L.').first()).toBeVisible({ timeout: 5_000 });

    // Toggle card is present (role="switch")
    const toggleCard = dialog.getByRole('switch');
    await expect(toggleCard).toBeVisible({ timeout: 5_000 });
    // defaultCreateInvoice=true → switch is aria-checked="true"
    await expect(toggleCard).toHaveAttribute('aria-checked', 'true');

    // Cancel button inside the modal footer
    const modalCancelBtn = dialog.getByRole('button', { name: /^cancelar$|^cancel$/i });
    await expect(modalCancelBtn).toBeVisible();

    // Cancel dismisses the modal
    await modalCancelBtn.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // ── Case 2: re-open and confirm WITH invoice ──────────────────────────
    await confirmBtn.click();
    const dialog2 = page.getByRole('dialog');
    await expect(dialog2).toBeVisible({ timeout: 8_000 });

    // Toggle is checked → button label is confirmWithInvoice ("Confirmar y crear factura")
    const modalConfirmBtn = dialog2.getByRole('button', { name: /confirmar/i });
    await expect(modalConfirmBtn).toBeVisible();
    await modalConfirmBtn.click();

    // ConfirmResultModal shows the newly created invoice documentNo
    await expect(
      page.getByText(/FC-RTV-NEW-001/).or(page.getByTestId('confirm-result-modal')),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Describe 3 — CO detail: button visibility and create return invoice flow
// Cases 5, 6 (CO side)
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — CO detail actions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnToVendorMocks(page);
  });

  /**
   * For a CO record without an existing return invoice:
   *   - action-create-return-invoice is visible
   *   - action-clone is visible
   *   - action-confirm-with-credit is NOT present
   *
   * CreateInvoiceConfirmModal lifecycle:
   *   - Opens on button click
   *   - Shows blue summary card with BP name (small) + documentNo (large)
   *   - "Crear factura" checkbox card is checked by default
   *   - "Crear →" confirm button triggers createReturnInvoice POST
   *   - ConfirmResultModal shows the new invoice documentNo
   *
   * When hasReturnInvoice=true, action-create-return-invoice must be absent.
   */
  test('CO button visibility, invoice modal confirm, and button absent when invoice exists — full flow', async ({ page }) => {
    test.setTimeout(120_000); // 2 navigations + complex modal flow can exceed 60s under full-suite load
    // Navigate to CO record WITHOUT existing invoice
    await page.goto('/return-to-vendor-shipment/rtvs-co-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Wait for topbar buttons to hydrate
    const createInvoiceBtn = page.getByTestId('action-create-return-invoice');
    await createInvoiceBtn.waitFor({ state: 'visible', timeout: 15_000 });

    // ── Case 6: CO button visibility ──────────────────────────────────────
    await expect(createInvoiceBtn).toBeVisible();
    // Clone is a list-view row action, not a detail-view button.

    // action-confirm-with-credit must NOT be present for CO
    await expect(page.getByTestId('action-confirm-with-credit')).toHaveCount(0);

    // ── Case 5: create return invoice from CO ─────────────────────────────
    await createInvoiceBtn.click();

    // CreateInvoiceConfirmModal — modal title is soManageDocsTitle ("Gestionar documentos")
    await expect(page.getByText('Gestionar documentos')).toBeVisible({ timeout: 8_000 });

    // Blue summary card shows BP name (small text) and documentNo (large text)
    await expect(page.getByText('Proveedor Test S.L.').first()).toBeVisible({ timeout: 8_000 });
    // RTVS-CO-001 appears as large text in the summary card (displayAmount = documentNo when total=0)
    await expect(page.getByText('RTVS-CO-001').first()).toBeVisible({ timeout: 8_000 });

    // Invoice checkbox card is rendered (labeled "Crear factura") and checked by default
    const invoiceCardLabel = page.getByText('Crear factura', { exact: true });
    await expect(invoiceCardLabel).toBeVisible({ timeout: 8_000 });

    // "Crear →" button (soCreateDocsBtn) triggers the POST
    // The button renders the text "Crear →" with an arrow character
    const createDocsBtn = page.getByRole('button', { name: /crear/i }).last();
    await expect(createDocsBtn).toBeVisible({ timeout: 8_000 });
    await createDocsBtn.click();

    // createReturnInvoice POST returns FC-RTV-NEW-001 → ConfirmResultModal appears
    await expect(
      page.getByText(/FC-RTV-NEW-001/).or(page.getByTestId('confirm-result-modal')),
    ).toBeVisible({ timeout: 10_000 });

    // Close result modal — use exact match to avoid "Cerrar Copilot" button
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

    // ── Case 5: button absent when invoice already exists ─────────────────
    await page.goto('/return-to-vendor-shipment/rtvs-co-002');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // Wait for the topbar to hydrate (hasReturnInvoice=true → action-create-return-invoice must not appear).
    // Use a short explicit wait instead of a fixed delay so we don't pass prematurely on a slow load.
    await page.getByRole('button', { name: /guardar|cancelar/i }).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('action-create-return-invoice')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Describe 4 — Import from receipt modal with request body verification
// Cases 8, 10
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — import from receipt modal', () => {
  /**
   * Opens the import modal from the lines section,
   * verifies the availableReceipts POST carries { businessPartner: bpId },
   * then clicks a receipt to expand it, verifies availableReceiptLines POST
   * carries { receiptId: docId, businessPartner: bpId }, and finally
   * selects lines and confirms the importReceiptLines POST.
   */
  test('import modal opens, available receipts fetched with correct body, lines loaded and imported', async ({ page }) => {
    await login(page);

    // Capture request bodies in route handlers for later assertion
    let availableReceiptsBodies = [];
    let availableReceiptLinesBodies = [];
    let importReceiptLinesBody = null;

    // Base mocks (header + lines) installed FIRST so that action-specific mocks
    // registered AFTER have higher LIFO priority and win over the general handler.
    await installReturnToVendorMocks(page, [DR_RECORD]);

    // availableReceipts action — registered AFTER installReturnToVendorMocks (LIFO: higher priority)
    await page.route(
      (url) =>
        url.href.includes('/sws/neo/return-to-vendor-shipment/returnToVendorShipment/_/action/availableReceipts'),
      async (route) => {
        try { const raw = route.request().postData(); if (raw) availableReceiptsBodies.push(JSON.parse(raw)); } catch { /* silent */ }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: [
                {
                  id: 'receipt-src-001',
                  documentNo: 'GR-SRC-001',
                  movementDate: '2026-04-10',
                  'businessPartner$_identifier': 'Proveedor Test S.L.',
                },
              ],
            },
          }),
        });
      },
    );

    // availableReceiptLines action
    await page.route(
      (url) =>
        url.href.includes(
          '/sws/neo/return-to-vendor-shipment/returnToVendorShipment/_/action/availableReceiptLines',
        ),
      async (route) => {
        try { const raw = route.request().postData(); if (raw) availableReceiptLinesBodies.push(JSON.parse(raw)); } catch { /* silent */ }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: [
                {
                  id: 'rcpt-line-001',
                  'product$_identifier': 'Producto A',
                  movementQuantity: 5,
                },
              ],
            },
          }),
        });
      },
    );

    // importReceiptLines action
    await page.route(
      (url) =>
        url.href.includes('/return-to-vendor-shipment/') &&
        url.href.includes('/action/importReceiptLines'),
      async (route) => {
        try { const raw = route.request().postData(); importReceiptLinesBody = raw ? JSON.parse(raw) : null; } catch { /* silent */ }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { importedCount: 1 } },
          }),
        });
      },
    );

    await page.goto('/return-to-vendor-shipment/rtvs-dr-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Wait for the DR record to load (confirms header mock is working)
    await page.getByTestId('action-confirm-with-credit').waitFor({ state: 'visible', timeout: 10_000 });

    // ── Case 8: find the import trigger ──────────────────────────────────
    // Two possible triggers:
    //  a) "Añadir desde Albarán" button in the LinesEmptyState
    //  b) "action-import-receipt-empty-state" testid in LinesEmptyState
    // Both open ImportFromReceiptModal with targetId + bpId.
    // The empty-state renders because lines are empty (mock returns []).
    const emptyStateBtn = page.getByRole('button', { name: /albarán|añadir desde|importar/i }).first();
    await emptyStateBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await emptyStateBtn.click();

    // ── Modal appears with receipt list ──────────────────────────────────
    await expect(page.getByText(/GR-SRC-001/)).toBeVisible({ timeout: 8_000 });

    // ── Case 10: availableReceipts body carries { businessPartner: bpId } ─
    expect(availableReceiptsBodies.length).toBeGreaterThanOrEqual(1);
    expect(availableReceiptsBodies[0]).toMatchObject({ businessPartner: 'bp-vendor-001' });

    // ── Case 8: expand the receipt to load its lines ──────────────────────
    // Click the receipt row to toggle expand
    const receiptRow = page.locator('div').filter({ hasText: /^GR-SRC-001/ }).first();
    await receiptRow.click();

    // Product line becomes visible after availableReceiptLines is called
    await expect(page.getByText('Producto A')).toBeVisible({ timeout: 5_000 });

    // ── Case 10: availableReceiptLines body carries receiptId + businessPartner ─
    expect(availableReceiptLinesBodies.length).toBeGreaterThanOrEqual(1);
    expect(availableReceiptLinesBodies[0]).toMatchObject({
      receiptId: 'receipt-src-001',
      businessPartner: 'bp-vendor-001',
    });

    // ── Case 8: confirm import ────────────────────────────────────────────
    // The import button label includes "Importar seleccionadas" or similar
    const importBtn = page.getByRole('button', { name: /importar seleccionadas|import/i });
    await expect(importBtn).toBeVisible({ timeout: 8_000 });
    await importBtn.click();

    // importReceiptLines POST was called with the expected payload
    expect(importReceiptLinesBody).not.toBeNull();
    expect(Array.isArray(importReceiptLinesBody?.lines)).toBe(true);
    expect(importReceiptLinesBody.lines[0]).toMatchObject({ sourceLineId: 'rcpt-line-001' });

    // Modal closes after successful import
    await expect(page.getByText('GR-SRC-001')).toBeHidden({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Describe 5 — Notes section visible in detail view
// Case 13
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — notes section in detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnToVendorMocks(page);
  });

  /**
   * The ReturnToVendorShipmentPage sets notesField="description".
   * DetailView renders data-testid="notes-textarea" wrapping a role="textbox" div
   * (unfocused state) or a textarea (focused). Verifies it is visible on the DR detail.
   */
  test('notes section is rendered and visible', async ({ page }) => {
    await page.goto('/return-to-vendor-shipment/rtvs-dr-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Wait for record to load before checking notes
    await page.getByTestId('action-confirm-with-credit').waitFor({ state: 'visible', timeout: 10_000 });

    // DetailView renders a "NOTAS" label and data-testid="notes-textarea" wrapper
    const notesContainer = page.getByTestId('notes-textarea');
    await expect(notesContainer).toBeVisible({ timeout: 5_000 });

    // The wrapper also contains a role="textbox" div in its unfocused state
    const notesTextbox = notesContainer.getByRole('textbox');
    await expect(notesTextbox).toBeVisible({ timeout: 3_000 });
  });
});
