import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Return windows — the selection bar must offer Descontabilizar for a posted row (mocked).
 *
 * ETP-5378 QA follow-up, cases SEL-05 / SEL-06.
 *
 * <b>The defect.</b> On both "Albarán de devolución" windows (sales and purchase) a row that
 * was Completed AND "Contabilizado" offered <i>Descontabilizar</i> in the row-hover kebab,
 * but ticking that same row's checkbox produced a selection bar with only copy-link / print /
 * delete — no accounting action at all. Each window mounted exactly two `BulkDocumentAction`s,
 * `buildInOutActions` (Procesar) and `buildPostActions` (Contabilizar); the latter only fires
 * for a row that is `processed && !posted`, so on an already-posted row BOTH builders returned
 * `[]` and `BulkDocumentAction` rendered `null` each time. The kebab had had the action all
 * along, via `buildDocumentRowQuickActionsPostMenu({ includeUnpost: true })` in
 * `shared/ReturnWindowShell.jsx` — a grid-vs-selection asymmetry, not a missing feature.
 *
 * <b>Why this needs an E2E and not only the unit specs.</b> The per-window
 * `index.vitest.jsx` files assert that a third `BulkDocumentAction` is mounted with the
 * shared unpost helpers, but they stub the component itself — they cannot see the one thing
 * QA actually reported, which is what the BAR RENDERS. `BulkDocumentAction` returning `null`
 * on an empty action list is the behaviour under test, and it only happens for real inside
 * ListView's selection toolbar, against a real row payload.
 *
 * Parametrized over both windows because the same two-line omission existed in two
 * independent `index.jsx` files and had to be fixed twice — a single-window spec would report
 * the regression only half the time.
 *
 * <b>Selector notes</b> (each of these cost an iteration, do not "simplify" them):
 *   - The selection bar is `SelectionToolbar__620cbc`. There is no `selection-toolbar` testid.
 *   - `BulkDocumentAction` hardcodes `data-testid="Button__90fe6a"` on its trigger, so the
 *     per-window `data-testid` the window passes never reaches the DOM and cannot be used to
 *     tell the three instances apart. The buttons are matched by their visible label instead,
 *     SCOPED to the bar.
 *   - The label match must be EXACT: "Descontabilizar" contains "Contabilizar", so a
 *     substring match would make the negative assertions ("Contabilizar is absent") pass
 *     against the broken build and the fixed one alike. Anchored regexes are used rather than
 *     `exact: true` strings so the spec survives an en_US run (mock mode defaults to es_ES).
 *   - The row checkbox input is `sr-only` with a styled div over it, so `check()` needs
 *     `{ force: true }` — without it Playwright waits forever for a "visible" element.
 *
 * Mock mode only — no backend required.
 */

// ---------------------------------------------------------------------------
// Per-window fixtures
// ---------------------------------------------------------------------------

/**
 * Both rows are Completed and `processed: 'Y'`; they differ ONLY in `posted`. That is
 * deliberate — it isolates the single field the two builders disagree on, so a failure here
 * cannot be explained by document status, and it gives the mirror assertion (SEL-06: the
 * not-yet-posted row must still get Contabilizar and must NOT get Descontabilizar) for free.
 *
 * `processed: 'Y'` is load-bearing on the unposted row: `buildPostActions` requires
 * `processed && !posted`, so without it that row would offer nothing either and the SEL-06
 * half of this spec would pass vacuously.
 */
const WINDOWS = {
  'return-material-receipt': {
    entity: 'returnMaterialReceipt',
    postedId: 'ret-posted',
    postedDocNo: 'RD/09001',
    unpostedId: 'ret-unposted',
    unpostedDocNo: 'RD/09002',
    partner: 'Test Customer',
    warehouse: 'España Norte',
  },
  'return-to-vendor-shipment': {
    entity: 'returnToVendorShipment',
    postedId: 'rtvs-posted',
    postedDocNo: 'RTVS/09001',
    unpostedId: 'rtvs-unposted',
    unpostedDocNo: 'RTVS/09002',
    partner: 'Proveedor Test S.L.',
    warehouse: 'Almacén Principal',
  },
};

