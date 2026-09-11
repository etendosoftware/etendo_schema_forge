import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';
import {
  responseData,
  seedSelectedOrg,
  installFiscalProfileMocks,
} from '../helpers/fiscal-config-mocks.js';

/**
 * Purchase Invoice LIST — "Estado Batuz" column (ETP-5087), mocked.
 *
 * Locks two independent contracts of
 * `windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx`:
 *
 *  A. VISIBILITY — the column is derived SYNCHRONOUSLY from
 *     `getInvoiceFiscalTargets('purchase-invoice', profile, territory)` with the
 *     profile/territory of the globally-selected org. It renders only when the
 *     profile includes TBAI **and** the TBAI territory is BIZKAIA (Batuz/LROE is
 *     the only purchase entry point — see `shared/fiscalTargets.js`). The SII
 *     column is independent: a regression that coupled the two hid SII outside
 *     Bizkaia, so the non-Bizkaia case asserts SII is STILL there.
 *
 *  B. CONTENT — `isTbaiStatusNotApplicable(row.eTGOTbaiStatus)` picks a dash;
 *     otherwise `row.eTGOTbaiStatus ?? (isSent(row.tbaiIssent) ? 'Enviada' : 'Pendiente')`.
 *     `eTGOTbaiStatus` is the real backend status — since ETP-5216, backed by the
 *     stored computed AD column `em_etgo_tbai_status` (previously the synthetic
 *     `tbaiSyncEstado` field injected server-side by the now-deleted
 *     TbaiSyncStatusInjector). It wins over the boolean flag, which is what stops
 *     a `Rechazado` from ever being read as a cheerful "Enviada". The fallback
 *     goes through `isSent()` because NEO may deliver the AD flag as the
 *     character `'N'`, which is truthy in JS — a plain truthy test reports
 *     "Enviada" for an unsent invoice.
 *
 * Locator notes:
 *  - Columns are addressed through DataTable's generic testids
 *    (`column-header-{key}` / `cell-{rowId}-{key}`), NOT through the
 *    `data-testid="FiscalStatusBadge__…"` props the codemod added on the two
 *    `<FiscalStatusBadge>` call sites: `FiscalStatusBadge` destructures only
 *    `{ status, loading }` and never spreads the rest, so those testids are
 *    dropped and never reach the DOM. Reported, not fixed here (this spec must
 *    not touch production code).
 *  - Cell text is asserted against the real i18n labels resolved by `t()` — note
 *    `Recibido` renders as "Aceptado" in es_ES, so a literal-string assertion
 *    would be wrong.
 *  - The column `key` (and therefore its DataTable testid suffix) is
 *    `eTGOTbaiStatus`, not the pre-ETP-5216 synthetic `_tbaiStatus` — this is
 *    exactly what makes the column pass `isFilterableColumn` (it now carries a
 *    real `column`), the defect this migration fixes.
 *  - The dash rows assert the literal `'—'`: the "does not apply" branch renders
 *    a plain muted span, not a `FiscalStatusBadge`, so it has no i18n key to
 *    resolve through `t()`.
 *
 * ETP-5216 also moved the ADOPTION-DATE GATE out of the cell. It used to run
 * here as `isSifEligibleByDate(row.invoiceDate, tbaiRecord?.tbaisystemdate)`
 * (ETP-5122), which was invisible to the backend — so filtering the now
 * filterable column by "Pendiente" returned rows the grid then drew as a dash —
 * and compared EVERY row against the SELECTED organization's adoption date
 * rather than the invoice's own. `ETGO_GET_TBAI_STATUS` now decides per invoice,
 * against the invoice's OWN organization, and reports it as the literal
 * `'NoAplica'`; the cell only translates that value to a dash. The cut lands
 * exactly on the adoption date and the adoption day itself is eligible
 * (`>=`, not `>`) — verified against the real DB.
 */

const SPEC = 'purchase-invoice';

const BASE_ROW = {
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  invoiceDate: '2026-05-08',
  // ETP-5122 added a date gate to the SII column (isSifEligibleByDate(row.accountingDate,
  // siiRecord?.fechaAcogidaSII)) on top of the pre-existing territory gate this spec
  // exercises. Needs to be later than the mocked siiRecord.fechaAcogidaSII below (see
  // openList()) so every row is eligible and the SII cell assertions actually run.
  accountingDate: '2026-05-08',
  businessPartner: 'BP_1',
  'businessPartner$_identifier': 'QA Supplier',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 121,
  outstandingAmount: 121,
  // Independent of TBAI — proves the SII column keeps its own value while the
  // Batuz column next to it reports something entirely different.
  aeatsiiEstado: 'CO',
};

/**
 * One row per branch of the content expression. `expected` is the genericLabels
 * key `FiscalStatusBadge` resolves for that row.
 */
