import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Editable email recipients — send modal (mocked). ETP-4226.
 *
 * Validates the editable To/CC recipient flow on `SendDocumentModal` for the
 * row-hover "Send" envelope on sales-order and purchase-order. For these two
 * windows the envelope is wired through `useRowEmailModal` (ETP-4372), which
 * mounts `SendDocumentModal` WITH a real client-rendered PDF (`pdfBlobUrl`
 * from `useOrderPdf`/`usePurchaseOrderPdf`) rather than through ListView's own
 * "no PDF" fallback mount — see `installAttachmentUploadMock` below for why
 * that PDF matters to this spec even though the assertions never look at it.
 *
 * Flow under test:
 *   1. Row hover → email quick action opens SendDocumentModal.
 *   2. The To chip editor is pre-populated with the contact email resolved from
 *      the mocked /contacts/businessPartner/{id} endpoint.
 *   3. The user adds an extra To address and a CC address via the chip editor.
 *   4. Clicking Send issues POST .../email-contracts/{window}-send/send whose
 *      body carries `recipientEdits` with the typed `to.add` and `cc.add`.
 *   5. The mocked 200 surfaces the success UI state (status banner).
 *
 * Idempotency contract: a send with NO recipient edits must omit
 * `recipientEdits` entirely and instead carry the deterministic
 * `idempotencyKey` (see buildEmailContractCommand in documentEmailSend.js).
 *
 * Mock mode only — no Etendo backend. login() seeds a fake token + a generic
 * /sws/** mock; this spec layers window-specific routes on top (Playwright
 * matches routes in reverse registration order, so specific wins).
 */

// Synthetic rows. The window auto-enables the generic send modal because the
// list exposes a `documentNo` column (ListView.effectiveSendDocument heuristic).
const BASE_EMAIL = 'partner@base-contact.com';
const EXTRA_TO = 'extra.to@company.com';
const EXTRA_CC = 'cc.person@company.com';

const ROWS = [
  {
    id: 'row-001',
    documentNo: 'DOC-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Partner',
    grandTotalAmount: 100,
    orderDate: '2026-01-15',
    invoiceStatus: 100,
    deliveryStatus: 100,
  },
];

/**
 * List + detail mock for the given spec's header entity.
 */
async function installListMock(page, spec) {
  await page.route(`**/sws/neo/${spec}/header{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      const m = url.match(/\/header\/([^/?]+)/);
      const found = ROWS.find((r) => r.id === m?.[1]) ?? ROWS[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }
    route.fallback();
  });
}

/**
 * Contacts mock — SendDocumentModal fetches the business partner's contact
 * email to seed the trusted base recipient list (baseRecipientsRef). The modal
 * reads `etgoEmail` off each record (loadBusinessPartnerEmail).
 */
async function installContactsMock(page) {
  // apiBaseUrl is /sws/neo/<window>; resolveContactsBaseUrl swaps the last
  // segment → /sws/neo/contacts, then appends /businessPartner/{id}.
  await page.route('**/sws/neo/contacts/businessPartner/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ etgoEmail: BASE_EMAIL }] } }),
    });
  });
}

/**
 * Mocks the attachment-caching endpoint the send flow silently exercises for
 * sales-order/purchase-order.
 *
 * Root cause (investigated 2026-08-19): both windows wire their row-hover
 * "Send" envelope through `useRowEmailModal` (ETP-4372), which calls
 * `useOrderPdf`/`usePurchaseOrderPdf` to render a REAL client-side PDF via
 * jsreport and passes it into `SendDocumentModal` as `pdfBlobUrl` — this is
 * not the "no-PDF" generic modal path the spec's original docblock assumed.
 * Because `WINDOW_ATTACHMENT_TABLE` (documentEmailSend.js) lists both
 * `sales-order` and `purchase-order` → `'C_Order'`, `cacheDocumentPreviewFile`
 * does NOT take its `{ skipped: true }` early return: `resolvePreviewBlob`
 * resolves the real blob and `uploadAndMarkMainAttachment` POSTs to
 * `/sws/neo/attachments/{tableName}/{recordId}?markAsMain=true` BEFORE the
 * actual send request fires.
 *
 * Without this mock, that POST falls through to login()'s generic `/sws/**`
 * catch-all, whose POST shape (`{ id, data: {}, success: true }`) was designed
 * for record-save responses, not attachments. `uploadAndMarkMainAttachment`'s
 * parsing (`json?.response?.data ?? json?.data ?? json`) prefers the empty
 * `json.data` over the top-level `json.id`, resolving `{}` — `.id` missing —
 * so `cacheDocumentPreviewFile` throws `Preview file cache failed`. That
 * throw is never caught inside `sendDocumentEmail`, so it aborts the whole
 * send attempt before the real `POST .../email-contracts/{spec}-send/send`
 * this spec waits for is ever issued — exactly the 15s `waitForResponse`
 * timeout this fixes. This is a test-mocking gap introduced by ETP-4315
 * tightening `cacheDocumentPreviewFile`'s success check from a bare `res.ok`
 * (the retired `/preview-file` endpoint, which this spec's mocks never
 * needed to cover either — the generic catch-all's 200 was already enough)
 * to requiring `.id` on the created attachment — not a behavioral regression
 * in the app itself; requiring `.id` on a real create response is correct.
 */
async function installAttachmentUploadMock(page) {
  await page.route('**/sws/neo/attachments/**', async (route) => {
    if (route.request().method() !== 'POST') {
      route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'mock-attachment-id', name: 'mock-preview.pdf' }),
    });
  });
}

