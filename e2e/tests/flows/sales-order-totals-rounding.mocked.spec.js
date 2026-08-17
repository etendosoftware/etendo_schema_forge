import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order — totals rounding regression (ETP-4017, mocked).
 *
 * Background
 * ----------
 * Etendo Classic shows order 1000228 with Total = 40.94 EUR but the Schema
 * Forge UI used to display 40.95 (panel) and 40.95 (confirm modal). Root cause:
 * grandTotal was computed as round(baseGrandTotal * factor), which double-rounds
 * relative to the displayed (rounded) subtotal + tax. ETP-4017's fix in
 * `tools/app-shell/src/lib/documentTotals.js` redefines the LIVE-recompute
 * grandTotal as round2(netSubtotal * factor) + round2(taxAmt), which is what
 * `ConfirmModal`/`OrderCreateInvoice.jsx` (unaffected by ETP-4777, still using
 * its own from-scratch recompute) still relies on today.
 *
 * ETP-4777 update — why the panel numbers below changed
 * -------------------------------------------------------
 * ETP-4777 made `DocumentTotalsPanel` prefer the backend-persisted header
 * total (`data.grandTotalAmount`) over a live client-side recompute whenever
 * no line is actively being edited — see `docs/plans/2026-08-12-etp4777-total-
 * rounding-fix-plan.md` Task 2/3. For a Draft order with an active
 * `etgoTotalDiscount` whose `ETGO_DTO` line has NOT yet materialized (this
 * spec's exact scenario), Task 3 made an explicit, documented decision: show
 * that persisted `grandTotalAmount` **verbatim**, with zero client-side
 * re-derivation — even though the real backend's own GET-time compensation
 * for this window is itself a cruder, non-decomposed `raw * factor` estimate.
 * Rationale (Task 3): the discount genuinely isn't final until Complete in
 * the backend's own data model, and replicating the trigger's per-tax-group
 * math in JS just to smooth this one transition was judged not worth the
 * two-implementations-of-fiscal-math risk.
 *
 * Practical consequence for this spec's `BUG_HEADER` fixture (`grandTotalAmount:
 * 43.56` = the RAW, pre-discount line-gross total — i.e. the backend has NOT
 * applied any GET-time compensation in this particular fixture): the panel
 * now shows that raw 43.56 verbatim, NOT the AEAT-decomposed 40.94. The
 * ConfirmModal, however, is a separate, unmodified component that still
 * recomputes from scratch (see `OrderCreateInvoice.jsx` lines ~309-325) and
 * therefore still lands on the correct decomposed 40.94 — so panel and modal
 * are now EXPECTED to diverge during this specific transient window. This
 * panel/modal split for the not-yet-materialized case is a known, accepted
 * tradeoff (see the bug-report doc's "3 separate Confirm modal components"
 * finding) — not something this spec should paper over.
 *
 * What this spec locks
 * --------------------
 * 1. ETP-4017 case: line(qty=1, price=44, disc=10, gross=43.56), totalDisc=6%,
 *    NOT yet materialized → panel displays the persisted grandTotalAmount
 *    verbatim (43.56), per the ETP-4777 Task 3 decision above.
 * 2. Invariant: parsed subtotal + parsed tax === parsed total in the DOM
 *    (holds regardless of which of the two formulas above is in play).
 * 3. Confirm modal still shows its own independently-recomputed 40.94 (ETP-4017,
 *    untouched by ETP-4777) — proving that fix wasn't silently regressed.
 * 4. Clean baseline (no discount, integer totals): qty=2, price=100, gross=242
 *    → Total=242.00, invariant still holds (no discount means Task 2/3's
 *    baseline-vs-recompute distinction is moot — both formulas agree).
 *
 * Routing note
 * ------------
 * `login()` installs a catch-all for /sws/** — install specific routes AFTER
 * login() so they win (Playwright matches routes in reverse registration order).
 */

const ORDER_ID_BUG = 'mock-so-totals-001';
const ORDER_ID_CLEAN = 'mock-so-totals-002';

// ─── Fixtures ───────────────────────────────────────────────────────────────

// ETP-4017/ETP-4777 case. grandTotalAmount/summedLineAmount are the RAW,
// pre-total-discount backend values (no GET-time compensation modeled here,
// and no ETGO_DTO line materialized yet) with etgoTotalDiscount=6% pending.
// Per ETP-4777 Task 3, `DocumentTotalsPanel` shows this raw grandTotalAmount
// (43.56) VERBATIM in this window — see the file header comment above. The
// ConfirmModal (unmodified, separate component) still independently
// recomputes 40.94 from these same raw values via its own AEAT-decomposed
// formula, which test 3/4 below still lock.
const BUG_HEADER = {
  id: ORDER_ID_BUG,
  documentNo: 'SO-MOCK-RND-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  documentAction: 'CO',
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 43.56,
  summedLineAmount: 39.60,
  etgoTotalDiscount: 6, // → 6% total discount applied client-side
};

const BUG_LINE = {
  id: 'mock-so-line-bug-001',
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Cerveza',
  orderedQuantity: 1,
  listPrice: 44,
  discount: 10,
  unitPrice: 39.6,
  lineNetAmount: 39.6,
  lineGrossAmount: 43.56,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 10%',
  'currency$_identifier': 'EUR',
};

// Clean baseline: qty=2, price=100, no discount, gross=242 → Total=242.00.
const CLEAN_HEADER = {
  id: ORDER_ID_CLEAN,
  documentNo: 'SO-MOCK-RND-002',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  documentAction: 'CO',
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 242,
  summedLineAmount: 200,
  etgoTotalDiscount: 0,
};

const CLEAN_LINE = {
  id: 'mock-so-line-clean-001',
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Cerveza',
  orderedQuantity: 2,
  listPrice: 100,
  discount: 0,
  unitPrice: 100,
  lineNetAmount: 200,
  lineGrossAmount: 242,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 21%',
  'currency$_identifier': 'EUR',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Install mocks for a sales-order detail page (header + lines + evaluate-display).
 * Must be called AFTER login() so specific routes take precedence.
 */
async function installSalesOrderMocks(page, { header, line }) {
  await page.route(`**/sws/neo/sales-order/header/${header.id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [header] } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [line], totalRows: 1 } }),
    });
  });

  // evaluate-display returns {} so client-side logic drives the UI.
  await page.route('**/sws/neo/sales-order/evaluate-display{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Parse a currency-formatted string ("40.94 €", "40,94 €", "242,00 €",
 * "$242.00", etc.) into a number. Strips any non-digit-and-separator chars,
 * then normalises decimal separators by treating the LAST separator as the
 * decimal point (matches Intl.NumberFormat output across en-US and es-ES).
 */
