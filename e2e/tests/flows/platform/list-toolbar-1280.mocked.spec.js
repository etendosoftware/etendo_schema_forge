import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * ETP-5509 — List toolbar layout at the minimum supported resolution
 * (1280×720, navigation rail expanded).
 *
 * The idle list bar (`ListView.jsx`) is ONE row closed by a separator line, in
 * the pre-ETP-5509 order: [subset tabs][quick filters, filters, "Filtros", view
 * toggle] … [main actions]. The subset tabs (`list-toolbar-tabs`) open the row
 * while everything fits and move — alone, the same element, by CSS — to a line
 * of their own below when it does not. A measurement (`useListToolbarTabsFit`),
 * not a breakpoint; the main row's `data-tabs-placement` says which:
 *
 *   list-toolbar              container, carries the bottom border
 *   └─ list-toolbar-main-row    flex-wrap row:
 *      ├─ list-toolbar-tabs       the subset tabs (first, or last on their own line)
 *      ├─ list-toolbar-filters    quick filters, filters, "Filtros", view toggle
 *      └─ list-toolbar-actions    the main actions
 *
 * jsdom has no layout, so the unit suite (`ListView.toolbarLayout.vitest.jsx`)
 * feeds the fit check stubbed widths — this spec is the only automated guard
 * against real geometry: nothing overflows, overlaps or gets clipped, the two
 * clusters keep their minimum gap, the tabs are either on the first line or on
 * a line of their own below it, and the separator is really painted.
 *
 * Mock mode renders in `es_ES`, the wider of the two locales — kept on purpose.
 *
 * Per window (see `WINDOWS`), in this order:
 *   1. The subset tabs exist exactly once when the window has them, and sit
 *      either on the first line or on a line of their own below it.
 *   2. The main row does not overflow horizontally.
 *   3. Every visible main-row button sits inside the toolbar box and is not
 *      clipped; the create action is present exactly where the window has one.
 *   4. The main row's two clusters keep at least the minimum gap.
 *   5. The toolbar paints a bottom border (the toolbar/body separator).
 *   6. The toolbar ends at or above the top of the list body.
 */
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
// @covers artifacts/chart-of-accounts/custom/ChartOfAccountsToolbarSlot.jsx

const VIEWPORT_MIN = { width: 1280, height: 720 };
const VIEWPORT_LARGE = { width: 1920, height: 1080 };

// Minimum separation between the filters and the actions cluster: the main
// row's `gap-2` plus the actions' `ml-2` (ETP-5509 review — "Filtros" used to
// touch the actions).
const MIN_CLUSTER_GAP_PX = 16;
// Sub-pixel / border rounding allowance for every edge comparison below.
const EDGE_TOLERANCE_PX = 1;
// Lets web fonts and the first data paint settle before measuring (same value
// `lines-grid-narrow-viewport.mocked.spec.js` uses).
const SETTLE_MS = 300;

/**
 * Window matrix. `entity` is the exact URL segment the list fetches
 * (`/sws/neo/<slug>/<entity>`), confirmed by reading each window's list page:
 *   purchase-invoice  custom/purchase-invoice/index.jsx   <ListView entity="header">
 *   sales-invoice     custom/sales-invoice/index.jsx      <ListView entity="header">
 *   contacts          generated BusinessPartnerPage.jsx   entity="businessPartner"
 *   product           generated ProductPage.jsx           entity="product"
 *   warehouse         generated WarehousePage.jsx         entity="warehouse"
 *   payment-in        generated FinPaymentPage.jsx        entity="finPayment"
 *   payment-out       generated HeaderPage.jsx            entity="header"
 *   chart-of-accounts generated ElementValuePage.jsx      entity="elementValue"
 *                     (ETP-5593: the tree's controls — Expandir todo, Buscar, Tipo de
 *                     cuenta — sit in the main row next to Share/Sort/Refresh/Print/New)
 *
 * `subsetTabs`  number of `filter-<key>` subset tabs the window declares.
 * `viewToggle`  whether the window has a list/gallery toggle. It is NOT part of
 *               the tab group: it stays last in the filters cluster.
 * `hasCreate`   false for windows that pass `hideCreate`.
 * `hasPrint`    true when the window keeps the list Print button in row 1.
 */
