import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Persistent BP-blocking banner (ETP-5024, mocked).
 *
 * Two Business-Partner conditions — credit limit exceeded and BP on hold —
 * used to surface as an auto-dismissing toast. ETP-5024 replaces that with a
 * PERSISTENT inline banner (`data-testid="bp-blocking-banner"`, InfoBanner
 * tone="info") rendered above the header, sourced from either:
 *
 *   - useCallout's response when the Business Partner field changes (a
 *     `businessPartner` callout whose `messages` include a matching text), or
 *   - a failed Complete/process action (handleSaveAndProcess / handleProcess).
 *
 * Window: purchase-invoice. Its draftMode has no `onConfirm` override (see
 * `windows/custom/shared/useInvoiceWindow.js#getInvoiceDraftMode`), so its
 * "Confirmar" button (`action-save`) goes straight through
 * `hook.handleSaveAndProcess`, the exact path ETP-5024 touches — unlike
 * sales-order/purchase-order/sales-quotation, whose draftMode.onConfirm opens
 * a dedicated ConfirmDocumentModal that bypasses useEntity entirely.
 *
 * businessPartner is a `type: 'foreignKey'` field with `inputMode: 'search'`,
 * which EntityForm always renders as CreatableSearchSelect in serverSearch
 * mode (ETP-4600): typing debounces 300ms before hitting
 * `.../header/selectors/businessPartner?q=<term>`, and picking a result fires
 * `onChange` -> `handleChangeWithCallout` -> a debounced (300ms)
 * `executeCallout('businessPartner', ...)` POST to `.../header/callout`.
 *
 * Mock mode only: installs window-specific routes on top of the generic
 * /sws/** mock login() seeds, so it does not need a backend.
 */

const SPEC = 'purchase-invoice';
const ENTITY = 'header';

// DetailView's fireCallout guard only dispatches a callout for a value that
// LOOKS like a real Etendo id/date/number (32-char hex UUID, numeric, or
// yyyy-MM-dd) — see DetailView.jsx's `fireCallout`. A slug like 'bp-risky'
// is silently swallowed (no request at all), so these use real-shaped
// 32-char hex ids (CLAUDE.md's own convention for Etendo AD ids).
const BP_CURRENT = { id: 'AA000000000000000000000000000000'.slice(0, 32), label: 'Current Supplier S.A.' };
const BP_RISKY = { id: 'BB000000000000000000000000000000'.slice(0, 32), label: 'Risky Corp' };
const BP_SAFE = { id: 'CC000000000000000000000000000000'.slice(0, 32), label: 'Safe Supplier S.L.' };
const BP_ON_HOLD = { id: 'DD000000000000000000000000000000'.slice(0, 32), label: 'On Hold Supplier S.L.' };
const ADDRESS = { id: 'EE000000000000000000000000000000'.slice(0, 32), label: 'Calle Test 1' };

const LINE = {
  id: 'line-001',
  product: 'prod-001',
  'product$_identifier': 'Test Product',
  quantity: 1,
  unitPrice: 10,
  lineNetAmount: 10,
};

function baseInvoice(id, bp) {
  return {
    id,
    orderReference: `SUPPLIER-REF-${id}`,
    documentNo: `PC-${id}`,
    invoiceDate: '2026-05-10',
    businessPartner: bp.id,
    'businessPartner$_identifier': bp.label,
    partnerAddress: ADDRESS.id,
    'partnerAddress$_identifier': ADDRESS.label,
    paymentMethod: 'pm-001',
    'paymentMethod$_identifier': 'Efectivo',
    paymentTerms: 'pt-001',
    'paymentTerms$_identifier': '30 Días',
    priceList: 'pl-001',
    'priceList$_identifier': 'Lista de compra',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    documentAction: 'CO',
    processed: false,
    posted: 'N',
    grandTotalAmount: 10.0,
    summedLineAmount: 10.0,
    outstandingAmount: 10.0,
  };
}

/**
 * Shared read-only-ish mocks every test in this file needs: detail GET, one
 * line (so draftMode.disableWhenEmpty doesn't disable "Confirmar"), and
 * evaluate-display (client-side readOnlyLogic drives the UI instead).
 */
async function installCommonMocks(page, invoice) {
  await page.route(`**/sws/neo/${SPEC}/lines{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [LINE], totalRows: 1 } }),
    });
  });

  await page.route(`**/sws/neo/${SPEC}/evaluate-display{/**,}**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  // Dependent selector for partnerAddress — keyed by DB COLUMN
  // (C_BPartner_Location_ID), not field name (verified live — same pattern as
  // documented for M_Warehouse_ID in the warehouse-persist spec). Always
  // return the one address so a businessPartner change never clears it out
  // from under the test.
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}/selectors/C_BPartner_Location_ID{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: ADDRESS.id, label: ADDRESS.label }] }),
    });
  });

  await page.route(`**/sws/neo/${SPEC}/${ENTITY}/${invoice.id}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [invoice] } }),
      });
      return;
    }
    if (method === 'PATCH') {
      // Silent header save inside handleSaveAndProcess — just echo success.
      const body = route.request().postDataJSON() ?? {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...invoice, ...body }] } }),
      });
      return;
    }
    route.fallback();
  });
}

