import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers, buildJsreportHelpersString } from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-4899 — profit-loss ("Pérdidas y Ganancias") is an INDENTED ACCOUNT-REPORT
// TREE, mirroring Etendo Classic's GeneralAccountingReports, not a flat 3-category
// listing. The contract's `sql.query` returns the flat tree-node list walked down
// from the accounting report's root (c_acct_rpt -> c_acct_rpt_group ->
// c_acct_rpt_node, reporttype='N'), `sql.operandsQuery` returns the formula edges,
// and buildAccountReportTree() in report-api.js turns both into the rows the
// templates render (its own behaviour is pinned in
// report-api-build-account-report-tree.test.js).
//
// The user-facing parameters are unchanged: an accountLevel cutoff, a
// showOnlyAccountsWithValue toggle, and a compareTo reference-period comparison
// (with a conditionally required referenceYearId via the generic `requiredIf`).
// accountLevel/showOnlyAccountsWithValue are applied in JS now, NOT in SQL.
//
// These tests read the REAL contract SQL / real .hbs templates from disk (never
// hardcode a copy) so a future edit that breaks this behavior fails here.

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/profit-loss');
const CONTRACT = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;
const OPERANDS_SQL = CONTRACT.sql.operandsQuery;
const HELPERS_CODE = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');

// ── Part 1: contract shape ──────────────────────────────────────────────────

function findParam(name) {
  return (CONTRACT.parameters || []).find((p) => p.name === name);
}