const ROWS = [
  // eTGOTbaiStatus (the real stored computed AD column, ETP-5216) wins over
  // tbaiIssent — the CRITICAL case: a rejection must never be reported as
  // "Enviada", even though the invoice WAS submitted.
  { id: 'PI_REJECTED', orderReference: 'PI-REJECTED', eTGOTbaiStatus: 'Rechazado', tbaiIssent: true, expected: 'fiscalMonitor.tbai.status.Rechazado' },
  { id: 'PI_ACCEPTED', orderReference: 'PI-ACCEPTED', eTGOTbaiStatus: 'Recibido', tbaiIssent: true, expected: 'fiscalMonitor.tbai.status.Recibido' },
  { id: 'PI_ERROR', orderReference: 'PI-ERROR', eTGOTbaiStatus: 'Error', tbaiIssent: 'Y', expected: 'fiscalMonitor.tbai.status.Error' },
  // No sync row yet → fall back to the boolean flag, in both serialisations.
  { id: 'PI_SENT_BOOL', orderReference: 'PI-SENT-BOOL', tbaiIssent: true, expected: 'fiscalMonitor.tbai.status.Enviada' },
  { id: 'PI_SENT_CHAR', orderReference: 'PI-SENT-CHAR', tbaiIssent: 'Y', expected: 'fiscalMonitor.tbai.status.Enviada' },
  { id: 'PI_PENDING_BOOL', orderReference: 'PI-PENDING-BOOL', tbaiIssent: false, expected: 'fiscalMonitor.tbai.status.Pendiente' },
  // `'N'` is truthy in JS — this row is the whole reason `isSent()` exists.
  { id: 'PI_PENDING_CHAR', orderReference: 'PI-PENDING-CHAR', tbaiIssent: 'N', expected: 'fiscalMonitor.tbai.status.Pendiente' },
];

/**
 * ETP-5216 — rows the DB reports as 'NoAplica': the invoice predates its OWN
 * organization's Batuz adoption date, or that organization has no active
 * `tbai_config` row. Not pending anything, ever, so the cell draws a dash
 * instead of a badge. Kept out of ROWS because they assert a literal, not an
 * i18n-resolved status label.
 */
const NOT_APPLICABLE_ROWS = [
  { id: 'PI_NO_APLICA', orderReference: 'PI-NO-APLICA', eTGOTbaiStatus: 'NoAplica', tbaiIssent: false },
  // The flag being set changes nothing: 'NoAplica' short-circuits before the
  // `isSent(tbaiIssent)` fallback is ever consulted.
  { id: 'PI_NO_APLICA_SENT', orderReference: 'PI-NO-APLICA-SENT', eTGOTbaiStatus: 'NoAplica', tbaiIssent: true },
];

/**
 * ETP-5216 regression row — the reason the gate had to leave the browser.
 * `invoiceDate` is four years BEFORE the adoption date of the SELECTED org
 * (`tbaisystemdate: '2026-05-08'` in `installFiscalProfileMocks`), but the
 * invoice belongs to another organization that joined Batuz earlier, so the
 * backend computed a real status. The old cell-side gate hid it behind a dash.
 * `accountingDate` stays on BASE_ROW's value so the SII column — which still
 * gates in the browser — is unaffected and keeps showing its own state.
 */
const CROSS_ORG_ROW = {
  id: 'PI_OTHER_ORG',
  orderReference: 'PI-OTHER-ORG',
  invoiceDate: '2022-01-01',
  eTGOTbaiStatus: 'Recibido',
  tbaiIssent: true,
};

const LIST_ROWS = [...ROWS, ...NOT_APPLICABLE_ROWS, CROSS_ORG_ROW]
  .map(({ expected, ...row }) => ({ ...BASE_ROW, ...row, documentNo: row.orderReference }));

/**
 * Install the purchase-invoice list/detail endpoint. Two routes on purpose: a
 * pattern ending in a bare `header**` does not cross the `/` of `/header/{id}`
 * (see docs/e2e-testing-guide.md). Must run AFTER login().
 */
async function installListMock(page) {
  const handler = async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();
    const detail = url.match(/\/header\/([^/?]+)/);
    if (!detail) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: LIST_ROWS, totalRows: LIST_ROWS.length } }),
      });
    }
    const found = LIST_ROWS.find(r => r.id === detail[1]);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData(found ? [found] : []),
    });
  };
  await page.route(`**/sws/neo/${SPEC}/header/**`, handler);
  await page.route(`**/sws/neo/${SPEC}/header**`, handler);
}

async function openList(page, { profile, territory }) {
  await seedSelectedOrg(page);
  await login(page);
  await installFiscalProfileMocks(page, profile, { territory });
  // installFiscalProfileMocks()'s siiRecord (shared across specs, see
  // fiscal-config-mocks.js) has no fechaAcogidaSII, so BASE_ROW.accountingDate
  // above would never satisfy the ETP-5122 SII date gate without this override.
  // Registered AFTER installFiscalProfileMocks — Playwright matches routes in
  // reverse registration order, so this wins over the shared one — with a date
  // earlier than every row's accountingDate, so this spec keeps exercising only
  // what it was designed for (the territory gate), not the (correct, new) date gate.
  await page.route('**/sws/neo/sii-config/siiConfiguration?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: responseData([{ guipuzcoa: 'Y', taxtype: 'IVA', fechaAcogidaSII: '2020-01-01' }]),
    });
  });
  await installListMock(page);
  await page.goto(`/${SPEC}`);
  // Any row proves the grid rendered with the mocked payload.
  await expect(page.getByTestId(`row-${ROWS[0].id}`)).toBeVisible({ timeout: 15_000 });
}