test.describe('BP-blocking banner (ETP-5024) — purchase-invoice', () => {
  // ── Scenario 1: credit-limit BP selected via callout ──────────────────────
  test.describe('credit-limit condition via businessPartner callout', () => {
    const INVOICE_ID = 'pi-bpban-credit';
    const INVOICE = baseInvoice(INVOICE_ID, BP_CURRENT);

    test.beforeEach(async ({ page }) => {
      await login(page);
      await installCommonMocks(page, INVOICE);

      // Search selector for businessPartner: keyed by DB COLUMN (C_BPartner_ID),
      // not field name — verified live via network capture, same pattern
      // documented for M_Warehouse_ID/C_BPartner_Location_ID elsewhere in this
      // suite. Return both candidate BPs regardless of the typed query — this
      // test only cares about which one gets clicked.
      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/selectors/C_BPartner_ID{/**,}**`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [
            { id: BP_RISKY.id, label: BP_RISKY.label },
            { id: BP_SAFE.id, label: BP_SAFE.label },
          ] }),
        });
      });

      // businessPartner callout: BP_RISKY's response carries the credit-limit
      // message; every other value (including BP_SAFE) comes back clean.
      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/callout`, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const body = route.request().postDataJSON() ?? {};
        if (body.field === 'businessPartner' && body.value === BP_RISKY.id) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              updates: {}, combos: {},
              messages: [{ type: 'ERROR', text: 'Business Partner credit limit exceeded' }],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ updates: {}, combos: {}, messages: [] }),
        });
      });

      await page.goto(`/${SPEC}/${INVOICE_ID}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('selecting the risky BP shows a persistent banner (not a toast); switching BP clears it', async ({ page }) => {
      // No banner yet.
      await expect(page.getByTestId('bp-blocking-banner')).toHaveCount(0);

      // Reveal the editable businessPartner input (SelectorChip -> input).
      const chip = page.getByTestId('field-businessPartner-chip');
      await expect(chip).toBeVisible({ timeout: 10_000 });
      await chip.click();

      const input = page.getByTestId('field-businessPartner');
      await expect(input).toBeVisible({ timeout: 5_000 });
      await input.fill('Risky');

      const riskyOption = page.getByTestId(`option-businessPartner-${BP_RISKY.id}`);
      await expect(riskyOption).toBeVisible({ timeout: 5_000 });
      await riskyOption.click();

      // Persistent banner appears with the credit-limit message.
      const banner = page.getByTestId('bp-blocking-banner');
      await expect(banner).toBeVisible({ timeout: 5_000 });
      await expect(banner).toContainText(/credit limit/i);

      // Not a toast: no error/warning toast carries this text.
      await expect(page.locator('[data-type="error"], [data-type="warning"]').filter({ hasText: /credit limit/i })).toHaveCount(0);

      // The banner is still there a moment later — a toast would already be
      // gone by now if it had ever been one.
      await page.waitForTimeout(1_000);
      await expect(banner).toBeVisible();

      // Switch to a different (safe) BP — the callout comes back clean, the
      // banner must clear.
      const chip2 = page.getByTestId('field-businessPartner-chip');
      await chip2.click();
      const input2 = page.getByTestId('field-businessPartner');
      await input2.fill('Safe');
      const safeOption = page.getByTestId(`option-businessPartner-${BP_SAFE.id}`);
      await expect(safeOption).toBeVisible({ timeout: 5_000 });
      await safeOption.click();

      await expect(page.getByTestId('bp-blocking-banner')).toHaveCount(0, { timeout: 5_000 });
    });
  });

  // ── Scenario 1b: credit-limit on a brand-new, UNSAVED document (ETP-5024
  //    blocker 2 — currency fallback) ─────────────────────────────────────
  // A REVIEW pass found the amount could be silently dropped from the banner
  // specifically on this scenario: `data` is `hook.editing` while creating a
  // new document, which has no `currency$_identifier` yet (unlike an existing
  // record's header GET response). This test asserts the actual FORMATTED
  // AMOUNT text appears — not just that the banner is visible — exercising the
  // `useCurrency()` session-level fallback (mocked by `login()` to 'EUR' via
  // `GET /sws/neo/session`) end to end, with the REAL (unmocked) `formatCurrency`.
  test.describe('credit-limit condition on a brand-new, unsaved document', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);

      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/selectors/C_BPartner_ID{/**,}**`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [{ id: BP_RISKY.id, label: BP_RISKY.label }] }),
        });
      });

      // Same shape as core Etendo's real (buggy) concatenation — see
      // SE_Order_BPartner.java / blockingBpConditions.js's header comment: no
      // separating space, raw `Double.toString()` amount appended directly.
      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/callout`, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const body = route.request().postDataJSON() ?? {};
        if (body.field === 'businessPartner' && body.value === BP_RISKY.id) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              updates: {}, combos: {},
              messages: [{ type: 'ERROR', text: 'Aviso: Crédito limite superado4912.6' }],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ updates: {}, combos: {}, messages: [] }),
        });
      });

      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/selectors/C_BPartner_Location_ID{/**,}**`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [{ id: ADDRESS.id, label: ADDRESS.label }] }),
        });
      });

      await page.goto(`/${SPEC}/new`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('shows the FORMATTED amount (not dropped, not raw) via the session currency fallback', async ({ page }) => {
      await expect(page.getByTestId('bp-blocking-banner')).toHaveCount(0);

      // A brand-new record's businessPartner field starts EMPTY — CreatableSearchSelect
      // only renders the `-chip` testid once a value is selected (SelectorChip); an
      // empty field renders the `field-businessPartner` search input directly (see
      // CreatableSearchSelect.jsx). Unlike scenario 1 (an already-loaded existing
      // record with a BP already selected), there is no chip to click first here.
      const input = page.getByTestId('field-businessPartner');
      await expect(input).toBeVisible({ timeout: 10_000 });
      await input.fill('Risky');

      const riskyOption = page.getByTestId(`option-businessPartner-${BP_RISKY.id}`);
      await expect(riskyOption).toBeVisible({ timeout: 5_000 });
      await riskyOption.click();

      // A brand-new record's initial mount fires more concurrent work than an
      // already-loaded existing record (scenario 1 above) — handleNew's own
      // defaults fetch plus every other mandatory field's default-selector
      // resolution race the businessPartner callout's 300ms debounce — so this
      // allows a more generous window before the banner is expected to land.
      const banner = page.getByTestId('bp-blocking-banner');
      await expect(banner).toBeVisible({ timeout: 10_000 });

      // The formatted amount (EUR session fallback, es-ES grouping: '.' thousands,
      // ',' decimal — see formatCurrency.js) actually appears in the banner...
      await expect(banner).toContainText('4.912,60');
      // ...and the raw, unformatted backend concatenation never leaks through.
      await expect(banner).not.toContainText('superado4912.6');
    });
  });

  // ── Scenario 2: on-hold BP, attempted Complete, then a successful retry ──
  test.describe('on-hold condition via a failed then successful Complete', () => {
    const INVOICE_ID = 'pi-bpban-onhold';
    const INVOICE = baseInvoice(INVOICE_ID, BP_ON_HOLD);

    test.beforeEach(async ({ page }) => {
      await login(page);
      await installCommonMocks(page, INVOICE);

      // No businessPartner change in this scenario — respond empty to any callout.
      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/callout`, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ updates: {}, combos: {}, messages: [] }),
        });
      });

      // The Complete action (/action/documentAction): fails with the on-hold
      // message on the first attempt, succeeds on the second (state closed over
      // per-test via the `attempt` counter below).
      let attempt = 0;
      await page.route(`**/sws/neo/${SPEC}/${ENTITY}/${INVOICE_ID}/action/documentAction`, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        attempt += 1;
        if (attempt === 1) {
          // Real production wording (AD_MESSAGE `SelectedBPartnerBlocked`) — the
          // detector's ON_HOLD_PATTERN is anchored on this exact sentence shape
          // (ETP-5024 REVIEW: a bare "on hold" keyword false-positived on unrelated
          // AD_MESSAGE catalog entries like `lockedProduct`).
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.' } }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [{ ...INVOICE, documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', documentAction: '--', processed: true }] } }),
        });
      });

      await page.goto(`/${SPEC}/${INVOICE_ID}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('a refused Complete shows a persistent banner that survives, then clears on a successful retry', async ({ page }) => {
      await expect(page.getByTestId('bp-blocking-banner')).toHaveCount(0);

      const confirmBtn = page.getByTestId('action-save');
      await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
      await confirmBtn.click();

      const banner = page.getByTestId('bp-blocking-banner');
      await expect(banner).toBeVisible({ timeout: 5_000 });
      await expect(banner).toContainText(/on hold/i);

      // Not a toast, and it survives — assert it is still visible after a beat
      // (a hover/no-op interaction in between stands in for "other actions").
      await expect(page.locator('[data-type="error"]').filter({ hasText: /on hold/i })).toHaveCount(0);
      await page.mouse.move(200, 200);
      await page.waitForTimeout(1_000);
      await expect(banner).toBeVisible();

      // Retry Complete — this time the mock succeeds, the banner must clear.
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
      await confirmBtn.click();

      await expect(page.getByTestId('bp-blocking-banner')).toHaveCount(0, { timeout: 5_000 });
    });
  });
});
