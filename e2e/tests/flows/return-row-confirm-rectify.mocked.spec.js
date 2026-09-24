import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { buildRectifiableInvoicesPayload } from '../helpers/rectifiable-invoices-mock.js';

/**
 * Return windows — row-hover Confirmar must offer the rectify picker (mocked).
 *
 * ETP-5378 QA follow-up, cases CP-10 / CP-15.
 *
 * <b>The defect.</b> Confirming an albarán de devolución from the GRID row-hover kebab
 * with "Crear Factura Rectificativa" ON answered HTTP 400 and left the document
 * Completed with no invoice. Both return windows reproduced it.
 *
 * <b>Why it could not be caught by the existing specs.</b> return-material-receipt.mocked
 * and return-to-vendor-shipment.mocked both drive the FORM path
 * (`action-confirm-with-credit` on the detail view), and the form path was never broken:
 * `ConfirmWithCreditButtonBase` always passed `rectifiableInvoicesUrl` to
 * `ConfirmInOutModal`. The grid path builds its popup through a different file —
 * `shared/buildReturnRowConfirmModal.jsx`, mounted by `shared/useRowConfirmAction.jsx` —
 * and that one passed neither the URL nor the token. `ConfirmInOutModal` gates the whole
 * picker on
 *
 *     rectifyActive = !!rectifiableInvoicesUrl && !!invoiceAction && invoiceRequested
 *
 * so the "Factura a rectificar" field simply never rendered, `buildInvoiceBody()` never
 * added `originInvoices`, and `ReturnShipmentUtils#resolveRectifiedInvoiceIds` fell back to
 * walking the return chain. On a return with no invoiced origin — the CP-10 fixture below,
 * `suggestedInvoiceIds: []` — that walk finds nothing and the action answers 400
 * (ERR_RECTIFIED_INVOICE_REQUIRED).
 *
 * <b>Why the 400 was the least of it.</b> `runConfirm()` posts `documentAction
 * {docAction:'CO'}` and `createReturnInvoice` as TWO separate requests. The CO had already
 * committed when the second one failed, so the user was left with a Completed albarán, no
 * invoice, and no way back from the UI. That is why the assertions below check the DISABLED
 * confirm button before anything else: the fix's real job is to make that request
 * unsendable while empty, not merely to render a field.
 *
 * Parametrized over both windows because the grid popup is built by one shared factory —
 * a regression there breaks both at once, and a single-window spec would say so only half
 * the time. The form flows stay where they are; this file is strictly the ROW path.
 *
 * Mock mode only — no backend required.
 */

// ---------------------------------------------------------------------------
// Per-window fixtures
// ---------------------------------------------------------------------------

/**
 * Candidate invoices returned by the `rectifiableInvoices` action. Field names mirror
 * ReturnShipmentUtils#runInvoiceQuery exactly (id, documentNo, invoiceDate,
 * grandTotalAmount, currency, businessPartner) — `businessPartner` carries the NAME, not an
 * id, because these rows come from a hand-built SQL projection rather than the entity
 * serializer (see InvoicePickerModal.jsx).
 */