const WINDOWS = [
  { slug: 'purchase-invoice', entity: 'header', subsetTabs: 3, viewToggle: false, hasCreate: true, hasPrint: false },
  { slug: 'sales-invoice', entity: 'header', subsetTabs: 3, viewToggle: false, hasCreate: true, hasPrint: true },
  { slug: 'contacts', entity: 'businessPartner', subsetTabs: 3, viewToggle: false, hasCreate: true, hasPrint: false },
  { slug: 'product', entity: 'product', subsetTabs: 0, viewToggle: true, hasCreate: true, hasPrint: false },
  { slug: 'warehouse', entity: 'warehouse', subsetTabs: 0, viewToggle: false, hasCreate: true, hasPrint: false },
  { slug: 'payment-in', entity: 'finPayment', subsetTabs: 0, viewToggle: false, hasCreate: false, hasPrint: false },
  { slug: 'payment-out', entity: 'header', subsetTabs: 0, viewToggle: false, hasCreate: false, hasPrint: false },
  { slug: 'chart-of-accounts', entity: 'elementValue', subsetTabs: 0, viewToggle: false, hasCreate: true, hasPrint: true },
];

const windowBySlug = (slug) => WINDOWS.find((w) => w.slug === slug);
const hasTabGroup = (win) => win.subsetTabs > 0;

// One synthetic row set for every window: each list reads the keys it knows
// and ignores the rest. `documentStatus` feeds the status filter where the
// window has one; the two date keys feed the date filter.
const ROWS = [
  { documentStatus: 'DR', label: 'Borrador' },
  { documentStatus: 'CO', label: 'Completado' },
  { documentStatus: 'VO', label: 'Anulado' },
].map(({ documentStatus, label }, i) => {
  const n = String(i + 1).padStart(3, '0');
  return {
    id: `row-${n}`,
    documentNo: `DOC-${n}`,
    orderReference: `DOC-${n}`,
    name: `Toolbar Fixture ${n}`,
    searchKey: `TB-${n}`,
    documentStatus,
    'documentStatus$_identifier': label,
    status: documentStatus,
    'businessPartner$_identifier': 'Proveedor Test S.L.',
    invoiceDate: `2026-0${i + 1}-15`,
    paymentDate: `2026-0${i + 1}-15`,
    grandTotalAmount: 100 * (i + 1),
    amount: 100 * (i + 1),
  };
});

/**
 * List mock for one window. Must run AFTER login() — Playwright matches routes
 * in reverse registration order. Two routes, never the brace form (see
 * docs/e2e-testing-guide.md → "a route pattern ending in a bare `word**`").
 */
async function installListMock(page, { slug, entity }) {
  const handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isSubPath = new RegExp(`/${entity}/[^/?]+`).test(url.pathname);
    if (req.method() !== 'GET' || isSubPath) {
      await route.fallback();
      return;
    }
    // Distinct-values fetch behind the status filter dropdown
    // (`GET /<entity>?_distinct=<field>`): answer with the real distinct codes,
    // otherwise the list rows would come back as bogus dropdown options.
    const distinctField = url.searchParams.get('_distinct');
    const data = distinctField
      ? [...new Set(ROWS.map((r) => r[distinctField]).filter((v) => v != null))]
      : ROWS;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data, totalRows: data.length } }),
    });
  };
  await page.route(`**/sws/neo/${slug}/${entity}/**`, handler);
  await page.route(`**/sws/neo/${slug}/${entity}**`, handler);
}

/** Opens a window's list at the given viewport and waits for the toolbar. */
async function openList(page, win, viewport = VIEWPORT_MIN) {
  await login(page);
  await installListMock(page, win);

  // The minimum supported layout is 1280×720 WITH the navigation rail expanded
  // (240px, menu labels shown). Same key SidebarContext.jsx reads.
  await page.addInitScript(() => {
    try { localStorage.setItem('sidebar-expanded', 'true'); } catch { /* noop */ }
  });

  // Viewport is set BEFORE navigating so the app lays out at this size from
  // the first paint — raw viewport at 100% zoom, no deviceScaleFactor override.
  await page.setViewportSize(viewport);

  await page.goto(`/${win.slug}`);
  await expect(page.getByTestId('list-toolbar')).toBeVisible({ timeout: 15_000 });
  await settle(page);
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Collects every "ResizeObserver loop" error the page raises: uncaught page
 * errors, console errors, and the window `error` event — Chromium delivers the
 * loop error as an ErrorEvent on window that never reaches `pageerror`, so the
 * init script is what actually sees it. Install BEFORE navigating.
 */
async function guardResizeObserverLoop(page) {
  const seen = [];
  const isLoop = (text) => /ResizeObserver loop/i.test(text ?? '');
  page.on('pageerror', (err) => { if (isLoop(err.message)) seen.push(`pageerror: ${err.message}`); });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && isLoop(msg.text())) seen.push(`console: ${msg.text()}`);
  });
  await page.addInitScript(() => {
    window.__resizeObserverLoopErrors = [];
    window.addEventListener('error', (event) => {
      if (/ResizeObserver loop/i.test(event.message ?? '')) window.__resizeObserverLoopErrors.push(event.message);
    });
  });
  return async () => {
    const inPage = await page.evaluate(() => window.__resizeObserverLoopErrors ?? []);
    return [...seen, ...inPage.map((m) => `window error: ${m}`)];
  };
}

