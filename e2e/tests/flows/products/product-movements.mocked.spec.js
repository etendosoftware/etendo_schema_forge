// @covers tools/app-shell/src/windows/custom/product/ProductMovementsTab.jsx
// @covers tools/app-shell/src/windows/custom/product/productMovements.js
// @covers tools/app-shell/src/windows/custom/product/ProductSidebar.jsx
// @covers tools/app-shell/src/windows/custom/product/useStockHistory.js
// @covers tools/app-shell/src/windows/custom/product/ProductSidebarCollapsed.jsx
// @covers tools/app-shell/src/windows/custom/product/ProductSidebarDividerToggle.jsx
// @covers tools/app-shell/src/windows/custom/product/useSidebarCollapsed.js
// @covers tools/app-shell/src/lib/chartPalette.js
// @covers tools/app-shell/src/components/contract-ui/TabStripButton.jsx
// @covers tools/app-shell/src/components/contract-ui/saveActions.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Product Movements tab, stock side panel and the Product header — mocked spec.
 *
 * Guards: the row layout (date + time on one line, type pill + document link) at a constrained
 * container width, the scroll box and its sticky header, the 7-day default period, the server-side
 * Type sort request, the sticky period-total row fed by `response.totals` (asked for on the first
 * page only), the two empty states, the side panel (divider toggle, collapsed strip, stock card,
 * warehouse cards, chart palette) and its failed reads, and the Product header (filled Save, blue
 * active tab, no counter on Movimientos). The mock session renders in es_ES.
 */

const PRODUCT = {
  id: 'PROD-MOV-1',
  searchKey: 'PROD-MOV-1',
  name: 'Stocked product',
  '_identifier': 'Stocked product',
  productType: 'I',
  'productType$_identifier': 'Item',
  stocked: true,
  organization: 'org-1',
  client: 'client-1',
};

const MOVEMENT = {
  id: 'mov-1',
  movementDate: '2026-10-20',
  etgoProcessTime: '2026-10-20T14:35:10',
  movementQuantity: 12,
  movementType: 'V+',
  etgoDocKind: 'goods-receipt',
  etgoDocWindow: 'goods-receipt',
  etgoDocHeaderId: 'doc-1',
  etgoDocLabel: 'GR-0001',
  'etgoWarehouse$_identifier': 'Main warehouse',
  transactionCost: 100,
  etgoStockAfter: 12,
};

const OUT_MOVEMENT = {
  ...MOVEMENT,
  id: 'mov-2',
  etgoProcessTime: '2026-10-20T16:05:00',
  movementQuantity: -15,
  movementType: 'C-',
  etgoDocKind: 'goods-shipment',
  etgoDocWindow: 'goods-shipment',
  etgoDocHeaderId: 'doc-2',
  etgoDocLabel: 'GS-0002',
  etgoStockAfter: -3,
};

const STOCK_ROWS = [{ storageBin: 'LOC1', 'warehouse$_identifier': 'Main warehouse', quantityOnHand: 1530 }];
const HISTORY_ROWS = [{ movementDate: '2026-10-20', movementQuantity: 1530, storageBin: 'LOC1' }];

// Two warehouses: the stock card shows "2 ubicaciones" and the chart draws two series.
const TWO_WAREHOUSE_STOCK = [
  { storageBin: 'LOC1', warehouse: 'WH-1', 'warehouse$_identifier': 'Main warehouse', quantityOnHand: 1000 },
  { storageBin: 'LOC2', warehouse: 'WH-2', 'warehouse$_identifier': 'Second warehouse', quantityOnHand: 530 },
];
const TWO_WAREHOUSE_HISTORY = [
  { movementDate: '2026-10-20', movementQuantity: 1000, storageBin: 'LOC1' },
  { movementDate: '2026-10-21', movementQuantity: 530, storageBin: 'LOC2' },
];

