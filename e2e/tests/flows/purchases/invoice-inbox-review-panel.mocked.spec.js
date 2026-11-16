// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxPage.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxTable.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxRowActions.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewDrawer.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewHeader.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewForm.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewVendor.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewLines.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewBanners.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewFooter.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewNav.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReview.js
// New file justification: invoice-inbox-upload-and-status.mocked.spec.js covers the list, uploads and
// discard of the window; the review panel is a different flow (open, walk, close, states) with its
// own mocked `review` action, so it gets its own spec instead of growing that one.
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Invoice Inbox — review panel (mocked). Opens from a row and from the pencil, walks previous /
 * next across the loaded rows (skipping PROCESSING, loading more past 50), closes with Escape /
 * outside click / X returning focus, discards from the footer and renders the main states of
 * the mocked `GET /header/{id}/action/review` answer. Routes are installed AFTER login().
 */

const SPEC = 'invoice-inbox';

const row = (id, status, extra = {}) => ({
  id, status, fileName: `${id}.pdf`, source: 'UPLOAD', created: '2026-08-10T09:30:00Z', ...extra,
});

function review(id, status = 'READY', over = {}, doc = {}) {
  const { header: headerOver, ...docRest } = doc;
  return {
    id, status, errorCode: null, reviewed: false, adjusted: false, editable: true,
    fileName: `${id}.pdf`, sender: 'ana@proveedor.com', source: 'EMAIL', created: '2026-08-10T09:30:00Z',
    invoice: null, currency: { id: 'EUR1', isoCode: 'EUR', symbol: '€' },
    document: {
      header: {
        vendor: { state: 'linked', matchedBy: 'taxId', details: { name: 'ACME SL', taxId: 'B1234', city: 'Madrid' }, candidates: [], extracted: {} },
        documentNo: `N-${id}`, invoiceDate: '2026-08-01', totalAmount: 121, totalSource: 'lines',
        duplicate: { state: 'none', invoices: [], inbox: [] },
        ...headerOver,
      },
      lines: [{ index: 0, description: 'Widget', quantity: 2, unitPrice: 50, taxRate: 21, product: { state: 'linked', matchedBy: 'exact', details: { name: 'Widget A', searchKey: 'W-1' } } }],
      validation: { missing: [] },
      ...docRest,
    },
    ...over,
  };
}

function matches(rowData, criteria) {
  return criteria.every(({ fieldName, operator, value }) => {
    const actual = rowData[fieldName];
    return operator === 'inSet' ? value.includes(actual) : actual === value;
  });
}

