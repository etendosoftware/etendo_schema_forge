import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-5237 — Lines-grid leading columns must not collapse at a narrow
 * (laptop, ~1280px) viewport (regression spec).
 *
 * Bug: `linesColumnWidth.js` gave the leading elastic lines-grid columns
 * (string/text/enum/select/date types, and the leading `grow` selector/
 * search column at idx 0) `flex-shrink: 1` in their CSS flex shorthand. At a
 * narrow viewport that let the flex algorithm shrink them toward zero width,
 * visually overlapping the left sidebar instead of triggering the existing
 * `overflow-x-auto` scroll wrapper (ETP-5133). Worst on Purchase Invoice,
 * which also carries a right-side attachments/preview drop panel that eats
 * into the available width.
 *
 * Fix (dda0a605c): `selectorFlex()` and the elastic-type branch of
 * `columnFlex()` in `tools/app-shell/src/lib/linesColumnWidth.js` now emit
 * `1 0 <basis>px` instead of `1 1 <basis>px` — grow allowed, shrink
 * disabled. The column holds its basis width and the row overflows into the
 * scoped `overflow-x-auto` wrapper (`bodyScrollRef` in
 * `InlineLinesPanel.jsx`) instead of collapsing.
 *
 * This spec forces a 1280px-wide viewport (the laptop width named in the bug
 * report) across the 6 windows using `window.linesLayout: "inlineEditable"`
 * and, for each one, asserts against the REAL leading elastic column(s) that
 * window's own `LinesTable.jsx` declares (confirmed by reading the generated
 * column config for each window — see `leadingColumns` below):
 *
 *   1. Each leading column's header cell holds at least its basis width
 *      (no collapse).
 *   2. Adjacent leading-column header cells never overlap.
 *   3. The body-rows scroll wrapper has `overflow-x: auto` (ETP-5133
 *      mechanism present) on every window; windows whose leading-column
 *      total genuinely exceeds the available content width at 1280px also
 *      assert `scrollWidth > clientWidth` (`expectOverflow: true` below —
 *      purchase-invoice, sales-invoice, sales-quotation. goods-shipment/
 *      goods-receipt/simple-g-l-journal have fewer/no elastic columns and
 *      legitimately fit without scrolling even at this width — the
 *      regression under test is the collapse/overlap, not forced scrolling).
 *   4. The grid never starts to the left of the sidebar's right edge (no
 *      overlap with the left nav).
 *
 * A dedicated extra test for purchase-invoice (the worst-case window, with
 * its right-side attachments panel) scrolls the body wrapper all the way to
 * its trailing fixed column (`grossAmount`) and confirms it becomes visible,
 * proving horizontal scroll actually works end-to-end rather than just
 * having the right CSS property.
 */

const VIEWPORT = { width: 1280, height: 800 };

// ---------------------------------------------------------------------------
// Per-window fixtures. `headerEntity` / `lineEntity` mirror the exact URL
// segments the app fetches (`${apiBaseUrl}/${entity}/...`), confirmed by
// reading each window's generated HeaderPage/*Page.jsx (`detailEntity="..."`)
// — same values `lines-overflow-etp5133.mocked.spec.js` already established.
//
// `leadingColumns` is the ordered list of column keys that are actually
// ELASTIC (flex-grow, no-shrink) at their rendered index — confirmed by
// reading each window's generated `LinesTable.jsx` column config against
// `linesColumnWidth.js`'s ELASTIC_BASIS_PX / selector-at-idx0 rules:
//   - selector/search/foreignKey at idx 0            -> basis 192
//   - string/text/enum/select (any idx)               -> basis 224
//   - date (any idx)                                   -> basis 130
// A selector/search column at idx > 0 (e.g. `tax`, `accountingCombination`
// on simple-g-l-journal where `lineNo` occupies idx 0) is FIXED
// (`0 0 192px`), not elastic, so it is deliberately excluded here — it was
// never shrinkable and is not part of this regression.
// ---------------------------------------------------------------------------

