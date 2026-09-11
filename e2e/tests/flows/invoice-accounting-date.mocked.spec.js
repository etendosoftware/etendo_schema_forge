import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Invoice — Accounting Date independent from Invoice Date (ETP-5273, mocked).
 *
 * Scope: `sales-invoice` and `purchase-invoice` ONLY — the final scope of
 * ETP-5273 after the 2026-09-11 reduction (see
 * docs/plans/2026-09-11-etp-5273-fecha-contable-independiente-plan.md §2.3).
 * Orders and goods receipt/shipment were reverted back to `system` and are
 * out of scope for this suite.
 *
 * `accountingDate` (AD column `DateAcct`) is now an independent, editable
 * field (`decisions.json`: visibility "editable", section "principal",
 * seq 35), distinct from `invoiceDate` (AD column `DateInvoiced`). Both
 * fields render through the shared `DateField` component
 * (`tools/app-shell/src/components/ui/date-field.jsx`), a masked text input
 * — `data-testid="field-{key}"` sits directly on the `<input>`, so
 * `page.getByTestId(...)` resolves straight to the control (no chip
 * indirection, unlike FK selectors).
 *
 * Cases covered (plan §6, trazabilidad CP-1 → CP-5):
 *   - CP-1: changing Invoice Date updates Accounting Date automatically.
 *   - CP-2: changing Accounting Date does NOT change Invoice Date.
 *   - CP-3: confirmed and not-posted invoice keeps Accounting Date editable.
 *   - CP-4: posted invoice locks Accounting Date read-only.
 *   - CP-5: un-posting the invoice makes Accounting Date editable again.
 *   - CA: creating a new invoice defaults Accounting Date to the same value
 *     as Invoice Date.
 *   - Bug-fix regression (plan §6.2): after a manual edit to Accounting
 *     Date, changing Invoice Date again must NOT get "stuck" at the
 *     manually-edited value — `isDocumentDateCascadeTarget`
 *     (detailViewHelpers.jsx) exempts `accountingDate` from the normal
 *     user-touched protection specifically because classic Etendo
 *     re-applies the document-date -> accounting-date callout on every
 *     change of the document date, even after a manual edit.
 *
 * Mechanism under test (client-side only, mocked backend):
 *   - `accountingDate`'s readOnlyLogic is `@Posted@='Y'` ->
 *     `record['posted'] === true` (contract.json). `posted` is a real
 *     `type: boolean` NEO field, so the mock MUST send a JS boolean
 *     (`true`/`false`), never the legacy `'Y'/'N'` string some older
 *     fixtures in this suite use for fields whose readOnlyLogic checks a
 *     different column.
 *   - CP-1/CP-2 exercise the callout roundtrip: `DateField`'s onChange
 *     commits on blur (typed input) and fires `executeCallout` (debounced
 *     300ms, POST `.../header/callout` with `{ field, value, formState }`).
 *     The mock's callout handler mirrors the real classic-callout behavior
 *     documented in `isDocumentDateCascadeTarget`'s javadoc-style comment:
 *     `SifInvoiceOperationDateCallout` (registered on `invoiceDate`) copies
 *     the new value into `accountingDate`; `SE_Invoice_TaxDate` (registered
 *     on `accountingDate`) never touches `invoiceDate`.
 *
 * Routing note: login() installs a catch-all for /sws/**, so all mocks here
 * are registered AFTER login() so they take precedence (Playwright matches
 * routes in reverse registration order).
 */

const SPECS = ['sales-invoice', 'purchase-invoice'];

// es_ES is the app's default locale (useLocaleState.js DEFAULT_LOCALE), which
// gives DateField a day-first dd/mm/yyyy mask (getDatePattern). Pinned
// explicitly (not just relied upon) so this spec does not silently start
// parsing dates wrong if the default ever changes — same defensive pattern
// as date-defaults-tolerance.mocked.spec.js.
function pinLocale(page) {
  return page.addInitScript(() => {
    localStorage.setItem('schema-forge-locale', 'es_ES');
  });
}

function isoToEsDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function baseInvoice(spec, overrides = {}) {
  return {
    id: `${spec}-acct-date-001`,
    documentNo: `DOC-${spec}`,
    orderReference: `REF-${spec}`,
    invoiceDate: '2026-05-01',
    accountingDate: '2026-05-01',
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Partner',
    partnerAddress: 'addr-001',
    'partnerAddress$_identifier': 'Calle Test 1',
    paymentMethod: 'pm-001',
    'paymentMethod$_identifier': 'Efectivo',
    paymentTerms: 'pt-001',
    'paymentTerms$_identifier': '30 Días',
    priceList: 'pl-001',
    'priceList$_identifier': 'Tarifa principal',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    documentAction: 'CO',
    processed: false,
    posted: false,
    grandTotalAmount: 100,
    summedLineAmount: 100,
    outstandingAmount: 100,
    ...overrides,
  };
}

