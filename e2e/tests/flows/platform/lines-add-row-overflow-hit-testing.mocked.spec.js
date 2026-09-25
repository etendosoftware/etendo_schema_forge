import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * ETP-5133 BUG-1 regression — real-click hit-testing on the add-row's Product
 * cell once the shared scroll host GENUINELY overflows.
 *
 * QA reject cycle #1 found that the add-row's Product/Description columns
 * collapsed to 0px whenever the lines grid's shared scroll container
 * overflowed — a real, non-synthetic Playwright click on the Product search
 * button landed on the adjacent cell instead (`intercepts pointer events`
 * timeout), because the `<td>` itself had zero width. jsdom cannot reproduce
 * this class of bug at all — it has no real box layout, so a component test
 * can assert a `<col>`'s computed `style.width` string but can never prove a
 * click actually LANDS on the element it targets. Only a real browser can.
 *
 * Root cause and the fix that actually works are documented in
 * `growColumnWidth()`'s own doc comment (`DataTable.jsx`): a `<col>` width
 * containing a percentage token — bare, in `calc()`, or in `max()` — is
 * resolved by Chromium's `<colgroup>` sizing algorithm using ONLY the
 * percentage ratio between percentage-bearing columns, silently discarding
 * every additive pixel constant; when the table is narrower than or equal to
 * the sum of its purely-pixel columns, that leftover is 0 and EVERY
 * percentage-bearing column renders at 0px. The fix measures the real
 * scroll-host width via `ResizeObserver` and computes a literal `"Npx"`
 * string in JavaScript instead of asking CSS to resolve a percentage.
 *
 * This spec forces the SAME 1280px "laptop, sidebar expanded" viewport
 * `lines-grid-narrow-viewport.mocked.spec.js` already proved makes
 * purchase-invoice's lines grid genuinely overflow (`expectOverflow: true`
 * there), opens the draft's Lines tab, clicks "Añadir línea" to reveal the
 * add-row (portaled into the SAME scroll host the saved rows scroll in —
 * see `lib/linesScrollHost.js`), and:
 *   1. Re-confirms the shared scroll host genuinely overflows (the
 *      precondition BUG-1 depended on — the bug never reproduced on an
 *      `overflow-visible` wrapper).
 *   2. Asserts the Product cell's bounding box has a non-zero width BEFORE
 *      clicking it (the direct, numeric regression guard for BUG-1: a
 *      collapsed `<td>` has `width === 0`).
 *   3. Performs a REAL (non-synthetic, non-forced) Playwright click on it —
 *      exactly what QA's original bug report showed failing — and asserts
 *      the product search drawer actually opens, proving the click was not
 *      silently swallowed by an overlapping sibling cell.
 */

const VIEWPORT = { width: 1280, height: 800 };

const HEADER_ID = 'mock-addrow-pinv-001';

const HEADER = {
  id: HEADER_ID,
  documentNo: 'PINV-ADDROW-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  businessPartner: 'bp-1',
  'businessPartner$_identifier': 'Proveedor Test S.L.',
  transactionDocument: 'doc-type-ap-invoice',
  'transactionDocument$_identifier': 'AP Invoice',
  partnerAddress: 'addr-1',
  priceList: 'pl-1',
  paymentTerms: 'pt-1',
  paymentMethod: 'pm-1',
  invoiceDate: '2026-08-01',
  // requiredHeaderFields (HeaderPage.jsx) also gates canAddLines — every one
  // of them must be present or "Añadir línea" never renders at all, per
  // resolveCanAddLines() in detailViewHelpers.jsx.
  accountingDate: '2026-08-01',
  grandTotalAmount: 382.9,
  currency: 'eur-1',
  'currency$_identifier': 'EUR',
};

// Same 3-line dataset `lines-grid-narrow-viewport.mocked.spec.js` uses for
// purchase-invoice at this exact viewport (already verified there to make
// the lines grid's shared scroll host genuinely overflow, `expectOverflow:
// true`) — reused here so this spec exercises the identical overflow
// precondition rather than a hand-picked one.
const LINES = [
  {
    id: 'pinv-addrow-line-1', product: 'prod-1', 'product$_identifier': 'Aceite de Oliva Virgen Extra 1L',
    description: 'Pedido especial cocina central', invoicedQuantity: 10, listPrice: 12.5,
    etgoDiscount: 5, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 118.75,
  },
  {
    id: 'pinv-addrow-line-2', product: 'prod-2', 'product$_identifier': 'Harina de Trigo Integral 25kg',
    description: 'Reposición almacén central', invoicedQuantity: 4, listPrice: 32.0,
    etgoDiscount: 0, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', grossAmount: 140.8,
  },
  {
    id: 'pinv-addrow-line-3', product: 'prod-3', 'product$_identifier': 'Detergente Industrial Concentrado 5L',
    description: 'Reposición almacén', invoicedQuantity: 6, listPrice: 18.9,
    etgoDiscount: 10, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 123.35,
  },
];

/**
 * Installs header + lines mocks. Mirrors the LIFO-ordered, prefix-safe
 * pattern established in `lines-overflow-etp5133.mocked.spec.js` /
 * `lines-grid-narrow-viewport.mocked.spec.js`: the line route is registered
 * FIRST (lower priority) matching only the line entity path, the header
 * route SECOND excluding it.
 */
