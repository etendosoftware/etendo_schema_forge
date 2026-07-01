/**
 * E2E tests for ETP-4003 i18n fixes.
 *
 * Two groups:
 *   1. CommandPalette i18n — opens on Ctrl+K, shows translated items, hides
 *      hidden items, search finds visible items.
 *   2. SendDocumentModal editable recipients (ETP-4226) — clicking the email
 *      quick-action opens the modal with an editable chip editor; chips are
 *      added/removed, Send is gated by the presence of a To recipient, and the
 *      add-CC affordance reveals the CC editor.
 *
 * Mock mode only — no Etendo backend required.
 * Run: cd e2e && npx playwright test tests/flows/i18n-etp4003.mocked.spec.js
 * Requires dev server: make dev (http://localhost:3100)
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

// ─── Sales Invoice mock rows ──────────────────────────────────────────────────

const SI_ROWS = [
  {
    id: 'si-001',
    documentNo: 'INV-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'businessPartner$_identifier': 'ACME Corp',
    grandTotalAmount: 1000,
    invoiceDate: '2026-01-15',
    bpartnerId: 'bp-001',
  },
];

async function installSalesInvoiceMock(page) {
  await page.route('**/sws/neo/sales-invoice/header**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: SI_ROWS, totalRows: SI_ROWS.length } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      const m = url.match(/\/header\/([^/?]+)/);
      const found = SI_ROWS.find((r) => r.id === m?.[1]) ?? SI_ROWS[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }
    route.fallback();
  });

  // Contacts endpoint — return empty so the dropdown doesn't auto-fill
  await page.route('**/sws/neo/contacts/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });

  // PDF render endpoint — return a minimal HTML so preview doesn't error
  await page.route('**/api/reports/*/render', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>PDF Preview</body></html>',
    });
  });
}

// ─── Group 1: CommandPalette i18n ─────────────────────────────────────────────

