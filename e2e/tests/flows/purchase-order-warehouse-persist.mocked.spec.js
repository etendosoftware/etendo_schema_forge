import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Purchase Order — a user-picked Warehouse survives a STALE callout response
 * (ETP-4772 regression guard, mocked).
 *
 * ── What regression this protects ────────────────────────────────────────────
 * Opening a new Purchase Order auto-fires a callout for every non-dependent
 * selector field that has a default value (see the "default callouts" effect in
 * `DetailView.jsx`), Warehouse among them. If the user changes Warehouse WHILE
 * that default callout is still in flight, its response arrives carrying the
 * OLD (default) warehouse. Before ETP-4772 the "trigger field always wins" rule
 * in `applyCalloutFieldUpdates` applied it unconditionally, silently reverting
 * the user's choice — and, because the revert also lands in `hook.editing`, the
 * document was PERSISTED with the default warehouse.
 *
 * The fix is a per-field generation counter: `fieldGenerationRef` (DetailView)
 * is bumped on every genuine write and snapshotted at dispatch time; on arrival
 * `isStaleCalloutResponse` (detailViewHelpers) discards any response whose
 * snapshot no longer matches the field's current generation.
 *
 * ── Why this spec is MOCKED and must stay mocked ─────────────────────────────
 * The bug is a race: the stale response must land AFTER the user's edit and
 * BEFORE the user's own callout dispatch aborts it (`useCallout` aborts the
 * previous in-flight request for the same field, 300ms debounce later). Against
 * a real backend, whether that window is hit is pure network luck — which is
 * exactly why the earlier live-integration version of this guard was flaky,
 * grew a `test.skip` escape hatch (it needed >= 2 warehouses in the dataset),
 * and was ultimately deleted (ETP-4903 → ETP-4909) without the fix ever losing
 * its E2E coverage on purpose.
 *
 * Here `page.route()` HOLDS the default warehouse callout open until the test
 * has performed the change, then releases it — so the race is reproduced
 * deterministically on every run, the dataset always exposes exactly two
 * warehouses, and there is no conditional skip anywhere in this file. It also
 * runs in the `mocked` project (no backend, no credentials), so it is a real
 * enforceable guard in `.githooks/pre-push` / CI, not an opt-in manual spec.
 *
 * ── The load-bearing assertion ───────────────────────────────────────────────
 * `body.warehouse === WAREHOUSE_B.id` on the intercepted create POST — the ID
 * actually persisted, captured from the payload. The chip assertions are
 * secondary (a rendered label can lie about what got saved).
 */

// Etendo IDs are 32 uppercase hex chars. This is NOT cosmetic: `fireCallout`
// only dispatches (and only bumps the generation counter) for values matching
// /^[0-9A-Fa-f]{32}$/ (or a plain number/date), so a fake id like 'wh-002'
// would make the guard a no-op and this test vacuous.
const WAREHOUSE_A = { id: 'AAAAAAAA0000000000000000000000A1', label: 'Almacen Principal' };
const WAREHOUSE_B = { id: 'BBBBBBBB0000000000000000000000B2', label: 'Almacen Secundario' };

const BUSINESS_PARTNER = { id: 'CCCCCCCC0000000000000000000000C3', label: 'Proveedor E2E' };
const PARTNER_ADDRESS = { id: 'DDDDDDDD0000000000000000000000D4', label: 'Calle E2E 1' };
const PAYMENT_TERMS = { id: 'EEEEEEEE0000000000000000000000E5', label: '30 dias' };
const PRICE_LIST = { id: 'FFFFFFFF0000000000000000000000F6', label: 'Tarifa compra' };
const CURRENCY = { id: '11111111000000000000000000000017', label: 'EUR' };

const CREATED_ID = '99999999000000000000000000000099';

const DEFAULTS = {
  businessPartner: BUSINESS_PARTNER.id,
  'businessPartner$_identifier': BUSINESS_PARTNER.label,
  partnerAddress: PARTNER_ADDRESS.id,
  'partnerAddress$_identifier': PARTNER_ADDRESS.label,
  orderDate: '2026-08-28',
  scheduledDeliveryDate: '2026-08-28',
  warehouse: WAREHOUSE_A.id,
  'warehouse$_identifier': WAREHOUSE_A.label,
  paymentTerms: PAYMENT_TERMS.id,
  'paymentTerms$_identifier': PAYMENT_TERMS.label,
  priceList: PRICE_LIST.id,
  'priceList$_identifier': PRICE_LIST.label,
  currency: CURRENCY.id,
  'currency$_identifier': CURRENCY.label,
  grandTotalAmount: 0,
  summedLineAmount: 0,
};

