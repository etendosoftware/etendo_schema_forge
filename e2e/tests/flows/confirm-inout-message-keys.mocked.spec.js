import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Confirm modal — AD_MESSAGE key mapping on a failed confirmation (mocked) — ETP-5316.
 *
 * Confirming a shipment or return whose lines are broken used to surface core's own sentence:
 *
 *   "En la línea 10, 20, 30, 40, Cuando el producto no esta vacío entonces la cantidad movida
 *    no debe ser cero."
 *
 * Those numbers are AD line numbers (numbered in tens) — they match no row the user can see in
 * the grid, and they differ per document, so the text is neither actionable nor matchable as a
 * literal. Etendo GO now returns the AD_MESSAGE search keys it extracted BEFORE translating
 * (`messageKeys`), and the SPA resolves the failure by identity and renders its own wording.
 *
 * This spec is the end-to-end half of that contract: only a real browser run proves the keys
 * actually travel HTTP body → useApiFetch → ConfirmInOutModal's buildBackendError →
 * translateBackendError → the inline error the user reads, with the real es_ES dictionary rather
 * than a unit-test stub. The unit coverage lives in
 * `tools/app-shell/src/lib/__tests__/backendErrors.test.js` and
 * `components/contract-ui/__tests__/ConfirmInOutModal.spec.jsx`.
 *
 * Mock mode only — no backend required. Run against plain `make dev` (NOT `make dev-mock`:
 * VITE_MOCK patches window.fetch in-page and page.route() never sees the request).
 */

const CORE_SENTENCE = 'En la línea 10, 20, 30, 40, Cuando el producto no esta vacío entonces '
  + 'la cantidad movida no debe ser cero.';

const MAPPED_TEXT = 'Hay líneas sin cantidad.';

const ROW = {
  id: 'ret-keys-001',
  documentNo: 'RD/05316',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  'businessPartner$_identifier': 'Test Customer',
  movementDate: '2026-05-01',
  warehouse: 'wh-001',
  'warehouse$_identifier': 'España Norte',
  sourceShipmentDocNo: 'ALB/05316',
  returnInvoices: [],
  hasReturnInvoice: false,
  sourceShipments: [{ id: 'ship-5316', documentNo: 'ALB/05316' }],
};

/**
 * Header + line mocks for return-material-receipt, plus a documentAction POST that answers the
 * given 400 body.
 *
 * Two page.route() registrations per endpoint, never the `{/**,}**` brace pattern: Playwright's
 * glob→regex compiler only treats `**` as "crosses path separators" when it is immediately
 * followed by `/` or the glob's end, so the brace form silently degrades to a single segment and
 * the two-segments-deep `/<id>/action/documentAction` POST falls through to login()'s generic
 * `/sws/**` stub. See docs/e2e-testing-guide.md.
 *
 * Must be called AFTER login() — Playwright matches routes in reverse registration order.
 */
async function installMocks(page, errorBody) {
  const linesHandler = async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  };
  await page.route('**/sws/neo/return-material-receipt/returnMaterialReceiptLine/**', linesHandler);
  await page.route('**/sws/neo/return-material-receipt/returnMaterialReceiptLine**', linesHandler);

  let documentActionCalls = 0;
  const headerHandler = async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (method === 'POST' && url.includes('/action/documentAction')) {
      documentActionCalls += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(errorBody),
      });
      return;
    }

    if (method === 'GET' && /\/returnMaterialReceipt\/[^/?]+(\?|$)/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ROW] } }),
      });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ROW], totalRows: 1 } }),
      });
      return;
    }

    route.fallback();
  };
  await page.route('**/sws/neo/return-material-receipt/returnMaterialReceipt/**', headerHandler);
  await page.route('**/sws/neo/return-material-receipt/returnMaterialReceipt**', headerHandler);

  return { documentActionCalls: () => documentActionCalls };
}

