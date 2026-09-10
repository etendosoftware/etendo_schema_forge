import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Handlebars from 'handlebars';
import {
  registerReportHelpers,
  buildJsreportHelpersString,
} from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-5013 — report-trial-balance ("Balance de Sumas y Saldos") grouped view.
//
// The ETP-4898 grouped layout nested ACCOUNTS inside a DIMENSION card (one
// block per contact/product/project, with that dimension's accounts listed
// inside). That is structurally wrong accounting: summing an unrelated set of
// accounts for one contact has no meaning, and the card's "total" row always
// netted to ~0. Classic's real Trial Balance (verified against a real Classic
// PDF export) does the exact inverse: ONE BLOCK PER ACCOUNT, with that
// account's dimension breakdown nested inside, closing with the account's own
// balance — a number that actually means something.
//
// Visually the blocks must read as ONE continuous table: the column header
// row is emitted only on the first block, never repeated per account.
//
// Every assertion compiles the REAL .hbs files from disk (never a hardcoded
// copy) so a future edit that reverts the nesting, repeats the header, or
// leaks a literal 'undefined' into the blank-dimension row fails here.

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-trial-balance');
const HELPERS_CODE = readFileSync(join(ARTIFACT_DIR, 'helpers.js'), 'utf8');
// ETP-5013 added `{{> document-branding}}` to template.hbs's .report-header —
// NOT a native Handlebars partial (see report-api.js's own comment on
// expandReportPartials), so it must be string-expanded before compiling or
// Handlebars throws "The partial document-branding could not be found".
const BRANDING_PARTIAL = readFileSync(
  join(import.meta.dirname, '../../../templates/reports/document-branding.hbs'), 'utf8');
const TEMPLATE_SRC = readFileSync(join(ARTIFACT_DIR, 'template.hbs'), 'utf8')
  .replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);

const LABELS = {
  account_no: 'Nº Cuenta',
  account_name: 'Nombre',
  opening_balance: 'Saldo inicial',
  activity_debit: 'Debe',
  activity_credit: 'Haber',
  closing_balance: 'Saldo final',
  balanceAsOf: 'Saldo a',
};

// Real GO-client shape: account 35000000 has a blank-dimension bucket (rows
// whose contact was never set) plus four named contacts; 43000000 is a second
// account, so the "header renders once" rule has something to be violated by.
const TB_GROUPS = [
  {
    account_no: '35000000', account_id: 'ACC-35', account_name: 'Productos terminados',
    dimensionRows: [
      { dimensionValue: '', opening_balance: 159193.58, activity_debit: 0, activity_credit: 0, closing_balance: 159193.58 },
      { dimensionValue: 'Juan Perez', opening_balance: -141413.14, activity_debit: 0, activity_credit: 640.52, closing_balance: -142053.66 },
    ],
    opening_balance: 17780.44, activity_debit: 0, activity_credit: 640.52, closing_balance: 17139.92,
  },
  {
    account_no: '43000000', account_id: 'ACC-43', account_name: 'Clientes',
    dimensionRows: [
      { dimensionValue: 'Laura Morat', opening_balance: -3275.78, activity_debit: 10, activity_credit: 0, closing_balance: -3265.78 },
    ],
    opening_balance: -3275.78, activity_debit: 10, activity_credit: 0, closing_balance: -3265.78,
  },
];

const FLAT_ROWS = [
  { account_no: '35000000', account_id: 'ACC-35', account_name: 'Productos terminados', opening_balance: 17780.44, activity_debit: 0, activity_credit: 640.52, closing_balance: 17139.92 },
  { account_no: '43000000', account_id: 'ACC-43', account_name: 'Clientes', opening_balance: -3275.78, activity_debit: 10, activity_credit: 0, closing_balance: -3265.78 },
];

function buildMeta({ groupBy, grouped }) {
  return {
    title: 'Balance de Sumas y Saldos',
    generatedAt: '2026-08-19T00:00:00.000Z',
    recordCount: FLAT_ROWS.length,
    params: { accountLevel: 'S', groupBy, dateFrom: '2026-01-01', dateTo: '2026-01-31' },
    labels: LABELS,
    ui: { records: 'registros', total: 'Total', generatedBy: 'Etendo Go' },
    dimensionLabel: grouped ? 'Contacto' : null,
    dimensionField: grouped ? 'bpname' : null,
    tbGroups: grouped ? TB_GROUPS : null,
    filters: [],
    totals: {},
  };
}

function renderHtml({ groupBy = 'bpartner', grouped = true } = {}) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  return hb.compile(TEMPLATE_SRC)({
    css: '', meta: buildMeta({ groupBy, grouped }), rows: FLAT_ROWS,
  });
}

// ── Part 1: template.hbs grouped branch — one block per ACCOUNT ─────────────

