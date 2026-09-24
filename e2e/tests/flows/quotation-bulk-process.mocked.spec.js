import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Presupuesto de Venta — the selection bar must offer "Procesar" for a Borrador row (mocked).
 *
 * ETP-5378 QA follow-up, case SEL-08.
 *
 * <b>The defect.</b> A Presupuesto de Venta in Borrador could be confirmed from the row-hover
 * kebab, but ticking that same row's checkbox produced a selection bar with only copy-link /
 * print / clone / delete — no <i>Procesar</i>. Pedido de Venta, the sibling window over the very
 * same `C_Order` table, has had that button all along. The cause was not a mis-gated builder:
 * `SalesQuotationBulkActions` (tools/app-shell/src/windows/custom/sales-quotation/index.jsx)
 * rendered ONLY `<CopyLinkButton>` and never mounted a `BulkDocumentAction` at all.
 *
 * <b>Why this needs an E2E and not only the unit spec.</b> `index.bulkActions.vitest.jsx` asserts
 * the component is mounted with `entity="quotation"`, `buildInOutActions` and the
 * `documentAction` mode — but it stubs `BulkDocumentAction` itself, so it cannot see the one
 * thing QA actually reported: what the BAR RENDERS. `BulkDocumentAction` returns `null` on an
 * empty action list, and that only happens for real inside ListView's selection toolbar against
 * a real row payload. The third test below covers the other half no unit test can reach — that
 * the wire call is genuinely Pedido's call with a different entity segment
 * (`POST /quotation/{id}/action/documentAction` with `{ docAction: 'CO' }`), which is the whole
 * justification for reusing the generic component instead of driving `SendToEvaluationModal`
 * (a per-document summary modal with no meaning for N records).
 *
 * <b>Selector notes</b> (proven against this window — do not "simplify" them):
 *   - The selection bar is `SelectionToolbar__620cbc`. There is no `selection-toolbar` testid.
 *   - `BulkDocumentAction` hardcodes `data-testid="Button__90fe6a"` on its trigger, so the
 *     per-window `data-testid` the window passes never reaches the DOM and cannot tell
 *     instances apart. The button is matched by its visible label, SCOPED to the bar, with an
 *     ANCHORED regex (two locales: mock mode defaults to es_ES, a live run may be en_US).
 *   - The row checkbox input is `sr-only` behind a styled div, so it is never "visible" to
 *     Playwright's actionability check — `check({ force: true })` is required, not a workaround.
 *   - The confirm dialog renders "Procesar | Acción de documento | Confirmar | Cancelar |
 *     Aceptar | Close"; its primary button is the `/aceptar|accept|ok/i` one.
 *
 * Mock mode only — no backend required.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPEC = 'sales-quotation';
const ENTITY = 'quotation';      // NOT `header` — see contract.json's entities map.
const LINE_ENTITY = 'quotationLine';

const DRAFT_ID = 'quo-draft';
const DRAFT_DOC_NO = 'PV/09001';
const CLOSED_ID = 'quo-closed';
const CLOSED_DOC_NO = 'PV/09002';

/**
 * Two rows differing ONLY in `documentStatus`, so a failure here cannot be explained by any
 * other field. `DR` is the one status `buildInOutActions` reacts to; `CL` (Cerrado) is a
 * deliberately non-draft, non-reactivatable status — it also gives the mixed-selection test
 * (the one `quotationBulkRowFilter` exists for) its second row for free.
 *
 * Fresh objects per test: the action handler mutates `documentStatus` in place so the in-place
 * list refetch ListView triggers after a bulk run returns a consistent list.
 */
function buildRows() {
  const base = {
    orderDate: '2026-05-01',
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Cliente Test S.L.',
    'currency$_identifier': 'EUR',
    validUntil: '2026-06-01',
    grandTotalAmount: 121.0,
    summedLineAmount: 100.0,
    posted: 'N',
  };
  return [
    {
      ...base,
      id: DRAFT_ID,
      documentNo: DRAFT_DOC_NO,
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: 'N',
    },
    {
      ...base,
      id: CLOSED_ID,
      documentNo: CLOSED_DOC_NO,
      documentStatus: 'CL',
      'documentStatus$_identifier': 'Cerrado',
      processed: 'Y',
      orderDate: '2026-05-02',
    },
  ];
}

// ---------------------------------------------------------------------------
// Route installation
// ---------------------------------------------------------------------------