const WINDOWS = {
  'return-material-receipt': {
    entity: 'returnMaterialReceipt',
    drDocNo: 'RD/00001',
    drId: 'ret-001',
    partner: 'Test Customer',
    rows: [
      {
        id: 'ret-001',
        documentNo: 'RD/00001',
        documentStatus: 'DR',
        'documentStatus$_identifier': 'Borrador',
        'businessPartner$_identifier': 'Test Customer',
        'currency$_identifier': 'EUR',
        movementDate: '2026-05-01',
        warehouse: 'wh-001',
        'warehouse$_identifier': 'España Norte',
        invoiceStatus: 0,
        returnInvoices: [],
        hasReturnInvoice: false,
        sourceShipments: [{ id: 'ship-001', documentNo: 'ALB/00042' }],
      },
      {
        id: 'ret-002',
        documentNo: 'RD/00002',
        documentStatus: 'CO',
        'documentStatus$_identifier': 'Completado',
        'businessPartner$_identifier': 'Test Customer',
        'currency$_identifier': 'EUR',
        movementDate: '2026-05-02',
        warehouse: 'wh-001',
        'warehouse$_identifier': 'España Norte',
        invoiceStatus: 0,
        returnInvoices: [],
        hasReturnInvoice: false,
        sourceShipments: [{ id: 'ship-002', documentNo: 'ALB/00043' }],
      },
    ],
    rectifiableInvoices: [
      {
        id: 'rect-inv-a',
        documentNo: 'FC/00050',
        invoiceDate: '2026-04-10',
        grandTotalAmount: 150,
        currency: 'EUR',
        businessPartner: 'Test Customer',
      },
      {
        id: 'rect-inv-b',
        documentNo: 'FC/00051',
        invoiceDate: '2026-04-20',
        grandTotalAmount: 90,
        currency: 'EUR',
        businessPartner: 'Test Customer',
      },
    ],
    pickInvoiceId: 'rect-inv-b',
    pickInvoiceDocNo: 'FC/00051',
    // `documentStatus: 'CO'` is what the real endpoint returns: ETP-5381 made these
    // invoices created AND confirmed in one step, and ReturnShipmentUtils#finalizeReturnInvoice
    // puts the COMPLETED invoice's status in the response. Dropping it from this fixture would
    // make the badge assertion below vacuous.
    createdInvoice: { id: 'inv-new', documentNo: 'FC/00100', grandTotalAmount: -150, documentStatus: 'CO' },
  },
  'return-to-vendor-shipment': {
    entity: 'returnToVendorShipment',
    drDocNo: 'RTVS-DR-001',
    drId: 'rtvs-dr-001',
    partner: 'Proveedor Test S.L.',
    rows: [
      {
        id: 'rtvs-dr-001',
        documentNo: 'RTVS-DR-001',
        documentStatus: 'DR',
        'documentStatus$_identifier': 'Borrador',
        businessPartner: 'bp-vendor-001',
        'businessPartner$_identifier': 'Proveedor Test S.L.',
        'currency$_identifier': 'EUR',
        movementDate: '2026-05-15',
        warehouse: 'wh-001',
        'warehouse$_identifier': 'Almacén Principal',
        invoiceStatus: 0,
        linesCount: 1,
        returnInvoices: [],
        hasReturnInvoice: false,
        sourceReceipts: [],
        description: '',
      },
      {
        id: 'rtvs-co-001',
        documentNo: 'RTVS-CO-001',
        documentStatus: 'CO',
        'documentStatus$_identifier': 'Completado',
        businessPartner: 'bp-vendor-001',
        'businessPartner$_identifier': 'Proveedor Test S.L.',
        'currency$_identifier': 'EUR',
        movementDate: '2026-05-16',
        warehouse: 'wh-001',
        'warehouse$_identifier': 'Almacén Principal',
        invoiceStatus: 0,
        linesCount: 1,
        returnInvoices: [],
        hasReturnInvoice: false,
        sourceReceipts: [],
        description: '',
      },
    ],
    rectifiableInvoices: [
      {
        id: 'rtv-rect-inv-a',
        documentNo: 'FC-RTV-OLD-001',
        invoiceDate: '2026-04-10',
        grandTotalAmount: 250,
        currency: 'EUR',
        businessPartner: 'Proveedor Test S.L.',
      },
      {
        id: 'rtv-rect-inv-b',
        documentNo: 'FC-RTV-OLD-002',
        invoiceDate: '2026-04-22',
        grandTotalAmount: 120,
        currency: 'EUR',
        businessPartner: 'Proveedor Test S.L.',
      },
    ],
    pickInvoiceId: 'rtv-rect-inv-b',
    pickInvoiceDocNo: 'FC-RTV-OLD-002',
    // See the sales-side note: the real endpoint returns the COMPLETED status.
    createdInvoice: { id: 'inv-new-001', documentNo: 'FC-RTV-NEW-001', grandTotalAmount: -250, documentStatus: 'CO' },
  },
};

