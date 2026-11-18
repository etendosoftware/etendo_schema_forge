// @covers tools/app-shell/src/windows/custom/invoice-inbox/index.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxPage.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxToolbar.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxTable.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxUploadTray.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxSelectionBar.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxUpload.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useProcessingRowsPoll.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxDiscard.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxDiscardDialog.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxRowActions.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxConfirmDialog.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxConfirm.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxConfirmModel.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxCells.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxInvoiceLink.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Invoice Inbox — open from the Purchases menu, counters, ERROR rows first in "All", per-file uploads,
 * client-side refusals, PROCESSING placeholders refreshed by polling, disabled batch bar (mocked).
 *
 * `login()` grants every capability (incl. `invoiceInbox`) and full window access, so the menu
 * entry is offered. Every request under /sws/neo/invoice-inbox is answered here; routes are
 * installed AFTER login() so they win over its generic /sws/** stub.
 */

const SPEC = 'invoice-inbox';

const row = (id, status, extra = {}) => ({
  id, status, fileName: `${id}.pdf`, source: 'UPLOAD', created: '2026-08-10T09:30:00Z', ...extra,
});

function seedRows() {
  return [
    row('proc1', 'PROCESSING'),
    row('ready1', 'READY', { orderReference: 'F-100', grandTotalAmount: 100, invoiceDate: '2026-08-01', extractedName: 'Vendor A' }),
    row('review1', 'PENDING_REVIEW', { extractedName: 'Vendor B' }),
    row('err1', 'ERROR', { errorCode: 'UNREADABLE' }),
    row('conf1', 'CONFIRMED', { extractedName: 'Vendor C' }),
    row('disc1', 'DISCARDED'),
  ];
}

const PENDING = new Set(['PROCESSING', 'PENDING_REVIEW', 'READY']);

/** Evaluates the criteria the page sends (equals / inSet on status or id). */
function matches(rowData, criteria) {
  return criteria.every(({ fieldName, operator, value }) => {
    const actual = rowData[fieldName];
    return operator === 'inSet' ? value.includes(actual) : actual === value;
  });
}

async function installInboxMock(page, state) {
  state.listRequests = [];
  state.uploads = [];
  state.discards = [];
  state.confirms = [];
  state.inFlight = 0;
  state.maxInFlight = 0;
  state.invoiceSeq = 0;
  await page.route(`**/sws/neo/${SPEC}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'POST' && url.pathname.endsWith('/upload')) {
      state.uploads.push(req.postData() ?? '');
      state.rows.unshift(row(`up${state.uploads.length}`, 'PROCESSING'));
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ results: [{ status: 'accepted', incomingDocumentId: `up${state.uploads.length}` }] }),
      });
      return;
    }
    const discard = url.pathname.match(/\/header\/([^/]+)\/action\/discard$/);
    if (req.method() === 'POST' && discard) {
      const id = decodeURIComponent(discard[1]);
      state.discards.push(id);
      if (state.refuse?.has(id)) {
        await route.fulfill({
          status: 409, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'not_discardable', message: 'Not discardable' } }),
        });
        return;
      }
      const target = state.rows.find((r) => r.id === id);
      if (target) { target.status = 'DISCARDED'; target.discardedAt = '2026-08-10T09:30:00Z'; }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id, status: 'DISCARDED', discardedAt: '2026-08-10T09:30:00Z', alreadyDiscarded: false }),
      });
      return;
    }
    const confirm = url.pathname.match(/\/header\/([^/]+)\/action\/confirm$/);
    if (req.method() === 'POST' && confirm) {
      const id = decodeURIComponent(confirm[1]);
      state.confirms.push(id);
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => { setTimeout(resolve, state.confirmDelay ?? 120); });
      state.inFlight -= 1;
      const forced = state.confirmRefuse?.[id];
      if (forced === 'abort') { await route.abort('failed'); return; }
      if (forced) {
        await route.fulfill({ status: forced.status, contentType: 'application/json', body: JSON.stringify({ error: forced.error }) });
        return;
      }
      state.invoiceSeq += 1;
      const documentNo = state.docNos?.[id] ?? `FC${1000142 + state.invoiceSeq}`;
      const target = state.rows.find((r) => r.id === id);
      if (target) { target.status = 'CONFIRMED'; target.invoice = `inv-${id}`; target['invoice$documentNo'] = documentNo; }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id, status: 'CONFIRMED', invoice: { id: `inv-${id}`, documentNo, identifier: documentNo },
          adjusted: false, createdVendor: false, createdProducts: state.createdProducts?.[id] ?? 0,
          totalMismatch: Boolean(state.mismatch?.has(id)), alreadyConfirmed: false,
        }),
      });
      return;
    }
    if (req.method() === 'GET' && url.pathname.endsWith('/header')) {
      const q = url.searchParams;
      const criteria = JSON.parse(q.get('criteria') ?? '[]');
      state.listRequests.push({ criteria, noCount: q.get('_noCount') });
      const found = state.rows.filter((r) => matches(r, criteria));
      const start = Number(q.get('_startRow') ?? 0);
      const end = Number(q.get('_endRow') ?? found.length);
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: found.slice(start, end + 1), totalRows: found.length } }),
      });
      return;
    }
    await route.fallback();
  });
}

async function openInbox(page, state) {
  await login(page);
  await installInboxMock(page, state);
  // The entry lives inside the Purchases group: hover it open, then click the item.
  await page.getByTestId('menu-group-purchases').hover();
  await page.getByTestId('menu-item-invoice-inbox').click();
  // The hover-opened Purchases popover would keep covering the table while the mouse is on it.
  await page.mouse.move(900, 700);
  await expect(page.getByTestId('menu-item-goods-receipt')).toHaveCount(0);
  await expect(page).toHaveURL(/\/invoice-inbox/);
  await expect(page.getByTestId('invoice-inbox-page')).toBeVisible();
}

const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 ${name}`) });

