// @covers tools/app-shell/src/components/contract-ui/GridViewControls.jsx
// @covers tools/app-shell/src/components/contract-ui/GridColumnHeaderControls.jsx
// @covers tools/app-shell/src/hooks/useGridView.js
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
// @covers tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Personal grid column views (resize / reorder / show-hide / explicit "Save view"), mocked.
 *
 * Spec chosen after `make find-tests` on GridViewControls / DataTable / ListView /
 * InlineLinesPanel: no Playwright spec covers the feature (only Vitest component tests), and the
 * closest specs (`lines-grid-narrow-viewport`, `sales-quotation-list-column-widths`) are about
 * default column geometry, not about personal views. Hence one new feature-named file.
 *
 * The feature sits behind the frontend flag `grid-column-views` (`GRID_COLUMN_VIEWS`), whose
 * shipped default is OFF. The flag is baked when Vite starts or builds (`VITE_FEATURE_FLAGS`, no
 * runtime override), so this file is split in two:
 *
 *  - "flag OFF" runs in every default run (CI, the push gate) and proves the feature is inert:
 *    no controls, no request to `/grid-views/`, no extra header handles, unchanged geometry.
 *  - "flag ON" skips itself unless the server was started with the flag on AND
 *    `E2E_GRID_COLUMN_VIEWS_FLAG=on` is exported (same pattern as
 *    `contacts/contacts-import-category-resolution.mocked.spec.js`).
 *
 *   # flag OFF (default) — the ON describe skips
 *   E2E_SUITE=mocked E2E_RETRIES=0 E2E_WORKERS=2 \
 *     E2E_MOCKED_SPECS="tests/flows/platform/grid-column-views.mocked.spec.js" ./scripts/run-e2e-full.sh
 *
 *   # flag ON — the OFF describe skips itself, the ON describe runs
 *   cd tools/app-shell && VITE_FEATURE_FLAGS='{"grid-column-views":true}' npx vite --port 3106
 *   cd e2e && E2E_USE_MOCK=1 BASE_URL=http://localhost:3106 E2E_GRID_COLUMN_VIEWS_FLAG=on \
 *     npx playwright test tests/flows/platform/grid-column-views.mocked.spec.js --project=mocked
 *   # or through the runner (the exported env reaches the build):
 *   VITE_FEATURE_FLAGS='{"grid-column-views":true}' E2E_GRID_COLUMN_VIEWS_FLAG=on E2E_SUITE=mocked \
 *     E2E_MOCKED_SPECS="tests/flows/platform/grid-column-views.mocked.spec.js" ./scripts/run-e2e-full.sh
 *
 * Run against plain `npx vite`/`make dev`, never `make dev-mock` — `VITE_MOCK=true` replaces
 * `window.fetch` in-page and silently bypasses every `page.route()` here.
 *
 * Surfaces: the sales-quotation LIST (ListView + DataTable, scope sales-quotation/quotation) and
 * the sales-invoice LINES grid (InlineLinesPanel, scope sales-invoice/lines — the quotation lines
 * have no two adjacent reorderable columns, so they cannot show a reorder). The save verb is PUT
 * (`useGridView.save`). While the add-row is open the lines grid suspends the personal view on
 * purpose (InlineLinesPanel `lineFormActive`), so add-row checks compare against the headers read
 * AFTER the add-row opened.
 */

const FLAG_ON = process.env.E2E_GRID_COLUMN_VIEWS_FLAG === 'on';

const VIEWPORT = { width: 1440, height: 900 };
const ROWS = [1, 2, 3].map((i) => ({
  id: `gcv-quot-${i}`,
  documentNo: `QUOT-000${i}`,
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  orderDate: '2026-10-20',
  validUntil: '2026-11-20',
  businessPartner: `bp-${i}`,
  'businessPartner$_identifier': `Cliente ${i} S.L.`,
  grandTotalAmount: 100 * i,
  processed: false,
}));

