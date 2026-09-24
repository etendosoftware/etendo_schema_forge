import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import {
  buildRectifiableInvoicesPayload,
  RECTIFIABLE_PAGE_SIZE,
} from '../helpers/rectifiable-invoices-mock.js';

/**
 * Return to Vendor Shipment — full flow smoke (mocked) — ETP-4034
 *
 * Covers:
 *   Case  2 — Confirm modal (DR → CO): ConfirmInOutModal lifecycle, cancel and confirm.
 *     ETP-5408: the Borrador "Confirmar" is the GENERIC draftMode Confirm (`action-save`,
 *     Check icon) next to the generic Save draft (`action-save-draft`); it stays disabled
 *     until the lines request returns >=1 line (draftMode.disableWhenEmpty), so the DR
 *     confirm describe mocks one line (`linesByParent`).
 *   Case  5 — Create return invoice from CO detail: button gating, modal, result card
 *   Case  6 — Button visibility per document status (DR vs CO)
 *   Case  7 — Clone hidden from list view (ETP-5316): row-quick-action-clone must
 *     NOT render for DR or CO rows (duplicateAction={{ show: false }} in index.jsx,
 *     ETP-4717 — clone is not a supported action for this window), matching sibling
 *     return-material-receipt. Previously the shared RowQuickActions component
 *     silently ignored `show: false`, so Clone showed up on CO rows anyway.
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

// ETP-5408: one line under the DR record, so the generic draftMode Confirm
// (disableWhenEmpty) is enabled in the confirm-lifecycle describe.
const DR_LINE = {
  id: 'rtvs-dr-001-line-1',
  lineNo: 10,
  product: 'prod-001',
  'product$_identifier': 'Producto Test',
  movementQuantity: 1,
};

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

// ETP-5381 (commit 0007e2019): candidates returned by the `rectifiableInvoices` action.
// Field names mirror ReturnShipmentUtils#runInvoiceQuery exactly (id, documentNo, invoiceDate,
// grandTotalAmount, currency, businessPartner) plus the `suggested` flag added in
// #buildRectifiableInvoicesResponse. `businessPartner` carries the NAME, not an id — these rows
// come from a hand-built SQL projection, not the entity serializer (InvoicePickerModal.jsx:54).
const RECTIFIABLE_INVOICES = [
  {
    id: 'rtv-rect-inv-a',
    documentNo: 'FC-RTV-OLD-001',
    invoiceDate: '2026-04-10',
    grandTotalAmount: 250,
    currency: 'EUR',
    businessPartner: 'Proveedor Test S.L.',
  },
  {
    id: 'rtv-rect-inv-b',
    documentNo: 'FC-RTV-OLD-002',
    invoiceDate: '2026-04-22',
    grandTotalAmount: 120,
    currency: 'EUR',
    businessPartner: 'Proveedor Test S.L.',
  },
];

// A candidate set LARGER than one batch, with the interesting invoice deliberately parked past
// the end of it. This is the scenario the server-side-search redesign exists for: while the
// picker filtered locally it could only ever search the batch it held, so this invoice was
// unreachable — the list said "no matches" for a document the server has. Index 84 of 85, so the
// first batch (80 rows) genuinely cannot contain it.
const BULK_RECTIFIABLE_INVOICES = Array.from({ length: RECTIFIABLE_PAGE_SIZE + 5 }, (_, i) => ({
  id: `rtv-bulk-inv-${String(i).padStart(3, '0')}`,
  documentNo: `FC-RTV-BULK-${String(i).padStart(3, '0')}`,
  invoiceDate: '2026-03-01',
  grandTotalAmount: 100 + i,
  currency: 'EUR',
  businessPartner: 'Proveedor Test S.L.',
}));
const BULK_LAST = BULK_RECTIFIABLE_INVOICES[BULK_RECTIFIABLE_INVOICES.length - 1];
const BULK_FIRST = BULK_RECTIFIABLE_INVOICES[0];

// ---------------------------------------------------------------------------
// Route installation helpers
// ---------------------------------------------------------------------------

/**
 * Install mocks for the returnToVendorShipment list + detail endpoints.
 * Must be called AFTER login() so these specific handlers win over the
 * generic /sws/** stub from login() (Playwright routes match in LIFO order).
 */
