// @covers tools/app-shell/src/lib/linesColumnWidth.js
// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
// @covers tools/app-shell/src/windows/custom/sales-quotation/index.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Per-type default list column widths (ETP-5833), measured with real layout.
 *
 * Spec chosen after `make find-tests FILE=tools/app-shell/src/lib/linesColumnWidth.js`: no
 * existing spec drives the sales-quotation LIST. `contacts-list-sort-column-width` (ETP-5182) is
 * the pattern followed here, but Contacts has no `date`/`status`/`amount` column, so it cannot
 * prove the new tiers; `sales-quotation-navigation` is about routing, not geometry. Hence a new
 * file next to the other sales-quotation specs.
 *
 * Columns (windows/custom/sales-quotation/index.jsx `buildQuotationColumns`): orderDate and
 * validUntil `date` (0 0 176), documentNo `string` (1 0 224), businessPartner `selector` (192),
 * documentStatus `status` (0 0 184), grandTotalAmount `amount` (172). The app runs in es-ES here,
 * so the headers are the long translated labels ("Fecha de presupuesto", ...).
 *
 * Covered:
 *  - tiers at 1280px: dates ~176 and far narrower than the descriptive columns, status 184,
 *    amount on the 130 list basis (ETP-5833 QA);
 *  - the business partner, not the document number, absorbs the leftover width (ETP-5833 QA);
 *  - widths identical after a sort click and after infinite-scroll loads the next page
 *    (ETP-5182 regression: `table-layout: fixed` must hold the bases);
 *  - header label + sort icon stay inside the column box and never run into the next header;
 *  - at 800px the scroll host is `overflow-x: auto` and the last column is reachable by scroll.
 */

const TOTAL_ROWS = 150;
const PAGE_END = 74; // the list asks for _startRow=0&_endRow=74, then the next window
const PARTNERS = ['Hostelería del Sur S.L.', 'Distribuciones y Suministros Industriales del Mediterráneo Sociedad Limitada'];

function makeRow(i, long = false) {
  return {
    id: `quot-${i}`,
    documentNo: `QUOT-${String(i).padStart(4, '0')}`,
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    orderDate: '2026-10-20',
    validUntil: '2026-11-20',
    businessPartner: `bp-${i}`,
    'businessPartner$_identifier': long ? PARTNERS[1] : PARTNERS[0],
    grandTotalAmount: 1234.5 + i,
    processed: false,
  };
}

async function installMocks(page) {
  await page.route('**/sws/neo/sales-quotation/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET' || !url.pathname.endsWith('/quotation')) return route.fallback();
    const start = Number(url.searchParams.get('_startRow') ?? 0);
    const end = Number(url.searchParams.get('_endRow') ?? PAGE_END);
    // Sorting by documentNo swaps in rows with much longer partner names: the content change that
    // `table-layout: auto` would turn into a column resize.
    const long = (url.searchParams.get('_sortBy') ?? '').startsWith('documentNo');
    const rows = [];
    for (let i = start; i <= Math.min(end, TOTAL_ROWS - 1); i++) rows.push(makeRow(i, long));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: rows, totalRows: TOTAL_ROWS } }),
    });
  });
}

async function openList(page, viewport = { width: 1280, height: 800 }) {
  await login(page);
  await installMocks(page);
  // Force the locale: the translated-header test is only meaningful in Spanish.
  await page.addInitScript(() => { localStorage.setItem('schema-forge-locale', 'es_ES'); });
  await page.setViewportSize(viewport);
  await page.goto('/sales-quotation');
  await expect(page.getByTestId('column-header-grandTotalAmount')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('tbody tr').filter({ hasText: 'QUOT-0000' }).first()).toBeVisible();
  await page.waitForTimeout(300);
}

const headerWidth = (page, key) =>
  page.getByTestId(`column-header-${key}`).evaluate((el) => el.getBoundingClientRect().width);

const allHeaderWidths = (page) =>
  page.locator('thead th').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));

/**
 * The nearest ancestor of the BODY table that scrolls horizontally (overflow-x auto/scroll).
 * The header strip lives in its own `overflow: hidden` wrapper whose scrollLeft is synced to this
 * host, so the body table is the one to look at.
 */
const SCROLL_HOST = `(() => {
  let el = document.querySelector('tbody')?.closest('table')?.parentElement;
  while (el && !['auto', 'scroll'].includes(getComputedStyle(el).overflowX)) el = el.parentElement;
  return el;
})()`;

