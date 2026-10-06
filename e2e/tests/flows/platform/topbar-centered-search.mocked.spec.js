// @covers tools/app-shell/src/components/layout/TopBar/TopBar.jsx
// @covers tools/app-shell/src/pages/ReportViewerPage.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * ETP-5509 — the top bar search is centered in the bar whatever sits beside it.
 *
 * `TopBar.jsx` lays the header out as a 3-column grid
 * (`minmax(0,1fr) | auto | minmax(max-content,1fr)`):
 *
 *   col 1  back button + `topbar-title-block` (title row with count + kebab, breadcrumb) —
 *          shrinkable, its texts elide at the column edge
 *   col 2  `topbar-search-slot` holding the 392px `global-search-trigger`
 *   col 3  `topbar-quick-actions`, pushed to the right edge
 *
 * The two side tracks are equal, so the search center must match the bar center no matter how
 * long the title is, whether there is a back button, how wide the right group is, or how wide
 * the navigation rail is. jsdom has no layout, so the unit suite (`TopBar.vitest.jsx`) can only
 * pin the classes; this spec measures the geometry.
 *
 * Coordinate method: every rect comes from `getBoundingClientRect()` read in ONE `evaluate`, so
 * all of them share the same coordinate space. No page-level transform or zoom was found on these
 * routes, and because only centers and edges of elements in the same space are compared, a
 * uniform scale would cancel out anyway.
 *
 * "Bar center" is the center of the header's BORDER box — the visible bar, not a padding-shifted
 * content box. The header has no horizontal padding (`px-0`): the 24px right inset lives on the
 * actions group (`pr-6`, inside its own track), so the grid tracks span the whole bar and the
 * search lands on its visual center. Before that fix the header carried `pl-0 pr-6` and the
 * search sat 12px left of the bar center while still being centered on the content box — which
 * is why the content box is deliberately NOT what this spec measures against.
 *
 * The grid gap is 20px (`gap-5`, ETP-5504 QA): the left column ends exactly 20px before the
 * search, and a long title/breadcrumb block reaches that edge (the title kebab lives inside the
 * title row, so it no longer stops the block a kebab's width short of it).
 *
 * Breadcrumb shrink priority (ETP-5504 QA): the structured breadcrumb is a one-row grid whose
 * ancestor tracks are content-sized, so with short ancestors and a long current level ONLY the
 * current level elides — every ancestor keeps its full text.
 *
 * The fix must not move the sides either: the left column starts at the header's left edge (right
 * after the rail) and the last right action ends 24px inside the header's right edge.
 *
 * Pages (mock mode renders `es_ES`):
 *   - `/warehouse`         list, short title ("Almacén")
 *   - `/purchase-invoice`  list, longer title ("Factura de Compra")
 *   - `/sales-order/:id`   document detail; the record has a very long document number, so the
 *                          title AND the breadcrumb's current level must elide (no back button:
 *                          document details do not publish one)
 *   - `/report-viewer?report=:id`  report viewer, the page that publishes `onBack`: back button +
 *                          very long report title + breadcrumb that must elide
 * Each at 1280×720 and 1920×1080, with the navigation rail expanded and collapsed.
 */

// Header column gap (`gap-5`): left column / title block end exactly this far before the search.
const SEARCH_GAP_PX = 20;
// Sub-pixel allowance for centers (rounding of the 1fr tracks).
const CENTER_TOLERANCE_PX = 1;
// Sub-pixel / border rounding allowance for edge comparisons.
const EDGE_TOLERANCE_PX = 1;
// The right actions keep a 24px (`pr-6`) inset from the bar's right edge.
const RIGHT_INSET_PX = 24;

const VIEWPORTS = [
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
];
// The rail is 240px expanded and 56px collapsed; the header starts right after it. The bounds
// below only prove the seeded state really took effect (it is the variable under test).
const RAIL_STATES = [
  { label: 'rail expanded', expanded: 'true', headerLeft: { min: 200, max: 300 } },
  { label: 'rail collapsed', expanded: 'false', headerLeft: { min: 0, max: 100 } },
];