/** Reads every geometry fact the assertions need in a single round-trip. */
async function measureToolbar(page) {
  return page.getByTestId('list-toolbar').evaluate((toolbar) => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };
    const isVisible = (el) => {
      const b = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const mainRow = toolbar.querySelector('[data-testid="list-toolbar-main-row"]');
    const tabGroup = toolbar.querySelector('[data-testid="list-toolbar-tabs"]');
    const filters = toolbar.querySelector('[data-testid="list-toolbar-filters"]');
    const actions = toolbar.querySelector('[data-testid="list-toolbar-actions"]');
    const body = toolbar.closest('[data-testid="list-view"]')?.querySelector('table') ?? null;
    return {
      toolbar: rect(toolbar),
      borderBottomWidth: getComputedStyle(toolbar).borderBottomWidth,
      borderBottomStyle: getComputedStyle(toolbar).borderBottomStyle,
      mainRow: { ...rect(mainRow), scrollWidth: mainRow.scrollWidth, clientWidth: mainRow.clientWidth },
      clusters: [filters, actions].map(rect),
      tabGroup: tabGroup ? rect(tabGroup) : null,
      tabsInline: mainRow.dataset.tabsPlacement === 'inline',
      buttons: Array.from(mainRow.querySelectorAll('button')).filter(isVisible).map((button) => ({
        name: button.dataset.testid || button.title || button.textContent.trim() || '(unnamed button)',
        ...rect(button),
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth,
      })),
      body: body ? rect(body) : null,
    };
  });
}

/**
 * Assertion 1 (geometry half) — the tab group is in the main row, or in a
 * second row below it; the second row never exists without it.
 */
function expectTabGroupPlacement(m, win) {
  if (!hasTabGroup(win)) {
    expect(m.tabGroup, 'a window without subset tabs renders no tab group').toBeNull();
    return;
  }
  expect(m.tabGroup, 'tab group not rendered').not.toBeNull();
  const [filters, actions] = m.clusters;
  const firstLineBottom = Math.max(filters.bottom, actions.bottom);
  if (m.tabsInline) {
    expect(m.tabGroup.top, 'inline tabs share the first line')
      .toBeLessThan(Math.min(filters.bottom, actions.bottom));
    expect(m.tabGroup.right, 'inline tabs open the row, left of the filters')
      .toBeLessThanOrEqual(filters.left + EDGE_TOLERANCE_PX);
    return;
  }
  expect(m.tabGroup.top, 'moved tabs must start below the first line')
    .toBeGreaterThanOrEqual(firstLineBottom - EDGE_TOLERANCE_PX);
  expect(m.tabGroup.bottom, 'moved tabs must stay inside the toolbar')
    .toBeLessThanOrEqual(m.toolbar.bottom + EDGE_TOLERANCE_PX);
}

/** Assertions 2, 3 (geometry half) and 4 — the main row fits. */
function expectMainRowFits(m) {
  // 2. No horizontal overflow of the row itself.
  expect(m.mainRow.scrollWidth, 'main row must not overflow horizontally')
    .toBeLessThanOrEqual(m.mainRow.clientWidth);

  // 3. Every visible button stays inside the toolbar and is not clipped.
  expect(m.buttons.length, 'main row must hold at least one visible button').toBeGreaterThan(0);
  for (const button of m.buttons) {
    expect(button.left, `${button.name} starts left of the toolbar`)
      .toBeGreaterThanOrEqual(m.toolbar.left - EDGE_TOLERANCE_PX);
    expect(button.right, `${button.name} ends right of the toolbar`)
      .toBeLessThanOrEqual(m.toolbar.right + EDGE_TOLERANCE_PX);
    expect(button.scrollWidth, `${button.name} content is clipped`)
      .toBeLessThanOrEqual(button.clientWidth);
  }

  // 4. Filters cluster (left) and actions cluster (right) keep the minimum gap.
  const [filters, actions] = m.clusters;
  expect(actions.left - filters.right, 'filters cluster too close to (or over) the actions cluster')
    .toBeGreaterThanOrEqual(MIN_CLUSTER_GAP_PX - EDGE_TOLERANCE_PX);
}