/** Fresh row objects per test — the action mock mutates `posted` in place. */
function buildRows(cfg) {
  const base = {
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'businessPartner$_identifier': cfg.partner,
    'currency$_identifier': 'EUR',
    warehouse: 'wh-001',
    'warehouse$_identifier': cfg.warehouse,
    invoiceStatus: 0,
    returnInvoices: [],
    hasReturnInvoice: false,
    // Completed in both cases — the ONLY difference between the two rows is `posted`.
    processed: 'Y',
  };
  return [
    { ...base, id: cfg.postedId, documentNo: cfg.postedDocNo, movementDate: '2026-05-01', posted: 'Y' },
    { ...base, id: cfg.unpostedId, documentNo: cfg.unpostedDocNo, movementDate: '2026-05-02', posted: 'N' },
  ];
}

// ---------------------------------------------------------------------------
// Route installation
// ---------------------------------------------------------------------------

/**
 * Install list + detail + action mocks for one return window.
 *
 * Must be called AFTER login() so these handlers win over the generic `/sws/**` stub login()
 * seeds — Playwright matches routes in reverse registration order.
 *
 * TWO `page.route()` registrations per endpoint, deliberately, instead of the brace pattern
 * `word{/**,}**`: inside a brace group Playwright's glob compiler degrades `**` to a
 * single-segment match, which covers `/{entity}/{id}` but NOT the two-segments-deep
 * `/{entity}/{id}/action/unpost` POST this whole spec is about. That request would then fall
 * through to the generic stub and the assertion would fail for a reason unrelated to the code
 * under test. See docs/e2e-testing-guide.md.
 *
 * The Line entity is registered LAST so it wins over the header handler, whose bare glob also
 * matches `…Line…` by substring.
 *
 * @param {object} opts
 * @param {Array}  opts.rows  the fixture rows, mutated in place by the action handler
 * @param {object} opts.state capture bag — `state.actions` collects `{ action, recordId }`
 *        per NEO action POST.
 */
async function installReturnWindowMocks(page, spec, { rows, state }) {
  const { entity } = WINDOWS[spec];

  const headerHandler = async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // POST /{entity}/{id}/action/{post|unpost} — the NEO action endpoint useNeoAction hits.
    // `apiBaseUrl` is already spec-scoped, so the spec segment is NOT repeated in the path.
    if (method === 'POST' && /\/action\/(post|unpost)(\?|$)/.test(url)) {
      const actionName = url.match(/\/action\/([^/?]+)/)?.[1];
      const recordId = url.match(new RegExp(`/${entity}/([^/?]+)/action`))?.[1];
      state.actions.push({ action: actionName, recordId, url });
      // Reflect the new accounting state so the in-place refetch ListView triggers after the
      // bulk run returns a consistent list rather than the pre-action one.
      const row = rows.find((r) => r.id === recordId);
      if (row) row.posted = actionName === 'unpost' ? 'N' : 'Y';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK' }),
      });
      return;
    }

    // Detail GET — `/{entity}/{id}` with no further path segments.
    if (method === 'GET' && new RegExp(`/${entity}/[^/?]+(\\?|$)`).test(url)) {
      const id = url.match(new RegExp(`/${entity}/([^/?]+)`))?.[1];
      // Framework sub-paths are not records.
      if (id && !['selectors', 'defaults', 'evaluate-display', 'action'].includes(id)) {
        const found = rows.find((r) => r.id === id) ?? rows[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }
    }

    // List GET
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  };

  await page.route(`**/sws/neo/${spec}/${entity}/**`, headerHandler);
  await page.route(`**/sws/neo/${spec}/${entity}**`, headerHandler);

  const linesHandler = async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  };
  await page.route(`**/sws/neo/${spec}/${entity}Line/**`, linesHandler);
  await page.route(`**/sws/neo/${spec}/${entity}Line**`, linesHandler);
}

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/** The floating selection pill. There is no `selection-toolbar` testid — this is the one. */
const selectionBar = (page) => page.getByTestId('SelectionToolbar__620cbc');

/**
 * Anchored so "Contabilizar" can never match inside "Descontabilizar"; two locales because
 * mock mode defaults to es_ES while a live run may be en_US.
 */
const BULK_LABELS = {
  unpost: /^(Descontabilizar|Unpost)$/,
  post: /^(Contabilizar|Post)$/,
  process: /^(Procesar|Process)$/,
  accept: /^(Aceptar|Accept)$/,
};

const barButton = (page, key) => selectionBar(page).getByRole('button', { name: BULK_LABELS[key] });