const HEADER_ID = 'gcv-sinv-detail-1';
const HEADER = {
  id: HEADER_ID,
  documentNo: 'SINV-GCV-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  businessPartner: 'bp-2',
  'businessPartner$_identifier': 'Cliente Ejemplo S.A.',
  transactionDocument: 'doc-type-ar-invoice',
  'transactionDocument$_identifier': 'AR Invoice',
  partnerAddress: 'addr-2',
  priceList: 'pl-2',
  paymentTerms: 'pt-1',
  paymentMethod: 'pm-1',
  invoiceDate: '2026-08-01',
  accountingDate: '2026-08-01', // requiredHeaderFields gate "Añadir línea" (the add-row)
  grandTotalAmount: 245.29,
  currency: 'eur-1',
  'currency$_identifier': 'EUR',
};
const LINES = [
  {
    id: 'gcv-line-1', product: 'prod-4', 'product$_identifier': 'Vino Tinto Reserva 750ml',
    description: 'Caja de 6 unidades', invoicedQuantity: 12, listPrice: 9.5,
    etgoDiscount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 137.94,
  },
  {
    id: 'gcv-line-2', product: 'prod-5', 'product$_identifier': 'Queso Manchego Curado 500g',
    description: 'Lote de temporada', invoicedQuantity: 8, listPrice: 11.75,
    etgoDiscount: 5, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 107.35,
  },
];
const LINE_KEYS = ['product', 'description', 'invoicedQuantity', 'uOM', 'listPrice', 'etgoDiscount', 'tax', 'grossAmount'];

const LIST_VIEW_URL = /\/sws\/neo\/grid-views\/sales-quotation\/quotation(\?|$)/;
const LINES_VIEW_URL = /\/sws\/neo\/grid-views\/sales-invoice\/lines(\?|$)/;
const LIST_KEYS = ['orderDate', 'documentNo', 'businessPartner', 'documentStatus', 'validUntil', 'grandTotalAmount'];

/**
 * Journal of every request that reaches `/grid-views/`. `store` is what GET answers (`null` →
 * 204, the "no saved view" answer); `saveStatus` is what PUT/POST answers (200 echoes the body).
 */
async function installGridViewsMock(page, { store = null, saveStatus = 200 } = {}) {
  const journal = { requests: [], saves: [], store };
  await page.route('**/sws/neo/grid-views/**', async (route) => {
    const req = route.request();
    journal.requests.push({ method: req.method(), url: req.url() });
    if (req.method() === 'GET') {
      if (journal.store == null) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(journal.store) });
    }
    if (req.method() === 'PUT' || req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}');
      journal.saves.push({ method: req.method(), url: req.url(), body });
      if (saveStatus !== 200) {
        return route.fulfill({ status: saveStatus, contentType: 'application/json', body: JSON.stringify({ error: { message: 'boom' } }) });
      }
      journal.store = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
  return journal;
}

async function installListMock(page) {
  await page.route('**/sws/neo/sales-quotation/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET' || !url.pathname.endsWith('/quotation')) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
    });
  });
}

/** Header route is registered after the lines route so the lines URL wins (LIFO). */
async function installDetailMocks(page) {
  await page.route(
    (url) => url.href.includes('/sws/neo/sales-invoice/header') && !url.href.includes('/lines'),
    async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() !== 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [HEADER] } }) });
      }
      const detail = url.match(/\/header\/([^/?]+)(\?.*)?$/);
      if (detail && !['evaluate-display', 'defaults', 'selectors'].includes(detail[1])) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [HEADER] } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [HEADER], totalRows: 1 } }) });
    },
  );
  await page.route(
    (url) => url.href.includes('/sws/neo/sales-invoice/lines'),
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: LINES, totalRows: LINES.length } }) });
    },
  );
  // Registered last (highest priority): the dependent partnerAddress selector self-heals to the
  // first option it returns, so answer with the header's own value to keep the add-row enabled.
  await page.route('**/selectors/C_BPartner_Location_ID{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: HEADER.partnerAddress, label: 'Sede Central', name: 'Sede Central' }] }),
    });
  });
}

async function prepare(page, viewport = VIEWPORT) {
  await page.addInitScript(() => {
    try { localStorage.setItem('schema-forge-locale', 'en_US'); } catch { /* noop */ }
    try { localStorage.setItem('sidebar-expanded', 'false'); } catch { /* noop */ }
  });
  await page.setViewportSize(viewport);
}

async function openList(page, journalOptions, viewport) {
  await login(page);
  const journal = await installGridViewsMock(page, journalOptions);
  await installListMock(page);
  await prepare(page, viewport);
  await page.goto('/sales-quotation');
  await expect(page.getByTestId('column-header-grandTotalAmount')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('tbody tr').filter({ hasText: 'QUOT-0001' }).first()).toBeVisible();
  await page.waitForTimeout(300);
  return journal;
}

