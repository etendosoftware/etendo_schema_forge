// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxPage.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxTable.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxRowActions.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewDrawer.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewHeader.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewForm.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewVendor.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewLines.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewBanners.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewTotals.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxReviewModel.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMoney.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewFooter.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewNav.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReview.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewEditor.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewInputs.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewPickers.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewSaveStatus.jsx
// @covers tools/app-shell/src/components/contract-ui/InlineSearchCombo.jsx
// New file justification: invoice-inbox-upload-and-status.mocked.spec.js covers the list, uploads and
// discard of the window; the review panel is a different flow (open, walk, close, states) with its
// own mocked `review` action, so it gets its own spec instead of growing that one.
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Invoice Inbox — review panel (mocked). Opens from a row and from the pencil, walks previous /
 * next across the loaded rows (skipping PROCESSING, loading more past 50), closes with Escape /
 * outside click / X returning focus, discards from the footer and renders the main states of
 * the mocked `GET /header/{id}/action/review` answer. ETP-6050 S2 adds the edit flows against a
 * small stateful fake of `apply` / `mark-reviewed` (the contract of plan 9.2: the token travels in
 * the body, every answer is the review body of the saved row, the server recomputes the verdict and
 * the status). Routes are installed AFTER login().
 */

const SPEC = 'invoice-inbox';

const row = (id, status, extra = {}) => ({
  id, status, fileName: `${id}.pdf`, source: 'UPLOAD', created: '2026-08-10T09:30:00Z', ...extra,
});

