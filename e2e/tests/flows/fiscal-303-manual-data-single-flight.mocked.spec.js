import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Modelo 303 — manual-data autosave serialisation (ETP-5255, mocked).
 *
 * `FmModel303Page` autosaves the identification checkboxes and box overrides through a debounced
 * (800ms) `PUT /fiscal303/declarations?id=…`. It was the one panel of the four that was already
 * correct before the shared queue existed — but only because it saves the WHOLE record at once, so
 * its single in-flight flag was a per-record key by accident of shape rather than by design. It
 * now uses `useRecordWriteQueue` so it cannot drift back into a fourth private copy of the guard.
 *
 * This spec pins that behaviour from the browser, where the debounce, the autosave effect and the
 * queue actually interact:
 *
 *  - two edits made ~1s apart never have two PUTs in flight at once (asserted as NON-OVERLAP, not
 *    arrival order — anything that dispatches two writes also dispatches them in order, so an
 *    order-only assertion would pass against the exact bug);
 *  - the write requested mid-flight is coalesced and replayed with the LATEST state, not with the
 *    state the first write already saved. That is what makes serialisation safe here: the panel
 *    sends a whole snapshot, so a replay of a stale snapshot would silently undo the user's second
 *    edit rather than merely duplicating a write.
 *
 * There is deliberately NO token assertion. Unlike the other three panels, this write does not go
 * through the generic per-record CRUD path — it targets a bespoke route that carries the record id
 * in the QUERY STRING (`?id=…`), so `apiFetch`'s version cache never resolves a token for it. What
 * the request actually carries is recorded in the journal and reported rather than asserted; see
 * the note on the `sentUpdated` field below.
 *
 * Mock mode only — routes are installed AFTER `login()` so they win over its generic `/sws/**`
 * catch-all (Playwright matches routes in reverse registration order).
 *
 * Run with (dev server must NOT be in `VITE_MOCK` mode — see the guide's gotcha on `dev-mock`):
 *   cd e2e && npx playwright test tests/flows/fiscal-303-manual-data-single-flight.mocked.spec.js \
 *     --project=mocked
 */

// ── Synthetic data ───────────────────────────────────────────────────────────

const DECL = {
  id: 'decl-sf-303-001',
  model: '303',
  year: 2026,
  period: 'T1',
  status: 'draft',
  type: 'ord',
  incidents: { blocking: 0, warning: 0, items: [] },
};

/** The `redeme` identification checkbox's own label — mock mode defaults to es_ES. */
const REDEME_LABEL = /Registro de devoluci[oó]n mensual|Monthly VAT Refund Register/i;

// ── Mock ─────────────────────────────────────────────────────────────────────

/**
 * Installs the fiscal-models catalog and the `fiscal303/declarations` route, and returns the
 * journal the tests assert on.
 *
 * The glob ends in `declarations**` rather than `declarations` because the save carries the record
 * id in the query string; a pattern without the trailing `**` matches the bare GET/POST and
 * silently misses the PUT, which then falls through to `login()`'s `/sws/**` catch-all and is
 * answered with a synthetic success. See docs/e2e-testing-guide.md § "Gotcha: a route pattern
 * ending in a bare `word**`".
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {number} [options.holdMs]
 *   How long every PUT is held open INSIDE the route handler. This is what makes an overlap
 *   observable at all, and it must exceed the panel's 800ms autosave debounce.
 */
async function installFiscal303Mock(page, options = {}) {
  const { holdMs = 0 } = options;

  /**
   * Entries are appended when the request ARRIVES, not when it is answered, so a test can observe
   * a write that is still in flight. `finishedAt` stays `null` until the handler responds.
   *
   * `sentUpdated` is recorded for completeness only — this route is not on the generic per-record
   * path, so no optimistic-locking token is expected. Nothing asserts on it.
   *
   * @type {{writes: Array<{body: any, sentUpdated: any, startedAt: number,
   *   finishedAt: number|null, openOnArrival: number}>}}
   */
  const journal = { writes: [] };

  // FmListPage gates both the "Nueva declaración" button and the row-visibility filter on
  // `activeModels[decl.model]`; the generic catch-all answers this URL with a shape that leaves
  // `activeModels['303']` undefined and silently hides every row. Mock it explicitly.
  await page.route('**/fiscal-models-catalog', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 303: true, 349: false }),
    });
  });

  await page.route('**/fiscal303/declarations**', async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([DECL]),
      });
      return;
    }

    if (method === 'PUT') {
      let body = null;
      try {
        body = JSON.parse(request.postData() ?? 'null');
      } catch {
        // A non-JSON body must surface in the assertions as `null`, not as an exception inside the
        // route handler (Playwright reports that as an unrelated "route was not handled" error).
      }

      const entry = {
        body,
        sentUpdated: body?.updated ?? null,
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // `manualDataApplied` must not be `false`: `persistManualData` collapses that into a
        // rejection, which would make the queue discard whatever was queued behind this write.
        body: JSON.stringify({ ok: true, manualDataApplied: true }),
      });
      return;
    }

    await route.fallback();
  });

  return journal;
}

// ── Page helpers ─────────────────────────────────────────────────────────────