/**
 * Capture + mock the send endpoint. Returns a getter for the parsed request
 * body so tests can assert the command shape. Responds 200 SENT.
 */
async function installSendMock(page, spec) {
  const captured = { body: null };
  await page.route(`**/sws/neo/email-contracts/${spec}-send/send`, async (route) => {
    const req = route.request();
    try {
      captured.body = JSON.parse(req.postData() || '{}');
    } catch {
      captured.body = null;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { status: 'SENT' } } }),
    });
  });
  return captured;
}

/**
 * Click the modal's primary Send button. It has no data-testid, so match by its
 * label. `ui('sendModalSend')` resolves to "Send"/"Enviar" with locale data, or
 * to the raw "sendModalSend" key in mock mode (no LocaleProvider data) — the
 * regex covers all three. Use last() to disambiguate from any topbar send icon.
 */
async function clickSendButton(page) {
  await page.getByRole('button', { name: /send|enviar|sendmodalsend/i }).last().click();
}

/**
 * Locate the message <textarea> in the send modal (ETP-4717). It has no
 * data-testid, so match by its placeholder — resolved from
 * `ui('sendModalMessagePlaceholder')`, either the localized copy or the raw
 * key in mock mode.
 */
function getMessageTextarea(page) {
  return page.getByPlaceholder(/mensaje personal|personal message|sendmodalmessageplaceholder/i);
}

/**
 * Assert the success toast. On SENT/DUPLICATE the modal calls toast.success(...)
 * (sonner). The toast label resolves from `ui('sendModalSentSuccess')` (locale
 * or raw key in mock mode), so we match the sonner success element rather than
 * a specific string.
 */
async function expectSuccessToast(page) {
  const toast = page.locator('[data-sonner-toast][data-type="success"]');
  await expect(toast.first()).toBeVisible({ timeout: 5000 });
}

async function openSendModal(page) {
  const firstRow = page.locator('tbody tr').filter({ hasText: 'DOC-001' }).first();
  await expect(firstRow).toBeVisible();
  await firstRow.hover();
  const emailBtn = firstRow.getByTestId('row-quick-action-email');
  await expect(emailBtn).toBeVisible();
  await emailBtn.click();
  // The generic modal pre-populates the To chip editor with the contact email.
  const baseChip = page.getByTestId(`send-modal-to-chip-${BASE_EMAIL}`);
  await expect(baseChip).toBeVisible();
  return page.getByTestId('send-modal-to-input');
}

const SPECS = ['sales-order', 'purchase-order'];