test.describe('Invoice Inbox', () => {
  let state;
  test.beforeEach(() => { state = { rows: seedRows() }; });

  test('opens from the menu and shows a counter per tab', async ({ page }) => {
    await openInbox(page, state);
    // pending = PROCESSING + PENDING_REVIEW + READY = 3, error = 1, confirmed = 1, discarded = 1, all = 5
    await expect(page.getByTestId('invoice-inbox-filter-count-pending')).toHaveText('3');
    await expect(page.getByTestId('invoice-inbox-filter-count-error')).toHaveText('1');
    await expect(page.getByTestId('invoice-inbox-filter-count-confirmed')).toHaveText('1');
    await expect(page.getByTestId('invoice-inbox-filter-count-discarded')).toHaveText('1');
    await expect(page.getByTestId('invoice-inbox-filter-count-all')).toHaveText('5');
    expect(state.listRequests.some((r) => r.noCount === 'false')).toBe(true);
  });

  test('"All" lists ERROR rows first and leaves DISCARDED out', async ({ page }) => {
    await openInbox(page, state);
    const docs = page.locator('[data-testid^="invoice-inbox-document-"]');
    await expect(docs).toHaveCount(5);
    await expect(docs.first()).toHaveAttribute('data-testid', 'invoice-inbox-document-err1');
    await expect(page.getByTestId('invoice-inbox-document-disc1')).toHaveCount(0);
  });

  test('a tab shows only its status', async ({ page }) => {
    await openInbox(page, state);
    await page.getByTestId('invoice-inbox-filter-discarded').click();
    await expect(page.getByTestId('invoice-inbox-document-disc1')).toBeVisible();
    await expect(page.locator('[data-testid^="invoice-inbox-document-"]')).toHaveCount(1);
  });

  test('uploading 3 files sends one request per file and the new rows show up in the list', async ({ page }) => {
    await openInbox(page, state);
    await page.getByTestId('invoice-inbox-file-input').setInputFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    await expect.poll(() => state.uploads.length).toBe(3);
    for (const body of state.uploads) expect(body).toContain('name="files"');
    // Every file was delivered: the tray keeps only refused or unconfirmed lines, so it closes.
    await expect(page.getByTestId('invoice-inbox-upload-tray')).toHaveCount(0);
    for (const id of ['up1', 'up2', 'up3']) {
      await expect(page.getByTestId(`invoice-inbox-document-${id}`)).toBeVisible();
    }
  });

  test('a .webp next to a pdf: the pdf is uploaded and the toast names the .webp', async ({ page }) => {
    await openInbox(page, state);
    await page.getByTestId('invoice-inbox-file-input').setInputFiles([
      pdf('ok.pdf'), { name: 'photo.webp', mimeType: 'image/webp', buffer: Buffer.from('webp') },
    ]);
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'photo.webp' })).toBeVisible();
    await expect.poll(() => state.uploads.length).toBe(1);
    expect(state.uploads[0]).toContain('ok.pdf');
    expect(state.uploads[0]).not.toContain('photo.webp');
  });

  test('21 files: a toast warns and no request is sent', async ({ page }) => {
    await openInbox(page, state);
    await page.getByTestId('invoice-inbox-file-input').setInputFiles(Array.from({ length: 21 }, (_, i) => pdf(`f${i}.pdf`)));
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /20/ })).toBeVisible();
    expect(state.uploads).toHaveLength(0);
    await expect(page.getByTestId('invoice-inbox-upload-tray')).toHaveCount(0);
  });

  test('PROCESSING rows show placeholders and a poll replaces them with the read values', async ({ page }) => {
    await openInbox(page, state);
    const procRow = page.getByTestId('invoice-inbox-document-proc1');
    await expect(procRow).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-status-proc1')).toBeVisible();
    // Reader finishes: the next poll by id answers READY with data.
    const idx = state.rows.findIndex((r) => r.id === 'proc1');
    state.rows[idx] = row('proc1', 'READY', { orderReference: 'F-POLLED', extractedName: 'Polled SL' });
    await expect(page.getByText('F-POLLED')).toBeVisible({ timeout: 15_000 });
    expect(state.listRequests.some((r) => r.criteria.some((c) => c.fieldName === 'id' && c.operator === 'inSet'))).toBe(true);
  });

  test('the batch bar shows the selection with Discard and Confirm enabled for a confirmable row; Confirm is disabled, with its tooltip, for an unreadable one', async ({ page }) => {
    await openInbox(page, state);
    const reviewRow = page.locator('tr').filter({ has: page.getByTestId('invoice-inbox-document-review1') });
    await reviewRow.getByRole('checkbox').check({ force: true });
    await expect(page.getByTestId('invoice-inbox-selection-bar')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-bulk-mark-review')).toBeDisabled();
    await expect(page.getByTestId('invoice-inbox-bulk-confirm')).toBeEnabled();
    await expect(page.getByTestId('invoice-inbox-bulk-discard')).toBeEnabled();
    await reviewRow.getByRole('checkbox').uncheck({ force: true });
    await page.locator('tr').filter({ has: page.getByTestId('invoice-inbox-document-err1') }).getByRole('checkbox').check({ force: true });
    await expect(page.getByTestId('invoice-inbox-bulk-confirm')).toBeDisabled();
    await expect(page.getByTestId('invoice-inbox-bulk-confirm').locator('xpath=..')).toHaveAttribute('title', 'Ninguno de los documentos seleccionados se puede confirmar');
  });

  const rowOf = (page, id) => page.locator('tr').filter({ has: page.getByTestId(`invoice-inbox-document-${id}`) });

  test('select two rows, confirm in the dialog: one POST per row, a toast and updated counters', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'ready1').getByRole('checkbox').check({ force: true });
    await rowOf(page, 'review1').getByRole('checkbox').check({ force: true });
    await page.getByTestId('invoice-inbox-bulk-discard').click();
    await expect(page.getByTestId('invoice-inbox-discard-dialog')).toBeVisible();
    await page.getByTestId('invoice-inbox-discard-confirm').click();
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-discard-dialog')).toHaveCount(0);
    expect([...state.discards].sort()).toEqual(['ready1', 'review1']);
    // pending 3 -> 1 (PROCESSING left), discarded 1 -> 3
    await expect(page.getByTestId('invoice-inbox-filter-count-pending')).toHaveText('1');
    await expect(page.getByTestId('invoice-inbox-filter-count-discarded')).toHaveText('3');
    await expect(page.getByTestId('invoice-inbox-selection-bar')).toHaveCount(0);
  });

  test('a 409 on one row: the other is discarded and a warning toast shows', async ({ page }) => {
    state.refuse = new Set(['review1']);
    await openInbox(page, state);
    await rowOf(page, 'ready1').getByRole('checkbox').check({ force: true });
    await rowOf(page, 'review1').getByRole('checkbox').check({ force: true });
    await page.getByTestId('invoice-inbox-bulk-discard').click();
    await page.getByTestId('invoice-inbox-discard-confirm').click();
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-discard-dialog')).toHaveCount(0);
    expect([...state.discards].sort()).toEqual(['ready1', 'review1']);
    await expect(page.getByTestId('invoice-inbox-filter-count-discarded')).toHaveText('2');
    await expect(page.getByTestId('invoice-inbox-filter-count-pending')).toHaveText('2');
  });

  test('the row trash (revealed on hover) discards that single row after confirming', async ({ page }) => {
    await openInbox(page, state);
    const target = rowOf(page, 'err1');
    await target.hover();
    await target.getByTestId('invoice-inbox-row-discard-err1').click();
    await expect(page.getByTestId('invoice-inbox-discard-dialog-title')).toBeVisible();
    await page.getByTestId('invoice-inbox-discard-confirm').click();
    await expect.poll(() => state.discards).toEqual(['err1']);
    await expect(page.getByTestId('invoice-inbox-filter-count-discarded')).toHaveText('2');
  });

  test('CONFIRMED and PROCESSING rows have no trash on hover', async ({ page }) => {
    await openInbox(page, state);
    const confirmed = rowOf(page, 'conf1');
    await confirmed.hover();
    await expect(confirmed.getByTestId('invoice-inbox-row-edit-conf1')).toBeVisible();
    await expect(confirmed.getByTestId('invoice-inbox-row-discard-conf1')).toHaveCount(0);
    await expect(rowOf(page, 'proc1').getByTestId('invoice-inbox-row-actions-proc1')).toHaveCount(0);
  });
});

