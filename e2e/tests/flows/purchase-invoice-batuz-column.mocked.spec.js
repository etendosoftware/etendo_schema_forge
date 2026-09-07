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
 *  B. CONTENT — `row.tbaiSyncEstado ?? (isSent(row.tbaiIssent) ? 'Enviada' : 'Pendiente')`.
 *     The real backend status wins over the boolean flag, which is what stops a
 *     `Rechazado` from ever being read as a cheerful "Enviada". The fallback goes
 *     through `isSent()` because NEO may deliver the AD flag as the character
 *     `'N'`, which is truthy in JS — a plain truthy test reports "Enviada" for an
 *     unsent invoice.
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
 */

const SPEC = 'purchase-invoice';

const BASE_ROW = {
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  invoiceDate: '2026-05-08',
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
  // tbaiSyncEstado wins over tbaiIssent — the CRITICAL case: a rejection must
  // never be reported as "Enviada", even though the invoice WAS submitted.
  { id: 'PI_REJECTED', orderReference: 'PI-REJECTED', tbaiSyncEstado: 'Rechazado', tbaiIssent: true, expected: 'fiscalMonitor.tbai.status.Rechazado' },
  { id: 'PI_ACCEPTED', orderReference: 'PI-ACCEPTED', tbaiSyncEstado: 'Recibido', tbaiIssent: true, expected: 'fiscalMonitor.tbai.status.Recibido' },
  { id: 'PI_ERROR', orderReference: 'PI-ERROR', tbaiSyncEstado: 'Error', tbaiIssent: 'Y', expected: 'fiscalMonitor.tbai.status.Error' },
  // No sync row yet → fall back to the boolean flag, in both serialisations.
  { id: 'PI_SENT_BOOL', orderReference: 'PI-SENT-BOOL', tbaiIssent: true, expected: 'fiscalMonitor.tbai.status.Enviada' },
  { id: 'PI_SENT_CHAR', orderReference: 'PI-SENT-CHAR', tbaiIssent: 'Y', expected: 'fiscalMonitor.tbai.status.Enviada' },
  { id: 'PI_PENDING_BOOL', orderReference: 'PI-PENDING-BOOL', tbaiIssent: false, expected: 'fiscalMonitor.tbai.status.Pendiente' },
  // `'N'` is truthy in JS — this row is the whole reason `isSent()` exists.
  { id: 'PI_PENDING_CHAR', orderReference: 'PI-PENDING-CHAR', tbaiIssent: 'N', expected: 'fiscalMonitor.tbai.status.Pendiente' },
];

const LIST_ROWS = ROWS.map(({ expected, ...row }) => ({ ...BASE_ROW, ...row, documentNo: row.orderReference }));

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
  await installListMock(page);
  await page.goto(`/${SPEC}`);
  // Any row proves the grid rendered with the mocked payload.
  await expect(page.getByTestId(`row-${ROWS[0].id}`)).toBeVisible({ timeout: 15_000 });
}

const tbaiHeader = (page) => page.getByTestId('column-header-_tbaiStatus');
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
      test(`${row.id}: tbaiSyncEstado=${JSON.stringify(row.tbaiSyncEstado ?? null)} tbaiIssent=${JSON.stringify(row.tbaiIssent ?? null)} renders ${row.expected.split('.').pop()}`, async ({ page }) => {
        await expect(page.getByTestId(`cell-${row.id}-_tbaiStatus`)).toHaveText(t(row.expected));
      });
    }

    test('a rejected invoice is never reported as sent, and its SII column is unaffected', async ({ page }) => {
      const cell = page.getByTestId('cell-PI_REJECTED-_tbaiStatus');
      await expect(cell).toHaveText(t('fiscalMonitor.tbai.status.Rechazado'));
      await expect(cell).not.toHaveText(t('fiscalMonitor.tbai.status.Enviada'));

      await expect(page.getByTestId('cell-PI_REJECTED-_siiStatus'))
        .toHaveText(t('fiscalMonitor.status.sii.CO'));
    });
  });
});