async function openLines(page, journalOptions, viewport) {
  await login(page);
  const journal = await installGridViewsMock(page, journalOptions);
  await installDetailMocks(page);
  await prepare(page, viewport);
  await page.goto(`/sales-invoice/${HEADER_ID}`);
  await page.waitForSelector('[data-testid="detail-view"]', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('tab-lines').click();
  const panel = page.getByTestId('inline-lines-panel');
  await panel.waitFor({ timeout: 10_000 });
  await expect(page.getByTestId(`line-row-${LINES[0].id}`)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  return { journal, panel };
}

// ---------------------------------------------------------------------------
// Geometry helpers (real layout, boundingBox-equivalent reads)
// ---------------------------------------------------------------------------

const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; };

/** Header cells (`column-header-<key>`) of the list, in DOM order, with their x/width. */
const listHeaders = (page) => page.locator('thead th[data-testid^="column-header-"]').evaluateAll((els) =>
  els.map((el) => { const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-testid').replace('column-header-', ''), x: r.x, width: r.width }; }));

/** The first body row's data cells (`cell-<rowId>-<key>`), in DOM order, with their x/width. */
const listRowCells = (page) => page.locator('tbody tr').first().locator(`[data-testid^="cell-${ROWS[0].id}-"]`).evaluateAll((els, prefix) =>
  els.map((el) => { const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-testid').replace(prefix, ''), x: r.x, width: r.width }; }), `cell-${ROWS[0].id}-`);

/** Every header lines up (x/width) with the body cell of the same key, in the same order. */
async function expectListAligned(page, label = '') {
  const [headers, cells] = await Promise.all([listHeaders(page), listRowCells(page)]);
  expect(cells.map((c) => c.key), `${label} body order follows header order`).toEqual(headers.map((h) => h.key));
  headers.forEach((h, i) => {
    expect(Math.abs(cells[i].x - h.x), `${label} ${h.key} x`).toBeLessThanOrEqual(2);
    expect(Math.abs(cells[i].width - h.width), `${label} ${h.key} width`).toBeLessThanOrEqual(2);
  });
  return headers;
}

const lineHeaders = (page) => page.getByTestId('inline-lines-panel').locator('[data-testid^="column-header-"]').evaluateAll((els) =>
  els.map((el) => { const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-testid').replace('column-header-', ''), x: r.x, width: r.width }; }));

const lineRowCells = (page, rowId) => page.getByTestId(`line-row-${rowId}`).evaluate((row) =>
  [...row.children].map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, width: r.width }; }));

const addRowCells = (page) => page.getByTestId('inline-add-row').evaluate((row) =>
  [...row.querySelectorAll(':scope > td')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, width: r.width }; }));

/** Header cells line up with the cells of a saved row; returns the headers. */
async function expectLinesAligned(page, label = '') {
  const [headers, cells] = await Promise.all([lineHeaders(page), lineRowCells(page, LINES[0].id)]);
  const lead = cells.findIndex((c) => Math.abs(c.x - headers[0].x) <= 2);
  expect(lead, `${label} the first row cell lines up with the first header`).toBeGreaterThanOrEqual(0);
  headers.forEach((h, i) => {
    const c = cells[lead + i];
    expect(c, `${label} row cell for ${h.key}`).toBeTruthy();
    expect(Math.abs(c.x - h.x), `${label} ${h.key} x`).toBeLessThanOrEqual(2);
    expect(Math.abs(c.width - h.width), `${label} ${h.key} width`).toBeLessThanOrEqual(2);
  });
  return { headers, lead };
}

// ===========================================================================
// Flag OFF — the feature is inert. Runs in the default (flag-off) server only.
// ===========================================================================

/** The add-row cells line up with the headers currently on screen (read after it opened). */
async function expectAddRowAligned(page, label = '') {
  const headers = await lineHeaders(page);
  const add = await addRowCells(page);
  const lead = add.findIndex((c) => Math.abs(c.x - headers[0].x) <= 2);
  expect(lead, `${label} the first add-row cell lines up with the first header`).toBeGreaterThanOrEqual(0);
  headers.forEach((h, i) => {
    expect(add[lead + i], `${label} add-row cell for ${h.key}`).toBeTruthy();
    expect(Math.abs(add[lead + i].x - h.x), `${label} ${h.key} add-row x`).toBeLessThanOrEqual(2);
    expect(Math.abs(add[lead + i].width - h.width), `${label} ${h.key} add-row width`).toBeLessThanOrEqual(2);
  });
  return headers;
}

test.describe('Grid column views — flag OFF (default): feature is inert', () => {
  test.skip(FLAG_ON, 'Server started with grid-column-views ON; the inert-when-off proof needs the default (flag-off) server');

  test('list: no controls, no /grid-views/ request, no header handles, geometry unchanged', async ({ page }) => {
    const gridRequests = [];
    page.on('request', (r) => { if (r.url().includes('/grid-views/')) gridRequests.push(`${r.method()} ${r.url()}`); });
    const journal = await openList(page);

    await expect(page.getByTestId('grid-view-controls')).toHaveCount(0);
    await expect(page.getByTestId('grid-view-columns-trigger')).toHaveCount(0);
    await expect(page.getByTestId('grid-view-save')).toHaveCount(0);

    // No personal-view affordance in the header: no resize separator, no reorder handle, no
    // draggable header.
    await expect(page.locator('thead [role="separator"]')).toHaveCount(0);
    await expect(page.locator('thead [aria-label^="Move "], thead [aria-label^="Resize "]')).toHaveCount(0);
    await expect(page.locator('thead th[draggable="true"]')).toHaveCount(0);
    await expect(page.locator('[data-grid-column]')).toHaveCount(0);

    // Original geometry: each header shares x/width with its body cell, in the declared order.
    const headers = await expectListAligned(page, 'flag off');
    expect(headers.map((h) => h.key)).toEqual(LIST_KEYS);

    expect(gridRequests, 'no request to /grid-views/').toEqual([]);
    expect(journal.requests, 'the /grid-views/ route was never hit').toEqual([]);
  });

  test('lines: no controls, no /grid-views/ request, no header handles, geometry unchanged', async ({ page }) => {
    const gridRequests = [];
    page.on('request', (r) => { if (r.url().includes('/grid-views/')) gridRequests.push(`${r.method()} ${r.url()}`); });
    const { journal, panel } = await openLines(page);

    await expect(page.getByTestId('grid-view-controls')).toHaveCount(0);
    await expect(page.getByTestId('grid-view-columns-trigger')).toHaveCount(0);
    await expect(panel.locator('[role="separator"]')).toHaveCount(0);
    await expect(panel.locator('[aria-label^="Move "], [aria-label^="Resize "]')).toHaveCount(0);
    await expect(panel.locator('[draggable="true"]')).toHaveCount(0);
    await expect(page.locator('[data-grid-column]')).toHaveCount(0);

    const { headers } = await expectLinesAligned(page, 'flag off');
    expect(headers.map((h) => h.key)).toEqual(LINE_KEYS);

    // The add-row shares the same tracks as the header.
    await page.getByTestId('action-add-line').click();
    await expectAddRowAligned(page, 'flag off');

    expect(gridRequests, 'no request to /grid-views/').toEqual([]);
    expect(journal.requests, 'the /grid-views/ route was never hit').toEqual([]);
  });
});

// ===========================================================================
// Flag ON — only when the server was started with VITE_FEATURE_FLAGS='{"grid-column-views":true}'.
// ===========================================================================

test.describe('Grid column views — flag ON', () => {
  test.skip(!FLAG_ON, 'Needs grid-column-views ON at server start (VITE_FEATURE_FLAGS) and E2E_GRID_COLUMN_VIEWS_FLAG=on');

  // The sales-invoice detail also hosts the reversed-invoices panel, which carries its own
  // controls: scope every control to the ones outside it (the list / the lines grid).
  const control = (page, id) => page.locator(`[data-testid="${id}"]:not([data-testid="reversed-invoices-panel"] *)`);
  const columnsTrigger = (page) => control(page, 'grid-view-columns-trigger');
  const saveButton = (page) => control(page, 'grid-view-save');
  const statusLine = (page) => control(page, 'grid-view-status');
  const openMenu = async (page) => {
    await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
    await columnsTrigger(page).click();
  };
  const toggle = (page, key) => page.getByTestId(`grid-view-column-${key}`);
  const moveHandle = (page, key) => page.getByTestId(`column-header-${key}`).locator('[role="button"][aria-label^="Move "]');
  const resizeHandle = (page, key) => page.getByTestId(`column-header-${key}`).locator('[role="separator"]');
  const hideColumn = async (page, key) => {
    await openMenu(page);
    await toggle(page, key).click();
    await page.keyboard.press('Escape');
  };

  /**
   * A stored view the way the server would keep it, plus ids that no column of the surface has.
   * The real ids are read from a genuine PUT (so the test never guesses the AD column part).
   */
  function viewWithStrangers(savedBody) {
    return {
      ...savedBody,
      columns: [
        ...savedBody.columns,
        { id: 'list:field:doesNotExist', visible: true, order: 0, width: 400 },
        { id: 'list:ad:SECRET_COLUMN:field:internalCost', visible: true, order: 1 },
      ],
    };
  }

  test.describe('list (sales-quotation / quotation)', () => {
    test('controls are visible and the saved view is requested for the list scope', async ({ page }) => {
      const journal = await openList(page);
      await expect(control(page, 'grid-view-controls')).toBeVisible();
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      await expect(saveButton(page)).toBeDisabled(); // nothing to save yet
      const gets = journal.requests.filter((r) => r.method === 'GET');
      expect(gets.length).toBeGreaterThanOrEqual(1);
      expect(gets.every((r) => LIST_VIEW_URL.test(r.url))).toBe(true);
    });

    test('hiding a column removes it from header and body; required columns cannot be hidden', async ({ page }) => {
      await openList(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const before = await listRowCells(page);

      await openMenu(page);
      // Required (locked) columns are offered but disabled.
      for (const key of ['orderDate', 'documentNo', 'businessPartner', 'documentStatus', 'grandTotalAmount']) {
        await expect(toggle(page, key), `${key} is required`).toBeDisabled();
      }
      await expect(toggle(page, 'validUntil')).toBeEnabled();
      await toggle(page, 'validUntil').click();
      await page.keyboard.press('Escape');

      await expect(page.getByTestId('column-header-validUntil')).toHaveCount(0);
      await expect(page.getByTestId(`cell-${ROWS[0].id}-validUntil`)).toHaveCount(0);
      expect((await listRowCells(page)).length).toBe(before.length - 1);
      const headers = await expectListAligned(page, 'after hide');
      expect(headers.map((h) => h.key)).toEqual(LIST_KEYS.filter((k) => k !== 'validUntil'));
      await expect(saveButton(page)).toBeEnabled(); // dirty
      await expect(statusLine(page)).toHaveText('Unsaved column changes');
    });

    test('keyboard reorder moves a column consistently in header and body', async ({ page }) => {
      await openList(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      await moveHandle(page, 'documentNo').focus();
      await page.keyboard.press('Alt+Shift+ArrowRight');

      const headers = await expectListAligned(page, 'after reorder');
      expect(headers.map((h) => h.key)).toEqual(['orderDate', 'businessPartner', 'documentNo', 'documentStatus', 'validUntil', 'grandTotalAmount']);
      // The body follows: the cell under `documentNo` still holds the document number.
      const cells = await listRowCells(page);
      expect(cells.map((c) => c.key)).toEqual(headers.map((h) => h.key));
      await expect(page.locator('tbody tr').first().getByTestId(`cell-${ROWS[0].id}-documentNo`)).toContainText('QUOT-0001');
      await expect(saveButton(page)).toBeEnabled();

      await moveHandle(page, 'documentNo').focus();
      await page.keyboard.press('Alt+Shift+ArrowLeft');
      const back = await expectListAligned(page, 'after reorder back');
      expect(back.map((h) => h.key)).toEqual(LIST_KEYS);
    });

    test('resize changes the width consistently across header and body', async ({ page }) => {
      await openList(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      // Not `businessPartner`: that is the list's implicit grow column (it absorbs the leftover
      // width), so a user width below its current rendered width changes nothing visible.
      const key = 'documentNo';
      const widthBefore = (await listHeaders(page)).find((h) => h.key === key).width;

      await resizeHandle(page, key).focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await listHeaders(page)).find((h) => h.key === key).width, { timeout: 5000 })
        .toBeGreaterThan(widthBefore + 30);
      await expectListAligned(page, 'after resize');
      await expect(saveButton(page)).toBeEnabled();
    });

    test('Save view sends PUT to the list scope and a reload restores order, visibility and width', async ({ page }) => {
      const journal = await openList(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      // hide, reorder and resize, then save
      await hideColumn(page, 'validUntil');
      await moveHandle(page, 'documentNo').focus();
      await page.keyboard.press('Alt+Shift+ArrowRight');
      await resizeHandle(page, 'documentNo').focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      const expected = await listHeaders(page);

      const saved = page.waitForRequest((r) => r.method() === 'PUT' && LIST_VIEW_URL.test(r.url()));
      await saveButton(page).click();
      await saved;
      await expect(statusLine(page)).toHaveText('View saved');
      expect(journal.saves).toHaveLength(1);
      const { body } = journal.saves[0];
      expect(body.version).toBe(1);
      expect(body.surface).toBe('list');
      expect(body.columns).toHaveLength(LIST_KEYS.length);
      expect(body.columns.find((c) => c.id.endsWith(':field:validUntil')).visible).toBe(false);
      expect(body.columns.find((c) => c.id.endsWith(':field:documentNo')).width).toBeGreaterThan(0);

      // Reload: the mocked GET now answers with what the PUT stored.
      await page.reload();
      await expect(page.getByTestId('column-header-grandTotalAmount')).toBeVisible({ timeout: 15_000 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const restored = await expectListAligned(page, 'after reload');
      expect(restored.map((h) => h.key)).toEqual(expected.map((h) => h.key));
      expect(restored.map((h) => h.key)).not.toContain('validUntil');
      const docNo = (h) => h.find((c) => c.key === 'documentNo').width;
      expect(Math.abs(docNo(restored) - docNo(expected))).toBeLessThanOrEqual(3);
      expect(docNo(restored)).toBeGreaterThan(224 + 30); // the saved width, not the 224 default
      await expect(saveButton(page)).toBeDisabled(); // the restored view is clean
    });

    test('a failed save (500) shows an error state, never a success, and keeps the changes', async ({ page }) => {
      const journal = await openList(page, { saveStatus: 500 });
      await hideColumn(page, 'validUntil');

      await saveButton(page).click();
      await expect(statusLine(page)).toHaveText('Could not save the view. Your current changes are still here.');
      await expect(statusLine(page)).toHaveAttribute('role', 'alert');
      await expect(page.getByText('View saved')).toHaveCount(0);
      expect(journal.saves).toHaveLength(1);
      // The unsaved change is still applied and can be retried.
      await expect(page.getByTestId('column-header-validUntil')).toHaveCount(0);
      await expect(saveButton(page)).toBeEnabled();
    });

    test('a stored view naming unknown or unauthorized columns ignores them', async ({ page }) => {
      const journal = await openList(page);
      await hideColumn(page, 'validUntil');
      await saveButton(page).click();
      await expect(statusLine(page)).toHaveText('View saved');
      journal.store = viewWithStrangers(journal.saves[0].body);

      await page.reload();
      await expect(page.getByTestId('column-header-grandTotalAmount')).toBeVisible({ timeout: 15_000 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      // The known part of the view applies (validUntil hidden); the strangers add no column.
      await expect(page.getByTestId('column-header-validUntil')).toHaveCount(0);
      for (const key of ['doesNotExist', 'internalCost']) {
        await expect(page.getByTestId(`column-header-${key}`)).toHaveCount(0);
        await expect(page.getByTestId(`cell-${ROWS[0].id}-${key}`)).toHaveCount(0);
      }
      await openMenu(page);
      for (const key of ['doesNotExist', 'internalCost']) await expect(toggle(page, key)).toHaveCount(0);
      await page.keyboard.press('Escape');
      const headers = await expectListAligned(page, 'stored view');
      expect(headers.map((h) => h.key)).toEqual(LIST_KEYS.filter((k) => k !== 'validUntil'));
    });

    test('a narrow viewport keeps horizontal scroll instead of squeezing columns', async ({ page }) => {
      await openList(page, undefined, { width: 700, height: 800 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const before = await listHeaders(page);
      const host = await page.evaluate(`(() => {
        let el = document.querySelector('tbody')?.closest('table')?.parentElement;
        while (el && !['auto', 'scroll'].includes(getComputedStyle(el).overflowX)) el = el.parentElement;
        return el ? { overflowX: getComputedStyle(el).overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
      })()`);
      expect(host).not.toBeNull();
      expect(host.scrollWidth).toBeGreaterThan(host.clientWidth);
      // No default column is squeezed to fit the viewport: each keeps a usable width.
      for (const h of before) expect(h.width, `${h.key} keeps a usable width`).toBeGreaterThan(80);
      await expectListAligned(page, 'narrow');
    });

    test('shrinking a column hard never takes it below its minimum and keeps header and body aligned', async ({ page }) => {
      await openList(page, undefined, { width: 700, height: 800 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const before = await listHeaders(page);
      const key = 'documentNo';
      await resizeHandle(page, key).focus();
      for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      const after = await expectListAligned(page, 'narrow, shrunk');
      expect(after.find((h) => h.key === key).width, `${key} keeps a usable width`).toBeGreaterThan(40);
      for (const h of after.filter((c) => c.key !== key)) {
        const b = before.find((c) => c.key === h.key);
        expect(h.width, `${h.key} not squeezed`).toBeGreaterThanOrEqual(b.width - 2);
      }
    });
  });

  test.describe('lines (sales-invoice / lines)', () => {
    test('controls are visible and the saved view is requested for the lines scope', async ({ page }) => {
      const { journal } = await openLines(page);
      await expect(control(page, 'grid-view-controls')).toBeVisible();
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      expect(journal.requests.some((r) => r.method === 'GET' && LINES_VIEW_URL.test(r.url))).toBe(true);
    });

    test('hiding a column removes it from header and rows; the product column is locked', async ({ page }) => {
      await openLines(page);
      await openMenu(page);
      await expect(toggle(page, 'product')).toBeDisabled();
      await expect(toggle(page, 'etgoDiscount')).toBeEnabled();
      await toggle(page, 'etgoDiscount').click();
      await page.keyboard.press('Escape');

      await expect(page.getByTestId('column-header-etgoDiscount')).toHaveCount(0);
      const { headers } = await expectLinesAligned(page, 'after hide');
      expect(headers.map((h) => h.key)).toEqual(LINE_KEYS.filter((k) => k !== 'etgoDiscount'));
    });

    test('keyboard reorder moves a column consistently in header and rows', async ({ page }) => {
      await openLines(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      await moveHandle(page, 'tax').focus();
      await page.keyboard.press('Alt+Shift+ArrowRight');

      const { headers } = await expectLinesAligned(page, 'after reorder');
      expect(headers.map((h) => h.key)).toEqual(['product', 'description', 'invoicedQuantity', 'uOM', 'listPrice', 'etgoDiscount', 'grossAmount', 'tax']);
      // The row cell under `tax` still holds the tax of the line (the body follows the header).
      const cells = page.getByTestId(`line-row-${LINES[0].id}`).locator(':scope > *');
      const taxHeader = headers.find((h) => h.key === 'tax');
      const taxCellIndex = (await lineRowCells(page, LINES[0].id)).findIndex((c) => Math.abs(c.x - taxHeader.x) <= 2 && Math.abs(c.width - taxHeader.width) <= 2);
      expect(taxCellIndex).toBeGreaterThanOrEqual(0);
      await expect(cells.nth(taxCellIndex)).toContainText('IVA 21%');
    });

    test('resize changes the width consistently across header, rows and add-row', async ({ page }) => {
      await openLines(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const key = 'description';
      const before = (await lineHeaders(page)).find((h) => h.key === key).width;
      const handle = await resizeHandle(page, key).boundingBox();
      expect(handle).not.toBeNull();
      const cx = handle.x + handle.width / 2;
      const cy = handle.y + handle.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 60, cy, { steps: 6 });
      await page.mouse.up();
      await expect.poll(async () => (await lineHeaders(page)).find((h) => h.key === key).width, { timeout: 5000 })
        .toBeGreaterThan(before + 30);

      await expectLinesAligned(page, 'after resize');
      await page.getByTestId('action-add-line').click();
      await expectAddRowAligned(page, 'after resize');
    });

    test('Save view sends PUT to the lines scope and a reload restores the view', async ({ page }) => {
      const { journal } = await openLines(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      await hideColumn(page, 'etgoDiscount');
      await moveHandle(page, 'tax').focus();
      await page.keyboard.press('Alt+Shift+ArrowRight');
      const expected = (await lineHeaders(page)).map((h) => h.key);
      expect(expected).not.toContain('etgoDiscount');

      const saved = page.waitForRequest((r) => r.method() === 'PUT' && LINES_VIEW_URL.test(r.url()));
      await saveButton(page).click();
      await saved;
      await expect(statusLine(page)).toHaveText('View saved');
      expect(journal.saves).toHaveLength(1);
      expect(journal.saves[0].body.columns.find((c) => c.id.endsWith(':field:etgoDiscount')).visible).toBe(false);

      await page.reload();
      await page.getByTestId('tab-lines').click();
      await expect(page.getByTestId(`line-row-${LINES[0].id}`)).toBeVisible({ timeout: 15_000 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const restored = await expectLinesAligned(page, 'after reload');
      expect(restored.headers.map((h) => h.key)).toEqual(expected);
    });

    test('a failed save (500) shows an error state and never a success', async ({ page }) => {
      const { journal } = await openLines(page, { saveStatus: 500 });
      await hideColumn(page, 'etgoDiscount');
      await saveButton(page).click();
      await expect(statusLine(page)).toHaveText('Could not save the view. Your current changes are still here.');
      await expect(statusLine(page)).toHaveAttribute('role', 'alert');
      await expect(page.getByText('View saved')).toHaveCount(0);
      expect(journal.saves).toHaveLength(1);
      await expect(page.getByTestId('column-header-etgoDiscount')).toHaveCount(0);
      await expect(saveButton(page)).toBeEnabled();
    });

    test('a stored view naming unknown or unauthorized columns ignores them', async ({ page }) => {
      const { journal } = await openLines(page);
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      await hideColumn(page, 'etgoDiscount');
      await saveButton(page).click();
      await expect(statusLine(page)).toHaveText('View saved');
      journal.store = viewWithStrangers(journal.saves[0].body);

      await page.reload();
      await page.getByTestId('tab-lines').click();
      await expect(page.getByTestId(`line-row-${LINES[0].id}`)).toBeVisible({ timeout: 15_000 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      await expect(page.getByTestId('column-header-etgoDiscount')).toHaveCount(0);
      for (const key of ['doesNotExist', 'internalCost']) {
        await expect(page.getByTestId(`column-header-${key}`)).toHaveCount(0);
      }
      await openMenu(page);
      for (const key of ['doesNotExist', 'internalCost']) await expect(toggle(page, key)).toHaveCount(0);
      await page.keyboard.press('Escape');
      const { headers } = await expectLinesAligned(page, 'stored view');
      expect(headers.map((h) => h.key)).toEqual(LINE_KEYS.filter((k) => k !== 'etgoDiscount'));
    });

    test('a narrow viewport keeps the horizontal scroll and no column is squeezed', async ({ page }) => {
      const { panel } = await openLines(page, undefined, { width: 900, height: 800 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const before = await lineHeaders(page);
      const body = panel.locator(':scope > div').nth(1);
      const dims = await body.evaluate((el) => ({ overflowX: getComputedStyle(el).overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(dims.overflowX).toBe('auto');
      expect(dims.scrollWidth).toBeGreaterThan(dims.clientWidth);
      for (const h of before) expect(h.width, `${h.key} keeps a usable width`).toBeGreaterThan(80);
      await expectLinesAligned(page, 'narrow');
    });

    test('shrinking a column hard never takes it below its minimum and keeps header and rows aligned', async ({ page }) => {
      await openLines(page, undefined, { width: 900, height: 800 });
      await expect(columnsTrigger(page)).toBeEnabled({ timeout: 10_000 });
      const before = await lineHeaders(page);
      const key = 'description';
      await resizeHandle(page, key).focus();
      for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(200);
      const after = await lineHeaders(page);
      expect(after.find((h) => h.key === key).width, `${key} keeps a usable width`).toBeGreaterThan(40);
      for (const h of after.filter((c) => c.key !== key)) {
        const b = before.find((c) => c.key === h.key);
        expect(h.width, `${h.key} not squeezed`).toBeGreaterThanOrEqual(b.width - 2);
      }
      await expectLinesAligned(page, 'narrow, shrunk');
    });
  });
});
