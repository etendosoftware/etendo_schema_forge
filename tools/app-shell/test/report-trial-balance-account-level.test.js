import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';
import { pickLabel } from '@etendosoftware/schema-forge-cli/src/report-i18n.js';
import { filterAndTransformParams } from '@etendosoftware/schema-forge-cli/src/report-filters.js';

// ETP-4898 — report-trial-balance ("Balance de Sumas y Saldos") new
// `accountLevel` parameter.
//
// Mirrors Classic's com.etendoerp.financial.reports.advanced.handler
// .TrialBalanceAdvanced "AccountLevel" parameter (AD Process
// D8E8015B1478473799E47F84796C481C). c_elementvalue.elementlevel holds
// exactly:
//
//   E (Heading / Epígrafe)   -- coarsest summary node
//   C (Account / Cuenta)     -- summary node
//   D (Breakdown / Desglose) -- summary node
//   S (Subaccount)           -- leaf, postable (issummary = 'N')
//
// The rewritten SQL rolls each posted (leaf) account up its ad_treenode
// ancestry and reports the totals at whichever elementlevel the user picked.
// Level 'S' is the pre-change behavior, byte-for-byte.
//
// Every assertion below reads the REAL artifact / plugin source from disk
// (never a hardcoded copy) so a future edit that breaks this behavior fails
// here — same convention as report-trial-balance-opening-entry-amount.test.js.