/**
 * Installs the minimal set of routes needed to open an EXISTING invoice's
 * detail view: header GET, an empty lines list (so the form renders
 * cleanly), and evaluate-display -> {} (so client-side readOnlyLogic drives
 * the UI instead of a server-evaluated map — same pattern as
 * purchase-invoice-readonly-processed.mocked.spec.js).
 *
 * `calloutHandler(body)` is optional: when given, it backs
 * `.../header/callout` POSTs. Returning `undefined` from it falls back to an
 * empty `{ updates: {}, combos: {}, messages: [] }` response.
 */
async function installDetailMocks(page, spec, invoice, { calloutHandler } = {}) {
  await page.route(`**/sws/neo/${spec}/header/${invoice.id}{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [invoice] } }),
    });
  });

  await page.route(`**/sws/neo/${spec}/lines{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  await page.route(`**/sws/neo/${spec}/evaluate-display{/**,}**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.route(`**/sws/neo/${spec}/header/callout`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() ?? {};
    const resp = calloutHandler?.(body) ?? { updates: {}, combos: {}, messages: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) });
  });
}

async function openInvoice(page, spec, id) {
  await page.goto(`/${spec}/${id}`);
  await expect(page.getByTestId('field-accountingDate')).toBeVisible({ timeout: 10_000 });
}

/**
 * Types a locale-formatted date into a DateField's masked input and commits
 * it on blur (DateField only calls onChange on blur/Enter/calendar-click for
 * typed input — see date-field.jsx's commitTypedValue). Tab is used (not
 * `.blur()`) to exercise the same code path a real user triggers.
 */
async function setDateField(page, testId, iso) {
  const field = page.getByTestId(testId);
  await field.click();
  await field.fill(isoToEsDisplay(iso));
  await field.press('Tab');
}

/**
 * Classic-callout mirror for the document-date -> accounting-date cascade
 * (see isDocumentDateCascadeTarget in detailViewHelpers.jsx): only the
 * invoiceDate trigger copies its value into accountingDate. A callout
 * triggered BY accountingDate itself (SE_Invoice_TaxDate) never touches
 * invoiceDate, so it always answers empty here (CP-2's contract).
 */
function mirrorInvoiceDateCallout(body) {
  if (body.field === 'invoiceDate') {
    return { updates: { accountingDate: { value: body.value } }, combos: {}, messages: [] };
  }
  return { updates: {}, combos: {}, messages: [] };
}

for (const spec of SPECS) {
  test.describe(`Invoice Accounting Date — ${spec} (ETP-5273)`, () => {
    test.beforeEach(async ({ page }) => {
      await pinLocale(page);
    });

    test('CP-1: changing Invoice Date updates Accounting Date automatically', async ({ page }) => {
      const invoice = baseInvoice(spec);
      await login(page);
      await installDetailMocks(page, spec, invoice, { calloutHandler: mirrorInvoiceDateCallout });
      await openInvoice(page, spec, invoice.id);

      await setDateField(page, 'field-invoiceDate', '2026-06-20');
      await expect(page.getByTestId('field-accountingDate')).toHaveValue('20/06/2026', { timeout: 5_000 });
    });

    test('CP-2: changing Accounting Date does NOT change Invoice Date', async ({ page }) => {
      const invoice = baseInvoice(spec);
      await login(page);
      await installDetailMocks(page, spec, invoice, { calloutHandler: mirrorInvoiceDateCallout });
      await openInvoice(page, spec, invoice.id);

      const invoiceDateBefore = await page.getByTestId('field-invoiceDate').inputValue();

      await setDateField(page, 'field-accountingDate', '2026-06-25');
      await expect(page.getByTestId('field-accountingDate')).toHaveValue('25/06/2026', { timeout: 5_000 });

      // Give any (unexpected) debounced callout time to land before asserting
      // the negative — the debounce is 300ms, so 800ms is a comfortable margin.
      await page.waitForTimeout(800);
      await expect(page.getByTestId('field-invoiceDate')).toHaveValue(invoiceDateBefore);
    });

    test('CP-3: confirmed and not-posted invoice keeps Accounting Date editable', async ({ page }) => {
      const invoice = baseInvoice(spec, {
        documentStatus: 'CO',
        'documentStatus$_identifier': 'Completado',
        documentAction: '--',
        processed: true,
        posted: false,
      });
      await login(page);
      await installDetailMocks(page, spec, invoice);
      await openInvoice(page, spec, invoice.id);

      await expect(page.getByTestId('field-accountingDate')).toBeEnabled({ timeout: 5_000 });
    });

    test('CP-4: posted invoice locks Accounting Date read-only', async ({ page }) => {
      const invoice = baseInvoice(spec, {
        documentStatus: 'CO',
        'documentStatus$_identifier': 'Completado',
        documentAction: '--',
        processed: true,
        posted: true,
      });
      await login(page);
      await installDetailMocks(page, spec, invoice);
      await openInvoice(page, spec, invoice.id);

      await expect(page.getByTestId('field-accountingDate')).toBeDisabled({ timeout: 5_000 });
    });

    test('CP-5: un-posting the invoice makes Accounting Date editable again', async ({ page }) => {
      // Distinct id/label from CP-4 to make the lifecycle explicit in test
      // output — the invoice "was posted, and got un-posted" — even though
      // the readOnlyLogic itself (`record['posted'] === true`) only reacts to
      // the CURRENT value of `posted`, with no memory of history. That is by
      // design (plan §4.8): "Posted" flipping back to false is exactly what
      // un-posting looks like from the frontend's point of view.
      const invoice = baseInvoice(spec, {
        id: `${spec}-acct-date-unposted-001`,
        documentStatus: 'CO',
        'documentStatus$_identifier': 'Completado',
        documentAction: '--',
        processed: true,
        posted: false,
      });
      await login(page);
      await installDetailMocks(page, spec, invoice);
      await openInvoice(page, spec, invoice.id);

      await expect(page.getByTestId('field-accountingDate')).toBeEnabled({ timeout: 5_000 });
    });

    test('bug-fix regression: Accounting Date does not get stuck at a manual edit when Invoice Date changes again', async ({ page }) => {
      const invoice = baseInvoice(spec);
      await login(page);
      await installDetailMocks(page, spec, invoice, { calloutHandler: mirrorInvoiceDateCallout });
      await openInvoice(page, spec, invoice.id);

      // 1. Change Invoice Date -> Accounting Date follows (CP-1 behavior).
      await setDateField(page, 'field-invoiceDate', '2026-07-01');
      await expect(page.getByTestId('field-accountingDate')).toHaveValue('01/07/2026', { timeout: 5_000 });

      // 2. Manually edit Accounting Date to a DIFFERENT value. Without the
      // isDocumentDateCascadeTarget exemption, this would mark accountingDate
      // as user-touched and permanently block any future collateral update.
      await setDateField(page, 'field-accountingDate', '2026-07-15');
      await expect(page.getByTestId('field-accountingDate')).toHaveValue('15/07/2026', { timeout: 5_000 });

      // 3. Change Invoice Date again -> Accounting Date must follow AGAIN,
      // not stay stuck at the manually-edited 15/07/2026. This is the exact
      // regression the fix in detailViewHelpers.jsx guards against.
      await setDateField(page, 'field-invoiceDate', '2026-07-20');
      await expect(page.getByTestId('field-accountingDate')).toHaveValue('20/07/2026', { timeout: 5_000 });
    });

    test('CA: creating a new invoice defaults Accounting Date to the same value as Invoice Date', async ({ page }) => {
      await login(page);

      await page.route(`**/sws/neo/${spec}/header/defaults{/**,}**`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ defaults: { invoiceDate: '2026-08-10', accountingDate: '2026-08-10' } }),
        });
      });
      await page.route(`**/sws/neo/${spec}/lines{/**,}**`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
      });
      await page.route(`**/sws/neo/${spec}/evaluate-display{/**,}**`, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      });

      await page.goto(`/${spec}/new`);
      // Cold dev server may still be compiling this window's chunk — 20s
      // margin, same as date-defaults-tolerance.mocked.spec.js.
      await expect(page.getByTestId('field-invoiceDate')).toBeVisible({ timeout: 20_000 });

      const invoiceDateValue = await page.getByTestId('field-invoiceDate').inputValue();
      const accountingDateValue = await page.getByTestId('field-accountingDate').inputValue();

      expect(accountingDateValue).toBe(invoiceDateValue);
      expect(accountingDateValue).toBe('10/08/2026');
    });
  });
}
