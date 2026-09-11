import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Product price bar — per-record write serialisation (ETP-5255, mocked).
 *
 * Every tariff row of the "Precio" tab renders TWO `PriceStepper`s — `standardPrice` and
 * `listPrice` — and both write to the SAME endpoint, `PATCH /price/{row.id}`. Each stepper
 * refused to re-commit its own last value, but that guard is per INPUT: the two could not see
 * each other. Etendo's optimistic lock is per RECORD (`apiFetch` injects the remembered `updated`
 * token and the cache is only refreshed by a response), so stepping one and then the other inside
 * the stepper's 400ms debounce sent two writes carrying the same token, and the server refused
 * the second with a 409 `stale_record` against a record nobody else had touched.
 *
 * The fix routes both through `useRecordWriteQueue`, keyed by `row.id`. This spec guards that
 * invariant and the one that keeps it from becoming a latency regression: two DIFFERENT rows must
 * still write in parallel.
 *
 * **The non-overlap test asserts NON-OVERLAP, not arrival order.** Anything that dispatches two
 * writes also dispatches them in order, so an order-only assertion would pass against the exact
 * bug. The mock holds each PATCH open inside the route handler and records, per request, how many
 * earlier writes were still unanswered when it arrived. See docs/e2e-testing-guide.md
 * § "Organization Save — Two-Entity Write" for the canonical shape.
 *
 * Mock mode only — routes are installed AFTER `login()` so they win over its generic `/sws/**`
 * catch-all (Playwright matches routes in reverse registration order).
 *
 * Run with (dev server must NOT be in `VITE_MOCK` mode — see the guide's gotcha on `dev-mock`):
 *   cd e2e && npx playwright test tests/flows/product-price-single-flight.mocked.spec.js \
 *     --project=mocked
 */

// ── Synthetic data ───────────────────────────────────────────────────────────

const PRODUCT = {
  id: 'prod-sf-1',
  searchKey: 'PROD-SF-1',
  name: 'Producto tarifas',
  _identifier: 'Producto tarifas',
  productType: 'I',
  'productType$_identifier': 'Item',
  purchase: true,
  sale: true,
  stocked: true,
  returnable: false,
  organization: 'org-1',
  client: 'client-1',
  updated: 'PRODUCT-V1',
};

const priceRow = (id, tariff) => ({
  id,
  product: PRODUCT.id,
  priceListVersion: `plv-${id}`,
  'priceListVersion$_identifier': `Version ${tariff}`,
  'priceList$_identifier': tariff,
  'priceListVersion$salesPriceList': true,
  'priceListVersion$default': true,
  'priceListVersion$validFromDate': '2026-01-01',
  standardPrice: '8',
  listPrice: '10',
  priceLimit: '10',
});

const ROW_A = priceRow('price-sf-a', 'Tarifa A');
const ROW_B = priceRow('price-sf-b', 'Tarifa B');

/**
 * The token a record starts on. Deliberately not date-shaped: the client must forward whatever
 * opaque string the read returned, and a reused token has to be obvious in the failure message
 * instead of reading as "two timestamps that look alike".
 */
const initialToken = (rowId) => `${rowId}-V1`;

// ── Mock ─────────────────────────────────────────────────────────────────────

/**
 * Installs the `product` detail + `price` routes and returns the journal the tests assert on.
 *
 * Two routes for the price entity, never one: a glob ending in a bare `word**` does NOT cross a
 * `/`, so `…/price**` alone matches neither `/price/<id>` nor `/price/selectors/…`, and those
 * requests fall through to `login()`'s `/sws/**` catch-all — which answers every PATCH with a
 * synthetic success, so the journal would stay empty and the failure would look nothing like a
 * mocking bug. See docs/e2e-testing-guide.md § "Gotcha: a route pattern ending in a bare `word**`".
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {object[]} [options.rows] tariff rows the price endpoint serves
 * @param {number} [options.holdMs]
 *   How long every PATCH is held open INSIDE the route handler. This is what makes an overlap
 *   observable at all: without it, two concurrent writes and two serialized writes produce
 *   indistinguishable timestamps.
 */
async function installProductPriceMock(page, options = {}) {
  const { rows: seed = [ROW_A], holdMs = 0 } = options;

  /**
   * Entries are appended when the request ARRIVES, not when it is answered, so a test can observe
   * a write that is still in flight — which is what the parallelism test needs. `finishedAt`
   * stays `null` until the handler responds.
   *
   * @type {{writes: Array<{recordId: string, body: any, sentUpdated: any,
   *   respondedUpdated: string|null, startedAt: number, finishedAt: number|null,
   *   openOnArrival: number}>}}
   */
  const journal = { writes: [] };

  // Current server-side state, mutated by each accepted write — the point is that a write moves
  // the record's token on, so the NEXT write has to carry the new one.
  let rows = seed.map((row) => ({ ...row, updated: initialToken(row.id) }));
  const nextToken = (row) => `${row.id}-V${Number(String(row.updated).split('-V')[1] ?? 1) + 1}`;

  const priceHandler = async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Selector and defaults lookups are not record traffic — let `login()`'s stub answer them.
    if (/\/price\/selectors\//.test(url) || /\/price\/defaults/.test(url)) {
      await route.fallback();
      return;
    }

    const byId = url.match(/\/price\/([^/?]+)/);

    if (method === 'GET') {
      const data = byId ? rows.filter((r) => r.id === byId[1]) : rows;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data, totalRows: data.length } }),
      });
      return;
    }

    if (method === 'PATCH' && byId) {
      const recordId = byId[1];
      let body = null;
      try {
        body = JSON.parse(request.postData() ?? 'null');
      } catch {
        // A non-JSON body must surface in the assertions as `null`, not as an exception inside the
        // route handler (Playwright reports that as an unrelated "route was not handled" error).
      }

      const entry = {
        recordId,
        body,
        sentUpdated: body?.updated ?? null,
        respondedUpdated: null,
        startedAt: Date.now(),
        finishedAt: null,
        // How many other writes were still unanswered at the instant this one arrived. This — not
        // a comparison of arrival timestamps — is the direct measurement of overlap: 0 means the
        // client waited for the previous response, >0 means two writes were in flight at once.
        openOnArrival: journal.writes.filter((w) => w.finishedAt == null).length,
      };
      journal.writes.push(entry);

      if (holdMs > 0) {
        await new Promise((resolve) => { setTimeout(resolve, holdMs); });
      }
      entry.finishedAt = Date.now();

      const previous = rows.find((r) => r.id === recordId);
      const merged = { ...(previous ?? { id: recordId }), ...(body ?? {}) };
      delete merged.updated;
      merged.updated = nextToken(previous ?? { id: recordId, updated: `${recordId}-V1` });
      rows = rows.map((r) => (r.id === recordId ? merged : r));
      entry.respondedUpdated = merged.updated;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [merged] } }),
      });
      return;
    }

    await route.fallback();
  };

  await page.route('**/sws/neo/product/price/**', priceHandler);
  await page.route('**/sws/neo/product/price**', priceHandler);

  await page.route('**/sws/neo/product/product/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || /\/product\/product\/selectors\//.test(request.url())) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [PRODUCT] } }),
    });
  });

  return journal;
}

