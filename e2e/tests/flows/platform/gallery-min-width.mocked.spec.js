// @covers tools/app-shell/src/windows/custom/product/ProductGallery.jsx
// @covers tools/app-shell/src/pages/ReportViewerPage.jsx
// @covers tools/app-shell/src/components/ui/gallery-grid.jsx

import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * ETP-5516 — Galleries: minimum card width and wrapping.
 *
 * The Products gallery (`ProductGallery.jsx`) and the report catalog gallery
 * (`ReportViewerPage.jsx`, one grid per category) share `GalleryGrid`
 * (`tools/app-shell/src/components/ui/gallery-grid.jsx`), whose track template is
 * `repeat(auto-fill, minmax(min(220px, 100%), 1fr))`: the column count follows the
 * CONTAINER width (rail expanded/collapsed, viewport), never a viewport breakpoint, and no
 * card goes below 220 px — extra cards wrap to the next row instead of shrinking.
 *
 * jsdom cannot do layout, so this spec is the only real guard of the scenarios:
 *   - 1280×720, rail expanded  → 4 columns (fewer per row, none below the minimum);
 *   - 1280×720, rail collapsed → 5 columns (Products: 5 per row instead of the old 6);
 *   - 1920×1080, rail collapsed → more columns than at 1280, same minimum;
 *   - every track ≥ 220 px, no horizontal page overflow;
 *   - a long product name is ellipsised only when it is wider than its card.
 *
 * Measurements are LAYOUT widths (computed `grid-template-columns`, `offsetWidth`,
 * `clientWidth`/`scrollWidth`), never `getBoundingClientRect()`: the app shell applies a
 * page-level transform that scales visual rects by ~0.98, which would make a 220 px track
 * read as ~216 px.
 *
 * Rail state is seeded through `localStorage['sidebar-expanded']` (SidebarContext.jsx) with
 * `addInitScript`, and the viewport is set, BEFORE the first navigation.
 */

const MIN_CARD_WIDTH_PX = 220;
// Sub-pixel rounding allowance for track/card widths.
const WIDTH_TOLERANCE_PX = 1;
// Allowance for a document that is a hair wider than the viewport due to rounding.
const PAGE_OVERFLOW_TOLERANCE_PX = 1;
const LAYOUT_SETTLE_TIMEOUT_MS = 10_000;

const VIEWPORT_1280 = { width: 1280, height: 720 };
const VIEWPORT_1920 = { width: 1920, height: 1080 };

const EXPECTED_COLUMNS_1280_EXPANDED = 4;
const EXPECTED_COLUMNS_1280_COLLAPSED = 5;
// 7 × 220 + 6 × 16 (gap-4) = 1636 px fits the ~1780 px content area at 1920 with the rail
// collapsed, 8 tracks (1872 px) do not — so 7 is stable, not a sub-pixel coincidence.
const EXPECTED_COLUMNS_1920_COLLAPSED = 7;

const LONG_PRODUCT_NAME =
  'Extra virgin olive oil from the Sierra de Cazorla cooperative, premium 5 litre tin, export pack';
const SHORT_PRODUCT_NAME = 'Salt';

const PRODUCT_ROWS = [
  { id: 'gmw-prod-01', name: LONG_PRODUCT_NAME, searchKey: 'GMW-001' },
  { id: 'gmw-prod-02', name: SHORT_PRODUCT_NAME, searchKey: 'GMW-002' },
  { id: 'gmw-prod-03', name: 'Organic whole wheat flour, stone ground, 25 kg industrial sack', searchKey: 'GMW-003' },
  { id: 'gmw-prod-04', name: 'Coffee beans', searchKey: 'GMW-004' },
  { id: 'gmw-prod-05', name: 'Cane sugar 5 kg', searchKey: 'GMW-005' },
  { id: 'gmw-prod-06', name: 'Industrial concentrated detergent for professional kitchens 5 L', searchKey: 'GMW-006' },
  { id: 'gmw-prod-07', name: 'Red wine reserve 750 ml', searchKey: 'GMW-007' },
  { id: 'gmw-prod-08', name: 'Cured Manchego cheese 500 g', searchKey: 'GMW-008' },
  { id: 'gmw-prod-09', name: 'Sourdough bread', searchKey: 'GMW-009' },
  { id: 'gmw-prod-10', name: 'Tomatoes', searchKey: 'GMW-010' },
].map((row) => ({ ...row, active: true }));

