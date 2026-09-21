import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { readDocumentTotals } from '../helpers/purchase-helpers.js';

/**
 * Purchase Order — total-discount Subtotal must not drift by 1 cent once the
 * discount is materialized on a multi-tax-bucket document (ETP-5292, mocked).
 *
 * Background
 * ----------
 * See docs/plans/2026-09-17-etp5292-total-discount-rounding-fix-plan.md for
 * the full investigation. Summary: `DocumentTotalsPanel.jsx`'s
 * `resolvePersistedTotals()` used to reconstruct the "already discounted"
 * branch's Subtotal via `persistedNet / factor` (an inversion meant to
 * recover the raw pre-discount net so the render's generic `netSubtotal -
 * totalDiscountAmt` subtraction would land back on the right number). That
 * inversion is only exact when `persistedNet` is a perfect multiple of
 * `factor` — which it never is for a REAL multi-tax document, because the
 * backend materializes the discount as ONE `ETGO_DTO` line PER TAX GROUP,
 * each independently rounded to 2 decimals. The residue from that per-bucket
 * rounding silently undercut the displayed Subtotal by exactly 1 cent on
 * every completed document with >1 tax bucket — 201.65 became 201.64 —
 * while the Total stayed correct, so the panel became internally
 * INCONSISTENT (Subtotal + Tax != Total) the instant the document was
 * confirmed. Already fixed in `DocumentTotalsPanel.jsx` and covered by a
 * discriminating unit test in `DocumentTotalsPanel.vitest.jsx`.
 *
 * Why this E2E test exists on top of that unit test
 * ---------------------------------------------------
 * The unit test only proves the React component is internally correct given
 * mocked props — it cannot catch a real desync between what the Java backend
 * actually persists (`TotalDiscountService`, per-tax-bucket rounding in
 * `com.etendoerp.go`) and what the frontend receives and displays. This spec
 * exercises the real confirm flow end-to-end: it loads a Draft order with
 * two tax buckets and a 66% total discount, fires the real "Confirmar"
 * action, and asserts the DetailView's totals panel — once refreshed with
 * the post-confirm (materialized) header — shows a Subtotal that is byte-
 * exact and internally consistent with Tax and Total. If the bug regresses,
 * this test fails with Subtotal=201.64 (not 201.65) and Subtotal+Tax=232.92
 * != Total=232.93.
 *
 * Fixture data
 * ------------
 * Mirrors the plan's real, live-verified reproduction (§1.1/§10.3):
 *   - Agua:    qty 20, listPrice  5, discount 25%, tax bucket A (10%)
 *   - Cerveza: qty 30, listPrice 11, discount 33%, tax bucket A (10%)
 *   - Fernet:  qty 10, listPrice 33, discount 10%, tax bucket B (21%)
 *   - Header total discount: 66%
 * Raw net (line-discount only, no total discount) = 593.10. After the total
 * discount is applied client-side (Draft, not yet materialized):
 * 593.10 × 0.34 = 201.654 → displayed 201.65, Tax 31.28, Total 232.93.
 * Once Complete, the backend materializes ONE ETGO_DTO line per tax bucket:
 *   - bucket A (Agua+Cerveza, net 296.10): 296.10 × 0.66 = 195.426 → 195.43
 *   - bucket B (Fernet, net 297.00):       297.00 × 0.66 = 196.02  → 196.02
 * summedLineAmount becomes the TRUE, correct 593.10 - 391.45 = 201.65 (NOT a
 * clean multiple of 0.34 anymore) — this is exactly the "not an exact
 * multiple of the factor" shape the bug needed. The old buggy code computed
 * 201.65 / 0.34 = 593.0882... then subtracted the live-recomputed
 * totalDiscountAmt (391.446) landing on 201.642235... → displayed 201.64.
 *
 * Chosen window: Purchase Order — the exact window named in the ticket
 * ("Pedidos de compra"). The defect lives in a component shared by all 5
 * Purchase/Sales windows (confirmed in the plan's §8 cross-window sweep), so
 * one window is sufficient to guard the shared code path.
 *
 * Mocked, not live: this assertion is purely numeric/deterministic and does
 * not depend on any callout, server-side default, or real tax-engine
 * behavior beyond the two header snapshots below (Draft vs. Confirmed) — a
 * live-backend integration spec would add flakiness with no extra coverage
 * for THIS defect (the defect is 100% in the frontend display layer, per the
 * plan's root-cause analysis — the backend's real materialization math is
 * only being modeled here as fixture data, already independently confirmed
 * correct against Classic in the plan's §1.6).
 *
 * Routing note: login() installs a catch-all for /sws/** — install specific
 * routes AFTER login() so they win (Playwright matches routes in reverse
 * registration order).
 */