const tbaiHeader = (page) => page.getByTestId('column-header-eTGOTbaiStatus');
const siiHeader = (page) => page.getByTestId('column-header-_siiStatus');

test.describe('Purchase Invoice list — Estado Batuz column (ETP-5087)', () => {

  test('SII+TBAI profile in BIZKAIA renders the Batuz column alongside the SII column', async ({ page }) => {
    await openList(page, { profile: 'sii+tbai', territory: 'BIZKAIA' });

    await expect(tbaiHeader(page)).toBeVisible();
    await expect(tbaiHeader(page)).toContainText(t('invoiceList.col.tbaiStatusPurchase'));

    await expect(siiHeader(page)).toBeVisible();
    await expect(siiHeader(page)).toContainText(t('invoiceList.col.siiStatus'));
  });

  // Regression guard: an earlier revision coupled both fiscal columns, so
  // turning the Batuz column off outside Bizkaia also killed the SII one.
  for (const territory of ['GIPUZKOA', 'ARABA']) {
    test(`SII+TBAI profile in ${territory} hides the Batuz column but keeps the SII column`, async ({ page }) => {
      await openList(page, { profile: 'sii+tbai', territory });

      await expect(tbaiHeader(page)).toHaveCount(0);
      await expect(page.getByText(t('invoiceList.col.tbaiStatusPurchase'), { exact: true })).toHaveCount(0);

      await expect(siiHeader(page)).toBeVisible();
      await expect(page.getByTestId(`cell-${ROWS[0].id}-_siiStatus`))
        .toHaveText(t('fiscalMonitor.status.sii.CO'));
    });
  }

  test.describe('cell content in BIZKAIA', () => {
    test.beforeEach(async ({ page }) => {
      await openList(page, { profile: 'sii+tbai', territory: 'BIZKAIA' });
    });

    for (const row of ROWS) {
      test(`${row.id}: eTGOTbaiStatus=${JSON.stringify(row.eTGOTbaiStatus ?? null)} tbaiIssent=${JSON.stringify(row.tbaiIssent ?? null)} renders ${row.expected.split('.').pop()}`, async ({ page }) => {
        await expect(page.getByTestId(`cell-${row.id}-eTGOTbaiStatus`)).toHaveText(t(row.expected));
      });
    }

    // ── ETP-5216: 'NoAplica' → dash, and nothing else does ──────────────────
    for (const row of NOT_APPLICABLE_ROWS) {
      test(`${row.id}: eTGOTbaiStatus='NoAplica' tbaiIssent=${JSON.stringify(row.tbaiIssent)} renders a dash, not a badge`, async ({ page }) => {
        const cell = page.getByTestId(`cell-${row.id}-eTGOTbaiStatus`);
        await expect(cell).toHaveText('—');
        // Not the fallback the flag would otherwise produce — the dash branch
        // short-circuits before `isSent(tbaiIssent)` is consulted at all.
        await expect(cell).not.toHaveText(t('fiscalMonitor.tbai.status.Enviada'));
        await expect(cell).not.toHaveText(t('fiscalMonitor.tbai.status.Pendiente'));
      });
    }

    test('a dashed Batuz cell does not dash the row — the SII column keeps its own state', async ({ page }) => {
      // Proves the dash is the TBAI cell's own decision, not a broken row.
      await expect(page.getByTestId('cell-PI_NO_APLICA-eTGOTbaiStatus')).toHaveText('—');
      await expect(page.getByTestId('cell-PI_NO_APLICA-_siiStatus'))
        .toHaveText(t('fiscalMonitor.status.sii.CO'));
    });

    test('an invoice dated before the SELECTED org adoption date still shows its stored status', async ({ page }) => {
      // The ETP-5216 regression: the browser no longer second-guesses the DB by
      // comparing invoiceDate against the selected org's tbaisystemdate.
      await expect(page.getByTestId(`cell-${CROSS_ORG_ROW.id}-eTGOTbaiStatus`))
        .toHaveText(t('fiscalMonitor.tbai.status.Recibido'));
    });

    test('a rejected invoice is never reported as sent, and its SII column is unaffected', async ({ page }) => {
      const cell = page.getByTestId('cell-PI_REJECTED-eTGOTbaiStatus');
      await expect(cell).toHaveText(t('fiscalMonitor.tbai.status.Rechazado'));
      await expect(cell).not.toHaveText(t('fiscalMonitor.tbai.status.Enviada'));

      await expect(page.getByTestId('cell-PI_REJECTED-_siiStatus'))
        .toHaveText(t('fiscalMonitor.status.sii.CO'));
    });
  });
});