describe('report-trial-balance — grouped branch renders one block per ACCOUNT (ETP-5013)', () => {
  it('emits one acct-block table per account in tbGroups', () => {
    const html = renderHtml();
    const blocks = html.match(/<table class="report-table acct-block"/g) || [];
    assert.equal(blocks.length, TB_GROUPS.length, 'expected exactly one table per account');
  });

  it('emits the column header EXACTLY ONCE across all account blocks', () => {
    // The whole point of the `{{#ifCond @index '===' 0}}` guard: the blocks
    // must read as one continuous table, like Classic's PDF. A header per
    // block was the first (wrong) shape this replaced.
    const html = renderHtml();
    assert.equal((html.match(/<thead>/g) || []).length, 1, 'the column header must not repeat per account block');
    assert.equal((html.match(/Nº Cuenta/g) || []).length, 1);
  });

  it('closes each block with the account\'s own totals row', () => {
    const html = renderHtml();
    const totalRows = html.match(/<tr class="acct-total">[\s\S]*?<\/tr>/g) || [];
    assert.equal(totalRows.length, TB_GROUPS.length);
    assert.match(totalRows[0], /35000000/);
    assert.match(totalRows[0], /Productos terminados/);
    assert.match(totalRows[1], /43000000/);
    assert.match(totalRows[1], /Clientes/);
  });

  it('renders the account\'s own totals (not a ~0 net of unrelated accounts)', () => {
    const html = renderHtml();
    const totalRow = (html.match(/<tr class="acct-total">[\s\S]*?<\/tr>/g) || [])[0];
    // formatCurrency's real output — es-ES grouping, comma decimal.
    assert.match(totalRow, /17\.780,44/, 'opening_balance must be the account total, grouped and comma-decimal');
    assert.match(totalRow, /640,52/);
    assert.match(totalRow, /17\.139,92/);
  });

  it('renders the blank-dimension bucket as an empty name cell, never "null"/"undefined"', () => {
    const html = renderHtml();
    const firstBlock = html.slice(html.indexOf('<tbody>'), html.indexOf('<tr class="acct-total">'));
    // First data row is the '' bucket: empty account-code cell AND empty name cell.
    assert.match(firstBlock, /<tr>\s*<td><\/td>\s*<td><\/td>/, 'the no-dimension row must render two empty cells');
    assert.doesNotMatch(html, />undefined</, 'a missing dimension value must never print as "undefined"');
    assert.doesNotMatch(html, />null</, 'a missing dimension value must never print as "null"');
    // ...and the row's amounts are still there, so it is not silently dropped.
    assert.match(firstBlock, /159\.193,58/);
  });

  it('puts the dimension value in the description column, with an empty account-code cell', () => {
    const html = renderHtml();
    const firstBlock = html.slice(html.indexOf('<tbody>'), html.indexOf('<tr class="acct-total">'));
    assert.match(firstBlock, /<td><\/td>\s*<td>Juan Perez<\/td>/);
  });

  it('never repeats the account code on the dimension rows (it belongs to the total row)', () => {
    const html = renderHtml();
    const firstBlockDimRows = html.slice(html.indexOf('<tbody>'), html.indexOf('<tr class="acct-total">'));
    assert.ok(!firstBlockDimRows.includes('35000000'),
      'the account code must appear only on the block\'s closing total row');
    assert.match(firstBlockDimRows, /159\.193,58/, 'sanity: this really is the dimension-rows slice');
  });

  it('renders the acct-block styles and NOT the removed dim-group card selectors', () => {
    assert.match(TEMPLATE_SRC, /\.acct-block \{/);
    for (const removed of ['.dim-group {', '.dim-group-head', '.dim-group-body']) {
      assert.ok(!TEMPLATE_SRC.includes(removed),
        `the dimension-outer "${removed}" selector must not come back`);
    }
    // No markup uses the class either (the header comment may still mention it).
    assert.doesNotMatch(TEMPLATE_SRC, /class="[^"]*dim-group/);
  });

  it('scopes the heavy between-blocks separator to .acct-block, so it cannot leak into the flat Total row', () => {
    // `.acct-total` is the SAME class the flat (ungrouped) branch uses for its
    // single grand-total row. A bare `.acct-total td { border-bottom: 2px ... }`
    // rule therefore also drew a heavy line under the flat view's Total — the
    // exact regression this scoping fixes.
    const style = TEMPLATE_SRC.slice(TEMPLATE_SRC.indexOf('<style>'), TEMPLATE_SRC.indexOf('</style>'));
    const rules = style.split('\n').filter((l) => /border-bottom:\s*2px/.test(l));
    assert.ok(rules.length > 0, 'expected a heavy between-blocks separator rule');
    for (const rule of rules) {
      assert.match(rule, /^\.acct-block\b/, `the heavy separator must be scoped to .acct-block, got: ${rule.trim()}`);
    }
    // And suppressed on the last block, where it separates nothing.
    assert.match(style, /\.acct-block:last-of-type \.acct-total td \{[^}]*border-bottom:\s*none/);
  });

  it('never renders a "Missing helper" fallback in the grouped branch', () => {
    assert.ok(!renderHtml().includes('Missing helper'));
  });
});