test.describe('Invoice Inbox — batch confirm', () => {
  let state;
  const toasts = (page) => page.locator('[data-sonner-toast]');
  const pick = async (page, ...ids) => {
    for (const id of ids) await page.locator('tr').filter({ has: page.getByTestId(`invoice-inbox-document-${id}`) }).getByRole('checkbox').check({ force: true });
  };
  const openConfirm = async (page) => {
    await page.getByTestId('invoice-inbox-bulk-confirm').click();
    await expect(page.getByTestId('invoice-inbox-confirm-dialog')).toBeVisible();
  };

  test.beforeEach(() => {
    state = { rows: seedRows(), confirmRefuse: {}, docNos: {}, mismatch: new Set(), createdProducts: {} };
    state.rows.push(row('cf1', 'ERROR', { errorCode: 'CONFIRM_FAILED', grandTotalAmount: 40, invoiceDate: '2026-08-02' }));
    state.rows.find((r) => r.id === 'review1').grandTotalAmount = 50;
  });

  test('two rows go ONE AT A TIME in list order; the toast gives the numbering range and the counters, the rows and their link update', async ({ page }) => {
    await openInbox(page, state);
    await pick(page, 'ready1', 'review1');
    await openConfirm(page);
    await expect(page.getByTestId('invoice-inbox-confirm-dialog-title')).toHaveText('Confirmar 2 facturas');
    await expect(page.getByTestId('invoice-inbox-confirm-totals')).toContainText('150');
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    await expect(page.getByTestId('invoice-inbox-confirm-dialog')).toHaveCount(0);
    expect(state.confirms).toEqual(['ready1', 'review1']);
    expect(state.maxInFlight).toBe(1);
    await expect(toasts(page).filter({ hasText: '2 facturas registradas en Etendo' })).toContainText('FC1000143 a FC1000144');
    await expect(page.getByTestId('invoice-inbox-selection-bar')).toHaveCount(0);
    // confirmed 1 -> 3, pending (PROCESSING + READY + PENDING_REVIEW) 3 -> 1
    await expect(page.getByTestId('invoice-inbox-filter-count-confirmed')).toHaveText('3');
    await expect(page.getByTestId('invoice-inbox-filter-count-pending')).toHaveText('1');
  });

  test('a CONFIRMED row shows "{doc} · Completada" as a link to its purchase invoice, and clicking it does not open the review panel', async ({ page }) => {
    state.rows.find((r) => r.id === 'conf1').invoice = 'inv-conf1';
    state.rows.find((r) => r.id === 'conf1')['invoice$documentNo'] = 'FC77';
    await openInbox(page, state);
    const link = page.getByTestId('invoice-inbox-status-reason-conf1');
    await expect(link).toHaveText('FC77 · Completada');
    await expect(link).toHaveAttribute('href', /\/purchase-invoice\/inv-conf1$/);
    await link.click();
    await expect(page.getByTestId('invoice-inbox-review-drawer')).toHaveCount(0);
    await expect(page).toHaveURL(/\/purchase-invoice\/inv-conf1/);
  });

  test('non contiguous numbers are listed, not shown as a range', async ({ page }) => {
    state.docNos = { ready1: 'FC10', review1: 'FC12' };
    await openInbox(page, state);
    await pick(page, 'ready1', 'review1');
    await openConfirm(page);
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    const toast = toasts(page).filter({ hasText: '2 facturas registradas en Etendo' });
    await expect(toast).toContainText('FC10, FC12');
    await expect(toast).not.toContainText(' a FC12');
  });

  test('the dialog counts skipped rows, a failed row does not stop the others and the toast is a warning with its reason', async ({ page }) => {
    state.confirmRefuse = { review1: { status: 409, error: { code: 'duplicate_invoice' } } };
    await openInbox(page, state);
    await pick(page, 'ready1', 'review1', 'err1');
    await openConfirm(page);
    await expect(page.getByTestId('invoice-inbox-confirm-dialog-title')).toHaveText('Confirmar 2 facturas');
    await expect(page.getByTestId('invoice-inbox-confirm-skipped')).toContainText('1 documento seleccionado');
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    const toast = toasts(page).filter({ hasText: '1 no se pudo confirmar' });
    await expect(toast).toContainText('ya existe una factura de este proveedor con el mismo número');
    // The unreadable row is never sent.
    expect(state.confirms).toEqual(['ready1', 'review1']);
  });

  test('a stopping code (the feature flag is off) stops the run: the rest is reported as unsent', async ({ page }) => {
    state.confirmRefuse = { ready1: { status: 403, error: { code: 'feature_disabled' } } };
    await openInbox(page, state);
    await pick(page, 'ready1', 'review1');
    await openConfirm(page);
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    const toast = toasts(page).filter({ hasText: '1 sin confirmar' });
    await expect(toast).toBeVisible();
    expect(state.confirms).toEqual(['ready1']);
  });

  test('a network failure stops the run and tells the user', async ({ page }) => {
    state.confirmRefuse = { ready1: 'abort' };
    await openInbox(page, state);
    await pick(page, 'ready1', 'review1');
    await openConfirm(page);
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    await expect(toasts(page).filter({ hasText: '1 sin confirmar' })).toBeVisible();
    expect(state.confirms).toEqual(['ready1']);
  });

  test('while it runs the dialog shows the progress and ignores Escape', async ({ page }) => {
    state.confirmDelay = 700;
    await openInbox(page, state);
    await pick(page, 'ready1', 'review1');
    await openConfirm(page);
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    await expect(page.getByTestId('invoice-inbox-confirm-dialog-body')).toContainText(/Confirmando \d de 2/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('invoice-inbox-confirm-dialog')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-confirm-confirm')).toBeDisabled();
    await expect(page.getByTestId('invoice-inbox-confirm-dialog')).toHaveCount(0, { timeout: 10_000 });
    expect(state.confirms).toEqual(['ready1', 'review1']);
  });

  test('a failed confirm (ERROR / CONFIRM_FAILED) is confirmable again from the batch bar', async ({ page }) => {
    await openInbox(page, state);
    await pick(page, 'cf1');
    await expect(page.getByTestId('invoice-inbox-bulk-confirm')).toBeEnabled();
    await openConfirm(page);
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    await expect(toasts(page).filter({ hasText: 'Factura registrada en Etendo' })).toBeVisible();
    expect(state.confirms).toEqual(['cf1']);
  });

  test('new products and a printed-total mismatch are announced in the dialog and in the toast', async ({ page }) => {
    state.rows.find((r) => r.id === 'ready1').newProducts = 2;
    state.rows.find((r) => r.id === 'ready1').totalMismatch = 'Y';
    state.createdProducts = { ready1: 2 };
    state.mismatch = new Set(['ready1']);
    await openInbox(page, state);
    await pick(page, 'ready1');
    await openConfirm(page);
    await expect(page.getByTestId('invoice-inbox-confirm-new-products')).toContainText('2 productos nuevos');
    await expect(page.getByTestId('invoice-inbox-confirm-mismatch')).toContainText('1 factura tiene un total impreso distinto');
    await page.getByTestId('invoice-inbox-confirm-confirm').click();
    const toast = toasts(page).filter({ hasText: 'Factura registrada en Etendo' });
    await expect(toast).toContainText('2 productos creados');
    await expect(toast).toContainText('1 con total distinto al impreso');
  });

  test('rows in two currencies show one total line per currency, and each row total is formatted in its own currency', async ({ page }) => {
    const ready = state.rows.find((r) => r.id === 'ready1');
    ready.currency = 'USD';
    ready.grandTotalAmount = 100;
    state.rows.find((r) => r.id === 'review1').currency = 'EUR';
    await openInbox(page, state);
    await expect(page.getByTestId('invoice-inbox-document-ready1').locator('xpath=ancestor::tr')).toContainText(/\$/);
    await pick(page, 'ready1', 'review1');
    await openConfirm(page);
    await expect(page.getByTestId('invoice-inbox-confirm-total-USD')).toContainText('Importe total (USD)');
    await expect(page.getByTestId('invoice-inbox-confirm-total-EUR')).toContainText('Importe total (EUR)');
  });

  test('Cancel sends nothing', async ({ page }) => {
    await openInbox(page, state);
    await pick(page, 'ready1');
    await openConfirm(page);
    await page.getByTestId('invoice-inbox-confirm-cancel').click();
    await expect(page.getByTestId('invoice-inbox-confirm-dialog')).toHaveCount(0);
    expect(state.confirms).toEqual([]);
  });
});