const ORDER_ID = 'mock-po-etp5292-001';

const LINES = [
  {
    id: 'po-line-agua',
    lineNo: 10,
    product: 'prod-agua',
    'product$_identifier': 'Agua',
    orderedQuantity: 20,
    listPrice: 5,
    discount: 25,
    lineGrossAmount: 82.5,
    tax: 'tax-adq-10',
    'tax$_identifier': 'Adquisición B.Inmuebles 10%',
    'currency$_identifier': 'EUR',
  },
  {
    id: 'po-line-cerveza',
    lineNo: 20,
    product: 'prod-cerveza',
    'product$_identifier': 'Cerveza',
    orderedQuantity: 30,
    listPrice: 11,
    discount: 33,
    lineGrossAmount: 243.21,
    tax: 'tax-adq-10',
    'tax$_identifier': 'Adquisición B.Inmuebles 10%',
    'currency$_identifier': 'EUR',
  },
  {
    id: 'po-line-fernet',
    lineNo: 30,
    product: 'prod-fernet',
    'product$_identifier': 'Fernet',
    orderedQuantity: 10,
    listPrice: 33,
    discount: 10,
    lineGrossAmount: 359.37,
    tax: 'tax-adq-21',
    'tax$_identifier': 'Adquisiciones IVA 21%',
    'currency$_identifier': 'EUR',
  },
];

// Draft state — total discount pending, NOT yet materialized into ETGO_DTO
// lines. summedLineAmount is the raw, line-discount-only net (593.10),
// deliberately left uncompensated pre-Complete (see the panel's own
// comment on the isAlreadyDiscounted heuristic).
const DRAFT_HEADER = {
  id: ORDER_ID,
  documentNo: 'PO-MOCK-ETP5292-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  documentAction: 'CO',
  'businessPartner$_identifier': 'Test Vendor ETP-5292',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 232.93,
  summedLineAmount: 593.10,
  etgoTotalDiscount: 66,
};

// Confirmed state — the backend has materialized the discount as two
// per-tax-bucket ETGO_DTO lines (filtered out of the `lines` response, as
// always). summedLineAmount is now the TRUE, already-net-of-discount 201.65
// — not a clean multiple of the 0.34 factor, which is exactly what exposes
// the bug. grandTotalAmount is unchanged: it was already GET-time-
// compensated correctly even pre-Complete (ETP-4029).
const CONFIRMED_HEADER = {
  ...DRAFT_HEADER,
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  summedLineAmount: 201.65,
};

/**
 * Install the header/lines/confirm-action mocks for this order. The header
 * route is STATEFUL: it answers with DRAFT_HEADER until the documentAction
 * mock flips `state.confirmed`, after which every subsequent GET answers
 * with CONFIRMED_HEADER — modeling the real refetch-after-confirm flow.
 */
async function installMocks(page, state) {
  await page.route(`**/sws/neo/purchase-order/header/${ORDER_ID}`, async (route) => {
    const method = route.request().method();
    const current = state.confirmed ? CONFIRMED_HEADER : DRAFT_HEADER;
    if (method === 'GET') {
      state.headerGetCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [current] } }),
      });
      return;
    }
    if (method === 'PATCH' || method === 'PUT') {
      // ETP-4468 — confirm calls handleSave() before running the confirm
      // step; echo the current record back so the refetch stays consistent.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...current }] } }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/sws/neo/purchase-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: LINES, totalRows: LINES.length } }),
    });
  });

  await page.route(
    `**/sws/neo/purchase-order/header/${ORDER_ID}/action/documentAction`,
    async (route) => {
      state.confirmed = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: { id: ORDER_ID, documentNo: DRAFT_HEADER.documentNo, documentStatus: 'CO' } },
        }),
      });
    },
  );
}

