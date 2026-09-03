/**
 * ETP-5013 follow-up — when Trial Balance is grouped by any dimension
 * (Contacto/Producto/Proyecto/Centro de costos), the dimension row's own
 * value (e.g. "Blanquiceleste S.A.") is now a drill-down link, matching
 * Classic's own Trial Balance report (which renders the dimension value as
 * a link opening General Ledger, scoped to that account AND that dimension
 * value). Started scoped to Contacto only, then extended to all 4 —
 * `report-grouping.js`'s `groupByIdField` (schema_forge_core) is generic,
 * so all 4 params in `report-trial-balance/report-contract.json` now declare
 * one (`bpartner_id`/`product_id`/`project_id`/`costcenter_id`), all backed
 * by the matching id column added to the report's own SQL.
 *
 * The link uses the SAME `trial-balance-drilldown` postMessage type as the
 * account-number link, extended with generic `dimensionGroupBy`/`dimensionId`/
 * `dimensionValue` fields — `dimensionGroupBy` carries the groupByValue key
 * ('bpartner'/'product'/'project'/'costcenter'), which both this report's and
 * General Ledger's own contracts share, so `ReportViewerPage.jsx`'s
 * `TRIAL_BALANCE_DIMENSION_PARAM_NAMES` map resolves it to the right GL param
 * (bPartnerId/productId/projectId/costCenterId) rather than hardcoding one
 * dimension.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';
import { expandBrandingPartial } from './reportBrandingPartialHelper.js';

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-trial-balance');

function renderGrouped(groupBy, tbGroups) {
  const hb = Handlebars.create();
  const helpersCode = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  registerReportHelpers(hb, helpersCode);
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');
  const template = hb.compile(expandBrandingPartial(templateSrc));
  return template({
    meta: {
      title: 'Trial Balance',
      labels: { account_no: 'Account No.', account_name: 'Name', balanceAsOf: 'Balance As Of', activity_debit: 'Debit', activity_credit: 'Credit' },
      params: { groupBy, accountLevel: 'S', dateFrom: '2026-08-01', dateTo: '2026-08-31' },
      filters: [],
      ui: { subtotal: 'Subtotal', total: 'Total' },
      tbGroups,
    },
  });
}

function oneAccountTwoDimensionRows(dimensionId, dimensionValue) {
  return [
    {
      account_id: 'ACC-1', account_no: '35000000', account_name: 'Productos terminados A',
      opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0,
      dimensionRows: [
        { dimensionValue, dimensionId, opening_balance: 100, activity_debit: 10, activity_credit: 0, closing_balance: 110 },
        { dimensionValue: '', dimensionId: '', opening_balance: 5, activity_debit: 0, activity_credit: 0, closing_balance: 5 },
      ],
    },
  ];
}

describe('report-trial-balance — dimension row drill-down (ETP-5013 follow-up)', () => {
  const cases = [
    { groupBy: 'bpartner', dimensionId: 'BP-1', dimensionValue: 'Blanquiceleste S.A.' },
    { groupBy: 'product', dimensionId: 'PROD-1', dimensionValue: 'Cerveza' },
    { groupBy: 'project', dimensionId: 'PROJ-1', dimensionValue: 'Obra Norte' },
    { groupBy: 'costcenter', dimensionId: 'CC-1', dimensionValue: 'Administración' },
  ];

  for (const { groupBy, dimensionId, dimensionValue } of cases) {
    it(`renders a drill-down link with the right dimensionGroupBy when grouped by "${groupBy}"`, () => {
      const html = renderGrouped(groupBy, oneAccountTwoDimensionRows(dimensionId, dimensionValue));
      const escapedValue = dimensionValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        html,
        new RegExp(
          `<span class="account-link" onclick="window\\.parent\\.postMessage\\(\\{type:'trial-balance-drilldown',accountId:'ACC-1',accountValue:'35000000',accountName:'Productos terminados A',dimensionGroupBy:'${groupBy}',dimensionId:'${dimensionId}',dimensionValue:'${escapedValue}'\\},'\\*'\\)">${escapedValue}<\\/span>`
        )
      );
    });
  }

  it('leaves a dimension row with no dimensionId as plain, non-navigable text', () => {
    const html = renderGrouped('bpartner', oneAccountTwoDimensionRows('BP-1', 'Blanquiceleste S.A.'));
    // The blank-dimensionValue row (no value assigned) must render as a
    // plain empty cell, never wrapped in an account-link span.
    assert.doesNotMatch(html, /dimensionId:''/);
  });

  it('the account-number link (no dimension) never carries dimensionGroupBy/dimensionId', () => {
    const html = renderGrouped('bpartner', oneAccountTwoDimensionRows('BP-1', 'Blanquiceleste S.A.'));
    const accountLinkMatch = html.match(/<span class="account-link"[^>]*>35000000<\/span>/);
    assert.ok(accountLinkMatch, 'expected the account-number link');
    assert.doesNotMatch(accountLinkMatch[0], /dimensionGroupBy/);
  });

  it('produces exactly one dimension drill-down link per dimension row that has an id', () => {
    const html = renderGrouped('bpartner', [
      {
        account_id: 'ACC-2', account_no: '40000000', account_name: 'Proveedores',
        opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0,
        dimensionRows: [
          { dimensionValue: 'Blanquiceleste S.A.', dimensionId: 'BP-1', opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0 },
          { dimensionValue: 'Juan Perez', dimensionId: 'BP-2', opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0 },
        ],
      },
    ]);
    const dimensionLinks = [...html.matchAll(/dimensionGroupBy:'[^']+'/g)];
    assert.equal(dimensionLinks.length, 2);
  });
});