const EMPTY_CALLOUT = { updates: {}, combos: {}, messages: [] };

/**
 * The stale payload: the shape NEO really returns for a warehouse callout,
 * except the value it carries is the DEFAULT warehouse (A) — i.e. the answer to
 * a question the user has already changed the answer to. `updates.warehouse` is
 * what used to clobber the user's pick; `combos.warehouse` mirrors the real
 * response shape (it is skipped for the trigger field by design).
 */
const STALE_CALLOUT = {
  updates: {
    warehouse: { value: WAREHOUSE_A.id, _identifier: WAREHOUSE_A.label },
  },
  combos: {
    warehouse: {
      selected: WAREHOUSE_A.id,
      entries: [
        { id: WAREHOUSE_A.id, identifier: WAREHOUSE_A.label },
        { id: WAREHOUSE_B.id, identifier: WAREHOUSE_B.label },
      ],
    },
  },
  messages: [],
};

/**
 * Deterministic gate around the callout endpoint.
 *
 * The default warehouse callout (recognised by `field === 'warehouse'` AND
 * `value === WAREHOUSE_A.id`, i.e. the value the form was born with) is parked
 * on a real Promise — no polling, no sleep — so releasing it fulfills in the
 * same microtask and the response reaches the browser within a few ms. Every
 * other callout (businessPartner, priceList, currency… fired by the same
 * default-callouts effect, plus the user's own warehouse dispatch with
 * `value === WAREHOUSE_B.id`) answers empty immediately, so the only thing this
 * test can possibly be measuring is the stale-response guard.
 */
/**
 * Bounded wait: turns "the premise never happened" into an explicit, named
 * failure instead of an opaque 60s test-timeout. Never a skip.
 */
async function withDeadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms waiting for: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function createCalloutGate() {
  let markSeen;
  let markDelivered;
  let release;
  const gate = {
    seen: new Promise((resolve) => { markSeen = resolve; }),
    delivered: new Promise((resolve) => { markDelivered = resolve; }),
    release: () => release(),
    aborted: null,
  };
  const held = new Promise((resolve) => { release = resolve; });
  gate._held = held;
  gate._markSeen = () => markSeen();
  gate._markDelivered = () => markDelivered();
  return gate;
}

async function installCalloutMock(page, gate) {
  await page.route('**/sws/neo/purchase-order/header/callout', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const isStaleDefaultWarehouseCallout = body.field === 'warehouse' && body.value === WAREHOUSE_A.id;

    if (!isStaleDefaultWarehouseCallout) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_CALLOUT),
      });
      return;
    }

    gate._markSeen();
    await gate._held;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STALE_CALLOUT),
      });
      gate._markDelivered();
    } catch (err) {
      // The browser aborted the held request before we could answer it (the
      // user's own warehouse dispatch aborts the previous in-flight one 300ms
      // after the change). That means the race window closed and the test
      // proved nothing — fail loudly instead of reporting a hollow green.
      gate.aborted = err;
      gate._markDelivered();
    }
  });
}

