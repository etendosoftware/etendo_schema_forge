import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Amortization lines — per-record write serialisation (ETP-5255, mocked).
 *
 * `AmortizationLinesTable` reaches ONE `PUT /lines/{id}` from four independent triggers on the
 * same row: the asset selector's `onChange` (immediate, no blur), the percentage `onBlur`, the
 * amount `onBlur`, and the dimensions panel's `onFieldSave`. It had no guard of any kind, and
 * Etendo's optimistic lock is per RECORD: `apiFetch` injects the remembered `updated` token into
 * every PUT/PATCH, and that cache is only refreshed by a response. So two writes to one row that
 * overlap both carry the token the first is about to consume, and the server refuses the second
 * with a 409 `stale_record` against a record nobody else touched.
 *
 * The refusal was also swallowed — `catch { }` plus an `if (res.ok)` with no `else` — so the user
 * saw no error at all, only their edit reverting after the next refetch.
 *
 * Both halves are guarded here, plus the property that makes the fix a fix and not a performance
 * regression: writes to DIFFERENT rows must still run in parallel.
 *
 * **The non-overlap test asserts NON-OVERLAP, not arrival order.** Anything that dispatches two
 * writes also dispatches them in order, so an order-only assertion would pass against the exact
 * bug. The mock holds each PUT open inside the route handler and the assertion compares the
 * second write's start against the first write's *finish*. See
 * docs/e2e-testing-guide.md § "Organization Save — Two-Entity Write" for the canonical shape.
 *
 * Mock mode only — routes are installed AFTER `login()` so they win over its generic `/sws/**`
 * catch-all (Playwright matches routes in reverse registration order).
 *
 * Run with (dev server must NOT be in `VITE_MOCK` mode — see the guide's gotcha on `dev-mock`):
 *   cd e2e && npx playwright test tests/flows/amortization-lines-single-flight.mocked.spec.js \
 *     --project=mocked
 */

// ── Synthetic data ───────────────────────────────────────────────────────────

const HEADER = {
  id: 'amort-sf-header-1',
  name: '31-05-2026',
  accountingDate: '2026-05-31',
  startingDate: '2026-05-01',
  totalAmortization: 5000,
  'currency$_identifier': 'EUR',
  // Draft: `isReadOnly = !editing || processed`, so the lines must be editable.
  processed: 'N',
  updated: 'HEADER-V1',
};

const LINE_A = {
  id: 'amort-sf-line-a',
  asset: 'asset-1',
  'asset$_identifier': 'Coche',
  amortizationPercentage: 8.33,
  amortizationAmount: 1500,
  'currency$_identifier': 'EUR',
};

const LINE_B = {
  id: 'amort-sf-line-b',
  asset: 'asset-2',
  'asset$_identifier': 'Furgoneta',
  amortizationPercentage: 4.17,
  amortizationAmount: 750,
  'currency$_identifier': 'EUR',
};

/**
 * The token a record starts on. Deliberately not date-shaped: the client must forward whatever
 * opaque string the read returned, and a reused token has to be obvious in the failure message
 * instead of reading as "two timestamps that look alike".
 */
const initialToken = (lineId) => `${lineId}-V1`;

// ── Mock ─────────────────────────────────────────────────────────────────────

/**
 * Installs the `amortization` header + lines routes and returns the journal the tests assert on.
 *
 * Two routes per entity, never one: a glob ending in a bare `word**` does NOT cross a `/`, so
 * `…/lines**` alone matches neither `/lines/<id>` nor `/lines/selectors/…`, and those requests
 * fall through to `login()`'s `/sws/**` catch-all — which answers every PUT with a synthetic
 * success, so the journal would stay empty and the failure would look nothing like a mocking bug.
 * See docs/e2e-testing-guide.md § "Gotcha: a route pattern ending in a bare `word**`".
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {object[]} [options.lines] rows the lines endpoint serves
 * @param {number} [options.holdMs]
 *   How long every PUT is held open INSIDE the route handler. This is what makes an overlap
 *   observable at all: without it, two concurrent writes and two serialized writes produce
 *   indistinguishable timestamps.
 * @param {number} [options.putStatus] status for every PUT (500 exercises the error path)
 */
async function installAmortizationMock(page, options = {}) {
  const { lines: seed = [LINE_A], holdMs = 0, putStatus = 200 } = options;

  /**
   * Entries are appended when the request ARRIVES, not when it is answered, so a test can observe
   * a write that is still in flight — which is exactly what the parallelism test needs.
   * `finishedAt` stays `null` until the handler responds.
   *
   * @type {{
   *   writes: Array<{recordId: string, body: any, sentUpdated: any, respondedUpdated: string|null,
   *                  startedAt: number, finishedAt: number|null}>,
   *   reads: number,
   * }}
   */
  const journal = { writes: [], reads: 0 };

  // Current server-side state, mutated by each accepted write — the point is that a write moves
  // the record's token on, so the NEXT write has to carry the new one.
  let rows = seed.map((line) => ({ ...line, updated: initialToken(line.id) }));
  const nextToken = (line) => `${line.id}-V${Number(String(line.updated).split('-V')[1] ?? 1) + 1}`;

  const linesHandler = async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Selector lookups are not record traffic — let `login()`'s stub answer them.
    if (/\/lines\/selectors\//.test(url) || /\/lines\/defaults/.test(url)) {
      await route.fallback();
      return;
    }

    const byId = url.match(/\/lines\/([^/?]+)/);

    if (method === 'GET') {
      journal.reads += 1;
      const data = byId ? rows.filter((r) => r.id === byId[1]) : rows;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data, totalRows: data.length } }),
      });
      return;
    }

    if (method === 'PUT' && byId) {
      const recordId = byId[1];
      const startedAt = Date.now();
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
        startedAt,
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

      if (putStatus !== 200) {
        await route.fulfill({
          status: putStatus,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Amortization line rejected by the server' } }),
        });
        return;
      }

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

  await page.route('**/sws/neo/amortization/lines/**', linesHandler);
  await page.route('**/sws/neo/amortization/lines**', linesHandler);

  const headerHandler = async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (/\/header\/selectors\//.test(url)) {
      await route.fallback();
      return;
    }
    const isDetail = /\/header\/[^/?]+/.test(url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        isDetail
          ? { response: { data: [HEADER] } }
          : { response: { data: [HEADER], totalRows: 1 } },
      ),
    });
  };

  await page.route('**/sws/neo/amortization/header/**', headerHandler);
  await page.route('**/sws/neo/amortization/header**', headerHandler);

  return journal;
}