// Design tokens (index.css), as the browser computes them.
const NEGATIVE_FG = 'rgb(184, 46, 0)';
const POSITIVE_FG = 'rgb(23, 102, 58)';
const SURFACE_SUBTLE = 'rgb(245, 247, 249)';
const PRIMARY = 'rgb(50, 92, 255)';
const PRIMARY_HOVER_STRONG = 'rgb(43, 72, 188)';
const SERIES_FILLS = ['rgb(184, 250, 80)', 'rgb(179, 161, 255)', 'rgb(50, 92, 255)'];

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
/** A NEO list page; `totals` is the opt-in `response.totals` of the Movements tab (omitted when undefined). */
const page_ = (data, totals) => ({ response: { data, totalRows: data.length, ...(totals ? { totals } : {}) } });
const isProbe = (url) => url.includes('_endRow=0');
/** The side panel also reads a 500-row history from /transactions; the tab's own pages are the others. */
const tabCalls = (calls) => calls.filter((u) => !u.includes('_endRow=499'));
const startRowOf = (url) => Number(new URL(url).searchParams.get('_startRow'));

/**
 * Installs the product detail, /stock and /transactions mocks AFTER login() (LIFO route matching).
 * `transactions(url)` decides each answer; every /transactions URL is recorded in `calls`.
 */
async function installMocks(page, { stock = () => [200, page_(STOCK_ROWS)], transactions }, calls) {
  await page.route('**/sws/neo/product/product/**', async (route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || /\/selectors\//.test(url)) return route.fallback();
    return json(route, 200, { response: { data: [PRODUCT] } });
  });
  await page.route('**/sws/neo/product/stock**', async (route) => {
    const [status, body] = await stock(route.request().url());
    return json(route, status, body);
  });
  await page.route('**/sws/neo/product/transactions**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    const [status, body] = transactions(url);
    return json(route, status, body);
  });
}