async function installInboxMock(page, state) {
  state.reviewReads = [];
  state.writes = [];
  await page.route(`**/sws/neo/${SPEC}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const reviewMatch = url.pathname.match(/\/header\/([^/]+)\/action\/review$/);
    if (req.method() === 'GET' && reviewMatch) {
      const id = decodeURIComponent(reviewMatch[1]);
      state.reviewReads.push(id);
      const custom = state.reviews?.[id];
      if (custom?.httpStatus) { await json(custom.httpStatus, custom.body); return; }
      await json(200, custom ?? review(id));
      return;
    }
    const discard = url.pathname.match(/\/header\/([^/]+)\/action\/discard$/);
    if (req.method() === 'POST' && discard) {
      const id = decodeURIComponent(discard[1]);
      state.writes.push(`${req.method()} discard ${id}`);
      const target = state.rows.find((r) => r.id === id);
      if (target) target.status = 'DISCARDED';
      await json(200, { id, status: 'DISCARDED', discardedAt: '2026-08-10T09:30:00Z', alreadyDiscarded: false });
      return;
    }
    if (req.method() !== 'GET') {
      state.writes.push(`${req.method()} ${url.pathname}`);
      await json(500, { error: { code: 'unexpected' } });
      return;
    }
    if (url.pathname.endsWith('/header')) {
      const criteria = JSON.parse(url.searchParams.get('criteria') ?? '[]');
      const found = state.rows.filter((r) => matches(r, criteria));
      const start = Number(url.searchParams.get('_startRow') ?? 0);
      const end = Number(url.searchParams.get('_endRow') ?? found.length);
      await json(200, { response: { data: found.slice(start, end + 1), totalRows: found.length } });
      return;
    }
    await route.fallback();
  });
  // The attachment of the document is read through /sws/neo/attachments: none here, so the viewer
  // shows its "not available" state.
  await page.route('**/sws/neo/attachments/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
}

async function openInbox(page, state) {
  await login(page);
  await installInboxMock(page, state);
  await page.getByTestId('menu-group-purchases').hover();
  await page.getByTestId('menu-item-invoice-inbox').click();
  await page.mouse.move(900, 700);
  await expect(page).toHaveURL(/\/invoice-inbox/);
  await expect(page.getByTestId('invoice-inbox-page')).toBeVisible();
}

const rowOf = (page, id) => page.locator('tr').filter({ has: page.getByTestId(`invoice-inbox-document-${id}`) });
const drawer = (page) => page.getByTestId('invoice-inbox-review-drawer');

function seedRows() {
  return [
    row('rdy1', 'READY'),
    row('proc1', 'PROCESSING'),
    row('rev1', 'PENDING_REVIEW'),
    row('rev2', 'PENDING_REVIEW'),
    row('conf1', 'CONFIRMED'),
  ];
}

test.describe('Invoice Inbox — review panel', () => {
  let state;
  test.beforeEach(() => { state = { rows: seedRows() }; });

  test('a row click opens the panel on that document; Escape closes it and focus returns', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'rev1').getByTestId('invoice-inbox-document-rev1').click();
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-review-title')).toHaveText('rev1.pdf');
    await expect(page.getByTestId('invoice-inbox-review-invoice-no')).toHaveValue('N-rev1');
    expect(state.reviewReads).toEqual(['rev1']);
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    // A row click focuses nothing: focus goes back to the pencil of that row (or the row), never to <body>.
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });

  test('the pencil opens it, and closing with it returns focus to the pencil', async ({ page }) => {
    await openInbox(page, state);
    const target = rowOf(page, 'rev2');
    await target.hover();
    const pencil = target.getByTestId('invoice-inbox-row-edit-rev2');
    await pencil.focus();
    await pencil.press('Enter');
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-review-title')).toHaveText('rev2.pdf');
    await page.getByTestId('invoice-inbox-review-close').click();
    await expect(drawer(page)).toHaveCount(0);
    await expect(pencil).toBeFocused();
  });

  test('an outside click (the veil) closes it', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'rev1').getByTestId('invoice-inbox-document-rev1').click();
    await expect(drawer(page)).toBeVisible();
    await page.getByTestId('invoice-inbox-review-veil').click({ position: { x: 5, y: 300 } });
    await expect(drawer(page)).toHaveCount(0);
  });

  test('a PROCESSING row does not open it', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'proc1').getByTestId('invoice-inbox-document-proc1').click();
    await expect(drawer(page)).toHaveCount(0);
    expect(state.reviewReads).toEqual([]);
  });

  test('previous / next walk the list skipping PROCESSING rows, with "n de total"', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'rdy1').getByTestId('invoice-inbox-document-rdy1').click();
    const position = page.getByTestId('invoice-inbox-review-position');
    await expect(position).toHaveText('1 de 4');
    await expect(page.getByTestId('invoice-inbox-review-prev')).toBeDisabled();
    await page.getByTestId('invoice-inbox-review-next').click();
    await expect(page.getByTestId('invoice-inbox-review-title')).toHaveText('rev1.pdf');
    await expect(position).toHaveText('2 de 4');
    await page.getByTestId('invoice-inbox-review-prev').click();
    await expect(page.getByTestId('invoice-inbox-review-title')).toHaveText('rdy1.pdf');
    expect(state.reviewReads).not.toContain('proc1');
  });

  test('next past the 50 loaded rows loads the next page (130 rows) and keeps going', async ({ page }) => {
    state.rows = Array.from({ length: 130 }, (_, i) => row(`b${String(i).padStart(3, '0')}`, 'READY'));
    await openInbox(page, state);
    await rowOf(page, 'b049').getByTestId('invoice-inbox-document-b049').click();
    await expect(page.getByTestId('invoice-inbox-review-position')).toHaveText('50 de 130');
    await page.getByTestId('invoice-inbox-review-next').click();
    await expect(page.getByTestId('invoice-inbox-review-title')).toHaveText('b050.pdf');
    await expect(page.getByTestId('invoice-inbox-review-position')).toHaveText('51 de 130');
  });

  test('walking stays inside the active filter', async ({ page }) => {
    await openInbox(page, state);
    await page.getByTestId('invoice-inbox-filter-pending').click();
    await rowOf(page, 'rev2').getByTestId('invoice-inbox-document-rev2').click();
    await expect(page.getByTestId('invoice-inbox-review-position')).toHaveText('3 de 3');
    await expect(page.getByTestId('invoice-inbox-review-next')).toBeDisabled();
  });

  test('discard from the footer: one POST, the panel closes and the counters update', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'rev1').getByTestId('invoice-inbox-document-rev1').click();
    await expect(page.getByTestId('invoice-inbox-review-discard')).toBeVisible();
    await page.getByTestId('invoice-inbox-review-discard').click();
    await expect(page.getByTestId('invoice-inbox-discard-dialog')).toBeVisible();
    await page.getByTestId('invoice-inbox-discard-confirm').click();
    await expect(drawer(page)).toHaveCount(0);
    expect(state.writes).toEqual(['POST discard rev1']);
    await expect(page.getByTestId('invoice-inbox-filter-count-discarded')).toHaveText('1');
  });

  test('opening, walking and closing fire no write request', async ({ page }) => {
    await openInbox(page, state);
    await rowOf(page, 'rdy1').getByTestId('invoice-inbox-document-rdy1').click();
    await page.getByTestId('invoice-inbox-review-next').click();
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    expect(state.writes).toEqual([]);
  });

  test('states: ambiguous supplier, product chip toggle and the "not available" viewer', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'PENDING_REVIEW', {}, {
        header: {
          vendor: {
            state: 'ambiguous', extracted: { name: 'ACM SL', taxId: '' },
            candidates: [{ id: 'c1', name: 'ACME SL', taxId: 'B1', city: 'Madrid' }, { id: 'c2', name: 'ACME SA', taxId: 'A2', city: 'Sevilla' }],
          },
        },
        validation: { missing: ['vendor'] },
      }),
    };
    await openInbox(page, state);
    await rowOf(page, 'rev1').getByTestId('invoice-inbox-document-rev1').click();
    await expect(page.getByTestId('invoice-inbox-review-vendor-ambiguous-title')).toContainText('2 proveedores');
    await expect(page.getByTestId('invoice-inbox-review-vendor-likely-c1')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-review-vendor-likely-c2')).toHaveCount(0);
    await expect(page.getByTestId('invoice-inbox-review-vendor-in-document')).toContainText('sin NIF legible');
    await expect(page.getByTestId('invoice-inbox-review-pending')).toContainText('1 obligatorio pendiente');
    const chip = page.getByTestId('invoice-inbox-review-line-0-product');
    await expect(page.getByTestId('invoice-inbox-review-line-0-panel')).toHaveCount(0);
    await chip.click();
    await expect(page.getByTestId('invoice-inbox-review-line-0-panel')).toBeVisible();
    await chip.click();
    await expect(page.getByTestId('invoice-inbox-review-line-0-panel')).toHaveCount(0);
    await expect(page.getByTestId('invoice-inbox-review-viewer-empty')).toBeVisible();
  });

  test('states: confirmed shows the banner with the document number and no footer', async ({ page }) => {
    state.reviews = { conf1: review('conf1', 'CONFIRMED', { editable: false, invoice: { id: 'I1', documentNo: '10000007', identifier: '10000007 - 2026-08-10 - 121.00' } }) };
    await openInbox(page, state);
    await rowOf(page, 'conf1').getByTestId('invoice-inbox-document-conf1').click();
    await expect(page.getByTestId('invoice-inbox-review-banner-confirmed-title')).toHaveText('10000007 registrada en Etendo · Completada');
    await expect(page.getByTestId('invoice-inbox-review-footer')).toHaveCount(0);
  });

  test('states: total mismatch shows at the bottom only for a 2-cent difference', async ({ page }) => {
    state.reviews = {
      rdy1: review('rdy1', 'READY', {}, { header: { totalAmount: 121.01, totalSource: 'printed' } }),
      rev1: review('rev1', 'PENDING_REVIEW', {}, { header: { totalAmount: 121.02, totalSource: 'printed' } }),
    };
    await openInbox(page, state);
    await rowOf(page, 'rdy1').getByTestId('invoice-inbox-document-rdy1').click();
    await expect(page.getByTestId('invoice-inbox-review-form')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-review-banner-mismatch')).toHaveCount(0);
    await page.getByTestId('invoice-inbox-review-next').click();
    await expect(page.getByTestId('invoice-inbox-review-banner-mismatch')).toBeVisible();
  });

  test('states: foreign receiver is read-only with only Discard', async ({ page }) => {
    state.rows = [row('fr1', 'ERROR', { errorCode: 'FOREIGN_RECEIVER' })];
    state.reviews = { fr1: review('fr1', 'ERROR', { errorCode: 'FOREIGN_RECEIVER', editable: false }) };
    await openInbox(page, state);
    await rowOf(page, 'fr1').getByTestId('invoice-inbox-document-fr1').click();
    await expect(page.getByTestId('invoice-inbox-review-banner-error-FOREIGN_RECEIVER')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-review-discard')).toBeVisible();
    await expect(page.getByTestId('invoice-inbox-review-confirm')).toHaveCount(0);
  });

  test('a failed read shows the message and Retry reads again', async ({ page }) => {
    state.reviews = { rev1: { httpStatus: 500, body: { error: { code: 'internal' } } } };
    await openInbox(page, state);
    await rowOf(page, 'rev1').getByTestId('invoice-inbox-document-rev1').click();
    await expect(page.getByTestId('invoice-inbox-review-error')).toBeVisible();
    state.reviews = {};
    await page.getByTestId('invoice-inbox-review-retry').click();
    await expect(page.getByTestId('invoice-inbox-review-form')).toBeVisible();
    expect(state.reviewReads).toEqual(['rev1', 'rev1']);
  });
});
