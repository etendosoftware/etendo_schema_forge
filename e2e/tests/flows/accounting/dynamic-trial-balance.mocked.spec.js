import { test, expect } from '../../helpers/test.js';
import { readFileSync } from 'node:fs';
import { login } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';

// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportView.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportTable.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportBalance.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicDrillPanel.jsx
// @covers artifacts/report-trial-balance/report-contract.json

/**
 * Trial Balance (Sumas y Saldos), interactive chart-tree view (flag `dynamic-balance-reports`, mocked).
 *
 * Sibling of `dynamic-profit-loss.mocked.spec.js`: same flag, same server requirements and the same
 * route-installing pattern (the flag is fixed when Vite starts, so the tests skip themselves unless
 * the server was started with it):
 *
 *   VITE_FEATURE_FLAGS='{"dynamic-balance-reports":true}' npx vite --port 3105
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 E2E_DYNAMIC_BALANCE_REPORTS_FLAG=on \
 *     npx playwright test tests/flows/accounting/dynamic-trial-balance.mocked.spec.js --project=mocked
 *
 * Pins what only shows end to end: the four amount columns with TOTALES and the balanced check,
 * the level and the grouping folding the tree, the comparison columns (closing always, debit and
 * credit with "compare movements"), the leaf drill into the General Ledger, and the export body.
 */

const FLAG_ON = process.env.E2E_DYNAMIC_BALANCE_REPORTS_FLAG === 'on';
const REPORT = '/report-viewer?report=report-trial-balance';
const FIELDS = ['opening', 'debit', 'credit', 'closing'];

const cell = (n) => ({ amount: n, sly: { amount: n - 20, variationAmount: 20, variationPct: 25, trend: 'improves' }, prev: { amount: n - 10, variationAmount: 10, variationPct: 11, trend: 'improves' } });
const cellsOf = (n) => Object.fromEntries(FIELDS.map((f, i) => [f, cell(n + i)]));
const ALL_MODES = { none: true, sly: true, prev: true };
const node = (id, parentId, elementlevel, value, name, extra = {}) => ({
  node_id: id, parentId, elementlevel, value, name, account_id: id, account_value: value, isDimension: false,
  visible: ALL_MODES, parentIds: { none: parentId, sly: parentId, prev: parentId }, ...extra,
});
const TREE = [
  node('E1', null, 'E', '70', 'Ventas'),
  node('C1', 'E1', 'C', '700', 'Ventas de mercaderías'),
  node('S1', 'C1', 'S', '7000', 'Ventas nacionales'),
];
// A dimension row's node_id is synthetic (`S1|bp1`); it belongs to the account S1.
const DIMENSION = node('S1|bp1', 'S1', 'S', '7000', 'Acme', { account_id: 'S1', isDimension: true, dimension_id: 'bp1', dimension_name: 'Acme' });

const LEDGER = {
  kind: 'rows',
  rows: [{ value: '7000', dateacct: '2026-09-14T22:00:00.000Z', fact_acct_group_id: 'G1', groupbyname: 'Acme', amtacctdr: 0, amtacctcr: 1050 }],
  openingRows: [{ value: '7000', openingtotal: 0 }],
};

const CONTRACT = JSON.parse(readFileSync(new URL('../../../../artifacts/report-trial-balance/report-contract.json', import.meta.url), 'utf8'));
const MANIFEST = [{
  id: CONTRACT.reportId,
  title: CONTRACT.title,
  type: CONTRACT.type,
  category: CONTRACT.category || 'other',
  orientation: CONTRACT.orientation,
  outputs: CONTRACT.outputs,
  parameters: CONTRACT.parameters || [],
  sections: CONTRACT.sections || [],
  tree: CONTRACT.tree,
  amountColumns: CONTRACT.amountColumns,
  labels: CONTRACT.labels,
}];