const WINDOWS = [
  {
    slug: 'purchase-invoice',
    headerEntity: 'header',
    lineEntity: 'lines',
    headerId: 'mock-narrow-pinv-001',
    hasSidePanel: true, // decisions.json -> attachments: true -> DetailSidePanel
    expectOverflow: true,
    leadingColumns: [
      { key: 'product', minBasis: 192 },
      { key: 'description', minBasis: 224 },
    ],
    trailingColumnKey: 'grossAmount',
    header: {
      id: 'mock-narrow-pinv-001',
      documentNo: 'PINV-NARROW-001',
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
      grandTotalAmount: 382.9,
      currency: 'eur-1',
      'currency$_identifier': 'EUR',
    },
    lines: [
      {
        id: 'pinv-narrow-line-1', product: 'prod-1', 'product$_identifier': 'Aceite de Oliva Virgen Extra 1L',
        description: 'Pedido especial cocina central', invoicedQuantity: 10, listPrice: 12.5,
        etgoDiscount: 5, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 118.75,
      },
      {
        id: 'pinv-narrow-line-2', product: 'prod-2', 'product$_identifier': 'Harina de Trigo Integral 25kg',
        description: 'Reposición almacén central', invoicedQuantity: 4, listPrice: 32.0,
        etgoDiscount: 0, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', grossAmount: 140.8,
      },
      {
        id: 'pinv-narrow-line-3', product: 'prod-3', 'product$_identifier': 'Detergente Industrial Concentrado 5L',
        description: 'Reposición almacén', invoicedQuantity: 6, listPrice: 18.9,
        etgoDiscount: 10, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 123.35,
      },
    ],
  },
  {
    slug: 'sales-invoice',
    headerEntity: 'header',
    lineEntity: 'lines',
    headerId: 'mock-narrow-sinv-001',
    hasSidePanel: false,
    expectOverflow: true,
    leadingColumns: [
      { key: 'product', minBasis: 192 },
      { key: 'description', minBasis: 224 },
    ],
    header: {
      id: 'mock-narrow-sinv-001',
      documentNo: 'SINV-NARROW-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      businessPartner: 'bp-2',
      'businessPartner$_identifier': 'Cliente Ejemplo S.A.',
      invoiceDate: '2026-08-01',
      grandTotalAmount: 250.4,
      currency: 'eur-1',
      'currency$_identifier': 'EUR',
    },
    lines: [
      {
        id: 'sinv-narrow-line-1', product: 'prod-4', 'product$_identifier': 'Vino Tinto Reserva 750ml',
        description: 'Caja de 6 unidades', invoicedQuantity: 12, listPrice: 9.5,
        etgoDiscount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 137.94,
      },
      {
        id: 'sinv-narrow-line-2', product: 'prod-5', 'product$_identifier': 'Queso Manchego Curado 500g',
        description: 'Lote de temporada', invoicedQuantity: 8, listPrice: 11.75,
        etgoDiscount: 5, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 107.35,
      },
    ],
  },
  {
    slug: 'goods-shipment',
    headerEntity: 'goodsShipment',
    lineEntity: 'goodsShipmentLine',
    headerId: 'mock-narrow-gs-001',
    hasSidePanel: false,
    expectOverflow: false,
    leadingColumns: [
      { key: 'product', minBasis: 192 },
    ],
    header: {
      id: 'mock-narrow-gs-001',
      documentNo: 'GS-NARROW-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      businessPartner: 'bp-3',
      'businessPartner$_identifier': 'Distribuidora Norte S.L.',
      movementDate: '2026-08-01',
      warehouse: 'wh-1',
      'warehouse$_identifier': 'Almacén Principal',
    },
    lines: [
      {
        id: 'gs-narrow-line-1', product: 'prod-7', 'product$_identifier': 'Café en Grano Arábica 1kg',
        movementQuantity: 20, orderQuantity: 20,
      },
      {
        id: 'gs-narrow-line-2', product: 'prod-8', 'product$_identifier': 'Azúcar Moreno de Caña 5kg',
        movementQuantity: 15, orderQuantity: 15,
      },
    ],
  },
  {
    slug: 'goods-receipt',
    headerEntity: 'goodsReceipt',
    lineEntity: 'goodsReceiptLine',
    headerId: 'mock-narrow-gr-001',
    hasSidePanel: false,
    expectOverflow: false,
    leadingColumns: [
      { key: 'product', minBasis: 192 },
    ],
    header: {
      id: 'mock-narrow-gr-001',
      documentNo: 'GR-NARROW-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      businessPartner: 'bp-4',
      'businessPartner$_identifier': 'Proveedor Frescos S.A.',
      movementDate: '2026-08-01',
      warehouse: 'wh-1',
      'warehouse$_identifier': 'Almacén Principal',
    },
    lines: [
      {
        id: 'gr-narrow-line-1', product: 'prod-10', 'product$_identifier': 'Tomate Rama Ecológico 1kg',
        movementQuantity: 40, orderQuantity: 40,
      },
      {
        id: 'gr-narrow-line-2', product: 'prod-11', 'product$_identifier': 'Pechuga de Pollo Fileteada 1kg',
        movementQuantity: 25, orderQuantity: 25,
      },
    ],
  },
  {
    slug: 'sales-quotation',
    headerEntity: 'quotation',
    lineEntity: 'quotationLine',
    headerId: 'mock-narrow-quot-001',
    hasSidePanel: false,
    expectOverflow: true,
    leadingColumns: [
      { key: 'product', minBasis: 192 },
      { key: 'description', minBasis: 224 },
    ],
    header: {
      id: 'mock-narrow-quot-001',
      documentNo: 'CQ-NARROW-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      businessPartner: 'bp-5',
      'businessPartner$_identifier': 'Hostelería del Sur S.L.',
      orderDate: '2026-08-01',
      validUntil: '2026-09-01',
      grandTotalAmount: 458.15,
      'currency$_identifier': 'EUR',
    },
    lines: [
      {
        id: 'quot-narrow-line-1', product: 'prod-13', 'product$_identifier': 'Jamón Ibérico de Bellota Loncheado',
        description: 'Bandeja 200g', orderedQuantity: 15, listPrice: 14.9,
        discount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', lineGrossAmount: 270.5,
      },
      {
        id: 'quot-narrow-line-2', product: 'prod-14', 'product$_identifier': 'Pan de Masa Madre Artesanal',
        description: 'Elaboración diaria', orderedQuantity: 30, listPrice: 3.5,
        discount: 5, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', lineGrossAmount: 109.73,
      },
    ],
  },
  {
    slug: 'simple-g-l-journal',
    headerEntity: 'gLJournal',
    lineEntity: 'gLJournalLine',
    headerId: 'mock-narrow-glj-001',
    hasSidePanel: false,
    expectOverflow: false,
    leadingColumns: [
      { key: 'description', minBasis: 224 },
    ],
    header: {
      id: 'mock-narrow-glj-001',
      documentNo: 'GLJ-NARROW-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      posted: false,
      glJournalDate: '2026-08-01',
      foreignCurrencyDebit: 0,
      foreignCurrencyCredit: 0,
    },
    lines: [
      {
        id: 'glj-narrow-line-1', lineNo: 10, accountingCombination: 'acc-1',
        'accountingCombination$_identifier': '4300000000 - Clientes',
        description: 'Reclasificación de saldo pendiente', foreignCurrencyDebit: 500, foreignCurrencyCredit: 0,
      },
      {
        id: 'glj-narrow-line-2', lineNo: 20, accountingCombination: 'acc-2',
        'accountingCombination$_identifier': '5720000000 - Bancos c/c',
        description: 'Contrapartida del asiento', foreignCurrencyDebit: 0, foreignCurrencyCredit: 500,
      },
    ],
  },
];

