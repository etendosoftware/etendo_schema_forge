import { test, expect } from '../../helpers/test.js';
import { readFileSync } from 'node:fs';
import { login } from '../../helpers/auth.js';

// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportView.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportTable.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicDrillPanel.jsx
// @covers tools/app-shell/src/pages/ReportViewerPage.jsx

/**
 * Profit & Loss, interactive view (ETP-6080, flag `dynamic-reports`, mocked).
 *
 * Pins what only shows end to end: the report opens with no "run" button and queries on its own,
 * the tree folds and unfolds on screen, a filter change sends a new query, and the drill-down walks
 * account → ledger → entry → document. With the flag off the old viewer still opens.
 *
 * The flag is fixed when Vite starts (`VITE_FEATURE_FLAGS`, no runtime override), so the flag-on
 * tests skip themselves unless the server was started with it, as in
 * `acct-process-monitor.mocked.spec.js`:
 *
 *   npx vite --port 3105        # flag off (default): only the flag-off test runs
 *   VITE_FEATURE_FLAGS='{"dynamic-reports":true}' npx vite --port 3105
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 E2E_DYNAMIC_REPORTS_FLAG=on \
 *     npx playwright test tests/flows/accounting/dynamic-profit-loss.mocked.spec.js --project=mocked
 *
 * The catalog entry is built from the real contract, as the dev server's `listReports()` does,
 * because the pre-push preview build serves no `/api/reports`. `login()` already grants
 * `profit-loss` in `myreportaccess`. Routes are installed AFTER `login()` so they beat its
 * generic `/sws/**` stub. Run against plain `npx vite` / `make dev`, never `make dev-mock`.
 */

const FLAG_ON = process.env.E2E_DYNAMIC_REPORTS_FLAG === 'on';
const REPORT = '/report-viewer?report=profit-loss';

const TREE = [
  { node_id: 'E1', parentId: null, elementlevel: 'E', value: 'P.G.1', name: 'Ventas', amount: 1000, amount_ref: 0, sign: 'C' },
  { node_id: 'C1', parentId: 'E1', elementlevel: 'C', value: '70', name: 'Ventas de mercaderías', amount: 1000, amount_ref: 0, sign: 'C' },
  { node_id: 'S1', parentId: 'C1', elementlevel: 'S', value: '700', name: 'Ventas nacionales', amount: 1000, amount_ref: 0, sign: 'C' },
];
// pg sends a SQL date as the server's local midnight in UTC: 15 September in Madrid.
const LEDGER = {
  kind: 'rows',
  rows: [
    { value: '700', dateacct: '2026-09-14T22:00:00.000Z', fact_acct_group_id: 'G1', groupbyname: 'Acme', amtacctdr: 0, amtacctcr: 1050 },
    { value: '700', dateacct: '2026-10-01T22:00:00.000Z', fact_acct_group_id: 'G2', groupbyname: 'Beta', amtacctdr: 50, amtacctcr: 0 },
  ],
  openingRows: [{ value: '700', openingtotal: -200 }],
};
const ENTRY = {
  kind: 'rows',
  rows: [
    { document_type: 'Factura', account_no: '430', account_name: 'Clientes', amtacctdr: 1050, amtacctcr: 0, doc_window: 'sales-invoice', doc_record_id: 'INV1', doc_query_key: '', doc_query_value: '' },
    { document_type: 'Factura', account_no: '700', account_name: 'Ventas nacionales', amtacctdr: 0, amtacctcr: 1050, doc_window: 'sales-invoice', doc_record_id: 'INV1', doc_query_key: '', doc_query_value: '' },
  ],
};

const CONTRACT = JSON.parse(readFileSync(new URL('../../../../artifacts/profit-loss/report-contract.json', import.meta.url), 'utf8'));
const MANIFEST = [{
  id: CONTRACT.reportId,
  title: CONTRACT.title,
  type: CONTRACT.type,
  category: CONTRACT.category || 'other',
  orientation: CONTRACT.orientation,
  outputs: CONTRACT.outputs,
  parameters: CONTRACT.parameters || [],
  sections: CONTRACT.sections || [],
}];

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function installMocks(page) {
  const queries = { 'profit-loss': [], 'report-general-ledger': [], 'report-journal-entries': [] };
  const year = new Date().getFullYear();
  // Playwright tries the last registered route first: the catch-all goes before the specific ones.
  await page.route('**/api/reports', (route) => (route.request().method() === 'GET'
    ? route.fulfill(json(MANIFEST))
    : route.fallback()));
  await page.route('**/sws/report-selectors/**', (route) => route.fulfill(json({ items: [] })));
  await page.route('**/sws/report-selectors/acctschema**', (route) => route.fulfill(json({ items: [{ id: 'AS1', name: 'Spain GAAP' }] })));
  await page.route('**/sws/report-selectors/year**', (route) => route.fulfill(json({
    items: [
      { id: 'Y1', name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` },
      { id: 'Y0', name: String(year - 1), startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` },
    ],
  })));
  await page.route('**/api/reports/*/query', (route) => {
    const id = route.request().url().split('/api/reports/')[1].split('/')[0];
    const { params } = route.request().postDataJSON();
    queries[id]?.push(params);
    if (id === 'report-general-ledger') return route.fulfill(json(LEDGER));
    if (id === 'report-journal-entries') return route.fulfill(json(ENTRY));
    return route.fulfill(json({ kind: 'tree', rows: TREE }));
  });
  return queries;
}