for (const spec of SPECS) {
  test.describe(`Editable recipients — ${spec}`, () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installListMock(page, spec);
      await installContactsMock(page);
      await installAttachmentUploadMock(page);
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test('send with added To + CC carries recipientEdits matching what was typed', async ({ page }) => {
      const captured = await installSendMock(page, spec);
      const toInput = await openSendModal(page);

      // Add an extra To address (commit on Enter).
      await toInput.fill(EXTRA_TO);
      await toInput.press('Enter');
      await expect(page.getByTestId(`send-modal-to-chip-${EXTRA_TO}`)).toBeVisible();

      // Reveal the CC editor and add a CC address.
      await page.getByTestId('send-modal-add-cc').click();
      const ccInput = page.getByTestId('send-modal-cc-input');
      await expect(ccInput).toBeVisible();
      await ccInput.fill(EXTRA_CC);
      await ccInput.press('Enter');
      await expect(page.getByTestId(`send-modal-cc-chip-${EXTRA_CC}`)).toBeVisible();

      // ETP-4717 — the operator also edits the message. This must flow into
      // the send payload as `messageEdits`, alongside `recipientEdits`.
      const MESSAGE_TEXT = 'Please review the attached document.';
      const messageTextarea = getMessageTextarea(page);
      await messageTextarea.fill(MESSAGE_TEXT);

      // Send and wait for the captured request. Use waitForResponse (not
      // waitForRequest) so the promise resolves AFTER route.fulfill() completes
      // and captured.body is guaranteed to be set (matches the sibling test).
      const sendReq = page.waitForResponse(
        (r) => r.url().includes(`/email-contracts/${spec}-send/send`) && r.request().method() === 'POST',
      );
      await clickSendButton(page);
      await sendReq;

      // Assert the intercepted command shape.
      expect(captured.body).toBeTruthy();
      expect(captured.body.intent).toBe('send-document');
      expect(captured.body.recordId).toBe('row-001');
      // Editing recipients switches the command to the recipientEdits branch:
      // the deterministic idempotencyKey is dropped (server derives it).
      expect(captured.body.idempotencyKey).toBeUndefined();
      expect(captured.body.recipientEdits).toBeTruthy();
      expect(captured.body.recipientEdits.to.add).toContain(EXTRA_TO);
      // The base contact email is unchanged → not part of to.add.
      expect(captured.body.recipientEdits.to.add).not.toContain(BASE_EMAIL);
      expect(captured.body.recipientEdits.cc.add).toContain(EXTRA_CC);
      // ETP-4717 — the edited message travels in `messageEdits`, co-existing
      // with `recipientEdits` on the same command.
      expect(captured.body.messageEdits).toBeTruthy();
      expect(captured.body.messageEdits.message).toBe(MESSAGE_TEXT);

      // Success UI state from the mocked 200 SENT: a success toast appears and
      // the modal auto-closes (To input detaches). The in-modal status banner is
      // transient — sendDocumentFromModal calls onClose() on SENT/DUPLICATE — so
      // closing is the durable success signal.
      await expect(page.getByTestId('send-modal-to-input')).toHaveCount(0);
      await expectSuccessToast(page);
    });

    test('untouched send omits recipientEdits and carries the idempotencyKey', async ({ page }) => {
      const captured = await installSendMock(page, spec);
      await openSendModal(page);

      // Use waitForResponse (not waitForRequest) so the promise resolves AFTER
      // route.fulfill() completes and captured.body is guaranteed to be set.
      const sendReq = page.waitForResponse(
        (r) => r.url().includes(`/email-contracts/${spec}-send/send`) && r.request().method() === 'POST',
      );
      await clickSendButton(page);
      await sendReq;

      expect(captured.body).toBeTruthy();
      expect(captured.body.intent).toBe('send-document');
      expect(captured.body.recipientEdits).toBeUndefined();
      // Legacy idempotency path: `${contract}:${id}:send:v1`.
      expect(captured.body.idempotencyKey).toBe(`${spec}-send:row-001:send:v1`);

      // Same success signal as the edited-send case.
      await expect(page.getByTestId('send-modal-to-input')).toHaveCount(0);
      await expectSuccessToast(page);
    });
  });
}
