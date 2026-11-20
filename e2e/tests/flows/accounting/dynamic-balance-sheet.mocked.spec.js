import { test, expect } from '../../helpers/test.js';
import { readFileSync } from 'node:fs';
import { login } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';

// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportView.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportTable.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicReportBalance.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicDrillPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/DynamicResultPanel.jsx
// @covers tools/app-shell/src/components/reports/dynamic/dynamicDates.js
// @covers artifacts/balance-sheet/report-contract.json

/**
 * Balance Sheet, interactive view (flag `dynamic-balance-reports`, mocked).
 *
 * Third sibling of `dynamic-profit-loss.mocked.spec.js` and `dynamic-trial-balance.mocked.spec.js`: same
 * flag, same server requirements, same route-installing pattern (the flag is fixed when Vite starts, so the
 * tests skip themselves unless the server was started with it):
 *
 *   VITE_FEATURE_FLAGS='{"dynamic-balance-reports":true}' npx vite --port 3105
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3105 E2E_DYNAMIC_BALANCE_REPORTS_FLAG=on \
 *     npx playwright test tests/flows/accounting/dynamic-balance-sheet.mocked.spec.js --project=mocked
 *
 * The page clock is fixed (3 November 2026, fiscal years = calendar years) so the end-date shortcuts and the
 * comparison dates are exact. Pins what only shows end to end: the balance check, the shortcut that moves
 * Hasta, the comparison against the previous fiscal-year close (a display choice: no new request), the fold
 * by Grupo, an account's ledger closing on the amount clicked, and the 129 result panel with its P&L link.
 */

const FLAG_ON = process.env.E2E_DYNAMIC_BALANCE_REPORTS_FLAG === 'on';
const REPORT = '/report-viewer?report=balance-sheet';
const TODAY = new Date(2026, 10, 3, 12);

const CONTRACT = JSON.parse(readFileSync(new URL('../../../../artifacts/balance-sheet/report-contract.json', import.meta.url), 'utf8'));
const MANIFEST = [{
  id: CONTRACT.reportId,
  title: CONTRACT.title,
  type: CONTRACT.type,
  category: CONTRACT.category || 'other',
  orientation: CONTRACT.orientation,
  outputs: CONTRACT.outputs,
  parameters: CONTRACT.parameters || [],
  sections: CONTRACT.sections || [],
  labels: CONTRACT.labels,
}];

const one = (amount, sly, prev) => ({
  amount,
  sly: { amount: sly, variationAmount: amount - sly, variationPct: 10, trend: null },
  prev: { amount: prev, variationAmount: amount - prev, variationPct: 5, trend: null },
});
// 129 "Resultados del ejercicio": all calculated on the fly, nothing posted yet.
const RESULT = { onTheFly: 37504, posted: 0, sly: { onTheFly: 24811, posted: 0 }, prev: { onTheFly: 5000, posted: 15000 } };
const node = (id, parentId, elementlevel, value, name, group, cell, extra = {}) => ({
  node_id: id, parentId, elementlevel, value, name, sign: group === 'Activo' ? 'D' : 'C', group, amount: cell.amount, cells: [cell], ...extra,
});
const ROWS = [
  node('A1', null, 'E', 'A', 'ACTIVO', 'Activo', one(700, 600, 500), { isGroupStart: true }),
  node('A2', 'A1', 'E', 'A.I', 'Inmovilizado', 'Activo', one(700, 600, 500)),
  node('213', 'A2', 'C', '213', 'Maquinaria', 'Activo', one(1000, 900, 800)),
  node('281', 'A2', 'C', '281', 'Amortización acumulada', 'Activo', one(-300, -300, -300)),
  node('P1', null, 'E', 'P', 'PATRIMONIO NETO', 'Pasivo', one(37504, 24811, 20000), { isGroupStart: true }),
  node('P2', 'P1', 'E', 'P.I', 'Resultado', 'Pasivo', one(37504, 24811, 20000)),
  node('129', 'P2', 'C', '129', 'Resultados del ejercicio', 'Pasivo', { ...one(37504, 24811, 20000), result: RESULT }, { result: { onTheFly: 37504, posted: 0 } }),
];

// -500 opening + 1500 debit = 1000: the closing of account 213, the amount in the report.
const LEDGER = {
  kind: 'rows',
  rows: [{ value: '213', dateacct: '2026-03-14T22:00:00.000Z', fact_acct_group_id: 'G1', groupbyname: 'Acme', amtacctdr: 1500, amtacctcr: 0 }],
  openingRows: [{ value: '213', openingtotal: -500 }],
};

function treeAnswer(params) {
  const [first] = params.periods.split(',');
  const [dateFrom, dateTo] = first.split('|')[0].split('..');
  return {
    kind: 'tree',
    periods: [{ idx: 0, dateFrom, dateTo, partial: false }],
    hiddenCount: 0,
    rows: ROWS,
    balance: { balanced: true, activo: 700, pnPasivo: 700, diff: 0 },
  };
}

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function installMocks(page) {
  const queries = { sheet: [], ledger: [] };
  // Playwright tries the last registered route first: the catch-all goes before the specific ones.
  await page.route('**/api/reports', (route) => (route.request().method() === 'GET' ? route.fulfill(json(MANIFEST)) : route.fallback()));
  await page.route('**/sws/report-selectors/**', (route) => route.fulfill(json({ items: [] })));
  await page.route('**/sws/report-selectors/acctschema**', (route) => route.fulfill(json({ items: [{ id: 'AS1', name: 'Spain GAAP' }] })));
  await page.route('**/sws/report-selectors/year**', (route) => route.fulfill(json({
    items: [2026, 2025].map((y) => ({ id: `Y${y}`, name: String(y), startDate: `${y}-01-01`, endDate: `${y}-12-31` })),
  })));
  await page.route('**/api/reports/*/query', (route) => {
    const id = route.request().url().split('/api/reports/')[1].split('/')[0];
    const { params } = route.request().postDataJSON();
    if (id === 'report-general-ledger') { queries.ledger.push(params); return route.fulfill(json(LEDGER)); }
    queries.sheet.push(params);
    return route.fulfill(json(treeAnswer(params)));
  });
  return queries;
}