/** Assertion 5 — the toolbar/body separator is painted. */
function expectSeparator(m) {
  expect(parseFloat(m.borderBottomWidth), 'toolbar must paint a bottom border').toBeGreaterThan(0);
  expect(m.borderBottomStyle).not.toBe('none');
}

/** Assertion 6 — the toolbar ends at or above the top of the list body. */
function expectToolbarAboveBody(m) {
  expect(m.body, 'list body (table) not found under list-view').not.toBeNull();
  expect(m.toolbar.bottom, 'toolbar overlaps the list body')
    .toBeLessThanOrEqual(m.body.top + EDGE_TOLERANCE_PX);
}

test.describe('List toolbar — 1280×720 minimum resolution (ETP-5509)', () => {
  for (const win of WINDOWS) {
    test(`toolbar rows fit and stay separated from the body — ${win.slug}`, async ({ page }) => {
      await openList(page, win);

      const toolbar = page.getByTestId('list-toolbar');
      const mainRow = toolbar.getByTestId('list-toolbar-main-row');
      const m = await measureToolbar(page);

      // ---------------------------------------------------------------
      // 1. Tab group: exactly once, in the main row or in a second row
      //    below it, never an empty second row.
      // ---------------------------------------------------------------
      await expect(toolbar.getByTestId('list-toolbar-tabs')).toHaveCount(hasTabGroup(win) ? 1 : 0);
      expectTabGroupPlacement(m, win);

      // Subset tabs (`filter-<key>`). The main row also owns `filter-status`,
      // `filter-date` and `filter-advanced`, which share the prefix — so the
      // tabs are identified inside the tab group, and each is rendered once.
      const tabGroup = toolbar.getByTestId('list-toolbar-tabs');
      const subsetTabs = tabGroup.locator('[data-testid^="filter-"]');
      await expect(subsetTabs).toHaveCount(win.subsetTabs);
      const subsetTabIds = await subsetTabs.evaluateAll((els) => els.map((el) => el.dataset.testid));
      for (const id of subsetTabIds) {
        await expect(tabGroup.getByTestId(id)).toBeVisible();
        await expect(toolbar.getByTestId(id)).toHaveCount(1);
      }

      // The list/gallery toggle keeps its pre-ETP-5509 place: last in the
      // filters cluster, never with the subset tabs.
      const filtersCluster = toolbar.getByTestId('list-toolbar-filters');
      await expect(filtersCluster.getByTestId('view-toggle')).toHaveCount(win.viewToggle ? 1 : 0);
      await expect(toolbar.getByTestId('view-toggle')).toHaveCount(win.viewToggle ? 1 : 0);

      // ---------------------------------------------------------------
      // 2 + 3 + 4. The main row fits at this width.
      // ---------------------------------------------------------------
      expectMainRowFits(m);

      // 3 (contents half). Sort and the create action live in the main row.
      await expect(mainRow.getByTestId('list-sort-toggle')).toBeVisible();
      if (win.hasCreate) {
        await expect(mainRow.getByTestId('action-new')).toBeVisible();
      } else {
        await expect(toolbar.getByTestId('action-new')).toHaveCount(0);
      }
      if (win.hasPrint) {
        // No dedicated test id on the list Print button — role + name.
        await expect(mainRow.getByRole('button', { name: /imprimir|print/i })).toBeVisible();
      }

      // ---------------------------------------------------------------
      // 5 + 6. Separator painted; toolbar does not run into the body.
      // ---------------------------------------------------------------
      expectSeparator(m);
      expectToolbarAboveBody(m);
    });
  }
});

test.describe('List toolbar — separator at a large resolution (ETP-5509)', () => {
  // Payments In had NO separator before ETP-5509 (its table sits next to a
  // sidebar and never drew its own line) — the line must be there at any
  // width, not only at the minimum one.
  test('payment-in keeps the separator and a fitting main row at 1920×1080', async ({ page }) => {
    await openList(page, windowBySlug('payment-in'), VIEWPORT_LARGE);

    const m = await measureToolbar(page);
    expectSeparator(m);
    expectMainRowFits(m);
    expectToolbarAboveBody(m);
    await expect(page.getByTestId('list-toolbar-tabs')).toHaveCount(0);
  });
});

