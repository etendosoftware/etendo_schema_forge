import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Tax SIF quick-fix modal on invoice lines (mocked) — ETP-4888 point 5.
 *
 * ============================================================================
 * BLOCKED — cannot currently run (source bug, not a test bug). Do not remove
 * this banner until the underlying bug is fixed and this has been verified
 * green.
 * ============================================================================
 * `tools/app-shell/src/windows/custom/shared/useTaxSifLineRowActions.js`
 * contains JSX (a `<TaxSifModal .../>` element) but has a plain `.js`
 * extension instead of `.jsx`. Confirmed FOUR independent ways during test
 * authoring:
 *   1. `npx esbuild useTaxSifLineRowActions.js` -> "The JSX syntax extension
 *      is not currently enabled" (esbuild's default loader for `.js` does not
 *      parse JSX).
 *   2. `npx vitest run` on any spec importing this module -> Rollup parse
 *      error at the exact `<TaxSifModal` line (SSR transform pipeline).
 *   3. `npx vite build` (production) -> hard build failure: "Build failed",
 *      Rollup "Expression expected" at the same line — this is NOT just a
 *      dev/test inconvenience, it breaks the deployable production bundle.
 *   4. THE SMOKING GUN, found running THIS spec against a live `vite` dev
 *      server: navigating to `/sales-invoice/inv-1` in a real browser renders
 *      the app shell's own error boundary: `Failed to load window
 *      "sales-invoice": Unexpected token '<'`. The window fails to load in
 *      the actual running application, not just in tooling — confirmed via
 *      Playwright's page snapshot while debugging this exact spec.
 * `npx vite --port <n>` (plain dev server, no VITE_MOCK) starts and its
 * cold-start dependency PRE-BUNDLING scan logs the same parse error, but
 * still serves `GET` requests for many individual modules (Vite's per-request
 * Babel transform via `@vitejs/plugin-react` handles `.js`+JSX fine on
 * demand) — which is what makes finding #4 initially counter-intuitive: some
 * plain module requests for this exact file returned 200 with correctly
 * transformed JS, yet the real in-browser window bundle still fails at
 * runtime with a raw un-transpiled `<` token. Do not read the isolated 200s
 * as "it actually works" — the end-to-end browser navigation is what matters,
 * and it is broken. The PRODUCTION BUILD (`vite build`) fails outright either
 * way.
 *
 * Net effect: sales-invoice and purchase-invoice are BOTH completely broken
 * in the running app for as long as this bug ships — not just this ETP-4888
 * feature. This spec cannot pass, and no Playwright spec for EITHER window
 * can pass, until the extension is fixed.
 *
 * Fix (not applied here — test-writer mandate is report, not fix): rename the
 * file to `useTaxSifLineRowActions.jsx` (update the two importers,
 * `sales-invoice/index.jsx` and `purchase-invoice/index.jsx`, and this spec's
 * own mental model needs no change — imports use the extensionless specifier
 * already visible in the two window files).
 *
 * This spec is written and ready to validate the real user-facing flow (line
 * hover -> trigger -> modal -> save -> trigger disappears) across BOTH
 * sales-invoice and purchase-invoice the moment the extension bug is fixed.
 * Do not attempt to "fix" the import graph from within this file (e.g. by
 * only testing a copy) — that would validate code that isn't what ships.
 *
 * Mock mode only: mocks the fiscal-config selectors (so `useFiscalConfig`
 * resolves the `tbai` profile), the invoice header/lines list+detail GETs,
 * the enriched tax selector (`{spec}/lines/selectors/C_Tax_ID`) that
 * `useTaxSifLineRowActions` fetches, and the `PATCH /sws/neo/tax/tax/{id}`
 * `TaxSifModal` saves through.
 */

const SPECS = ['sales-invoice', 'purchase-invoice'];

// A tax record still missing its TBAI régimen key (EM_Tbai_Claveregimeniva is
// null) — this is the one the row-hover trigger must surface.
const TAX_MISSING_ID = 'tax-missing-1';
// A fully-configured tax (régimen already set) — the trigger must NOT show
// for the line using this one.
const TAX_CONFIGURED_ID = 'tax-configured-1';

const TAX_SELECTOR_ITEMS = [
  {
    id: TAX_MISSING_ID,
    name: 'IVA 21% (sin configurar)',
    _identifier: 'IVA 21% (sin configurar)',
    taxExempt: 'N',
    notTaxable: 'N',
    EM_Tbai_Claveregimeniva: null,
  },
  {
    id: TAX_CONFIGURED_ID,
    name: 'IVA 10% (configurado)',
    _identifier: 'IVA 10% (configurado)',
    taxExempt: 'N',
    notTaxable: 'N',
    EM_Tbai_Claveregimeniva: '01',
  },
];

const HEADER_FIELDS_BY_SPEC = {
  'sales-invoice': {
    invoiceDate: '2026-01-15',
    businessPartner: 'bp-1', 'businessPartner$_identifier': 'Test BP',
    partnerAddress: 'addr-1', 'partnerAddress$_identifier': 'Test Address',
    paymentTerms: 'pt-1', 'paymentTerms$_identifier': '30 days',
    paymentMethod: 'pm-1', 'paymentMethod$_identifier': 'Transfer',
    grandTotalAmount: 100, summedLineAmount: 100,
    currency: 'EUR', 'currency$_identifier': 'EUR',
    priceList: 'pl-1', 'priceList$_identifier': 'Sales',
    transactionDocument: 'td-1', 'transactionDocument$_identifier': 'AR Invoice',
    documentNo: 'INV-001',
  },
  'purchase-invoice': {
    invoiceDate: '2026-01-15',
    businessPartner: 'bp-1', 'businessPartner$_identifier': 'Test BP',
    partnerAddress: 'addr-1', 'partnerAddress$_identifier': 'Test Address',
    paymentTerms: 'pt-1', 'paymentTerms$_identifier': '30 days',
    paymentMethod: 'pm-1', 'paymentMethod$_identifier': 'Transfer',
    currency: 'EUR', 'currency$_identifier': 'EUR',
    priceList: 'pl-1', 'priceList$_identifier': 'Purchase',
    transactionDocument: 'td-1', 'transactionDocument$_identifier': 'AP Invoice',
    orderReference: 'PINV-001',
  },
};

const LINE_MISSING = {
  id: 'line-missing', product: 'prod-1', 'product$_identifier': 'Widget',
  invoicedQuantity: 1, listPrice: 10, grossAmount: 10, 'currency$_identifier': 'EUR',
  tax: TAX_MISSING_ID, 'tax$_identifier': 'IVA 21% (sin configurar)',
};
const LINE_CONFIGURED = {
  id: 'line-configured', product: 'prod-2', 'product$_identifier': 'Gadget',
  invoicedQuantity: 1, listPrice: 20, grossAmount: 20, 'currency$_identifier': 'EUR',
  tax: TAX_CONFIGURED_ID, 'tax$_identifier': 'IVA 10% (configurado)',
};

/** Fiscal config: tbai-config returns a record (-> profile 'tbai'); sii/verifactu empty. */
async function installFiscalConfigMocks(page) {
  await page.route('**/sws/neo/tbai-config/**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ id: 'tbai-cfg-1' }] } }),
    });
  });
  for (const emptyCfg of ['sii-config', 'verifactu-config']) {
    await page.route(`**/sws/neo/${emptyCfg}/**`, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
    });
  }
}

/** Header list+detail GET for a single fully-populated invoice. */
async function installHeaderMocks(page, spec) {
  const row = { id: 'inv-1', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', ...HEADER_FIELDS_BY_SPEC[spec] };
  await page.route(`**/sws/neo/${spec}/header{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/selectors/')) return route.fallback();
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [row], totalRows: 1 } }),
      });
    }
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [row] } }),
      });
    }
    return route.fallback();
  });
}

/** Lines list GET (two lines: one missing SIF config, one already configured). */
async function installLinesMocks(page, spec) {
  await page.route(`**/sws/neo/${spec}/lines{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/selectors/')) return route.fallback();
    if (req.method() === 'GET' && !/\/lines\/[^/?]+/.test(url)) {
      const rows = [LINE_MISSING, LINE_CONFIGURED];
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
    }
    return route.fallback();
  });
}

/** The enriched tax selector `useTaxSifLineRowActions` fetches once per invoice. */
async function installTaxSelectorMock(page, spec) {
  await page.route(`**/sws/neo/${spec}/lines/selectors/C_Tax_ID**`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: TAX_SELECTOR_ITEMS }),
    });
  });
}

