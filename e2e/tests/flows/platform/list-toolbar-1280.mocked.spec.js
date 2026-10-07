import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * ETP-5509 — List toolbar layout at the minimum supported resolution
 * (1280×720, navigation rail expanded).
 *
 * The idle list bar (`ListView.jsx`) is a column of up to two rows closed by a
 * separator line:
 *
 *   list-toolbar            container, carries the bottom border
 *   ├─ list-toolbar-main-row  filters cluster (left) + main actions cluster (right)
 *   └─ list-toolbar-tabs-row  the tab group (subset tabs + list/gallery toggle),
 *                             rendered ONLY when the window has one
 *
 * Before the change the tab group opened row 1, where at 1280px it competed for
 * width with the filters and the actions. jsdom has no layout, so the unit
 * suite (`ListView.toolbarLayout.vitest.jsx`) can only pin WHERE each control
 * lives in the DOM — this spec is the only automated guard for what the ticket
 * is actually about: that nothing overflows, overlaps or gets clipped at
 * 1280×720, and that the separator is really painted.
 *
 * Mock mode renders in `es_ES`, the wider of the two locales — kept on purpose.
 *
 * Per window (see `WINDOWS`), in this order:
 *   1. The tabs row exists exactly when the window has a tab group; when it
 *      does, it is a real second row (starts at or below the main row's bottom)
 *      and hosts the tabs / view toggle, which are absent from the main row.
 *   2. The main row does not overflow horizontally.
 *   3. Every visible main-row button sits inside the toolbar box and is not
 *      clipped; the create action is present exactly where the window has one.
 *   4. The main row's two clusters do not overlap.
 *   5. The toolbar paints a bottom border (the toolbar/body separator).
 *   6. The toolbar ends at or above the top of the list body.
 */
// @covers tools/app-shell/src/components/contract-ui/ListView.jsx
// @covers artifacts/chart-of-accounts/custom/ChartOfAccountsToolbarSlot.jsx

const VIEWPORT_MIN = { width: 1280, height: 720 };
const VIEWPORT_LARGE = { width: 1920, height: 1080 };

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
 * `viewToggle`  which toolbar row hosts the list/gallery toggle, or null when
 *               the window has no gallery. The tabs row is expected exactly
 *               when `subsetTabs > 0 || viewToggle === 'tabs-row'`.
 * `hasCreate`   false for windows that pass `hideCreate`.
 * `hasPrint`    true when the window keeps the list Print button in row 1.
 */
const WINDOWS = [
  { slug: 'purchase-invoice', entity: 'header', subsetTabs: 3, viewToggle: null, hasCreate: true, hasPrint: false },
  { slug: 'sales-invoice', entity: 'header', subsetTabs: 3, viewToggle: null, hasCreate: true, hasPrint: true },
  { slug: 'contacts', entity: 'businessPartner', subsetTabs: 3, viewToggle: null, hasCreate: true, hasPrint: false },
  // PENDING CONFIRMATION — the toggle sitting in row 2 is an interpretation of
  // ETP-5509. If it goes back to the main row, change 'tabs-row' to 'main-row'
  // here (Product then expects no tabs row at all) and drop the isolated
  // "view toggle placement" describe at the bottom of this file.
  { slug: 'product', entity: 'product', subsetTabs: 0, viewToggle: 'tabs-row', hasCreate: true, hasPrint: false },
  { slug: 'warehouse', entity: 'warehouse', subsetTabs: 0, viewToggle: null, hasCreate: true, hasPrint: false },
  { slug: 'payment-in', entity: 'finPayment', subsetTabs: 0, viewToggle: null, hasCreate: false, hasPrint: false },
  { slug: 'payment-out', entity: 'header', subsetTabs: 0, viewToggle: null, hasCreate: false, hasPrint: false },
  { slug: 'chart-of-accounts', entity: 'elementValue', subsetTabs: 0, viewToggle: null, hasCreate: true, hasPrint: true },
];

const windowBySlug = (slug) => WINDOWS.find((w) => w.slug === slug);
const expectsTabsRow = (win) => win.subsetTabs > 0 || win.viewToggle === 'tabs-row';

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
    const tabsRow = toolbar.querySelector('[data-testid="list-toolbar-tabs-row"]');
    const body = toolbar.closest('[data-testid="list-view"]')?.querySelector('table') ?? null;
    return {
      toolbar: rect(toolbar),
      borderBottomWidth: getComputedStyle(toolbar).borderBottomWidth,
      borderBottomStyle: getComputedStyle(toolbar).borderBottomStyle,
      mainRow: { ...rect(mainRow), scrollWidth: mainRow.scrollWidth, clientWidth: mainRow.clientWidth },
      clusters: Array.from(mainRow.children).map(rect),
      tabsRow: tabsRow ? rect(tabsRow) : null,
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

  // 4. Filters cluster (left) and actions cluster (right) do not overlap.
  expect(m.clusters, 'main row must be split into exactly two clusters').toHaveLength(2);
  const [filters, actions] = m.clusters;
  expect(filters.right, 'filters cluster overlaps the actions cluster')
    .toBeLessThanOrEqual(actions.left + EDGE_TOLERANCE_PX);
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
      const tabsRow = toolbar.getByTestId('list-toolbar-tabs-row');
      const m = await measureToolbar(page);

      // ---------------------------------------------------------------
      // 1. Second row: present exactly when the window has a tab group,
      //    really below the main row, and hosting the tab group.
      // ---------------------------------------------------------------
      await expect(tabsRow).toHaveCount(expectsTabsRow(win) ? 1 : 0);
      if (expectsTabsRow(win)) {
        expect(m.tabsRow.top, 'tabs row must start below the main row')
          .toBeGreaterThanOrEqual(m.mainRow.bottom - EDGE_TOLERANCE_PX);
        expect(m.tabsRow.bottom, 'tabs row must stay inside the toolbar')
          .toBeLessThanOrEqual(m.toolbar.bottom + EDGE_TOLERANCE_PX);
      }

      // Subset tabs (`filter-<key>`). The main row owns `filter-status`,
      // `filter-date` and `filter-advanced`, which share the prefix — so the
      // tabs are identified by the ids found in the tabs row, and each of
      // those ids must be absent from the main row.
      const subsetTabs = tabsRow.locator('[data-testid^="filter-"]');
      await expect(subsetTabs).toHaveCount(win.subsetTabs);
      const subsetTabIds = await subsetTabs.evaluateAll((els) => els.map((el) => el.dataset.testid));
      for (const id of subsetTabIds) {
        await expect(tabsRow.getByTestId(id)).toBeVisible();
        await expect(mainRow.getByTestId(id)).toHaveCount(0);
      }

      // List/gallery toggle, in whichever row the matrix names.
      await expect(tabsRow.getByTestId('view-toggle')).toHaveCount(win.viewToggle === 'tabs-row' ? 1 : 0);
      await expect(mainRow.getByTestId('view-toggle')).toHaveCount(win.viewToggle === 'main-row' ? 1 : 0);

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
    await expect(page.getByTestId('list-toolbar-tabs-row')).toHaveCount(0);
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
    // The tab group is still a row of its own below the (now filtered) main row.
    expect(withBoth.tabsRow).not.toBeNull();
    expect(withBoth.tabsRow.top).toBeGreaterThanOrEqual(withBoth.mainRow.bottom - EDGE_TOLERANCE_PX);
    await expect(mainRow.getByTestId('action-new')).toBeVisible();
  });
});