async function installReturnToVendorMocks(
  page,
  rows = ALL_ROWS,
  {
    suggestedInvoiceIds = [], state, rectifiableInvoices = RECTIFIABLE_INVOICES,
    linesByParent = {},
  } = {},
) {
  // Lines endpoint — installed FIRST (lower LIFO priority). Empty by default — the
  // import-from-receipt flow needs the lines empty state. ETP-5408: `linesByParent`
  // ({ [parentId]: rows }) feeds the lines of a record whose generic draftMode Confirm
  // must be ENABLED — `disableWhenEmpty` reads this request (hook.children), not the
  // header's linesCount.
  await page.route(
    (url) => url.href.includes('/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        const parentId = new URL(route.request().url()).searchParams.get('parentId');
        const data = linesByParent[parentId] ?? [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data, totalRows: data.length } }),
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

      // ETP-5381: POST rectifiableInvoices → the candidate list the picker shows.
      // Search and paging are SERVER-SIDE — the picker renders this batch verbatim and never
      // filters locally — so the mock MUST honour the request body ({ startRow, pageSize,
      // search }). A mock that answers the same full list regardless would make every search
      // assertion vacuous: the row stays visible and the test is "green" against a UI that
      // never searched. buildRectifiableInvoicesPayload models the real action (see
      // ReturnShipmentUtils#buildRectifiableInvoicesResponse).
      //
      // MUST be handled before the generic branches below — otherwise the request falls through
      // to this handler's catch-all `{ response: { data: [] } }`, `data.invoices` reads
      // undefined, the hook reports "nothing to rectify", and the confirm button stays disabled.
      if (method === 'POST' && url.includes('/action/rectifiableInvoices')) {
        const body = req.postData() ? JSON.parse(req.postData()) : {};
        state?.rectifiableRequests?.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: {
              data: buildRectifiableInvoicesPayload({
                invoices: rectifiableInvoices,
                suggestedInvoiceIds,
                body,
              }),
            },
          }),
        });
        return;
      }

      // POST createReturnInvoice → synthetic purchase rectificativa invoice.
      // ETP-4737: the generated invoice carries a NEGATIVE total (return flow).
      if (method === 'POST' && url.includes('/action/createReturnInvoice')) {
        state?.invoicePosts?.push(req.postData() ? JSON.parse(req.postData()) : {});
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-new-001', documentNo: 'FC-RTV-NEW-001', grandTotalAmount: -250 } },
          }),
        });
        return;
      }

      // NOTE: cloneRecord / cloned-record mocks were removed — ETP-5316/ETP-4717
      // made the row-quick-action-clone trigger unreachable for this window
      // (duplicateAction={{ show: false }} in index.jsx), so there is no
      // CloneOrderModal flow left to exercise here.

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
// Cases 11, 12, 7 (row clone hidden — ETP-5316)
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — list view', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReturnToVendorMocks(page);
    await page.goto('/return-to-vendor-shipment');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  /**
   * Verifies list columns are rendered, row quick-action overlays work
   * (including Clone staying hidden for both DR and CO rows — ETP-5316), and
   * the preview panel opens and closes without navigation.
   */
  test('list columns, quick-action overlays, and preview panel — full flow', async ({ page }) => {
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

    // Clone/duplicate is not a supported action for this window — hidden for DR
    // (index.jsx duplicateAction={{ show: false }} — ETP-5316/ETP-4717).
    await expect(drRow.getByTestId('row-quick-action-clone')).toHaveCount(0);

    // ── CO row quick-actions ──────────────────────────────────────────────
    const coRow = page.locator('tbody tr').filter({ hasText: 'RTVS-CO-001' }).first();
    await coRow.hover();

    await expect(coRow.getByTestId('row-quick-action-edit')).toBeVisible();
    // ETP-5316: Clone (duplicate) used to show up for CO rows only
    // (the shared RowQuickActions component silently ignored `show: false`); it
    // must now be hidden for CO too, matching the DR row above and sibling
    // return-material-receipt.
    await expect(coRow.getByTestId('row-quick-action-clone')).toHaveCount(0);
    // Grid delete stays visible regardless of status (ETP-4656, commit 044edad45) —
    // see e2e/tests/flows/delete-visibility.mocked.spec.js for the dedicated regression guard.
    await expect(coRow.getByTestId('row-quick-action-delete')).toBeVisible();

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

    // Case 7 (row clone) is now covered above: Clone is hidden for both DR and
    // CO rows, so there is no CloneOrderModal flow to exercise from the list —
    // ETP-5316/ETP-4717 removed the row-quick-action-clone trigger entirely.
  });
});