const ROOT = resolve(import.meta.dirname, '../../..');
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'report-trial-balance');
const CONTRACT = JSON.parse(readFileSync(join(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;
const TEMPLATE_SRC = readFileSync(join(ARTIFACT_DIR, 'template.hbs'), 'utf8');
// ETP-5013 added `{{> document-branding}}` to this template's .report-header.
// It is NOT a native Handlebars partial (see report-api.js's own comment on
// expandReportPartials) — compiling TEMPLATE_SRC as-is throws "The partial
// document-branding could not be found". Only the COMPILED template needs the
// expanded source; the regex-based assertions on TEMPLATE_SRC below (accountLevel
// guards, account-link count) are unaffected by the partial and must keep
// reading the raw file so they still catch drift in the original markup.
const REPORT_TEMPLATES_DIR = join(ROOT, 'templates', 'reports');
const BRANDING_PARTIAL = readFileSync(join(REPORT_TEMPLATES_DIR, 'document-branding.hbs'), 'utf8');
const EXPANDED_TEMPLATE_SRC = TEMPLATE_SRC.replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);

// ── Part 1: contract shape ──────────────────────────────────────────────────

describe('report-trial-balance — accountLevel contract parameter (ETP-4898)', () => {
  const param = CONTRACT.parameters.find((p) => p.name === 'accountLevel');

  it('declares the accountLevel select parameter with the expected shape', () => {
    assert.ok(param, 'expected a parameter named accountLevel');
    assert.equal(param.type, 'select');
    assert.equal(param.required, true);
    assert.equal(param.default, 'S');
    assert.equal(param.section, 'agrupacion');
    assert.equal(param.label.en_US, 'Account Level');
    assert.equal(param.label.es_ES, 'Nivel de cuenta');
  });

  it('declares the "agrupacion" section referenced by the parameter', () => {
    const section = CONTRACT.sections.find((s) => s.id === 'agrupacion');
    assert.ok(section, 'expected a section with id "agrupacion"');
  });

  it('offers exactly the four c_elementvalue.elementlevel values S/D/C/E, in hierarchy order', () => {
    assert.ok(Array.isArray(param.options), 'expected a literal options array');
    assert.deepEqual(param.options.map((o) => o.value), ['S', 'D', 'C', 'E']);
  });

  it('gives every option both an en_US and an es_ES label', () => {
    const expected = {
      S: { en_US: 'Subaccount', es_ES: 'Subcuenta' },
      D: { en_US: 'Breakdown', es_ES: 'Desglose' },
      C: { en_US: 'Account', es_ES: 'Cuenta' },
      E: { en_US: 'Heading', es_ES: 'Epígrafe' },
    };
    for (const opt of param.options) {
      assert.ok(expected[opt.value], `unexpected option value ${opt.value}`);
      assert.equal(opt.label.en_US, expected[opt.value].en_US, `en_US label for ${opt.value}`);
      assert.equal(opt.label.es_ES, expected[opt.value].es_ES, `es_ES label for ${opt.value}`);
    }
  });

  it('the default value is one of the declared options (a postable leaf level)', () => {
    assert.ok(param.options.some((o) => o.value === param.default));
    assert.equal(param.default, 'S');
  });

  it('is declared before groupBy so the "agrupacion" section reads level-then-grouping', () => {
    const names = CONTRACT.parameters.map((p) => p.name);
    assert.ok(names.indexOf('accountLevel') < names.indexOf('groupBy'));
  });
});

// ── Part 2: SQL wiring ──────────────────────────────────────────────────────

/** Slice a named CTE body out of the WITH RECURSIVE chain. */
function extractCte(sql, name) {
  const re = new RegExp(`(?:WITH RECURSIVE |, )${name} AS \\( ([\\s\\S]*?) \\), (?:\\w+ AS \\(|)`);
  const m = sql.match(re);
  if (m) return m[1];
  // Last CTE before the final SELECT.
  const tail = sql.match(new RegExp(`(?:WITH RECURSIVE |, )${name} AS \\( ([\\s\\S]*?) \\) SELECT `));
  return tail ? tail[1] : null;
}

/** Everything after the CTE chain — the outer SELECT. */
function extractFinalSelect(sql) {
  const idx = sql.lastIndexOf(' ) SELECT ');
  assert.notEqual(idx, -1, 'expected a final SELECT after the CTE chain');
  return sql.slice(idx + 3);
}

describe('report-trial-balance — accountLevel SQL wiring (ETP-4898)', () => {
  it('is a WITH RECURSIVE query built from the acct_tree / base / acct_anc CTEs', () => {
    assert.match(SQL, /^WITH RECURSIVE acct_tree AS \(/);
    for (const cte of ['acct_tree', 'base', 'acct_anc']) {
      assert.ok(extractCte(SQL, cte), `expected a CTE named ${cte}`);
    }
  });

  it('acct_tree resolves the account tree from the accounting schema element, with an EV fallback', () => {
    const cte = extractCte(SQL, 'acct_tree');
    assert.match(cte, /FROM ad_treenode n/);
    assert.match(cte, /COALESCE\(/);
    assert.match(cte, /c_acctschema_element ase/);
    assert.match(cte, /ase\.c_acctschema_id = '__ACCTSCHEMAID__'/);
    assert.match(cte, /ase\.elementtype = 'AC'/);
    assert.match(cte, /JOIN c_element e ON e\.c_element_id = ase\.c_element_id/);
    // Fallback: the client's active EV tree.
    assert.match(cte, /FROM ad_tree t WHERE t\.treetype = 'EV' AND t\.isactive = 'Y'/);
  });

  it('base aggregates by account_id plus each dimension\'s id and name columns (not by ev.value)', () => {
    const cte = extractCte(SQL, 'base');
    // Each dimension id (ETP-5013 follow-up) rides alongside its own name
    // column — it's what lets that dimension row's own value become a
    // drill-down link (report-grouping.js's groupByIdField, one per
    // dimension: bpartner_id/product_id/project_id/costcenter_id).
    assert.match(
      cte,
      /GROUP BY fa\.account_id, bp\.c_bpartner_id, bp\.name, p\.m_product_id, p\.name, pj\.c_project_id, pj\.name, cc\.c_costcenter_id, cc\.name/
    );
    assert.doesNotMatch(cte, /GROUP BY ev\.value/);
  });

  it('base still range-filters against the LEAF account value (alias lev), not the ancestor', () => {
    const cte = extractCte(SQL, 'base');
    assert.match(cte, /JOIN c_elementvalue lev ON lev\.c_elementvalue_id = fa\.account_id/);
    assert.match(cte, /\('__FROMACCOUNTID__' = '' OR lev\.value >= '__FROMACCOUNTID__'\)/);
    assert.match(cte, /\('__TOACCOUNTID__' = '' OR lev\.value <= '__TOACCOUNTID__'\)/);
  });

  it('acct_anc is seeded from base (each posted account maps to itself) and recurses upward', () => {
    const cte = extractCte(SQL, 'acct_anc');
    // Seed: FROM base, not FROM acct_tree — keeps recursion small and makes a
    // posted account missing from the tree still surface at level 'S'.
    assert.match(cte, /SELECT DISTINCT b\.account_id AS leaf_id, b\.account_id AS anc_id FROM base b/);
    assert.match(cte, /UNION/);
    assert.match(cte, /FROM acct_anc a JOIN acct_tree t ON t\.node_id = a\.anc_id/);
    assert.match(cte, /t\.parent_id IS NOT NULL/);
    assert.match(cte, /t\.parent_id <> '0'/);
  });

  it('the final SELECT filters on ev.elementlevel = __ACCOUNTLEVEL__', () => {
    const finalSelect = extractFinalSelect(SQL);
    assert.match(finalSelect, /WHERE ev\.elementlevel = '__ACCOUNTLEVEL__'/);
  });

  it('__ACCOUNTLEVEL__ is used only for the elementlevel filter', () => {
    const hits = SQL.match(/__ACCOUNTLEVEL__/g) || [];
    assert.equal(hits.length, 1, 'expected exactly one __ACCOUNTLEVEL__ placeholder');
  });

  it('the final SELECT reports the ANCESTOR account, joined through acct_anc', () => {
    const finalSelect = extractFinalSelect(SQL);
    assert.match(finalSelect, /FROM base b JOIN acct_anc a ON a\.leaf_id = b\.account_id JOIN c_elementvalue ev ON ev\.c_elementvalue_id = a\.anc_id/);
    assert.match(finalSelect, /ev\.value AS account_no/);
    assert.match(finalSelect, /ev\.c_elementvalue_id AS account_id/);
    assert.match(finalSelect, /ev\.name AS account_name/);
  });

  it('the final SELECT preserves the account × dimension grain foldAggregateRows() relies on', () => {
    const finalSelect = extractFinalSelect(SQL);
    for (const col of ['bpartner_id', 'bpname', 'product_id', 'productname', 'project_id', 'projectname', 'costcenter_id', 'costcentername']) {
      assert.match(finalSelect, new RegExp(`b\\.${col}\\b`), `expected ${col} in the final SELECT list`);
    }
    // Each dimension id (ETP-5013 follow-up, extended to all 4) is what lets
    // that dimension row's own value become a drill-down link (see
    // report-grouping.js's groupByIdField) — it must ride along in the
    // SELECT/GROUP BY exactly like its name column does, not as a separate
    // un-grouped column.
    assert.match(
      finalSelect,
      /GROUP BY ev\.value, ev\.c_elementvalue_id, ev\.name, b\.bpartner_id, b\.bpname, b\.product_id, b\.productname, b\.project_id, b\.projectname, b\.costcenter_id, b\.costcentername/
    );
  });

  it('the final SELECT re-sums the four amount columns the contract declares', () => {
    const finalSelect = extractFinalSelect(SQL);
    for (const col of ['opening_balance', 'activity_debit', 'activity_credit', 'closing_balance']) {
      assert.match(finalSelect, new RegExp(`SUM\\(b\\.${col}\\) AS ${col}`), `expected SUM(b.${col})`);
    }
  });

  it('every amount column the contract declares is still produced by the query', () => {
    const amountFields = CONTRACT.columns.filter((c) => c.type === 'amount').map((c) => c.field);
    const finalSelect = extractFinalSelect(SQL);
    for (const field of amountFields) {
      assert.match(finalSelect, new RegExp(`AS ${field}\\b`), `contract column ${field} missing from the final SELECT`);
    }
  });

  it('the opening-entry toggle wiring survives the rewrite (no regression on ETP-4898 part 1)', () => {
    const base = extractCte(SQL, 'base');
    // opening_balance: OR-clause; activity_*: NOT-guard; closing_balance: untouched.
    assert.match(base, /OR \(fa\.dateacct = '__DATEFROM__'::date AND fa\.factaccttype = 'O' AND '__OPENINGENTRYAMOUNT__' = 'true'\)[\s\S]*?AS opening_balance/);
    assert.match(base, /NOT \(fa\.dateacct = '__DATEFROM__'::date AND fa\.factaccttype = 'O' AND '__OPENINGENTRYAMOUNT__' = 'true'\)[\s\S]*?AS activity_debit/);
    assert.match(base, /NOT \(fa\.dateacct = '__DATEFROM__'::date AND fa\.factaccttype = 'O' AND '__OPENINGENTRYAMOUNT__' = 'true'\)[\s\S]*?AS activity_credit/);
    // Pair each CASE block with its own nearest alias (same technique as
    // report-trial-balance-opening-entry-amount.test.js) so the closing_balance
    // condition can't accidentally swallow the preceding clauses.
    const byAlias = {};
    const re = /CASE WHEN ([\s\S]*?) THEN [\s\S]*? ELSE 0 END\), 0\) AS (\w+)/g;
    let m;
    while ((m = re.exec(base))) byAlias[m[2]] = m[1];
    assert.ok(byAlias.closing_balance, 'expected a closing_balance CASE in the base CTE');
    assert.doesNotMatch(byAlias.closing_balance, /__OPENINGENTRYAMOUNT__/);
  });
});

// ── Part 3: template rendering (drill-down link only at level 'S') ──────────

const ROWS = [
  { account_no: '4300', account_id: 'ACC-1', account_name: 'Clientes', bpname: 'ACME', opening_balance: 100, activity_debit: 50, activity_credit: 20, closing_balance: 130 },
];

function renderTemplate({ accountLevel, groupBy }) {
  const hb = Handlebars.create();
  registerReportHelpers(hb);
  const meta = {
    title: 'Trial Balance',
    generatedAt: '2026-08-19T00:00:00.000Z',
    recordCount: ROWS.length,
    params: { accountLevel, groupBy, dateFrom: '2026-01-01', dateTo: '2026-01-31' },
    labels: { account_no: 'Nº Cuenta', account_name: 'Nombre', activity_debit: 'Debe', activity_credit: 'Haber', balanceAsOf: 'Saldo a' },
    ui: { records: 'registros', total: 'Total', generatedBy: 'Etendo Go' },
    dimensionLabel: 'Contacto',
    dimensionField: 'bpname',
    // ETP-5013 — account-outer / dimension-inner: ONE block per ACCOUNT, its
    // dimension breakdown nested inside, closing with the account's own totals
    // (which is where the drill-down link now lives). Replaces the ETP-4898
    // `{dimensionValue, accounts}` card.
    tbGroups: [{
      account_no: '4300', account_id: 'ACC-1', account_name: 'Clientes',
      dimensionRows: [
        { dimensionValue: 'ACME', opening_balance: 100, activity_debit: 50, activity_credit: 20, closing_balance: 130 },
      ],
      opening_balance: 100, activity_debit: 50, activity_credit: 20, closing_balance: 130,
    }],
    filters: [],
    totals: {},
  };
  return hb.compile(EXPANDED_TEMPLATE_SRC)({ css: '', meta, rows: ROWS });
}

describe('report-trial-balance — template drill-down link vs accountLevel (ETP-4898)', () => {
  // groupBy '' -> flat table branch; groupBy 'bpartner' -> dimension-grouped branch.
  const BRANCHES = [
    { name: 'flat table', groupBy: '' },
    { name: 'dimension-grouped', groupBy: 'bpartner' },
  ];

  for (const branch of BRANCHES) {
    it(`renders the clickable account-link span at level 'S' — ${branch.name} branch`, () => {
      const html = renderTemplate({ accountLevel: 'S', groupBy: branch.groupBy });
      assert.match(html, /<span class="account-link"/);
      assert.match(html, /trial-balance-drilldown/);
      assert.match(html, /accountId:'ACC-1'/);
      assert.match(html, /accountValue:'4300'/);
    });

    for (const level of ['D', 'C', 'E']) {
      it(`renders the account code as plain text at level '${level}' — ${branch.name} branch`, () => {
        const html = renderTemplate({ accountLevel: level, groupBy: branch.groupBy });
        assert.doesNotMatch(html, /<span class="account-link"/);
        assert.doesNotMatch(html, /trial-balance-drilldown/);
        // The code itself is still shown.
        assert.match(html, /<td>4300<\/td>/);
      });
    }

    it(`renders plain text when accountLevel is absent — ${branch.name} branch`, () => {
      const html = renderTemplate({ accountLevel: undefined, groupBy: branch.groupBy });
      assert.doesNotMatch(html, /<span class="account-link"/);
      assert.match(html, /<td>4300<\/td>/);
    });

    it(`never renders a "Missing helper" fallback — ${branch.name} branch`, () => {
      const html = renderTemplate({ accountLevel: 'S', groupBy: branch.groupBy });
      assert.ok(!html.includes('Missing helper'), 'template rendered a Missing helper fallback');
    });
  }

  it('puts the drill-down on the account TOTAL row of the block, not on a dimension row (ETP-5013)', () => {
    const html = renderTemplate({ accountLevel: 'S', groupBy: 'bpartner' });
    const start = html.indexOf('<tr class="acct-total">');
    assert.notEqual(start, -1, 'expected an acct-total closing row per account block');
    const totalRow = html.slice(start, html.indexOf('</tr>', start));
    assert.match(totalRow, /<span class="account-link"/, 'the drill-down link must live on the account total row');
    assert.match(totalRow, /accountId:'ACC-1'/);
    assert.match(totalRow, /accountValue:'4300'/);
    assert.match(totalRow, /<td>Clientes<\/td>/, 'the total row also carries the account name');
    // ...and nowhere else: exactly one link per account block.
    assert.equal((html.match(/<span class="account-link"/g) || []).length, 1);
  });

  it('renders the dimension breakdown above the total row, with an empty account-code cell (ETP-5013)', () => {
    const html = renderTemplate({ accountLevel: 'S', groupBy: 'bpartner' });
    const bodyStart = html.indexOf('<tbody>');
    const dimRow = html.slice(bodyStart, html.indexOf('<tr class="acct-total">'));
    assert.match(dimRow, /<td><\/td>/, 'the dimension row leaves the account-code cell empty');
    assert.match(dimRow, /<td>ACME<\/td>/, 'the dimension value goes in the description column');
    assert.doesNotMatch(dimRow, /account-link/, 'no drill-down on a dimension row');
    assert.doesNotMatch(dimRow, />4300</, 'the account code is not repeated on every dimension row');
  });

  it('guards the drill-down in BOTH render branches (two ifCond guards in the source)', () => {
    const guards = TEMPLATE_SRC.match(/\{\{#ifCond @root\.meta\.params\.accountLevel '===' 'S'\}\}/g) || [];
    assert.equal(guards.length, 2, 'expected the accountLevel guard in both the grouped and flat branches');
    // ETP-5013 follow-up: a THIRD, independently-guarded account-link now
    // exists — the Contacto dimension row's own drill-down, gated on
    // `{{#if this.dimensionId}}` (only set when the dimension declares a
    // groupByIdField), not on accountLevel. So account-link occurrences
    // outnumber the accountLevel guards by exactly one.
    const dimensionIdGuards = TEMPLATE_SRC.match(/\{\{#if this\.dimensionId\}\}/g) || [];
    assert.equal(dimensionIdGuards.length, 1, 'expected exactly one dimensionId-gated drill-down');
    const links = TEMPLATE_SRC.match(/<span class="account-link"/g) || [];
    assert.equal(links.length, guards.length + dimensionIdGuards.length);
  });
});

// ── Part 4: report-api.js activeFilters option-label resolution ─────────────
//
// `activeFilters` used to be built inline inside the request handler (and text-
// scraped out of this file's source for testing). It now lives in the shared
// @etendosoftware/schema-forge-cli module (so the production report-server
// gets it as well), so it is imported directly — the test exercises the real
// shipped function, not a regex-scraped duplicate of it.

const buildActiveFilters = filterAndTransformParams;

function chipFor(paramName, value, locale) {
  const filters = buildActiveFilters({ [paramName]: value }, CONTRACT, locale);
  assert.equal(filters.length, 1, `expected exactly one chip for ${paramName}`);
  return filters[0];
}

describe('report-api.js — activeFilters resolves literal-options selects to their label (ETP-4898)', () => {
  const CASES = [
    { value: 'S', es_ES: 'Subcuenta', en_US: 'Subaccount' },
    { value: 'D', es_ES: 'Desglose', en_US: 'Breakdown' },
    { value: 'C', es_ES: 'Cuenta', en_US: 'Account' },
    { value: 'E', es_ES: 'Epígrafe', en_US: 'Heading' },
  ];

  for (const c of CASES) {
    it(`resolves accountLevel '${c.value}' to its es_ES label`, () => {
      assert.equal(chipFor('accountLevel', c.value, 'es_ES').value, c.es_ES);
    });

    it(`resolves accountLevel '${c.value}' to its en_US label`, () => {
      assert.equal(chipFor('accountLevel', c.value, 'en_US').value, c.en_US);
    });
  }

  it('labels the chip itself with the localized parameter label', () => {
    assert.equal(chipFor('accountLevel', 'E', 'es_ES').label, 'Nivel de cuenta');
    assert.equal(chipFor('accountLevel', 'E', 'en_US').label, 'Account Level');
  });

  it('falls back to the raw value when no option matches', () => {
    assert.equal(chipFor('accountLevel', 'ZZZ', 'es_ES').value, 'ZZZ');
  });

  it('falls back to the en_US label when the requested locale is unknown', () => {
    assert.equal(chipFor('accountLevel', 'E', 'fr_FR').value, 'Heading');
  });

  it('leaves the existing groupBy resolution untouched (dimension label, not the raw key)', () => {
    assert.equal(chipFor('groupBy', 'bpartner', 'es_ES').value, 'Contacto');
    assert.equal(chipFor('groupBy', 'bpartner', 'en_US').value, 'Contact');
  });

  it('leaves parameters without a literal options list untouched', () => {
    const filters = buildActiveFilters({ dateFrom: '2026-01-01' }, CONTRACT, 'es_ES');
    assert.equal(filters[0].value, '01/01/2026');
  });

  it('applies the same resolution to other reports\' literal-options selects (tax-report)', () => {
    const taxContract = JSON.parse(
      readFileSync(join(ROOT, 'artifacts', 'tax-report', 'report-contract.json'), 'utf8'),
    );
    const selects = (taxContract.parameters || []).filter((p) => Array.isArray(p.options) && p.options.length);
    assert.ok(selects.length > 0, 'expected tax-report to declare literal-options selects');
    for (const p of selects) {
      for (const opt of p.options) {
        const chip = buildActiveFilters({ [p.name]: opt.value }, taxContract, 'es_ES')[0];
        assert.equal(chip.value, opt.label?.es_ES || opt.label?.en_US || opt.value, `${p.name}=${opt.value}`);
      }
    }
  });
});
