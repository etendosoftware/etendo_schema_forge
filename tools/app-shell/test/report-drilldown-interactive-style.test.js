/**
 * ETP-5013 — the drill-down link styling (blue `#2563eb` + underline) on the
 * 6 templates below must only render when `meta.isInteractive` is true (the
 * embedded on-screen preview, where the span's `onclick` postMessage
 * actually reaches a listening parent window). PDF/Excel/CSV are static
 * exports where the exact same `onclick` does nothing, so link-styling it
 * blue was a false "this is clickable" affordance — see report-api.js /
 * server.js's own `isInteractive` derivation and this file's sibling
 * `report-api-is-interactive.test.js`.
 *
 * Renders each template with REAL Handlebars (registerReportHelpers +
 * expandReportPartials, same composition report-api.js uses) once with
 * `meta.isInteractive: true` and once with `false`, and asserts:
 *   1. The link CSS rule (color: #2563eb) is present only when true.
 *   2. The `onclick="window.parent.postMessage(...)"` markup on the
 *      drill-down span is present in BOTH cases — the fix only changes the
 *      visual style, never the underlying (still-functional) interactive
 *      preview behavior.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

const _require = createRequire(import.meta.url);

const ARTIFACTS_ROOT = fileURLToPath(new URL('../../../artifacts', import.meta.url));
const PARTIALS_ROOT = fileURLToPath(new URL('../../../templates/reports', import.meta.url));

const BRANDING_PARTIAL = readFileSync(`${PARTIALS_ROOT}/document-branding.hbs`, 'utf8');

function expandReportPartials(templateContent) {
  return templateContent.replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);
}

function renderTemplate(reportId, data) {
  const Handlebars = _require('handlebars');
  registerReportHelpers(Handlebars, '');
  const raw = readFileSync(`${ARTIFACTS_ROOT}/${reportId}/template.hbs`, 'utf8');
  const template = Handlebars.compile(expandReportPartials(raw));
  return template(data);
}

/** Every drill-down span's onclick handler must reach a listening parent
 * window regardless of isInteractive — asserts the exact postMessage type. */
function assertOnclickPresent(html, messageType) {
  const re = new RegExp(`onclick="window\\.parent\\.postMessage\\(\\{type:'${messageType}'`);
  assert.match(html, re, `onclick postMessage for '${messageType}' must always be present, regardless of isInteractive`);
}

/**
 * `@media print` neutralizes the drill-down link style for BOTH static
 * exports (isInteractive: false, jsreport chrome-pdf emulates print media)
 * AND the browser's own Cmd+P print of the live interactive preview
 * (isInteractive stays true there — the page never round-trips through our
 * `/render?format=pdf` endpoint, so the `{{#if meta.isInteractive}}` block
 * cannot see that request). Unlike that `{{#if}}` block, `@media print` must
 * be present in the compiled HTML unconditionally — its own gating happens
 * client-side via the CSS media query, not at template-render time.
 */
function assertMediaPrintRule(html, selectors) {
  const escaped = selectors.map((s) => s.replace(/\./g, '\\.')).join(',\\s*');
  const re = new RegExp(
    `@media print \\{\\s*${escaped} \\{([^}]*)\\}\\s*\\}`
  );
  const match = html.match(re);
  assert.ok(match, `expected an always-present "@media print { ${selectors.join(', ')} { ... } }" rule`);
  return match[1];
}

/** Every property inside the @media print override must carry !important —
 * otherwise the base (non-print) rule, which is more specific in some
 * browsers' cascade for repeated class selectors, could still win. */
function assertAllImportant(ruleBody) {
  const declarations = ruleBody
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  assert.ok(declarations.length > 0, 'expected at least one declaration in the @media print rule');
  for (const decl of declarations) {
    assert.match(decl, /!important$/, `declaration "${decl}" must end with !important`);
  }
}