function treeAnswer(params) {
  const periods = params.periods.split(',').map((tuple, idx) => {
    const [dateFrom, dateTo] = tuple.split('|')[0].split('..');
    return { idx, dateFrom, dateTo, partial: false };
  });
  const base = params.groupBy === 'bpartner' ? [...TREE, DIMENSION] : TREE;
  const rows = base.map((r, i) => ({ ...r, cells: periods.map((_, pos) => cellsOf(100 * (i + 1) + pos)) }));
  return {
    kind: 'tree',
    periods,
    hiddenCount: Number(params.hiddenCount),
    rows,
    totals: periods.map((_, pos) => cellsOf(1000 + pos)),
    balance: { balanced: true, debitCreditDiff: 0, closingDiff: 0 },
  };
}

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function installMocks(page) {
  const queries = { tb: [], ledger: [], render: [] };
  const year = new Date().getFullYear();
  // Playwright tries the last registered route first: the catch-all goes before the specific ones.
  await page.route('**/api/reports', (route) => (route.request().method() === 'GET' ? route.fulfill(json(MANIFEST)) : route.fallback()));
  await page.route('**/sws/report-selectors/**', (route) => route.fulfill(json({ items: [] })));
  await page.route('**/sws/report-selectors/acctschema**', (route) => route.fulfill(json({ items: [{ id: 'AS1', name: 'Spain GAAP' }] })));
  await page.route('**/sws/report-selectors/year**', (route) => route.fulfill(json({
    items: [{ id: 'Y1', name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` }],
  })));
  await page.route('**/api/reports/*/render', (route) => {
    queries.render.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'text/csv', body: 'a,b' });
  });
  await page.route('**/api/reports/*/query', (route) => {
    const id = route.request().url().split('/api/reports/')[1].split('/')[0];
    const { params } = route.request().postDataJSON();
    if (id === 'report-general-ledger') { queries.ledger.push(params); return route.fulfill(json(LEDGER)); }
    queries.tb.push(params);
    return route.fulfill(json(treeAnswer(params)));
  });
  return queries;
}

test.describe('Trial Balance — interactive view (ETP-6084)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!FLAG_ON, 'needs VITE_FEATURE_FLAGS={"dynamic-balance-reports":true} and E2E_DYNAMIC_BALANCE_REPORTS_FLAG=on');
    await login(page);
  });

  const rows = (page) => page.getByTestId('DynamicReportTable__row');
  const variation = (page) => page.getByTestId('DynamicReportTable__variation');

  test('opens as a tree with four amount columns, TOTALES and the balanced check', async ({ page }) => {
    const queries = await installMocks(page);
    await page.goto(REPORT);

    await expect(page.getByTestId('DynamicReportTable')).toBeVisible();
    await expect(page.getByTestId('DynamicReportTable__amount')).toHaveText([
      t('dynamicReportOpening'), t('dynamicReportDebit'), t('dynamicReportCredit'), t('dynamicReportClosing'),
    ]);
    await expect(page.getByTestId('DynamicReportTable__totals')).toContainText(t('dynamicReportTotalRow'));
    await expect(page.getByTestId('DynamicReportBalance__ok')).toBeVisible();
    expect(queries.tb[0]).toMatchObject({ acctSchemaId: 'AS1', openingEntryAmount: 'true' });
  });

  test('the initial level folds the tree on screen and the grouping adds dimension rows under the account', async ({ page }) => {
    const queries = await installMocks(page);
    await page.goto(REPORT);
    await expect(rows(page)).toHaveCount(3); // default Subcuenta: E, C and S

    const level = page.getByTestId('DynamicReportPanel__level');
    const sent = queries.tb.length;
    await level.selectOption('E');
    await expect(rows(page)).toHaveCount(1);
    await level.selectOption('S');
    await expect(rows(page)).toHaveCount(3);
    expect(queries.tb).toHaveLength(sent); // folding is local

    await page.getByTestId('DynamicReportPanel__groupBy').selectOption('bpartner');
    await expect.poll(() => queries.tb.at(-1)?.groupBy).toBe('bpartner');
    await page.getByTestId('DynamicReportPanel__expandAll').click();
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator('[data-testid="DynamicReportTable__row"][data-node-id="S1|bp1"]')).toBeVisible();
  });

  test('the comparison adds closing columns, and "compare movements" adds debit and credit', async ({ page }) => {
    const queries = await installMocks(page);
    await page.goto(REPORT);
    await expect(rows(page)).toHaveCount(3);
    await expect(variation(page)).toHaveCount(0);
    await expect(page.getByTestId('DynamicReportPanel__compareMovements')).toHaveCount(0);

    const sent = queries.tb.length;
    await page.getByTestId('DynamicReportPanel__compare').selectOption('same-last-year');
    // Closing is always compared: one variation cell per row, TOTALES included. Opening, debit and credit are not.
    await expect(variation(page)).toHaveCount(3 + 1);
    await page.getByTestId('DynamicReportPanel__compareMovements').check();
    // Debit and credit join the closing: three compared amounts per row.
    await expect(variation(page)).toHaveCount((3 + 1) * 3);
    await page.waitForTimeout(600); // longer than the query debounce
    expect(queries.tb).toHaveLength(sent); // the comparison is a display choice
  });

  test('a leaf amount opens the General Ledger of the account with the active filters', async ({ page }) => {
    const queries = await installMocks(page);
    await page.goto(REPORT);
    await page.getByTestId('DynamicReportPanel__groupBy').selectOption('bpartner');
    await expect.poll(() => queries.tb.at(-1)?.groupBy).toBe('bpartner');
    await page.getByTestId('DynamicReportPanel__expandAll').click();

    const dimension = page.locator('[data-testid="DynamicReportTable__row"][data-node-id="S1|bp1"]');
    await dimension.getByTestId('DynamicReportTable__cellLedger').first().click();

    const panel = page.getByTestId('DynamicDrillPanel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('DynamicDrillPanel__ledgerRow')).toHaveCount(1);
    expect(queries.ledger[0]).toMatchObject({
      acctSchemaId: 'AS1', accountId: 'S1', fromAccountId: '7000', toAccountId: '7000', openingEntryAmount: 'true', bPartnerId: 'bp1',
    });
  });

  test('the export sends the rows on screen and whether movements are compared', async ({ page }) => {
    const queries = await installMocks(page);
    await page.goto(REPORT);
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId('DynamicReportPanel__compare').selectOption('same-last-year');
    await page.getByTestId('DynamicReportPanel__compareMovements').check();

    await Promise.all([page.waitForEvent('download'), page.getByTestId('DynamicReportView__export-csv').click()]);
    expect(queries.render).toHaveLength(1);
    expect(queries.render[0].params).toMatchObject({ visibleNodeIds: 'E1,C1,S1', compareMovements: 'true', compareMode: 'sly' });
  });
});