// ── Page helpers ─────────────────────────────────────────────────────────────

async function openAmortizationDetail(page, options) {
  await login(page);
  const journal = await installAmortizationMock(page, options);
  await page.goto(`/amortization/${HEADER.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('inline-lines-panel')).toBeVisible({ timeout: 15_000 });
  return journal;
}

/** The `<tr>` of one line. `data-row-id` is the row's only stable, id-bearing hook. */
const lineRow = (page, lineId) => page.locator(`[data-row-id="${lineId}"]`);

/**
 * Puts a row into inline-edit mode (or takes it out of it).
 *
 * The pencil lives in a hover-revealed action strip and carries no `data-testid` — its label is
 * in `aria-label`/`title`, resolved through `ui('editLineTooltip')`, so the name pattern has to
 * cover both locales (mock mode defaults to es_ES).
 */
async function toggleRowEdit(page, lineId) {
  const row = lineRow(page, lineId);
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole('button', { name: /editar línea|edit line/i }).click();
}

/**
 * The two numeric inputs of a row in edit mode, in DOM order: percentage then amount.
 * Neither emits a `data-testid` (reported, not patched — this spec must not touch production
 * code), so they are located by type, scoped to the row.
 */
function numericInputs(page, lineId) {
  const inputs = lineRow(page, lineId).locator('input[type="number"]');
  return { percentage: inputs.nth(0), amount: inputs.nth(1) };
}

/** How many writes have been ANSWERED (as opposed to merely started). */
const settledCount = (journal) => journal.writes.filter((w) => w.finishedAt != null).length;

/** Every write the journal recorded for one record. */
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

test.describe('Amortization lines — single-flight per record (ETP-5255)', () => {
  test('two edits to the SAME line never have two PUTs in flight at once', async ({ page }) => {
    // 800ms is long enough that a second, unqueued write would demonstrably start inside the
    // first one's window, and short enough not to slow the suite down.
    const journal = await openAmortizationDetail(page, { holdMs: 800 });

    await toggleRowEdit(page, LINE_A.id);
    const { percentage, amount } = numericInputs(page, LINE_A.id);
    await expect(percentage).toBeVisible();

    // Two DIFFERENT triggers on one row: typing into `amount` moves focus off `percentage`, whose
    // blur fires PUT #1; Enter then blurs `amount` and fires PUT #2 while #1 is still open.
    await percentage.fill('9.5');
    await amount.fill('1777');
    await amount.press('Enter');

    await expect
      .poll(() => settledCount(journal), { timeout: 20_000, message: 'expected two answered PUTs to /lines/<id>' })
      .toBe(2);
    expect(journal.writes, `exactly two PUTs expected. Journal: ${describeWrites(journal)}`).toHaveLength(2);

    const [first, second] = journal.writes;

    expect(first.recordId, `both writes must target the same line. Journal: ${describeWrites(journal)}`)
      .toBe(LINE_A.id);
    expect(second.recordId).toBe(LINE_A.id);

    // Arrival ORDER is not the property under test — the buggy code also dispatched in order. The
    // property is that the second PUT starts only once the first has been answered, so the two can
    // never carry the same `updated` token.
    expect(
      second.openOnArrival,
      `The two PUTs to /lines/${LINE_A.id} overlapped: the second arrived while `
      + `${second.openOnArrival} earlier write(s) to the same record were still unanswered. `
      + `Writes to one record must be serialised by useRecordWriteQueue, keyed by recordId. `
      + `Journal: ${describeWrites(journal)}`,
    ).toBe(0);

    expect(
      second.startedAt,
      `The two PUTs to /lines/${LINE_A.id} overlapped: the second started at `
      + `+${second.startedAt - first.startedAt}ms while the first was still open (it finished at `
      + `+${first.finishedAt - first.startedAt}ms). Writes to one record must be serialised by `
      + `useRecordWriteQueue, keyed by recordId. Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(first.finishedAt);

    // The queue must COALESCE the mid-flight edit, not drop it: both fields have to reach the
    // server, otherwise "serialised" would be indistinguishable from "second edit lost".
    const fields = journal.writes.flatMap((w) => Object.keys(w.body ?? {})).filter((k) => k !== 'updated');
    expect(fields, `both edited fields must be persisted. Journal: ${describeWrites(journal)}`)
      .toEqual(expect.arrayContaining(['amortizationPercentage', 'amortizationAmount']));
  });

  /**
   * Guards the second half of the ETP-5255 defect, which serialisation alone does NOT close.
   *
   * Once `useRecordWriteQueue` was in place the two writes stopped overlapping (the test above),
   * and yet the replay still went out carrying the token the first write had just consumed:
   *
   *   PUT #1  amortizationPercentage  updated: <line>-V1   → response updated: <line>-V2
   *   PUT #2  amortizationAmount      updated: <line>-V1   ← reused; the server answers 409
   *
   * An ordering race, not a missing refresh: `apiFetch` harvested the new token from a write's
   * response asynchronously (a floating `res.clone().json().then(remember)`), and the queue's
   * `finally` dispatched the replay as soon as `write` resolved — several microtasks before that
   * `json()` settled. `AmortizationLinesTable.writeField` also fires `fetchLines()` on success,
   * which would refresh the token too, but it is not awaited either and lost the same race.
   *
   * Being a race is what made it dangerous rather than merely broken: it reproduced 12/12 at
   * `--workers=1` but was observed to pass once in ~30 executions under heavy parallel load, so
   * the 409 appeared and disappeared with no pattern a user could describe.
   *
   * Closed in `@etendosoftware/app-shell-core` (`auth/api.js`): `harvestWrittenVersion` now
   * returns its promise instead of leaving it floating, and `createApiFetch` serialises versioned
   * writes per record — keyed by the same (canonical entity, id) pair the version cache uses —
   * awaiting the harvest before releasing the next write. So this assertion is about a guarantee
   * that lives BELOW the panel: it protects every caller, not just this one.
   */
  test('the second PUT carries the token the first PUT returned, never the one it reused', async ({ page }) => {
    const journal = await openAmortizationDetail(page, { holdMs: 150 });

    await toggleRowEdit(page, LINE_A.id);
    const { percentage, amount } = numericInputs(page, LINE_A.id);
    await expect(percentage).toBeVisible();

    await percentage.fill('7.25');
    await amount.fill('1888');
    await amount.press('Enter');

    await expect.poll(() => settledCount(journal), { timeout: 20_000 }).toBe(2);

    const [first, second] = writesFor(journal, LINE_A.id);

    // The read armed the first write.
    expect(
      first.sentUpdated,
      `PUT /lines/${LINE_A.id} went out without an \`updated\` token — the server answers 400 `
      + `missing_updated. Body: ${JSON.stringify(first.body)}`,
    ).toBe(initialToken(LINE_A.id));

    // And the first write's RESPONSE armed the second. Replaying the read's token here is the
    // whole defect: the server refuses it as a 409 `stale_record`, against a change the user
    // themself had just made.
    expect(
      second.sentUpdated,
      `The second PUT reused the token the first one consumed (${first.sentUpdated}). It must `
      + `carry the token the first write's response returned (${first.respondedUpdated}), or the `
      + `server refuses it with 409 stale_record. Journal: ${describeWrites(journal)}`,
    ).toBe(first.respondedUpdated);
  });

  test('edits to DIFFERENT lines still run in parallel', async ({ page }) => {
    // This is the guard against "fixing" the race by serialising everything: the queue is keyed by
    // recordId, so two rows must remain independent. 2s of hold leaves ample room for the UI
    // interaction that triggers the second row's write while the first is still open.
    const journal = await openAmortizationDetail(page, {
      lines: [LINE_A, LINE_B],
      holdMs: 2_000,
    });

    // Row A: edit, commit with Enter, then close edit mode from INSIDE the row (clicking outside
    // it would hit the outside-click handler and swallow the next row's pencil click).
    await toggleRowEdit(page, LINE_A.id);
    const inputsA = numericInputs(page, LINE_A.id);
    await expect(inputsA.percentage).toBeVisible();
    await inputsA.percentage.fill('9.5');
    await inputsA.percentage.press('Enter');
    // The journal records a write on ARRIVAL, so this resolves while row A's PUT is still open.
    await expect.poll(() => journal.writes.length, { timeout: 10_000 }).toBe(1);
    await toggleRowEdit(page, LINE_A.id);

    // Row B: its write must not wait for row A's, which is still open.
    await toggleRowEdit(page, LINE_B.id);
    const inputsB = numericInputs(page, LINE_B.id);
    await expect(inputsB.percentage).toBeVisible();
    await inputsB.percentage.fill('5.5');
    await inputsB.percentage.press('Enter');

    await expect
      .poll(() => journal.writes.length, { timeout: 20_000, message: 'expected one PUT per line' })
      .toBe(2);

    const writeA = writesFor(journal, LINE_A.id)[0];
    const writeB = writesFor(journal, LINE_B.id)[0];
    expect(writeA, `expected a PUT for line A. Journal: ${describeWrites(journal)}`).toBeTruthy();
    expect(writeB, `expected a PUT for line B. Journal: ${describeWrites(journal)}`).toBeTruthy();

    // Measured at arrival, because by the time the assertion runs row A's write may well have
    // been answered — the question is whether B had to WAIT for it.
    expect(
      writeB.openOnArrival,
      `The write to line B waited for line A to finish instead of going out alongside it. The `
      + `queue must be keyed by recordId, so different records stay concurrent — serialising every `
      + `row would turn this fix into a latency regression. Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(1);
  });

  test('a rejected PUT is reported to the user instead of failing silently', async ({ page }) => {
    const journal = await openAmortizationDetail(page, { putStatus: 500 });

    await toggleRowEdit(page, LINE_A.id);
    const { percentage } = numericInputs(page, LINE_A.id);
    await expect(percentage).toBeVisible();
    await percentage.fill('9.5');
    await percentage.press('Enter');

    await expect.poll(() => settledCount(journal), { timeout: 20_000 }).toBeGreaterThan(0);

    // Before ETP-5255 this path was `if (res.ok)` with no `else`, inside a bare `catch {}`: the
    // refusal produced no toast and no error state, and the edit just reappeared with its old
    // value after the next refetch — which reads to the user as "the app lost my change".
    // Sonner v2 marks each toast with data-type — see docs/e2e-testing-guide.md § "Toast selectors".
    await expect(page.locator('[data-type="error"]')).toBeVisible({ timeout: 10_000 });
  });
});