// ---------------------------------------------------------------------------
// Route installation
// ---------------------------------------------------------------------------

/**
 * Install list + detail + action mocks for one return window.
 *
 * Must be called AFTER login() so these specific handlers win over the generic `/sws/**`
 * stub login() seeds — Playwright matches routes in reverse registration order.
 *
 * TWO `page.route()` registrations per endpoint, deliberately, instead of the brace
 * pattern `word{/**,}**`: Playwright's glob→regex compiler only lets `**` cross path
 * separators when it is immediately followed by `/` (or the end of the glob). Inside a
 * brace group the `**` before the `,` is followed by `,`, so it silently degrades to a
 * single-segment `[^/]*` — which matches `/returnMaterialReceipt/ret-001` but NOT the
 * two-segments-deep `/returnMaterialReceipt/<id>/action/<name>` POSTs this whole spec is
 * about (`rectifiableInvoices`, `documentAction`, `createReturnInvoice`). Those would fall
 * through to the generic stub and the picker would look empty for reasons that have
 * nothing to do with the code under test. See docs/e2e-testing-guide.md.
 *
 * The Line entity is registered LAST so it wins over the header handler, whose bare glob
 * (`…/returnMaterialReceipt**`) also matches `…/returnMaterialReceiptLine…` by substring.
 *
 * @param {object}   opts
 * @param {string[]} [opts.suggestedInvoiceIds] ids the backend auto-detected by walking the
 *        return chain. CP-10 is the empty case: a standalone return with no invoiced
 *        origin, where the user MUST choose by hand and the auto-detection the broken build
 *        fell back on would have found nothing.
 * @param {object}   opts.state capture bag — `state.rectifiableRequests` collects
 *        `{ url, body }` per picker POST, `state.invoicePosts` every createReturnInvoice body.
 */