// ─── ISOLATED ON PURPOSE ────────────────────────────────────────────────────
// Placing the list/gallery view toggle in row 2 is an interpretation of
// ETP-5509 still pending confirmation with the product owner. This describe is
// self-contained: if the decision is reversed, delete it and flip Product's
// `viewToggle` in WINDOWS — nothing else in the file depends on it.
test.describe('List toolbar — view toggle placement on Product (pending confirmation)', () => {
  test('product renders the view toggle in the second row at 1280×720', async ({ page }) => {
    await openList(page, windowBySlug('product'));

    const mainRow = page.getByTestId('list-toolbar-main-row');
    const tabsRow = page.getByTestId('list-toolbar-tabs-row');
    const toggle = tabsRow.getByTestId('view-toggle');

    await expect(toggle).toBeVisible();
    await expect(mainRow.getByTestId('view-toggle')).toHaveCount(0);
    await expect(page.getByTestId('view-toggle')).toHaveCount(1);

    const [toggleBox, mainRowBox] = await Promise.all([toggle.boundingBox(), mainRow.boundingBox()]);
    expect(toggleBox).not.toBeNull();
    expect(mainRowBox).not.toBeNull();
    expect(toggleBox.y).toBeGreaterThanOrEqual(mainRowBox.y + mainRowBox.height - EDGE_TOLERANCE_PX);
  });
});