test.describe('Purchase Order — total-discount Subtotal rounding on confirm (ETP-5292)', () => {
  test('confirming a two-tax-bucket order with a 66% total discount keeps Subtotal + Tax == Total (no 1-cent drift)', async ({ page }) => {
    const state = { confirmed: false, headerGetCount: 0 };

    await login(page);
    await installMocks(page, state);

    await page.goto(`/purchase-order/${ORDER_ID}`);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });

    // Wait for the initial (Draft) GET to land before reading anything, so
    // the "before" baseline below reflects the page-load fetch only.
    await expect.poll(() => state.headerGetCount, { timeout: 8_000 }).toBeGreaterThan(0);
    const headerGetCountBeforeConfirm = state.headerGetCount;

    // Sanity check on the Draft (not-yet-materialized) state — this branch
    // was never buggy (per the plan's root-cause analysis), but confirms the
    // fixture itself reproduces the documented, live-verified numbers before
    // we rely on them as the "before" reference.
    await expect(async () => {
      const draftTotals = await readDocumentTotals(page);
      expect(draftTotals.subtotal).toBeCloseTo(201.65, 2);
      expect(draftTotals.tax).toBeCloseTo(31.28, 2);
      expect(draftTotals.total).toBeCloseTo(232.93, 2);
    }).toPass({ timeout: 10_000 });

    // Open the Confirm modal — the listener attaches after mount, so retry
    // the dispatch a few times (same pattern as the confirm-idempotency specs).
    const confirmButton = page.getByTestId('action-confirm-modal');
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal'));
      });
      try {
        await expect(confirmButton).toBeVisible({ timeout: 1_000 });
        break;
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }

    // Confirm WITHOUT ticking receipt/invoice — triggers documentAction only,
    // then a header refetch (onRefresh), which is what materializes the
    // discount in this fixture (state.confirmed flips inside the mock).
    await confirmButton.click();

    const successToast = page.locator('[data-type="success"]').first();
    await expect(successToast).toBeVisible({ timeout: 5_000 });
    await expect(successToast).toContainText('Pedido de compra confirmado');

    // The refetch must actually have happened before we trust the DOM —
    // wait for a SECOND header GET beyond the page-load one.
    await expect.poll(() => state.headerGetCount, { timeout: 5_000 })
      .toBeGreaterThan(headerGetCountBeforeConfirm);

    // Post-confirm assertion — the discriminating one. With the ETP-5292 fix,
    // Subtotal reads the true, per-tax-bucket-rounded 201.65 (not the old
    // buggy 201.64). Read inside a retry: the panel briefly re-renders while
    // the refreshed header data lands.
    await expect(async () => {
      const totals = await readDocumentTotals(page);

      expect(
        Number.isFinite(totals.subtotal) && Number.isFinite(totals.tax) && Number.isFinite(totals.total),
        `totals should be real numbers, got ${JSON.stringify(totals._raw)}`,
      ).toBe(true);

      // Exact value — unambiguous regression signal, not just "close enough".
      expect(totals.subtotal).toBe(201.65);
      expect(totals.tax).toBe(31.28);
      expect(totals.total).toBe(232.93);

      // Internal-consistency invariant — this is what actually fails when
      // the 1-cent drift reappears (201.64 + 31.28 = 232.92 != 232.93).
      // Rounded to cents with STRICT equality — no tolerance that could mask
      // exactly the 1-cent bug this test exists to catch.
      const sum = Math.round((totals.subtotal + totals.tax) * 100) / 100;
      const total = Math.round(totals.total * 100) / 100;
      expect(sum).toBe(total);
    }).toPass({ timeout: 10_000 });
  });
});