/**
 * Installs mocks for one window. Line entity route is registered FIRST
 * (lower LIFO priority) matching only the line entity path; header route is
 * registered SECOND excluding the line entity path — mirrors
 * `lines-overflow-etp5133.mocked.spec.js` / `goods-shipment-billing-badge.mocked.spec.js`,
 * needed because header/line entity names can share a prefix
 * (e.g. goodsShipment / goodsShipmentLine).
 */
async function installMocks(page, win) {
  const { slug, headerEntity, lineEntity, header, lines } = win;

  await page.route(
    (url) => url.href.includes(`/sws/neo/${slug}/${lineEntity}`),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: lines, totalRows: lines.length } }),
        });
        return;
      }
      route.fallback();
    }
  );

  await page.route(
    (url) => url.href.includes(`/sws/neo/${slug}/${headerEntity}`) && !url.href.includes(`/${lineEntity}`),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [header] } }),
        });
        return;
      }

      const detailMatch = url.match(new RegExp(`/${headerEntity}/([^/?]+)(\\?.*)?$`));
      if (detailMatch && !['evaluate-display', 'defaults', 'selectors'].includes(detailMatch[1])) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [header] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [header], totalRows: 1 } }),
      });
    }
  );
}

/** Navigates to the window's Lines tab and returns the `inline-lines-panel` locator. */
async function openLinesTab(page, win) {
  await login(page);
  await installMocks(page, win);

  // The bug is about the sidebar overlapping the lines table — that only
  // happens with the sidebar expanded (240px, showing menu labels), matching
  // a user who keeps the sidebar pinned open (the realistic case the bug was
  // filed against). Seeded before navigation, same key SidebarContext.jsx reads.
  await page.addInitScript(() => {
    try { localStorage.setItem('sidebar-expanded', 'true'); } catch { /* noop */ }
  });

  // Set the 1280px "laptop, no external monitor" viewport BEFORE navigating so
  // the app renders its layout at this size from the start — no
  // deviceScaleFactor override, this is the raw viewport at 100% zoom.
  await page.setViewportSize(VIEWPORT);

  await page.goto(`/${win.slug}/${win.headerId}`);
  await page.waitForSelector('[data-testid="detail-view"]', { timeout: 10_000 }).catch(() => {});

  // Lines tab key is hardcoded 'lines' for every window (buildInitialTabs).
  await page.getByTestId('tab-lines').click();

  const panel = page.getByTestId('inline-lines-panel');
  await panel.waitFor({ timeout: 10_000 }).catch(() => {});
  // Let row content/fonts settle before measuring.
  await page.waitForTimeout(300);
  return panel;
}