async function installOrderMocks(page, capture) {
  // Registration order matters: Playwright matches routes in REVERSE order, so
  // the broader routes go first and the specific ones after them. Everything not
  // routed here (e.g. GET /header/new, the other selectors) falls through to
  // login()'s generic /sws/** stub on purpose.
  await page.route(`**/sws/neo/purchase-order/header/${CREATED_ID}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...capture.savedRecord, id: CREATED_ID }] } }),
    });
  });

  await page.route('**/sws/neo/purchase-order/header**', async (route) => {
    const method = route.request().method();
    // `header**` also matches sub-paths under /header on Playwright 1.58 (e.g.
    // POST /header/evaluate-display, which carries a `fieldValues` envelope and
    // is NOT the create call) — verified live. Gate on the exact path so
    // `capture.createBodies` only ever holds real create payloads.
    const isCreatePath = /\/sws\/neo\/purchase-order\/header(\?|$)/.test(route.request().url());
    if (method === 'POST' && isCreatePath) {
      const body = route.request().postDataJSON() ?? {};
      capture.createBodies.push(body);
      const saved = {
        ...body,
        id: CREATED_ID,
        documentNo: 'PO-E2E-4772',
        documentStatus: 'DR',
        'documentStatus$_identifier': 'Borrador',
        processed: false,
      };
      capture.savedRecord = saved;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { status: 0, data: [saved] } }),
      });
      return;
    }
    if (method === 'GET' && isCreatePath) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
      return;
    }
    return route.fallback();
  });

  await page.route('**/sws/neo/purchase-order/lines**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  await page.route('**/sws/neo/purchase-order/header/defaults**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        defaults: { ...DEFAULTS },
        metadata: { unresolvedFields: [], sequenceFields: ['documentNo'] },
      }),
    });
  });

  // Partner Address is a `dependent` selector: it re-fetches its option list
  // from the selected Business Partner and drops any value that is not in that
  // list. Without this mock the default `partnerAddress` is cleared, the form
  // stays invalid and `action-save-draft` is permanently disabled
  // (`data-missing-required="partnerAddress"`).
  await page.route('**/sws/neo/purchase-order/header/selectors/C_BPartner_Location_ID**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: PARTNER_ADDRESS.id, label: PARTNER_ADDRESS.label }] }),
    });
  });

  // Always two warehouses — that is what removes the "environment only exposes
  // one Warehouse option" conditional skip the deleted integration guard had.
  // NOTE the endpoint is keyed by DB COLUMN (`M_Warehouse_ID`), not by field
  // name — verified live against the running app, do not "normalise" it to
  // `/selectors/warehouse` (that URL is never requested and the mock would
  // silently fall through to login()'s stub, leaving the dropdown empty).
  await page.route('**/sws/neo/purchase-order/header/selectors/M_Warehouse_ID**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { id: WAREHOUSE_A.id, label: WAREHOUSE_A.label },
          { id: WAREHOUSE_B.id, label: WAREHOUSE_B.label },
        ],
      }),
    });
  });
}

test.describe('Purchase Order — user-picked Warehouse survives a stale callout (ETP-4772)', () => {
  test('a stale warehouse callout response neither reverts the field nor gets persisted', async ({ page }) => {
    const gate = createCalloutGate();
    const capture = { createBodies: [], savedRecord: { ...DEFAULTS } };

    await login(page);
    await installOrderMocks(page, capture);
    await installCalloutMock(page, gate);

    await page.goto('/purchase-order/new');

    // The form is born with warehouse = A (from /defaults).
    const chip = page.getByTestId('field-warehouse-chip');
    await chip.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(chip).toContainText(WAREHOUSE_A.label);

    // Wait until the default-callout for warehouse is actually parked in the
    // route handler. Explicit failure (never a skip) if it never fires: the
    // premise of the whole test would be gone.
    await withDeadline(
      gate.seen,
      20_000,
      'the default warehouse callout to reach the mock (without it the ETP-4772 race cannot be set up)',
    );

    // ── The user changes Warehouse while that callout is still in flight ────
    await chip.click();
    const combobox = page.getByTestId('field-warehouse');
    await combobox.waitFor({ state: 'visible', timeout: 10_000 });

    // Identify the option by ID, never by label text.
    const optionB = page.getByTestId(`option-warehouse-${WAREHOUSE_B.id}`);
    await optionB.waitFor({ state: 'visible', timeout: 15_000 });
    await optionB.click();

    // Release the parked stale response IMMEDIATELY: the field generation was
    // bumped synchronously inside the click handler, and `useCallout` will abort
    // this request 300ms later when the user's own dispatch fires.
    gate.release();
    await withDeadline(gate.delivered, 10_000, 'the stale callout response to be delivered to the app');
    expect(
      gate.aborted,
      `The stale callout response was aborted before delivery (${gate.aborted?.message ?? ''}) — `
      + 'the race window closed and this run proved nothing',
    ).toBeNull();

    // Let the stale response be processed and the user's own callout complete.
    await page.waitForTimeout(1_500);

    const chipAfter = page.getByTestId('field-warehouse-chip');
    await chipAfter.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(chipAfter).toContainText(WAREHOUSE_B.label);
    await expect(chipAfter).not.toContainText(WAREHOUSE_A.label);

    // ── The assertion that matters: what actually gets persisted ───────────
    await page.getByTestId('action-save-draft').click();

    await expect
      .poll(() => capture.createBodies.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const body = capture.createBodies[0];
    expect(
      body.warehouse,
      '[ETP-4772] The create payload must carry the warehouse the user picked, not the stale callout default',
    ).toBe(WAREHOUSE_B.id);
    expect(body.warehouse).not.toBe(WAREHOUSE_A.id);

    // And the saved record round-trips with the user's warehouse.
    await expect(page).toHaveURL(new RegExp(`/purchase-order/${CREATED_ID}`), { timeout: 15_000 });
    const chipSaved = page.getByTestId('field-warehouse-chip');
    await chipSaved.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(chipSaved).toContainText(WAREHOUSE_B.label);
  });
});