// Long enough to overflow the left column even at 1920px with the rail collapsed
// (column ≈ (1920 - 56 - 392 - 2·20) / 2 ≈ 716px; this is far wider at text-xl and text-xs).
const LONG_DOCUMENT_NO = 'SO-2026-000123456789-PEDIDO-DE-VENTA-CON-UN-NUMERO-DE-DOCUMENTO-'
  + 'EXTRAORDINARIAMENTE-LARGO-PARA-FORZAR-EL-TRUNCADO-DEL-TITULO-Y-DEL-BREADCRUMB';
const LONG_RECORD = {
  id: 'topbar-long-record',
  documentNo: LONG_DOCUMENT_NO,
  _identifier: LONG_DOCUMENT_NO,
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  'businessPartner$_identifier': 'Proveedor Test S.L.',
};

const LONG_REPORT_ID = 'e2e-topbar-long-report';
const LONG_REPORT_TITLE = `Informe ${LONG_DOCUMENT_NO}`;
// A synthetic, non-catalog report with no parameters: the per-report access filter lets it
// through without a grant, and opening it fires no selector request
// (same approach as report-selector-cookie.mocked.spec.js).
const REPORT_MANIFEST = [
  {
    id: LONG_REPORT_ID,
    category: 'finance',
    type: 'listing',
    orientation: 'portrait',
    outputs: ['pdf'],
    title: { en_US: `Report ${LONG_DOCUMENT_NO}`, es_ES: LONG_REPORT_TITLE },
    parameters: [],
  },
];

/**
 * `expectedTitle`     text the TopBar title must show (waited for before measuring).
 * `long`              the title and breadcrumb must elide.
 * `back`              the back button is expected.
 * `structuredBreadcrumb`  the page publishes an array breadcrumb with short ancestors and a long
 *                     current level (rendered as the `<nav>` grid): only the current may elide.
 */
const PAGES = [
  { name: 'list, short title', path: '/warehouse', expectedTitle: 'Almacén', long: false, back: false },
  { name: 'list, longer title', path: '/purchase-invoice', expectedTitle: 'Factura de Compra', long: false, back: false },
  {
    name: 'document detail, long title + breadcrumb',
    path: `/sales-order/${LONG_RECORD.id}`,
    expectedTitle: LONG_DOCUMENT_NO,
    long: true,
    back: false,
    structuredBreadcrumb: true,
  },
  {
    name: 'report viewer, back button + long title + breadcrumb',
    path: `/report-viewer?report=${LONG_REPORT_ID}`,
    expectedTitle: LONG_REPORT_TITLE,
    long: true,
    back: true,
    structuredBreadcrumb: true,
  },
];

/**
 * Sales Order header mock: list and detail both answer with the long record. Must run AFTER
 * login() (routes match in reverse registration order). Two routes, never the brace form — see
 * docs/e2e-testing-guide.md → "a route pattern ending in a bare `word**`".
 */
async function installSalesOrderMock(page) {
  const handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isDetail = new RegExp(`/header/${LONG_RECORD.id}(?:[/?]|$)`).test(url.pathname);
    const isList = /\/header\/?$/.test(url.pathname);
    if (req.method() !== 'GET' || !(isDetail || isList)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [LONG_RECORD], totalRows: 1 } }),
    });
  };
  await page.route('**/sws/neo/sales-order/header/**', handler);
  await page.route('**/sws/neo/sales-order/header**', handler);
}

async function installReportMock(page) {
  await page.route('**/api/reports', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REPORT_MANIFEST) });
  });
}

