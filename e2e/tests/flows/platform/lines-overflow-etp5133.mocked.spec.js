// @covers tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
// @covers tools/app-shell/src/lib/linesContentWidth.js
// @covers tools/app-shell/src/lib/linesColumnWidth.js
import { test, expect } from '@playwright/test';
import { captureScreenshot } from '../../helpers/captureScreenshot.js';
import { login } from '../../helpers/auth.js';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5133 — Lines-table overflow no longer overlaps the sidebar (regression spec).
 *
 * Bug: on a narrow/laptop-width viewport at 100% zoom, the Lines-tab table in
 * windows using `window.linesLayout: "inlineEditable"` overlapped the left
 * sidebar (and, on purchase-invoice, the right-hand attachments/document
 * preview panel) instead of scrolling horizontally within its own bounds.
 * Root cause: `InlineLinesPanel.jsx` had no scoped `overflow-x-auto` wrapper
 * around the lines table, so overflow fell through to the whole
 * detail-content pane instead of being contained to the table.
 *
 * Fix (738af8395): the header and body are now two independently-scrolled
 * wrapper divs, synced via `scrollLeft`. The body rows live in
 * `<div ref={bodyScrollRef} className="overflow-x-auto" ...>` (plus
 * `pb-4` room for the last line's hover shadow, see
 * `computeBodyScrollClassName`); the
 * header's own outer wrapper keeps `sticky top-0` with NO overflow of its
 * own (an `overflow-x` ancestor between the sticky header and its real
 * scrolling ancestor would silence `position: sticky`), while an INNER
 * `overflow-x-hidden` div is driven programmatically by the body's scroll
 * position so columns stay aligned.
 *
 * This spec opens each of the 6 affected windows in edit mode with a few
 * line rows, switches to the Lines tab at a 1366x768 viewport (no
 * deviceScaleFactor trickery — the bug is about the physical viewport
 * shrinking while the browser stays at 100% zoom, sidebar expanded), and:
 *   1. Asserts the body-rows wrapper has `overflow-x: auto` (the fix's
 *      mechanism is in place, even on windows where the visual symptom
 *      never appeared at this exact viewport/dataset — 4 of the 6 didn't).
 *   2. Asserts no bounding-box overlap between the lines table and the left
 *      nav sidebar (all 6 windows), and — for purchase-invoice specifically,
 *      the one window with a right-hand attachments panel enabled
 *      (`decisions.json` → `attachments: true`) — the DetailSidePanel too.
 *      Purchase-invoice is the window whose BEFORE evidence showed a
 *      dramatic overlap; this is the assertion that must have flipped from
 *      failing to passing.
 *   3. Asserts the sticky header stays pinned (`top` unchanged) after the
 *      body wrapper is scrolled horizontally — the exact regression the
 *      developer identified and worked around while building the fix.
 *
 * Also saves an AFTER screenshot per window to
 * artifacts/delivery-evidence/ETP-5133/, alongside the pre-existing BEFORE
 * screenshots, for direct visual comparison.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = resolve(__dirname, '../../../../artifacts/delivery-evidence/ETP-5133');
mkdirSync(EVIDENCE_DIR, { recursive: true });

const VIEWPORT = { width: 1366, height: 768 };

// ---------------------------------------------------------------------------
// Per-window fixtures. `headerEntity` / `lineEntity` are the exact URL
// segments the app fetches (`${apiBaseUrl}/${entity}/...`) — confirmed by
// reading each window's generated HeaderPage/*Page.jsx (`detailEntity="..."`).
// The Lines tab itself is ALWAYS keyed `tab-lines` regardless of the real
// line entity name (see buildInitialTabs in detailViewHelpers.jsx — the tab
// key is hardcoded 'lines'), so navigation is uniform across all 6 windows.
// ---------------------------------------------------------------------------

const WINDOWS = [
  {
    slug: 'purchase-invoice',
    headerEntity: 'header',
    lineEntity: 'lines',
    headerId: 'mock-pinv-001',
    hasSidePanel: true, // decisions.json → attachments: true → DetailSidePanel
    header: {
      id: 'mock-pinv-001',
      documentNo: 'PINV-EVID-001',
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
        id: 'pinv-line-1', product: 'prod-1', 'product$_identifier': 'Aceite de Oliva Virgen Extra 1L',
        description: 'Pedido especial cocina central', invoicedQuantity: 10, listPrice: 12.5,
        etgoDiscount: 5, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 118.75,
      },
      {
        id: 'pinv-line-2', product: 'prod-2', 'product$_identifier': 'Harina de Trigo Integral 25kg',
        description: '', invoicedQuantity: 4, listPrice: 32.0,
        etgoDiscount: 0, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', grossAmount: 140.8,
      },
      {
        id: 'pinv-line-3', product: 'prod-3', 'product$_identifier': 'Detergente Industrial Concentrado 5L',
        description: 'Reposición almacén', invoicedQuantity: 6, listPrice: 18.9,
        etgoDiscount: 10, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 123.35,
      },
    ],
  },
  {
    slug: 'sales-invoice',
    headerEntity: 'header',
    lineEntity: 'lines',
    headerId: 'mock-sinv-001',
    hasSidePanel: false,
    header: {
      id: 'mock-sinv-001',
      documentNo: 'SINV-EVID-001',
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
        id: 'sinv-line-1', product: 'prod-4', 'product$_identifier': 'Vino Tinto Reserva 750ml',
        description: 'Caja de 6 unidades', invoicedQuantity: 12, listPrice: 9.5,
        etgoDiscount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 137.94,
      },
      {
        id: 'sinv-line-2', product: 'prod-5', 'product$_identifier': 'Queso Manchego Curado 500g',
        description: '', invoicedQuantity: 8, listPrice: 11.75,
        etgoDiscount: 5, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 107.35,
      },
      {
        id: 'sinv-line-3', product: 'prod-6', 'product$_identifier': 'Aceitunas Rellenas Anchoa 350g',
        description: 'Promoción verano', invoicedQuantity: 5, listPrice: 3.2,
        etgoDiscount: 0, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', grossAmount: 17.6,
      },
    ],
  },
  {
    slug: 'goods-shipment',
    headerEntity: 'goodsShipment',
    lineEntity: 'goodsShipmentLine',
    headerId: 'mock-gs-001',
    hasSidePanel: false,
    header: {
      id: 'mock-gs-001',
      documentNo: 'GS-EVID-001',
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
        id: 'gs-line-1', product: 'prod-7', 'product$_identifier': 'Café en Grano Arábica 1kg',
        movementQuantity: 20, orderQuantity: 20,
      },
      {
        id: 'gs-line-2', product: 'prod-8', 'product$_identifier': 'Azúcar Moreno de Caña 5kg',
        movementQuantity: 15, orderQuantity: 15,
      },
      {
        id: 'gs-line-3', product: 'prod-9', 'product$_identifier': 'Sal Marina Fina 1kg',
        movementQuantity: 30, orderQuantity: 25,
      },
    ],
  },
  {
    slug: 'goods-receipt',
    headerEntity: 'goodsReceipt',
    lineEntity: 'goodsReceiptLine',
    headerId: 'mock-gr-001',
    hasSidePanel: false,
    header: {
      id: 'mock-gr-001',
      documentNo: 'GR-EVID-001',
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
        id: 'gr-line-1', product: 'prod-10', 'product$_identifier': 'Tomate Rama Ecológico 1kg',
        movementQuantity: 40, orderQuantity: 40,
      },
      {
        id: 'gr-line-2', product: 'prod-11', 'product$_identifier': 'Pechuga de Pollo Fileteada 1kg',
        movementQuantity: 25, orderQuantity: 25,
      },
      {
        id: 'gr-line-3', product: 'prod-12', 'product$_identifier': 'Leche Entera UHT 1L',
        movementQuantity: 50, orderQuantity: 48,
      },
    ],
  },
  {
    slug: 'sales-quotation',
    headerEntity: 'quotation',
    lineEntity: 'quotationLine',
    headerId: 'mock-quot-001',
    hasSidePanel: false,
    header: {
      id: 'mock-quot-001',
      documentNo: 'CQ-EVID-001',
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
        id: 'quot-line-1', product: 'prod-13', 'product$_identifier': 'Jamón Ibérico de Bellota Loncheado',
        description: 'Bandeja 200g', orderedQuantity: 15, listPrice: 14.9,
        discount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', lineGrossAmount: 270.5,
      },
      {
        id: 'quot-line-2', product: 'prod-14', 'product$_identifier': 'Pan de Masa Madre Artesanal',
        description: '', orderedQuantity: 30, listPrice: 3.5,
        discount: 5, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', lineGrossAmount: 109.73,
      },
      {
        id: 'quot-line-3', product: 'prod-15', 'product$_identifier': 'Aceite de Girasol 5L',
        description: 'Uso en fritura profesional', orderedQuantity: 6, listPrice: 11.0,
        discount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', lineGrossAmount: 79.86,
      },
    ],
  },
  {
    slug: 'simple-g-l-journal',
    headerEntity: 'gLJournal',
    lineEntity: 'gLJournalLine',
    headerId: 'mock-glj-001',
    hasSidePanel: false,
    header: {
      id: 'mock-glj-001',
      documentNo: 'GLJ-EVID-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      posted: false,
      glJournalDate: '2026-08-01',
      foreignCurrencyDebit: 0,
      foreignCurrencyCredit: 0,
    },
    lines: [
      {
        id: 'glj-line-1', lineNo: 10, accountingCombination: 'acc-1',
        'accountingCombination$_identifier': '4300000000 - Clientes',
        description: 'Reclasificación de saldo pendiente', foreignCurrencyDebit: 500, foreignCurrencyCredit: 0,
      },
      {
        id: 'glj-line-2', lineNo: 20, accountingCombination: 'acc-2',
        'accountingCombination$_identifier': '5720000000 - Bancos c/c',
        description: '', foreignCurrencyDebit: 0, foreignCurrencyCredit: 500,
      },
      {
        id: 'glj-line-3', lineNo: 30, accountingCombination: 'acc-3',
        'accountingCombination$_identifier': '6290000000 - Otros servicios',
        description: 'Ajuste de cierre mensual', foreignCurrencyDebit: 120, foreignCurrencyCredit: 120,
      },
    ],
  },
];

