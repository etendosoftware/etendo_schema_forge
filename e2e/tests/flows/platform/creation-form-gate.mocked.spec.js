// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
// @covers tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
// @covers tools/app-shell/src/hooks/useEntity.js
// @covers tools/app-shell/src/hooks/useCallout.js
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Creation form (`/new`) — the loading gate covers the initial CALLOUT chain, and a
 * record navigation neutralizes the in-flight defaults (ETP-4742, mocked).
 *
 * ── What regression this protects ────────────────────────────────────────────
 * A `/new` route fires `GET /<entity>/defaults` and then, staggered 400 ms apart, one
 * `POST /<entity>/callout` per non-dependent selector field the defaults populated
 * (`useDefaultCallouts`, detailViewHelpers). Callout results are applied by DetailView's
 * `[calloutResult]` effect — i.e. AFTER the form has already painted — so before ETP-4742
 * the gate released as soon as `/defaults` settled and the user watched `priceList`,
 * `paymentTerms` and the partner address change under their eyes. `isLoadingRecordForRoute`
 * now also waits on `initialCalloutsPending`, and the placeholder it renders carries
 * `data-testid="detail-loading-gate"`.
 *
 * ETP-4742 also made a record load actually ABORT the in-flight defaults request
 * (`neutralizePendingDefaults`), where ETP-4741 only made the late response epoch-inert —
 * so the request kept running a full round trip nobody could use.
 *
 * ── Why this spec is MOCKED and must stay mocked ─────────────────────────────
 * Both subjects are about ORDERING between two requests and one React commit. Against a
 * real backend whether the callout chain is still in flight when the gate would release is
 * pure network luck; here `page.route()` parks each request on a real Promise the test
 * releases by hand, so the interleaving is exact on every run, no backend and no
 * credentials are involved, and there is no `test.skip` anywhere in this file.
 *
 * ── The load-bearing assertions ──────────────────────────────────────────────
 * A) The gate is still visible once EVERY other callout of the chain has been answered —
 *    i.e. the only thing still holding it up is the parked callout. Then, after that one
 *    callout is released, the form renders and shows the value THE CALLOUT derived (a
 *    price list the defaults never mentioned), not merely the defaults.
 * B) After a record navigation the record's own value is on screen and the held defaults
 *    response never lands — and the browser reports the defaults request as ABORTED, which
 *    is ETP-4742's new behaviour (ETP-4741 left it running).
 *
 * NOTE on `login()`: it stubs `/sws/**` generically, including `POST /**\/callout`. Playwright
 * matches routes in REVERSE registration order, so every route below is registered AFTER
 * `login()` and wins.
 */

/**
 * Etendo IDs are 32 uppercase hex chars. This is NOT cosmetic: `fireCallout` /
 * `useDefaultCallouts` only dispatch for values matching /^[0-9A-Fa-f]{32}$/ (or a plain
 * number/date), so a readable fake id like 'pl-001' would make the chain a no-op and this
 * spec vacuous.
 */
const BUSINESS_PARTNER = { id: 'CCCCCCCC0000000000000000000000C3', label: 'Cliente E2E' };
const PAYMENT_TERMS = { id: 'EEEEEEEE0000000000000000000000E5', label: '30 dias' };
const WAREHOUSE = { id: 'AAAAAAAA0000000000000000000000A1', label: 'Almacen Principal' };
const CURRENCY = { id: '11111111000000000000000000000017', label: 'EUR' };
/** Derived by the parked businessPartner callout — deliberately NOT a default (see below). */
const PRICE_LIST_DERIVED = { id: '22222222000000000000000000000028', label: 'Tarifa derivada' };

