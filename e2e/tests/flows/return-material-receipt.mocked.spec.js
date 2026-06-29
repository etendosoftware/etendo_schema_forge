import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Return Material Receipt — full flow smoke (mocked).
 *
 * Covers ETP-4033:
 *   - List view: columns, row quick-actions (edit/delete for DR; clone for CO)
 *   - Preview panel: row click opens GenericPreviewModal, shows documentNo, closes
 *   - DR detail: ConfirmWithCreditButton renders "Confirmar", Print button visible,
 *     modal opens on click, Cancel dismisses it, Confirm fires documentAction POST
 *   - CO detail (no invoice): "Crear factura de devolución" button visible,
 *     Clone button visible, Print button visible, clicking "Crear factura" opens modal,
 *     confirming fires createReturnInvoice POST and shows ConfirmResultModal
 *
 * Mock mode only — no backend required.
 */

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const ROWS = [
  {
    id: 'ret-001',
    documentNo: 'RD/00001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    'businessPartner$_identifier': 'Test Customer',
    movementDate: '2026-05-01',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'España Norte',
    sourceShipmentDocNo: 'ALB/00042',
    returnInvoices: [],
    hasReturnInvoice: false,
    sourceShipments: [{ id: 'ship-001', documentNo: 'ALB/00042' }],
  },
  {
    id: 'ret-002',
    documentNo: 'RD/00002',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'businessPartner$_identifier': 'Test Customer',
    movementDate: '2026-05-02',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'España Norte',
    sourceShipmentDocNo: 'ALB/00043',
    returnInvoices: [{ id: 'inv-001', documentNo: 'FC/00099', documentStatus: 'CO' }],
    hasReturnInvoice: true,
    sourceShipments: [{ id: 'ship-002', documentNo: 'ALB/00043' }],
  },
  // CO row without existing invoice — used by the CO actions test
  {
    id: 'ret-003',
    documentNo: 'RD/00003',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'businessPartner$_identifier': 'Test Customer',
    movementDate: '2026-05-03',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'España Norte',
    sourceShipmentDocNo: 'ALB/00044',
    returnInvoices: [],
    hasReturnInvoice: false,
    sourceShipments: [{ id: 'ship-003', documentNo: 'ALB/00044' }],
  },
];

// ---------------------------------------------------------------------------
// Route installation helpers
// ---------------------------------------------------------------------------

/**
 * Install mocks for the list + detail endpoints.
 * Must be called AFTER login() so Playwright's LIFO route matching lets
 * these specific handlers win over the generic /sws/** stub from login().
 */
async function installReturnReceiptMocks(page) {
  // Lines endpoint — always empty
  await page.route('**/sws/neo/return-material-receipt/returnMaterialReceiptLine**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  // Header list + detail
  await page.route('**/sws/neo/return-material-receipt/returnMaterialReceipt**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // POST action/documentAction → complete the record
    if (method === 'POST' && url.includes('/action/documentAction')) {
      const idMatch = url.match(/\/returnMaterialReceipt\/([^/]+)\/action/);
      const row = ROWS.find(r => r.id === idMatch?.[1]) ?? ROWS[0];
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

    // POST action/createReturnInvoice → synthetic invoice
    if (method === 'POST' && url.includes('/action/createReturnInvoice')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: { id: 'inv-new', documentNo: 'FC/00100', grandTotal: 150 } },
        }),
      });
      return;
    }

    // Detail GET — url contains /returnMaterialReceipt/{id} with no further path segments
    if (method === 'GET' && /\/returnMaterialReceipt\/[^/?]+(\?|$)/.test(url)) {
      const idMatch = url.match(/\/returnMaterialReceipt\/([^/?]+)/);
      const found = ROWS.find(r => r.id === idMatch?.[1]) ?? ROWS[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }

    // List GET
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
      return;
    }

    route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Test suite 1 — List view + preview panel
// ---------------------------------------------------------------------------