/**
 * Installs mocks for one window. Header and line entity names can share a
 * prefix (e.g. goodsShipment / goodsShipmentLine), so — mirroring the
 * pattern established in goods-shipment-billing-badge.mocked.spec.js — the
 * line route is registered FIRST (lower LIFO priority) with a predicate that
 * matches only the line entity path, and the header route is registered
 * SECOND with a predicate that explicitly excludes the line entity path.
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

test.describe('ETP-5133 — Lines overflow scoped to avoid sidebar overlap (mocked)', () => {
  for (const win of WINDOWS) {
    test(`lines table scrolls within its own bounds — ${win.slug}`, async ({ page }) => {
      await login(page);
      await installMocks(page, win);

      // The bug report describes the SIDEBAR overlapping the lines table —
      // that only happens with the sidebar expanded (240px, showing menu
      // labels), not the default collapsed 56px icon rail. Seed the same
      // localStorage key SidebarContext.jsx reads (`sidebar-expanded`) so
      // the app boots already expanded, matching a user who keeps the
      // sidebar pinned open — the realistic case this bug was filed against.
      await page.addInitScript(() => {
        try { localStorage.setItem('sidebar-expanded', 'true'); } catch {}
      });

      // Set the narrow "laptop, no external monitor" viewport BEFORE navigating
      // so the app renders its layout at this size from the start — no
      // deviceScaleFactor override, this is the raw viewport at 100% zoom.
      await page.setViewportSize(VIEWPORT);

      await page.goto(`/${win.slug}/${win.headerId}`);
      await page.waitForSelector('[data-testid="detail-view"]', { timeout: 10_000 }).catch(() => {});

      // Lines tab key is hardcoded 'lines' for every window (buildInitialTabs).
      const linesTab = page.getByTestId('tab-lines');
      await linesTab.click();

      const panel = page.getByTestId('inline-lines-panel');
      await panel.waitFor({ timeout: 10_000 }).catch(() => {});
      // Let row content/fonts settle before measuring/screenshotting.
      await page.waitForTimeout(500);

      // -----------------------------------------------------------------
      // 1. The fix's mechanism is present: the body-rows wrapper (the
      //    SECOND direct child of the panel — the sticky header wrapper is
      //    the first) is scoped with `overflow-x: auto`. This holds even on
      //    windows where the visual symptom never appeared at this exact
      //    viewport/dataset, proving the scoping is real, not accidental.
      // -----------------------------------------------------------------
      const bodyWrapper = panel.locator(':scope > div').nth(1);
      await expect(bodyWrapper).toHaveCount(1);
      const overflowX = await bodyWrapper.evaluate((el) => getComputedStyle(el).overflowX);
      expect(overflowX).toBe('auto');

      // -----------------------------------------------------------------
      // 2. No bounding-box overlap between the lines table and the left
      //    nav sidebar. For purchase-invoice — the window with a right-hand
      //    attachments/document-preview panel (decisions.json →
      //    attachments: true → DetailSidePanel) — also check that panel.
      //    This is the assertion that must have flipped from failing to
      //    passing for purchase-invoice specifically.
      // -----------------------------------------------------------------
      // SideMenu.jsx renders <nav aria-label={ui('navigation')}> with no
      // data-testid on its own root element (the AppLayout-level
      // `data-testid="SideMenu__488148"` prop is dropped, not forwarded to
      // any DOM node) — role="navigation" is the stable, i18n-independent
      // hook for it instead.
      const sideMenu = page.getByRole('navigation').first();
      const [sideMenuBox, panelBox] = await Promise.all([
        sideMenu.boundingBox(),
        panel.boundingBox(),
      ]);
      expect(sideMenuBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      // The table must start at or after the sidebar's right edge — no
      // horizontal intersection between the two boxes.
      expect(panelBox.x).toBeGreaterThanOrEqual(sideMenuBox.x + sideMenuBox.width);

      if (win.hasSidePanel) {
        // Anchor on the literal `width: 320px` declaration, NOT a bare `320px` substring:
        // the footer's Totals column (LinesBottomSection) also carries an inline
        // `width: min(520px, max(320px, ...))` and would match a loose selector first.
        // `DetailSidePanel.jsx` does not forward its own JSX-level
        // `data-testid="DetailSidePanel__7c75ad"` prop to the rendered DOM
        // node (same gap as `SideMenu` above), so anchor on the one thing it
        // DOES render literally into the DOM: `sidePanelStyle={{ width: 320 }}`
        // (set by purchase-invoice's index.jsx; 360 before ETP-5513) becomes a
        // real inline `style="width: 320px"` on the panel's root div.
        const sidePanel = page.locator('div[style*="width: 320px"]').first();
        await expect(sidePanel).toBeVisible();
        const sidePanelBox = await sidePanel.boundingBox();
        expect(sidePanelBox).not.toBeNull();
        // The table's right edge must not spill past the side panel's left
        // edge — no horizontal intersection with the attachments panel.
        expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(sidePanelBox.x + 1);
      }

      // -----------------------------------------------------------------
      // 3. Sticky header stays pinned across a horizontal scroll of the
      //    body wrapper — the exact regression the developer flagged and
      //    worked around (an overflow-x ancestor between the sticky header
      //    and its real scrolling ancestor silences `position: sticky`).
      // -----------------------------------------------------------------
      const headerWrapper = panel.locator(':scope > div').nth(0);
      const headerTopBefore = await headerWrapper.evaluate((el) => el.getBoundingClientRect().top);
      await bodyWrapper.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await page.waitForTimeout(100);
      const headerTopAfter = await headerWrapper.evaluate((el) => el.getBoundingClientRect().top);
      expect(headerTopAfter).toBe(headerTopBefore);

      // Scroll back to the natural, un-scrolled resting position so the AFTER
      // screenshot is a true apples-to-apples match against the BEFORE
      // evidence (captured before this spec ever scrolled the table).
      await bodyWrapper.evaluate((el) => { el.scrollLeft = 0; });
      await page.waitForTimeout(100);

      // Through the shared helper, so it honours E2E_CAPTURE_SCREENSHOTS like every other spec.
      // Called directly, this wrote a new PNG into the repo on EVERY mocked run, leaving the tree
      // dirty for whoever ran the suite next — the assertions above are what prove the fix; the
      // screenshot is evidence, produced on request.
      const outPath = resolve(EVIDENCE_DIR, `ETP-5133-${win.slug}-lines-overlap-after.png`);
      await captureScreenshot(page, { path: outPath, fullPage: false });
    });
  }
});


// ---------------------------------------------------------------------------
// QA pass 3, defect F-2 — a long product name is shown in FULL and the grid
// stays aligned.
//
// The product column is no-truncate (`isNoTruncateColumn`): an explicit
// `noTruncate: true` on sales-invoice's LinesTable, and BY DEFAULT on
// sales-quotation (a `type: 'selector', lookup: true` column with no flag).
// The column widens to its widest value (`withContentWidths` -> `columnFlex`),
// the one width source the header strip, every line and the sibling add-row
// `<colgroup>` (DataTable) read — so the cell neither clips nor scrolls on its
// own, and the column after it keeps one x across header, rows, an edit row
// and the open add-row. Overflow of the row is absorbed by the grid's own
// horizontal scroll, which drags the header along.
//
// Known, accepted gap (not asserted): in the add-row BEFORE saving, a picked
// product label may still truncate (it carries a title tooltip).
// ---------------------------------------------------------------------------

const LONG_PRODUCT = 'Monitor 24" Full HD LG 24M38H-B IPS 1920x1080 75Hz HDMI VGA FreeSync Negro';

const FULL_NAME_WINDOWS = [
  {
    slug: 'sales-invoice',
    explicitFlag: true,
    headerEntity: 'header',
    lineEntity: 'lines',
    headerId: 'mock-fullname-sinv-001',
    header: {
      id: 'mock-fullname-sinv-001',
      documentNo: 'SINV-FULLNAME-001',
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
      accountingDate: '2026-08-01', // requiredHeaderFields gate "Añadir línea"
      grandTotalAmount: 250.4,
      currency: 'eur-1',
      'currency$_identifier': 'EUR',
    },
    lines: [
      {
        id: 'sinv-fullname-line-1', product: 'prod-4', 'product$_identifier': 'Vino Tinto 750ml',
        description: 'Caja de 6 unidades', invoicedQuantity: 12, listPrice: 9.5,
        etgoDiscount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 137.94,
      },
      {
        id: 'sinv-fullname-line-2', product: 'prod-monitor', 'product$_identifier': LONG_PRODUCT,
        description: 'Puesto de trabajo', invoicedQuantity: 2, listPrice: 119.0,
        etgoDiscount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', grossAmount: 287.98,
      },
    ],
  },
  {
    slug: 'sales-quotation',
    explicitFlag: false,
    headerEntity: 'quotation',
    lineEntity: 'quotationLine',
    headerId: 'mock-fullname-quot-001',
    header: {
      id: 'mock-fullname-quot-001',
      documentNo: 'CQ-FULLNAME-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      businessPartner: 'bp-5',
      'businessPartner$_identifier': 'Hostelería del Sur S.L.',
      partnerAddress: 'addr-5',
      priceList: 'pl-2',
      paymentTerms: 'pt-1',
      orderDate: '2026-08-01',
      validUntil: '2026-09-01',
      grandTotalAmount: 458.15,
      currency: 'eur-1',
      'currency$_identifier': 'EUR',
    },
    lines: [
      {
        id: 'quot-fullname-line-1', product: 'prod-14', 'product$_identifier': 'Pan Artesanal',
        description: 'Elaboración diaria', orderedQuantity: 30, listPrice: 3.5,
        discount: 5, tax: 'tax-2', 'tax$_identifier': 'IVA 10%', lineGrossAmount: 109.73,
      },
      {
        id: 'quot-fullname-line-2', product: 'prod-monitor', 'product$_identifier': LONG_PRODUCT,
        description: 'Puesto de trabajo', orderedQuantity: 2, listPrice: 119.0,
        discount: 0, tax: 'tax-1', 'tax$_identifier': 'IVA 21%', lineGrossAmount: 287.98,
      },
    ],
  },
];

const FULL_NAME_VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
];

// The column right after the product in both windows' generated LinesTable.
const NEXT_COLUMN_KEY = 'description';

async function openFullNameLines(page, win, viewport) {
  await login(page);
  await installMocks(page, win);
  // partnerAddress is a dependent selector that self-heals to the first option returned; answer
  // with the header's own value so "Añadir línea" (gated on a complete header) keeps rendering.
  // Registered last: the selector URL also matches the header route.
  await page.route('**/selectors/C_BPartner_Location_ID/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{ id: win.header.partnerAddress, label: 'Sede Central', name: 'Sede Central' }] }),
  }));
  await page.route('**/selectors/C_BPartner_Location_ID**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [{ id: win.header.partnerAddress, label: 'Sede Central', name: 'Sede Central' }] }),
  }));
  await page.addInitScript(() => {
    try { localStorage.setItem('sidebar-expanded', 'true'); } catch { /* noop */ }
  });
  await page.setViewportSize(viewport);
  await page.goto(`/${win.slug}/${win.headerId}`);
  await page.waitForSelector('[data-testid="detail-view"]', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('tab-lines').click();
  const panel = page.getByTestId('inline-lines-panel');
  await panel.waitFor({ timeout: 10_000 });
  await expect(panel.getByTestId(`line-row-${win.lines[1].id}`)).toBeVisible();
  // The web font must be in before measuring: the column is sized from the measured text.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return panel;
}