test.describe('Balance Sheet — interactive view (ETP-6083)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!FLAG_ON, 'needs VITE_FEATURE_FLAGS={"dynamic-balance-reports":true} and E2E_DYNAMIC_BALANCE_REPORTS_FLAG=on');
    await page.clock.setFixedTime(TODAY);
    await login(page);
  });

  const rows = (page) => page.getByTestId('DynamicReportTable__row');
  const rowOf = (page, id) => page.locator(`[data-testid="DynamicReportTable__row"][data-node-id="${id}"]`);

  test('balance check, end-date shortcut, comparison, fold, ledger closing and the result panel', async ({ page }) => {
    const queries = await installMocks(page);
    await page.goto(REPORT);

    // Opens as a balance at today, read from the start of its fiscal year, balanced, with no KPI strip.
    await expect(page.getByTestId('DynamicReportTable')).toBeVisible();
    await expect(page.getByTestId('DynamicReportBalance__ok')).toBeVisible();
    await expect(page.getByTestId('DynamicReportKpis')).toHaveCount(0);
    expect(queries.sheet[0]).toMatchObject({ acctSchemaId: 'AS1', dateFrom: '2026-01-01', dateTo: '2026-11-03' });

    // The end-date shortcut moves Hasta (and only the date): one new query.
    await page.getByTestId('DynamicReportPanel__shortcut-lastQuarterEnd').click();
    await expect.poll(() => queries.sheet.at(-1)?.dateTo).toBe('2026-09-30');
    await expect(page.getByTestId('DynamicReportPanel__shortcut-lastQuarterEnd')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(7);

    // Comparing with the previous fiscal-year close is a display choice: the header names the date, no request.
    const sent = queries.sheet.length;
    await page.getByTestId('DynamicReportPanel__compare').selectOption('previous');
    await expect(page.getByTestId('DynamicReportTable__comparedLabel')).toBeVisible();
    await expect(rowOf(page, '213').getByTestId('DynamicReportTable__cellLedger')).toHaveCount(2); // current + compared
    await expect(rowOf(page, '213')).toContainText('800');
    await page.waitForTimeout(600); // longer than the query debounce
    expect(queries.sheet).toHaveLength(sent);
    await page.getByTestId('DynamicReportPanel__compare').selectOption('');

    // Folding by Grupo leaves the two roots; Cuenta brings every row back. Neither asks again.
    const level = page.getByTestId('DynamicReportPanel__level');
    await level.selectOption('G');
    await expect(rows(page)).toHaveCount(2);
    await level.selectOption('C');
    await expect(rows(page)).toHaveCount(7);
    expect(queries.sheet).toHaveLength(sent);

    // An account's ledger runs from the start of the fiscal year to Hasta and closes on the amount clicked.
    await rowOf(page, '213').getByTestId('DynamicReportTable__ledger').click();
    const drill = page.getByTestId('DynamicDrillPanel');
    await expect(drill).toBeVisible();
    await expect(drill.getByTestId('DynamicDrillPanel__ledgerRow')).toHaveCount(1);
    await expect(drill.getByTestId('DynamicDrillPanel__closingCheck')).toContainText(t('dynamicReportClosingMatches').split('{closing}')[1]); // the text after the amount, which is formatted per instance
    expect(queries.ledger[0]).toMatchObject({ accountId: '213', dateFrom: '2026-01-01', dateTo: '2026-09-30', openingEntryAmount: 'true' });
    await page.keyboard.press('Escape');
    await expect(drill).toBeHidden();

    // 129 explains itself: posted / calculated, and a link to the P&L of that fiscal year up to Hasta.
    await rowOf(page, '129').getByTestId('DynamicReportTable__ledger').click();
    const panel = page.getByTestId('DynamicResultPanel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('DynamicResultPanel__posted')).toContainText('0');
    await expect(panel.getByTestId('DynamicResultPanel__onTheFly')).toContainText(/37[.,]?504/);
    const href = new URL((await panel.getByTestId('DynamicResultPanel__openPnl').getAttribute('href')), 'http://x');
    expect(Object.fromEntries(href.searchParams)).toMatchObject({ report: 'profit-loss', dateFrom: '2026-01-01', dateTo: '2026-09-30' });
    expect(queries.ledger).toHaveLength(1); // opening the result panel never reads a ledger
  });

  test('an out-of-balance answer is an alert, not a success line', async ({ page }) => {
    await installMocks(page);
    await page.route('**/api/reports/balance-sheet/query', (route) => {
      const { params } = route.request().postDataJSON();
      return route.fulfill(json({ ...treeAnswer(params), balance: { balanced: false, activo: 1000, pnPasivo: 987.5, diff: 12.5 } }));
    });
    await page.goto(REPORT);
    await expect(page.getByTestId('DynamicReportBalance__error')).toBeVisible();
    await expect(page.getByTestId('DynamicReportBalance__ok')).toHaveCount(0);
  });
});