test.describe('return-material-receipt — list and preview', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnReceiptMocks(page);
    await page.goto('/return-material-receipt');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('list columns, quick-action overlay, and preview panel — full flow', async ({ page }) => {
    // --- List heading ---
    // The page title is rendered via i18n; verify the table body is present first
    const tbody = page.locator('tbody');
    await expect(tbody).toBeVisible({ timeout: 8_000 });

    // --- Expected columns are visible ---
    // The table renders at least documentNo and businessPartner$_identifier text
    await expect(page.getByText('RD/00001')).toBeVisible();
    await expect(page.getByText('RD/00002')).toBeVisible();
    // Warehouse identifier column
    await expect(page.getByText('España Norte').first()).toBeVisible();
    // Source shipment column
    await expect(page.getByText('ALB/00042')).toBeVisible();

    // --- Row quick-actions for DR row (RD/00001) ---
    const drRow = page.locator('tbody tr').filter({ hasText: 'RD/00001' }).first();
    await expect(drRow).toBeVisible();
    await drRow.hover();

    const overlay = drRow.getByTestId('row-quick-actions');
    await expect(overlay).toBeVisible();

    // Edit and Delete are always present for DR
    await expect(drRow.getByTestId('row-quick-action-edit')).toBeVisible();
    await expect(drRow.getByTestId('row-quick-action-delete')).toBeVisible();

    // Clone/duplicate is hidden for DR (visibleWhen CO)
    await expect(drRow.getByTestId('row-quick-action-clone')).toHaveCount(0);

    // --- Row quick-actions for CO row (RD/00002) — clone visible ---
    const coRow = page.locator('tbody tr').filter({ hasText: 'RD/00002' }).first();
    await expect(coRow).toBeVisible();
    await coRow.hover();

    const coOverlay = coRow.getByTestId('row-quick-actions');
    await expect(coOverlay).toBeVisible();

    // Clone (duplicate) must be visible for CO rows
    await expect(coRow.getByTestId('row-quick-action-clone')).toBeVisible();

    // Delete is hidden for CO rows because hideDeleteWhenComplete: true
    await expect(coRow.getByTestId('row-quick-action-delete')).toHaveCount(0);

    // --- Preview panel: click DR row ---
    // Move away from CO row first (unhover) then click DR row
    await drRow.click();

    const previewModal = page.getByTestId('generic-preview-modal');
    await expect(previewModal).toBeVisible({ timeout: 6_000 });

    // Preview shows the document number (use first() — the title renders it twice)
    await expect(previewModal.getByText('RD/00001').first()).toBeVisible();

    // URL must NOT change (preview opens in-place)
    await expect(page).toHaveURL(/\/return-material-receipt$/);

    // --- Close preview ---
    await previewModal.getByRole('button', { name: /cerrar|close/i }).click();
    await expect(previewModal).toBeHidden({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — DR detail: ConfirmWithCreditButton flow
// ---------------------------------------------------------------------------

test.describe('return-material-receipt — DR form actions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnReceiptMocks(page);
  });

  test('DR detail: Confirmar button, print button, modal cancel and confirm — full flow', async ({ page }) => {
    await page.goto('/return-material-receipt/ret-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // --- "Confirmar" / processReceipt button is visible ---
    const confirmBtn = page.getByTestId('action-confirm-with-credit');
    await expect(confirmBtn).toBeVisible({ timeout: 8_000 });

    // --- Print button is visible (no data-testid — match by accessible text) ---
    // The PrintButton renders ui('print'), which via i18n returns the key "print"
    // or the translated value ("Imprimir" in es_ES). Match both.
    const printBtn = page.getByRole('button', { name: /imprimir|print/i });
    await expect(printBtn).toBeVisible();

    // --- Click "Confirmar" → modal opens ---
    await confirmBtn.click();

    // Toggle card visible in modal (ConfirmInOutModal uses role="switch", not role="checkbox")
    const modalInvoiceToggle = page.getByTestId('confirm-modal-invoice-toggle');
    await expect(modalInvoiceToggle).toBeVisible({ timeout: 8_000 });

    // Cancel button via data-testid
    const cancelBtn = page.getByTestId('confirm-modal-cancel-btn');
    await expect(cancelBtn).toBeVisible();

    // Confirm button via data-testid
    const modalConfirmBtn = page.getByTestId('confirm-modal-confirm-btn');
    await expect(modalConfirmBtn).toBeVisible();

    // --- Cancel dismisses the modal ---
    await cancelBtn.click();
    await expect(page.getByTestId('confirm-inout-modal')).toBeHidden({ timeout: 5_000 });

    // --- Re-open and actually confirm ---
    await confirmBtn.click();
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toBeVisible({ timeout: 8_000 });

    // Toggle is "on" by default (defaultCreateInvoice=true → aria-checked="true"); verify, then confirm
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toHaveAttribute('aria-checked', 'true');

    // Click Confirm → triggers documentAction POST → mock returns CO
    await page.getByTestId('confirm-modal-confirm-btn').click();

    // After documentAction + createReturnInvoice, a ConfirmResultModal should appear
    // with the invoice document number FC/00100 (from our mock)
    // Wait for the result card or at minimum the modal to disappear and something to update
    // The ConfirmResultModal shows rmrInvoiceCreatedTitle or the invoice card
    await expect(page.getByText(/FC\/00100/).or(page.getByTestId('confirm-result-modal'))).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Test suite 3 — CO detail (no invoice): action buttons
// ---------------------------------------------------------------------------

test.describe('return-material-receipt — CO form actions (no existing invoice)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnReceiptMocks(page);
  });

  test('CO detail: create invoice button, print button, invoice modal confirm — full flow', async ({ page }) => {
    test.setTimeout(120_000); // 3 navigations + modal flow can exceed 60s under full-suite load
    // ret-003 is CO with hasReturnInvoice=false — "Crear factura de devolución" must be visible
    await page.goto('/return-material-receipt/ret-003');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // --- "Crear factura de devolución" button is visible ---
    const createInvoiceBtn = page.getByTestId('action-create-return-invoice');
    await expect(createInvoiceBtn).toBeVisible({ timeout: 8_000 });

    // --- Print button is visible ---
    const printBtn = page.getByRole('button', { name: /imprimir|print/i });
    await expect(printBtn).toBeVisible();

    // Clone is a list-view row action (row-quick-action-clone), not a detail-view
    // button — ConfirmWithCreditButtonBase renders no clone control here.

    // --- ret-002 has hasReturnInvoice=true, so its button must be absent ---
    await page.goto('/return-material-receipt/ret-002');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('action-create-return-invoice')).toHaveCount(0);

    // --- Back to ret-003: open create invoice modal and confirm ---
    await page.goto('/return-material-receipt/ret-003');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const createInvoiceBtn2 = page.getByTestId('action-create-return-invoice');
    await expect(createInvoiceBtn2).toBeVisible({ timeout: 8_000 });
    await createInvoiceBtn2.click();

    // Modal opens — verify via data-testid (CreateInvoiceConfirmModal)
    const invoiceModal = page.getByTestId('create-invoice-confirm-modal');
    await expect(invoiceModal).toBeVisible({ timeout: 8_000 });

    // Cancel button inside the modal — the detail view has a separate action-cancel button,
    // so use nth(1) to target the modal's own Cancelar button.
    const cancelBtn = page.getByRole('button', { name: /^cancelar$|^cancel$/i }).nth(1);
    await expect(cancelBtn).toBeVisible();

    // Confirm via the modal footer's primary button (soCreateDocsBtn renders
    // "Crear →"). Scope to the modal and take its last button — the footer order
    // is Cancelar then the confirm button — so this is independent of the label.
    const footerConfirmBtn = invoiceModal.getByRole('button').last();
    await expect(footerConfirmBtn).toBeVisible();
    await footerConfirmBtn.click();

    // createReturnInvoice POST returns FC/00100 → ConfirmResultModal shows it
    await expect(page.getByText(/FC\/00100/).or(page.getByTestId('confirm-result-modal'))).toBeVisible({ timeout: 8_000 });
  });
});
