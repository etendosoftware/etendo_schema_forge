import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Tax SIF quick-fix modal on invoice lines (mocked) — ETP-4888 point 5.
 *
 * Updated for the post-original churn this feature went through:
 *   - 2 selector-context bugfixes: `useTaxSifLineRowActions` now fetches the invoice
 *     header record (`GET {spec}/header/{recordId}`) BEFORE the tax selector, to build
 *     the same `parentId`/`isSOTrx`/`priceList`/`DateInvoiced`/`C_BPartner_Location_ID`/
 *     `currency` context params `InlineSearchCombo` sends when a user opens the tax
 *     field's own search combo — the tax selector endpoint fails CLOSED (empty catalog)
 *     without them.
 *   - Design-polish round (commit df238c9f3): the trigger moved from the generic hover
 *     `rowActions` strip to a `cellBadges.tax` badge rendered INLINE next to the tax
 *     cell's own value — no hover needed to see it, and it survives entering/leaving
 *     edit mode. The modal itself was rewritten from an EntityForm-driven form to a
 *     bespoke layout: each field is a labeled `EnumSearchSelect` (`tax-sif-modal-field-
 *     <key>`, with `-input`/`-option-<value>`/`-chip` sub-parts), not the old generic
 *     `field-<key>` EntityForm testid.
 *   - Pagination fix (commit 556d032c8): `loadTaxCatalog()` now pages through
 *     `offset`/`hasMore` instead of trusting a single request. The mock below always
 *     serves `hasMore: false` (single-page catalog) — pagination itself is covered at
 *     the unit level (`useTaxSifLineRowActions.vitest.jsx`), not duplicated here.
 *
 * FIXED SOURCE BUG (was BLOCKING, historical): `useTaxSifLineRowActions` used to live
 * in a `.js` file while containing JSX, breaking esbuild, vitest, `vite build`, and the
 * real running dev-server window load. Fixed by renaming to
 * `useTaxSifLineRowActions.jsx` and updating the two importers. Re-verified for real
 * against a live `vite --port` dev server (no VITE_MOCK, per docs/e2e-testing-guide.md's
 * "Gotcha: VITE_MOCK=true silently bypasses page.route() mocks") AND `vite build`
 * (production) — both clean, no parse errors.
 *
 * Route pattern note: per docs/e2e-testing-guide.md's glob-matching gotcha, `header`/
 * `lines` routes below register the TWO-route form (`.../header/**` for any sub-path,
 * `.../header**` for the bare/query-string case) instead of the brace-alternation form
 * `{/**,}` an earlier version of this spec used — the brace form silently degrades for
 * multi-segment sub-paths and is no longer recommended even where it happens to still
 * match (single-segment `/header/{id}`).
 *
 * Mock mode only: mocks the fiscal-config selectors (so `useFiscalConfig` resolves the
 * `tbai` profile), the invoice header/lines list+detail GETs, the enriched tax selector
 * (`{spec}/lines/selectors/C_Tax_ID`) that `useTaxSifLineRowActions` fetches, and the
 * `PATCH /sws/neo/tax/tax/{id}` `TaxSifModal` saves through.
 */

const SPECS = ['sales-invoice', 'purchase-invoice'];

// A tax record still missing its TBAI régimen key (EM_Tbai_Claveregimeniva is
// null) — this is the one the inline badge must surface.
const TAX_MISSING_ID = 'tax-missing-1';
// A fully-configured tax (régimen already set) — the badge must NOT show for
// the line using this one.
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
  const handler = async (route) => {
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
  };
  // Two-route form (docs/e2e-testing-guide.md) — `/header/**` covers any sub-path
  // (the `/header/{recordId}` GET useTaxSifLineRowActions.jsx itself fetches, plus
  // the detail-view's own header GET), `/header**` covers the bare list GET.
  await page.route(`**/sws/neo/${spec}/header/**`, handler);
  await page.route(`**/sws/neo/${spec}/header**`, handler);
}

/** Lines list GET (two lines: one missing SIF config, one already configured). */
async function installLinesMocks(page, spec) {
  const handler = async (route) => {
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
  };
  await page.route(`**/sws/neo/${spec}/lines/**`, handler);
  await page.route(`**/sws/neo/${spec}/lines**`, handler);
}

/**
 * The enriched tax selector `useTaxSifLineRowActions` fetches, paging via
 * `offset`/`limit` (556d032c8). Always serves the full catalog in one page
 * (`hasMore: false`) — the pagination LOOP itself (multi-page, safety cap) is
 * covered at the unit level (useTaxSifLineRowActions.vitest.jsx), not here.
 */
async function installTaxSelectorMock(page, spec) {
  await page.route(`**/sws/neo/${spec}/lines/selectors/C_Tax_ID**`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ items: TAX_SELECTOR_ITEMS, hasMore: false }),
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

/**
 * See the file header comment (KNOWN UNRELATED ENVIRONMENT ISSUE, sif-exemption-cause
 * .mocked.spec.js shares the same root cause): this sandbox's dev-server session is
 * missing Tailwind's generated `left-[50%]`/`top-[50%]`/`translate-x-[-50%]`/
 * `translate-y-[-50%]` utility classes the shared `Dialog`/`DialogContent` component
 * uses to center itself, so the dialog renders off-screen for Playwright's own
 * actionability checks (visibility). `clickViaDom`/`focusViaDom` dispatch real native
 * DOM operations directly on the element, sidestepping the ONE broken precondition
 * (this session's CSS) while still exercising the real DOM elements and their real
 * React event handlers (PATCH call, toast, badge-clears) — they do not fake any
 * assertion result. EnumSearchSelect's own option buttons select on a plain `onClick`
 * (not `onMouseDown`, unlike the pre-redesign CreatableSearchSelect-based combobox this
 * spec used to interact with here), so `clickViaDom` alone is sufficient to pick an
 * option — no separate mousedown-race workaround is needed anymore.
 */
