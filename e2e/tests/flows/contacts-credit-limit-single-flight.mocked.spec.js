import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — credit-limit write serialisation (ETP-5255, mocked).
 *
 * `ContactsFinancialPanel` persists every credit/tax field through the same endpoint,
 * `PATCH /businessPartner/{id}`, and its in-flight map used to be keyed by FIELD NAME. Etendo's
 * optimistic lock is per RECORD, so that key was the wrong unit — it was correct only by accident,
 * because exactly one field (`creditLimit`) persists today and the map therefore never held two
 * keys at once. The second field to be wired up would have reintroduced the duplicate write with
 * nothing to catch it. The panel now uses `useRecordWriteQueue`, keyed by the business partner id.
 *
 * Because only one field persists, the reachable overlap here is two commits of `creditLimit`
 * itself: the stepper debounces a `+` click by 400ms, so clicking `+` twice about a second apart
 * fires the second commit while the first PATCH is still open. That is a plain user gesture, not a
 * contrived one, and it exercises exactly the queue path.
 *
 * Two properties are guarded:
 *
 *  - the two PATCHes never overlap (asserted as NON-OVERLAP, not arrival order — anything that
 *    dispatches two writes also dispatches them in order, so an order-only assertion would pass
 *    against the exact bug);
 *  - the second PATCH carries the token the first one's RESPONSE returned, not the one it consumed.
 *    That half is guaranteed below the panel, in `@etendosoftware/app-shell-core` (`auth/api.js`),
 *    which serialises versioned writes per record and awaits the version harvest before releasing
 *    the next one. See `amortization-lines-single-flight.mocked.spec.js` for the full diagnosis.
 *
 * There is deliberately NO "different records stay parallel" test here: the panel renders exactly
 * one business partner, so two concurrent records are not reachable through this UI. That property
 * is covered by the amortization and product specs, whose panels render many rows.
 *
 * Mock mode only — routes are installed AFTER `login()` so they win over its generic `/sws/**`
 * catch-all (Playwright matches routes in reverse registration order).
 *
 * Run with (dev server must NOT be in `VITE_MOCK` mode — see the guide's gotcha on `dev-mock`):
 *   cd e2e && npx playwright test tests/flows/contacts-credit-limit-single-flight.mocked.spec.js \
 *     --project=mocked
 */

// ── Synthetic data ───────────────────────────────────────────────────────────

const BP_ID = 'bp-sf-credit-001';

const BP_ROW = {
  id: BP_ID,
  name: 'Contacto crédito E2E',
  searchKey: 'BP_SF_CREDIT',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  customer: true,
  creditLimit: 1000,
  creditUsed: 0,
  active: true,
};

/**
 * The token the record starts on. Deliberately not date-shaped: the client must forward whatever
 * opaque string the read returned, and a reused token has to be obvious in the failure message
 * instead of reading as "two timestamps that look alike".
 */
const INITIAL_TOKEN = `${BP_ID}-V1`;

// ── Mock ─────────────────────────────────────────────────────────────────────

/**
 * Installs the `contacts` businessPartner routes and returns the journal the tests assert on.
 *
 * Two routes, never one: a glob ending in a bare `word**` does NOT cross a `/`, so
 * `…/businessPartner**` alone matches neither `/businessPartner/<id>` nor
 * `/businessPartner/selectors/…`, and those requests fall through to `login()`'s `/sws/**`
 * catch-all — which answers every PATCH with a synthetic success, so the journal would stay empty
 * and the failure would look nothing like a mocking bug. See docs/e2e-testing-guide.md
 * § "Gotcha: a route pattern ending in a bare `word**`".
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {number} [options.holdMs]
 *   How long every PATCH is held open INSIDE the route handler. This is what makes an overlap
 *   observable at all: without it, two concurrent writes and two serialized writes produce
 *   indistinguishable timestamps. It must exceed the stepper's 400ms debounce, or the second
 *   commit lands after the first write already closed and there is nothing to observe.
 */
async function installContactsMock(page, options = {}) {
  const { holdMs = 0 } = options;

  /**
   * Entries are appended when the request ARRIVES, not when it is answered, so a test can observe
   * a write that is still in flight. `finishedAt` stays `null` until the handler responds.
   *
   * @type {{writes: Array<{body: any, sentUpdated: any, respondedUpdated: string|null,
   *   startedAt: number, finishedAt: number|null, openOnArrival: number}>}}
   */
  const journal = { writes: [] };

  // Current server-side state, mutated by each accepted write — the point is that a write moves
  // the record's token on, so the NEXT write has to carry the new one.
  let record = { ...BP_ROW, updated: INITIAL_TOKEN };
  const nextToken = () => `${BP_ID}-V${Number(String(record.updated).split('-V')[1] ?? 1) + 1}`;

  const bpHandler = async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Selector, defaults and callout lookups are not record traffic — let `login()`'s stub answer
    // them, exactly as the other contacts mocked specs do.
    if (/\/businessPartner\/(selectors|defaults)/.test(url) || /\/callout/.test(url)) {
      await route.fallback();
      return;
    }

    const isDetail = /\/businessPartner\/[^/?]+/.test(url);

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isDetail
            ? { response: { data: [record] } }
            : { response: { data: [record], totalRows: 1 } },
        ),
      });
      return;
    }

    if (method === 'PATCH' && isDetail) {
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

      const merged = { ...record, ...(body ?? {}) };
      delete merged.updated;
      merged.updated = nextToken();
      record = merged;
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

  await page.route('**/sws/neo/contacts/businessPartner/**', bpHandler);
  await page.route('**/sws/neo/contacts/businessPartner**', bpHandler);

  return journal;
}