async function installMocks(page) {
  await page.route(
    (url) => url.href.includes('/sws/neo/purchase-invoice/lines'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: LINES, totalRows: LINES.length } }),
        });
        return;
      }
      route.fallback();
    },
  );

  await page.route(
    (url) => url.href.includes('/sws/neo/purchase-invoice/header') && !url.href.includes('/lines'),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [HEADER] } }),
        });
        return;
      }

      const detailMatch = url.match(/\/header\/([^/?]+)(\?.*)?$/);
      if (detailMatch && !['evaluate-display', 'defaults', 'selectors'].includes(detailMatch[1])) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [HEADER] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [HEADER], totalRows: 1 } }),
      });
    },
  );

  // Product selector — feeds the ProductSearchDrawer opened from the add-row's
  // Product cell. Registered AFTER login() (LIFO), so it wins over the
  // generic '/selectors/' branch login() already installs.
  await page.route('**/selectors/M_Product_ID{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ id: 'prod-addrow-001', label: 'Aceite de Girasol 5L', name: 'Aceite de Girasol 5L', searchKey: 'ACG-5L', standardPrice: 11 }],
        hasMore: false,
        totalCount: 1,
      }),
    });
  });

  // partnerAddress (C_BPartner_Location_ID) is a `dependent` field
  // (PartnerAddressPicker/CreatableSearchSelect) — it re-fetches its own
  // options whenever the parent `businessPartner` value is present, and if
  // the header's current value is not among the returned options it
  // "self-heals" by auto-selecting the first option (or clearing itself if
  // there are none) — see CreatableSearchSelect.jsx's own comment ("Only
  // clear when there are no options and the field had a stale value").
  // Without a specific mock here, login()'s generic '/selectors/' catch-all
  // answers with a single unrelated synthetic item (id 'prod-e2e'), which
  // does not match HEADER.partnerAddress ('addr-1') and made the picker
  // silently overwrite/clear it — which cascades into `resolveCanAddLines()`
  // treating the header as incomplete and hiding "Añadir línea" entirely.
  await page.route('**/selectors/C_BPartner_Location_ID{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ id: HEADER.partnerAddress, label: 'Proveedor Test S.L. — Sede Central', name: 'Proveedor Test S.L. — Sede Central' }],
      }),
    });
  });
}

test.describe('ETP-5133 BUG-1 — add-row Product cell real-click hit-testing under forced overflow', () => {
  test('a real click on the Product selector opens product search, not an overlapping cell', async ({ page }) => {
    await login(page);
    await installMocks(page);

    // Sidebar expanded (`sidebar-expanded` — the key `SidebarContext.jsx`
    // reads) is part of the same overflow precondition the sibling specs
    // established: it eats into the available content width, which is what
    // makes the 1280px viewport genuinely overflow rather than merely be
    // narrow.
    await page.addInitScript(() => {
      try { localStorage.setItem('sidebar-expanded', 'true'); } catch { /* noop */ }
    });
    await page.setViewportSize(VIEWPORT);

    await page.goto(`/purchase-invoice/${HEADER_ID}`);
    await page.waitForSelector('[data-testid="detail-view"]', { timeout: 10_000 }).catch(() => {});

    // Lines tab key is hardcoded 'lines' for every window (buildInitialTabs).
    await page.getByTestId('tab-lines').click();

    const panel = page.getByTestId('inline-lines-panel');
    await panel.waitFor({ timeout: 10_000 }).catch(() => {});
    // Let row content/fonts settle before measuring.
    await page.waitForTimeout(300);

    // -----------------------------------------------------------------
    // Precondition — the shared scroll host (bodyScrollRef, the SECOND
    // direct child of the panel; the sticky header wrapper is the first)
    // genuinely overflows at this viewport. This is the exact condition
    // BUG-1 depended on: it never reproduced while the add-row's own
    // wrapper was `overflow-visible` (pre-ETP-5133) or while the shared
    // host had room to spare.
    // -----------------------------------------------------------------
    const bodyWrapper = panel.locator(':scope > div').nth(1);
    await expect(bodyWrapper).toHaveCount(1);
    const { scrollWidth, clientWidth } = await bodyWrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // -----------------------------------------------------------------
    // Reveal the add-row (portaled into that SAME overflowing scroll host
    // — see lib/linesScrollHost.js).
    // -----------------------------------------------------------------
    await page.getByTestId('action-add-line').click();
    const inlineAddRow = page.getByTestId('inline-add-row');
    await expect(inlineAddRow).toBeVisible({ timeout: 5_000 });

    const productField = inlineAddRow.getByTestId('inline-add-field-product');
    await expect(productField).toBeVisible();

    // -----------------------------------------------------------------
    // The direct, numeric regression guard for BUG-1: a collapsed <td>
    // renders its content at width 0. Assert real width BEFORE the click.
    // -----------------------------------------------------------------
    const boxBeforeClick = await productField.boundingBox();
    expect(boxBeforeClick).not.toBeNull();
    expect(boxBeforeClick.width).toBeGreaterThan(0);

    // -----------------------------------------------------------------
    // The actual regression: a REAL, non-forced, non-synthetic click.
    // Playwright's default `.click()` performs real actionability checks
    // (visible, stable, receives events) and fails with a
    // "subtree intercepts pointer events" timeout if an overlapping
    // sibling (e.g. the quantity cell, per QA's original report) is what
    // actually sits at this element's own coordinates.
    // -----------------------------------------------------------------
    await productField.click();

    const drawer = page.getByTestId('product-search-drawer');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('product-search-option-prod-addrow-001')).toBeVisible({ timeout: 5_000 });
  });
});