/** Clip/scroll facts of a no-truncate cell and everything inside it. */
function readCellFit(cell) {
  return cell.evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll('*')];
    return {
      text: el.innerText.trim(),
      overflowing: nodes.filter((n) => n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0).length,
      ellipsized: nodes.filter((n) => getComputedStyle(n).textOverflow === 'ellipsis').length,
      scrollers: nodes.filter((n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowX)
        && n.scrollWidth > n.clientWidth).length,
    };
  });
}

test.describe('Lines grid — long product name shown in full and aligned (QA F-2)', () => {
  for (const win of FULL_NAME_WINDOWS) {
    for (const viewport of FULL_NAME_VIEWPORTS) {
      const label = `${win.slug}${win.explicitFlag ? '' : ' (no explicit noTruncate)'} @${viewport.width}`;

      test(`full product name, header/rows/edit/add-row aligned — ${label}`, async ({ page }) => {
        const panel = await openFullNameLines(page, win, viewport);
        const longRow = panel.getByTestId(`line-row-${win.lines[1].id}`);
        const shortRow = panel.getByTestId(`line-row-${win.lines[0].id}`);
        const productCell = longRow.locator('[data-cell-key="product"]');

        // 1. The whole name is visible: no clipping, no ellipsis, no scrollbar inside the cell.
        const fit = await readCellFit(productCell);
        expect(fit.text).toBe(LONG_PRODUCT);
        expect(fit.overflowing, 'product cell content overflows its box').toBe(0);
        expect(fit.ellipsized, 'product cell ellipsizes').toBe(0);
        expect(fit.scrollers, 'product cell scrolls on its own').toBe(0);

        // 2. Header product cell has the width of the body product cells (both rows).
        const headerProduct = await panel.getByTestId('column-header-product').boundingBox();
        // The column really widened past its 192px selector basis (the name would clip there).
        expect(headerProduct.width).toBeGreaterThan(300);
        for (const row of [shortRow, longRow]) {
          const box = await row.locator('[data-cell-key="product"]').boundingBox();
          expect(Math.abs(box.width - headerProduct.width), 'product width header vs row').toBeLessThanOrEqual(1);
          expect(Math.abs(box.x - headerProduct.x), 'product x header vs row').toBeLessThanOrEqual(1);
        }

        // 3. The column after the product keeps one x in header and rows.
        const headerNext = await panel.getByTestId(`column-header-${NEXT_COLUMN_KEY}`).boundingBox();
        for (const row of [shortRow, longRow]) {
          const box = await row.locator(`[data-cell-key="${NEXT_COLUMN_KEY}"]`).boundingBox();
          expect(Math.abs(box.x - headerNext.x), `${NEXT_COLUMN_KEY} x header vs row`).toBeLessThanOrEqual(1);
        }

        // 4. ...and in an edit row (a click on a cell opens the line for editing).
        await shortRow.locator(`[data-cell-key="${NEXT_COLUMN_KEY}"]`).click();
        await expect(shortRow.getByTestId('field-product')).toBeVisible();
        const editNext = await shortRow.locator(`[data-cell-key="${NEXT_COLUMN_KEY}"]`).boundingBox();
        expect(Math.abs(editNext.x - headerNext.x), `${NEXT_COLUMN_KEY} x header vs edit row`).toBeLessThanOrEqual(1);
        const editProduct = await shortRow.locator('[data-cell-key="product"]').boundingBox();
        expect(Math.abs(editProduct.width - headerProduct.width), 'product width header vs edit row').toBeLessThanOrEqual(1);
        await page.keyboard.press('Escape');

        // 5. ...and in the open add-row (DataTable's `<colgroup>`): the add-row cells lead with the
        // dimensions expand-chevron cell (when the grid has a `dimensionsPanel`, as the saved rows
        // do) and the checkbox cell, then the columns in header order.
        const rowLead = (await shortRow.getByTestId('dimensions-panel-toggle').count()) > 0 ? 2 : 1;
        await page.getByTestId('action-add-line').click();
        const addRow = page.getByTestId('inline-add-row');
        await expect(addRow).toBeVisible();
        const headerKeys = await panel.locator('[data-testid^="column-header-"]').evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-testid').replace('column-header-', '')));
        const addCells = await addRow.evaluate((row) =>
          [...row.querySelectorAll(':scope > td')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
        const productIdx = headerKeys.indexOf('product') + rowLead;
        const nextIdx = headerKeys.indexOf(NEXT_COLUMN_KEY) + rowLead;
        // Re-read the header: opening the add-row must not have moved it.
        const headerProductNow = await panel.getByTestId('column-header-product').boundingBox();
        const headerNextNow = await panel.getByTestId(`column-header-${NEXT_COLUMN_KEY}`).boundingBox();
        expect(Math.abs(addCells[productIdx].width - headerProductNow.width), 'product width header vs add-row').toBeLessThanOrEqual(1);
        expect(Math.abs(addCells[nextIdx].x - headerNextNow.x), `${NEXT_COLUMN_KEY} x header vs add-row`).toBeLessThanOrEqual(1);
      });

      test(`horizontal body scroll moves the header with it — ${label}`, async ({ page }) => {
        const panel = await openFullNameLines(page, win, viewport);
        const body = panel.locator(':scope > div').nth(1);
        const { scrollWidth, clientWidth } = await body.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
        // Precondition: the widened product makes the row overflow, so there is something to scroll.
        expect(scrollWidth).toBeGreaterThan(clientWidth);

        const longRow = panel.getByTestId(`line-row-${win.lines[1].id}`);
        const nextBefore = await panel.getByTestId(`column-header-${NEXT_COLUMN_KEY}`).boundingBox();
        await body.evaluate((el) => { el.scrollLeft = 120; });
        await expect.poll(async () => (await panel.getByTestId(`column-header-${NEXT_COLUMN_KEY}`).boundingBox()).x)
          .toBeLessThan(nextBefore.x - 100);
        const headerNext = await panel.getByTestId(`column-header-${NEXT_COLUMN_KEY}`).boundingBox();
        const rowNext = await longRow.locator(`[data-cell-key="${NEXT_COLUMN_KEY}"]`).boundingBox();
        expect(Math.abs(rowNext.x - headerNext.x), 'header and body scrolled together').toBeLessThanOrEqual(1);
      });
    }
  }
});