/**
 * Install list + detail + documentAction mocks for the quotation window.
 *
 * Must be called AFTER login() so these handlers win over the generic `/sws/**` stub login()
 * seeds — Playwright matches routes in reverse registration order.
 *
 * TWO `page.route()` registrations per endpoint, deliberately, instead of the brace pattern
 * `word{/**,}**`: inside a brace group Playwright's glob compiler degrades `**` to a
 * single-segment match, which covers `/{entity}/{id}` but NOT the two-segments-deep
 * `/{entity}/{id}/action/documentAction` POST this whole spec is about. That request would then
 * fall through to the generic stub and the assertion would fail for a reason unrelated to the
 * code under test. See docs/e2e-testing-guide.md.
 *
 * The line entity is registered LAST so it wins over the header handler, whose bare glob also
 * matches `quotationLine…` by substring.
 *
 * @param {object} opts
 * @param {Array}  opts.rows  the fixture rows, mutated in place by the action handler
 * @param {object} opts.state capture bag — `state.actions` collects `{ recordId, body }` per
 *        documentAction POST.
 */
async function installQuotationMocks(page, { rows, state }) {
  const headerHandler = async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // POST /{entity}/{id}/action/documentAction — what useDocumentAction hits.
    // `apiBaseUrl` is already spec-scoped, so the spec segment is NOT repeated in the path.
    if (method === 'POST' && /\/action\/documentAction(\?|$)/.test(url)) {
      const recordId = url.match(new RegExp(`/${ENTITY}/([^/?]+)/action`))?.[1];
      state.actions.push({ recordId, url, body: req.postDataJSON() });
      const row = rows.find((r) => r.id === recordId);
      if (row) {
        row.documentStatus = 'UE';
        row['documentStatus$_identifier'] = 'Bajo evaluación';
        row.processed = 'Y';
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK' }),
      });
      return;
    }

    // Detail GET — `/{entity}/{id}` with no further path segments.
    if (method === 'GET' && new RegExp(`/${ENTITY}/[^/?]+(\\?|$)`).test(url)) {
      const id = url.match(new RegExp(`/${ENTITY}/([^/?]+)`))?.[1];
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

  await page.route(`**/sws/neo/${SPEC}/${ENTITY}/**`, headerHandler);
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, headerHandler);

  const linesHandler = async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  };
  await page.route(`**/sws/neo/${SPEC}/${LINE_ENTITY}/**`, linesHandler);
  await page.route(`**/sws/neo/${SPEC}/${LINE_ENTITY}**`, linesHandler);
}

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/** The floating selection pill. There is no `selection-toolbar` testid — this is the one. */
const selectionBar = (page) => page.getByTestId('SelectionToolbar__620cbc');

/** Anchored: a substring match would also hit unrelated labels containing the word. */
const PROCESS_LABEL = /^(Procesar|Process)$/;

const processButton = (page) => selectionBar(page).getByRole('button', { name: PROCESS_LABEL });

/**
 * Tick a row. The input is `sr-only` behind a styled div, so it is never "visible" to
 * Playwright's actionability check — `force: true` is required.
 */
async function selectRow(page, id) {
  const checkbox = page.getByTestId(`row-${id}`).locator('input[type="checkbox"]').first();
  await checkbox.check({ force: true });
}

