import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Modelo 303 — manual-data explicit-save serialisation (ETP-5255, then re-premised for
 * ETP-5338, mocked).
 *
 * (ETP-5338) `FmModel303Page` no longer autosaves. The 800ms-debounced background write this
 * spec originally pinned was removed entirely: `identChecks`/`manualOverrides` (identification
 * checkboxes and box overrides, including the `redeme` checkbox this spec drives) are now pure
 * local React state until the user explicitly clicks "Guardar" or "Calcular" — both flush through
 * the shared `persistEditableFields()` (see `FmModel303Page.jsx`), which still PUTs the whole
 * record to `/fiscal303/declarations?id=…`.
 *
 * The single-flight guarantee this spec protects did NOT go away with the debounce — it moved
 * from "two debounced autosaves 800ms apart" to "two explicit clicks in quick succession":
 * Guardar disables itself while its own save is in flight (`disabled={isSavingManualData}`), but
 * Calcular is gated only by `computing`, so a Guardar save still in flight when the user clicks
 * Calcular is the realistic race under the new model. `useRecordWriteQueue` still serialises per
 * declaration for exactly that reason (see `FmModel303Page.jsx`'s own comment on
 * `useRecordWriteQueue`).
 *
 * This spec pins that behaviour from the browser, where the click handlers, `persistEditableFields`
 * and the queue actually interact:
 *
 *  - a Guardar click followed by a Calcular click while the first PUT is still open never have two
 *    PUTs in flight at once (asserted as NON-OVERLAP, not arrival order — anything that dispatches
 *    two writes also dispatches them in order, so an order-only assertion would pass against the
 *    exact bug);
 *  - the write requested mid-flight (via Calcular) is coalesced and replayed with the LATEST
 *    state, not with the state the first write already saved. That is what makes serialisation
 *    safe here: the panel sends a whole snapshot, so a replay of a stale snapshot would silently
 *    undo the user's second edit rather than merely duplicating a write.
 *
 * Equivalent single-flight guarantees for the OTHER failure modes (queued save dropped on session
 * end, a failed save not permanently blocking later saves, unmount mid-flight, the
 * filing-while-a-save-is-queued ordering) are already covered at the unit level in
 * `FmModel303Page.explicitSaveSingleFlight.vitest.jsx`, which mocks `persistManualData`'s network
 * layer directly and can control PUT timing far more precisely than a browser-level mock — this
 * spec is deliberately scoped to the two properties that specifically need real browser click
 * timing (two DOM button clicks, one genuinely queued behind the other's fetch) rather than
 * duplicating that file's full matrix.
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
 *   observable at all: it just needs to comfortably outlast the round-trip of the explicit click
 *   that triggers it (there is no debounce left to outlast).
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

  // (ETP-5338) "Calcular" now also triggers a recompute (`handleCompute` → `computeBoxes303`)
  // independently of the save this spec is about — mocked here purely so that click has a clean,
  // fast, well-shaped answer instead of falling through to login()'s generic `/sws/**` catch-all
  // (whose wrong-shape 200 the compute path would still swallow via its own `res.ok` check, but
  // there is no reason to rely on that fallback instead of an explicit, readable mock).
  await page.route('**/fiscal303/boxes**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ boxes: [], summary: null, sources: [] }),
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
 * (ETP-5338) `identificacion`'s checkboxes were migrated from the shared `Checkbox` component (a
 * native `sr-only` `<input type="checkbox">` behind a clickable `<label>`) to the local
 * `CheckboxField` (`tools/app-shell/src/windows/custom/shared/CheckboxField.jsx`) — a bare
 * `<button role="checkbox" aria-checked>`, not wrapped in a `<label>`. The clickable element is
 * now the button itself.
 */
const redemeCheckbox = (page) => page
  .locator('.fm-aeat-ident-cb')
  .filter({ hasText: REDEME_LABEL })
  .first()
  .getByRole('checkbox');

/**
 * "Guardar" — the explicit save action. `data-testid="FmModel303Page__save"` on the `<button>`
 * itself (see `FmModel303Page.jsx`). Disables itself while its own save is in flight, so it is
 * clickable only for the FIRST of the two explicit saves in each test below.
 */
const guardarButton = (page) => page.getByTestId('FmModel303Page__save');

/**
 * "Calcular" — gated only by `computing`, never by `isSavingManualData` (unlike Guardar), so it
 * is the one explicit action that can genuinely be clicked while an earlier Guardar save is still
 * in flight — the same race `FmModel303Page.explicitSaveSingleFlight.vitest.jsx` drives via its
 * own `clickCalcular()` helper. No `data-testid`; located by its own translated label text
 * (`fm.action.compute` → "Calcular" in `es_ES.json`, the mock-mode default locale).
 */
const calcularButton = (page) => page.getByRole('button', { name: 'Calcular', exact: true });

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

test.describe('Modelo 303 manual data — single-flight per declaration (ETP-5255 / ETP-5338)', () => {
  test('a Guardar click followed by a Calcular click never have two PUTs in flight at once', async ({ page }) => {
    // 2500ms comfortably outlasts the round trip of a single explicit click, so the second
    // explicit save is guaranteed to be requested while the first PUT is still open.
    const journal = await openIdentificacion(page, { holdMs: 2_500 });

    const redeme = redemeCheckbox(page);
    await expect(redeme).toBeVisible({ timeout: 15_000 });

    // Edit 1 — tick it, then explicitly click Guardar. There is no debounce left to wait out: the
    // PUT is dispatched immediately and then held open by the mock.
    await redeme.click();
    await guardarButton(page).click();
    await expect
      .poll(() => journal.writes.length, {
        timeout: 20_000,
        message: 'expected the Guardar click to dispatch a PUT',
      })
      .toBe(1);

    // Edit 2, made while that PUT is still open — untick it. Guardar disables itself while its
    // own save is in flight (`disabled={isSavingManualData}`), so Calcular is the only explicit
    // action that can request a second save right now — exactly the race
    // `FmModel303Page.explicitSaveSingleFlight.vitest.jsx` exercises via its own `clickCalcular()`.
    await expect(guardarButton(page)).toBeDisabled();
    await redeme.click();
    await calcularButton(page).click();

    await expect
      .poll(() => settledCount(journal), {
        timeout: 30_000,
        message: 'expected two answered PUTs to /fiscal303/declarations',
      })
      .toBe(2);
    expect(journal.writes, `exactly two PUTs expected. Journal: ${describeWrites(journal)}`)
      .toHaveLength(2);

    const [first, second] = journal.writes;

    // Arrival ORDER is not the property under test — dispatching both writes in sequence would
    // also arrive in order. The property is that the second PUT goes out only once the first has
    // been answered.
    expect(
      second.openOnArrival,
      `The Guardar and Calcular PUTs overlapped: the second arrived while ${second.openOnArrival} `
      + `earlier write(s) to the same declaration were still unanswered. `
      + `Journal: ${describeWrites(journal)}`,
    ).toBe(0);

    expect(
      second.startedAt,
      `The second PUT started at +${second.startedAt - first.startedAt}ms while the first was `
      + `still open (it finished at +${first.finishedAt - first.startedAt}ms). `
      + `Journal: ${describeWrites(journal)}`,
    ).toBeGreaterThanOrEqual(first.finishedAt);
  });

  test('the queued Calcular save replays the LATEST snapshot, not the one Guardar already saved', async ({ page }) => {
    const journal = await openIdentificacion(page, { holdMs: 2_500 });

    const redeme = redemeCheckbox(page);
    await expect(redeme).toBeVisible({ timeout: 15_000 });

    await redeme.click();
    await guardarButton(page).click();
    await expect.poll(() => journal.writes.length, { timeout: 20_000 }).toBe(1);

    await expect(guardarButton(page)).toBeDisabled();
    await redeme.click();
    await calcularButton(page).click();
    await expect.poll(() => settledCount(journal), { timeout: 30_000 }).toBe(2);

    const [first, second] = journal.writes;

    // This panel sends a whole snapshot of the manual data, which is what makes a stale replay
    // dangerous rather than merely redundant: replaying the snapshot Guardar already saved would
    // silently undo the user's Calcular-time edit. `persistEditableFields` rebuilds the snapshot
    // from CURRENT state right before flushing (see its own comment in `FmModel303Page.jsx`), so
    // the replay must carry the latest value rather than the one queued at click time.
    expect(
      first.body?.manualData?.identification?.redeme,
      `the Guardar PUT must carry the first edit (redeme: true). Journal: ${describeWrites(journal)}`,
    ).toBe(true);
    expect(
      second.body?.manualData?.identification?.redeme,
      `the queued Calcular PUT replayed a stale snapshot — it must carry the state as of the `
      + `SECOND edit (redeme: false), otherwise the user's later edit is silently undone. `
      + `Journal: ${describeWrites(journal)}`,
    ).toBe(false);
  });
});
