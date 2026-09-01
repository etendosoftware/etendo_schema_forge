import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers, buildJsreportHelpersString } from '../../../templates/reports/helpers/report-html-helpers.js';
import { expandBrandingPartial } from './reportBrandingPartialHelper.js';

// ETP-4899 — balance-sheet ("Balance de Situación") is the SAME indented
// account-report tree as profit-loss. In Etendo Classic both are literally one
// Java class (GeneralAccountingReports), differing only by which `C_ACCT_RPT`
// row feeds the SQL: REPORTTYPE 'N' is the P&L (period FLOW) and 'Y' is the
// Balance Sheet (POINT-IN-TIME, cumulative up to the as-of date). So this
// report reuses buildAccountReportTree() verbatim (its own behaviour is pinned
// in report-api-build-account-report-tree.test.js) and only its `sql.query`
// differs.
//
// Two things make Balance Sheet the report that exercises the generalized
// engine, and both are pinned below:
//  - TWO `c_acct_rpt_group` roots ("Activo" / "Patrimonio Neto y Pasivo"),
//    so `isGroupStart` actually fires and the .group-header band renders —
//    unlike P&L's single group, where it must stay invisible.
//  - Oppositely-signed branches: "Activo" is debit-normal, "Patrimonio Neto y
//    Pasivo" credit-normal, so the polarity comes from the branch root's
//    ACCOUNTSIGN (Classic's applySignAsPerParent), never from a per-report
//    hardcoded `cr - dr`.
//
// These tests read the REAL contract SQL / real .hbs templates from disk (never
// hardcode a copy) so a future edit that breaks this behavior fails here.

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/balance-sheet');
const PL_DIR = resolve(import.meta.dirname, '../../../artifacts/profit-loss');
const CONTRACT = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const PL_CONTRACT = JSON.parse(readFileSync(resolve(PL_DIR, 'report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;
const OPERANDS_SQL = CONTRACT.sql.operandsQuery;
const HELPERS_CODE = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');

// ── Part 1: contract shape ──────────────────────────────────────────────────

function findParam(name) {
  return (CONTRACT.parameters || []).find((p) => p.name === name);
}

describe('balance-sheet report-contract.json — identity', () => {
  it('is a sql-sourced grouped-listing report with a bilingual title', () => {
    assert.equal(CONTRACT.reportId, 'balance-sheet');
    assert.equal(CONTRACT.type, 'grouped-listing');
    assert.equal(CONTRACT.source, 'sql');
    assert.equal(CONTRACT.category, 'finance');
    assert.equal(CONTRACT.title.en_US, 'Balance Sheet');
    assert.equal(CONTRACT.title.es_ES, 'Balance de Situación');
  });

  it('offers the same four outputs as profit-loss', () => {
    assert.deepEqual(CONTRACT.outputs, ['pdf', 'xlsx', 'csv', 'html']);
    assert.deepEqual(CONTRACT.outputs, PL_CONTRACT.outputs);
  });
});

describe('balance-sheet report-contract.json — sections', () => {
  it('declares periodo, agrupacion and comparacion with bilingual labels', () => {
    const byId = Object.fromEntries((CONTRACT.sections || []).map((s) => [s.id, s]));
    assert.ok(byId.periodo, 'expected a "periodo" section');
    assert.equal(byId.periodo.label.en_US, 'Period');
    assert.equal(byId.periodo.label.es_ES, 'Periodo');

    assert.ok(byId.agrupacion, 'expected an "agrupacion" section');
    assert.equal(byId.agrupacion.label.en_US, 'Grouping');
    assert.equal(byId.agrupacion.label.es_ES, 'Agrupación');

    assert.ok(byId.comparacion, 'expected a "comparacion" section');
    assert.equal(byId.comparacion.label.en_US, 'Comparison');
    assert.equal(byId.comparacion.label.es_ES, 'Comparación');
  });

  it('matches profit-loss section-for-section (same sidebar layout)', () => {
    assert.deepEqual(CONTRACT.sections, PL_CONTRACT.sections);
  });
});

describe('balance-sheet report-contract.json — the 11 sidebar parameters', () => {
  it('declares exactly the same 11 parameters as profit-loss, in the same order', () => {
    // Deliberate: both reports share one engine and one sidebar shape, so a
    // parameter added to one must be added to the other or the two drift.
    assert.deepEqual(
      (CONTRACT.parameters || []).map((p) => p.name),
      [
        'acctSchemaId', 'orgId', 'yearId', 'dateFrom', 'dateTo',
        'accountLevel', 'showOnlyAccountsWithValue',
        'compareTo', 'referenceYearId', 'fromReferenceDate', 'toReferenceDate',
      ]
    );
    assert.equal(CONTRACT.parameters.length, 11);
  });

  it('every parameter is byte-identical to its profit-loss counterpart', () => {
    assert.deepEqual(CONTRACT.parameters, PL_CONTRACT.parameters);
  });

  it('yearId is a required, org-dependent year selector in "periodo"', () => {
    const p = findParam('yearId');
    assert.equal(p.type, 'search');
    assert.equal(p.selector, 'year');
    assert.equal(p.required, true);
    assert.equal(p.dependsOn, 'orgId');
    assert.equal(p.section, 'periodo');
  });

  for (const name of ['dateFrom', 'dateTo']) {
    it(`${name} is an optional date parameter in the "periodo" section`, () => {
      const p = findParam(name);
      assert.ok(p, `expected a "${name}" parameter`);
      assert.equal(p.type, 'date');
      assert.equal(p.section, 'periodo');
      assert.ok(!p.required, `${name} must NOT be required`);
      assert.ok(!p.requiredIf, `${name} must NOT be conditionally required`);
    });
  }

  it('accountLevel is a required select defaulting to "C" with the 4 expected options', () => {
    const p = findParam('accountLevel');
    assert.equal(p.type, 'select');
    assert.equal(p.required, true);
    assert.equal(p.default, 'C');
    assert.equal(p.section, 'agrupacion');

    const byValue = Object.fromEntries((p.options || []).map((o) => [o.value, o]));
    assert.deepEqual(Object.keys(byValue).sort(), ['C', 'D', 'E', 'S']);
    assert.equal(byValue.S.label.es_ES, 'Subcuenta');
    assert.equal(byValue.D.label.es_ES, 'Desglose');
    assert.equal(byValue.C.label.es_ES, 'Cuenta');
    assert.equal(byValue.E.label.es_ES, 'Epígrafe');
  });

  it('showOnlyAccountsWithValue is a toggle defaulting to true, in "agrupacion"', () => {
    const p = findParam('showOnlyAccountsWithValue');
    assert.equal(p.type, 'toggle');
    assert.equal(p.default, true);
    assert.equal(p.section, 'agrupacion');
  });

  it('compareTo is a toggle defaulting to false, in "comparacion"', () => {
    const p = findParam('compareTo');
    assert.equal(p.type, 'toggle');
    assert.equal(p.default, false);
    assert.equal(p.section, 'comparacion');
  });

  it('referenceYearId is conditionally required on compareTo=="true", not plain required', () => {
    const p = findParam('referenceYearId');
    assert.equal(p.type, 'search');
    assert.equal(p.selector, 'year');
    assert.equal(p.dependsOn, 'orgId');
    assert.equal(p.section, 'comparacion');
    assert.ok(!p.required, 'referenceYearId must NOT be a plain required:true');
    assert.deepEqual(p.requiredIf, { param: 'compareTo', equals: 'true' });
  });

  for (const name of ['referenceYearId', 'fromReferenceDate', 'toReferenceDate']) {
    it(`${name} is only visible while comparing`, () => {
      assert.deepEqual(findParam(name).visibleIf, { param: 'compareTo', equals: 'true' });
    });
  }
});

describe('balance-sheet report-contract.json — columns', () => {
  it('is exactly element / amount / amount_ref (the shared tree shape)', () => {
    assert.deepEqual((CONTRACT.columns || []).map((c) => c.field), ['element', 'amount', 'amount_ref']);
    assert.deepEqual(CONTRACT.columns, PL_CONTRACT.columns);
  });

  it('element is the indented label column', () => {
    const col = CONTRACT.columns.find((c) => c.field === 'element');
    assert.equal(col.type, 'string');
    assert.equal(col.label.en_US, 'Element');
    assert.equal(col.label.es_ES, 'Elemento');
  });

  it('amount and amount_ref are amount columns with bilingual labels', () => {
    const amount = CONTRACT.columns.find((c) => c.field === 'amount');
    assert.equal(amount.type, 'amount');
    assert.equal(amount.label.en_US, 'Amount');
    assert.equal(amount.label.es_ES, 'Importe');

    const ref = CONTRACT.columns.find((c) => c.field === 'amount_ref');
    assert.equal(ref.type, 'amount');
    assert.equal(ref.label.en_US, 'Reference Amount');
    assert.equal(ref.label.es_ES, 'Importe de Referencia');
  });

  it('declares NO groups and NO defaultSort — the tree carries its own document order', () => {
    // buildAccountReportTree() emits already-ordered, already-flattened rows,
    // grouped by `group`/`isGroupStart`; a contract-level `groups`/
    // `defaultSort` here would fight it. Same convention as profit-loss.
    assert.equal(CONTRACT.groups, undefined);
    assert.equal(CONTRACT.defaultSort, undefined);
  });
});

// ── Part 2: SQL wiring ──────────────────────────────────────────────────────

describe('balance-sheet SQL — placeholders', () => {
  for (const placeholder of [
    '__YEARID__',
    '__DATETO__',
    '__COMPARETO__',
    '__REFERENCEYEARID__',
    '__TOREFERENCEDATE__',
    '__ORGID__',
    '__ACCTSCHEMAID__',
    '__CLIENT_ID__',
  ]) {
    it(`references ${placeholder}`, () => {
      assert.match(SQL, new RegExp(placeholder), `expected ${placeholder} in the SQL`);
    });
  }

  for (const placeholder of ['__ACCOUNTLEVEL__', '__SHOWONLYACCOUNTSWITHVALUE__']) {
    it(`does NOT reference ${placeholder} — both are applied in JS`, () => {
      // A cumulative depth cutoff and an "either period non-zero" filter must
      // run AFTER the roll-ups and formula nodes resolve, so they live in
      // buildAccountReportTree(). The SQL returns the whole tree unfiltered.
      assert.doesNotMatch(SQL, new RegExp(placeholder));
    });
  }

  for (const name of ['DATETO', 'TOREFERENCEDATE']) {
    const placeholder = `__${name}__`;
    it(`${placeholder} casts plainly, guarded by an OR-blank clause (never NULLIF)`, () => {
      // report-api.js's stripBlankOptionalClauses() deletes the whole
      // `AND ('__X__' = '' OR ...)` clause when the field is blank, so the
      // bare cast is only evaluated once a real value is substituted.
      // NULLIF() would make the placeholder appear twice with a nested closing
      // paren and defeat the stripper — see the profit-loss test for history.
      assert.doesNotMatch(SQL, new RegExp(`NULLIF\\('${placeholder}'`));
      assert.match(SQL, new RegExp(`'${placeholder}'::date`), `expected a plain '${placeholder}'::date cast`);
      assert.match(SQL, new RegExp(`\\('${placeholder}'\\s*=\\s*''\\s*OR`), `expected an OR-blank guard for ${placeholder}`);
    });
  }
});

describe('balance-sheet SQL — POINT-IN-TIME, not a period range', () => {
  it("selects the report by reporttype='Y', never the P&L's 'N'", () => {
    assert.match(SQL, /FROM\s+c_acct_rpt\b/);
    assert.match(SQL, /r\.reporttype\s*=\s*'Y'/);
    assert.doesNotMatch(SQL, /r\.reporttype\s*=\s*'N'/, "reporttype 'N' is the Profit & Loss report");
    assert.match(SQL, /r\.c_acctschema_id\s*=\s*'__ACCTSCHEMAID__'/);
  });

  it('accumulates with dateacct <= an as-of bound and NEVER a lower bound', () => {
    assert.match(SQL, /fa\.dateacct\s*<=/, 'expected a cumulative "as of" upper bound');
    assert.doesNotMatch(SQL, /fa\.dateacct\s*>=?/, 'a Balance Sheet has no opening bound — it is cumulative from inception');
  });

  it('bounds the main period at the fiscal year END (MAX(c_period.enddate)), not its start', () => {
    assert.match(SQL, /fa\.dateacct\s*<=\s*\(SELECT MAX\(p\.enddate\) FROM c_period p WHERE p\.c_year_id = '__YEARID__'\)/);
  });

  it('bounds the reference period the same way, gated by compareTo', () => {
    assert.match(SQL, /'__COMPARETO__'\s*=\s*'true'/);
    assert.match(SQL, /fa\.dateacct\s*<=\s*\(SELECT MAX\(p\.enddate\) FROM c_period p WHERE p\.c_year_id = '__REFERENCEYEARID__'\)/);
  });

  it('never references __DATEFROM__ — Starting Date is deliberately inert here', () => {
    // The parameter still exists in the sidebar for visual consistency with
    // Profit & Loss, but Classic discards `localStrDateFrom` for a
    // point-in-time report, so the SQL must not read it.
    assert.ok(findParam('dateFrom'), 'the dateFrom parameter must still be declared for sidebar parity');
    assert.doesNotMatch(SQL, /__DATEFROM__/, 'a point-in-time report must ignore Starting Date');
  });

  it('never references __FROMREFERENCEDATE__ either, for the same reason', () => {
    assert.ok(findParam('fromReferenceDate'), 'the fromReferenceDate parameter must still be declared');
    assert.doesNotMatch(SQL, /__FROMREFERENCEDATE__/);
  });
});

describe('balance-sheet SQL — walks BOTH c_acct_rpt_group roots', () => {
  it('takes its roots from c_acct_rpt_node joined to c_acct_rpt_group', () => {
    assert.match(SQL, /c_acct_rpt_node/);
    assert.match(SQL, /c_acct_rpt_group/);
  });

  it('projects the group name so buildAccountReportTree() can band the output', () => {
    assert.match(SQL, /g\.name\s+AS\s+group_name/);
    assert.match(SQL, /t\.group_name/, 'group_name must survive the recursive CTE into the final SELECT');
  });

  it('carries group_name down every recursive level (a child inherits its root band)', () => {
    assert.match(SQL, /WITH RECURSIVE/);
    assert.match(SQL, /FROM\s+ad_treenode\s+tn/);
    assert.match(SQL, /tn\.parent_id\s*=\s*t\.node_id/);
    const recursive = SQL.slice(SQL.indexOf('UNION ALL'), SQL.indexOf('income_summary'));
    assert.match(recursive, /t\.group_name/, 'the recursive term must propagate the root group_name');
  });

  it('sorts roots by group line then node line, so the groups stay in document order', () => {
    assert.match(SQL, /lpad\(r\.g_line::text, 6, '0'\)\s*\|\|\s*'\.'\s*\|\|\s*lpad\(r\.n_line::text, 6, '0'\)\s+AS\s+sort_path/);
    assert.match(SQL, /ORDER BY\s+t\.sort_path\s*$/);
  });
});

describe('balance-sheet SQL — the flat tree-node list buildAccountReportTree() consumes', () => {
  for (const column of [
    'node_id',
    'parent_id',
    'depth',
    'sort_path',
    'group_name',
    'elementlevel',
    'isalwaysshown',
    'accountsign',
    'own_amt',
    'own_amt_ref',
  ]) {
    it(`projects ${column}`, () => {
      assert.match(SQL, new RegExp(`\\b${column}\\b`), `expected the SQL to return a "${column}" column`);
    });
  }

  it('projects ev.value and ev.name (the two halves of the rendered `element` label)', () => {
    assert.match(SQL, /ev\.value/);
    assert.match(SQL, /ev\.name/);
  });

  it("COALESCEs parent_id to '' so roots are detectable without NULL handling in JS", () => {
    assert.match(SQL, /COALESCE\(t\.parent_id,\s*''\)\s+AS\s+parent_id/);
  });

  it("scopes nodes to the accounting schema's own c_element — deduping a chart loaded twice", () => {
    assert.match(SQL, /FROM\s+c_acctschema_element\s+ase/);
    assert.match(SQL, /ase\.elementtype\s*=\s*'AC'/);
    assert.match(SQL, /ev\.c_element_id\s*=\s*\(SELECT c_element_id FROM elem\)/);
  });
});

describe('balance-sheet SQL — amounts are RAW debit minus credit (the sign flip lives in JS)', () => {
  it('never pre-flips the sign to credit-minus-debit', () => {
    // Balance Sheet is precisely the report that PROVES the flip cannot live
    // in SQL: "Activo" is debit-normal and "Patrimonio Neto y Pasivo" is
    // credit-normal, so one hardcoded expression could never serve both.
    // accountSignMultiplier() applies the branch root's ACCOUNTSIGN instead.
    assert.doesNotMatch(SQL, /fa\.amtacctcr\s*-\s*fa\.amtacctdr/);
    assert.ok([...SQL.matchAll(/fa\.amtacctdr\s*-\s*fa\.amtacctcr/g)].length > 0);
  });

  it('projects ev.accountsign so the JS engine can inherit the branch polarity', () => {
    assert.match(SQL, /ev\.accountsign/);
  });

  it('excludes regularization/closing fact types', () => {
    assert.match(SQL, /fa\.factaccttype\s+NOT IN\s*\('R',\s*'C'\)/);
  });

  it('scopes facts to the client, the org tree and the accounting schema', () => {
    assert.match(SQL, /fa\.ad_client_id IN \('__CLIENT_ID__'\)/);
    assert.match(SQL, /ad_isorgincluded\(fa\.ad_org_id, '__ORGID__', fa\.ad_client_id\)\s*<>\s*-1/);
    assert.match(SQL, /fa\.c_acctschema_id\s*=\s*'__ACCTSCHEMAID__'/);
  });
});

describe('balance-sheet SQL — synthetic net income on the Income Summary account', () => {
  // Classic injects the year's result onto the accounting schema's configured
  // Income Summary account, which normally has ZERO real fact_acct postings
  // (verified: GOClient's `129 - Resultados del ejercicio` = 36,967.90 in the
  // real PDF comes entirely from this injection).
  it('resolves the target account from C_ACCTSCHEMA_GL.INCOMESUMMARY_ACCT', () => {
    assert.match(SQL, /income_summary AS \(/);
    assert.match(SQL, /FROM\s+c_acctschema_gl\s+gl/);
    assert.match(SQL, /gl\.incomesummary_acct/);
    assert.match(SQL, /c_validcombination vc/, 'incomesummary_acct is a C_ValidCombination, not an element value');
    assert.match(SQL, /vc\.account_id\s+AS\s+node_id/);
    assert.match(SQL, /gl\.c_acctschema_id\s*=\s*'__ACCTSCHEMAID__'/);
  });

  it("sums only revenue/expense accounts (accounttype IN ('R','E')) into net_income", () => {
    assert.match(SQL, /net_income AS \(/);
    assert.match(SQL, /ev\.accounttype IN \('R', 'E'\)/);
  });

  it('bounds net_income by the SAME as-of date as the posted balances', () => {
    const cte = SQL.slice(SQL.indexOf('net_income AS ('), SQL.indexOf('facts AS ('));
    assert.match(cte, /fa\.dateacct\s*<=\s*\(SELECT MAX\(p\.enddate\) FROM c_period p WHERE p\.c_year_id = '__YEARID__'\)/);
    assert.match(cte, /\('__DATETO__' = '' OR fa\.dateacct <= '__DATETO__'::date\)/);
    assert.doesNotMatch(cte, /fa\.dateacct\s*>=?/, 'net income is cumulative to the as-of date, with no lower bound');
  });

  it('UNIONs the contribution onto whatever is already posted, never replacing it', () => {
    assert.match(SQL, /facts AS \(/);
    const facts = SQL.slice(SQL.indexOf('facts AS ('), SQL.indexOf(') SELECT t.node_id'));
    assert.match(facts, /FROM posted/);
    assert.match(facts, /UNION ALL/);
    assert.match(facts, /\(SELECT node_id FROM income_summary\)/);
    assert.match(facts, /\(SELECT dr_minus_cr FROM net_income\)/);
    assert.match(facts, /\(SELECT dr_minus_cr_ref FROM net_income\)/);
    // The final SELECT re-aggregates, so a real posting and the injected row
    // both land on the same node.
    assert.match(SQL, /COALESCE\(SUM\(f\.dr_minus_cr\), 0\)\s+AS\s+own_amt/);
    assert.match(SQL, /COALESCE\(SUM\(f\.dr_minus_cr_ref\), 0\)\s+AS\s+own_amt_ref/);
  });
});

describe('balance-sheet SQL — operandsQuery (formula edges)', () => {
  it('exists as its own key alongside query', () => {
    assert.equal(typeof OPERANDS_SQL, 'string');
    assert.ok(OPERANDS_SQL.length > 0, 'expected a non-empty sql.operandsQuery');
  });

  it('projects owner_id, operand_id, sign and seqno from c_elementvalue_operand', () => {
    assert.match(OPERANDS_SQL, /FROM\s+c_elementvalue_operand\s+o/);
    assert.match(OPERANDS_SQL, /o\.c_elementvalue_id\s+AS\s+owner_id/);
    assert.match(OPERANDS_SQL, /o\.account_id\s+AS\s+operand_id/);
    assert.match(OPERANDS_SQL, /\bo\.sign\b/);
    assert.match(OPERANDS_SQL, /\bo\.seqno\b/);
  });

  it('is scoped to the SAME accounting-schema c_element as the node query', () => {
    assert.match(OPERANDS_SQL, /FROM\s+c_acctschema_element\s+ase/);
    assert.match(OPERANDS_SQL, /ase\.c_acctschema_id\s*=\s*'__ACCTSCHEMAID__'/);
    assert.match(OPERANDS_SQL, /ase\.elementtype\s*=\s*'AC'/);
  });

  it('is client-scoped and active-only, ordered by owner then seqno', () => {
    assert.match(OPERANDS_SQL, /o\.ad_client_id IN \('__CLIENT_ID__'\)/);
    assert.match(OPERANDS_SQL, /o\.isactive\s*=\s*'Y'/);
    assert.match(OPERANDS_SQL, /ORDER BY\s+o\.c_elementvalue_id,\s*o\.seqno/);
  });

  it('is identical to profit-loss\'s — formula edges are report-independent', () => {
    assert.equal(OPERANDS_SQL, PL_CONTRACT.sql.operandsQuery);
  });
});

// ── Part 3: template rendering (real Handlebars, real .hbs from disk) ───────

// Labels as they actually resolve in meta.labels (buildContractLabels() in
// report-api.js keys contract.columns by `field`).
const LABELS = {
  en_US: { element: 'Element', amount: 'Amount', amount_ref: 'Reference Amount' },
  es_ES: { element: 'Elemento', amount: 'Importe', amount_ref: 'Importe de Referencia' },
};

const META_BASE = {
  title: 'Balance Sheet',
  generatedAt: '2026-08-19T00:00:00.000Z',
  recordCount: 6,
  ui: { records: 'records', total: 'Total', generatedBy: 'Generated by Schema Forge' },
  filters: [
    { label: 'Year', value: '2026' },
    { label: 'Account Level', value: 'Account' },
  ],
};

const ACTIVO = 'Activo';
const PASIVO = 'Patrimonio Neto y Pasivo';

// Shaped exactly like buildAccountReportTree()'s output for the verified
// GOClient 2026 Account-level run: two c_acct_rpt_group bands, the debit-normal
// "Activo" branch and the credit-normal "Patrimonio Neto y Pasivo" one
// (including the injected `129 - Resultados del ejercicio` = 36,967.90 that
// has zero real fact_acct postings). A comma-and-quote-bearing name exercises
// the CSV escaping.
const ROWS = [
  { node_id: 'n1', value: 'A.B', name: 'ACTIVO CORRIENTE', element: 'A.B - ACTIVO CORRIENTE', elementlevel: 'E', amount: -157271.85, amount_ref: -100000, indent: 0, indentClass: 'ind-0', isHeading: true, group: ACTIVO, isGroupStart: true },
  { node_id: 'n2', value: 'A.B.I', name: 'Existencias, netas de "rappels"', element: 'A.B.I - Existencias, netas de "rappels"', elementlevel: 'E', amount: 23496.47, amount_ref: 12000, indent: 1, indentClass: 'ind-1', isHeading: true, group: ACTIVO, isGroupStart: false },
  { node_id: 'n3', value: '350', name: 'Productos terminados', element: '350 - Productos terminados', elementlevel: 'C', amount: 23496.47, amount_ref: 12000, indent: 2, indentClass: 'ind-2', isHeading: false, group: ACTIVO, isGroupStart: false },
  { node_id: 'n4', value: 'A.TOTAL', name: 'TOTAL ACTIVO', element: 'A.TOTAL - TOTAL ACTIVO', elementlevel: 'E', amount: -157271.85, amount_ref: -100000, indent: 0, indentClass: 'ind-0', isHeading: true, group: ACTIVO, isGroupStart: false },
  { node_id: 'n5', value: '129', name: 'Resultados del ejercicio', element: '129 - Resultados del ejercicio', elementlevel: 'C', amount: 36967.9, amount_ref: 8000, indent: 3, indentClass: 'ind-3', isHeading: false, group: PASIVO, isGroupStart: true },
  { node_id: 'n6', value: 'P.TOTAL', name: 'TOTAL PATRIMONIO NETO Y PASIVO', element: 'P.TOTAL - TOTAL PATRIMONIO NETO Y PASIVO', elementlevel: 'E', amount: -150152.93, amount_ref: -90000, indent: 0, indentClass: 'ind-0', isHeading: true, group: PASIVO, isGroupStart: false },
];

function renderHtml({ compareTo, locale = 'en_US', rows = ROWS } = {}) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  const template = hb.compile(expandBrandingPartial(readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8')));
  const meta = {
    ...META_BASE,
    labels: LABELS[locale],
    params: compareTo === undefined ? {} : { compareTo: String(compareTo) },
  };
  return template({ css: '', meta, rows });
}

describe('balance-sheet template.hbs — tree rendering', () => {
  it('renders exactly one tree row per input row, in order', () => {
    const html = renderHtml({ compareTo: false });
    assert.doesNotMatch(html, /Missing helper/);
    assert.equal([...html.matchAll(/class="tree-row/g)].length, ROWS.length);
    const tbody = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    const positions = ROWS.map((r) => tbody.indexOf(`>${r.value} - `));
    assert.ok(positions.every((p) => p !== -1), 'every row must be rendered');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'rows must keep the tree document order');
  });

  it("applies each row's precomputed indentClass to the element cell", () => {
    const html = renderHtml({ compareTo: false });
    assert.match(html, /<td class="ind-0">A\.B - ACTIVO CORRIENTE<\/td>/);
    assert.match(html, /<td class="ind-2">350 - Productos terminados<\/td>/);
    assert.match(html, /<td class="ind-3">129 - Resultados del ejercicio<\/td>/);
  });

  it('marks only isHeading rows with the bold "heading" class', () => {
    const html = renderHtml({ compareTo: false });
    assert.equal(
      [...html.matchAll(/class="tree-row heading"/g)].length,
      ROWS.filter((r) => r.isHeading).length
    );
  });

  it('defines a .ind-N padding rule for every indent level the JS can emit (0..6)', () => {
    const html = renderHtml({ compareTo: false });
    for (let i = 0; i <= 6; i += 1) {
      assert.match(html, new RegExp(`\\.ind-${i}\\s*\\{`), `missing CSS rule for .ind-${i}`);
    }
  });

  it('formats amounts through formatCurrency (es-ES grouping, negatives preserved)', () => {
    const html = renderHtml({ compareTo: false });
    assert.match(html, />-157\.271,85</);
    assert.match(html, />36\.967,90</, 'the injected Income Summary contribution must render');
    assert.doesNotMatch(html, />-157271\.85</, 'amounts must never be printed raw in the HTML/PDF template');
  });
});

describe('balance-sheet template.hbs — group-header bands (the multi-root case)', () => {
  it('renders exactly one band per c_acct_rpt_group, named after the group', () => {
    const html = renderHtml({ compareTo: false });
    const bands = [...html.matchAll(/<tr class="group-header">\s*<td colspan="\d">([^<]*)<\/td>/g)].map((m) => m[1]);
    assert.deepEqual(bands, [ACTIVO, PASIVO]);
  });

  it('emits the leading band BEFORE the first tree row', () => {
    const tbody = renderHtml({ compareTo: false });
    const body = tbody.slice(tbody.indexOf('<tbody>'), tbody.indexOf('</tbody>'));
    assert.ok(
      body.indexOf('class="group-header"') < body.indexOf('class="tree-row'),
      'the "Activo" header must precede its first row, not trail it'
    );
  });

  it('places the second band immediately before the first row of its group', () => {
    const html = renderHtml({ compareTo: false });
    const bandIdx = html.lastIndexOf('class="group-header"');
    const after = html.slice(bandIdx);
    assert.match(after.slice(0, after.indexOf('</tr>', after.indexOf('tree-row'))), /129 - Resultados del ejercicio/);
  });

  it('spans the band across 2 columns without comparison and 3 with it', () => {
    assert.match(renderHtml({ compareTo: false }), /<td colspan="2">Activo<\/td>/);
    assert.match(renderHtml({ compareTo: true }), /<td colspan="3">Activo<\/td>/);
  });

  it('renders NO band at all when every row shares one group (the P&L shape)', () => {
    const single = ROWS.map((r) => ({ ...r, group: 'Único', isGroupStart: false }));
    const html = renderHtml({ compareTo: false, rows: single });
    assert.equal([...html.matchAll(/class="group-header"/g)].length, 0);
    assert.equal([...html.matchAll(/class="tree-row/g)].length, ROWS.length);
  });
});

describe('balance-sheet template.hbs — Reference Amount column visibility', () => {
  it('compareTo=true: shows the header, a 3-col colgroup and a reference cell per row', () => {
    const html = renderHtml({ compareTo: true });
    assert.doesNotMatch(html, /Missing helper/);
    assert.match(html, /<th class="cell-amount">Reference Amount<\/th>/);
    assert.equal([...html.matchAll(/<col style="width:20%">/g)].length, 2);
    assert.equal([...html.matchAll(/class="cell-amount"/g)].length, ROWS.length * 2 + 2);
    assert.match(html, />12\.000,00</, 'the reference amount must be rendered');
  });

  it('compareTo=false: hides the header and every reference cell, and uses the 2-col colgroup', () => {
    const html = renderHtml({ compareTo: false });
    assert.doesNotMatch(html, /Reference Amount/);
    assert.match(html, /<col style="width:75%">/);
    assert.match(html, /<col style="width:25%">/);
    assert.equal([...html.matchAll(/class="cell-amount"/g)].length, ROWS.length + 1);
    assert.doesNotMatch(html, />12\.000,00</);
  });

  it('compareTo absent (param not set): behaves the same as false', () => {
    const html = renderHtml({ compareTo: undefined });
    assert.doesNotMatch(html, /Missing helper/);
    assert.doesNotMatch(html, /Reference Amount/);
    assert.equal([...html.matchAll(/class="cell-amount"/g)].length, ROWS.length + 1);
  });

  it('column headers are translated [es_ES]', () => {
    const html = renderHtml({ compareTo: true, locale: 'es_ES' });
    assert.match(html, /<th>Elemento<\/th>/);
    assert.match(html, /<th class="cell-amount">Importe<\/th>/);
    assert.match(html, /<th class="cell-amount">Importe de Referencia<\/th>/);
  });
});

// ── Excel ───────────────────────────────────────────────────────────────────

function renderExcel({ compareTo, locale = 'en_US', rows = ROWS } = {}) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  const template = hb.compile(readFileSync(resolve(ARTIFACT_DIR, 'template-excel.hbs'), 'utf8'));
  return template({
    css: '',
    meta: { ...META_BASE, labels: LABELS[locale], params: compareTo === undefined ? {} : { compareTo: String(compareTo) } },
    rows,
  });
}

describe('balance-sheet template-excel.hbs', () => {
  it('flattens the tree into Group / Level / Code / Name / Amount, in that order', () => {
    const html = renderExcel({ compareTo: false });
    assert.doesNotMatch(html, /Missing helper/);
    const header = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    assert.deepEqual(
      [...header.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]),
      ['Group', 'Level', 'Code', 'Name', 'Amount']
    );
    // No indentation classes leak into the calculation-friendly grid, and the
    // group is a real column rather than a spanning band row.
    assert.doesNotMatch(html, /ind-\d/);
    assert.doesNotMatch(html, /group-header/);
    assert.equal([...html.matchAll(/<tr>/g)].length, ROWS.length + 1); // + header row
  });

  it('writes every row\'s group into the leading cell, not just the band starts', () => {
    const html = renderExcel({ compareTo: false });
    const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    assert.equal([...body.matchAll(new RegExp(`<td>${ACTIVO}</td>`, 'g'))].length, 4);
    assert.equal([...body.matchAll(new RegExp(`<td>${PASIVO}</td>`, 'g'))].length, 2);
  });

  it('emits the indent depth as a numeric cell alongside the code/name', () => {
    const html = renderExcel({ compareTo: false });
    const rowIdx = html.indexOf('Resultados del ejercicio');
    const row = html.slice(html.lastIndexOf('<tr>', rowIdx), html.indexOf('</tr>', rowIdx));
    assert.deepEqual(
      [...row.matchAll(/<td(?: data-cell-type="number")?>([^<]*)<\/td>/g)].map((m) => m[1]),
      [PASIVO, '3', '129', 'Resultados del ejercicio', '36967.9']
    );
  });

  it('amount cells are numeric (data-cell-type="number") with RAW unformatted values', () => {
    const html = renderExcel({ compareTo: false });
    assert.match(html, /<td data-cell-type="number">-157271\.85<\/td>/);
    assert.match(html, /<td data-cell-type="number">36967\.9<\/td>/);
    assert.doesNotMatch(html, /-157\.271,85/, 'amounts must never go through formatCurrency in the Excel export');
  });

  it('includes the reference-amount column only when compareTo === "true"', () => {
    const on = renderExcel({ compareTo: true });
    assert.match(on, /<th>Reference Amount<\/th>/);
    assert.match(on, /<td data-cell-type="number">12000<\/td>/);

    const off = renderExcel({ compareTo: false });
    assert.doesNotMatch(off, /Reference Amount/);
    assert.doesNotMatch(off, /<td data-cell-type="number">12000<\/td>/);
  });

  it('amount headers are translated [es_ES]', () => {
    const html = renderExcel({ compareTo: true, locale: 'es_ES' });
    assert.match(html, /<th>Importe<\/th>/);
    assert.match(html, /<th>Importe de Referencia<\/th>/);
  });
});

// ── CSV (jsreport render path, recipe 'text') ───────────────────────────────

function renderCsv({ compareTo, locale = 'en_US', rows = ROWS } = {}) {
  const built = buildJsreportHelpersString(HELPERS_CODE);
  const helperNames = [...built.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  // eslint-disable-next-line no-new-func
  const helpers = new Function(`${built}\nreturn { ${helperNames.join(', ')} };`)();

  const hb = Handlebars.create();
  for (const [name, fn] of Object.entries(helpers)) hb.registerHelper(name, fn);
  const template = hb.compile(readFileSync(resolve(ARTIFACT_DIR, 'template-csv.hbs'), 'utf8'));
  return template({
    meta: { ...META_BASE, labels: LABELS[locale], params: compareTo === undefined ? {} : { compareTo: String(compareTo) } },
    rows,
  });
}

describe('balance-sheet helpers.js', () => {
  it('declares csvField (the CSV template depends on it)', () => {
    assert.match(HELPERS_CODE, /function csvField\s*\(/);
  });

  it('is exposed to jsreport through buildJsreportHelpersString', () => {
    assert.match(buildJsreportHelpersString(HELPERS_CODE), /function csvField\s*\(/);
  });
});

describe('balance-sheet template-csv.hbs', () => {
  it('emits real comma-separated text — a header line plus one line per row, no HTML', () => {
    const csv = renderCsv({ compareTo: false });
    assert.doesNotMatch(csv, /Missing helper/);
    assert.doesNotMatch(csv, /</, 'the CSV export must contain no markup at all');
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, ROWS.length + 1);
    assert.equal(lines[0], 'Group,Level,Code,Element,Amount');
  });

  it('writes the group, the tree depth as the Level column and the raw dot-decimal amount', () => {
    const lines = renderCsv({ compareTo: false }).trim().split('\n');
    assert.equal(lines[1], `${ACTIVO},0,A.B,ACTIVO CORRIENTE,-157271.85`);
    assert.equal(lines[5], `${PASIVO},3,129,Resultados del ejercicio,36967.9`);
    assert.doesNotMatch(lines.join('\n'), /-157\.271,85/, 'amounts must never go through formatCurrency in the CSV export');
  });

  it('carries the group on EVERY data line, not only the band starts', () => {
    const lines = renderCsv({ compareTo: false }).trim().split('\n').slice(1);
    assert.deepEqual(
      lines.map((l) => l.split(',')[0]),
      [ACTIVO, ACTIVO, ACTIVO, ACTIVO, PASIVO, PASIVO]
    );
  });

  it('quotes a name containing a comma and doubles embedded quotes (no &quot; leak)', () => {
    const csv = renderCsv({ compareTo: false });
    assert.match(csv, /"Existencias, netas de ""rappels"""/);
    assert.doesNotMatch(csv, /&quot;/, 'csvField output must never be HTML-escaped — the template must use {{{ }}}, not {{ }}');
  });

  it('quotes a group name containing a comma through csvField', () => {
    const rows = ROWS.map((r) => ({ ...r, group: 'Activo, corriente' }));
    for (const line of renderCsv({ compareTo: false, rows }).trim().split('\n').slice(1)) {
      assert.ok(line.startsWith('"Activo, corriente",'), `group must be quoted: ${line}`);
    }
  });

  it('appends the reference-amount column only when compareTo === "true"', () => {
    const on = renderCsv({ compareTo: true }).trim().split('\n');
    assert.equal(on[0], 'Group,Level,Code,Element,Amount,Reference Amount');
    assert.equal(on[1], `${ACTIVO},0,A.B,ACTIVO CORRIENTE,-157271.85,-100000`);

    const off = renderCsv({ compareTo: false }).trim().split('\n');
    assert.equal(off[0], 'Group,Level,Code,Element,Amount');
    assert.equal(off[1], `${ACTIVO},0,A.B,ACTIVO CORRIENTE,-157271.85`);
  });

  it('header row uses translated labels [es_ES]', () => {
    const csv = renderCsv({ compareTo: true, locale: 'es_ES' });
    assert.equal(csv.trim().split('\n')[0], 'Group,Level,Code,Elemento,Importe,Importe de Referencia');
  });
});