/** Open the bulk dialog and confirm it, returning the dialog locator. */
async function runProcess(page) {
  await processButton(page).click();

  // BulkDocumentAction preselects `actions[0]` on open, so with CO as the only available
  // action the dropdown is already set and the confirm button is enabled.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

test.describe('sales-quotation — bulk Procesar on a Borrador row (ETP-5378 SEL-08)', () => {
  let rows;
  let state;

  test.beforeEach(async ({ page }) => {
    rows = buildRows();
    state = { actions: [] };
    await login(page);
    await installQuotationMocks(page, { rows, state });
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  // ── 1. The regression ───────────────────────────────────────────────────────
  test('selecting a Borrador row shows Procesar in the selection bar', async ({ page }) => {
    const row = page.locator('tbody tr').filter({ hasText: DRAFT_DOC_NO }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await selectRow(page, DRAFT_ID);

    const bar = selectionBar(page);
    await expect(bar).toBeVisible({ timeout: 10_000 });

    // THE regression. Before the fix this button did not exist at all: the window mounted no
    // BulkDocumentAction, so the bar carried only copy-link / print / clone / delete while the
    // row-hover kebab of the very same row offered "Confirmar".
    await expect(processButton(page)).toBeVisible({ timeout: 10_000 });
  });

  // The mirror, so the fix cannot degrade into "always show Procesar": `buildInOutActions`
  // offers CO only when a Borrador is present, and `BulkDocumentAction` renders `null` on an
  // empty action list. Without this half, a builder widened to fire on any status would still
  // pass test 1.
  test('selecting only a non-Borrador row shows no Procesar button', async ({ page }) => {
    const row = page.locator('tbody tr').filter({ hasText: CLOSED_DOC_NO }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await selectRow(page, CLOSED_ID);
    await expect(selectionBar(page)).toBeVisible({ timeout: 10_000 });

    await expect(processButton(page)).toHaveCount(0);
  });

  // ── 2. The wire call ────────────────────────────────────────────────────────
  test('running Procesar POSTs documentAction { docAction: CO } for the selected record', async ({ page }) => {
    const row = page.locator('tbody tr').filter({ hasText: DRAFT_DOC_NO }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await selectRow(page, DRAFT_ID);
    await expect(selectionBar(page)).toBeVisible({ timeout: 10_000 });

    const dialog = await runProcess(page);

    // Armed BEFORE the click: the POST and the dialog close race each other.
    const actionRequest = page.waitForRequest(
      (r) => r.method() === 'POST'
        && r.url().includes(`/sws/neo/${SPEC}/${ENTITY}/${DRAFT_ID}/action/documentAction`),
      { timeout: 20_000 },
    );

    await dialog.getByRole('button', { name: /aceptar|accept|ok/i }).click();

    const req = await actionRequest;
    // The entity segment is the whole point of reusing the generic component: this is Pedido de
    // Venta's call with `quotation` where Pedido sends `header` — same classic process 104.
    expect(req.url()).toContain(`/${ENTITY}/${DRAFT_ID}/action/documentAction`);
    expect(req.url()).not.toContain('/header/');
    expect(req.postDataJSON()).toEqual({ docAction: 'CO' });

    expect(state.actions).toEqual([
      expect.objectContaining({ recordId: DRAFT_ID, body: { docAction: 'CO' } }),
    ]);

    // The bulk run ends with `clearSelection()`, so the pill goes away on success. Pins that
    // the action was treated as a success rather than swallowed as a failed row.
    await expect(selectionBar(page)).toBeHidden({ timeout: 15_000 });
  });

  // ── 3. The mixed selection — what quotationBulkRowFilter exists to guarantee ─
  //
  // `buildInOutActions` offers CO when ANY selected row is a Borrador, so without a rowFilter
  // the run would fire CO against the Cerrado row too. `quotationBulkRowFilter` pre-blocks it
  // (BulkDocumentAction counts it as `omitted`, never `failed`), so exactly one request goes
  // out. QA flagged that union behaviour as a minor observation on the return windows; there
  // was no reason to reproduce it here.
  test('a mixed Borrador + Cerrado selection issues exactly ONE documentAction, for the Borrador', async ({ page }) => {
    await expect(page.locator('tbody tr').filter({ hasText: DRAFT_DOC_NO }).first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr').filter({ hasText: CLOSED_DOC_NO }).first())
      .toBeVisible({ timeout: 10_000 });

    await selectRow(page, DRAFT_ID);
    await selectRow(page, CLOSED_ID);
    await expect(selectionBar(page)).toBeVisible({ timeout: 10_000 });

    // Still offered: one Borrador in the selection is enough for the button to appear.
    await expect(processButton(page)).toBeVisible({ timeout: 10_000 });

    const dialog = await runProcess(page);

    const actionRequest = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/action\/documentAction(\?|$)/.test(r.url()),
      { timeout: 20_000 },
    );

    await dialog.getByRole('button', { name: /aceptar|accept|ok/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await actionRequest;

    // Settle window: the two per-row calls would be fired in parallel by
    // `Promise.allSettled(rowsToProcess.map(runRow))`, so a second one — the regression — would
    // land within a few hundred ms of the first. Waiting is what makes "exactly one" mean
    // "exactly one" rather than "at least one so far".
    await page.waitForTimeout(1_500);

    expect(state.actions).toHaveLength(1);
    expect(state.actions[0].recordId).toBe(DRAFT_ID);
    expect(state.actions[0].body).toEqual({ docAction: 'CO' });
    // The Cerrado row must never have been touched — asserted by id, since a rowFilter
    // regression would show up here as a second entry carrying exactly this one.
    expect(state.actions.map((a) => a.recordId)).not.toContain(CLOSED_ID);
  });
});