// Non-catalog report ids (not in ReportAccessCatalog), so the per-report access filter never
// hides them; a single category, so the page renders exactly one gallery grid.
const REPORT_ROWS = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: `gmw-report-${n}`,
    title: { en_US: `Gallery width report ${n}`, es_ES: `Informe de ancho de galería ${n}` },
    type: 'listing',
    category: 'sales',
    outputs: ['pdf', 'xlsx'],
    parameters: [],
  };
});

async function installProductMocks(page) {
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const url = new URL(req.url());
    const detail = url.pathname.match(/\/sws\/neo\/product\/product\/([^/?]+)$/);
    if (detail) {
      const found = PRODUCT_ROWS.find((r) => r.id === detail[1]);
      if (!found) return route.fallback();
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
    }
    if (url.pathname.endsWith('/sws/neo/product/product')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: PRODUCT_ROWS, totalRows: PRODUCT_ROWS.length } }),
      });
    }
    return route.fallback();
  };
  // Two-route pattern (docs/e2e-testing-guide.md): sub-paths and the bare/query-string list.
  await page.route('**/sws/neo/product/product/**', handler);
  await page.route('**/sws/neo/product/product**', handler);
}

async function installReportCatalogMock(page) {
  // `/api/reports` is the dev-server report catalogue (vite-plugins/report-api.js) fetched raw
  // by ReportViewerPage; mocked so the card count does not depend on the repo's report set.
  await page.route((url) => url.pathname === '/api/reports', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(REPORT_ROWS),
  }));
}

async function prepare(page, { viewport, railExpanded }) {
  await login(page);
  await page.addInitScript((expanded) => {
    try { localStorage.setItem('sidebar-expanded', expanded ? 'true' : 'false'); } catch { /* noop */ }
  }, railExpanded);
  await page.setViewportSize(viewport);
}

async function openProductGallery(page, opts) {
  await prepare(page, opts);
  await installProductMocks(page);
  await page.addInitScript(() => {
    // Start from list mode so the test exercises the real view toggle.
    try { localStorage.setItem('viewMode:product', 'list'); } catch { /* noop */ }
  });
  await page.goto('/product');
  const toggle = page.getByTestId('view-toggle');
  await expect(toggle).toBeVisible({ timeout: LAYOUT_SETTLE_TIMEOUT_MS });
  await toggle.getByRole('button').last().click();
  const grid = page.getByTestId('gallery-grid');
  await expect(grid).toBeVisible({ timeout: LAYOUT_SETTLE_TIMEOUT_MS });
  await expect(grid.locator(':scope > *')).toHaveCount(PRODUCT_ROWS.length);
  return grid;
}

async function openReportGallery(page, opts) {
  await prepare(page, opts);
  await installReportCatalogMock(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('viewMode:report-catalog', 'gallery'); } catch { /* noop */ }
  });
  await page.goto('/report-viewer');
  const grid = page.getByTestId('gallery-grid');
  await expect(grid).toHaveCount(1, { timeout: LAYOUT_SETTLE_TIMEOUT_MS });
  await expect(grid.locator(':scope > *')).toHaveCount(REPORT_ROWS.length);
  return grid;
}

/** Resolved track widths (layout px) from the computed `grid-template-columns`. */
async function trackWidths(grid) {
  return grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => Number.parseFloat(w)));
}

/** Waits for the column count to settle (late scrollbar / data arrival) and returns the tracks. */
async function settledTracks(grid, expectedCount) {
  if (expectedCount !== undefined) {
    await expect.poll(async () => (await trackWidths(grid)).length, {
      timeout: LAYOUT_SETTLE_TIMEOUT_MS,
    }).toBe(expectedCount);
  }
  return trackWidths(grid);
}

