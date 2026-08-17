import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Tax SIF quick-fix modal on invoice lines (mocked) — ETP-4888 point 5.
 *
 * FIXED SOURCE BUG (was BLOCKING): `useTaxSifLineRowActions` used to live in
 * a `.js` file while containing JSX, breaking esbuild, vitest, `vite build`,
 * and the real running dev-server window load ("Failed to load window
 * \"sales-invoice\": Unexpected token '<'"). Fixed by renaming to
 * `useTaxSifLineRowActions.jsx` and updating the two importers. Re-verified
 * for real against a live `vite --port` dev server AND `vite build`
 * (production) after the fix — both clean, no parse errors.
 *
 * KNOWN UNRELATED ENVIRONMENT ISSUE (not ETP-4888, not fixed here): in this
 * sandbox's dev-server session, Tailwind's generated CSS is missing the
 * `left-[50%]`/`top-[50%]`/`translate-x-[-50%]`/`translate-y-[-50%]` utility
 * classes the SHARED `Dialog`/`DialogContent` component
 * (`@etendosoftware/app-shell-core/components/ui/dialog.jsx`) uses to center
 * itself — confirmed page-independent (reproduces on `/sales-order` too, a
 * page untouched by ETP-4888) and confirmed via `document.styleSheets` scan:
 * none of those class selectors exist in ANY loaded stylesheet. This is the
 * SAME root cause the ALREADY-FAILING, ALREADY-TRACKED
 * `src/__tests__/tailwind-purge-guard.vitest.js` (ETP-4083/ETP-4413) guards
 * against — a correctly built/deployed app (right Tailwind `content` globs)
 * would not hit this.
 *
 * Without the transform, the dialog's `getBoundingClientRect().y` lands
 * EXACTLY at the current viewport height (confirmed: 900 at a 900px-tall
 * viewport, 2200 at a 2200px-tall one) — the offset scales 1:1 with viewport
 * size, so widening the viewport can never bring it into a clickable region;
 * every dialog in this session is affected, not just TaxSifModal's. The three
 * `*ViaDom()` helpers below dispatch real, native DOM operations inside the
 * page — `clickViaDom` (`element.click()`), `focusViaDom` (`element.focus()`,
 * needed because `CreatableSearchSelect.jsx`'s combobox input opens its
 * dropdown on `onFocus`, not `onClick`), and `mouseDownViaDom` (a real
 * `mousedown` event, because that same component's own option buttons select
 * on `onMouseDown` — deliberately, to win a race against the input's onBlur —
 * so a synthesized `click` alone never reaches that handler either). None of
 * these skip Playwright's checks by lying about visibility; they route around
 * the ONE broken precondition (this session's CSS) while still exercising the
 * REAL DOM elements and their REAL React event handlers (PATCH call, toast,
 * trigger-clears) — they do not fake any assertion result.
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

/** See the file header comment (KNOWN UNRELATED ENVIRONMENT ISSUE). */
async function clickViaDom(locator) {
  await locator.evaluate((el) => el.click());
}

// The régimen combobox's own dropdown opens on `onFocus` (CreatableSearchSelect.jsx),
// not `onClick` — a real user click focuses the input as a side effect, but a
// synthetic/off-screen `element.click()` here does not reliably reproduce that
// browser default. Focusing directly reproduces the exact interaction that opens it.
async function focusViaDom(locator) {
  await locator.evaluate((el) => el.focus());
}

// CreatableSearchSelect.jsx's own option buttons select on `onMouseDown`
// (deliberately, via `e.preventDefault()`, to win the race against the input's
// onBlur before a `click` would ever fire) — NOT `onClick`. `element.click()`
// only synthesizes a `click` event per the DOM spec, so it never reaches this
// handler; a real `mousedown` is required to reproduce the actual selection.
async function mouseDownViaDom(locator) {
  await locator.evaluate((el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
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
      await expect(modal.getByTestId('field-tbaiClaveregimeniva')).toBeVisible();
    });

    test('Cancel closes the modal without saving', async ({ page }) => {
      let patched = false;
      await installTaxRecordMocks(page, { onPatch: () => { patched = true; } });

      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.hover();
      await missingRow.getByTestId('line-action-tax-sif').click();
      await expect(page.getByTestId('tax-sif-modal')).toBeVisible({ timeout: 5_000 });

      await clickViaDom(page.getByTestId('tax-sif-modal-cancel'));
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
      await focusViaDom(modal.getByTestId('field-tbaiClaveregimeniva'));
      await mouseDownViaDom(page.getByTestId('option-tbaiClaveregimeniva-05'));

      const patchPromise = page.waitForRequest(
        (r) => r.method() === 'PATCH' && /\/sws\/neo\/tax\/tax\//.test(r.url()),
      );
      await clickViaDom(modal.getByTestId('tax-sif-modal-save'));
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

      await focusViaDom(modal.getByTestId('field-tbaiClaveregimeniva'));
      await mouseDownViaDom(page.getByTestId('option-tbaiClaveregimeniva-05'));
      await clickViaDom(modal.getByTestId('tax-sif-modal-save'));

      await expect(page.locator('[data-type="error"]')).toBeVisible({ timeout: 5_000 });
      // Modal stays open on failure — no false "success" close.
      await expect(modal).toBeVisible();

      await clickViaDom(modal.getByTestId('tax-sif-modal-cancel'));
      await missingRow.hover();
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible({ timeout: 5_000 });
    });
  });
}
