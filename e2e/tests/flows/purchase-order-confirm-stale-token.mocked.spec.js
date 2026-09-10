import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Purchase order confirm — the retry after a failed sub-action is refused forever (mocked).
 *
 * ⚠️ THIS SPEC IS EXPECTED TO BE RED. It reproduces a defect that is still present; the fix
 * does not exist yet. Do not "repair" it by relaxing the assertion — the assertion below is
 * the invariant, not a description of today's behaviour.
 *
 * ── What the user hits ───────────────────────────────────────────────────────────────────
 * On a purchase order with a service-type product they confirm the order and ask for the
 * goods receipt (albarán) + the invoice. The order confirms, the invoice is created, the
 * receipt POST fails (a service product cannot be received). The modal stays open with the
 * receipt error, which is correct — the successful steps are latched in state so a retry is
 * meant to resume from the one that failed ("Crear albarán" retried, "Crear factura / Ya
 * creado" skipped).
 *
 * They press the button again and instead get "No se puede guardar este registro / Otra
 * persona editó este registro mientras trabajabas en él" plus the inline "No se pudieron
 * guardar los cambios antes de confirmar". Nobody else touched the order. The retry can
 * NEVER succeed: every further attempt fails the same way.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────────────────
 * `updated` is a per-record optimistic-locking token. `apiFetch`
 * (`@etendosoftware/app-shell-core/auth/api.js`) injects it into every PATCH from a
 * client-side cache keyed by `(entity, id)`, and refreshes that cache only from a CRUD
 * read/write response.
 *
 * A process action moves the row on the server — `docAction: 'CO'` flips documentStatus and
 * recalculates totals, so `updated` advances — but nothing refreshes the cache for it, for
 * two independent reasons:
 *
 *   1. `ConfirmModal` (artifacts/purchase-order/custom/PurchaseOrderActions.jsx) issues the
 *      actions with a bare `fetch`, not `apiFetch`, so nothing is harvested at all.
 *   2. Even through `apiFetch` it would not help: `entityFromPath` resolves the "entity" of
 *      `/purchase-order/header/{id}/action/documentAction` to the ACTION NAME
 *      (`documentAction`, `createGoodsReceipt`, …), so a harvested token would land in a
 *      bucket nobody ever reads while the order's real bucket (`header`) keeps the
 *      pre-action token.
 *
 * `handleConfirm` starts every attempt with `onSave()` — the generic DetailView/useEntity
 * save, which DOES go through `apiFetch` and PATCHes unconditionally (`performSave` has no
 * dirty check). So the retry's PATCH carries a token two server versions behind, the server
 * answers 409 `stale_record`, `handleSaveErrorResponse` opens the concurrency dialog, and
 * `onSave()` returns null → `poSaveBeforeConfirmError`, before the receipt is ever retried.
 *
 * The header edit in step 3 below is load-bearing but NOT the cause: it only supplies the
 * first PATCH (ETP-4468's save-before-confirm, which is exactly what users do — edit, then
 * confirm). The token still goes stale without it, because `onSave()` PATCHes even on a
 * clean form; the edit just makes the whole reproduction the user's own reported flow.
 *
 * ── What the fake server models ──────────────────────────────────────────────────────────
 * The token is checked AND advanced in ONE step, the way a real transaction does — read
 * `updated` from the body, compare, 409 if different, otherwise advance immediately and only
 * then answer. A probe that advances the token after holding the response open reports
 * 200/200 for the very interleaving it was built to catch.
 *
 * Mock mode only — routes are installed AFTER `login()` so they win over its generic
 * `/sws/**` catch-all (Playwright matches routes in reverse registration order).
 *
 * Run with (the dev server must NOT be in `VITE_MOCK` mode — see docs/e2e-testing-guide.md
 * § "Gotcha: `VITE_MOCK=true` silently bypasses `page.route()` mocks"):
 *   cd e2e && npx playwright test tests/flows/purchase-order-confirm-stale-token.mocked.spec.js \
 *     --project=mocked
 */

// ── Synthetic data ──────────────────────────────────────────────────────────────────────

const ORDER_ID = 'po-sf-stale-1';

/**
 * Every required header field is populated: `buildSaveGate` disables the Confirm button when
 * any required+editable field is empty, and a blocked button would look exactly like a
 * broken selector.
 */
const ORDER = {
  id: ORDER_ID,
  documentNo: 'PO/E2E-0001',
  documentStatus: 'DR',
  processed: false,
  orderDate: '2026-09-01',
  scheduledDeliveryDate: '2026-09-15',
  businessPartner: 'po-sf-bp-1',
  'businessPartner$_identifier': 'Proveedor E2E, S.L.',
  partnerAddress: 'po-sf-loc-1',
  'partnerAddress$_identifier': 'Calle Falsa 123 - 28001 - Madrid',
  warehouse: 'po-sf-wh-1',
  'warehouse$_identifier': 'Almacén E2E',
  paymentTerms: 'po-sf-pt-1',
  'paymentTerms$_identifier': '30 días',
  paymentMethod: 'po-sf-pm-1',
  'paymentMethod$_identifier': 'Transferencia',
  priceList: 'po-sf-pl-1',
  'priceList$_identifier': 'Tarifa compra E2E',
  currency: 'po-sf-cur-1',
  'currency$_identifier': 'EUR',
  summedLineAmount: 1000,
  grandTotalAmount: 1210,
  etgoTotalDiscount: 0,
};

/**
 * One line, because `draftMode.disableWhenEmpty` (purchase-order/index.jsx) disables the
 * Confirm button while `hook.children` is empty. A service product, matching the reported
 * case: it is what makes the goods receipt fail server-side.
 */
const LINE = {
  id: 'po-sf-line-1',
  lineNo: 10,
  product: 'po-sf-prod-1',
  'product$_identifier': 'Servicio de mantenimiento E2E',
  orderedQuantity: 1,
  deliveredQuantity: 0,
  netUnitPrice: 1000,
  lineNetAmount: 1000,
  'currency$_identifier': 'EUR',
};

/** The message a real backend returns when a service product cannot be received. */
const RECEIPT_ERROR = 'Service products cannot be included in a goods receipt';

// ── Mock ────────────────────────────────────────────────────────────────────────────────

/**
 * Installs the `purchase-order` header + lines routes and returns the journal the tests
 * assert on.
 *
 * Two routes per entity, never one: a glob ending in a bare `word**` does NOT cross a `/`,
 * so `…/header**` alone matches neither `/header/<id>` nor `/header/<id>/action/<name>`, and
 * those requests fall through to `login()`'s `/sws/**` catch-all — which answers every POST
 * and PATCH with a synthetic success. The journal would stay empty and every assertion would
 * fail for a reason that looks nothing like a mocking bug. The `/action/<name>` POSTs are two
 * segments past `/header`, which is also why the brace form `header{/**,}**` is not usable
 * here. See docs/e2e-testing-guide.md § "Gotcha: a route pattern ending in a bare `word**`".
 *
 * @param {import('@playwright/test').Page} page
 */
async function installPurchaseOrderMock(page) {
  /**
   * @type {{
   *   writes: Array<{sentUpdated: any, serverTokenAtArrival: string, status: number,
   *                  accepted: boolean, fields: string[], at: number}>,
   *   actions: Array<{name: string, status: number, serverTokenBefore: string,
   *                   serverTokenAfter: string, at: number}>,
   *   headerReads: number,
   * }}
   */
  const journal = { writes: [], actions: [], headerReads: 0 };

  // Server-side state. `version` is the record's optimistic-locking generation; every
  // accepted write AND every accepted process action moves it on, which is the entire point:
  // the action is a write the client never learns the new token of.
  let version = 1;
  let order = { ...ORDER, updated: 'T1' };
  const advance = () => {
    version += 1;
    order = { ...order, updated: `T${version}` };
    return order.updated;
  };

  const headerHandler = async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Non-record sub-routes (callout, defaults, selector lookups) are not the traffic under
    // test — let `login()`'s stub answer them, and keep them out of the `/header/<id>` regex
    // below, which would otherwise read "callout" as a record id.
    if (/\/header\/(callout|defaults)\b/.test(url) || /\/header\/selectors\//.test(url)) {
      await route.fallback();
      return;
    }

    const actionMatch = url.match(/\/header\/[^/?]+\/action\/([^/?]+)/);
    if (method === 'POST' && actionMatch) {
      const name = actionMatch[1];
      const serverTokenBefore = order.updated;

      // The albarán failure the user reported. A failed action rolls back, so it must NOT
      // advance the token — the staleness has to come from the steps that succeeded.
      if (name === 'createGoodsReceipt') {
        journal.actions.push({
          name, status: 500, serverTokenBefore, serverTokenAfter: order.updated, at: Date.now(),
        });
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: RECEIPT_ERROR } }),
        });
        return;
      }

      // `docAction: 'CO'` flips documentStatus and recalculates the totals — the row really
      // is rewritten, so `updated` really does advance. Nothing tells the client.
      if (name === 'documentAction') {
        order = { ...order, documentStatus: 'CO' };
      }
      const serverTokenAfter = advance();
      journal.actions.push({ name, status: 200, serverTokenBefore, serverTokenAfter, at: Date.now() });

      const payload = name === 'createPurchaseInvoice'
        ? { id: 'po-sf-invoice-1', documentNo: 'FC/E2E-0001', grandTotalAmount: 1210 }
        : { ...order };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [payload] } }),
      });
      return;
    }

    if (method === 'GET') {
      const isDetail = /\/header\/[^/?]+/.test(url);
      if (isDetail) journal.headerReads += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isDetail
            ? { response: { data: [order] } }
            : { response: { data: [order], totalRows: 1 } },
        ),
      });
      return;
    }

    if (method === 'PATCH' && /\/header\/[^/?]+/.test(url)) {
      let body = null;
      try {
        body = JSON.parse(request.postData() ?? 'null');
      } catch {
        // A non-JSON body must surface in the assertions as `null`, not as an exception
        // inside the route handler (Playwright reports that as an unrelated "route was not
        // handled" error).
      }
      const sentUpdated = body?.updated ?? null;
      const serverTokenAtArrival = order.updated;
      const fields = Object.keys(body ?? {}).filter((k) => k !== 'updated');

      // Check-and-advance in ONE step, before anything can await — a real transaction does
      // both under the same lock. Advancing only after the response is held open would
      // report 200 for the exact interleaving this spec exists to catch.
      if (sentUpdated !== serverTokenAtArrival) {
        journal.writes.push({
          sentUpdated, serverTokenAtArrival, status: 409, accepted: false, fields, at: Date.now(),
        });
        // The real shape from NeoCrudHandler#buildStaleRecordResponse — the client keys the
        // conflict dialog off `body.error === 'stale_record'` (a STRING), never off the 409
        // status alone, because a duplicate-key rejection is also a 409 with the opposite
        // remedy. A `{error:{message:'stale_record'}}` body would silently degrade to a
        // plain error toast and the dialog assertion would pass for the wrong reason.
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 409,
            error: 'stale_record',
            message: 'The record you are saving has already been changed by another user',
            detail: 'This record was modified by someone else after you read it.',
            hint: "Re-read the record to get the current values and the fresh 'updated'.",
          }),
        });
        return;
      }

      order = { ...order, ...(body ?? {}) };
      advance();
      journal.writes.push({
        sentUpdated, serverTokenAtArrival, status: 200, accepted: true, fields, at: Date.now(),
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [order] } }),
      });
      return;
    }

    await route.fallback();
  };

  await page.route('**/sws/neo/purchase-order/header/**', headerHandler);
  await page.route('**/sws/neo/purchase-order/header**', headerHandler);

  const linesHandler = async (route) => {
    const request = route.request();
    const url = request.url();
    if (/\/lines\/selectors\//.test(url) || /\/lines\/(callout|defaults)\b/.test(url)) {
      await route.fallback();
      return;
    }
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [LINE], totalRows: 1 } }),
    });
  };

  await page.route('**/sws/neo/purchase-order/lines/**', linesHandler);
  await page.route('**/sws/neo/purchase-order/lines**', linesHandler);

  /** The token the fake server holds right now, read from inside the browser-side closure. */
  journal.currentServerToken = () => order.updated;

  return journal;
}