/** GET/PATCH the tax record itself (TaxSifModal's fetchById/patchById target). */
async function installTaxRecordMocks(page, { onPatch } = {}) {
  await page.route('**/sws/neo/tax/tax/**', async (route) => {
    const req = route.request();
    const id = req.url().split('/').pop();
    if (req.method() === 'GET') {
      const item = TAX_SELECTOR_ITEMS.find((t) => t.id === id);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...item }] } }),
      });
    }
    if (req.method() === 'PATCH') {
      if (onPatch) onPatch(req);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id }] } }),
      });
    }
    return route.fallback();
  });
}

for (const spec of SPECS) {
  test.describe(`Tax SIF quick-fix modal — ${spec}`, () => {
    test.beforeEach(async ({ page }) => {
      // useFiscalConfig is keyed by the active org — seed one before login()'s own
      // init script (same ordering sif-exemption-cause.mocked.spec.js relies on).
      await page.addInitScript(() => {
        localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: 'e2e-org-1', name: 'E2E Org' }));
      });
      await login(page);
      await installFiscalConfigMocks(page);
      await installHeaderMocks(page, spec);
      await installLinesMocks(page, spec);
      await installTaxSelectorMock(page, spec);
      await installTaxRecordMocks(page);

      await page.goto(`/${spec}/inv-1`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const linesTab = page.getByTestId('tab-lines');
      if (await linesTab.count()) await linesTab.click();
    });

    test('hover reveals the tax-SIF trigger ONLY on the line whose tax is missing configuration', async ({ page }) => {
      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      const configuredRow = page.getByTestId(`line-row-${LINE_CONFIGURED.id}`);
      await expect(missingRow).toBeVisible({ timeout: 10_000 });

      await missingRow.hover();
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible({ timeout: 5_000 });

      await configuredRow.hover();
      await expect(configuredRow.getByTestId('line-action-tax-sif')).toHaveCount(0);
    });

    test('clicking the trigger opens the modal with the tax name and régimen field', async ({ page }) => {
      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await expect(missingRow).toBeVisible({ timeout: 10_000 });
      await missingRow.hover();
      await missingRow.getByTestId('line-action-tax-sif').click();

      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(modal).toContainText('IVA 21% (sin configurar)');
      await expect(modal.getByTestId('field-EM_Tbai_Claveregimeniva')).toBeVisible();
    });

    test('Cancel closes the modal without saving', async ({ page }) => {
      let patched = false;
      await installTaxRecordMocks(page, { onPatch: () => { patched = true; } });

      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.hover();
      await missingRow.getByTestId('line-action-tax-sif').click();
      await expect(page.getByTestId('tax-sif-modal')).toBeVisible({ timeout: 5_000 });

      await page.getByTestId('tax-sif-modal-cancel').click();
      await expect(page.getByTestId('tax-sif-modal')).toBeHidden();
      expect(patched).toBe(false);
    });

    test('picking a régimen and saving PATCHes the tax record, toasts success, and the trigger disappears from the row (no reload)', async ({ page }) => {
      let patchBody = null;
      await installTaxRecordMocks(page, {
        onPatch: (req) => { try { patchBody = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ } },
      });

      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.hover();
      await missingRow.getByTestId('line-action-tax-sif').click();
      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Pick a régimen value via the static CreatableSearchSelect field.
      await modal.getByTestId('field-EM_Tbai_Claveregimeniva').click();
      await page.getByTestId('option-EM_Tbai_Claveregimeniva-05').click();

      const patchPromise = page.waitForRequest(
        (r) => r.method() === 'PATCH' && /\/sws\/neo\/tax\/tax\//.test(r.url()),
      );
      await modal.getByTestId('tax-sif-modal-save').click();
      await patchPromise;

      await expect(modal).toBeHidden({ timeout: 5_000 });
      await expect(page.locator('[data-type="success"]')).toBeVisible({ timeout: 5_000 });
      expect(patchBody).toMatchObject({ tbaiClaveregimeniva: '05' });

      // The trigger must be gone from the row WITHOUT a page reload/refetch —
      // useTaxSifLineRowActions merges the saved tax locally into its own
      // completeness map (onSaved), it does not re-fetch the tax selector.
      await missingRow.hover();
      await expect(missingRow.getByTestId('line-action-tax-sif')).toHaveCount(0);
    });

    test('save failure (PATCH 500): error toast shown, modal stays open, trigger still shows afterwards', async ({ page }) => {
      await page.route('**/sws/neo/tax/tax/**', async (route) => {
        const req = route.request();
        if (req.method() === 'GET') {
          const id = req.url().split('/').pop();
          const item = TAX_SELECTOR_ITEMS.find((t) => t.id === id);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [{ ...item }] } }) });
        }
        if (req.method() === 'PATCH') {
          return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Invalid regime code' });
        }
        return route.fallback();
      });

      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.hover();
      await missingRow.getByTestId('line-action-tax-sif').click();
      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await modal.getByTestId('field-EM_Tbai_Claveregimeniva').click();
      await page.getByTestId('option-EM_Tbai_Claveregimeniva-05').click();
      await modal.getByTestId('tax-sif-modal-save').click();

      await expect(page.locator('[data-type="error"]')).toBeVisible({ timeout: 5_000 });
      // Modal stays open on failure — no false "success" close.
      await expect(modal).toBeVisible();

      await modal.getByTestId('tax-sif-modal-cancel').click();
      await missingRow.hover();
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible({ timeout: 5_000 });
    });
  });
}