/**
 * Opens the seeded draft declaration's "Identificación" section.
 *
 * The 303 detail has no URL of its own — `FmListPage` hands the selected declaration to the detail
 * component through state (`onSelect`) — so it is reached by clicking the row, not by navigating.
 */
async function openIdentificacion(page, options) {
  await login(page);
  const journal = await installFiscal303Mock(page, options);

  await page.goto('/fiscal-models');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  const row = page.locator('tr').filter({ hasText: String(DECL.year) }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  const identButton = page.getByRole('button', { name: /^Identificaci[oó]n$/i });
  await expect(identButton).toBeVisible({ timeout: 15_000 });
  await identButton.click();

  return journal;
}

/**
 * The `redeme` identification checkbox.
 *
 * Every checkbox in the section shares one codemod-generated `data-testid` (reported, not patched
 * — this spec must not touch production code), so each is identified by its own label text, which
 * is the user-visible and stable anchor.
 *
 * The clickable element is the `<label>`, not the `<input>`: the shared `Checkbox` renders its
 * input `sr-only` and the visible box intercepts pointer events, so clicking the input itself
 * fails actionability with "…intercepts pointer events" until it times out.
 */
const redemeCheckbox = (page) => page
  .locator('.fm-aeat-ident-cb')
  .filter({ hasText: REDEME_LABEL })
  .first()
  .locator('label')
  .first();

/** How many writes have been ANSWERED (as opposed to merely started). */
const settledCount = (journal) => journal.writes.filter((w) => w.finishedAt != null).length;

const describeWrites = (journal) => JSON.stringify(
  journal.writes.map((w) => ({
    identification: w.body?.manualData?.identification ?? null,
    startedAt: w.startedAt,
    finishedAt: w.finishedAt,
    openOnArrival: w.openOnArrival,
  })),
  null,
  2,
);

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Modelo 303 manual data — single-flight per declaration (ETP-5255)', () => {
  test('two autosaves of one declaration never have two PUTs in flight at once', async ({ page }) => {
    // 2500ms comfortably exceeds the panel's own 800ms autosave debounce, so the second edit's
    // save is guaranteed to be requested while the first PUT is still open.
    const journal = await openIdentificacion(page, { holdMs: 2_500 });

    const redeme = redemeCheckbox(page);
    await expect(redeme).toBeVisible({ timeout: 15_000 });

    // Edit 1 — tick it. The autosave fires 800ms later and is then held open by the mock.
    await redeme.click();
    await expect
      .poll(() => journal.writes.length, {
        timeout: 20_000,
        message: 'expected the first autosave PUT to be dispatched',
      })
      .toBe(1);

    // Edit 2, made while that PUT is still open — untick it. The autosave for this edit must be
    // queued, not dispatched alongside the first.
    await redeme.click();

    await expect
      .poll(() => settledCount(journal), {
        timeout: 30_000,
        message: 'expected two answered autosave PUTs to /fiscal303/declarations',
      })
      .toBe(2);
    expect(journal.writes, `exactly two PUTs expected. Journal: ${describeWrites(journal)}`)
      .toHaveLength(2);

    const [first, second] = journal.writes;

    // Arrival ORDER is not the property under test — a debounce that merely got longer would also
    // dispatch in order. The property is that the second PUT goes out only once the first has been
    // answered.
    expect(
      second.openOnArrival,
      `The two autosave PUTs overlapped: the second arrived while ${second.openOnArrival} earlier `
      + `write(s) to the same declaration were still unanswered. clearTimeout alone cannot prevent `
      + `this — once a save is in flight the timer that armed it is already gone. `
      + `Journal: ${describeWrites(journal)}`,
    ).toBe(0);

    expect(
      second.startedAt,
      `The second PUT started at +${second.startedAt - first.startedAt}ms while the first was `
      + `still open (it finished at +${first.finishedAt - first.startedAt}ms). `
      + `Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(first.finishedAt);
  });

  test('the queued autosave replays the LATEST snapshot, not the one already saved', async ({ page }) => {
    const journal = await openIdentificacion(page, { holdMs: 2_500 });

    const redeme = redemeCheckbox(page);
    await expect(redeme).toBeVisible({ timeout: 15_000 });

    await redeme.click();
    await expect.poll(() => journal.writes.length, { timeout: 20_000 }).toBe(1);
    await redeme.click();
    await expect.poll(() => settledCount(journal), { timeout: 30_000 }).toBe(2);

    const [first, second] = journal.writes;

    // This panel sends a whole snapshot of the manual data, which is what makes a stale replay
    // dangerous rather than merely redundant: replaying the snapshot the first write already saved
    // would silently undo the user's second edit. The timer closure captured the state at SCHEDULE
    // time, so the replay has to read the latest value from a ref instead.
    expect(
      first.body?.manualData?.identification?.redeme,
      `the first PUT must carry the first edit (redeme: true). Journal: ${describeWrites(journal)}`,
    ).toBe(true);
    expect(
      second.body?.manualData?.identification?.redeme,
      `the queued PUT replayed a stale snapshot — it must carry the state as of the SECOND edit `
      + `(redeme: false), otherwise the user's later edit is silently undone. `
      + `Journal: ${describeWrites(journal)}`,
    ).toBe(false);
  });
});