async function openConfirmModal(page) {
  await page.goto(`/return-material-receipt/${ROW.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // Generous: on a cold `make dev` this is the first request for the whole
  // return-material-receipt module graph, and Vite compiles it on demand.
  const confirmBtn = page.getByTestId('action-confirm-with-credit');
  await expect(confirmBtn).toBeVisible({ timeout: 30_000 });
  await confirmBtn.click();

  const modal = page.getByTestId('confirm-inout-modal');
  await expect(modal).toBeVisible({ timeout: 8_000 });

  // This spec only exercises the documentAction failure -> AD_MESSAGE key mapping
  // path — it has nothing to do with invoice creation or invoice rectification.
  // ConfirmWithCreditButtonBase defaults the invoice-creation toggle ON (ROW has no
  // invoiceStatus, so isFullyInvoiced is false), which since ETP-5381 makes
  // ConfirmInOutModal treat rectifiableInvoicesUrl as active and require a selected
  // rectifiable invoice before it considers the form satisfied. installMocks() does
  // not mock that endpoint (out of scope for this spec), so the picker never
  // resolves and the confirm button stays permanently disabled. Turning the toggle
  // off makes invoiceRequested false, which makes the rectify gate inactive, so
  // confirm becomes clickable purely on the documentAction path under test.
  const invoiceToggle = modal.getByTestId('confirm-modal-invoice-toggle');
  if (await invoiceToggle.count() > 0) {
    await invoiceToggle.click();
  }

  const confirmModalBtn = page.getByTestId('confirm-modal-confirm-btn');
  await expect(confirmModalBtn).toBeEnabled({ timeout: 8_000 });

  return modal;
}

test.describe('ConfirmInOutModal — failure mapped by AD_MESSAGE key (ETP-5316)', () => {
  test('a 400 carrying messageKeys renders our own wording, not the core line-number sentence', async ({ page }) => {
    await login(page);
    const calls = await installMocks(page, {
      status: 'error',
      message: CORE_SENTENCE,
      messageKeys: ['Inline', 'ProductNotNullAndMovementQtyZero'],
    });

    const modal = await openConfirmModal(page);
    await page.getByTestId('confirm-modal-confirm-btn').click();

    await expect(modal.getByText(MAPPED_TEXT)).toBeVisible({ timeout: 8_000 });

    // The whole point: the AD line numbers never reach the user.
    await expect(modal.getByText(CORE_SENTENCE)).toHaveCount(0);
    await expect(modal).toContainText(MAPPED_TEXT);
    expect(calls.documentActionCalls()).toBe(1);

    // The modal stays open on failure so the user can cancel or retry.
    await expect(page.getByTestId('confirm-modal-confirm-btn')).toBeVisible();
  });

  // The two repos deploy separately, so a frontend running ahead of the backend gets no keys —
  // that path must behave exactly as it did before ETP-5316.
  test('a 400 without messageKeys still shows the backend phrase verbatim', async ({ page }) => {
    await login(page);
    await installMocks(page, { status: 'error', message: CORE_SENTENCE });

    const modal = await openConfirmModal(page);
    await page.getByTestId('confirm-modal-confirm-btn').click();

    await expect(modal.getByText(CORE_SENTENCE)).toBeVisible({ timeout: 8_000 });
    await expect(modal.getByText(MAPPED_TEXT)).toHaveCount(0);
  });

  // An unknown token is inert by design: the client matches against its own allow-list, so a
  // key it does not know must fall through to the text route rather than blank the message.
  test('a 400 whose keys we do not map falls back to the backend phrase', async ({ page }) => {
    await login(page);
    await installMocks(page, {
      status: 'error',
      message: CORE_SENTENCE,
      messageKeys: ['Inline', 'SomeTokenWeDoNotMap'],
    });

    const modal = await openConfirmModal(page);
    await page.getByTestId('confirm-modal-confirm-btn').click();

    await expect(modal.getByText(CORE_SENTENCE)).toBeVisible({ timeout: 8_000 });
    await expect(modal.getByText(MAPPED_TEXT)).toHaveCount(0);
  });
});