function review(id, status = 'READY', over = {}, doc = {}) {
  const { header: headerOver, ...docRest } = doc;
  return {
    id, status, errorCode: null, reviewed: false, adjusted: false, editable: true, updated: 'T0',
    fileName: `${id}.pdf`, sender: 'ana@proveedor.com', source: 'EMAIL', created: '2026-08-10T09:30:00Z',
    invoice: null, currency: { id: 'EUR1', isoCode: 'EUR', symbol: '€', scale: 2 },
    document: {
      header: {
        vendor: { state: 'linked', matchedBy: 'taxId', details: { name: 'ACME SL', taxId: 'B1234', city: 'Madrid' }, candidates: [], extracted: {} },
        documentNo: `N-${id}`, invoiceDate: '2026-08-01', totalAmount: 121, totalSource: 'lines',
        duplicate: { state: 'none', invoices: [], inbox: [] },
        ...headerOver,
      },
      lines: [{ index: 0, description: 'Widget', quantity: 2, unitPrice: 50, taxRate: 21, tax: { state: 'resolved', matchedBy: 'rate', id: 'T21', name: 'IVA 21%', rate: 21, docTaxAmount: 'D' }, product: { state: 'linked', matchedBy: 'exact', details: { name: 'Widget A', searchKey: 'W-1' } } }],
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

// ── Fake of `apply` / `mark-reviewed` (independent of the SPA's optimistic copy) ─────────────────

/** The tax selector's catalogue (`C_Tax_ID`): the options carry no rate, as the real selector may not expose one. */
const TAXES = {
  T21: { name: 'IVA 21%', rate: 21 }, T10: { name: 'IVA 10%', rate: 10 }, T4: { name: 'IVA 4%', rate: 4 },
};

const refusal = (status, code, extra = {}) => ({ status, body: { error: { code, status, ...extra } } });

/** The validator's verdict (plan 9.2.4 / 9.2.5), reduced to what these flows touch. */
function missingOf(doc) {
  const missing = [];
  const vendor = doc.header.vendor ?? {};
  if (vendor.state === 'linked' || (vendor.state === 'new' && String(vendor.extracted?.name ?? '').trim())) {
    // resolved
  } else {
    missing.push('vendor');
  }
  if (!doc.header.invoiceDate) missing.push('invoiceDate');
  if (!doc.lines.length) missing.push('lines');
  doc.lines.forEach((l) => {
    const product = l.product ?? {};
    const fresh = product.new ?? {};
    const productOk = product.state === 'linked'
      || (product.state === 'new' && String(fresh.name ?? l.description ?? '').trim() && fresh.categoryId && fresh.uomId);
    if (!productOk) missing.push(`line[${l.index}].product`);
    if (l.taxRate == null) missing.push(`line[${l.index}].tax`);
    if (l.quantity == null) missing.push(`line[${l.index}].quantity`);
    if (l.unitPrice == null) missing.push(`line[${l.index}].unitPrice`);
  });
  return missing;
}

function applyOp(doc, op, catalog) {
  const { header } = doc;
  const lineAt = (index) => doc.lines.find((l) => l.index === index);
  const named = (list, id) => (list ?? []).find((item) => item.id === id);
  switch (op.op) {
    case 'setHeader':
      if ('documentNo' in op) header.documentNo = op.documentNo;
      if ('invoiceDate' in op) { if (op.invoiceDate) header.invoiceDate = op.invoiceDate; else delete header.invoiceDate; }
      break;
    case 'setLine': {
      const l = lineAt(op.index);
      for (const k of ['description', 'quantity', 'unitPrice']) if (k in op) l[k] = op[k];
      if ('taxRate' in op) { l.taxRate = op.taxRate; l.tax = op.taxRate == null ? null : { state: 'resolved', rate: op.taxRate }; }
      if ('taxId' in op) {
        const chosen = TAXES[op.taxId];
        l.taxRate = chosen.rate;
        l.tax = { state: 'resolved', matchedBy: 'manual', id: op.taxId, name: chosen.name, rate: chosen.rate, docTaxAmount: chosen.docTaxAmount ?? 'D' };
      }
      if ('discount' in op) { if (!op.discount) delete l.discount; else l.discount = op.discount; }
      break;
    }
    case 'addLine': {
      const prev = doc.lines.at(-1);
      doc.lines.push({
        index: Math.max(-1, ...doc.lines.map((l) => l.index)) + 1, description: '', quantity: 1, unitPrice: 0,
        ...(prev?.taxRate == null ? {} : { taxRate: prev.taxRate, tax: { state: 'resolved', rate: prev.taxRate } }),
        product: { state: 'none', candidates: [] },
      });
      break;
    }
    case 'removeLine':
      doc.lines = doc.lines.filter((l) => l.index !== op.index);
      break;
    case 'selectVendor': {
      const found = named(header.vendor.candidates, op.id) ?? named(catalog.vendors, op.id);
      header.vendor = {
        state: 'linked', matchedBy: 'manual', id: op.id, candidates: header.vendor.candidates ?? [], extracted: header.vendor.extracted ?? {},
        details: { name: found.name, taxId: found.taxId, city: found.city },
      };
      break;
    }
    case 'newVendor': {
      const { candidates = [], extracted = {} } = header.vendor;
      header.vendor = { state: 'new', candidates, extracted: { ...extracted, ...(op.fields ?? {}) } };
      break;
    }
    case 'selectProduct': {
      const l = lineAt(op.index);
      const found = named(l.product.candidates, op.id) ?? named(catalog.products, op.id);
      l.product = { state: 'linked', matchedBy: 'manual', id: op.id, candidates: l.product.candidates ?? [], details: { name: found.name, searchKey: found.searchKey } };
      break;
    }
    case 'newProduct': {
      const l = lineAt(op.index);
      const fresh = { name: l.description, ...(l.product.new ?? {}) };
      if ('name' in op) fresh.name = op.name;
      if ('categoryId' in op) { fresh.categoryId = op.categoryId; fresh.category = named(catalog.categories, op.categoryId)?.name; }
      if ('uomId' in op) { fresh.uomId = op.uomId; fresh.uom = named(catalog.uoms, op.uomId)?.name; }
      l.product = { state: 'new', id: null, candidates: l.product.candidates ?? [], new: fresh };
      break;
    }
    default:
      throw new Error(`fake server: unknown op ${op.op}`);
  }
}

/** Runs the 9.2.5 recompute that the flows can see: verdict, status, token, ADJUSTED. */
function settle(doc, { adjusted }) {
  doc.document.validation = { missing: missingOf(doc.document) };
  if (['PENDING_REVIEW', 'READY', 'ERROR'].includes(doc.status) && doc.errorCode !== 'FOREIGN_RECEIVER') {
    const valid = doc.document.validation.missing.length === 0;
    doc.status = valid ? 'PENDING_REVIEW' : 'ERROR';
    doc.errorCode = valid ? null : 'MISSING_FIELDS';
    doc.reviewed = false;
  }
  if (adjusted) doc.adjusted = true;
}

async function handleWrite(state, id, kind, body) {
  const doc = state.docs[id];
  state.log.push(`POST ${kind} ${id}`);
  if (state.hold) await state.hold;
  const forced = state.refuse?.(kind, body);
  if (forced) return forced;
  if (!doc) return refusal(404, 'not_found');
  if (body.updated !== doc.updated) return refusal(409, 'stale_document');
  if (['CONFIRMED', 'DISCARDED'].includes(doc.status) || doc.editable === false) return refusal(409, 'not_editable', { documentStatus: doc.status });
  if (kind === 'apply') {
    const working = structuredClone(doc);
    for (const op of body.operations) applyOp(working.document, op, state.catalog);
    settle(working, { adjusted: true });
    working.updated = `T${++state.tokens}`;
    state.docs[id] = working;
    return { status: 200, body: working };
  }
  if (doc.status === 'READY') return { status: 200, body: doc };
  if (doc.status !== 'PENDING_REVIEW') return refusal(409, 'not_reviewable', { documentStatus: doc.status });
  const missing = missingOf(doc.document);
  if (missing.length) {
    // The server stores the verdict: the row moves to ERROR with a NEW token, both answered in the refusal.
    const stored = { ...structuredClone(doc), status: 'ERROR', errorCode: 'MISSING_FIELDS', updated: `T${++state.tokens}` };
    stored.document.validation = { missing };
    state.docs[id] = stored;
    return refusal(422, 'not_valid', { missing, documentStatus: 'ERROR', updated: stored.updated });
  }
  const next = { ...structuredClone(doc), status: 'READY', reviewed: true, updated: `T${++state.tokens}` };
  state.docs[id] = next;
  return { status: 200, body: next };
}

const CATALOG = {
  vendors: [{ id: 'V9', name: 'Proveedor Nuevo SA', taxId: 'A9', city: 'Leon' }],
  products: [{ id: 'P9', name: 'Tornillo M8', searchKey: 'TM8' }],
  categories: [{ id: 'C1', name: 'Ferretería' }, { id: 'C2', name: 'Oficina' }],
  uoms: [{ id: 'U1', name: 'Caja' }, { id: 'U2', name: 'Unidad' }],
  taxes: Object.entries(TAXES).map(([id, tax]) => ({ id, name: tax.name })),
};
const SELECTOR_LISTS = { C_Tax_ID: 'taxes', C_BPartner_ID: 'vendors', M_Product_ID: 'products', M_Product_Category_ID: 'categories', C_UOM_ID: 'uoms', C_Country_ID: 'categories' };

async function installSelectors(page, state) {
  await page.route('**/selectors/**', async (route) => {
    const url = new URL(route.request().url());
    (state.selectorUrls ??= []).push(url.href);
    const column = url.pathname.split('/selectors/')[1];
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = (state.catalog[SELECTOR_LISTS[column]] ?? [])
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .map((item) => ({ ...item, label: item.name }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, hasMore: false }) });
  });
}

async function installInboxMock(page, state) {
  state.reviewReads = [];
  state.writes = [];
  state.log = [];
  state.docs = {};
  state.tokens = 0;
  state.catalog = CATALOG;
  /** The live document of an id: the seeded one (`state.reviews`) or the default review. */
  const live = (id) => (state.docs[id] ??= structuredClone(state.reviews?.[id] ?? review(id)));
  await installSelectors(page, state);
  await page.route(`**/sws/neo/${SPEC}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const reviewMatch = url.pathname.match(/\/header\/([^/]+)\/action\/review$/);
    if (req.method() === 'GET' && reviewMatch) {
      const id = decodeURIComponent(reviewMatch[1]);
      state.reviewReads.push(id);
      state.log.push(`GET review ${id}`);
      const custom = state.reviews?.[id];
      if (custom?.httpStatus) { await json(custom.httpStatus, custom.body); return; }
      await json(200, live(id));
      return;
    }
    const write = url.pathname.match(/\/header\/([^/]+)\/action\/(apply|mark-reviewed)$/);
    if (req.method() === 'POST' && write) {
      const id = decodeURIComponent(write[1]);
      live(id);
      const result = await handleWrite(state, id, write[2], req.postDataJSON());
      state.applied = [...(state.applied ?? []), { id, kind: write[2], body: req.postDataJSON(), status: result.status }];
      await json(result.status, result.body);
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

// ── ETP-6050 S2: editing, autosave, resolution of vendor / product, mark as reviewed ──────────────

const tid = (page, id) => page.getByTestId(id);
const applied = (state) => (state.applied ?? []).filter((w) => w.kind === 'apply');
const ops = (state) => applied(state).flatMap((w) => w.body.operations);

/** Types into an autosaving cell and leaves it: the blur commits. */
async function typeInto(page, testId, text) {
  const input = tid(page, testId);
  await input.fill(text);
  await input.blur();
}

async function openDoc(page, state, id, filter = null) {
  await openInbox(page, state);
  if (filter) await page.getByTestId(`invoice-inbox-filter-${filter}`).click();
  await rowOf(page, id).getByTestId(`invoice-inbox-document-${id}`).click();
  await expect(tid(page, 'invoice-inbox-review-form')).toBeVisible();
}

const ambiguousVendorDoc = () => review('rev1', 'ERROR', { errorCode: 'MISSING_FIELDS' }, {
  header: {
    vendor: {
      state: 'ambiguous', extracted: { name: 'ACM SL', taxId: 'B1' },
      candidates: [{ id: 'c1', name: 'ACME SL', taxId: 'B1', city: 'Madrid' }, { id: 'c2', name: 'ACME SA', taxId: 'A2', city: 'Sevilla' }],
    },
  },
  validation: { missing: ['vendor'] },
});

test.describe('Invoice Inbox — review panel editing (S2)', () => {
  let state;
  test.beforeEach(() => { state = { rows: seedRows() }; });

  test('correcting a quantity saves with the token in the body and shows Guardado; amounts follow', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '3');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'saved');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveText('Guardado');
    expect(applied(state)).toHaveLength(1);
    expect(applied(state)[0].body).toEqual({ updated: 'T0', operations: [{ op: 'setLine', index: 0, quantity: 3 }] });
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).toContainText('150,00');
    await expect(tid(page, 'invoice-inbox-review-totals')).toContainText('181,50');
    // The next edit carries the token of the previous answer.
    await typeInto(page, 'invoice-inbox-review-invoice-no', 'F-9');
    await expect.poll(() => applied(state).length).toBe(2);
    expect(applied(state)[1].body.updated).toBe('T1');
  });

  test('typing and waiting saves by itself after the pause', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    await tid(page, 'invoice-inbox-review-invoice-no').fill('F-DEBOUNCE');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'saved');
    expect(ops(state)).toEqual([{ op: 'setHeader', documentNo: 'F-DEBOUNCE' }]);
  });

  test('a line discount changes the amount, the VAT and the total (fixture case 3 x 100 less 10 %)', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'PENDING_REVIEW', {}, {
        lines: [{ index: 0, description: 'Widget', quantity: 3, unitPrice: 100, taxRate: 21, product: { state: 'linked', matchedBy: 'exact', details: { name: 'W', searchKey: 'W-1' } } }],
      }),
    };
    await openDoc(page, state, 'rev1');
    await typeInto(page, 'invoice-inbox-review-line-0-discount', '10');
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).toContainText('270,00');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'saved');
    await expect(tid(page, 'invoice-inbox-review-totals')).toContainText('56,70');
    await expect(tid(page, 'invoice-inbox-review-totals')).toContainText('326,70');
    expect(ops(state)).toEqual([{ op: 'setLine', index: 0, discount: 10 }]);
    // A thousands-grouped text is refused in the cell and never reaches the server.
    await typeInto(page, 'invoice-inbox-review-line-0-discount', '1.000,50');
    await expect(tid(page, 'invoice-inbox-review-line-0-discount')).toHaveValue('10%');
    expect(ops(state)).toHaveLength(1);
  });

  test('add then remove lines: stable indexes in the operations', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'PENDING_REVIEW', {}, {
        lines: [
          { index: 0, description: 'Uno', quantity: 1, unitPrice: 10, taxRate: 21, product: { state: 'linked', details: { name: 'A' } } },
          { index: 3, description: 'Dos', quantity: 1, unitPrice: 20, taxRate: 10, product: { state: 'linked', details: { name: 'B' } } },
        ],
      }),
    };
    await openDoc(page, state, 'rev1');
    await tid(page, 'invoice-inbox-review-add-line').click();
    await expect(tid(page, 'invoice-inbox-review-lines-title')).toHaveText('Líneas · 3');
    await expect(tid(page, 'invoice-inbox-review-line-2-description')).toBeFocused();
    await expect(tid(page, 'invoice-inbox-review-line-2-tax')).toHaveValue('10%');
    await tid(page, 'invoice-inbox-review-line-0').hover();
    await tid(page, 'invoice-inbox-review-line-delete-0').click();
    await expect(tid(page, 'invoice-inbox-review-lines-title')).toHaveText('Líneas · 2');
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '5');
    await expect.poll(() => ops(state).length).toBe(3);
    expect(ops(state)).toEqual([
      { op: 'addLine' }, { op: 'removeLine', index: 0 }, { op: 'setLine', index: 3, quantity: 5 },
    ]);
  });

  test('ambiguous supplier: choosing a candidate links it and clears the pending counter', async ({ page }) => {
    state.reviews = { rev1: ambiguousVendorDoc() };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-pending')).toContainText('1 obligatorio pendiente');
    await tid(page, 'invoice-inbox-review-vendor-candidate-c2').click();
    await expect(tid(page, 'invoice-inbox-review-vendor')).toHaveAttribute('data-state', 'linked');
    await expect(tid(page, 'invoice-inbox-review-vendor-name')).toHaveText('ACME SA');
    await expect(tid(page, 'invoice-inbox-review-vendor-matched-by')).toHaveText('Elegido por ti');
    await expect(tid(page, 'invoice-inbox-review-pending')).toHaveText('');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeEnabled();
    expect(ops(state)).toEqual([{ op: 'selectVendor', id: 'c2' }]);
  });

  test('supplier search: the portaled results can be clicked inside the modal drawer', async ({ page }) => {
    state.reviews = { rev1: ambiguousVendorDoc() };
    await openDoc(page, state, 'rev1');
    const search = tid(page, 'invoice-inbox-review-vendor-search').getByTestId('inline-add-field-inbox-vendor');
    await search.click();
    await tid(page, 'inline-add-option-inbox-vendor-V9').click();
    await expect(tid(page, 'invoice-inbox-review-vendor-name')).toHaveText('Proveedor Nuevo SA');
    expect(ops(state)).toEqual([{ op: 'selectVendor', id: 'V9' }]);
  });

  test('new supplier: create it from the extracted data, then edit its fields', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'ERROR', { errorCode: 'MISSING_FIELDS' }, {
        header: { vendor: { state: 'none', extracted: { name: 'Nuevo SL', taxId: 'X1', city: 'Paris' } } },
        validation: { missing: ['vendor'] },
      }),
    };
    await openDoc(page, state, 'rev1');
    await tid(page, 'invoice-inbox-review-vendor-create-new').click();
    await expect(tid(page, 'invoice-inbox-review-vendor')).toHaveAttribute('data-state', 'new');
    await expect(tid(page, 'invoice-inbox-review-vendor-new-name')).toHaveValue('Nuevo SL');
    await typeInto(page, 'invoice-inbox-review-vendor-new-city', 'Lyon');
    await expect.poll(() => ops(state).length).toBe(2);
    expect(ops(state)).toEqual([{ op: 'newVendor' }, { op: 'newVendor', fields: { city: 'Lyon' } }]);
    await expect(tid(page, 'invoice-inbox-review-vendor-new-city')).toHaveValue('Lyon');
    await expect(tid(page, 'invoice-inbox-review-pending')).toHaveText('');
  });

  test('ambiguous product: choosing a candidate links the line product', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'ERROR', { errorCode: 'MISSING_FIELDS' }, {
        lines: [{
          index: 0, description: 'Tornillo', quantity: 1, unitPrice: 5, taxRate: 21,
          product: { state: 'ambiguous', candidates: [{ id: 'p1', name: 'Tornillo A', searchKey: 'TA' }, { id: 'p2', name: 'Tornillo B', searchKey: 'TB' }] },
        }],
        validation: { missing: ['line[0].product'] },
      }),
    };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-line-0-panel')).toBeVisible();
    await tid(page, 'invoice-inbox-review-line-0-candidate-p2').click();
    await expect(tid(page, 'invoice-inbox-review-line-0-product')).toHaveAttribute('data-state', 'ok');
    await expect(tid(page, 'invoice-inbox-review-line-0-product-name')).toHaveText('Tornillo B');
    await expect(tid(page, 'invoice-inbox-review-pending')).toHaveText('');
    expect(ops(state)).toEqual([{ op: 'selectProduct', index: 0, id: 'p2' }]);
  });

  test('new product: name, then category and unit from the pickers, until the line is complete', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'ERROR', { errorCode: 'MISSING_FIELDS' }, {
        lines: [{ index: 0, description: 'Tornillo', quantity: 1, unitPrice: 5, taxRate: 21, product: { state: 'none', candidates: [] } }],
        validation: { missing: ['line[0].product'] },
      }),
    };
    await openDoc(page, state, 'rev1');
    await tid(page, 'invoice-inbox-review-line-0-product').click();
    await tid(page, 'invoice-inbox-review-line-0-create-new').click();
    await expect(tid(page, 'invoice-inbox-review-line-0-new-name')).toHaveValue('Tornillo');
    await expect(tid(page, 'invoice-inbox-review-line-0-new-error')).toBeVisible();
    await typeInto(page, 'invoice-inbox-review-line-0-new-name', 'Tornillo M8');
    await tid(page, 'invoice-inbox-review-line-0-new-category').getByTestId('inline-add-field-inbox-line-0-category').click();
    await tid(page, 'inline-add-option-inbox-line-0-category-C1').click();
    await expect(tid(page, 'invoice-inbox-review-line-0-new-category')).toContainText('Ferretería');
    await expect(tid(page, 'invoice-inbox-review-line-0-new-error')).toBeVisible();
    await tid(page, 'invoice-inbox-review-line-0-new-uom').getByTestId('inline-add-field-inbox-line-0-uom').click();
    await tid(page, 'inline-add-option-inbox-line-0-uom-U1').click();
    await expect(tid(page, 'invoice-inbox-review-line-0-new-uom')).toContainText('Caja');
    await expect(tid(page, 'invoice-inbox-review-line-0-new-error')).toHaveCount(0);
    await expect(tid(page, 'invoice-inbox-review-pending')).toHaveText('');
    expect(ops(state)).toEqual([
      { op: 'newProduct', index: 0 },
      { op: 'newProduct', index: 0, name: 'Tornillo M8' },
      { op: 'newProduct', index: 0, categoryId: 'C1' },
      { op: 'newProduct', index: 0, uomId: 'U1' },
    ]);
    // The category picker reopens on the committed value.
    await tid(page, 'invoice-inbox-review-line-0-new-category').getByTestId('inline-add-field-inbox-line-0-category-chip').click();
    await expect(tid(page, 'inline-add-option-inbox-line-0-category-C1')).toHaveAttribute('aria-selected', 'true');
  });

  test('mark as reviewed: READY and "Revisada por ti", Confirm stays disabled; an edit afterwards goes back to pending', async ({ page }) => {
    state.reviews = { rev1: review('rev1', 'PENDING_REVIEW') };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeEnabled();
    await tid(page, 'invoice-inbox-review-mark-reviewed').click();
    await expect(tid(page, 'invoice-inbox-review-reviewed')).toHaveText('Revisada por ti');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toHaveCount(0);
    await expect(tid(page, 'invoice-inbox-review-confirm')).toBeDisabled();
    const marks = (state.applied ?? []).filter((w) => w.kind === 'mark-reviewed');
    expect(marks).toHaveLength(1);
    expect(marks[0].body).toEqual({ updated: 'T0' });
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '4');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeVisible();
    await expect(tid(page, 'invoice-inbox-review-reviewed')).toHaveCount(0);
    expect(applied(state)[0].body.updated).toBe('T1');
  });

  test('mark as reviewed is disabled while a mandatory piece is missing', async ({ page }) => {
    state.reviews = { rev1: ambiguousVendorDoc() };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeDisabled();
  });

  test('409 stale_document: the document reloads, the unsaved edit is dropped and a notice shows', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    // Someone else changed the document: the server copy moved (new token, quantity 11).
    state.docs.rev1.updated = 'T77';
    state.docs.rev1.document.lines[0].quantity = 11;
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '9');
    await expect(tid(page, 'invoice-inbox-review-notice')).toBeVisible();
    await expect(tid(page, 'invoice-inbox-review-notice')).toContainText('El documento cambió mientras lo editabas');
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).toHaveValue('11');
    expect(applied(state).map((w) => w.status)).toEqual([409]);
    await tid(page, 'invoice-inbox-review-notice-dismiss').click();
    await expect(tid(page, 'invoice-inbox-review-notice')).toHaveCount(0);
    // The reload brought the new token: the next edit goes through.
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '12');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'saved');
    expect(applied(state).at(-1).body.updated).toBe('T77');
  });

  test('422 invalid_value: the value goes back, the reason shows and Reintentar clears it', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    state.refuse = () => refusal(422, 'invalid_value', { field: 'quantity', index: 0 });
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '9');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'error');
    await expect(tid(page, 'invoice-inbox-review-save-error')).toContainText('El valor no es válido');
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).toHaveValue('2');
    state.refuse = undefined;
    await tid(page, 'invoice-inbox-review-save-retry').click();
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveCount(0);
  });

  test('closing while a save is open waits for it, then closes', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    let release;
    state.hold = new Promise((resolve) => { release = resolve; });
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '6');
    await expect.poll(() => state.log.filter((l) => l === 'POST apply rev1').length).toBe(1);
    await tid(page, 'invoice-inbox-review-close').click();
    await page.waitForTimeout(400);
    await expect(drawer(page)).toBeVisible();
    state.hold = null;
    release();
    await expect(drawer(page)).toHaveCount(0);
    expect(applied(state)).toHaveLength(1);
  });

  test('next with a value still being typed saves it first, then reads the next document', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    await tid(page, 'invoice-inbox-review-line-0-quantity').fill('8');
    await tid(page, 'invoice-inbox-review-next').click();
    await expect(tid(page, 'invoice-inbox-review-title')).toHaveText('rev2.pdf');
    await expect.poll(() => state.log.includes('GET review rev2')).toBe(true);
    const log = state.log.filter((l) => l !== 'GET review rev1');
    expect(log.indexOf('POST apply rev1')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('POST apply rev1')).toBeLessThan(log.indexOf('GET review rev2'));
    expect(ops(state)).toEqual([{ op: 'setLine', index: 0, quantity: 8 }]);
  });

  test('a failed save keeps the panel on the document when moving on', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    state.refuse = () => refusal(422, 'invalid_value');
    await tid(page, 'invoice-inbox-review-line-0-quantity').fill('8');
    await tid(page, 'invoice-inbox-review-next').click();
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'error');
    await expect(tid(page, 'invoice-inbox-review-title')).toHaveText('rev1.pdf');
  });

  for (const [name, over, code] of [
    ['CONFIRMED', { editable: false, invoice: { id: 'I1', documentNo: '10000007', identifier: '10000007' } }, null],
    ['DISCARDED', { editable: false }, null],
    ['FOREIGN_RECEIVER', { editable: false, errorCode: 'FOREIGN_RECEIVER' }, 'FOREIGN_RECEIVER'],
  ]) {
    test(`${name} is read only: nothing editable and no write`, async ({ page }) => {
      const status = name === 'FOREIGN_RECEIVER' ? 'ERROR' : name;
      state.rows = [row('ro1', status, code ? { errorCode: code } : {})];
      state.reviews = { ro1: review('ro1', status, over) };
      await openDoc(page, state, 'ro1', name === 'DISCARDED' ? 'discarded' : null);
      await expect(tid(page, 'invoice-inbox-review-add-line')).toHaveCount(0);
      await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toHaveCount(0);
      const quantity = page.getByTestId('invoice-inbox-review-line-0-quantity');
      if (await quantity.count()) await expect(quantity).toHaveAttribute('readonly', '');
      await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveCount(0);
      expect(state.applied ?? []).toEqual([]);
    });
  }

  test('at 768 px the lines stack, nothing scrolls sideways and the cells still save', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-line-0')).toHaveAttribute('data-layout', 'stacked');
    await expect(tid(page, 'invoice-inbox-review-lines-head')).toHaveCount(0);
    const overflow = await tid(page, 'invoice-inbox-review-scroll').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageOverflow).toBeLessThanOrEqual(0);
    const description = await tid(page, 'invoice-inbox-review-line-0-description').boundingBox();
    expect(description.width).toBeGreaterThan(120);
    await typeInto(page, 'invoice-inbox-review-line-0-discount', '5');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'saved');
    expect(ops(state)).toEqual([{ op: 'setLine', index: 0, discount: 5 }]);
  });
});

// ── ETP-6050 S2 addenda: tax selector, currency scale, validator codes, refusals ───────────────────

/**
 * Replaces the text of a cell whose focused (plain) text differs from its display text (the price:
 * "100,00 €" becomes "100" on focus). `fill` selects the DISPLAY text and the swap on focus moves the
 * caret, so the typed text would land inside the plain one; select what is there once focused instead.
 */
async function retype(page, testId, text) {
  const input = tid(page, testId);
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.pressSequentially(text);
  await input.blur();
}

const lineOf = (over = {}) => ({
  index: 0, description: 'Widget', quantity: 2, unitPrice: 50, taxRate: 21,
  tax: { state: 'resolved', matchedBy: 'rate', id: 'T21', name: 'IVA 21%', rate: 21, docTaxAmount: 'D' },
  product: { state: 'linked', matchedBy: 'exact', details: { name: 'Widget A', searchKey: 'W-1' } },
  ...over,
});

test.describe('Invoice Inbox — review panel: tax, currency scale and validator codes (S2 addenda)', () => {
  let state;
  test.beforeEach(() => { state = { rows: seedRows() }; });

  test('picking a tax by id: the rate shows "…" until the server answers, then the VAT row and the total follow', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-line-0-tax')).toHaveValue('21%');
    let release;
    state.hold = new Promise((resolve) => { release = resolve; });
    await tid(page, 'invoice-inbox-review-line-0-tax-picker').getByTestId('inline-add-field-inbox-line-0-tax-chip').click();
    await tid(page, 'inline-add-option-inbox-line-0-tax-T10').click();
    await expect(tid(page, 'invoice-inbox-review-line-0-tax')).toHaveValue('…');
    await expect(tid(page, 'invoice-inbox-review-total-tax-21')).toHaveCount(0);
    state.hold = null;
    release();
    await expect(tid(page, 'invoice-inbox-review-line-0-tax')).toHaveValue('10%');
    await expect(tid(page, 'invoice-inbox-review-total-tax-10')).toContainText('10,00');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('110,00');
    expect(ops(state)).toEqual([{ op: 'setLine', index: 0, taxId: 'T10' }]);
    // The selector was asked for the purchase side and the document date.
    const url = new URL(state.selectorUrls.find((u) => u.includes('C_Tax_ID')));
    expect(url.searchParams.get('isSOTrx')).toBe('N');
    expect(url.searchParams.get('DateInvoiced')).toBeTruthy();
    // Re-picking the tax already chosen writes nothing.
    await tid(page, 'invoice-inbox-review-line-0-tax-picker').getByTestId('inline-add-field-inbox-line-0-tax-chip').click();
    await tid(page, 'inline-add-option-inbox-line-0-tax-T10').click();
    await page.waitForTimeout(300);
    expect(ops(state)).toHaveLength(1);
  });

  test('a new line inherits the previous line tax by id: addLine, then setLine {taxId}', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    await tid(page, 'invoice-inbox-review-add-line').click();
    await expect.poll(() => ops(state).length).toBe(2);
    expect(ops(state)).toEqual([{ op: 'addLine' }, { op: 'setLine', index: 1, taxId: 'T21' }]);
    await expect(tid(page, 'invoice-inbox-review-line-1-tax')).toHaveValue('21%');
  });

  test('a USD document (2 decimals) and a JPY one (0 decimals) format lines and totals with their scale; the badge is read-only', async ({ page }) => {
    state.rows = [row('usd1', 'PENDING_REVIEW'), row('jpy1', 'PENDING_REVIEW')];
    state.reviews = {
      usd1: review('usd1', 'PENDING_REVIEW', { currency: { id: 'USD1', isoCode: 'USD', symbol: '$', scale: 2 } }, {
        lines: [lineOf({ quantity: 3, unitPrice: 1234.5 })],
      }),
      jpy1: review('jpy1', 'PENDING_REVIEW', { currency: { id: 'JPY1', isoCode: 'JPY', symbol: '¥', scale: 0 } }, {
        lines: [lineOf({ quantity: 3, unitPrice: 1234 })],
      }),
    };
    await openDoc(page, state, 'usd1');
    await expect(tid(page, 'currency-rate-readonly')).toContainText('USD');
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).toContainText('3.703,50');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('4.481,24');
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    await rowOf(page, 'jpy1').getByTestId('invoice-inbox-document-jpy1').click();
    await expect(tid(page, 'invoice-inbox-review-title')).toHaveText('jpy1.pdf');
    await expect(tid(page, 'currency-rate-readonly')).toContainText('JPY');
    // 3 x 1.234 = 3.702; VAT 21 % = 777,42 -> 777; total 4.479: whole units only.
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).toContainText('3.702');
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).not.toContainText(',');
    await expect(tid(page, 'invoice-inbox-review-total-tax-21')).toContainText('777');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('4.479');
    await expect(tid(page, 'invoice-inbox-review-total')).not.toContainText(',');
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '4');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('5.973');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'saved');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('5.973');
  });

  test('a line-based (L) tax document shows its own "por línea" row next to the document-based one', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'PENDING_REVIEW', {}, {
        lines: [
          lineOf({ index: 0, quantity: 1, unitPrice: 100, taxRate: 10, tax: { state: 'resolved', id: 'T10', name: 'IVA 10%', rate: 10, docTaxAmount: 'D' } }),
          lineOf({ index: 1, description: 'Servicio', quantity: 1, unitPrice: 50, taxRate: 10, tax: { state: 'resolved', id: 'T10', name: 'IVA 10%', rate: 10, docTaxAmount: 'L' } }),
        ],
      }),
    };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-total-tax-10')).toContainText('10,00');
    await expect(tid(page, 'invoice-inbox-review-total-tax-10-L')).toContainText('5,00');
    await expect(tid(page, 'invoice-inbox-review-total-tax-10-L-label')).toContainText('por línea');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('165,00');
  });

  test('a negative line (credit) keeps its sign in the line and the totals, and does not block Marcar como revisada', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'PENDING_REVIEW', {}, {
        lines: [lineOf({ quantity: -1, unitPrice: 100 })],
      }),
    };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).toContainText('-100,00');
    await expect(tid(page, 'invoice-inbox-review-total')).toContainText('-121,00');
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeEnabled();
    await retype(page, 'invoice-inbox-review-line-0-price', '-5');
    await expect.poll(() => ops(state).length).toBe(1);
    expect(ops(state)).toEqual([{ op: 'setLine', index: 0, unitPrice: -5 }]);
    await expect(tid(page, 'invoice-inbox-review-line-0-amount')).toContainText('5,00');
  });

  test('a missing quantity is a red cell, counted in the footer and under the table, until it is filled', async ({ page }) => {
    state.reviews = {
      rev1: review('rev1', 'ERROR', { errorCode: 'MISSING_FIELDS' }, {
        lines: [lineOf({ quantity: null })],
        validation: { missing: ['line[0].quantity'] },
      }),
    };
    await openDoc(page, state, 'rev1');
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(tid(page, 'invoice-inbox-review-lines-error')).toContainText('Indica la cantidad de todas las líneas');
    await expect(tid(page, 'invoice-inbox-review-pending')).toContainText('1 obligatorio pendiente');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeDisabled();
    await expect(tid(page, 'invoice-inbox-review-total-base')).toContainText('0,00');
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '3');
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(tid(page, 'invoice-inbox-review-lines-error')).toHaveCount(0);
    await expect(tid(page, 'invoice-inbox-review-pending')).toHaveText('');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeEnabled();
    await expect(tid(page, 'invoice-inbox-review-total-base')).toContainText('150,00');
    expect(ops(state)).toEqual([{ op: 'setLine', index: 0, quantity: 3 }]);
  });

  test('mark as reviewed answered 422 not_valid: the codes and the new token are adopted without a re-read, and fixing it then works', async ({ page }) => {
    // A stale verdict: the stored one says valid, the server recomputes and finds the quantity missing.
    state.reviews = {
      rev1: review('rev1', 'PENDING_REVIEW', {}, { lines: [lineOf({ quantity: null })], validation: { missing: [] } }),
    };
    await openDoc(page, state, 'rev1');
    const readsBefore = state.reviewReads.length;
    await tid(page, 'invoice-inbox-review-mark-reviewed').click();
    await expect(tid(page, 'invoice-inbox-review-save-error')).toContainText('Faltan datos obligatorios');
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(tid(page, 'invoice-inbox-review-pending')).toContainText('1 obligatorio pendiente');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeDisabled();
    expect(state.reviewReads.length).toBe(readsBefore);
    const marks = () => (state.applied ?? []).filter((w) => w.kind === 'mark-reviewed');
    expect(marks()).toHaveLength(1);
    expect(marks()[0].status).toBe(422);
    // The fix carries the NEW token the refusal answered (T1), not the stale one.
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '2');
    await expect.poll(() => applied(state).length).toBe(1);
    expect(applied(state)[0].body.updated).toBe('T1');
    await expect(tid(page, 'invoice-inbox-review-mark-reviewed')).toBeEnabled();
    await tid(page, 'invoice-inbox-review-mark-reviewed').click();
    await expect(tid(page, 'invoice-inbox-review-reviewed')).toHaveText('Revisada por ti');
    expect(marks()).toHaveLength(2);
  });

  test('a 403 without a code on a save reads "no permission", offers no Reintentar, and the value goes back', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    state.refuse = () => ({ status: 403, body: {} });
    await typeInto(page, 'invoice-inbox-review-line-0-quantity', '9');
    await expect(tid(page, 'invoice-inbox-review-save-state')).toHaveAttribute('data-state', 'error');
    await expect(tid(page, 'invoice-inbox-review-save-error')).toContainText('No tienes permiso para editar documentos de la bandeja');
    await expect(tid(page, 'invoice-inbox-review-save-retry')).toHaveCount(0);
    await expect(tid(page, 'invoice-inbox-review-line-0-quantity')).toHaveValue('2');
  });

  test('unknown_tax: the pick goes back to the previous tax and the translated reason shows', async ({ page }) => {
    await openDoc(page, state, 'rev1');
    state.refuse = () => refusal(422, 'unknown_tax', { field: 'taxId', index: 0 });
    await tid(page, 'invoice-inbox-review-line-0-tax-picker').getByTestId('inline-add-field-inbox-line-0-tax-chip').click();
    await tid(page, 'inline-add-option-inbox-line-0-tax-T4').click();
    await expect(tid(page, 'invoice-inbox-review-save-error')).toContainText('El impuesto elegido no está disponible para esta línea');
    await expect(tid(page, 'invoice-inbox-review-line-0-tax')).toHaveValue('21%');
  });
});