const ORDER_ID = '99999999000000000000000000000099';
/** Marker the record's own values are checked against in the neutralization test. */
const RECORD_BUSINESS_PARTNER = { id: '4444444400000000000000000000004A', label: 'Proveedor del registro' };
const ORDER = {
  id: ORDER_ID,
  documentNo: 'SO-E2E-4742',
  documentStatus: 'DR',
  orderDate: '2026-01-15',
  businessPartner: RECORD_BUSINESS_PARTNER.id,
  'businessPartner$_identifier': RECORD_BUSINESS_PARTNER.label,
  processed: false,
};

/**
 * The creation defaults. `priceList` is DELIBERATELY absent: a default on a selector field
 * makes that field a chain trigger, and a trigger's own dispatch bumps its generation — so a
 * defaulted priceList could never be derived by an EARLIER callout (the update would be
 * discarded as stale by `isStaleCalloutResponse`, ETP-4772). Leaving it out is what makes
 * "the callout derived it" true rather than a re-derivation of a default.
 */
const DEFAULTS = {
  businessPartner: BUSINESS_PARTNER.id,
  'businessPartner$_identifier': BUSINESS_PARTNER.label,
  orderDate: '2026-08-28',
  paymentTerms: PAYMENT_TERMS.id,
  'paymentTerms$_identifier': PAYMENT_TERMS.label,
  warehouse: WAREHOUSE.id,
  'warehouse$_identifier': WAREHOUSE.label,
  currency: CURRENCY.id,
  'currency$_identifier': CURRENCY.label,
};

/** Every selector field the chain may call, so any of them resolves an option list. */
const SELECTOR_OPTIONS = [BUSINESS_PARTNER, PAYMENT_TERMS, WAREHOUSE, CURRENCY, PRICE_LIST_DERIVED];

/** The callout the chain dispatches FIRST (api.selectors order) — the one this spec parks. */
const HELD_CALLOUT_FIELD = 'businessPartner';
/**
 * Chain members whose arrival is awaited before "the gate is still up" is asserted. The gate
 * assertion is only meaningful once every OTHER chain callout has settled — otherwise it
 * could be up merely because the chain is still starting.
 */
const OTHER_CHAIN_FIELDS = ['paymentTerms', 'warehouse'];

const MOUNT_TIMEOUT = 20_000;

/**
 * Bounded wait: turns "the premise never happened" into an explicit, named failure instead
 * of an opaque 60 s test timeout. Never a skip.
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

/** A real Promise the test releases by hand — no polling, no sleep. */
function makeHold() {
  const hold = { release: null };
  hold.promise = new Promise((resolve) => { hold.release = resolve; });
  return hold;
}

/**
 * Mock every endpoint the `/sales-order/new` route touches, and park the requests the test
 * wants to control:
 *  - `GET  /header/defaults`  — parked on `defaultsHold`.
 *  - `POST /header/callout`   — the `businessPartner` callout is parked on `calloutHold` and
 *    answers with a DERIVED price list; every other callout answers empty immediately, so the
 *    only thing this spec can be measuring is the gate around the parked one.
 *  - `GET  /header/<id>`      — the existing record, for the navigation test.
 * All of them must be registered AFTER `login()` (LIFO route matching).
 */