test.describe('List toolbar — crowded main row at 1280×720 (ETP-5509)', () => {
  // Sales Invoice is the busiest main row of the matrix (status + date +
  // "Filtros" on the left; sort, refresh, print and "Nueva factura" on the
  // right). Applying filters changes the width of the left cluster, so the row
  // is re-measured with filters applied, not only idle.
  test('sales-invoice main row still fits with a date range and a status applied', async ({ page }) => {
    await openList(page, windowBySlug('sales-invoice'));

    const mainRow = page.getByTestId('list-toolbar-main-row');
    const statusTrigger = mainRow.getByTestId('filter-status');
    const dateTrigger = mainRow.getByTestId('filter-date');
    const idleStatusLabel = (await statusTrigger.innerText()).trim();
    const idleDateLabel = (await dateTrigger.innerText()).trim();

    // --- Date filter: pick the preset with the longest label ("Últimos 12
    // meses" in es_ES). The preset buttons carry no test id, so they are taken
    // by position: the popover renders the preset column first, so its first 6
    // buttons are the presets (today … all time). "All time" clears the filter,
    // so only the first 5 are candidates.
    await dateTrigger.click();
    const datePopover = page.getByRole('dialog');
    await expect(datePopover).toBeVisible();
    const presets = datePopover.locator('button').filter({ hasNotText: /^\s*$/ });
    const presetLabels = (await presets.allInnerTexts()).slice(0, 5).map((t) => t.trim());
    const longestPreset = presetLabels.reduce((a, b) => (b.length > a.length ? b : a));
    await presets.nth(presetLabels.indexOf(longestPreset)).click();
    await expect(datePopover).toHaveCount(0);
    await expect(dateTrigger).toHaveText(longestPreset);
    expect(longestPreset).not.toBe(idleDateLabel);
    await settle(page);

    // Widest left cluster: idle status label + long date label.
    const withDate = await measureToolbar(page);
    expectMainRowFits(withDate);
    expectSeparator(withDate);
    expectTabGroupPlacement(withDate, windowBySlug('sales-invoice'));

    // --- Status filter: pick the status with the longest label. Options carry
    // no test id either; the first button is the "all statuses" entry.
    await statusTrigger.click();
    const statusPopover = page.getByRole('dialog');
    await expect(statusPopover).toBeVisible();
    const statusOptions = statusPopover.locator('button');
    await expect(statusOptions).toHaveCount(ROWS.length + 1);
    const statusLabels = (await statusOptions.allInnerTexts()).map((t) => t.trim());
    const longestStatus = statusLabels.slice(1).reduce((a, b) => (b.length > a.length ? b : a));
    await statusOptions.nth(statusLabels.indexOf(longestStatus)).click();
    await expect(statusPopover).toHaveCount(0);
    await expect(statusTrigger).toHaveText(longestStatus);
    expect(longestStatus).not.toBe(idleStatusLabel);
    await settle(page);

    const withBoth = await measureToolbar(page);
    expectMainRowFits(withBoth);
    expectSeparator(withBoth);
    // Wider filters may push the tab group to the second row — either way it
    // stays placed correctly and never leaves an empty row behind.
    expectTabGroupPlacement(withBoth, windowBySlug('sales-invoice'));
    await expect(mainRow.getByTestId('action-new')).toBeVisible();
  });
});

