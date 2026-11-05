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

  test('the batch bar shows the selection with Discard enabled and Confirm disabled', async ({ page }) => {
    await openInbox(page, state);
    const reviewRow = page.locator('tr').filter({ has: page.getByTestId('invoice-inbox-document-review1') });
    await reviewRow.getByRole('checkbox').check({ force: true });
    await expect(page.getByTestId('invoice-inbox-selection-bar')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-bulk-mark-review')).toBeDisabled();
    await expect(page.getByTestId('invoice-inbox-bulk-confirm')).toBeDisabled();
    await expect(page.getByTestId('invoice-inbox-bulk-discard')).toBeEnabled();
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