// ── Page helpers ─────────────────────────────────────────────────────────────

/** The stepper's own label; mock mode defaults to es_ES, so both locales are accepted. */
const CREDIT_LIMIT_LABEL = /^(Crédito límite|Credit limit)$/;

async function openFinancialTab(page, options) {
  await login(page);
  const journal = await installContactsMock(page, options);
  await page.goto(`/contacts/${BP_ID}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  // `financial` is a PRIMARY tab, and `renderPrimaryTabButtons` emits no `data-testid` at all
  // (reported, not patched — this spec must not touch production code), so the tab is reached by
  // its translated label. The contacts detail has exactly two primary tabs, General and Financial,
  // so matching on `financ` is unambiguous in both locales.
  await page.getByRole('button', { name: /financ/i }).first().click();
  return journal;
}

/**
 * The credit-limit stepper's root element.
 *
 * `CreditLimitStepper` destructures its props and never spreads them, so the `data-testid` the
 * codemod put on the JSX call site does not reach the DOM (reported, not patched — this spec must
 * not touch production code). The label span is the stable anchor: it sits in a header row whose
 * parent is the stepper root, so `../..` from the label is that root.
 */
function creditStepper(page) {
  return page
    .getByText(CREDIT_LIMIT_LABEL, { exact: true })
    .first()
    .locator('xpath=../..');
}

/** The stepper's `+` button — inside the control row, the children are input, `−`, then `+`. */
const creditPlus = (page) => creditStepper(page).locator('input[type="number"]')
  .locator('xpath=following-sibling::button[2]');

/** How many writes have been ANSWERED (as opposed to merely started). */
const settledCount = (journal) => journal.writes.filter((w) => w.finishedAt != null).length;

const describeWrites = (journal) => JSON.stringify(
  journal.writes.map((w) => ({
    fields: Object.keys(w.body ?? {}).filter((k) => k !== 'updated'),
    values: Object.fromEntries(
      Object.entries(w.body ?? {}).filter(([k]) => k !== 'updated'),
    ),
    sentUpdated: w.sentUpdated,
    startedAt: w.startedAt,
    finishedAt: w.finishedAt,
    openOnArrival: w.openOnArrival,
  })),
  null,
  2,
);

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Contacts credit limit — single-flight per business partner (ETP-5255)', () => {
  test('two commits of the credit limit never have two PATCHes in flight at once', async ({ page }) => {
    // 1500ms comfortably exceeds the stepper's own 400ms debounce, so the second commit is
    // guaranteed to be requested while the first PATCH is still open.
    const journal = await installedNonOverlap(page);

    const [first, second] = journal.writes;
    expect(journal.writes, `exactly two PATCHes expected. Journal: ${describeWrites(journal)}`)
      .toHaveLength(2);

    // Arrival ORDER is not the property under test — the buggy code also dispatched in order. The
    // property is that the second PATCH goes out only once the first has been answered, so the two
    // can never carry the same `updated` token.
    expect(
      second.openOnArrival,
      `The two PATCHes to /businessPartner/${BP_ID} overlapped: the second arrived while `
      + `${second.openOnArrival} earlier write(s) to the same record were still unanswered. Every `
      + `credit/tax field PATCHes this one endpoint, so the queue has to be keyed by the business `
      + `partner id, not by field name. Journal: ${describeWrites(journal)}`,
    ).toBe(0);

    expect(
      second.startedAt,
      `The second PATCH started at +${second.startedAt - first.startedAt}ms while the first was `
      + `still open (it finished at +${first.finishedAt - first.startedAt}ms). `
      + `Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(first.finishedAt);

    // The queue must COALESCE the mid-flight edit, not drop it: the value the user last asked for
    // has to be what the server ends up holding.
    expect(
      second.body?.creditLimit,
      `the second PATCH must persist the value the user last committed (1002), not the one the `
      + `first write already stored. Journal: ${describeWrites(journal)}`,
    ).toBe(1002);
  });

  test('the second PATCH carries the token the first PATCH returned, never the one it reused', async ({ page }) => {
    const journal = await installedNonOverlap(page);

    const [first, second] = journal.writes;

    // The read armed the first write.
    expect(
      first.sentUpdated,
      `PATCH /businessPartner/${BP_ID} went out without an \`updated\` token — the server answers `
      + `400 missing_updated. Body: ${JSON.stringify(first.body)}`,
    ).toBe(INITIAL_TOKEN);

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
});

/**
 * Drives the two-commit gesture both tests above need and returns the journal once both PATCHes
 * have been answered: `+` once (1000 → 1001), then `+` again after the first write is open
 * (1001 → 1002).
 *
 * Shared rather than duplicated because the gesture is timing-sensitive — the two clicks have to
 * straddle the first PATCH — and two copies would drift.
 */
async function installedNonOverlap(page) {
  const journal = await openFinancialTab(page, { holdMs: 1_500 });

  const plus = creditPlus(page);
  await expect(plus).toBeVisible({ timeout: 15_000 });

  await plus.click();
  // Wait past the 400ms debounce so the first PATCH is actually open, then commit again. The poll
  // is on the journal rather than a fixed sleep, so a slow machine cannot turn this into a false
  // "the two did not overlap".
  await expect
    .poll(() => journal.writes.length, { timeout: 15_000, message: 'expected the first PATCH to be dispatched' })
    .toBe(1);
  await plus.click();

  await expect
    .poll(() => settledCount(journal), {
      timeout: 25_000,
      message: 'expected two answered PATCHes to /businessPartner/<id>',
    })
    .toBe(2);

  return journal;
}