/**
 * Tick a row. The input is `sr-only` behind a styled div, so it is never "visible" to
 * Playwright's actionability check — `force: true` is required, not a workaround.
 */
async function selectRow(page, id) {
  const checkbox = page.getByTestId(`row-${id}`).locator('input[type="checkbox"]').first();
  await checkbox.check({ force: true });
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

for (const spec of Object.keys(WINDOWS)) {
  const cfg = WINDOWS[spec];

  test.describe(`${spec} — bulk Descontabilizar on a posted row (ETP-5378 SEL-05/SEL-06)`, () => {
    let rows;
    let state;

    test.beforeEach(async ({ page }) => {
      rows = buildRows(cfg);
      state = { actions: [] };
      await login(page);
      await installReturnWindowMocks(page, spec, { rows, state });
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    // ── SEL-05 ───────────────────────────────────────────────────────────────
    test('selecting a Completed + Contabilizado row shows Descontabilizar and not Contabilizar', async ({ page }) => {
      const row = page.locator('tbody tr').filter({ hasText: cfg.postedDocNo }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      await selectRow(page, cfg.postedId);

      const bar = selectionBar(page);
      await expect(bar).toBeVisible({ timeout: 10_000 });

      // THE regression. Before the fix this bar carried only copy-link / print / delete:
      // every mounted builder returned [] for a posted row, so each BulkDocumentAction
      // rendered null.
      await expect(barButton(page, 'unpost')).toBeVisible({ timeout: 10_000 });

      // Contabilizar must NOT be offered for an already-posted row — `buildPostActions`
      // gates on `processed && !posted`. This is the half that would silently break if the
      // fix had been implemented by widening the post builder instead of adding a third
      // instance.
      await expect(barButton(page, 'post')).toHaveCount(0);

      // Procesar is absent too: the row is Completed, and `buildInOutActions` only offers
      // CO for a Borrador. Asserted so "the bar has SOME button" cannot be mistaken for
      // "the bar has the right button".
      await expect(barButton(page, 'process')).toHaveCount(0);
    });

    // ── SEL-06 (mirror) ──────────────────────────────────────────────────────
    test('selecting a Completed, not-yet-posted row shows Contabilizar and not Descontabilizar', async ({ page }) => {
      const row = page.locator('tbody tr').filter({ hasText: cfg.unpostedDocNo }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      await selectRow(page, cfg.unpostedId);

      const bar = selectionBar(page);
      await expect(bar).toBeVisible({ timeout: 10_000 });

      await expect(barButton(page, 'post')).toBeVisible({ timeout: 10_000 });
      // The new button must be gated, not permanent: offering "Descontabilizar" on a
      // document that was never posted would be a second defect of the same family.
      await expect(barButton(page, 'unpost')).toHaveCount(0);
    });

    // ── The action actually runs ─────────────────────────────────────────────
    test('running Descontabilizar POSTs to /action/unpost for the selected record', async ({ page }) => {
      const row = page.locator('tbody tr').filter({ hasText: cfg.postedDocNo }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });

      await selectRow(page, cfg.postedId);
      await expect(selectionBar(page)).toBeVisible({ timeout: 10_000 });

      await barButton(page, 'unpost').click();

      // BulkDocumentAction's dialog preselects `actions[0]` on open, so with `unpost` as the
      // only available action the dropdown is already set and the confirm button is enabled.
      const dialog = page.getByTestId('DialogContent__90fe6a');
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      // Armed BEFORE the click: the POST and the dialog close race each other.
      const actionRequest = page.waitForRequest(
        (r) => r.method() === 'POST'
          && r.url().includes(`/sws/neo/${spec}/${cfg.entity}/${cfg.postedId}/action/unpost`),
        { timeout: 20_000 },
      );

      await dialog.getByRole('button', { name: BULK_LABELS.accept }).click();

      const req = await actionRequest;
      expect(req.url()).toMatch(/\/action\/unpost(\?|$)/);

      // Exactly one row was acted on, and it was the one that was ticked — a `rowFilter`
      // regression that let the unposted row through would show up here as a second entry.
      expect(state.actions).toEqual([
        expect.objectContaining({ action: 'unpost', recordId: cfg.postedId }),
      ]);

      // The bulk run ends with `clearSelection()`, so the pill goes away on success. Pins
      // that the action was treated as a success rather than swallowed as a failed row.
      await expect(selectionBar(page)).toBeHidden({ timeout: 15_000 });
    });
  });
}