test.describe('CommandPalette i18n (ETP-4003)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('palette opens on Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k');
    // The CommandDialog root input should become visible
    await expect(page.locator('[cmdk-input], input[placeholder]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('palette shows visible menu items after opening', async ({ page }) => {
    await page.keyboard.press('Control+k');
    // Wait for dialog to be visible
    await page.waitForSelector('[cmdk-dialog], [role="dialog"]', { timeout: 5_000 }).catch(() => {});
    // At least the dashboard/home item should be present (it is never hidden)
    // Use a broad role-based locator — exact text varies by locale
    const listContainer = page.locator('[cmdk-list], [cmdk-root]').first();
    await expect(listContainer).toBeVisible({ timeout: 5_000 });
  });

  test('searching for a term shows matching items', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[cmdk-input]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    // Type a search term that should match a visible window
    await input.fill('order');
    // Should show at least one result (sales-order or purchase-order)
    const items = page.locator('[cmdk-item]');
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
  });

  test('hidden items (deal, business-partner) are not visible in the palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[cmdk-input]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    // Search specifically for 'deal' — it is hidden in menu.json
    await input.fill('deal');
    // The empty state OR zero cmdk-item elements should be visible
    const items = page.locator('[cmdk-item]');
    const count = await items.count();
    // Either no items OR none that navigate to /deal
    if (count > 0) {
      // Verify none of them are the hidden 'deal' window
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).textContent();
        // The deal label could be translated; check the name is not 'deal'
        expect(text?.toLowerCase()).not.toBe('deal');
      }
    }
    // If count === 0, the empty state is shown — that's correct behaviour
  });

  test('closing and reopening the palette works', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('[cmdk-input]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
    // Close with Escape — press on the focused input so cmdk intercepts it
    await input.press('Escape');
    await expect(input).not.toBeVisible({ timeout: 5_000 });
    // Reopen
    await page.keyboard.press('Control+k');
    await expect(page.locator('[cmdk-input]').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Group 2: SendDocumentModal editable recipients (ETP-4003 / ETP-4226) ─────
//
// ETP-4226 made `DEFAULT_SEND_POLICY.editableRecipients` default to `true`, so
// document sends now render an editable chip editor (RecipientChipEditor) for
// the To/CC fields instead of the legacy read-only preview input. These tests
// assert the editable-chips behaviour:
//   - To field exposes `send-modal-to-input` (placeholder is the i18n
//     `sendModalRecipientPlaceholder`, not the legacy "email@company.com").
//   - Typing an email + Enter creates a chip `send-modal-to-chip-<email>`; the
//     remove button removes it.
//   - Send is locally gated by `noToRecipient`: disabled while To is empty,
//     enabled once a valid recipient chip exists.
//   - The add-CC affordance reveals the CC chip editor.

test.describe('SendDocumentModal editable recipients (ETP-4003 / ETP-4226)', () => {
  const TEST_EMAIL = 'buyer@example.com';

  test.beforeEach(async ({ page }) => {
    await login(page);
    await installSalesInvoiceMock(page);
    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  /** Open the Send modal from the row email quick-action and return the To input. */
  async function openSendModal(page) {
    const firstRow = page.locator('tbody tr').filter({ hasText: 'INV-001' }).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.hover();
    const emailBtn = firstRow.getByTestId('row-quick-action-email');
    await expect(emailBtn).toBeVisible({ timeout: 5_000 });

    // Register BEFORE clicking — contacts fetch can complete before we'd start waiting.
    // Swallowed with .catch so tests still run if the component never calls this endpoint.
    const contactsDone = page.waitForResponse(
      r => r.url().includes('/sws/neo/contacts'),
      { timeout: 8_000 },
    ).catch(() => {});

    await emailBtn.click();

    const toInput = page.getByTestId('send-modal-to-input');
    await expect(toInput).toBeVisible({ timeout: 8_000 });

    // Wait for the contacts pre-fill fetch to settle before returning. Without this,
    // the Send button can remain disabled mid-fetch even after a chip is added.
    await contactsDone;

    return toInput;
  }

  test('row email quick-action opens the Send modal with the editable To field', async ({ page }) => {
    const toInput = await openSendModal(page);
    // Editable chip editor input, not the legacy read-only preview field.
    await expect(toInput).not.toHaveAttribute('readonly', '');
    await expect(toInput).toBeEditable();
  });

  test('typing an email and pressing Enter creates a removable recipient chip', async ({ page }) => {
    const toInput = await openSendModal(page);
    // Contacts mock returns no email, so To starts empty.
    await expect(page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`)).toHaveCount(0);

    await toInput.click();
    await toInput.fill(TEST_EMAIL);
    await toInput.press('Enter');

    const chip = page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`);
    await expect(chip).toBeVisible({ timeout: 5_000 });
    // The draft input clears after a valid commit.
    await expect(toInput).toHaveValue('');

    // Remove button drops the chip again.
    await page.getByTestId(`send-modal-to-remove-${TEST_EMAIL}`).click();
    await expect(chip).toHaveCount(0);
  });

  test('Send is disabled while To is empty and enabled after adding a recipient', async ({ page }) => {
    const toInput = await openSendModal(page);
    const sendBtn = page.locator('button').filter({ hasText: /^(Enviar|Send)$/i });

    // noToRecipient gating: no recipient chip yet → Send disabled.
    await expect(page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`)).toHaveCount(0);
    await expect(sendBtn).toBeDisabled({ timeout: 5_000 });

    // Add a valid recipient → Send becomes enabled.
    await toInput.click();
    await toInput.fill(TEST_EMAIL);
    await toInput.press('Enter');
    await expect(page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`)).toBeVisible({ timeout: 5_000 });
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  });

  test('the add-CC affordance reveals the CC chip editor', async ({ page }) => {
    await openSendModal(page);
    const addCc = page.getByTestId('send-modal-add-cc');
    await expect(addCc).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('send-modal-cc-input')).toHaveCount(0);

    await addCc.click();
    await expect(page.getByTestId('send-modal-cc-input')).toBeVisible({ timeout: 5_000 });
  });
});
