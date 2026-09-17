import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-5323 regression — line "Description" too-long error surfaces a friendly
 * translated toast instead of the bare "Error 400", and the inline-edit cell
 * hard-stops typing at the column's DB length.
 *
 * Covers ONE representative window (sales-order): the fix is generator-generic
 * (`maxLengthColPart` in generate-frontend.js) and shared-component-generic
 * (InlineLinesPanel's EditCell text fallback + backendErrors.js's
 * `response.errors` fallback), so it applies identically to
 * sales-quotation/sales-invoice/purchase-order/purchase-invoice — duplicating
 * this spec across all five windows would not add coverage.
 *
 * Routing note (same as inline-lines-behavior.mocked.spec.js): login() installs
 * a `**\/sws/**` catch-all, so installMocks() must run AFTER login() for
 * specific routes to win.
 */

const ORDER_ID = 'mock-order-desclen-001';

const LINE = {
  id: 'line-desclen-001',
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  description: '',
  orderedQuantity: 2,
  listPrice: 50,
  discount: 0,
  lineGrossAmount: 100,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 21%',
  'currency$_identifier': 'EUR',
};

const DRAFT_HEADER = {
  id: ORDER_ID,
  documentNo: 'SO-MOCK-DESCLEN',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 100,
  summedLineAmount: 100,
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
};

// The exact shape core's DefaultJsonDataService reports for a per-property
// StringPropertyValidator rejection (RPCREQUEST_STATUS_VALIDATION_ERROR,
// response.errors keyed by property name) — see backendErrors.js's
// parseBackendErrorMessage and NeoCrudHandler#buildValidationErrorResponse.
const TOO_LONG_VALIDATION_ERROR_BODY = {
  response: {
    status: -4,
    errors: {
      description: 'C_OrderLine.description: Value too long. Length 2150, maximum allowed 2000 '
        + '[Lorem ipsum dolor sit amet, a very long line description...]',
    },
  },
};

// Non-matching methods use route.fallback(), NOT route.continue() — see the
// rationale documented at the top of inline-lines-behavior.mocked.spec.js.
async function installMocks(page, { patchBody = null, patchStatus = 200 } = {}) {
  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_HEADER] } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [LINE], totalRows: 1 } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    if (patchStatus !== 200) {
      await route.fulfill({
        status: patchStatus,
        contentType: 'application/json',
        body: JSON.stringify(patchBody ?? {}),
      });
      return;
    }
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...LINE, ...body }] } }),
    });
  });
}

test.describe('Inline lines — Description too-long error (ETP-5323, mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`/sales-order/${ORDER_ID}`);
  });

  test('a 400 with response.errors surfaces the translated "too long" toast, not the bare Error 400', async ({ page }) => {
    await installMocks(page, { patchStatus: 400, patchBody: TOO_LONG_VALIDATION_ERROR_BODY });
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const row = page.locator(`[data-testid="line-row-${LINE.id}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const descriptionField = row.locator('[data-testid="field-description"]');
    await expect(descriptionField).toBeVisible({ timeout: 3_000 });
    await descriptionField.fill('A description that the mocked backend will reject as too long.');
    await descriptionField.blur();

    // The regression: before ETP-5323, parseBackendErrorMessage() found no raw message
    // anywhere in this response shape, so extractErrorMessage fell back to the bare
    // `Error 400` and that is what the toast showed.
    const bareErrorToast = page.locator('[data-sonner-toast], [role="status"]')
      .filter({ hasText: /^Error 400$/ });
    await expect(bareErrorToast).toHaveCount(0);

    // The fix: response.errors.description is extracted, translated via
    // backendError.fieldTooLong, and interpolated with the real maximum (2000) —
    // asserted in both locales since the toast may render either depending on the
    // env's default locale.
    const friendlyToast = page.locator('[data-sonner-toast], [role="status"]')
      .filter({ hasText: /2000/ })
      .filter({ hasText: /(no puede superar|must not exceed)/i });
    await expect(friendlyToast).toBeVisible({ timeout: 5_000 });
  });

  test('typing past 2000 characters is hard-capped client-side on the Description cell', async ({ page }) => {
    await installMocks(page);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const row = page.locator(`[data-testid="line-row-${LINE.id}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const descriptionField = row.locator('[data-testid="field-description"]');
    await expect(descriptionField).toBeVisible({ timeout: 3_000 });

    // Generated maxLength column: LinesTable.jsx's `description` column declares
    // `maxLength: 2000` (sourced from C_OrderLine.Description's AD_Column.FieldLength via
    // generate-frontend.js's maxLengthColPart), which InlineLinesPanel's EditCell text
    // fallback applies as the native HTML `maxlength` attribute.
    await expect(descriptionField).toHaveAttribute('maxlength', '2000');

    // `Locator.fill()` sets `.value` directly (no keystroke simulation), so it would
    // bypass the native `maxlength` guard entirely and prove nothing. Get right up to
    // the cap with `fill()` (fast, and exactly at the limit so nothing is truncated
    // yet), then simulate REAL keystrokes for the overflow with `pressSequentially()` —
    // that's the same code path a real typed (or pasted) keystroke takes, and the only
    // one the browser's native `maxlength` attribute actually constrains.
    await descriptionField.fill('A'.repeat(2000));
    await expect(descriptionField).toHaveValue('A'.repeat(2000));

    await descriptionField.pressSequentially('BBBBB');

    // Already at the cap: every one of those 5 keystrokes must have been rejected by
    // the browser, not appended — this is the assertion for "hard stop", not "trims
    // afterwards".
    const actualValue = await descriptionField.inputValue();
    expect(actualValue.length).toBe(2000);
    expect(actualValue).not.toContain('B');
  });
});
