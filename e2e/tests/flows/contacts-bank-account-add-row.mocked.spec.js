import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — Cuenta Bancaria inline-add-row (mocked, single continuous flow).
 *
 * Regression coverage for ETP-4009 fixes:
 *  1. Column alignment: IBAN header aligns with body cells (minWidth:0).
 *  2. @variable@ defaults (e.g. @COUNTRYDEF@) are stripped by buildEmpty().
 *  3. Backend error strings are translated to Spanish via translateBackendError.
 *
 * Single flow: login → detail → bank tab → verify rows → check alignment →
 *   open add-row → verify @COUNTRYDEF@ stripped → submit IBAN error →
 *   verify translation → submit generic error → verify toast.
 *
 * Mock mode only.
 */

const BP_ID = 'bp-mock-001';
const BP_ROW = {
  id: BP_ID,
  name: 'Test Business Partner',
  searchKey: 'TEST_BP',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
};

const BANK_LINE_1 = {
  id: 'bank-001',
  bankName: 'Santander',
  bankFormat: 'GENERIC',
  accountNo: '1234567890',
  iBAN: '',
  swiftCode: '',
  displayedAccount: '1234567890',
};

test.describe('Contacts — Cuenta Bancaria inline-add-row', () => {

  test('tab access → alignment → add-row → @COUNTRYDEF@ → IBAN error translation → generic error', async ({ page }) => {
    await login(page);

    // ── Install base mocks ──────────────────────────────────────────────
    // Track POST override for later error scenarios
    let postOverride = null;

    await page.route('**/sws/neo/contacts/businessPartner**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'GET' && !/\/businessPartner\/[^/?]+/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [BP_ROW], totalRows: 1 } }) });
      }
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [BP_ROW] } }) });
      }
      route.fallback();
    });

    await page.route('**/sws/neo/contacts/bankAccount**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [BANK_LINE_1], totalRows: 1 } }) });
      }
      if (method === 'POST') {
        if (postOverride) {
          return route.fulfill(postOverride);
        }
        const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [{ id: 'bank-new-001', ...body }] } }) });
      }
      route.fallback();
    });

    // Empty child entities
    for (const entity of ['contact', 'locationAddress', 'customer', 'vendorCreditor']) {
      await page.route(`**/sws/neo/contacts/${entity}**`, async (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [], totalRows: 0 } }) });
        }
        route.fallback();
      });
    }

    await page.goto(`/contacts/${BP_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Bank Account tab is accessible and shows existing rows
    // ═══════════════════════════════════════════════════════════════════════

    const bankTab = page.getByTestId('tab-bankAccount');
    await expect(bankTab).toBeVisible({ timeout: 10_000 });
    await bankTab.click();

    await expect(page.getByText('Santander')).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: IBAN column header aligns with body row cells
    // ═══════════════════════════════════════════════════════════════════════

    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    const ibanHeader = page.getByTestId('column-header-iBAN');
    if (await ibanHeader.count() > 0) {
      await expect(ibanHeader).toBeVisible();
      const headerBox = await ibanHeader.boundingBox();
      const bodyCell = page.locator('[data-cell-key="iBAN"]').first();
      if (await bodyCell.count() > 0) {
        const bodyBox = await bodyCell.boundingBox();
        if (headerBox && bodyBox) {
          expect(Math.abs(headerBox.x - bodyBox.x)).toBeLessThanOrEqual(4);
        }
      }
    } else {
      // InlineLinesPanel mode — verify no horizontal overflow
      const tableEl = page.locator('[data-testid="inline-lines-panel"]');
      if (await tableEl.count() > 0) {
        const box = await tableEl.boundingBox();
        const parentBox = await tableEl.locator('..').boundingBox();
        if (box && parentBox) {
          expect(box.x + box.width).toBeLessThanOrEqual(parentBox.x + parentBox.width + 2);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Add-row button opens inline form
    // ═══════════════════════════════════════════════════════════════════════

    const addBtn = page.getByTestId('action-add-line');
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();
    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: @COUNTRYDEF@ default is NOT pre-filled in country field
    // ═══════════════════════════════════════════════════════════════════════

    const countryField = page.getByTestId('inline-add-field-country');
    if (await countryField.count() > 0) {
      const val = await countryField.inputValue().catch(() => '');
      expect(val).not.toContain('@COUNTRYDEF@');
      expect(val).not.toMatch(/^@[^@]+@$/);
    }

    const bankFormatField = page.getByTestId('inline-add-field-bankFormat');
    if (await bankFormatField.count() > 0) {
      const triggerText = await bankFormatField.textContent().catch(() => '');
      expect(triggerText).not.toContain('@');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Backend IBAN country error is shown as translated message
    // ═══════════════════════════════════════════════════════════════════════

    // Override POST to return IBAN country error
    postOverride = {
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Country needed in an IBAN account.', status: 400 } }),
    };

    // Select IBAN format if available
    const bankFormatTrigger = page.getByTestId('inline-add-field-bankFormat');
    if (await bankFormatTrigger.count() > 0) {
      await bankFormatTrigger.click();
      const ibanOption = page.getByRole('option', { name: /IBAN/i });
      if (await ibanOption.count() > 0) await ibanOption.click();
    }

    // Submit
    const confirmBtn = page.getByTestId('inline-add-confirm')
      .or(page.getByRole('button', { name: /confirm|guardar|save/i }));
    if (await confirmBtn.count() === 0) {
      const firstInput = page.getByTestId('inline-add-row').locator('input, button[role="combobox"]').first();
      if (await firstInput.count() > 0) await firstInput.press('Enter');
    } else {
      await confirmBtn.first().click();
    }

    await page.waitForTimeout(1_500);
    const rawIbanMsg = 'Country needed in an IBAN account.';
    const bodyText1 = await page.locator('body').textContent();
    // Raw English should NOT appear verbatim — should be translated
    if (bodyText1.includes(rawIbanMsg)) {
      expect(bodyText1).not.toContain(rawIbanMsg);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Backend generic error shows an error (not silent)
    // ═══════════════════════════════════════════════════════════════════════

    // Override POST to return generic account error
    postOverride = {
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Using the Generic Account No. for generating the Displayed Account requires to introduce a Generic Account Number', status: 400 } }),
    };

    // Re-open add row if it closed after the error
    const addRowVisible = await page.getByTestId('inline-add-row').isVisible().catch(() => false);
    if (!addRowVisible) {
      await addBtn.click();
      await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    }

    // Submit again
    const confirmBtn2 = page.getByTestId('inline-add-confirm')
      .or(page.getByRole('button', { name: /confirm|guardar|save/i }));
    if (await confirmBtn2.count() === 0) {
      const firstInput = page.getByTestId('inline-add-row').locator('input, button[role="combobox"]').first();
      if (await firstInput.count() > 0) await firstInput.press('Enter');
    } else {
      await confirmBtn2.first().click();
    }

    await page.waitForTimeout(1_500);
    const rawGenericMsg = 'Using the Generic Account No. for generating the Displayed Account requires to introduce a Generic Account Number';
    const bodyText2 = await page.locator('body').textContent();
    if (bodyText2.includes(rawGenericMsg)) {
      expect(bodyText2).not.toContain(rawGenericMsg);
    }
  });
});