async function openMovements(page) {
  await page.goto(`/product/${PRODUCT.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('tab-custom:movements').click();
}

/** Opens the product with the given transactions answer and returns the recorded /transactions URLs. */
async function openMovementsWith(page, transactions) {
  const calls = [];
  await login(page);
  await installMocks(page, { transactions }, calls);
  await openMovements(page);
  return calls;
}

test.describe('Product movements tab — layout and sort', () => {
  let calls;

  test.beforeEach(async ({ page }) => {
    calls = [];
    await login(page);
    await installMocks(page, { transactions: () => [200, page_([MOVEMENT, OUT_MOVEMENT])] }, calls);
    await openMovements(page);
  });

  test('keeps date and time on one line and the type pill beside the document chip, even in a narrow container', async ({ page }) => {
    const row = page.getByTestId('product-movements-row').first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    const time = row.getByTestId('product-movements-time');
    await expect(time).toHaveText('14:35');
    const dateBox = await row.getByText('2026', { exact: false }).first().boundingBox();
    const timeBox = await time.boundingBox();
    expect(Math.abs((dateBox.y + dateBox.height / 2) - (timeBox.y + timeBox.height / 2))).toBeLessThan(6);

    const chip = row.getByTestId('product-movements-doc-link');
    await expect(chip).toContainText('GR-0001');
    await expect(chip.locator('svg').first()).toBeVisible();

    // Constrain the container (not the window): the page itself must not grow a horizontal scrollbar
    // and the cells of a row must never overlap each other.
    await page.getByTestId('product-movements-tab').evaluate((el) => { el.style.width = '640px'; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const cells = await row.locator('[role="cell"]').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }));
    for (let i = 1; i < cells.length; i++) expect(cells[i].left).toBeGreaterThanOrEqual(cells[i - 1].right - 1);
  });

  test('rows are one line, the document is an underlined link and the quantity sign picks the colour', async ({ page }) => {
    const rows = page.getByTestId('product-movements-row');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    const [inRow, outRow] = [rows.nth(0), rows.nth(1)];

    // Date cell and type cell never wrap; the link (icon + label) stays on one line.
    await expect(inRow.locator('[role="cell"]').nth(0)).toHaveCSS('white-space', 'nowrap');
    await expect(inRow.locator('[role="cell"]').nth(1)).toHaveCSS('white-space', 'nowrap');
    const link = inRow.getByTestId('product-movements-doc-link');
    await expect(link).toHaveCSS('text-decoration-line', 'underline');
    const linkBox = await link.boundingBox();
    expect(linkBox.height).toBeLessThan(24);
    const typeBox = await inRow.getByTestId('product-movements-type').boundingBox();
    expect(Math.abs((typeBox.y + typeBox.height / 2) - (linkBox.y + linkBox.height / 2))).toBeLessThan(4);

    // Quantity column (4th cell): green with a plus for an entry, the dark-red token with U+2212 for an exit.
    const inQty = inRow.locator('[role="cell"]').nth(3);
    const outQty = outRow.locator('[role="cell"]').nth(3);
    await expect(inQty).toHaveText('+12');
    await expect(inQty).toHaveCSS('color', POSITIVE_FG);
    await expect(outQty).toHaveText('−15');
    await expect(outQty).toHaveCSS('color', NEGATIVE_FG);
  });

  test('the scroll box has no frame, keeps 340 px of height and a white sticky header', async ({ page }) => {
    await expect(page.getByTestId('product-movements-row').first()).toBeVisible({ timeout: 10_000 });
    const box = page.getByTestId('product-movements-scroll');
    await expect(box).toHaveCSS('min-height', '340px');
    await expect(box).toHaveCSS('border-top-width', '0px');
    await expect(box).toHaveCSS('border-left-width', '0px');
    await expect(box).toHaveCSS('border-top-left-radius', '0px');
    expect((await box.boundingBox()).height).toBeGreaterThanOrEqual(339);

    const header = box.locator('[role="row"]').first();
    await expect(header.getByRole('columnheader').first()).toBeVisible();
    await expect(header).toHaveCSS('position', 'sticky');
    await expect(header).toHaveCSS('top', '0px');
    await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('opens on the last 7 days: the first page asks for today minus 6 to today', async ({ page }) => {
    await expect(page.getByTestId('product-movements-row').first()).toBeVisible({ timeout: 10_000 });
    const [from, to] = await page.evaluate(() => {
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const today = new Date();
      const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return [iso(weekAgo), iso(today)];
    });
    const criteria = JSON.parse(new URL(tabCalls(calls)[0]).searchParams.get('criteria'));
    expect(criteria).toEqual(expect.arrayContaining([
      { fieldName: 'movementDate', operator: 'greaterOrEqual', value: from },
      { fieldName: 'movementDate', operator: 'lessOrEqual', value: to },
    ]));
  });

  test('sorting by Type sends the label order next to the Type sort and aria-sort follows it', async ({ page }) => {
    await expect(page.getByTestId('product-movements-row').first()).toBeVisible({ timeout: 10_000 });
    expect(calls.some((u) => u.includes('typeLabelOrder'))).toBe(false);

    const typeHeader = page.getByRole('columnheader').nth(1);
    const request = page.waitForRequest((r) => r.url().includes('/transactions') && r.url().includes('typeLabelOrder'));
    await typeHeader.getByRole('button').click();
    const params = new URL((await request).url()).searchParams;
    expect(params.get('_sortBy')).toMatch(/^-?etgoDocKind,/);
    expect(params.get('typeLabelOrder').split(',').sort()).toEqual([
      'customer-return', 'customer-shipment', 'internal-consumption', 'inventory-in',
      'inventory-out', 'transfer', 'vendor-receipt', 'vendor-return',
    ]);
    await expect(typeHeader).toHaveAttribute('aria-sort', /ascending|descending/);
  });
});

test.describe('Product movements tab — period total row', () => {
  test('a sticky last row sums the period: count, net quantity in dark red with U+2212, bold 15 px', async ({ page }) => {
    const calls = await openMovementsWith(page, () => [200, page_([MOVEMENT, OUT_MOVEMENT], { netQuantity: -3, count: 2 })]);
    const total = page.getByTestId('product-movements-total');
    await expect(total).toBeVisible({ timeout: 10_000 });
    await expect(total).toHaveAttribute('role', 'row');
    await expect(total).toContainText('Total del período');
    await expect(total.getByTestId('product-movements-total-count')).toHaveText('· 2 movimientos');
    await expect(total).toHaveCSS('position', 'sticky');
    await expect(total).toHaveCSS('bottom', '0px');
    await expect(total).toHaveCSS('background-color', SURFACE_SUBTLE);

    const value = total.getByTestId('product-movements-total-value');
    await expect(value).toHaveText('−3');
    await expect(value).toHaveCSS('color', NEGATIVE_FG);
    await expect(value).toHaveCSS('font-size', '15px');
    await expect(value).toHaveCSS('font-weight', '700');

    // The total sits under the Quantity column (the 4th cell of a movement row).
    const qtyBox = await page.getByTestId('product-movements-row').first().locator('[role="cell"]').nth(3).boundingBox();
    const valueBox = await value.boundingBox();
    expect(Math.abs((qtyBox.x + qtyBox.width) - (valueBox.x + valueBox.width))).toBeLessThan(2);

    // It is the last row of the table: below every movement row.
    const lastRowBox = await page.getByTestId('product-movements-row').last().boundingBox();
    expect((await total.boundingBox()).y).toBeGreaterThanOrEqual(lastRowBox.y + lastRowBox.height - 1);

    // Only the first page asked for the totals.
    expect(tabCalls(calls)).toHaveLength(1);
    expect(new URL(tabCalls(calls)[0]).searchParams.get('etgoTotals')).toBe('true');
  });

  test('a net entry is green with a plus and one movement reads in the singular', async ({ page }) => {
    await openMovementsWith(page, () => [200, page_([MOVEMENT], { netQuantity: 12, count: 1 })]);
    const total = page.getByTestId('product-movements-total');
    await expect(total.getByTestId('product-movements-total-count')).toHaveText('· 1 movimiento', { timeout: 10_000 });
    await expect(total.getByTestId('product-movements-total-value')).toHaveText('+12');
    await expect(total.getByTestId('product-movements-total-value')).toHaveCSS('color', POSITIVE_FG);
  });

  test('a response without totals hides the row, the movements still show', async ({ page }) => {
    await openMovementsWith(page, () => [200, page_([MOVEMENT, OUT_MOVEMENT])]);
    await expect(page.getByTestId('product-movements-row')).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByTestId('product-movements-total')).toHaveCount(0);
  });

  test('sorting keeps the same total', async ({ page }) => {
    await openMovementsWith(page, (url) => {
      const rows = url.includes('etgoDocKind') ? [OUT_MOVEMENT, MOVEMENT] : [MOVEMENT, OUT_MOVEMENT];
      return [200, page_(rows, { netQuantity: -3, count: 2 })];
    });
    const value = page.getByTestId('product-movements-total-value');
    await expect(value).toHaveText('−3', { timeout: 10_000 });

    const sorted = page.waitForResponse((r) => r.url().includes('/transactions') && r.url().includes('typeLabelOrder'));
    await page.getByRole('columnheader').nth(1).getByRole('button').click();
    await sorted;
    await expect(page.getByTestId('product-movements-row').first()).toContainText('GS-0002');
    await expect(value).toHaveText('−3');
    await expect(page.getByTestId('product-movements-total-count')).toHaveText('· 2 movimientos');
  });

  test('a later page never asks for totals and never replaces the first page ones', async ({ page }) => {
    const firstPage = Array.from({ length: 50 }, (_, i) => ({ ...MOVEMENT, id: `mov-p1-${i}`, etgoDocLabel: `GR-${i}` }));
    const calls = await openMovementsWith(page, (url) => (startRowOf(url) === 0
      ? [200, page_(firstPage, { netQuantity: 612, count: 51 })]
      // A backend that answered totals anyway must not overwrite the period total.
      : [200, page_([{ ...MOVEMENT, id: 'mov-p2-0', etgoDocLabel: 'GR-LAST' }], { netQuantity: 1, count: 1 })]));
    await expect(page.getByTestId('product-movements-row')).toHaveCount(50, { timeout: 10_000 });

    const nextPage = page.waitForRequest((r) => r.url().includes('/transactions') && r.url().includes('_startRow=50'));
    await page.getByTestId('product-movements-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await nextPage;
    await expect(page.getByTestId('product-movements-row')).toHaveCount(51);

    const firstUrl = tabCalls(calls).find((u) => startRowOf(u) === 0);
    const laterUrl = tabCalls(calls).find((u) => startRowOf(u) === 50);
    expect(new URL(firstUrl).searchParams.get('etgoTotals')).toBe('true');
    expect(new URL(laterUrl).searchParams.has('etgoTotals')).toBe(false);
    await expect(page.getByTestId('product-movements-total-count')).toHaveText('· 51 movimientos');
    await expect(page.getByTestId('product-movements-total-value')).toHaveText('+612');
  });
});

test.describe('Product movements tab — empty states', () => {
  test('a product with no movements at all shows the empty state after one probe request', async ({ page }) => {
    // The default period filters, so the empty first page is followed by the unfiltered probe.
    const calls = await openMovementsWith(page, () => [200, page_([], { netQuantity: 0, count: 0 })]);
    await expect(page.getByTestId('product-movements-empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('product-movements-no-results')).toHaveCount(0);
    await expect(page.getByTestId('product-movements-total')).toHaveCount(0);
    const probe = calls.find((u) => isProbe(u) && !u.includes('criteria'));
    expect(probe).toBeTruthy();
    // Totals ride on the first page only, never on the probe.
    expect(new URL(probe).searchParams.has('etgoTotals')).toBe(false);
    expect(tabCalls(calls).filter((u) => !isProbe(u)).every((u) => new URL(u).searchParams.get('etgoTotals') === 'true')).toBe(true);
  });

  test('filters that match nothing show the no-results state, not the empty one', async ({ page }) => {
    const state = { filtered: false };
    // The probe (`_endRow=0`, no criteria) still sees a movement: the product has some, the filters match none.
    await openMovementsWith(page, (url) => (state.filtered && !isProbe(url)
      ? [200, page_([], { netQuantity: 0, count: 0 })]
      : [200, page_([MOVEMENT], { netQuantity: 12, count: 1 })]));
    await expect(page.getByTestId('product-movements-row').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('product-movements-total')).toBeVisible();
    state.filtered = true;
    await page.getByTestId('product-movements-direction').getByRole('button').nth(1).click();
    await expect(page.getByTestId('product-movements-no-results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('product-movements-empty')).toHaveCount(0);
    await expect(page.getByTestId('product-movements-total')).toHaveCount(0);
  });
});

/** Opens the product with two warehouses of stock and a history, so the panel draws its chart. */
async function openStockedProduct(page) {
  await login(page);
  await installMocks(page, {
    stock: () => [200, page_(TWO_WAREHOUSE_STOCK)],
    transactions: () => [200, page_(TWO_WAREHOUSE_HISTORY)],
  }, []);
  await page.goto(`/product/${PRODUCT.id}`);
}

test.describe('Product side panel — stock card, warehouses and chart', () => {
  test('the whole stock card is one button that opens Almacenes; the locations count is a plain pill', async ({ page }) => {
    await openStockedProduct(page);
    const card = page.getByTestId('AvailabilityCardButton');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('Stock disponible');
    await expect(card).toContainText('1.530');

    const pill = card.getByTestId('AvailabilityWarehousePill');
    await expect(pill).toHaveText('2 ubicaciones');
    await expect(pill).toHaveCSS('background-color', 'rgb(235, 239, 255)');
    await expect(pill).toHaveCSS('color', 'rgb(37, 56, 132)');
    // Not interactive: no link or button of its own inside the card button.
    expect(await pill.evaluate((el) => el.closest('a, [role="link"]') === null && el.querySelector('a, button') === null)).toBe(true);
    // Never cut, and on the same line as the label.
    expect(await pill.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const labelRow = card.getByTestId('AvailabilityLabelRow');
    const labelBox = await labelRow.getByText('Stock disponible').boundingBox();
    const pillBox = await pill.boundingBox();
    expect(Math.abs((labelBox.y + labelBox.height / 2) - (pillBox.y + pillBox.height / 2))).toBeLessThan(4);

    await card.click();
    await expect(page.getByTestId('WarehouseCards')).toBeVisible();
  });

  test('warehouse cards keep Disponible on a subtle surface with 10 px square series indicators', async ({ page }) => {
    await openStockedProduct(page);
    await page.getByTestId('ProductSidebarTab-warehouses').click({ timeout: 10_000 });
    const cards = page.getByTestId('WarehouseCard');
    await expect(cards).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i);
      await expect(card).toContainText('Disponible');
      await expect(card).toHaveCSS('background-color', SURFACE_SUBTLE);
      await expect(card).toHaveCSS('border-top-width', '0px');
      const dot = card.getByTestId('WarehouseCardDot');
      await expect(dot).toHaveCSS('width', '10px');
      await expect(dot).toHaveCSS('height', '10px');
      await expect(dot).toHaveCSS('border-top-left-radius', '3px');
      await expect(dot).toHaveCSS('background-color', SERIES_FILLS[i]);
    }
  });

  test('chart areas use the series palette at 0.32 fill opacity with no gradient', async ({ page }) => {
    await openStockedProduct(page);
    await expect(page.getByTestId('StockChartExpandButton')).toBeVisible({ timeout: 10_000 });
    const areas = page.getByTestId('StockChartArea');
    await expect(areas).toHaveCount(2);
    const styles = await areas.evaluateAll((els) => els.map((el) => {
      const cs = getComputedStyle(el);
      return { fill: cs.fill, fillOpacity: cs.fillOpacity };
    }));
    expect(styles.map((s) => s.fill).sort()).toEqual([SERIES_FILLS[0], SERIES_FILLS[1]].sort());
    for (const s of styles) expect(Number(s.fillOpacity)).toBeCloseTo(0.32, 2);
    expect(await page.locator('svg linearGradient, svg radialGradient').count()).toBe(0);
  });
});

test.describe('Product side panel — divider toggle and collapsed strip', () => {
  test('one round 24 px toggle on the divider collapses the panel to a 48 px strip with two icons, and back', async ({ page }) => {
    await openStockedProduct(page);
    const collapse = page.getByTestId('ProductSidebarCollapseButton');
    await expect(collapse).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('ProductSidebarCollapseButton').or(page.getByTestId('ProductSidebarOpenButton'))).toHaveCount(1);
    await expect(collapse).toHaveAttribute('aria-label', 'Panel del producto');
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(collapse).toHaveAttribute('aria-controls', 'product-sidebar-panel');
    await expect(page.locator('#product-sidebar-panel')).toHaveCount(1);
    const box = await collapse.boundingBox();
    expect(Math.round(box.width)).toBe(24);
    expect(Math.round(box.height)).toBe(24);
    expect(await collapse.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 12)).toBe(true);
    // Centred on the divider: the left border of the panel column.
    const dividerX = await page.getByTestId('ProductSidebarTab-summary').evaluate((el) => el.closest('.border-l.overflow-y-auto').getBoundingClientRect().left);
    expect(Math.abs(box.x + box.width / 2 - dividerX)).toBeLessThan(2);

    await collapse.click();
    const open = page.getByTestId('ProductSidebarOpenButton');
    await expect(open).toBeVisible();
    await expect(page.getByTestId('ProductSidebarCollapseButton')).toHaveCount(0);
    // Same control: stable name, the state is carried by aria-expanded and the rotated icon.
    await expect(open).toHaveAttribute('aria-label', 'Panel del producto');
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(open).toHaveAttribute('aria-controls', 'product-sidebar-panel');
    await expect.poll(() => open.locator('svg').evaluate((svg) => {
      const cs = getComputedStyle(svg);
      if (cs.rotate && cs.rotate !== 'none') return Math.round(parseFloat(cs.rotate));
      const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
      return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
    })).toBe(180);

    const strip = page.getByTestId('ProductSidebarCollapsed');
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute('id', 'product-sidebar-panel');
    const columnWidth = await strip.evaluate((el) => el.closest('.border-l.overflow-y-auto').getBoundingClientRect().width);
    expect(Math.round(columnWidth)).toBe(48);
    await expect(strip.getByRole('button')).toHaveCount(2);
    await expect(strip.getByTestId('ProductSidebarStripSummary')).toHaveAttribute('aria-label', 'Resumen');
    await expect(strip.getByTestId('ProductSidebarStripWarehouses')).toHaveAttribute('aria-label', 'Almacenes');
    await expect(strip.getByTestId('ProductSidebarOpenButton')).toHaveCount(0);

    // The divider toggle reopens it.
    await open.click();
    await expect(page.getByTestId('ProductSidebarCollapseButton')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('ProductSidebarCollapsed')).toHaveCount(0);
  });

  test('the collapsed preference survives a reload, and a strip icon reopens on its tab', async ({ page }) => {
    await openStockedProduct(page);
    await page.getByTestId('ProductSidebarCollapseButton').click({ timeout: 10_000 });
    await expect(page.getByTestId('ProductSidebarCollapsed')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('etendo.product.sidebar.collapsed'))).toBe('true');

    await page.reload();
    await expect(page.getByTestId('ProductSidebarCollapsed')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('ProductSidebarOpenButton')).toHaveAttribute('aria-expanded', 'false');

    await page.getByTestId('ProductSidebarStripWarehouses').click();
    await expect(page.getByTestId('WarehouseCards')).toBeVisible();
    await expect(page.getByTestId('ProductSidebarCollapsed')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('etendo.product.sidebar.collapsed'))).toBe('false');
  });
});

test.describe('Product side panel — failed reads', () => {
  test('a /stock 500 shows a dash and the unavailable note, with no chart', async ({ page }) => {
    await login(page);
    await installMocks(page, {
      stock: () => [500, { error: { message: 'boom' } }],
      transactions: () => [200, page_(HISTORY_ROWS)],
    }, []);
    await page.goto(`/product/${PRODUCT.id}`);
    await expect(page.getByTestId('AvailabilityUnavailable')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('StockUnavailableNote')).toBeVisible();
    await expect(page.getByTestId('StockChartExpandButton')).toHaveCount(0);
    // An unavailable stock is not a way into Almacenes.
    await expect(page.getByTestId('AvailabilityCard')).toBeVisible();
    await expect(page.getByTestId('AvailabilityCardButton')).toHaveCount(0);
  });

  test('a failed history keeps the real stock and shows the history note, with no chart', async ({ page }) => {
    await login(page);
    await installMocks(page, { transactions: () => [500, { error: { message: 'boom' } }] }, []);
    await page.goto(`/product/${PRODUCT.id}`);
    await expect(page.getByTestId('StockUnavailableNote')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('AvailabilityUnavailable')).toHaveCount(0);
    await expect(page.getByText('1.530').first()).toBeVisible();
    await expect(page.getByTestId('StockChartExpandButton')).toHaveCount(0);
  });

  test('while the stock loads the card is not clickable', async ({ page }) => {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await login(page);
    await installMocks(page, {
      stock: async () => { await held; return [200, page_(STOCK_ROWS)]; },
      transactions: () => [200, page_(HISTORY_ROWS)],
    }, []);
    await page.goto(`/product/${PRODUCT.id}`);
    await expect(page.getByTestId('AvailabilityValueSkeleton')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('AvailabilityCard')).toBeVisible();
    await expect(page.getByTestId('AvailabilityCardButton')).toHaveCount(0);
    release();
    await expect(page.getByTestId('AvailabilityCardButton')).toBeVisible();
  });
});

test.describe('Product header — Save and tabs', () => {
  test('Guardar is filled primary with white text and the strong hover; the active tab is blue; Movimientos has no counter', async ({ page }) => {
    await openStockedProduct(page);
    const save = page.getByTestId('action-save');
    await expect(save).toBeVisible({ timeout: 10_000 });

    // Only a dirty form enables Save (a mocked spec: nothing is ever sent).
    await page.getByTestId('field-name').fill('Stocked product (edited)');
    await expect(save).toBeEnabled();
    await expect(save).toHaveCSS('background-color', PRIMARY);
    await expect(save).toHaveCSS('color', 'rgb(255, 255, 255)');
    await save.hover();
    await expect(save).toHaveCSS('background-color', PRIMARY_HOVER_STRONG);

    // The first secondary tab is active: its text is the brand blue, the others stay muted.
    const activeTab = page.getByTestId('tab-custom:pricing');
    await expect(activeTab).toHaveCSS('color', PRIMARY);
    const movementsTab = page.getByTestId('tab-custom:movements');
    await expect(movementsTab).not.toHaveCSS('color', PRIMARY);
    await expect(movementsTab).toHaveText('Movimientos');
    await movementsTab.click();
    await expect(movementsTab).toHaveCSS('color', PRIMARY);
    await expect(movementsTab).toHaveText('Movimientos');
  });
});