async function openPage(page, target, viewport, rail) {
  await login(page);
  await installSalesOrderMock(page);
  await installReportMock(page);
  // Same key SidebarContext.jsx reads; seeded before the app boots.
  await page.addInitScript((expanded) => {
    try { localStorage.setItem('sidebar-expanded', expanded); } catch { /* noop */ }
  }, rail.expanded);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(target.path);

  const titleBlock = page.getByTestId('topbar-title-block');
  await expect(titleBlock).toContainText(target.expectedTitle, { timeout: 15_000 });
  await expect(page.getByTestId('global-search-trigger')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Reads every geometry fact the assertions need in a single round-trip. */
async function measureTopBar(page) {
  return page.getByTestId('topbar-search-slot').evaluate((slot) => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };
    const header = slot.closest('header');
    const headerRect = rect(header);

    const byId = (id) => header.querySelector(`[data-testid="${id}"]`);
    const titleBlock = byId('topbar-title-block');
    // The title is the element that elides inside the title block's first row.
    const titleText = titleBlock?.firstElementChild?.firstElementChild ?? null;
    // Structured breadcrumbs elide on their current level; string ones on the breadcrumb itself.
    const breadcrumbText = byId('topbar-breadcrumb-current') ?? byId('topbar-breadcrumb');
    const overflowFacts = (el) => (el
      ? {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        textOverflow: getComputedStyle(el).textOverflow,
      }
      : null);

    // Ancestor levels of a structured breadcrumb: each `flex min-w-0` wrapper placed directly in
    // the <nav> grid, and the label inside it (the "⋯" wrapper is `shrink-0`, the current level
    // has no wrapper). Both the wrapper and the label must show their whole text.
    const nav = byId('topbar-breadcrumb');
    const breadcrumbIsGrid = nav?.tagName === 'NAV';
    const breadcrumbAncestors = breadcrumbIsGrid
      ? Array.from(nav.querySelectorAll(':scope > span.flex.min-w-0'))
        .flatMap((wrapper) => [wrapper, wrapper.firstElementChild])
        .map((el) => ({ text: el.textContent, ...overflowFacts(el) }))
      : [];

    const quickActions = byId('topbar-quick-actions');
    const quickActionChildren = Array.from(quickActions.children)
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map(rect);

    const searchTrigger = byId('global-search-trigger');
    return {
      header: headerRect,
      headerScrollWidth: header.scrollWidth,
      headerClientWidth: header.clientWidth,
      headerCenter: (headerRect.left + headerRect.right) / 2,
      slot: rect(slot),
      search: rect(searchTrigger),
      leftColumn: titleBlock ? rect(titleBlock.parentElement) : null,
      titleBlock: titleBlock ? rect(titleBlock) : null,
      title: overflowFacts(titleText),
      breadcrumb: overflowFacts(breadcrumbText),
      breadcrumbIsGrid,
      breadcrumbAncestors,
      quickActions: rect(quickActions),
      quickActionChildren,
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
    };
  });
}

const center = (r) => (r.left + r.right) / 2;