describe('profit-loss report-contract.json — sections', () => {
  it('declares periodo, agrupacion and comparacion sections with bilingual labels', () => {
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
});

describe('profit-loss report-contract.json — period date-range parameters', () => {
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
});

describe('profit-loss report-contract.json — accountLevel parameter', () => {
  it('is a required select with default "C" and the 4 expected options', () => {
    const p = findParam('accountLevel');
    assert.ok(p, 'expected an "accountLevel" parameter');
    assert.equal(p.type, 'select');
    assert.equal(p.required, true);
    assert.equal(p.default, 'C');
    assert.equal(p.section, 'agrupacion');

    const byValue = Object.fromEntries((p.options || []).map((o) => [o.value, o]));
    assert.deepEqual(Object.keys(byValue).sort(), ['C', 'D', 'E', 'S']);
    assert.equal(byValue.S.label.en_US, 'Subaccount');
    assert.equal(byValue.S.label.es_ES, 'Subcuenta');
    assert.equal(byValue.D.label.en_US, 'Breakdown');
    assert.equal(byValue.D.label.es_ES, 'Desglose');
    assert.equal(byValue.C.label.en_US, 'Account');
    assert.equal(byValue.C.label.es_ES, 'Cuenta');
    assert.equal(byValue.E.label.en_US, 'Heading');
    assert.equal(byValue.E.label.es_ES, 'Epígrafe');
  });
});

describe('profit-loss report-contract.json — showOnlyAccountsWithValue parameter', () => {
  it('is a toggle defaulting to true, in the "agrupacion" section', () => {
    const p = findParam('showOnlyAccountsWithValue');
    assert.ok(p, 'expected a "showOnlyAccountsWithValue" parameter');
    assert.equal(p.type, 'toggle');
    assert.equal(p.default, true);
    assert.equal(p.section, 'agrupacion');
  });
});

describe('profit-loss report-contract.json — compareTo parameter', () => {
  it('is a toggle defaulting to false, in the "comparacion" section', () => {
    const p = findParam('compareTo');
    assert.ok(p, 'expected a "compareTo" parameter');
    assert.equal(p.type, 'toggle');
    assert.equal(p.default, false);
    assert.equal(p.section, 'comparacion');
  });
});

describe('profit-loss report-contract.json — referenceYearId parameter', () => {
  it('is a search parameter conditionally required on compareTo=="true", NOT a plain required:true', () => {
    const p = findParam('referenceYearId');
    assert.ok(p, 'expected a "referenceYearId" parameter');
    assert.equal(p.type, 'search');
    assert.equal(p.selector, 'year');
    assert.equal(p.dependsOn, 'orgId');
    assert.equal(p.section, 'comparacion');
    assert.ok(!p.required, 'referenceYearId must NOT be a plain required:true');
    assert.deepEqual(p.requiredIf, { param: 'compareTo', equals: 'true' });
  });
});

describe('profit-loss report-contract.json — reference date-range parameters', () => {
  for (const name of ['fromReferenceDate', 'toReferenceDate']) {
    it(`${name} is an optional date parameter in the "comparacion" section`, () => {
      const p = findParam(name);
      assert.ok(p, `expected a "${name}" parameter`);
      assert.equal(p.type, 'date');
      assert.equal(p.section, 'comparacion');
      assert.ok(!p.required, `${name} must NOT be required`);
      assert.ok(!p.requiredIf, `${name} must NOT be conditionally required`);
    });
  }
});

describe('profit-loss report-contract.json — comparison fields are visible only when comparing', () => {
  for (const name of ['referenceYearId', 'fromReferenceDate', 'toReferenceDate']) {
    it(`${name} declares visibleIf compareTo=="true"`, () => {
      const p = findParam(name);
      assert.deepEqual(p.visibleIf, { param: 'compareTo', equals: 'true' });
    });
  }
});

describe('profit-loss report-contract.json — columns', () => {
  it('is exactly element / amount / amount_ref (the tree shape, not the old category/account listing)', () => {
    assert.deepEqual((CONTRACT.columns || []).map((c) => c.field), ['element', 'amount', 'amount_ref']);
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
    // buildAccountReportTree() emits already-ordered, already-flattened rows;
    // a `groups`/`defaultSort` here would fight it.
    assert.equal(CONTRACT.groups, undefined);
    assert.equal(CONTRACT.defaultSort, undefined);
  });

  it('is still a grouped-listing report', () => {
    assert.equal(CONTRACT.type, 'grouped-listing');
  });
});

// ── Part 2: SQL wiring ──────────────────────────────────────────────────────

describe('profit-loss SQL — period/comparison placeholders are referenced', () => {
  for (const placeholder of [
    '__YEARID__',
    '__DATEFROM__',
    '__DATETO__',
    '__COMPARETO__',
    '__REFERENCEYEARID__',
    '__FROMREFERENCEDATE__',
    '__TOREFERENCEDATE__',
    '__ORGID__',
    '__ACCTSCHEMAID__',
    '__CLIENT_ID__',
  ]) {
    it(`references ${placeholder}`, () => {
      assert.match(SQL, new RegExp(placeholder), `expected ${placeholder} in the SQL`);
    });
  }
});

describe('profit-loss SQL — accountLevel / showOnlyAccountsWithValue are applied in JS, not SQL', () => {
  // Both are cumulative/recursive tree operations (a depth cutoff and a
  // "either period non-zero, unless isalwaysshown" filter that must run AFTER
  // formula nodes resolve), so they live in buildAccountReportTree(). The SQL
  // must return the whole tree unfiltered or the roll-ups would be wrong.
  for (const placeholder of ['__ACCOUNTLEVEL__', '__SHOWONLYACCOUNTSWITHVALUE__']) {
    it(`does NOT reference ${placeholder}`, () => {
      assert.doesNotMatch(SQL, new RegExp(placeholder));
    });
  }
});

describe('profit-loss SQL — optional date placeholders cast plainly, guarded by an OR-blank clause', () => {
  // Each optional date placeholder is cast directly with `'__X__'::date` —
  // NOT wrapped in NULLIF. That's deliberate: when the field is left blank,
  // report-api.js's `stripBlankOptionalClauses()` deletes the ENTIRE
  // `AND ('__X__' = '' OR ...)` clause (paren-depth-aware, so it survives
  // nested subqueries/casts) before the query ever reaches Postgres — the
  // bare cast is only ever evaluated once a real, non-empty value has already
  // been substituted in. Wrapping it in NULLIF() was tried and is WRONG: it
  // makes the placeholder appear twice with a nested closing paren in between,
  // which used to defeat the (now-fixed) clause stripper and produce a real
  // "syntax error at or near )" in the browser.
  for (const name of ['DATEFROM', 'DATETO', 'FROMREFERENCEDATE', 'TOREFERENCEDATE']) {
    const placeholder = `__${name}__`;

    it(`${placeholder} is guarded by ('${placeholder}' = '' OR ...) with a plain '${placeholder}'::date cast`, () => {
      assert.doesNotMatch(
        SQL,
        new RegExp(`NULLIF\\('${placeholder}'`),
        `${placeholder} must not be wrapped in NULLIF(...) — it defeats stripBlankOptionalClauses()'s paren matching`
      );

      const castPattern = new RegExp(`'${placeholder}'::date`);
      assert.match(SQL, castPattern, `expected a plain '${placeholder}'::date cast in the SQL`);

      const guardPattern = new RegExp(`\\('${placeholder}'\\s*=\\s*''\\s*OR`);
      assert.match(SQL, guardPattern, `expected an OR-blank guard clause for ${placeholder}`);
    });
  }
});

describe('profit-loss SQL — returns the flat tree-node list buildAccountReportTree() consumes', () => {
  for (const column of [
    'node_id',
    'parent_id',
    'depth',
    'sort_path',
    'elementlevel',
    'isalwaysshown',
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

  it('COALESCEs parent_id to \'\' so roots are detectable without NULL handling in JS', () => {
    assert.match(SQL, /COALESCE\(t\.parent_id,\s*''\)\s+AS\s+parent_id/);
  });

  it('orders by sort_path (the zero-padded seqno chain = document order)', () => {
    assert.match(SQL, /ORDER BY\s+t\.sort_path\s*$/);
  });
});

describe('profit-loss SQL — walks the accounting report tree, not a bare chart of accounts', () => {
  it('selects the report from c_acct_rpt by reporttype=\'N\' and the accounting schema', () => {
    assert.match(SQL, /FROM\s+c_acct_rpt\b/);
    assert.match(SQL, /r\.reporttype\s*=\s*'N'/);
    assert.match(SQL, /r\.c_acctschema_id\s*=\s*'__ACCTSCHEMAID__'/);
  });

  it('takes its roots from c_acct_rpt_node joined to c_acct_rpt_group', () => {
    assert.match(SQL, /c_acct_rpt_node/);
    assert.match(SQL, /c_acct_rpt_group/);
  });

  it('descends recursively through ad_treenode', () => {
    assert.match(SQL, /WITH RECURSIVE/);
    assert.match(SQL, /FROM\s+ad_treenode\s+tn/);
    assert.match(SQL, /tn\.parent_id\s*=\s*t\.node_id/);
  });

  it('scopes nodes to the accounting schema\'s own c_element — deduping a chart loaded twice', () => {
    assert.match(SQL, /FROM\s+c_acctschema_element\s+ase/);
    assert.match(SQL, /ase\.elementtype\s*=\s*'AC'/);
    assert.match(SQL, /ev\.c_element_id\s*=\s*\(SELECT c_element_id FROM elem\)/);
  });
});

describe('profit-loss SQL — amounts are credit MINUS debit (Classic\'s P&L sign convention)', () => {
  it('both own_amt and own_amt_ref sum fa.amtacctcr - fa.amtacctdr', () => {
    const matches = [...SQL.matchAll(/fa\.amtacctcr\s*-\s*fa\.amtacctdr/g)];
    assert.equal(matches.length, 2, 'expected exactly two credit-minus-debit expressions (main + reference period)');
    assert.doesNotMatch(SQL, /fa\.amtacctdr\s*-\s*fa\.amtacctcr/, 'the sign must never be flipped to debit-minus-credit');
  });

  it('the reference-period amount is gated by \'__COMPARETO__\' = \'true\'', () => {
    const refIdx = SQL.indexOf('AS own_amt_ref');
    assert.ok(refIdx !== -1, 'expected an "own_amt_ref" computed column');
    const caseStart = SQL.lastIndexOf('SUM(CASE WHEN', refIdx);
    assert.ok(caseStart !== -1, 'expected a SUM(CASE WHEN ...) before "AS own_amt_ref"');
    assert.match(SQL.slice(caseStart, refIdx), /'__COMPARETO__'\s*=\s*'true'/);
  });

  it('excludes regularization/closing fact types', () => {
    assert.match(SQL, /fa\.factaccttype\s+NOT IN\s*\('R',\s*'C'\)/);
  });
});

describe('profit-loss SQL — the pre-ETP-4899 flat-listing design is gone', () => {
  it('has no "rolled" CTE (accountLevel is no longer a SQL equality filter)', () => {
    assert.doesNotMatch(SQL, /\brolled\b/);
  });

  it('has no dr_ref / cr_ref columns', () => {
    assert.doesNotMatch(SQL, /\bdr_ref\b/);
    assert.doesNotMatch(SQL, /\bcr_ref\b/);
  });

  it('has no hardcoded "Net Income" UNION branch (P.G.* formula nodes replace it)', () => {
    assert.doesNotMatch(SQL, /Net Income/);
    assert.doesNotMatch(SQL, /UNION ALL\s+SELECT\s+'3\./);
  });
});

describe('profit-loss SQL — operandsQuery (formula edges)', () => {
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
});

// ── Part 3: template rendering (real Handlebars, real .hbs from disk) ───────

// Labels as they actually resolve in meta.labels (buildContractLabels() in
// report-api.js keys contract.columns by `field`) — verified against
// artifacts/profit-loss/report-contract.json above.
const LABELS = {
  en_US: { element: 'Element', amount: 'Amount', amount_ref: 'Reference Amount' },
  es_ES: { element: 'Elemento', amount: 'Importe', amount_ref: 'Importe de Referencia' },
};

const META_BASE = {
  title: 'Profit & Loss',
  generatedAt: '2026-08-19T00:00:00.000Z',
  recordCount: 4,
  ui: { records: 'records', total: 'Total', generatedBy: 'Generated by Schema Forge' },
  filters: [
    { label: 'Year', value: '2026' },
    { label: 'Account Level', value: 'Account' },
  ],
};

// Shaped exactly like buildAccountReportTree()'s output, with the real amounts
// from the verified GOClient 2026 run (P.G.4 / 600 / 6000, plus a comma-and-
// quote-bearing name to exercise the CSV escaping).
const ROWS = [
  { node_id: 'n1', value: 'P.G.1', name: 'Importe neto de la cifra de negocios', element: 'P.G.1 - Importe neto de la cifra de negocios', elementlevel: 'E', amount: 8716.16, amount_ref: 8000, indent: 0, indentClass: 'ind-0', isHeading: true },
  { node_id: 'n2', value: '700', name: 'Ventas de mercaderías', element: '700 - Ventas de mercaderías', elementlevel: 'C', amount: 8716.16, amount_ref: 8000, indent: 1, indentClass: 'ind-1', isHeading: false },
  { node_id: 'n3', value: '600', name: 'Compras, netas de "rappels"', element: '600 - Compras, netas de "rappels"', elementlevel: 'C', amount: -22.48, amount_ref: 0, indent: 1, indentClass: 'ind-1', isHeading: false },
  { node_id: 'n4', value: '6000', name: 'Compras de mercaderías', element: '6000 - Compras de mercaderías', elementlevel: 'D', amount: -22.48, amount_ref: 0, indent: 2, indentClass: 'ind-2', isHeading: false },
];

function renderHtml({ compareTo, locale = 'en_US', rows = ROWS } = {}) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, HELPERS_CODE);
  const template = hb.compile(readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8'));
  const meta = {
    ...META_BASE,
    labels: LABELS[locale],
    params: compareTo === undefined ? {} : { compareTo: String(compareTo) },
  };
  return template({ css: '', meta, rows });
}

describe('profit-loss template.hbs — tree rendering', () => {
  it('renders exactly one row per input row, in order', () => {
    const html = renderHtml({ compareTo: false });
    assert.doesNotMatch(html, /Missing helper/);
    assert.equal([...html.matchAll(/class="tree-row/g)].length, ROWS.length);
    // Scope to the tbody: the CSS block above it legitimately contains "700"
    // (font-weight), which would poison a whole-document indexOf.
    const tbody = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    const positions = ROWS.map((r) => tbody.indexOf(`>${r.value} - `));
    assert.ok(positions.every((p) => p !== -1), 'every row must be rendered');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'rows must keep the tree document order');
  });

  it("applies each row's precomputed indentClass to the element cell", () => {
    const html = renderHtml({ compareTo: false });
    assert.match(html, /<td class="ind-0">P\.G\.1 - Importe neto de la cifra de negocios<\/td>/);
    assert.match(html, /<td class="ind-1">700 - Ventas de mercaderías<\/td>/);
    assert.match(html, /<td class="ind-2">6000 - Compras de mercaderías<\/td>/);
  });

  it('marks only isHeading rows with the bold "heading" class', () => {
    const html = renderHtml({ compareTo: false });
    const headingRows = [...html.matchAll(/class="tree-row heading"/g)];
    assert.equal(headingRows.length, 1, 'exactly one heading row in the fixture');
    const idx = html.indexOf('class="tree-row heading"');
    assert.match(html.slice(idx, html.indexOf('</tr>', idx)), /P\.G\.1/);
  });

  it('defines a .ind-N padding rule for every indent level the JS can emit (0..6)', () => {
    const html = renderHtml({ compareTo: false });
    for (let i = 0; i <= 6; i += 1) {
      assert.match(html, new RegExp(`\\.ind-${i}\\s*\\{`), `missing CSS rule for .ind-${i}`);
    }
  });

  it('formats amounts through formatCurrency (es-ES grouping, negatives preserved)', () => {
    const html = renderHtml({ compareTo: false });
    assert.match(html, />8\.716,16</);
    assert.match(html, />-22,48</);
    assert.doesNotMatch(html, />8716\.16</, 'amounts must never be printed raw in the HTML/PDF template');
  });
});

describe('profit-loss template.hbs — Reference Amount column visibility', () => {
  it('compareTo=true: shows the header, a 3-col colgroup and a reference cell per row', () => {
    const html = renderHtml({ compareTo: true });
    assert.doesNotMatch(html, /Missing helper/);
    assert.match(html, /<th class="cell-amount">Reference Amount<\/th>/);
    assert.equal([...html.matchAll(/<col style="width:20%">/g)].length, 2);
    // 2 amount cells per row (main + reference) + 2 amount headers.
    assert.equal([...html.matchAll(/class="cell-amount"/g)].length, ROWS.length * 2 + 2);
    assert.match(html, />8\.000,00</, 'the reference amount must be rendered');
  });

  it('compareTo=false: hides the header and every reference cell, and uses the 2-col colgroup', () => {
    const html = renderHtml({ compareTo: false });
    assert.doesNotMatch(html, /Missing helper/);
    assert.doesNotMatch(html, /Reference Amount/);
    assert.match(html, /<col style="width:75%">/);
    assert.match(html, /<col style="width:25%">/);
    assert.equal([...html.matchAll(/class="cell-amount"/g)].length, ROWS.length + 1);
    assert.doesNotMatch(html, />8\.000,00</);
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

describe('profit-loss template-excel.hbs', () => {
  it('flattens the tree: depth becomes a numeric "Level" column plus separate Code/Name columns', () => {
    const html = renderExcel({ compareTo: false });
    assert.doesNotMatch(html, /Missing helper/);
    assert.match(html, /<th>Level<\/th>/);
    assert.match(html, /<th>Code<\/th>/);
    assert.match(html, /<th>Name<\/th>/);
    // No indentation classes leak into the calculation-friendly grid.
    assert.doesNotMatch(html, /ind-\d/);
    assert.equal([...html.matchAll(/<tr>/g)].length, ROWS.length + 1); // + header row
  });

  it('emits the indent depth as a numeric cell', () => {
    const html = renderExcel({ compareTo: false });
    const rowIdx = html.indexOf('6000');
    const row = html.slice(html.lastIndexOf('<tr>', rowIdx), html.indexOf('</tr>', rowIdx));
    assert.match(row, /<td data-cell-type="number">2<\/td>/, 'the "6000" row sits at indent 2');
    assert.match(row, /<td>6000<\/td>/);
    assert.match(row, /<td>Compras de mercaderías<\/td>/);
  });

  it('amount cells are numeric (data-cell-type="number") with RAW unformatted values', () => {
    const html = renderExcel({ compareTo: false });
    assert.match(html, /<td data-cell-type="number">8716\.16<\/td>/);
    assert.match(html, /<td data-cell-type="number">-22\.48<\/td>/);
    assert.doesNotMatch(html, /8\.716,16/, 'amounts must never go through formatCurrency in the Excel export');
  });

  it('includes the reference-amount column only when compareTo === "true"', () => {
    const on = renderExcel({ compareTo: true });
    assert.match(on, /<th>Reference Amount<\/th>/);
    assert.match(on, /<td data-cell-type="number">8000<\/td>/);

    const off = renderExcel({ compareTo: false });
    assert.doesNotMatch(off, /Reference Amount/);
    assert.doesNotMatch(off, /<td data-cell-type="number">8000<\/td>/);
  });

  it('amount headers are translated [es_ES]', () => {
    const html = renderExcel({ compareTo: true, locale: 'es_ES' });
    assert.match(html, /<th>Importe<\/th>/);
    assert.match(html, /<th>Importe de Referencia<\/th>/);
  });
});

// ── CSV (jsreport render path, recipe 'text') ───────────────────────────────
//
// Mirrors tax-report-excel-csv-templates.test.js: builds the helpers string the
// same way report-api.js does for jsreport (canonical set + this report's
// `csvField` extracted from helpers.js), evaluates it, and registers on a fresh
// Handlebars instance.

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

describe('profit-loss template-csv.hbs', () => {
  it('emits real comma-separated text — a header line plus one line per row, no HTML', () => {
    const csv = renderCsv({ compareTo: false });
    assert.doesNotMatch(csv, /Missing helper/);
    assert.doesNotMatch(csv, /</, 'the CSV export must contain no markup at all');
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, ROWS.length + 1);
    assert.equal(lines[0], 'Level,Code,Element,Amount');
  });

  it('writes the tree depth as the Level column and the raw dot-decimal amount', () => {
    const csv = renderCsv({ compareTo: false });
    const lines = csv.trim().split('\n');
    assert.equal(lines[1], '0,P.G.1,Importe neto de la cifra de negocios,8716.16');
    assert.equal(lines[4], '2,6000,Compras de mercaderías,-22.48');
    assert.doesNotMatch(csv, /8\.716,16/, 'amounts must never go through formatCurrency in the CSV export');
  });

  it('quotes a name containing a comma and doubles embedded quotes (no &quot; leak)', () => {
    const csv = renderCsv({ compareTo: false });
    assert.match(csv, /"Compras, netas de ""rappels"""/);
    assert.doesNotMatch(csv, /&quot;/, 'csvField output must never be HTML-escaped — the template must use {{{ }}}, not {{ }}');
  });

  it('appends the reference-amount column only when compareTo === "true"', () => {
    const on = renderCsv({ compareTo: true }).trim().split('\n');
    assert.equal(on[0], 'Level,Code,Element,Amount,Reference Amount');
    assert.equal(on[1], '0,P.G.1,Importe neto de la cifra de negocios,8716.16,8000');

    const off = renderCsv({ compareTo: false }).trim().split('\n');
    assert.equal(off[0], 'Level,Code,Element,Amount');
    assert.equal(off[1], '0,P.G.1,Importe neto de la cifra de negocios,8716.16');
  });

  it('header row uses translated labels [es_ES]', () => {
    const csv = renderCsv({ compareTo: true, locale: 'es_ES' });
    assert.equal(csv.trim().split('\n')[0], 'Level,Code,Elemento,Importe,Importe de Referencia');
  });
});
