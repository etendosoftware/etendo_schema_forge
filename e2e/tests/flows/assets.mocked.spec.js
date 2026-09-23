import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Assets window — full coverage (mocked).
 *
 * Covers: list render, detail open, "Create Amortization" process button
 * visibility gated by depreciate='Y'/'N', AmortizationPlan panel render,
 * and navigation from an amortization plan row to /amortization/{id}.
 *
 * Routing note: login() installs a `**\/sws/**` catch-all so installMocks()
 * must run AFTER login() for specific routes to win (LIFO order).
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ASSET_WITH_DEPRECIATION = {
  id: 'mock-asset-001',
  searchKey: 'AS-001',
  name: 'Coche',
  'assetCategory$_identifier': 'Vehiculos',
  currency: 'EUR-ID',
  'currency$_identifier': 'EUR',
  depreciate: 'Y',
  depreciationType: 'LI',
  calculateType: 'PE',
  annualDepreciation: 8.33,
  assetValue: 18000,
  depreciatedValue: 1500,
  depreciatedPlan: 1500,
  fullyDepreciated: 'N',
  processed: 'N',
};

const ASSET_NO_DEPRECIATION = {
  id: 'mock-asset-002',
  searchKey: 'AS-002',
  name: 'Servidor',
  'assetCategory$_identifier': 'Otros',
  currency: 'EUR-ID',
  'currency$_identifier': 'EUR',
  depreciate: 'N',
  assetValue: 15000,
  depreciatedValue: 0,
  depreciatedPlan: 0,
  fullyDepreciated: 'N',
  processed: 'N',
};

const AMORTIZATION_LINE = {
  id: 'mock-amort-line-001',
  amortization: 'mock-amort-001',
  'amortization$_identifier': '08-04-2026 - 01-04-2026',
  amortizationPercentage: 8.33,
  amortizationAmount: 1500,
  'currency$_identifier': 'EUR',
  sEQNoAsset: 10,
};

const ASSET_ACCT_ROW = {
  id: 'mock-asset-acct-001',
  accountingSchema: 'gl-schema-001',
  'accountingSchema$_identifier': 'Plan General Contable',
  accumulatedDepreciation: 'gl-001',
  'accumulatedDepreciation$_identifier': '2813000 Amortización acumulada de maquinaria',
  depreciation: 'gl-002',
  'depreciation$_identifier': '6810000 Dotación a la amortización de maquinaria',
};

// ---------------------------------------------------------------------------
// Mock installer
// ---------------------------------------------------------------------------

/**
 * Install all routes for the assets window.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {object[]} opts.assets             - rows returned for the list endpoint
 * @param {object}   opts.detail             - asset returned for GET /assets/{id}
 * @param {object[]} opts.amortizationLines  - rows returned for GET /amortizationLine
 * @param {object[]} opts.assetAcct          - rows returned for GET /assetAcct
 */
async function installMocks(page, {
  assets = [ASSET_WITH_DEPRECIATION, ASSET_NO_DEPRECIATION],
  detail = ASSET_WITH_DEPRECIATION,
  amortizationLines = [AMORTIZATION_LINE],
  assetAcct = [],
} = {}) {
  // Child lines — amortizationLine
  await page.route('**/sws/neo/assets/amortizationLine{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: amortizationLines, totalRows: amortizationLines.length } }),
    });
  });

  // Child lines — assetAcct
  await page.route('**/sws/neo/assets/assetAcct{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: assetAcct, totalRows: assetAcct.length } }),
    });
  });

  // Main assets entity — list + detail
  await page.route('**/sws/neo/assets/assets{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/assets\/[^/?]+/.test(url)) {
      // List fetch
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: assets, totalRows: assets.length } }),
      });
      return;
    }

    if (req.method() === 'GET') {
      // Detail fetch — match by id
      const m = url.match(/\/assets\/([^/?]+)/);
      const found = assets.find(a => a.id === m?.[1]) ?? detail;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }

    return route.fallback();
  });
}

// ---------------------------------------------------------------------------
// Test 6 — Amortization Plan row navigates to /amortization/{id}
// ---------------------------------------------------------------------------

test.describe('Assets — AmortizationPlan row navigation', () => {
  test('clicking an amortization plan row navigates to the amortization detail', async ({ page }) => {
    await login(page);
    await installMocks(page, {
      detail: ASSET_WITH_DEPRECIATION,
      amortizationLines: [AMORTIZATION_LINE],
    });
    await page.goto(`/assets/${ASSET_WITH_DEPRECIATION.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // ETP-4402 mounted the "Accounting" (assetAcct) tab as the primary detail
    // tab, so the Amortization Plan now lives in a non-default tab. Activate it
    // before the row can be visible/clickable.
    await page.getByTestId('tab-custom:amortizationPlan').click();

    // Locate the PeriodLink button inside the row (only the button navigates, not the whole row)
    const amortRow = page
      .locator('tr, [role="row"]')
      .filter({ hasText: '08-04-2026' })
      .first();
    await expect(amortRow).toBeVisible({ timeout: 5_000 });
    // The row's Checkbox is a <label> wrapping a visually-hidden native
    // <input>, not a <button> (Semantic Theme Contract DOM refactor), so the
    // row's only real <button> is PeriodLink itself — nth(0), not nth(1).
    await amortRow.locator('button').nth(0).click(); // PeriodLink

    // URL must change to /amortization/mock-amort-001
    await expect(page).toHaveURL(
      new RegExp(`/amortization/${AMORTIZATION_LINE.amortization}`),
      { timeout: 5_000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Accounting tab (assetAcct) — ETP-4402
// ---------------------------------------------------------------------------

/**
 * The `assetAcct` entity (A_Asset_Acct) was generated-but-unmounted until the
 * ETP-4402 fix added it to `window.secondaryTabs` (see
 * docs/generated-custom-windows/assets.md, "Fix orphaned Accounting tab").
 *
 * Unlike the other four ETP-4402 accounting entities, `accountingSchema` here
 * IS a real user-fillable field on creation (`isupdateable='N'` only blocks
 * PATCH after the row exists) — it becomes read-only once the mapping row is
 * saved, but is present in `addLineFields.entry` for a brand-new row.
 */
test.describe('Assets — Accounting tab (assetAcct)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page, {
      detail: ASSET_WITH_DEPRECIATION,
      assetAcct: [ASSET_ACCT_ROW],
    });
    await page.goto(`/assets/${ASSET_WITH_DEPRECIATION.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Add Line exposes accountingSchema as an editable field for a brand-new mapping row', async ({ page }) => {
    await page.getByTestId('tab-assetAcct').click();

    const addBtn = page.getByTestId('action-add-line');
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });

    // Unlike tax / business-partner-category / product / contacts,
    // accountingSchema IS editable here for a new row.
    await expect(page.getByTestId('inline-add-field-accountingSchema')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-accumulatedDepreciation')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-depreciation')).toBeVisible();
  });
});
