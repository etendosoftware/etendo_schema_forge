import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Editable email recipients — send modal (mocked). ETP-4226.
 *
 * Validates the editable To/CC recipient flow on the generic SendDocumentModal
 * that ListView mounts for documental windows (sales-order, purchase-order).
 *
 * Flow under test:
 *   1. Row hover → email quick action opens the generic SendDocumentModal.
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
  await page.route(`**/sws/neo/${spec}/header**`, async (route) => {
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

      // Send and wait for the captured request.
      const sendReq = page.waitForRequest(
        (r) => r.url().includes(`/email-contracts/${spec}-send/send`) && r.method() === 'POST',
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