// ── Part 2: the FLAT branch must be untouched ───────────────────────────────

describe('report-trial-balance — flat (ungrouped) branch is unaffected (ETP-5013)', () => {
  const flatHtml = renderHtml({ groupBy: '', grouped: false });

  it('renders a single plain report-table, with no account blocks at all', () => {
    // Scoped to <body>: the .acct-block CSS rule always ships in <style>, it is
    // the MARKUP that must not use it when ungrouped.
    const body = flatHtml.slice(flatHtml.indexOf('<body>'));
    assert.ok(!body.includes('acct-block'), 'the flat branch must not emit account blocks');
    assert.equal((body.match(/<table class="report-table"/g) || []).length, 1);
    assert.equal((body.match(/<thead>/g) || []).length, 1);
  });

  it('renders one row per account with the account code in the FIRST cell', () => {
    const body = flatHtml.slice(flatHtml.indexOf('<tbody>'), flatHtml.indexOf('</tbody>'));
    assert.match(body, /<td><span class="account-link"[\s\S]*?>35000000<\/span><\/td>\s*<td>Productos terminados<\/td>/);
    assert.match(body, /<td><span class="account-link"[\s\S]*?>43000000<\/span><\/td>\s*<td>Clientes<\/td>/);
  });

  it('still closes with the grand-total row spanning the first two columns', () => {
    // colspan="2" + the ui.total label is the flat branch's own footer — the
    // grouped branch has no such row, so this is what pins the two apart.
    assert.match(flatHtml, /<tr class="acct-total">\s*<td colspan="2">Total<\/td>/);
  });

  it('sums the amount columns across ALL rows via sumField (the flat grand total)', () => {
    const totalStart = flatHtml.indexOf('<td colspan="2">Total</td>');
    const totalRow = flatHtml.slice(totalStart, flatHtml.indexOf('</tr>', totalStart));
    // 17780.44 + (-3275.78) = 14504.66 ; 0 + 10 = 10 ; 17139.92 + (-3265.78) = 13874.14
    assert.match(totalRow, /14\.504,66/);
    assert.match(totalRow, /13\.874,14/);
  });

  it('keeps the flat branch\'s per-row lookup form in the source (not the grouped `this.` form)', () => {
    const flatBranch = TEMPLATE_SRC.slice(TEMPLATE_SRC.indexOf('{{else}}'));
    assert.match(flatBranch, /\{\{#each rows\}\}/);
    assert.match(flatBranch, /\{\{lookup this 'account_no'\}\}/);
    assert.match(flatBranch, /\{\{formatCurrency \(lookup this 'opening_balance'\)\}\}/);
    assert.match(flatBranch, /\{\{formatCurrency \(sumField rows 'closing_balance'\)\}\}/);
  });
});

// ── Part 3: Excel/CSV exports — dimension column only when grouped ─────────

function renderExcel({ grouped }) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  const src = readFileSync(join(ARTIFACT_DIR, 'template-excel.hbs'), 'utf8');
  return hb.compile(src)({ css: '', meta: buildMeta({ groupBy: grouped ? 'bpartner' : '', grouped }), rows: exportRows(grouped) });
}

function renderCsv({ grouped }) {
  // Same helper-string path report-api.js uses for jsreport, so csvField is the
  // REAL shipped helper (see tax-report-excel-csv-templates.test.js).
  const built = buildJsreportHelpersString(HELPERS_CODE);
  const helperNames = [...built.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  // eslint-disable-next-line no-new-func
  const helpers = new Function(`${built}\nreturn { ${helperNames.join(', ')} };`)();
  const hb = Handlebars.create();
  for (const [name, fn] of Object.entries(helpers)) hb.registerHelper(name, fn);
  const src = readFileSync(join(ARTIFACT_DIR, 'template-csv.hbs'), 'utf8');
  return hb.compile(src)({ meta: buildMeta({ groupBy: grouped ? 'bpartner' : '', grouped }), rows: exportRows(grouped) });
}

// The exports are always FLAT (one row per account, or per account×dimension
// when grouped) — even though the HTML/PDF view nests into account blocks.
function exportRows(grouped) {
  if (!grouped) return FLAT_ROWS;
  return [
    { account_no: '35000000', account_name: 'Productos terminados', dimensionValue: '', opening_balance: 159193.58, activity_debit: 0, activity_credit: 0, closing_balance: 159193.58 },
    { account_no: '35000000', account_name: 'Productos terminados', dimensionValue: 'Juan, Perez', opening_balance: -141413.14, activity_debit: 0, activity_credit: 640.52, closing_balance: -142053.66 },
  ];
}

describe('report-trial-balance — template-excel.hbs dimension column (ETP-5013)', () => {
  it('adds the dimension header, labelled with meta.dimensionLabel, when grouped', () => {
    const html = renderExcel({ grouped: true });
    const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    assert.match(head, /<th>Nombre<\/th>\s*<th>Contacto<\/th>\s*<th>Saldo inicial<\/th>/,
      'the dimension column must sit between the account name and the amounts');
  });

  it('fills the dimension cell per row when grouped', () => {
    const html = renderExcel({ grouped: true });
    assert.match(html, /<td>Productos terminados<\/td>\s*<td>Juan, Perez<\/td>/);
  });

  it('keeps the blank-dimension row as an empty cell, not a dropped column', () => {
    const html = renderExcel({ grouped: true });
    // Header has 7 columns when grouped; every body row must too, blank or not.
    const bodyRows = html.slice(html.indexOf('<tbody>')).match(/<tr>[\s\S]*?<\/tr>/g) || [];
    assert.equal(bodyRows.length, 2);
    for (const row of bodyRows) {
      assert.equal((row.match(/<td/g) || []).length, 7, 'grouped rows must have 7 cells');
    }
    assert.doesNotMatch(html, />undefined</);
  });

  it('keeps amount cells numeric and RAW (never formatCurrency) in the grouped export', () => {
    const html = renderExcel({ grouped: true });
    assert.match(html, /<td data-cell-type="number">159193\.58<\/td>/);
    assert.doesNotMatch(html, /159\.193,58/, 'Excel amounts must never go through formatCurrency');
  });

  it('is byte-for-byte unchanged when ungrouped — no dimension column at all', () => {
    const html = renderExcel({ grouped: false });
    const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    assert.equal((head.match(/<th>/g) || []).length, 6, 'ungrouped export must keep exactly 6 columns');
    assert.match(head, /<th>Nombre<\/th>\s*<th>Saldo inicial<\/th>/, 'nothing may slip between name and amounts');
    assert.ok(!html.includes('Contacto'), 'the dimension label must not leak into an ungrouped export');
    const bodyRows = html.slice(html.indexOf('<tbody>')).match(/<tr>[\s\S]*?<\/tr>/g) || [];
    assert.equal(bodyRows.length, 2);
    for (const row of bodyRows) {
      assert.equal((row.match(/<td/g) || []).length, 6, 'ungrouped rows must have 6 cells');
    }
  });
});

describe('report-trial-balance — template-csv.hbs dimension column (ETP-5013)', () => {
  it('is byte-for-byte unchanged when ungrouped (exact golden output)', () => {
    // A full golden string, not a regex: a stray comma, a shifted column or an
    // accidental blank field is the whole risk here, and a loose match would
    // sail past all three.
    assert.equal(renderCsv({ grouped: false }),
      'Nº Cuenta,Nombre,Saldo inicial,Debe,Haber,Saldo final\n'
      + '35000000,Productos terminados,17780.44,0,640.52,17139.92\n'
      + '43000000,Clientes,-3275.78,10,0,-3265.78\n');
  });

  it('inserts exactly one dimension column, after the account name, when grouped', () => {
    assert.equal(renderCsv({ grouped: true }),
      'Nº Cuenta,Nombre,Contacto,Saldo inicial,Debe,Haber,Saldo final\n'
      + '35000000,Productos terminados,,159193.58,0,0,159193.58\n'
      + '35000000,Productos terminados,"Juan, Perez",-141413.14,0,640.52,-142053.66\n');
  });

  it('every ungrouped line has the same field count as the header (no trailing comma)', () => {
    const lines = renderCsv({ grouped: false }).trimEnd().split('\n');
    const counts = lines.map((l) => l.split(',').length);
    assert.deepEqual(counts, [6, 6, 6]);
  });

  it('quotes a dimension value containing a comma, and never HTML-escapes it', () => {
    const csv = renderCsv({ grouped: true });
    assert.match(csv, /"Juan, Perez"/);
    assert.doesNotMatch(csv, /&quot;/, 'csvField output must use {{{ }}}, never {{ }}');
    assert.doesNotMatch(csv, /&#x27;|&amp;/);
  });

  it('renders the blank-dimension row as an empty field, keeping the column count', () => {
    const lines = renderCsv({ grouped: true }).trimEnd().split('\n');
    assert.match(lines[1], /^35000000,Productos terminados,,/, 'blank dimension is an empty field, not a missing one');
    assert.doesNotMatch(lines[1], /undefined|null/);
  });
});