async function installMocks(page, { defaultsHold, calloutHold }) {
  const journal = {
    defaultsSeen: false,
    callouts: [],
    answered: 0,
    // The exact Request objects of every /defaults call, so the abort assertion is about THE
    // request under test and not about any other /defaults request that happens to fail.
    defaultsRequests: [],
    defaultsDelivered: false,
    defaultsHandled: false,
  };
  let markHeldSeen;
  journal.heldCalloutSeen = new Promise((resolve) => { markHeldSeen = resolve; });

  // The browser's own abort of the defaults request is the observable for ETP-4742's
  // "record load aborts the superseded fetch". `request.failure()` is where it surfaces —
  // captured per request rather than by URL so an unrelated abort cannot satisfy the assertion.
  await page.route('**/sws/neo/sales-order/header/defaults**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    journal.defaultsSeen = true;
    journal.defaultsRequests.push(route.request());
    await defaultsHold.promise;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          defaults: { ...DEFAULTS },
          metadata: { unresolvedFields: [], sequenceFields: ['documentNo'] },
        }),
      });
      journal.defaultsDelivered = true;
    } catch {
      // The request was aborted before this response could be handed over — the point of
      // the neutralization test. Recorded through the request's own `failure()` instead.
    } finally {
      journal.defaultsHandled = true;
    }
  });

  // Any FK selector option list the form asks for. Registered after `login()` so it wins
  // over the generic single-item stub.
  await page.route('**/sws/neo/sales-order/header/selectors/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: SELECTOR_OPTIONS.map((o) => ({ id: o.id, label: o.label })) }),
    });
  });

  await page.route('**/sws/neo/sales-order/header/callout', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    journal.callouts.push(body.field);

    if (body.field === HELD_CALLOUT_FIELD) {
      journal.heldSeen = true;
      markHeldSeen();
      await calloutHold.promise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // The value the CALL-OUT derives: a price list no default mentioned. Asserting it on
        // screen is what proves the gate waited for the callout result, not just for defaults.
        body: JSON.stringify({
          updates: { priceList: { value: PRICE_LIST_DERIVED.id, _identifier: PRICE_LIST_DERIVED.label } },
          combos: {},
          messages: [],
        }),
      });
      return;
    }

    journal.answered += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ updates: {}, combos: {}, messages: [] }),
    });
  });

  // Exact detail path only: the glob also matches sub-paths like `/evaluate-display`, which
  // must keep falling through to login()'s generic stub.
  const isDetailPath = new RegExp(`/sws/neo/sales-order/header/${ORDER_ID}(\\?|$)`);
  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}**`, async (route) => {
    if (route.request().method() !== 'GET' || !isDetailPath.test(route.request().url())) {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...ORDER }] } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  return journal;
}

test.describe('Creation form gate — the /new loading gate covers the initial callout chain (ETP-4742)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('the gate stays up until the parked callout has been applied, then shows the value the callout derived', async ({ page }) => {
    const defaultsHold = makeHold();
    const calloutHold = makeHold();
    const journal = await installMocks(page, { defaultsHold, calloutHold });

    await page.goto('/sales-order/new');

    // ── The defaults request is in flight: placeholder up, form not rendered ──────────────
    const gate = page.getByTestId('detail-loading-gate');
    await expect(gate).toBeVisible({ timeout: MOUNT_TIMEOUT });
    await withDeadline(
      expect.poll(() => journal.defaultsSeen, { timeout: 15_000 }).toBe(true),
      MOUNT_TIMEOUT,
      'GET /sales-order/header/defaults to reach the mock',
    );
    await expect(
      page.getByTestId('detail-view'),
      'the form must not be rendered while the defaults are still in flight',
    ).toHaveCount(0);

    // ── Release the defaults: the chain arms and parks the businessPartner callout ───────
    defaultsHold.release();
    await withDeadline(
      journal.heldCalloutSeen,
      20_000,
      `the initial ${HELD_CALLOUT_FIELD} callout to reach the mock (without it there is no `
      + 'callout chain for the gate to cover and this spec would prove nothing)',
    );

    // Wait until every OTHER chain callout has been answered. Only then does "the gate is
    // still visible" isolate the parked callout instead of the chain merely still starting.
    await expect.poll(
      () => OTHER_CHAIN_FIELDS.every((field) => journal.callouts.includes(field)),
      { timeout: 15_000 },
    ).toBe(true);
    await expect.poll(
      () => journal.answered >= journal.callouts.filter((field) => field !== HELD_CALLOUT_FIELD).length,
      { timeout: 15_000 },
    ).toBe(true);

    // ── THE ASSERTION: the gate covers the callout, not just the defaults ────────────────
    await expect(
      gate,
      `the loading gate dropped while the ${HELD_CALLOUT_FIELD} callout was still in flight — `
      + 'the form would paint before the callout-derived price list lands (the ETP-4742 defect)',
    ).toBeVisible();
    await expect(page.getByTestId('detail-view')).toHaveCount(0);

    // ── Release the parked callout: its result is applied, and only then does the gate lift ─
    calloutHold.release();
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('detail-loading-gate')).toHaveCount(0);

    // The derived price list — a value only the CALL-OUT produced — is on screen.
    const priceListChip = page.getByTestId('field-priceList-chip');
    await expect(priceListChip).toBeVisible({ timeout: 10_000 });
    await expect(priceListChip).toContainText(PRICE_LIST_DERIVED.label);
  });

  test('navigating from /new to an existing record aborts the in-flight defaults and drops its values', async ({ page }) => {
    const defaultsHold = makeHold();
    const calloutHold = makeHold();
    const journal = await installMocks(page, { defaultsHold, calloutHold });

    await page.goto('/sales-order/new');
    await expect(page.getByTestId('detail-loading-gate')).toBeVisible({ timeout: MOUNT_TIMEOUT });
    await withDeadline(
      expect.poll(() => journal.defaultsSeen, { timeout: 15_000 }).toBe(true),
      MOUNT_TIMEOUT,
      'GET /sales-order/header/defaults to reach the mock',
    );

    // ── Navigate to an existing record WITHOUT leaving the document ──────────────────────
    // `page.goto` would be a full document load, and the browser would abort the request
    // itself — the code under test (`useEntity.neutralizePendingDefaults`) would never run.
    // A `pushState` + `popstate` is exactly the in-app navigation react-router performs for a
    // link (and what `page.goBack()` replays in other specs), so the same DetailView/useEntity
    // instance survives and `recordId` changes — the transition the neutralization guards.
    await page.evaluate((url) => {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/sales-order/${ORDER_ID}`);

    // ── The existing record renders: the gate lifts ──────────────────────────────────────
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('detail-loading-gate')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/sales-order/${ORDER_ID}$`));
    await expect(page.getByTestId('field-documentNo')).toHaveValue(ORDER.documentNo);

    // ── The defaults request was ABORTED (ETP-4742), not merely left running ─────────────
    expect(
      journal.defaultsRequests,
      'more than one /defaults request was issued — a superseding creation session would make '
      + 'the abort assertion ambiguous, so this run cannot prove anything',
    ).toHaveLength(1);
    await expect.poll(
      () => journal.defaultsRequests[0]?.failure()?.errorText ?? '',
      {
        timeout: 15_000,
        message: 'the superseded /defaults request was not aborted — a record load must cancel it '
          + '(ETP-4741 only made the late response inert; ETP-4742 aborts the fetch)',
      },
    ).toContain('ERR_ABORTED');
    expect(
      journal.defaultsDelivered,
      'the defaults response was delivered before the abort — the request was not in flight '
      + 'when the record navigation happened, so this run proved nothing',
    ).toBe(false);

    // ── The neutralized defaults never land in the record's form ─────────────────────────
    // The record's own values are on screen while the superseded request is still in flight…
    const bpChip = page.getByTestId('field-businessPartner-chip');
    await expect(bpChip).toBeVisible({ timeout: 10_000 });
    await expect(bpChip).toContainText(RECORD_BUSINESS_PARTNER.label);
    await expect(
      bpChip,
      'the superseded /defaults response overwrote the loaded record\'s value',
    ).not.toContainText(BUSINESS_PARTNER.label);

    // …and they are still the ones on screen once the parked response has been handed over.
    // The browser aborted the request, so it discards the response; the epoch guard would drop
    // it even if it arrived. Either way the form must not move.
    defaultsHold.release();
    await expect.poll(() => journal.defaultsHandled, { timeout: 5_000 }).toBe(true);
    await expect(page.getByTestId('field-documentNo')).toHaveValue(ORDER.documentNo);
    await expect(bpChip).not.toContainText(BUSINESS_PARTNER.label);
  });
});