test.describe('Sales quotation list — per-type default column widths (mocked)', () => {
  test('a validUntil date column holds ~176px, narrower than the widest descriptive column', async ({ page }) => {
    await openList(page);
    const date = await headerWidth(page, 'validUntil');
    expect(Math.abs(date - 176)).toBeLessThanOrEqual(4);
    const descriptive = Math.max(await headerWidth(page, 'documentNo'), await headerWidth(page, 'businessPartner'));
    expect(descriptive - date).toBeGreaterThanOrEqual(60);
  });

  test('every date column holds ~176px, including the leading one', async ({ page }) => {
    await openList(page);
    // orderDate is the FIRST column and the window declares no `grow` column: the implicit grow
    // column (`withImplicitGrowColumn`) must skip a leading date and pick a descriptive one.
    const date = await headerWidth(page, 'orderDate');
    expect(Math.abs(date - 176)).toBeLessThanOrEqual(4);
  });

  test('status holds 184px and amount takes the narrower list basis', async ({ page }) => {
    await openList(page);
    expect(Math.abs((await headerWidth(page, 'documentStatus')) - 184)).toBeLessThanOrEqual(4);
    // ETP-5833 QA — list amount basis is 130 (the 172 lines tier is sized for an editable input);
    // a longer translated header may only widen it through the header floor.
    const amount = await headerWidth(page, 'grandTotalAmount');
    expect(amount).toBeGreaterThanOrEqual(126);
    expect(amount).toBeLessThan(168);
  });

  test('the document number is not the absorber: the business partner takes the leftover width', async ({ page }) => {
    await openList(page);
    // ETP-5833 QA — `DocumentNo` is a code column, skipped by `withImplicitGrowColumn`.
    expect(Math.abs((await headerWidth(page, 'documentNo')) - 224)).toBeLessThanOrEqual(4);
    expect(await headerWidth(page, 'businessPartner')).toBeGreaterThanOrEqual(316);
  });

  test('column widths do not move after a sort click or after the next page loads (ETP-5182)', async ({ page }) => {
    await openList(page);
    const before = await allHeaderWidths(page);

    const sortRequest = page.waitForRequest((r) => r.url().includes('/sales-quotation/quotation') && /_sortBy=documentNo/.test(r.url()));
    await page.getByTestId('column-header-documentNo').locator('button').click();
    await sortRequest;
    await expect(page.getByText(PARTNERS[1]).first()).toBeVisible({ timeout: 10_000 });
    const afterSort = await allHeaderWidths(page);

    const moreRequest = page.waitForRequest((r) => r.url().includes('/sales-quotation/quotation') && /_startRow=7[5-9]/.test(r.url()));
    await page.evaluate(`(() => { const h = ${SCROLL_HOST}; const s = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 20 && ['auto','scroll'].includes(getComputedStyle(e).overflowY)); for (const e of s) e.scrollTop = e.scrollHeight; })()`);
    await moreRequest;
    await expect(page.locator('tbody tr').filter({ hasText: 'QUOT-0075' }).first()).toBeAttached({ timeout: 10_000 });
    const afterPage = await allHeaderWidths(page);

    expect(afterSort).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(afterSort[i] - before[i]), `column ${i} after sort`).toBeLessThan(4);
      expect(Math.abs(afterPage[i] - before[i]), `column ${i} after next page`).toBeLessThan(4);
    }
  });

  test('translated (es-ES) headers keep label and sort icon inside their column and clear of the next header', async ({ page }) => {
    await openList(page);
    // The locale really is Spanish: both date headers carry their translated label.
    await expect(page.getByTestId('column-header-orderDate')).toContainText(/Fecha/i);
    await expect(page.getByTestId('column-header-validUntil')).toContainText(/V[áa]lid/i);
    const boxes = await page.locator('thead th[data-testid^="column-header-"]').evaluateAll((ths) =>
      ths.map((th) => {
        const t = th.getBoundingClientRect();
        // No label wrapper may clip its own text (scrollWidth <= clientWidth).
        const clipped = [...th.querySelectorAll('*')].some((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1);
        const inner = [...th.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
        return {
          key: th.getAttribute('data-testid'),
          left: t.left,
          right: t.right,
          innerMin: Math.min(...inner.map((r) => r.left)),
          innerMax: Math.max(...inner.map((r) => r.right)),
          text: th.textContent.trim(),
          clipped,
        };
      }));
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      expect(b.text.length, b.key).toBeGreaterThan(0);
      expect(b.clipped, `${b.key} label clipped`).toBe(false);
      expect(b.innerMin, `${b.key} content left`).toBeGreaterThanOrEqual(b.left - 1);
      expect(b.innerMax, `${b.key} content right`).toBeLessThanOrEqual(b.right + 1);
      if (i < boxes.length - 1) expect(b.right, `${b.key} vs next`).toBeLessThanOrEqual(boxes[i + 1].left + 1);
    }
  });

  test('at 800px the table scrolls horizontally and the last column is reachable', async ({ page }) => {
    await openList(page, { width: 800, height: 700 });
    const info = await page.evaluate(`(() => { const h = ${SCROLL_HOST}; return h ? { overflowX: getComputedStyle(h).overflowX, scrollWidth: h.scrollWidth, clientWidth: h.clientWidth } : null; })()`);
    expect(info).not.toBeNull();
    expect(['auto', 'scroll']).toContain(info.overflowX);
    expect(info.scrollWidth).toBeGreaterThan(info.clientWidth);

    await page.evaluate(`(() => { const h = ${SCROLL_HOST}; h.scrollLeft = h.scrollWidth; })()`);
    await page.waitForTimeout(150);
    // The header strip follows the body scroll, so the LAST header (row actions) must come to rest
    // inside the host once the body is scrolled to its end.
    const amount = await page.locator('thead th').last().boundingBox();
    const host = await page.evaluate(`(() => { const r = ${SCROLL_HOST}.getBoundingClientRect(); return { left: r.left, right: r.right }; })()`);
    expect(amount).not.toBeNull();
    expect(amount.x + amount.width).toBeLessThanOrEqual(host.right + 1);
    expect(amount.x).toBeGreaterThanOrEqual(host.left - 1);
  });
});