// ---------------------------------------------------------------------------
// Describe 2 — DR detail: button visibility and ConfirmInOutModal lifecycle
// Cases 2, 6 (DR side)
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — DR detail actions', () => {
  // ETP-5381: the backend walked the return chain (M_InOutLine.Canceled_Inoutline_ID →
  // original line → its invoice) and found FC-RTV-OLD-001, so it arrives preselected. This
  // flow therefore covers the auto-detected half of the picker on the ConfirmInOutModal side;
  // return-material-receipt.mocked.spec.js covers the manual half of the same modal.
  let state;

  test.beforeEach(async ({ page }) => {
    state = { invoicePosts: [], rectifiableRequests: [] };
    await login(page);
    await installReturnToVendorMocks(page, ALL_ROWS, {
      suggestedInvoiceIds: ['rtv-rect-inv-a'],
      state,
      linesByParent: { 'rtvs-dr-001': [DR_LINE] },
    });
  });

  /**
   * For a DR record:
   *   - the generic draftMode Confirm (`action-save`, Check icon) and Save draft
   *     (`action-save-draft`) render — ETP-5408; `action-confirm-with-credit` is gone
   *   - action-create-return-invoice is NOT present
   *   - Clone is a list-view row action, and it is hidden entirely for this
   *     window (ETP-5316/ETP-4717), so it is not asserted here
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

    // Wait for the toolbar to hydrate (async render)
    const confirmBtn = page.getByTestId('detail-view').getByTestId('action-save');
    await confirmBtn.waitFor({ state: 'visible', timeout: 15_000 });

    // ── Case 6: DR button visibility ──────────────────────────────────────
    // ETP-5408: the generic draftMode Confirm with its Check icon, enabled once the
    // mocked line arrives (disableWhenEmpty), next to the generic Save draft.
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn.getByTestId('Check__fa3275')).toBeVisible();
    await expect(confirmBtn).toHaveText(/confirmar|confirm/i);
    await expect(confirmBtn).toBeEnabled({ timeout: 8_000 });
    const saveDraftBtn = page.getByTestId('detail-view').getByTestId('action-save-draft');
    await expect(saveDraftBtn).toBeVisible();
    await expect(saveDraftBtn.getByTestId('Save__fa3275')).toBeVisible();
    await expect(page.getByTestId('action-confirm-with-credit')).toHaveCount(0);
    // Clone is a list-view row action, not a detail-view button, and it is
    // hidden entirely for this window (ETP-5316/ETP-4717) — see the
    // 'list view' describe block above for the row-quick-action-clone assertions.

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

    // ETP-4737: the toggle card label is the current "Crear Factura Rectificativa"
    // wording (returnToVendor.createCreditNote) — regression guard for the rename.
    await expect(dialog.getByText('Crear Factura Rectificativa', { exact: true })).toBeVisible();

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

    // ── ETP-5381: the auto-detected invoice arrives preselected ──────────────────
    // With a suggestion present the user has nothing to do, but the selection must be
    // real: assert the chip, not just an enabled button — an absent gate would also
    // leave the button enabled, and that is the regression this guards.
    await expect(dialog2.getByTestId('confirm-modal-rectify-selected-rtv-rect-inv-a'))
      .toBeVisible({ timeout: 8_000 });
    await expect(dialog2.getByTestId('confirm-modal-rectify-selected-rtv-rect-inv-a'))
      .toContainText('FC-RTV-OLD-001');
    // The non-suggested candidate must NOT be preselected.
    await expect(dialog2.getByTestId('confirm-modal-rectify-selected-rtv-rect-inv-b')).toHaveCount(0);

    // Toggle is checked → button label is confirmWithInvoice ("Confirmar y crear factura")
    const modalConfirmBtn = dialog2.getByRole('button', { name: /confirmar/i });
    await expect(modalConfirmBtn).toBeVisible();
    await expect(modalConfirmBtn).toBeEnabled({ timeout: 5_000 });
    await modalConfirmBtn.click();

    // ConfirmResultModal shows the newly created invoice documentNo
    const resultModal = page.getByTestId('confirm-result-modal');
    await expect(resultModal).toBeVisible({ timeout: 10_000 });
    await expect(resultModal).toContainText('FC-RTV-NEW-001');

    // ETP-4737: the rectificativa invoice is created with a negative total (credit
    // flow) — the result card must render the negative amount from the backend.
    await expect(page.getByText(/-250,00/)).toBeVisible();

    // ETP-5381: the preselected suggestion must travel on the createReturnInvoice POST —
    // ConfirmInOutModal builds `{ originInvoices: rectify.selectedIds }`. Without it the
    // backend would fall back to its own chain detection, which is a different code path
    // and would silently hide a frontend that dropped the selection.
    expect(state.invoicePosts).toHaveLength(1);
    expect(state.invoicePosts[0].originInvoices).toEqual(['rtv-rect-inv-a']);
  });
});

// ---------------------------------------------------------------------------
// Describe 3 — CO detail: button visibility and create return invoice flow
// Cases 5, 6 (CO side)
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — CO detail actions', () => {
  // ETP-5381: no suggestion — models a standalone return whose chain the backend could not
  // walk, so the user MUST pick by hand. Covers the manual half of the picker on the
  // CreateInvoiceConfirmModal side (return-material-receipt covers its preselected half).
  let state;

  test.beforeEach(async ({ page }) => {
    state = { invoicePosts: [], rectifiableRequests: [] };
    await login(page);
    await installReturnToVendorMocks(page, ALL_ROWS, { suggestedInvoiceIds: [], state });
  });

  /**
   * For a CO record without an existing return invoice:
   *   - action-create-return-invoice is visible
   *   - no Borrador Confirm: the Save/Confirm row is hidden on CO (ETP-5408)
   *   - Clone is a list-view row action, and it is hidden entirely for this
   *     window (ETP-5316/ETP-4717), so it is not asserted here
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
    // Clone is a list-view row action, not a detail-view button, and it is
    // hidden entirely for this window (ETP-5316/ETP-4717) — see the
    // 'list view' describe block above for the row-quick-action-clone assertions.

    // ETP-4737: the post-confirm button's label was ALSO fixed today — it used to fall
    // back to the hardcoded, stale `createReturnInvoice` i18n key with no per-window
    // override; ConfirmWithCreditButtonBase now accepts a `postConfirmButtonLabel` prop
    // and this window wires it to returnToVendor.createCreditNote (value updated to the
    // unified "Crear Factura Rectificativa" wording, matching the confirm-modal's toggle
    // card asserted above in the DR flow test).
    await expect(createInvoiceBtn).toHaveText('Crear Factura Rectificativa');

    // ETP-5408: no Borrador Confirm on CO — the generic draftMode Save/Confirm row is
    // hidden once completed (no keepSaveWhenCompletedFields), and the old bespoke
    // button no longer exists at all.
    await expect(page.getByTestId('detail-view').getByTestId('action-save')).toHaveCount(0);
    await expect(page.getByTestId('detail-view').getByTestId('action-save-draft')).toHaveCount(0);
    await expect(page.getByTestId('action-confirm-with-credit')).toHaveCount(0);

    // ── Case 5: create return invoice from CO ─────────────────────────────
    await createInvoiceBtn.click();

    // CreateInvoiceConfirmModal — modal title is soManageDocsTitle ("Generar factura",
    // ETP-5410 follow-up: was "Gestionar documentos")
    await expect(page.getByText('Generar factura')).toBeVisible({ timeout: 8_000 });

    // Blue summary card shows BP name (small text) and documentNo (large text)
    await expect(page.getByText('Proveedor Test S.L.').first()).toBeVisible({ timeout: 8_000 });
    // RTVS-CO-001 appears as large text in the summary card (displayAmount = documentNo when total=0)
    await expect(page.getByText('RTVS-CO-001').first()).toBeVisible({ timeout: 8_000 });

    // ETP-5381 (commit a84798d2a, "Drop the redundant create-invoice checkbox"): the
    // "Crear factura" checkbox card (soCreateInvoiceTitle) that used to be asserted here no
    // longer exists. Every button that opens this modal already says "Crear Factura
    // Rectificativa", so the checkbox was a confirmation of a confirmation — and unticking it
    // left a dialog whose only action did nothing. The assertion is removed rather than
    // rewritten because the control is gone on purpose, not moved. (The optional-extra toggle
    // in ConfirmInOutModal is a DIFFERENT control and is still asserted in the DR flow above.)

    // ── ETP-5381: pick the invoice this rectificative invoice rectifies ──────────
    const invoiceModal = page.getByTestId('create-invoice-confirm-modal');
    const createDocsBtn = invoiceModal.getByRole('button').last();
    await expect(createDocsBtn).toBeVisible({ timeout: 8_000 });

    // Nothing auto-detected → the gate must hold. A rectificative invoice with no
    // C_Invoice_Reverse row cannot be confirmed, and these are created AND confirmed in one
    // step, so the frontend refuses to send rather than creating a document stuck in draft.
    await expect(createDocsBtn).toBeDisabled();

    await invoiceModal.getByTestId('invoice-confirm-rectify-open').click();
    const picker = page.getByTestId('invoice-confirm-rectify-picker-modal');
    await expect(picker).toBeVisible({ timeout: 8_000 });

    // Both candidates offered, neither badged as suggested (suggestedInvoiceIds is empty).
    await expect(picker.getByTestId('invoice-confirm-rectify-option-rtv-rect-inv-a')).toBeVisible();
    await expect(picker.getByTestId('invoice-confirm-rectify-option-rtv-rect-inv-b')).toBeVisible();
    await expect(picker.getByTestId('invoice-confirm-rectify-suggested-rtv-rect-inv-a')).toHaveCount(0);

    // The search box narrows the list — and it does so through a SERVER round-trip, not a
    // local filter: the picker runs in its controlled mode here and renders whatever batch it
    // is handed. Typing therefore has to reach the mock as `search` in the POST body, and the
    // narrowing we assert below is the mock's answer, not client-side filtering.
    await picker.getByTestId('invoice-confirm-rectify-search').fill('FC-RTV-OLD-002');

    // The request itself — asserted separately from the rendering so a regression that stops
    // sending `search` is distinguishable from one that mis-renders the reply. Polled because
    // useRectifiableInvoices debounces typing by 250ms before it fetches.
    await expect
      .poll(() => state.rectifiableRequests.some(r => r.search === 'FC-RTV-OLD-002'), { timeout: 8_000 })
      .toBe(true);
    // Narrowing always restarts at the first batch — otherwise the results would be windowed
    // by an offset belonging to the previous, wider result set.
    const searchReq = state.rectifiableRequests.find(r => r.search === 'FC-RTV-OLD-002');
    expect(searchReq.startRow).toBe(0);

    // …and the rendering: the non-matching row is gone, the matching one stayed.
    await expect(picker.getByTestId('invoice-confirm-rectify-option-rtv-rect-inv-a')).toHaveCount(0);
    await expect(picker.getByTestId('invoice-confirm-rectify-option-rtv-rect-inv-b')).toBeVisible();

    await picker.getByTestId('invoice-confirm-rectify-option-rtv-rect-inv-b').click();
    await picker.getByTestId('invoice-confirm-rectify-apply').click();
    await expect(picker).toBeHidden({ timeout: 5_000 });

    // The chosen invoice shows in the host modal and the gate opens.
    await expect(invoiceModal.getByTestId('invoice-confirm-rectify-selected-rtv-rect-inv-b'))
      .toContainText('FC-RTV-OLD-002');
    await expect(createDocsBtn).toBeEnabled({ timeout: 5_000 });

    // "Crear →" button (soCreateDocsBtn) triggers the POST
    await createDocsBtn.click();

    // createReturnInvoice POST returns FC-RTV-NEW-001 → ConfirmResultModal appears
    const resultModal = page.getByTestId('confirm-result-modal');
    await expect(resultModal).toBeVisible({ timeout: 10_000 });
    await expect(resultModal).toContainText('FC-RTV-NEW-001');

    // ETP-4737: same negative-total contract applies from the CO (already confirmed)
    // detail flow — useConfirmWithCredit.handleCreateReturnInvoice reads grandTotalAmount.
    await expect(page.getByText(/-250,00/)).toBeVisible();

    // ETP-5381: the user's choice must reach the backend —
    // CreateInvoiceConfirmModal.onConfirm(priceListId, originInvoices) →
    // useConfirmWithCredit.handleCreateReturnInvoice(originInvoices).
    expect(state.invoicePosts).toHaveLength(1);
    expect(state.invoicePosts[0].originInvoices).toEqual(['rtv-rect-inv-b']);

    // ETP-4299: ConfirmWithCreditButtonBase.onClose fires window.location.reload()
    // via setTimeout(0) when the user closes without navigating.
    // page.waitForNavigation() catches the next navigation (the reload) before it races
    // with our page.goto() to rtvs-co-002.
    const [,] = await Promise.all([
      // eslint-disable-next-line playwright/no-wait-for-timeout -- needed to absorb the reload
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
      // Close result modal — use exact match to avoid "Cerrar Copilot" button
      page.getByRole('button', { name: 'Cerrar', exact: true }).click(),
    ]);

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
// Describe 3b — ETP-5381: the rectify picker searches the SERVER, not the batch
// ---------------------------------------------------------------------------

test.describe('return-to-vendor-shipment — rectify picker paging and server search', () => {
  // 85 candidates against a batch size of 80: the invoice this test goes looking for is the
  // 85th, so it is provably NOT in the first batch.
  let state;

  test.beforeEach(async ({ page }) => {
    state = { invoicePosts: [], rectifiableRequests: [] };
    await login(page);
    await installReturnToVendorMocks(page, ALL_ROWS, {
      suggestedInvoiceIds: [],
      state,
      rectifiableInvoices: BULK_RECTIFIABLE_INVOICES,
    });
  });

  /**
   * The regression the server-side-search redesign exists to prevent.
   *
   * While the picker filtered locally it could only ever search the rows it had already
   * fetched, so an invoice sitting past the first batch was unreachable: the list answered
   * "no matches" for a document the server holds, and the user concluded it did not exist.
   * Nothing covered that end-to-end — the old fixtures were two rows, which fit in any batch,
   * so a purely local filter would have passed every existing assertion.
   *
   * Also covers the `knownById` cache: a selection has to keep rendering its number once the
   * rows it came from are replaced by a different batch.
   */
  test('an invoice outside the first batch is unreachable by scrolling but findable by search', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/return-to-vendor-shipment/rtvs-co-001');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const createInvoiceBtn = page.getByTestId('action-create-return-invoice');
    await createInvoiceBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await createInvoiceBtn.click();

    const invoiceModal = page.getByTestId('create-invoice-confirm-modal');
    await expect(invoiceModal).toBeVisible({ timeout: 8_000 });
    await invoiceModal.getByTestId('invoice-confirm-rectify-open').click();

    const picker = page.getByTestId('invoice-confirm-rectify-picker-modal');
    await expect(picker).toBeVisible({ timeout: 8_000 });

    // ── Pre-condition: the first batch is exactly one page, and the target is not in it ──
    // Counted with an attribute selector rather than getByTestId because the ids are dynamic
    // and the point of the assertion is the SIZE of the set, not any one row. Scoped to the
    // list's own testid so it cannot drift onto rows rendered elsewhere.
    const options = picker.getByTestId('invoice-confirm-rectify-list')
      .locator('[data-testid^="invoice-confirm-rectify-option-"]');
    await expect(options).toHaveCount(RECTIFIABLE_PAGE_SIZE, { timeout: 8_000 });
    await expect(picker.getByTestId(`invoice-confirm-rectify-option-${BULK_FIRST.id}`)).toBeVisible();
    await expect(picker.getByTestId(`invoice-confirm-rectify-option-${BULK_LAST.id}`)).toHaveCount(0);

    // The first request asked for the first batch and the server said there is more.
    expect(state.rectifiableRequests[0]).toMatchObject({ startRow: 0, pageSize: RECTIFIABLE_PAGE_SIZE });

    // ── Search finds it anyway — because the query goes to the server ────────────────────
    await picker.getByTestId('invoice-confirm-rectify-search').fill(BULK_LAST.documentNo);

    await expect(picker.getByTestId(`invoice-confirm-rectify-option-${BULK_LAST.id}`))
      .toBeVisible({ timeout: 8_000 });
    // …and the batch-1 rows it replaced are gone: this is a refetch, not an append.
    await expect(picker.getByTestId(`invoice-confirm-rectify-option-${BULK_FIRST.id}`)).toHaveCount(0);
    await expect(options).toHaveCount(1);

    // ── The selection survives the rows being swapped out from under it ─────────────────
    await picker.getByTestId(`invoice-confirm-rectify-option-${BULK_LAST.id}`).click();
    await picker.getByTestId('invoice-confirm-rectify-apply').click();
    await expect(picker).toBeHidden({ timeout: 5_000 });

    const chip = invoiceModal.getByTestId(`invoice-confirm-rectify-selected-${BULK_LAST.id}`);
    await expect(chip).toContainText(BULK_LAST.documentNo);

    // Reopen and clear the search: the list falls back to batch 1, which does NOT contain the
    // selected invoice — yet the chip must still render its document number. That is the
    // `knownById` cache in useRectifiableInvoices; without it the chip would degrade to a bare
    // id while the id itself still rode along in the submitted payload.
    await invoiceModal.getByTestId('invoice-confirm-rectify-open').click();
    await expect(picker).toBeVisible({ timeout: 8_000 });
    await picker.getByTestId('invoice-confirm-rectify-search').fill('');
    await expect(picker.getByTestId(`invoice-confirm-rectify-option-${BULK_FIRST.id}`))
      .toBeVisible({ timeout: 8_000 });
    await expect(picker.getByTestId(`invoice-confirm-rectify-option-${BULK_LAST.id}`)).toHaveCount(0);
    await picker.getByTestId('invoice-confirm-rectify-apply').click();
    await expect(picker).toBeHidden({ timeout: 5_000 });
    await expect(chip).toContainText(BULK_LAST.documentNo);

    // ── And it is the cross-batch invoice that actually gets submitted ──────────────────
    const createDocsBtn = invoiceModal.getByRole('button').last();
    await expect(createDocsBtn).toBeEnabled({ timeout: 5_000 });
    await createDocsBtn.click();

    await expect(page.getByTestId('confirm-result-modal')).toBeVisible({ timeout: 10_000 });
    expect(state.invoicePosts).toHaveLength(1);
    expect(state.invoicePosts[0].originInvoices).toEqual([BULK_LAST.id]);
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

    // Wait for the DR record to load (confirms header mock is working). ETP-5408: the
    // generic draftMode Confirm — rendered but disabled here, since lines are empty.
    await page.getByTestId('detail-view').getByTestId('action-save').waitFor({ state: 'visible', timeout: 10_000 });

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

    // Wait for record to load before checking notes (ETP-5408: the generic draftMode Confirm)
    await page.getByTestId('detail-view').getByTestId('action-save').waitFor({ state: 'visible', timeout: 10_000 });

    // DetailView renders a "NOTAS" label and data-testid="notes-textarea" wrapper
    const notesContainer = page.getByTestId('notes-textarea');
    await expect(notesContainer).toBeVisible({ timeout: 5_000 });

    // The wrapper also contains a role="textbox" div in its unfocused state
    const notesTextbox = notesContainer.getByRole('textbox');
    await expect(notesTextbox).toBeVisible({ timeout: 3_000 });
  });
});