test.describe('Lines grid — narrow viewport (1280px) leading-column integrity', () => {
  for (const win of WINDOWS) {
    test(`leading columns hold their width and stay ordered — ${win.slug}`, async ({ page }) => {
      const panel = await openLinesTab(page, win);

      // -----------------------------------------------------------------
      // 1 + 2. Leading elastic columns hold at least their basis width and
      // never overlap their neighbor — the exact regression: before the
      // fix, `flex-shrink: 1` let these columns collapse toward zero.
      // -----------------------------------------------------------------
      const boxes = [];
      for (const { key, minBasis } of win.leadingColumns) {
        const cell = page.getByTestId(`column-header-${key}`);
        await expect(cell).toBeVisible();
        const box = await cell.boundingBox();
        expect(box).not.toBeNull();
        // Small tolerance for subpixel/border rounding.
        expect(box.width).toBeGreaterThanOrEqual(minBasis - 2);
        boxes.push({ key, box });
      }
      for (let i = 0; i < boxes.length - 1; i++) {
        const a = boxes[i].box;
        const b = boxes[i + 1].box;
        expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
      }

      // -----------------------------------------------------------------
      // 3. The body-rows wrapper (ETP-5133's scoped scroll container,
      // `bodyScrollRef` — the SECOND direct child of the panel, the sticky
      // header wrapper being the first) has `overflow-x: auto` on every
      // window. Windows whose leading-column total genuinely exceeds the
      // available width at 1280px (see `expectOverflow` in the fixture
      // above) additionally must have `scrollWidth > clientWidth` —
      // confirming the extra width is absorbed by scroll, not by clipping
      // or by the columns silently shrinking back below their basis.
      // -----------------------------------------------------------------
      const bodyWrapper = panel.locator(':scope > div').nth(1);
      await expect(bodyWrapper).toHaveCount(1);
      const { overflowX, scrollWidth, clientWidth } = await bodyWrapper.evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflowX).toBe('auto');
      if (win.expectOverflow) {
        expect(scrollWidth).toBeGreaterThan(clientWidth);
      }

      // -----------------------------------------------------------------
      // 4. The grid never starts to the left of the sidebar's right edge —
      // no horizontal intersection with the left nav. `SideMenu.jsx` renders
      // `<nav aria-label={ui('navigation')}>` with no data-testid forwarded
      // to its own DOM root (the AppLayout-level
      // `data-testid="SideMenu__488148"` prop is dropped) — role="navigation"
      // is the stable, i18n-independent hook for it instead.
      // -----------------------------------------------------------------
      const sideMenu = page.getByRole('navigation').first();
      const [sideMenuBox, panelBox] = await Promise.all([
        sideMenu.boundingBox(),
        panel.boundingBox(),
      ]);
      expect(sideMenuBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(panelBox.x).toBeGreaterThanOrEqual(sideMenuBox.x + sideMenuBox.width);
    });
  }
});

test.describe('Lines grid — purchase-invoice horizontal scroll reaches trailing column', () => {
  const win = WINDOWS.find(w => w.slug === 'purchase-invoice');

  test('scrolling the body wrapper reveals the trailing fixed column', async ({ page }) => {
    const panel = await openLinesTab(page, win);
    const bodyWrapper = panel.locator(':scope > div').nth(1);

    const trailingCell = page.getByTestId(`column-header-${win.trailingColumnKey}`);
    const clientWidth = await bodyWrapper.evaluate((el) => el.clientWidth);

    // Before scrolling, at 1280px the trailing column is past the visible
    // edge of the (non-scrolled) wrapper — its header cell x-position sits
    // beyond what's currently in view.
    const boxBefore = await trailingCell.boundingBox();
    expect(boxBefore).not.toBeNull();

    await bodyWrapper.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(150);

    const boxAfter = await trailingCell.boundingBox();
    expect(boxAfter).not.toBeNull();
    // The column visibly moved left as the wrapper scrolled underneath it.
    expect(boxAfter.x).toBeLessThan(boxBefore.x);
    // And it now sits fully inside the wrapper's own visible width — the
    // scroll genuinely brought it into view, not just moved it partway.
    const wrapperBox = await bodyWrapper.boundingBox();
    expect(boxAfter.x).toBeGreaterThanOrEqual(wrapperBox.x - 1);
    expect(boxAfter.x + boxAfter.width).toBeLessThanOrEqual(wrapperBox.x + clientWidth + 1);

    await expect(trailingCell).toBeVisible();
  });
});