async function expectTracksAtLeastMinimum(grid, tracks) {
  for (const width of tracks) {
    expect(width).toBeGreaterThanOrEqual(MIN_CARD_WIDTH_PX - WIDTH_TOLERANCE_PX);
  }
  // Every rendered card is as wide as a track — none is squeezed below the minimum.
  const cardWidths = await grid.locator(':scope > *').evaluateAll(
    (cards) => cards.map((card) => card.offsetWidth),
  );
  for (const width of cardWidths) {
    expect(width).toBeGreaterThanOrEqual(MIN_CARD_WIDTH_PX - WIDTH_TOLERANCE_PX);
  }
}

async function expectNoHorizontalPageOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + PAGE_OVERFLOW_TOLERANCE_PX);
}

const GALLERIES = [
  { name: 'Products', open: openProductGallery },
  { name: 'Reports', open: openReportGallery },
];

for (const gallery of GALLERIES) {
  test.describe(`${gallery.name} gallery — minimum card width (ETP-5516)`, () => {
    test(`1280×720, rail expanded → ${EXPECTED_COLUMNS_1280_EXPANDED} columns, none below the minimum`, async ({ page }) => {
      const grid = await gallery.open(page, { viewport: VIEWPORT_1280, railExpanded: true });
      const tracks = await settledTracks(grid, EXPECTED_COLUMNS_1280_EXPANDED);
      await expectTracksAtLeastMinimum(grid, tracks);
      await expectNoHorizontalPageOverflow(page);
    });

    test(`1280×720, rail collapsed → ${EXPECTED_COLUMNS_1280_COLLAPSED} columns, none below the minimum`, async ({ page }) => {
      const grid = await gallery.open(page, { viewport: VIEWPORT_1280, railExpanded: false });
      const tracks = await settledTracks(grid, EXPECTED_COLUMNS_1280_COLLAPSED);
      await expectTracksAtLeastMinimum(grid, tracks);
      await expectNoHorizontalPageOverflow(page);
    });

    test(`1920×1080, rail collapsed → ${EXPECTED_COLUMNS_1920_COLLAPSED} columns (more than at 1280), same minimum`, async ({ page }) => {
      const grid = await gallery.open(page, { viewport: VIEWPORT_1920, railExpanded: false });
      const tracks = await settledTracks(grid, EXPECTED_COLUMNS_1920_COLLAPSED);
      expect(tracks.length).toBeGreaterThan(EXPECTED_COLUMNS_1280_COLLAPSED);
      await expectTracksAtLeastMinimum(grid, tracks);
      await expectNoHorizontalPageOverflow(page);
    });
  });
}

test.describe('Products gallery — long names (ETP-5516)', () => {
  test('a long name is ellipsised only when wider than its card; the card keeps the minimum', async ({ page }) => {
    const grid = await openProductGallery(page, { viewport: VIEWPORT_1280, railExpanded: false });
    await settledTracks(grid, EXPECTED_COLUMNS_1280_COLLAPSED);

    const measure = (locator) => locator.evaluate((el) => {
      const card = el.parentElement.parentElement;
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        textOverflow: getComputedStyle(el).textOverflow,
        whiteSpace: getComputedStyle(el).whiteSpace,
        cardWidth: card.offsetWidth,
        cardIsGridChild: card.parentElement?.dataset.testid === 'gallery-grid',
      };
    });

    const long = await measure(grid.getByText(LONG_PRODUCT_NAME, { exact: true }));
    expect(long.cardIsGridChild).toBe(true);
    expect(long.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_WIDTH_PX - WIDTH_TOLERANCE_PX);
    expect(long.whiteSpace).toBe('nowrap');
    expect(long.textOverflow).toBe('ellipsis');
    expect(long.scrollWidth).toBeGreaterThan(long.clientWidth);

    const short = await measure(grid.getByText(SHORT_PRODUCT_NAME, { exact: true }));
    expect(short.cardIsGridChild).toBe(true);
    expect(short.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_WIDTH_PX - WIDTH_TOLERANCE_PX);
    expect(short.scrollWidth).toBeLessThanOrEqual(short.clientWidth);
  });
});