test.describe('Profit & Loss — interactive view (ETP-6080)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('flag off: the old viewer opens', async ({ page }) => {
    test.skip(FLAG_ON, 'server started with dynamic-reports on');
    await installMocks(page);
    await page.goto(REPORT);
    await expect(page.getByTestId('action-cancel')).toBeVisible();
    await expect(page.getByTestId('DynamicReportView')).toHaveCount(0);
  });

  test('opens querying on its own, folds on screen and reloads on a period change', async ({ page }) => {
    test.skip(!FLAG_ON, 'needs VITE_FEATURE_FLAGS={"dynamic-reports":true} and E2E_DYNAMIC_REPORTS_FLAG=on');
    const queries = await installMocks(page);
    await page.goto(REPORT);

    await expect(page.getByTestId('DynamicReportView')).toBeVisible();
    await expect(page.getByTestId('DynamicReportTable__row')).toHaveCount(2);
    const first = queries['profit-loss'][0];
    expect(first).toMatchObject({ acctSchemaId: 'AS1', dateFrom: `${new Date().getFullYear()}-01-01` });
    expect(first.yearId).toBeUndefined();

    // Folding is local: expanding everything sends no query.
    const sent = queries['profit-loss'].length;
    await page.getByTestId('DynamicReportPanel__expandAll').click();
    await expect(page.getByTestId('DynamicReportTable__row')).toHaveCount(3);
    await page.getByTestId('DynamicReportPanel__collapseAll').click();
    await expect(page.getByTestId('DynamicReportTable__row')).toHaveCount(1);
    expect(queries['profit-loss']).toHaveLength(sent);

    // Last year, not Mes: in January "this month" equals the opening period and sends nothing.
    await page.getByTestId('DynamicReportPanel__year').selectOption('Y0');
    await expect.poll(() => queries['profit-loss'].length).toBeGreaterThan(sent);
    expect(queries['profit-loss'].at(-1).dateFrom.slice(0, 4)).toBe(String(new Date().getFullYear() - 1));
  });

  test('drills from an account to its ledger, the entry and the document', async ({ page, context }) => {
    test.skip(!FLAG_ON, 'needs VITE_FEATURE_FLAGS={"dynamic-reports":true} and E2E_DYNAMIC_REPORTS_FLAG=on');
    const queries = await installMocks(page);
    await page.goto(REPORT);
    await page.getByTestId('DynamicReportPanel__expandAll').click();

    await page.getByTestId('DynamicReportTable__ledger').click();
    const panel = page.getByTestId('DynamicDrillPanel');
    await expect(panel.getByTestId('DynamicDrillPanel__ledgerRow')).toHaveCount(2);
    expect(queries['report-general-ledger'][0]).toMatchObject({ acctSchemaId: 'AS1', fromAccountId: '700', toAccountId: '700' });
    // Movement signed like the row: credit 1050 − debit 50 = the 1000 clicked on.
    await expect(panel.getByTestId('DynamicDrillPanel__movement')).toContainText('1.000');

    await panel.getByTestId('DynamicDrillPanel__search').fill('beta');
    await expect(panel.getByTestId('DynamicDrillPanel__ledgerRow')).toHaveCount(1);
    await panel.getByTestId('DynamicDrillPanel__search').fill('');

    await panel.getByTestId('DynamicDrillPanel__openEntry').first().click();
    await expect(panel.getByTestId('DynamicDrillPanel__entryRow')).toHaveCount(2);
    expect(queries['report-journal-entries'][0]).toEqual({ acctSchemaId: 'AS1', orgId: expect.any(String), factAcctGroupId: 'G1' });
    await expect(panel.locator('[data-testid="DynamicDrillPanel__entryRow"][data-source="true"]')).toHaveCount(1);

    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      panel.getByTestId('DynamicDrillPanel__openDocument').click(),
    ]);
    expect(tab.url()).toContain('INV1');
    await tab.close();

    // The account crumb goes back to the ledger.
    await panel.getByTestId('DynamicDrillPanel__crumb-account').click();
    await expect(panel.getByTestId('DynamicDrillPanel__ledgerRow')).toHaveCount(2);
  });
});