async function clickViaDom(locator) {
  await locator.evaluate((el) => el.click());
}

// EnumSearchSelect's own dropdown opens on `onFocus`, not `onClick` — a real user click
// focuses the input as a side effect, but a synthetic/off-screen `element.click()` here
// does not reliably reproduce that browser default. Focusing directly reproduces the
// exact interaction that opens it.
async function focusViaDom(locator) {
  await locator.evaluate((el) => el.focus());
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

    test('the tax-SIF badge shows ONLY on the line whose tax is missing configuration — visible WITHOUT hovering', async ({ page }) => {
      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      const configuredRow = page.getByTestId(`line-row-${LINE_CONFIGURED.id}`);
      await expect(missingRow).toBeVisible({ timeout: 10_000 });

      // No .hover() here — the design-polish round moved the trigger out of the
      // hover-only rowActions strip into an always-visible cellBadges.tax badge.
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible({ timeout: 5_000 });
      await expect(configuredRow.getByTestId('line-action-tax-sif')).toHaveCount(0);
    });

    test('the badge stays visible after hovering a DIFFERENT row (not a hover-only affordance)', async ({ page }) => {
      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      const configuredRow = page.getByTestId(`line-row-${LINE_CONFIGURED.id}`);
      await expect(missingRow).toBeVisible({ timeout: 10_000 });
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible({ timeout: 5_000 });

      await configuredRow.hover();
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible();
      await expect(configuredRow.getByTestId('line-action-tax-sif')).toHaveCount(0);
    });

    test('clicking the badge opens the modal with the tax name and the régimen field (EnumSearchSelect)', async ({ page }) => {
      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await expect(missingRow).toBeVisible({ timeout: 10_000 });
      await missingRow.getByTestId('line-action-tax-sif').click();

      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(modal).toContainText('IVA 21% (sin configurar)');
      await expect(modal.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeVisible();
    });

    test('Cancel closes the modal without saving', async ({ page }) => {
      let patched = false;
      await installTaxRecordMocks(page, { onPatch: () => { patched = true; } });

      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.getByTestId('line-action-tax-sif').click();
      await expect(page.getByTestId('tax-sif-modal')).toBeVisible({ timeout: 5_000 });

      await clickViaDom(page.getByTestId('tax-sif-modal-cancel'));
      await expect(page.getByTestId('tax-sif-modal')).toBeHidden();
      expect(patched).toBe(false);
    });

    test('Save stays disabled until a régimen is actually picked', async ({ page }) => {
      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.getByTestId('line-action-tax-sif').click();
      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await expect(modal.getByTestId('tax-sif-modal-save')).toBeDisabled();

      await focusViaDom(modal.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-input'));
      await clickViaDom(page.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-option-05'));

      await expect(modal.getByTestId('tax-sif-modal-save')).toBeEnabled();
    });

    test('picking a régimen and saving PATCHes the tax record, toasts success, and the badge disappears from the row (no reload)', async ({ page }) => {
      let patchBody = null;
      await installTaxRecordMocks(page, {
        onPatch: (req) => { try { patchBody = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ } },
      });

      const missingRow = page.getByTestId(`line-row-${LINE_MISSING.id}`);
      await missingRow.getByTestId('line-action-tax-sif').click();
      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Pick a régimen value via the static EnumSearchSelect field.
      await focusViaDom(modal.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-input'));
      await clickViaDom(page.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-option-05'));

      const patchPromise = page.waitForRequest(
        (r) => r.method() === 'PATCH' && /\/sws\/neo\/tax\/tax\//.test(r.url()),
      );
      await clickViaDom(modal.getByTestId('tax-sif-modal-save'));
      await patchPromise;

      await expect(modal).toBeHidden({ timeout: 5_000 });
      await expect(page.locator('[data-type="success"]')).toBeVisible({ timeout: 5_000 });
      expect(patchBody).toMatchObject({ tbaiClaveregimeniva: '05' });

      // The badge must be gone from the row WITHOUT a page reload/refetch —
      // useTaxSifLineRowActions merges the saved tax locally into its own
      // completeness map (onSaved), it does not re-fetch the tax selector.
      await expect(missingRow.getByTestId('line-action-tax-sif')).toHaveCount(0);
    });

    test('save failure (PATCH 500): error toast shown, modal stays open, badge still shows afterwards', async ({ page }) => {
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
      await missingRow.getByTestId('line-action-tax-sif').click();
      const modal = page.getByTestId('tax-sif-modal');
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await focusViaDom(modal.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-input'));
      await clickViaDom(page.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-option-05'));
      await clickViaDom(modal.getByTestId('tax-sif-modal-save'));

      await expect(page.locator('[data-type="error"]')).toBeVisible({ timeout: 5_000 });
      // Modal stays open on failure — no false "success" close.
      await expect(modal).toBeVisible();

      await clickViaDom(modal.getByTestId('tax-sif-modal-cancel'));
      await expect(missingRow.getByTestId('line-action-tax-sif')).toBeVisible({ timeout: 5_000 });
    });
  });
}