// ─── ETP-5509 review: one row when it fits, a second row only when not ─────
test.describe('List toolbar — the subset tabs move only when they do not fit (ETP-5509)', () => {
  // At 1920×1080 every window's toolbar is a single row: the review found
  // Product and Contacts losing a grid row to a second toolbar row they did
  // not need (Product has no subset tabs at all, see its own test below).
  for (const win of WINDOWS.filter(hasTabGroup)) {
    test(`${win.slug} keeps the tab group in the main row at 1920×1080`, async ({ page }) => {
      await openList(page, win, VIEWPORT_LARGE);

      const m = await measureToolbar(page);
      expect(m.tabsInline, 'subset tabs must share the first line when they fit').toBe(true);
      expectTabGroupPlacement(m, win);
      expectMainRowFits(m);
      expectSeparator(m);
    });
  }

  // The decision follows the width live (ResizeObserver), in both directions,
  // and moves the same element, so a focused tab keeps its focus.
  test('purchase-invoice moves the subset tabs to their own line when narrowed and back when widened', async ({ page }) => {
    // The fit is re-measured from a ResizeObserver; measuring inside its callback
    // would trip the browser's "ResizeObserver loop" error (the hook defers to rAF).
    const resizeObserverLoopErrors = await guardResizeObserverLoop(page);
    await openList(page, windowBySlug('purchase-invoice'), VIEWPORT_LARGE);
    const mainRow = page.getByTestId('list-toolbar-main-row');
    const tab = page.getByTestId('list-toolbar-tabs').getByTestId('filter-invoicestab');
    await expect(mainRow).toHaveAttribute('data-tabs-placement', 'inline');
    await tab.focus();

    // Far below the minimum supported width, so the tabs cannot fit next to
    // the filters and the actions whatever the labels measure.
    await page.setViewportSize({ width: 960, height: 720 });
    await expect(mainRow).toHaveAttribute('data-tabs-placement', 'wrapped');
    await settle(page);
    await expect(tab).toBeFocused();
    const narrow = await measureToolbar(page);
    expectTabGroupPlacement(narrow, windowBySlug('purchase-invoice'));
    // Filters and actions never touch, even this narrow.
    const [filters, actions] = narrow.clusters;
    expect(actions.left - filters.right).toBeGreaterThanOrEqual(MIN_CLUSTER_GAP_PX - EDGE_TOLERANCE_PX);

    // Tabs switch from their own line as well.
    await tab.click();
    await expect(tab).toHaveClass(/bg-card/);

    await page.setViewportSize(VIEWPORT_LARGE);
    await expect(mainRow).toHaveAttribute('data-tabs-placement', 'inline');
    await expect(tab).toHaveClass(/bg-card/);

    // Through the minimum supported width as well, in both directions.
    await page.setViewportSize(VIEWPORT_MIN);
    await settle(page);
    await page.setViewportSize(VIEWPORT_LARGE);
    await settle(page);
    expect(await resizeObserverLoopErrors(), 'no ResizeObserver loop error while resizing').toEqual([]);
  });

  // Review W1 — "debería estar como antes": Product's view toggle stays after
  // "Filtros", as before ETP-5509, at the minimum and at a large resolution.
  for (const viewport of [VIEWPORT_MIN, VIEWPORT_LARGE]) {
    test(`product keeps the view toggle after Filtros at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await openList(page, windowBySlug('product'), viewport);

      const filters = page.getByTestId('list-toolbar-filters');
      const toggle = filters.getByTestId('view-toggle');
      const advanced = filters.getByTestId('filter-advanced');
      await expect(toggle).toBeVisible();
      await expect(advanced).toBeVisible();
      const isLast = await toggle.evaluate((el) => el.parentElement.lastElementChild === el);
      expect(isLast, 'view toggle must be the last control of the filters cluster').toBe(true);
      const [toggleBox, advancedBox] = await Promise.all([toggle.boundingBox(), advanced.boundingBox()]);
      expect(toggleBox.x).toBeGreaterThanOrEqual(advancedBox.x + advancedBox.width);
      expect(Math.abs(toggleBox.y + toggleBox.height / 2 - (advancedBox.y + advancedBox.height / 2)))
        .toBeLessThanOrEqual(EDGE_TOLERANCE_PX + 2);
      await expect(page.getByTestId('list-toolbar-tabs')).toHaveCount(0);
    });
  }
});

// Observed live at 1280×720 with the rail expanded (es_ES): Contacts and
// Purchase Invoice keep the subset tabs on the first line; Sales Invoice, the
// busiest main row (status + date + Filtros; sort, refresh, print, Nueva
// factura), sends them to a line of their own.
test.describe('List toolbar — subset tab placement at 1280×720 (ETP-5509)', () => {
  const EXPECTED_PLACEMENT = [
    { slug: 'contacts', placement: 'inline' },
    { slug: 'purchase-invoice', placement: 'inline' },
    { slug: 'sales-invoice', placement: 'wrapped' },
  ];

  for (const { slug, placement } of EXPECTED_PLACEMENT) {
    test(`${slug} places the subset tabs ${placement}`, async ({ page }) => {
      const win = windowBySlug(slug);
      await openList(page, win);

      await expect(page.getByTestId('list-toolbar-main-row')).toHaveAttribute('data-tabs-placement', placement);
      const m = await measureToolbar(page);
      expect(m.tabsInline).toBe(placement === 'inline');
      expectTabGroupPlacement(m, win);
      expectMainRowFits(m);
    });
  }
});