// ── Diagnostics ─────────────────────────────────────────────────────────────────────────

const describeJournal = (journal) => JSON.stringify(
  {
    serverTokenNow: journal.currentServerToken(),
    headerRecordReads: journal.headerReads,
    writes: journal.writes.map((w) => ({
      'PATCH sent updated': w.sentUpdated,
      'server held': w.serverTokenAtArrival,
      status: w.status,
      fields: w.fields,
    })),
    actions: journal.actions.map((a) => ({
      action: a.name,
      status: a.status,
      'token before': a.serverTokenBefore,
      'token after': a.serverTokenAfter,
    })),
  },
  null,
  2,
);

const actionsNamed = (journal, name) => journal.actions.filter((a) => a.name === name);

// ── Page helpers ────────────────────────────────────────────────────────────────────────

async function openOrderDetail(page) {
  await login(page);
  const journal = await installPurchaseOrderMock(page);
  await page.goto(`/purchase-order/${ORDER_ID}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('detail-view')).toHaveAttribute('data-doc-status', 'DR');
  return journal;
}

/**
 * Dirties the header the way the user does: edit a field, then confirm without saving first
 * (the flow ETP-4468 exists for). `scheduledDeliveryDate` is a masked text input
 * (`DateField`), so the value is typed in the locale's own pattern; `05/10/2026` is valid
 * under both `dd/mm` (es_ES, the mock-mode default) and `mm/dd` (en_US), and either reading
 * differs from the seeded `2026-09-15` — which is all "dirty" requires.
 *
 * The Save-draft button is `disabled={… || !isDirty || …}`, so its enabling is a direct read
 * of `isDirty` and the only honest proof the edit landed.
 */
async function dirtyTheHeader(page) {
  const deliveryDate = page.getByTestId('field-scheduledDeliveryDate');
  await expect(deliveryDate).toBeEnabled();
  await deliveryDate.fill('05/10/2026');
  await deliveryDate.press('Enter');
  await expect(
    page.getByTestId('action-save-draft'),
    'The header edit did not register as dirty, so no save-before-confirm PATCH would be '
    + 'issued and the reproduction would not be the user\'s flow. Check the DateField locale '
    + 'pattern before blaming the token.',
  ).toBeEnabled({ timeout: 10_000 });
}

/**
 * The two checkbox cards. These locators were regex-on-translated-label until ETP-5255 gave
 * `PoCheckboxCard` a `testId` prop it actually applies (it used to receive `data-testid`,
 * destructure neither it nor `...rest`, and so reach the DOM with no id at all — and the value
 * passed was one shared generated hash for both cards, which could not have told them apart
 * anyway). Locale-independent now, which is the point.
 */
const receiptCard = (page) => page.getByTestId('purchase-order-docs-receipt-card');
const invoiceCard = (page) => page.getByTestId('purchase-order-confirm-invoice-card');

/**
 * Runs the reported flow up to the point where the modal sits on the receipt error, and
 * asserts each precondition on the way: a red assertion here means the harness broke, not
 * that the defect changed.
 */
async function confirmOnceAndFail(page, journal) {
  await dirtyTheHeader(page);

  // The draftMode Confirm button. It runs `maybeSaveBeforeConfirm` (PATCH #1) and only then
  // dispatches `purchase-order:open-confirm-modal`.
  await page.getByTestId('action-save').click();

  const confirmButton = page.getByTestId('action-confirm-modal');
  await expect(confirmButton).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(() => journal.writes.length, { timeout: 15_000, message: 'expected the save-before-confirm PATCH' })
    .toBe(1);
  expect(
    journal.writes[0].status,
    `The save-before-confirm PATCH was refused, so the flow never reached the actions and the `
    + `retry under test cannot be reproduced. Journal: ${describeJournal(journal)}`,
  ).toBe(200);

  await receiptCard(page).click();
  await invoiceCard(page).click();
  await confirmButton.click();

  // First attempt: PATCH #2 (accepted) → documentAction CO (accepted, token advances) →
  // createGoodsReceipt (500) → createPurchaseInvoice (accepted, token advances again).
  await expect
    .poll(() => actionsNamed(journal, 'createGoodsReceipt').length, {
      timeout: 25_000,
      message: 'expected the goods-receipt POST of the first attempt',
    })
    .toBe(1);
  await expect
    .poll(() => actionsNamed(journal, 'createPurchaseInvoice').length, { timeout: 15_000 })
    .toBe(1);

  expect(
    actionsNamed(journal, 'documentAction').map((a) => a.status),
    `The order was not confirmed on the first attempt, so the later retry is not the flow `
    + `under test. Journal: ${describeJournal(journal)}`,
  ).toEqual([200]);

  // The modal must still be open on the receipt error — that is what the user retries from.
  await expect(page.getByText(RECEIPT_ERROR)).toBeVisible({ timeout: 10_000 });
  await expect(confirmButton).toBeEnabled({ timeout: 10_000 });

  return confirmButton;
}

// ── Tests ───────────────────────────────────────────────────────────────────────────────

test.describe('Purchase order confirm — retry after a failed sub-action', () => {
  test('the retry PATCHes with the token the server currently holds, and is not refused as a stale record', async ({ page }) => {
    const journal = await openOrderDetail(page);
    const confirmButton = await confirmOnceAndFail(page, journal);

    const writesBeforeRetry = journal.writes.length;
    const serverTokenBeforeRetry = journal.currentServerToken();

    await confirmButton.click();

    await expect
      .poll(() => journal.writes.length, { timeout: 25_000, message: 'expected the retry PATCH' })
      .toBe(writesBeforeRetry + 1);

    const retry = journal.writes[journal.writes.length - 1];

    // ── The invariant ──
    // Two accepted process actions (documentAction CO, createPurchaseInvoice) moved the row
    // on after the last CRUD write the client saw a response for. The retry's PATCH must
    // carry the token those actions left behind.
    expect(
      retry.sentUpdated,
      `The confirm retry PATCHed /purchase-order/header/${ORDER_ID} with \`updated: `
      + `${retry.sentUpdated}\`, but the server holds \`${serverTokenBeforeRetry}\`. The `
      + `order's own process actions moved the token on `
      + `(${journal.actions.filter((a) => a.status === 200).map((a) => `${a.name}: ${a.serverTokenBefore}→${a.serverTokenAfter}`).join(', ')}) `
      + `and nothing refreshed the version cache for the \`header\` bucket: ConfirmModal `
      + `issues the actions with a bare \`fetch\`, and \`entityFromPath\` would key an `
      + `\`/action/<name>\` response under the ACTION NAME anyway. So the retry is refused `
      + `409 stale_record forever, and the user is told another person edited their own `
      + `order. Journal: ${describeJournal(journal)}`,
    ).toBe(serverTokenBeforeRetry);

    expect(
      retry.status,
      `The retry PATCH was refused with ${retry.status}. It must be accepted — nobody else `
      + `touched this record. Journal: ${describeJournal(journal)}`,
    ).toBe(200);

    // The user-visible half of the same defect: a concurrency dialog blaming another person
    // for a change the user's own confirm made.
    await expect(
      page.getByTestId('save-conflict-dialog'),
      'The "someone else edited this record" dialog came up after the user\'s own confirm. '
      + `Journal: ${describeJournal(journal)}`,
    ).toHaveCount(0);

    // And the retry must actually get as far as re-attempting the step that failed, instead
    // of aborting at the save with `poSaveBeforeConfirmError`.
    await expect
      .poll(() => actionsNamed(journal, 'createGoodsReceipt').length, {
        timeout: 20_000,
        message: 'the retry must re-attempt the goods receipt, which is the step that failed',
      })
      .toBe(2);
  });

  test('the retry skips the steps that already succeeded', async ({ page }) => {
    // This half works today (the successful steps are latched in component state) and must
    // keep working after the token fix — it is what makes the modal show "Crear factura / Ya
    // creado" instead of confirming or invoicing the order twice.
    //
    // Note it currently holds VACUOUSLY: the retry aborts at the stale-record PATCH before
    // reaching any action at all. Once the sibling test above goes green this becomes a real
    // assertion, which is exactly why it is worth pinning now.
    const journal = await openOrderDetail(page);
    const confirmButton = await confirmOnceAndFail(page, journal);

    const writesBeforeRetry = journal.writes.length;
    await confirmButton.click();
    await expect
      .poll(() => journal.writes.length, { timeout: 25_000 })
      .toBe(writesBeforeRetry + 1);

    // Give the retry room to issue anything else it was going to issue before concluding it
    // did not — a poll that has already reached its expected value proves nothing about what
    // arrives a tick later.
    await page.waitForTimeout(1_500);

    expect(
      actionsNamed(journal, 'documentAction').length,
      `The order was confirmed twice. \`docAction: 'CO'\` is not idempotent — the second one `
      + `answers @AlreadyPosted@. Journal: ${describeJournal(journal)}`,
    ).toBe(1);
    expect(
      actionsNamed(journal, 'createPurchaseInvoice').length,
      `A second purchase invoice was created for the same order. The first one succeeded and `
      + `is latched in \`invoiceResult\` — the modal shows it as "Ya creado". `
      + `Journal: ${describeJournal(journal)}`,
    ).toBe(1);
  });
});