async function installReturnWindowMocks(page, spec, { suggestedInvoiceIds = [], state } = {}) {
  const cfg = WINDOWS[spec];
  const { entity, rows } = cfg;

  const headerHandler = async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // POST action/documentAction → the record comes back Completed.
    if (method === 'POST' && url.includes('/action/documentAction')) {
      const idMatch = url.match(new RegExp(`/${entity}/([^/]+)/action`));
      const row = rows.find(r => r.id === idMatch?.[1]) ?? rows[0];
      state?.documentActions?.push({ url, body: req.postData() ? JSON.parse(req.postData()) : {} });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: [{ ...row, documentStatus: 'CO', 'documentStatus$_identifier': 'Completado' }],
          },
        }),
      });
      return;
    }

    // POST action/rectifiableInvoices → the candidate list the picker shows.
    //
    // MUST be matched before the generic detail/list branches below: the URL also matches
    // `/{entity}/{id}/…`, and answering it with a header-shaped body leaves `data.invoices`
    // undefined, which the hook reads as "nothing to rectify" — the confirm button then
    // stays disabled forever and the test fails for the wrong reason (indistinguishable, at
    // the assertion, from the actual bug).
    //
    // Search and paging are SERVER-SIDE, so the payload is derived from the request body via
    // the shared helper rather than answering the same list regardless.
    if (method === 'POST' && url.includes('/action/rectifiableInvoices')) {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state?.rectifiableRequests?.push({ url, body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: buildRectifiableInvoicesPayload({
              invoices: cfg.rectifiableInvoices,
              suggestedInvoiceIds,
              body,
            }),
          },
        }),
      });
      return;
    }

    // POST action/createReturnInvoice → synthetic rectificativa, NEGATIVE total (return flow).
    // The response key is `grandTotalAmount` (not `grandTotal`) — that is the field
    // ConfirmInOutModal actually reads.
    if (method === 'POST' && url.includes('/action/createReturnInvoice')) {
      state?.invoicePosts?.push(req.postData() ? JSON.parse(req.postData()) : {});
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: cfg.createdInvoice } }),
      });
      return;
    }

    // Detail GET — `/{entity}/{id}` with no further path segments. useRowConfirmAction
    // refetches the record before opening the popup (the grid row lacks the detail-only
    // enrichment), so this branch is on the critical path of the flow under test.
    if (method === 'GET' && new RegExp(`/${entity}/[^/?]+(\\?|$)`).test(url)) {
      const idMatch = url.match(new RegExp(`/${entity}/([^/?]+)`));
      const id = idMatch?.[1];
      // Framework sub-paths are not records.
      if (id && !['selectors', 'defaults', 'evaluate-display', 'action'].includes(id)) {
        const found = rows.find(r => r.id === id) ?? rows[0];
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

  // Lines — registered last so they win over the header globs' substring match.
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
// The flow
// ---------------------------------------------------------------------------

for (const spec of Object.keys(WINDOWS)) {
  const cfg = WINDOWS[spec];

  test.describe(`${spec} — row-hover Confirmar offers the rectify picker (ETP-5378 CP-10/CP-15)`, () => {
    let state;

    test.beforeEach(async ({ page }) => {
      // CP-10: no invoiced origin, so the backend auto-detects nothing. This is exactly the
      // fixture under which the broken build produced the 400 — the grid popup sent no
      // originInvoices and the server had nothing to fall back to.
      state = { rectifiableRequests: [], invoicePosts: [], documentActions: [] };
      await login(page);
      await installReturnWindowMocks(page, spec, { suggestedInvoiceIds: [], state });
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('row kebab → Confirmar loads the candidates, gates the button, and posts originInvoices', async ({ page }) => {
      test.setTimeout(120_000); // list load + detail refetch + picker round trip + confirm

      // ── Open the popup from the GRID, not the form ───────────────────────────
      const drRow = page.locator('tbody tr').filter({ hasText: cfg.drDocNo }).first();
      await expect(drRow).toBeVisible({ timeout: 10_000 });
      await drRow.hover();

      await expect(drRow.getByTestId('row-quick-actions')).toBeVisible({ timeout: 5_000 });
      const moreBtn = drRow.getByTestId('row-quick-action-more');
      await expect(moreBtn).toBeVisible();
      await moreBtn.click();

      // The kebab popover is portaled to <body>, so it is NOT a descendant of the row.
      const confirmEntry = page.getByTestId('menu-action-confirm');
      await expect(confirmEntry).toBeVisible({ timeout: 5_000 });

      // Assertion 1 — the picker's own POST must go out. Armed BEFORE the click:
      // useRectifiableInvoices fetches from a mount effect, so the request races the popup's
      // first paint. This is the single most direct proof of the fix: with no
      // `rectifiableInvoicesUrl` the hook is disabled and this request never exists.
      const rectifyRequest = page.waitForRequest(
        (r) => r.method() === 'POST' && r.url().includes('/action/rectifiableInvoices'),
        { timeout: 20_000 },
      );

      await confirmEntry.click();

      const req = await rectifyRequest;
      // The URL is built from base + specName + entityName + record id — the same string the
      // form path builds. A wrong id here would still return rows (the mock is lenient) but
      // would mean the grid popup is asking about a different document than it confirms.
      expect(req.url()).toContain(`/sws/neo/${spec}/${cfg.entity}/${cfg.drId}/action/rectifiableInvoices`);

      const popup = page.getByTestId('confirm-inout-modal');
      await expect(popup).toBeVisible({ timeout: 10_000 });

      // The "create invoice" toggle is on by default — without it `invoiceRequested` is false
      // and `rectifyActive` collapses for a reason unrelated to this fix.
      const invoiceToggle = page.getByTestId('confirm-modal-invoice-toggle');
      await expect(invoiceToggle).toBeVisible({ timeout: 8_000 });
      await expect(invoiceToggle).toHaveAttribute('aria-checked', 'true');

      // ── Assertion 2 — the "Factura a rectificar" field is present ────────────
      // This is the field that did not render at all before the fix.
      const rectifyOpen = page.getByTestId('confirm-modal-rectify-open');
      await expect(rectifyOpen).toBeVisible({ timeout: 10_000 });

      // ── Assertion 3 — the gate holds while nothing is selected ───────────────
      // `canConfirm` includes `rectify.isSatisfied`. With `suggestedInvoiceIds: []` nothing is
      // preselected, so the confirm button MUST be unclickable: this is what makes the
      // commit-then-fail sequence (documentAction CO, then a 400 on createReturnInvoice)
      // unreachable from the UI.
      const confirmBtn = page.getByTestId('confirm-modal-confirm-btn');
      await expect(confirmBtn).toBeVisible();
      await expect(confirmBtn).toBeDisabled();

      // Nothing has been sent yet — neither half of the two-request confirm.
      expect(state.documentActions).toHaveLength(0);
      expect(state.invoicePosts).toHaveLength(0);

      // The server reported no auto-detected candidate for this return, and the picker must
      // not invent one.
      const firstRectifyBody = state.rectifiableRequests[0]?.body ?? {};
      expect(firstRectifyBody).toMatchObject({ startRow: 0 });
      await expect(page.getByTestId(`confirm-modal-rectify-selected-${cfg.pickInvoiceId}`)).toHaveCount(0);

      // ── Assertion 4 — pick an invoice, the gate opens, originInvoices is sent ─
      await rectifyOpen.click();
      const picker = page.getByTestId('confirm-modal-rectify-picker-modal');
      await expect(picker).toBeVisible({ timeout: 10_000 });

      // Both candidates offered; neither badged as suggested (suggestedInvoiceIds is empty).
      for (const inv of cfg.rectifiableInvoices) {
        await expect(picker.getByTestId(`confirm-modal-rectify-option-${inv.id}`)).toBeVisible();
        await expect(picker.getByTestId(`confirm-modal-rectify-suggested-${inv.id}`)).toHaveCount(0);
      }

      await picker.getByTestId(`confirm-modal-rectify-option-${cfg.pickInvoiceId}`).click();
      await picker.getByTestId('confirm-modal-rectify-apply').click();
      await expect(picker).toBeHidden({ timeout: 8_000 });

      const chip = page.getByTestId(`confirm-modal-rectify-selected-${cfg.pickInvoiceId}`);
      await expect(chip).toBeVisible();
      await expect(chip).toContainText(cfg.pickInvoiceDocNo);
      await expect(confirmBtn).toBeEnabled({ timeout: 8_000 });

      await confirmBtn.click();

      const resultModal = page.getByTestId('confirm-result-modal');
      await expect(resultModal).toBeVisible({ timeout: 15_000 });
      await expect(resultModal).toContainText(cfg.createdInvoice.documentNo);

      // ── The status badge (second ETP-5378 QA defect, same file) ──────────────
      // ConfirmResultModal badges each doc via `doc.documentStatus === 'CO'` and otherwise
      // renders the warning `statusDraft` badge. This path built its `docs` array without
      // `documentStatus`, so `undefined === 'CO'` was false and a rectificative invoice the
      // backend had already created AND confirmed was announced as "Borrador" — QA saw
      // REC-1000015 read "Borrador" here and "Completado" on its own detail page. The negative
      // half is the one that actually pins the regression: the completed badge could also be
      // satisfied by a `doc.status` override, but "Borrador" reappearing is unambiguous.
      // Scoped to the modal (title/subtitle/footer carry no status wording) and locale-tolerant
      // because mock mode defaults to es_ES while a live run may be en_US.
      await expect(resultModal).toContainText(/completado|completed/i);
      await expect(resultModal).not.toContainText(/borrador|draft/i);

      // The payload is the point: `buildInvoiceBody()` only adds `originInvoices` when
      // `rectifyActive` is true, which requires the URL prop this fix restored. Without it the
      // body went out bare and the backend answered 400 — after the CO had already committed.
      expect(state.invoicePosts).toHaveLength(1);
      expect(state.invoicePosts[0].originInvoices).toEqual([cfg.pickInvoiceId]);
      // And the confirm did run both halves, in the order the modal drives them.
      expect(state.documentActions).toHaveLength(1);
      expect(state.documentActions[0].body).toMatchObject({ docAction: 'CO' });
    });
  });
}