function parseAmount(text) {
  if (!text) return NaN;
  // Remove everything except digits, comma, dot, minus.
  const cleaned = text.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return NaN;
  // Find the last separator — that's the decimal one.
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decIdx = Math.max(lastDot, lastComma);
  if (decIdx === -1) return Number(cleaned);
  const intPart = cleaned.slice(0, decIdx).replace(/[.,]/g, '');
  const decPart = cleaned.slice(decIdx + 1);
  return Number(`${intPart}.${decPart}`);
}

/**
 * Poll a totals-panel cell until it contains a non-zero digit, then return
 * the parsed amount. Avoids the race where `toBeVisible()` passes but the
 * React render cycle hasn't filled the text yet (returns "" or "0").
 */
async function pollAmount(page, testId, timeout = 10_000) {
  const locator = page.getByTestId(testId);
  await expect.poll(
    async () => (await locator.textContent() || '').trim(),
    { timeout },
  ).toMatch(/[1-9]/);
  return parseAmount((await locator.textContent()) || '');
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Sales Order — totals rounding (ETP-4017)', () => {
  test('panel shows the raw persisted grandTotalAmount verbatim while the document discount is not yet materialized (ETP-4777 Task 3)', async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page, { header: BUG_HEADER, line: BUG_LINE });
    await page.goto(`/sales-order/${ORDER_ID_BUG}`);

    // Wait for totals panel to render with a non-zero value.
    const total = await pollAmount(page, 'totals-row-total-value');

    // ETP-4777 Task 3: no ETGO_DTO line yet → the panel trusts
    // BUG_HEADER.grandTotalAmount (43.56, the raw pre-discount value in this
    // fixture) verbatim, with zero client-side re-derivation. See the file
    // header comment for why this is 43.56 and not the AEAT-decomposed 40.94
    // the ConfirmModal still shows (test 3/4 below).
    expect(total).toBeCloseTo(43.56, 2);

    // Subtotal keeps subtracting the LIVE-recomputed totalDiscountAmt from
    // the raw persisted net (39.60 − 39.60×6% = 37.22) — that part of the
    // panel's arithmetic is unaffected by Task 3 and still matches ETP-4017's
    // decomposition. Tax, however, is derived from the RAW grandTotalAmount
    // (43.56 − 37.22ish), so it lands on 6.34, not the decomposed 3.72.
    const subtotal = parseAmount(
      (await page.getByTestId('totals-row-subtotal-value').textContent()) || '',
    );
    const tax = parseAmount(
      (await page.getByTestId('totals-row-tax-value').textContent()) || '',
    );
    expect(subtotal).toBeCloseTo(37.22, 2);
    expect(tax).toBeCloseTo(6.34, 2);
  });

  test('invariant: displayed subtotal + tax === displayed total (ETP-4017 case)', async ({ page }) => {
    // This is the most valuable assertion: it survives locale-format changes
    // (it parses the rendered text), and is what the AEAT legal-invoice rule
    // demands ("the printed total equals the sum of the visible base + tax").
    await login(page);
    await installSalesOrderMocks(page, { header: BUG_HEADER, line: BUG_LINE });
    await page.goto(`/sales-order/${ORDER_ID_BUG}`);

    const total = await pollAmount(page, 'totals-row-total-value');
    const subtotal = parseAmount(
      (await page.getByTestId('totals-row-subtotal-value').textContent()) || '',
    );
    const tax = parseAmount(
      (await page.getByTestId('totals-row-tax-value').textContent()) || '',
    );

    // Tolerate at most 0.005 of float-arithmetic noise — strictly under 1 cent.
    const sum = Math.round((subtotal + tax) * 100) / 100;
    const rounded = Math.round(total * 100) / 100;
    expect(rounded).toBe(sum);
  });

  test('confirm modal mirrors the panel total (40.94 — server-resolved fixture)', async ({ page }) => {
    // The ConfirmModal (artifacts/sales-order/custom/OrderCreateInvoice.jsx)
    // displays `grandTotalAmount × discountFactor` for DR documents. To prove
    // the modal renders the right printed number end-to-end WITHOUT
    // duplicating the fix into the modal layer, we feed the modal a fixture
    // where the backend has already materialised the total (i.e. the same
    // 40.94 that Etendo Classic prints), with `etgoTotalDiscount=0` so no
    // client-side factor is applied. The test asserts the modal shows that
    // exact number and never the pre-fix bug value 40.95.
    const fixedHeader = {
      ...BUG_HEADER,
      grandTotalAmount: 40.94,
      etgoTotalDiscount: 0,
    };
    await login(page);
    await installSalesOrderMocks(page, { header: fixedHeader, line: BUG_LINE });
    await page.goto(`/sales-order/${ORDER_ID_BUG}`);

    // Wait for OrderCreateInvoice (headerExtra) to mount before dispatching the
    // confirm-modal event, so the `sales-order:open-confirm-modal` listener is
    // already registered. Anchor on the totals panel instead of the send-email
    // button: since ETP-4717, that button is gated to isCompleted-only (it no
    // longer renders on Draft — see the ETP-4717 comment in OrderCreateInvoice.jsx),
    // and this fixture's document is DR. The totals panel is a status-independent
    // signal that the detail page (and thus OrderCreateInvoice) has mounted —
    // the same anchor the sibling test below (line ~268) already relies on.
    await pollAmount(page, 'totals-row-total-value');

    // The ConfirmModal opens via a window event dispatched by the draftMode
    // primary action. Trigger it directly — that's how the sales-order custom
    // window wires `onConfirm` (see windows/custom/sales-order/index.jsx:56).
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
    });

    // ConfirmModal renders as a portal into document.body. The title text
    // "Confirmar pedido #..." is unique to the modal — find that node, then
    // walk up to its modal card (the ancestor div carrying the inline width
    // style emitted by `style={{ ...cardStyle, width: 460 }}`).
    const modalTitle = page.getByText(/Confirmar pedido.*SO-MOCK-RND-001/);
    await expect(modalTitle).toBeVisible({ timeout: 10_000 });
    // The card is the closest ancestor whose inline style includes width.
    // Use a chained ancestor query rather than xpath — Playwright filters out
    // hidden nodes for us. Fallback to any ancestor with role or to body.
    const modalCard = modalTitle.locator('xpath=ancestor::div[contains(@style,"width")][1]');

    // Match the headline amount in either locale format ("40.94" or "40,94")
    // and never the pre-fix bug value ("40.95"/"40,95"). The ConfirmModal uses
    // `toLocaleString(undefined, …)` so the decimal separator is locale-dependent.
    await expect(modalCard).toContainText(/40[.,]94/, { timeout: 10_000 });
    await expect(modalCard).not.toContainText(/40[.,]95/);
  });

  test('confirm modal applies the same AEAT rounding on DR docs (client-side discount path)', async ({ page }) => {
    // Companion to the previous test: here we DO exercise the DR client-side
    // discount path inside the ConfirmModal. The fixture is the raw BUG_HEADER
    // (documentStatus=DR, grandTotalAmount=43.56 = pre-fix server snapshot,
    // summedLineAmount=39.60, etgoTotalDiscount=6) — before TotalDiscountService
    // materialises the ETGO_DTO line. The modal must recompute:
    //   totalLines = round2(39.60 × 0.94)         = 37.22
    //   grandTotal = 37.22 + round2(3.96 × 0.94)  = 37.22 + 3.72 = 40.94
    // i.e. NOT round2(43.56 × 0.94) = 40.95 (the pre-fix double-rounding bug).
    await login(page);
    await installSalesOrderMocks(page, { header: BUG_HEADER, line: BUG_LINE });
    await page.goto(`/sales-order/${ORDER_ID_BUG}`);

    // Wait for the detail page → ensures the custom window mounted and the
    // sales-order:open-confirm-modal listener is attached. NOTE: as of
    // ETP-4777 Task 3, the panel and the modal are NOT expected to agree
    // during this specific not-yet-materialized-discount window — the panel
    // now shows the raw persisted grandTotalAmount verbatim (43.56, see the
    // file header comment), while the ConfirmModal below still independently
    // recomputes the AEAT-decomposed 40.94. This is a documented, accepted
    // tradeoff, not a bug — this poll is only used as a mount-readiness
    // anchor here, not a lockstep assertion.
    await pollAmount(page, 'totals-row-total-value');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
    });

    const modalTitle = page.getByText(/Confirmar pedido.*SO-MOCK-RND-001/);
    await expect(modalTitle).toBeVisible({ timeout: 10_000 });
    const modalCard = modalTitle.locator('xpath=ancestor::div[contains(@style,"width")][1]');

    // Headline total must be 40.94 (fixed formula), never 40.95 (pre-fix bug).
    await expect(modalCard).toContainText(/40[.,]94/, { timeout: 10_000 });
    await expect(modalCard).not.toContainText(/40[.,]95/);
    // Subtotal line shows "Subtotal 37,22" (or 37.22 depending on locale).
    await expect(modalCard).toContainText(/Subtotal\s+37[.,]22/);
  });
});

test.describe('Sales Order — totals rounding clean baseline', () => {
  test('no discount + integer totals: Total=242.00 and invariant holds', async ({ page }) => {
    // Contrast case — guards the fix against breaking the trivial path.
    await login(page);
    await installSalesOrderMocks(page, { header: CLEAN_HEADER, line: CLEAN_LINE });
    await page.goto(`/sales-order/${ORDER_ID_CLEAN}`);

    const total = await pollAmount(page, 'totals-row-total-value');
    const subtotal = parseAmount(
      (await page.getByTestId('totals-row-subtotal-value').textContent()) || '',
    );
    const tax = parseAmount(
      (await page.getByTestId('totals-row-tax-value').textContent()) || '',
    );

    expect(subtotal).toBeCloseTo(200, 2);
    expect(tax).toBeCloseTo(42, 2);
    expect(total).toBeCloseTo(242, 2);

    // Invariant still holds at the clean-baseline case.
    const sum = Math.round((subtotal + tax) * 100) / 100;
    const rounded = Math.round(total * 100) / 100;
    expect(rounded).toBe(sum);
  });
});