describe('Drill-down link styling only renders when meta.isInteractive (ETP-5013)', () => {
  describe('report-trial-balance — .account-link', () => {
    const baseData = {
      meta: {
        params: { groupBy: '', accountLevel: 'S', dateFrom: '2024-01-01', dateTo: '2024-12-31' },
        labels: {},
        ui: { total: 'Total' },
      },
      rows: [{ account_id: '1', account_no: '100', account_name: 'Cash', opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0 }],
    };

    it('shows the blue underlined style when isInteractive is true', () => {
      const html = renderTemplate('report-trial-balance', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      assert.match(html, /\.account-link\s*\{[^}]*#2563eb/);
    });

    it('hides the link style when isInteractive is false', () => {
      const html = renderTemplate('report-trial-balance', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assert.doesNotMatch(html, /\.account-link\s*\{[^}]*#2563eb/);
      assert.doesNotMatch(html, /#2563eb/);
    });

    it('keeps the onclick drill-down handler regardless of isInteractive', () => {
      const interactive = renderTemplate('report-trial-balance', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('report-trial-balance', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'trial-balance-drilldown');
      assertOnclickPresent(staticHtml, 'trial-balance-drilldown');
    });

    it('always emits the @media print override for .account-link, regardless of isInteractive (browser Cmd+P case)', () => {
      const interactive = renderTemplate('report-trial-balance', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('report-trial-balance', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      const bodyInteractive = assertMediaPrintRule(interactive, ['.account-link']);
      const bodyStatic = assertMediaPrintRule(staticHtml, ['.account-link']);
      assertAllImportant(bodyInteractive);
      assertAllImportant(bodyStatic);
    });
  });

  describe('report-general-ledger — .gl-date-link', () => {
    const baseData = {
      meta: {
        params: { groupBy: '', showDimensions: 'false' },
        labels: {},
        descriptionLabel: 'Description',
        ui: { initialBalance: 'Initial balance', subtotal: 'Subtotal', total: 'Total' },
        groups: [{
          dimensionValue: null,
          accounts: [{
            value: '100', name: 'Cash',
            opening: { amtacctdr: 0, amtacctcr: 0, total: 0 },
            subtotal: { amtacctdr: 0, amtacctcr: 0, total: 0 },
            total: { amtacctdr: 0, amtacctcr: 0, total: 0 },
            rows: [{ fact_acct_group_id: 'g1', dateacct: '2024-01-01', amtacctdr: 0, amtacctcr: 0, runningBalance: 0, groupbyname: '' }],
          }],
        }],
      },
    };

    it('shows the blue underlined style when isInteractive is true', () => {
      const html = renderTemplate('report-general-ledger', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      assert.match(html, /\.gl-date-link\s*\{[^}]*#2563eb/);
    });

    it('hides the link style when isInteractive is false', () => {
      const html = renderTemplate('report-general-ledger', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assert.doesNotMatch(html, /\.gl-date-link\s*\{[^}]*#2563eb/);
      assert.doesNotMatch(html, /#2563eb/);
    });

    it('keeps the onclick drill-down handler regardless of isInteractive', () => {
      const interactive = renderTemplate('report-general-ledger', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('report-general-ledger', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'gl-entry-drilldown');
      assertOnclickPresent(staticHtml, 'gl-entry-drilldown');
    });

    it('always emits the @media print override for .gl-date-link, regardless of isInteractive (browser Cmd+P case)', () => {
      const interactive = renderTemplate('report-general-ledger', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('report-general-ledger', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      const bodyInteractive = assertMediaPrintRule(interactive, ['.gl-date-link']);
      const bodyStatic = assertMediaPrintRule(staticHtml, ['.gl-date-link']);
      assertAllImportant(bodyInteractive);
      assertAllImportant(bodyStatic);
    });
  });

  describe('report-journal-entries — .entry-link', () => {
    const baseData = {
      meta: {
        params: { showDimensions: 'false', showEntryDescription: 'false' },
        labels: {},
        locale: 'en_US',
      },
      rows: [{ fact_acct_group_id: 'g1', doc_window: 'sales-invoice', record_id: 'inv-1', entry_no: 'JE-1', dateacct: '2024-01-01', docbasetype: 'ARI', isreturn: 'N', document_type: 'Invoice', account_no: '100', account_name: 'Cash', amtacctdr: 0, amtacctcr: 0 }],
    };

    it('shows the blue underlined style when isInteractive is true', () => {
      const html = renderTemplate('report-journal-entries', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      assert.match(html, /\.entry-link\s*\{[^}]*#2563eb/);
    });

    it('hides the link style when isInteractive is false', () => {
      const html = renderTemplate('report-journal-entries', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assert.doesNotMatch(html, /\.entry-link\s*\{[^}]*#2563eb/);
      assert.doesNotMatch(html, /#2563eb/);
    });

    it('keeps the onclick drill-down handler regardless of isInteractive', () => {
      const interactive = renderTemplate('report-journal-entries', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('report-journal-entries', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'navigate-invoice');
      assertOnclickPresent(staticHtml, 'navigate-invoice');
    });

    it('always emits the @media print override for .entry-link, regardless of isInteractive (browser Cmd+P case)', () => {
      const interactive = renderTemplate('report-journal-entries', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('report-journal-entries', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      const bodyInteractive = assertMediaPrintRule(interactive, ['.entry-link']);
      const bodyStatic = assertMediaPrintRule(staticHtml, ['.entry-link']);
      assertAllImportant(bodyInteractive);
      assertAllImportant(bodyStatic);
    });
  });

  describe('aging-payable — .bp-drilldown-link and .doc-link', () => {
    const detailData = {
      meta: {
        showDetails: true, labels: {}, column1: '30', column2: '60', column3: '90', column4: '120', lastBucketLabel: '150+',
        showBucket2: false, showBucket3: false, showBucket4: false,
      },
      rows: [{ bPartner: 'ACME Corp', docs: [{ invoiceId: 'inv-1', docNo: 'INV-001', dateInvoiced: '2024-01-01', current: 0, days30: 0 }] }],
    };
    const summaryData = {
      meta: {
        showDetails: false, labels: {}, column1: '30', column2: '60', column3: '90', column4: '120', lastBucketLabel: '150+',
        showBucket2: false, showBucket3: false, showBucket4: false,
      },
      rows: [{ bPartnerId: 'bp-1', bPartner: 'ACME Corp', current: 0, days30: 0, days150plus: 0, total: 0, credits: 0, net: 0 }],
    };

    it('shows both link styles when isInteractive is true', () => {
      const html = renderTemplate('aging-payable', { ...detailData, meta: { ...detailData.meta, isInteractive: true } });
      assert.match(html, /\.bp-drilldown-link\s*\{[^}]*#2563eb/);
      assert.match(html, /\.doc-link\s*\{[^}]*#2563eb/);
    });

    it('hides both link styles when isInteractive is false', () => {
      const html = renderTemplate('aging-payable', { ...detailData, meta: { ...detailData.meta, isInteractive: false } });
      assert.doesNotMatch(html, /#2563eb/);
    });

    it('keeps the doc-link onclick handler (detail view) regardless of isInteractive', () => {
      const interactive = renderTemplate('aging-payable', { ...detailData, meta: { ...detailData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('aging-payable', { ...detailData, meta: { ...detailData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'navigate-invoice');
      assertOnclickPresent(staticHtml, 'navigate-invoice');
    });

    it('keeps the bp-drilldown-link onclick handler (summary view) regardless of isInteractive', () => {
      const interactive = renderTemplate('aging-payable', { ...summaryData, meta: { ...summaryData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('aging-payable', { ...summaryData, meta: { ...summaryData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'aging-drilldown');
      assertOnclickPresent(staticHtml, 'aging-drilldown');
    });

    it('always emits a single @media print override covering both .bp-drilldown-link and .doc-link, regardless of isInteractive (browser Cmd+P case)', () => {
      const interactive = renderTemplate('aging-payable', { ...detailData, meta: { ...detailData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('aging-payable', { ...detailData, meta: { ...detailData.meta, isInteractive: false } });
      const bodyInteractive = assertMediaPrintRule(interactive, ['.bp-drilldown-link', '.doc-link']);
      const bodyStatic = assertMediaPrintRule(staticHtml, ['.bp-drilldown-link', '.doc-link']);
      assertAllImportant(bodyInteractive);
      assertAllImportant(bodyStatic);
    });
  });

  describe('aging-receivable — .bp-drilldown-link and .doc-link', () => {
    const detailData = {
      meta: {
        showDetails: true, labels: {}, column1: '30', column2: '60', column3: '90', column4: '120', lastBucketLabel: '150+',
        showBucket2: false, showBucket3: false, showBucket4: false,
      },
      rows: [{ bPartner: 'ACME Corp', docs: [{ invoiceId: 'inv-1', docNo: 'INV-001', dateInvoiced: '2024-01-01', current: 0, days30: 0 }] }],
    };
    const summaryData = {
      meta: {
        showDetails: false, labels: {}, column1: '30', column2: '60', column3: '90', column4: '120', lastBucketLabel: '150+',
        showBucket2: false, showBucket3: false, showBucket4: false,
      },
      rows: [{ bPartnerId: 'bp-1', bPartner: 'ACME Corp', current: 0, days30: 0, days150plus: 0, total: 0, credits: 0, net: 0 }],
    };

    it('shows both link styles when isInteractive is true', () => {
      const html = renderTemplate('aging-receivable', { ...detailData, meta: { ...detailData.meta, isInteractive: true } });
      assert.match(html, /\.bp-drilldown-link\s*\{[^}]*#2563eb/);
      assert.match(html, /\.doc-link\s*\{[^}]*#2563eb/);
    });

    it('hides both link styles when isInteractive is false', () => {
      const html = renderTemplate('aging-receivable', { ...detailData, meta: { ...detailData.meta, isInteractive: false } });
      assert.doesNotMatch(html, /#2563eb/);
    });

    it('keeps the doc-link onclick handler (detail view) regardless of isInteractive', () => {
      const interactive = renderTemplate('aging-receivable', { ...detailData, meta: { ...detailData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('aging-receivable', { ...detailData, meta: { ...detailData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'navigate-invoice');
      assertOnclickPresent(staticHtml, 'navigate-invoice');
    });

    it('keeps the bp-drilldown-link onclick handler (summary view) regardless of isInteractive', () => {
      const interactive = renderTemplate('aging-receivable', { ...summaryData, meta: { ...summaryData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('aging-receivable', { ...summaryData, meta: { ...summaryData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'aging-drilldown');
      assertOnclickPresent(staticHtml, 'aging-drilldown');
    });

    it('always emits a single @media print override covering both .bp-drilldown-link and .doc-link, regardless of isInteractive (browser Cmd+P case)', () => {
      const interactive = renderTemplate('aging-receivable', { ...detailData, meta: { ...detailData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('aging-receivable', { ...detailData, meta: { ...detailData.meta, isInteractive: false } });
      const bodyInteractive = assertMediaPrintRule(interactive, ['.bp-drilldown-link', '.doc-link']);
      const bodyStatic = assertMediaPrintRule(staticHtml, ['.bp-drilldown-link', '.doc-link']);
      assertAllImportant(bodyInteractive);
      assertAllImportant(bodyStatic);
    });
  });

  describe('tax-report — .doc-link', () => {
    const baseData = {
      meta: {
        showDetails: true, groupByBp: false, labels: {},
        params: { transactionType: 'P' },
        ui: { total: 'Total' },
      },
      rows: {
        purchase: {
          detail: [{
            taxName: 'IVA 21%', taxBaseAmt: 0, taxAmt: 0, totalAmt: 0,
            docs: [{ invoiceId: 'inv-1', docNo: 'F-001', docType: 'Invoice', docDate: '2024-01-01', acctDate: '2024-01-01', bPartner: 'ACME', bpCountry: 'ES', bpRegion: '', taxBaseAmt: 0, taxAmt: 0, totalAmt: 0 }],
          }],
          summaryByRate: [],
        },
        sales: { detail: [], summaryByRate: [] },
      },
    };

    it('shows the blue underlined style when isInteractive is true', () => {
      const html = renderTemplate('tax-report', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      assert.match(html, /\.doc-link\s*\{[^}]*#2563eb/);
    });

    it('hides the link style when isInteractive is false', () => {
      const html = renderTemplate('tax-report', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assert.doesNotMatch(html, /#2563eb/);
    });

    it('keeps the onclick drill-down handler regardless of isInteractive (groupByBp=false path)', () => {
      const interactive = renderTemplate('tax-report', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('tax-report', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'navigate-invoice');
      assertOnclickPresent(staticHtml, 'navigate-invoice');
    });

    it('keeps the onclick drill-down handler regardless of isInteractive (groupByBp=true path)', () => {
      const groupedData = {
        ...baseData,
        rows: {
          purchase: {
            detail: [{
              taxName: 'IVA 21%', taxBaseAmt: 0, taxAmt: 0, totalAmt: 0,
              bpGroups: [{ bPartner: 'ACME', taxBaseAmt: 0, taxAmt: 0, totalAmt: 0, docs: [{ invoiceId: 'inv-1', docNo: 'F-001', docType: 'Invoice', docDate: '2024-01-01', acctDate: '2024-01-01', bpCountry: 'ES', bpRegion: '', taxBaseAmt: 0, taxAmt: 0, totalAmt: 0 }] }],
            }],
            summaryByRate: [],
          },
          sales: { detail: [], summaryByRate: [] },
        },
        meta: { ...baseData.meta, groupByBp: true },
      };
      const interactive = renderTemplate('tax-report', { ...groupedData, meta: { ...groupedData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('tax-report', { ...groupedData, meta: { ...groupedData.meta, isInteractive: false } });
      assertOnclickPresent(interactive, 'navigate-invoice');
      assertOnclickPresent(staticHtml, 'navigate-invoice');
    });

    it('always emits the @media print override for .doc-link, regardless of isInteractive (browser Cmd+P case)', () => {
      const interactive = renderTemplate('tax-report', { ...baseData, meta: { ...baseData.meta, isInteractive: true } });
      const staticHtml = renderTemplate('tax-report', { ...baseData, meta: { ...baseData.meta, isInteractive: false } });
      const bodyInteractive = assertMediaPrintRule(interactive, ['.doc-link']);
      const bodyStatic = assertMediaPrintRule(staticHtml, ['.doc-link']);
      assertAllImportant(bodyInteractive);
      assertAllImportant(bodyStatic);
    });
  });
});