for (const viewport of VIEWPORTS) {
  for (const rail of RAIL_STATES) {
    test.describe(`TopBar centered search — ${viewport.label}, ${rail.label} (ETP-5509)`, () => {
      for (const target of PAGES) {
        test(`search stays centered — ${target.name}`, async ({ page }) => {
          await openPage(page, target, viewport, rail);

          await expect(page.getByTestId('topbar-back')).toHaveCount(target.back ? 1 : 0);

          // 1. The search is centered in the bar. Polled: the left column settles once the
          //    record / report title arrives and the web fonts are applied.
          await expect.poll(async () => {
            const m = await measureTopBar(page);
            return Math.abs(center(m.search) - m.headerCenter);
          }, {
            message: 'global-search-trigger center must match the center of the visible bar (header border box)',
            timeout: 5_000,
          }).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);

          const m = await measureTopBar(page);
          test.info().annotations.push({
            type: 'geometry',
            description: `searchCenter-barCenter=${(center(m.search) - m.headerCenter).toFixed(2)}px `
              + `leftColumn-barLeft=${(m.leftColumn ? m.leftColumn.left - m.header.left : NaN).toFixed(2)}px `
              + `barRight-lastAction=${(m.header.right - Math.max(...m.quickActionChildren.map((r) => r.right))).toFixed(2)}px`,
          });
          expect(m.header.left, `navigation rail is not ${rail.label}`).toBeGreaterThanOrEqual(rail.headerLeft.min);
          expect(m.header.left, `navigation rail is not ${rail.label}`).toBeLessThanOrEqual(rail.headerLeft.max);
          expect(Math.abs(center(m.slot) - m.headerCenter), 'topbar-search-slot is off the bar center')
            .toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
          expect(m.search.width, 'the search keeps its 392px width').toBeGreaterThanOrEqual(392 - EDGE_TOLERANCE_PX);

          // 2. The left column never reaches the search.
          expect(m.leftColumn, 'title column not found').not.toBeNull();
          expect(m.leftColumn.right, 'left column overlaps the search')
            .toBeLessThanOrEqual(m.search.left + EDGE_TOLERANCE_PX);
          expect(m.titleBlock.right, 'title block overlaps the search')
            .toBeLessThanOrEqual(m.search.left + EDGE_TOLERANCE_PX);
          // The left column starts exactly at the bar's left edge (= right after the rail, whose
          // width is guarded above): centering the search must not have shifted it.
          expect(Math.abs(m.leftColumn.left - m.header.left), 'left column does not start at the bar left edge')
            .toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
          // The left column ends exactly the 20px grid gap before the search.
          expect(Math.abs((m.search.left - m.leftColumn.right) - SEARCH_GAP_PX),
            `left column must end ${SEARCH_GAP_PX}px before the search`)
            .toBeLessThanOrEqual(EDGE_TOLERANCE_PX);

          // 3. A long title / breadcrumb elides instead of overflowing.
          if (target.long) {
            expect(m.title, 'title element not found').not.toBeNull();
            expect(m.title.textOverflow).toBe('ellipsis');
            expect(m.title.scrollWidth, 'long title must be truncated')
              .toBeGreaterThan(m.title.clientWidth);
            expect(m.breadcrumb, 'breadcrumb element not found').not.toBeNull();
            expect(m.breadcrumb.textOverflow).toBe('ellipsis');
            expect(m.breadcrumb.scrollWidth, 'long breadcrumb must be truncated')
              .toBeGreaterThan(m.breadcrumb.clientWidth);
            // The block that overflows fills the whole column: it reaches the 20px gap before the
            // search, not a kebab's width short of it.
            expect(Math.abs((m.search.left - m.titleBlock.right) - SEARCH_GAP_PX),
              `long title/breadcrumb block must end ${SEARCH_GAP_PX}px before the search`)
              .toBeLessThanOrEqual(EDGE_TOLERANCE_PX);
          }

          // 3b. Shrink priority: short ancestors keep their whole text, only the current elides.
          if (target.structuredBreadcrumb) {
            expect(m.breadcrumbIsGrid, 'structured breadcrumb must render as the <nav> grid').toBe(true);
            expect(m.breadcrumbAncestors.length, 'breadcrumb ancestors not found').toBeGreaterThan(0);
            for (const ancestor of m.breadcrumbAncestors) {
              expect(ancestor.scrollWidth, `ancestor "${ancestor.text}" must not be truncated`)
                .toBeLessThanOrEqual(ancestor.clientWidth);
            }
          }

          // 4. Right actions: inside the bar, on one line, clear of the search.
          expect(m.quickActions.left, 'right actions overlap the search')
            .toBeGreaterThanOrEqual(m.search.right - EDGE_TOLERANCE_PX);
          expect(m.quickActions.right, 'right actions overflow the bar')
            .toBeLessThanOrEqual(m.header.right + EDGE_TOLERANCE_PX);
          expect(m.quickActions.top).toBeGreaterThanOrEqual(m.header.top - EDGE_TOLERANCE_PX);
          expect(m.quickActions.bottom).toBeLessThanOrEqual(m.header.bottom + EDGE_TOLERANCE_PX);
          expect(m.quickActionChildren.length, 'right group must hold at least one action').toBeGreaterThan(0);
          const firstTop = Math.min(...m.quickActionChildren.map((r) => r.top));
          const lastBottom = Math.max(...m.quickActionChildren.map((r) => r.bottom));
          const tallest = Math.max(...m.quickActionChildren.map((r) => r.height));
          expect(lastBottom - firstTop, 'right actions wrapped onto a second line')
            .toBeLessThanOrEqual(tallest + EDGE_TOLERANCE_PX);
          // The last action keeps its 24px inset from the bar's right edge.
          const lastActionRight = Math.max(...m.quickActionChildren.map((r) => r.right));
          expect(Math.abs((m.header.right - lastActionRight) - RIGHT_INSET_PX),
            `last right action must end ${RIGHT_INSET_PX}px inside the bar right edge`)
            .toBeLessThanOrEqual(EDGE_TOLERANCE_PX);

          // 5. No horizontal overflow — neither of the header nor of the page.
          expect(m.headerScrollWidth, 'header overflows horizontally')
            .toBeLessThanOrEqual(m.headerClientWidth);
          expect(m.page.scrollWidth, 'page overflows horizontally')
            .toBeLessThanOrEqual(m.page.clientWidth);
        });
      }
    });
  }
}