// ── Page helpers ─────────────────────────────────────────────────────────────

async function openPricingTab(page, options) {
  await login(page);
  const journal = await installProductPriceMock(page, options);
  await page.goto(`/product/${PRODUCT.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  // ETP-4402 made "Contabilidad" the default detail tab; the price bar lives in the
  // non-default "Precio" custom tab.
  await page.getByTestId('tab-custom:pricing').click();
  return journal;
}

/**
 * One tariff row. Anchored on the row's own `price-delete-{id}` testid — the only id-bearing hook
 * the row emits — so it never depends on row order or on the tariff's display text.
 */
const tariffRow = (page, rowId) => page
  .locator('div.flex.flex-row.items-end')
  .filter({ has: page.getByTestId(`price-delete-${rowId}`) })
  .first();

/**
 * The `+` button of one of a row's two steppers, in DOM order: `standardPrice` (unit price) then
 * `listPrice`. `PriceStepper` emits no per-field `data-testid` (reported, not patched — this spec
 * must not touch production code), so each stepper is reached through its price input.
 *
 * ETP-5283 (merge block): that input used to be selected as `input[type="number"]`, which was
 * unambiguous inside a row only because the tariff name input was the `type="text"` one. ETP-5107
 * replaced the stepper's native number input with a bare `MaskedAmountInput` — also `type="text"`
 * — so that selector now matches nothing. Queried by the stable `data-testid` ETP-5107 added,
 * the same one the `ProductPriceBar` Vitest suites use. The stepper's internals are otherwise
 * unchanged: `MaskedAmountInput` gets no `currency` prop here, so it renders the bare `<input>`
 * with no wrapper and the sibling walk below still holds.
 *
 * Inside a stepper the children are, in order, the input, the `−` button and the `+` button.
 */
function stepperPlus(page, rowId, field) {
  const index = field === 'standardPrice' ? 0 : 1;
  return tariffRow(page, rowId)
    .locator('input[data-testid="PriceStepperInput__d76b90"]')
    .nth(index)
    .locator('xpath=following-sibling::button[2]');
}

/** How many writes have been ANSWERED (as opposed to merely started). */
const settledCount = (journal) => journal.writes.filter((w) => w.finishedAt != null).length;

const writesFor = (journal, recordId) => journal.writes.filter((w) => w.recordId === recordId);

const describeWrites = (journal) => JSON.stringify(
  journal.writes.map((w) => ({
    id: w.recordId,
    fields: Object.keys(w.body ?? {}).filter((k) => k !== 'updated'),
    sentUpdated: w.sentUpdated,
    startedAt: w.startedAt,
    finishedAt: w.finishedAt,
    openOnArrival: w.openOnArrival,
  })),
  null,
  2,
);

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Product price bar — single-flight per tariff row (ETP-5255)', () => {
  test('the two steppers of ONE row never have two PATCHes in flight at once', async ({ page }) => {
    // 800ms is long enough that a second, unqueued write would demonstrably arrive inside the
    // first one's window, and short enough not to slow the suite down.
    const journal = await openPricingTab(page, { holdMs: 800 });

    const unitPlus = stepperPlus(page, ROW_A.id, 'standardPrice');
    const listPlus = stepperPlus(page, ROW_A.id, 'listPrice');
    await expect(unitPlus).toBeVisible({ timeout: 15_000 });

    // Both clicks must land inside the stepper's 400ms debounce window: once the first write is
    // in flight the row's steppers are disabled (`disabled={saving}`), and `step()` bails out on a
    // disabled stepper — the second trigger would never be produced at all. Two consecutive
    // Playwright clicks are tens of milliseconds apart, so this is comfortable; if it ever is not,
    // the failure is the "expected two answered PATCHes" poll below, not a false green.
    await unitPlus.click();
    await listPlus.click();

    await expect
      .poll(() => settledCount(journal), {
        timeout: 20_000,
        message: 'expected two answered PATCHes to /price/<id> (one per stepper)',
      })
      .toBe(2);
    expect(journal.writes, `exactly two PATCHes expected. Journal: ${describeWrites(journal)}`)
      .toHaveLength(2);

    const [first, second] = journal.writes;
    expect(first.recordId).toBe(ROW_A.id);
    expect(second.recordId).toBe(ROW_A.id);

    // Arrival ORDER is not the property under test — the buggy code also dispatched in order. The
    // property is that the second PATCH goes out only once the first has been answered, so the two
    // can never carry the same `updated` token.
    expect(
      second.openOnArrival,
      `The two PATCHes to /price/${ROW_A.id} overlapped: the second arrived while `
      + `${second.openOnArrival} earlier write(s) to the same row were still unanswered. A `
      + `per-input guard cannot see its sibling stepper — both must go through `
      + `useRecordWriteQueue, keyed by row.id. Journal: ${describeWrites(journal)}`,
    ).toBe(0);

    expect(
      second.startedAt,
      `The second PATCH started at +${second.startedAt - first.startedAt}ms while the first was `
      + `still open (it finished at +${first.finishedAt - first.startedAt}ms). `
      + `Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(first.finishedAt);

    // The queue must COALESCE the mid-flight edit, not drop it: both fields have to reach the
    // server, otherwise "serialised" would be indistinguishable from "second edit lost".
    const fields = journal.writes
      .flatMap((w) => Object.keys(w.body ?? {}))
      .filter((k) => k !== 'updated');
    expect(fields, `both stepper edits must be persisted. Journal: ${describeWrites(journal)}`)
      .toEqual(expect.arrayContaining(['standardPrice', 'listPrice']));
  });

  /**
   * Guards the second half of the ETP-5255 defect, which serialisation alone does NOT close.
   *
   * Once `useRecordWriteQueue` was in place the two steppers' writes stopped overlapping (the test
   * above), and yet the replay still went out carrying the token the first write had just
   * consumed — an ordering race in `apiFetch`, diagnosed in full in
   * `amortization-lines-single-flight.mocked.spec.js`. It reproduced 12/12 at `--workers=1` and
   * was observed to pass once in ~30 executions under heavy parallel load, so the 409 appeared
   * and disappeared with no pattern a user could describe.
   *
   * This panel had it worse than the amortization one: `ProductPriceBar.writePrice` has no refetch
   * on the success path at all, so there was not even a losing second chance to refresh the token.
   *
   * Closed in `@etendosoftware/app-shell-core` (`auth/api.js`): `harvestWrittenVersion` now
   * returns its promise instead of leaving it floating, and `createApiFetch` serialises versioned
   * writes per record — keyed by the same (canonical entity, id) pair the version cache uses —
   * awaiting the harvest before releasing the next write. So this assertion is about a guarantee
   * that lives BELOW the panel: it protects every caller, not just this one.
   */
  test('the second PATCH carries the token the first PATCH returned, never the one it reused', async ({ page }) => {
    const journal = await openPricingTab(page, { holdMs: 150 });

    const unitPlus = stepperPlus(page, ROW_A.id, 'standardPrice');
    const listPlus = stepperPlus(page, ROW_A.id, 'listPrice');
    await expect(unitPlus).toBeVisible({ timeout: 15_000 });

    await unitPlus.click();
    await listPlus.click();

    await expect.poll(() => settledCount(journal), { timeout: 20_000 }).toBe(2);

    const [first, second] = writesFor(journal, ROW_A.id);

    // The read armed the first write.
    expect(
      first.sentUpdated,
      `PATCH /price/${ROW_A.id} went out without an \`updated\` token — the server answers 400 `
      + `missing_updated. Body: ${JSON.stringify(first.body)}`,
    ).toBe(initialToken(ROW_A.id));

    // And the first write's RESPONSE must arm the second. Replaying the read's token here is the
    // whole defect: the server refuses it as a 409 `stale_record`, against a change the user
    // themself had just made.
    expect(
      second.sentUpdated,
      `The second PATCH reused the token the first one consumed (${first.sentUpdated}). It must `
      + `carry the token the first write's response returned (${first.respondedUpdated}), or the `
      + `server refuses it with 409 stale_record. Journal: ${describeWrites(journal)}`,
    ).toBe(first.respondedUpdated);
  });

  test('edits to DIFFERENT tariff rows still run in parallel', async ({ page }) => {
    // This is the guard against "fixing" the race by serialising everything: the queue is keyed by
    // row.id, so two rows must remain independent.
    const journal = await openPricingTab(page, { rows: [ROW_A, ROW_B], holdMs: 2_000 });

    const plusA = stepperPlus(page, ROW_A.id, 'standardPrice');
    const plusB = stepperPlus(page, ROW_B.id, 'standardPrice');
    await expect(plusA).toBeVisible({ timeout: 15_000 });
    await expect(plusB).toBeVisible();

    await plusA.click();
    await plusB.click();

    await expect
      .poll(() => journal.writes.length, { timeout: 20_000, message: 'expected one PATCH per row' })
      .toBe(2);

    const writeA = writesFor(journal, ROW_A.id)[0];
    const writeB = writesFor(journal, ROW_B.id)[0];
    expect(writeA, `expected a PATCH for row A. Journal: ${describeWrites(journal)}`).toBeTruthy();
    expect(writeB, `expected a PATCH for row B. Journal: ${describeWrites(journal)}`).toBeTruthy();

    // Measured at arrival, because by the time the assertion runs row A's write may well have been
    // answered — the question is whether B had to WAIT for it.
    expect(
      writeB.openOnArrival,
      `The write to tariff row B waited for row A to finish instead of going out alongside it. `
      + `The queue must be keyed by row.id, so different records stay concurrent — serialising `
      + `every row would turn this fix into a latency regression. Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(1);
  });
});
