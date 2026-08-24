import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { registerReportHelpers, buildJsreportHelpersString } from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-4898 — report-journal-entries ("Diario de Asientos") show* toggles.
//
// Classic's ReportGeneralLedgerJournal has 6 checkboxes: 5 that OR together into
// a factaccttype filter (Regular/N, P&L Closing/R, Closing/C, Opening/O, Divide
// Up/D) — with the rule that if all 5 are unchecked the report still forces
// factaccttype='N' so the report never silently returns 0 rows — plus a 6th
// (showEntryDescription) that is NOT a filter: it only toggles whether the
// `entry_description` column renders in the output.
//
// These tests read the REAL contract SQL / real .hbs templates from disk (never
// hardcode a copy of the clause) so a future edit to the contract or templates
// that breaks this behavior fails here.

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-journal-entries');
const CONTRACT = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;

// ── Part 1: SQL filter clause ───────────────────────────────────────────────

/** Extract balanced-paren substring starting at `openIdx` (which must be '('). */
function extractBalancedParen(str, openIdx) {
  assert.equal(str[openIdx], '(', 'extractBalancedParen must start at an opening paren');
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return str.slice(openIdx, i + 1);
    }
  }
  throw new Error('unbalanced parens while extracting clause');
}

/**
 * Locates the real `AND (...)` OR-group that gates the 5 showXEntries toggles
 * inside the report's actual SQL, by finding the enclosing "AND (" nearest to
 * the first `__SHOWREGULARENTRIES__` placeholder — NOT a hardcoded copy of the
 * clause text.
 */
function extractShowEntriesClause(sql) {
  const marker = `__SHOWREGULARENTRIES__`;
  const markerIdx = sql.indexOf(marker);
  assert.ok(markerIdx !== -1, 'contract SQL must reference __SHOWREGULARENTRIES__');
  const before = sql.slice(0, markerIdx);
  const andIdx = before.lastIndexOf('AND (');
  assert.ok(andIdx !== -1, 'expected an enclosing "AND (" before __SHOWREGULARENTRIES__');
  const openIdx = andIdx + 'AND '.length; // index of the '(' right after "AND "
  return extractBalancedParen(sql, openIdx);
}

/** Same placeholder-substitution rule applyPlaceholders() uses: __KEY__ -> raw value (quotes untouched). */
function substitutePlaceholders(clauseSql, params) {
  let q = clauseSql;
  for (const [key, value] of Object.entries(params)) {
    q = q.replace(new RegExp(`__${key.toUpperCase()}__`, 'g'), String(value));
  }
  return q;
}

/**
 * Turns the (already placeholder-substituted) SQL boolean clause into a JS
 * boolean expression evaluable for a candidate `fa.factaccttype` value, and
 * evaluates it. Handles exactly the shape this clause uses: parens, AND/OR,
 * `fa.factaccttype = 'X'`, and quoted-string `=`/`<>` comparisons.
 */
function evaluateClauseForLetter(clauseSql, letter) {
  let js = clauseSql;
  js = js.replace(/fa\.factaccttype\s*=\s*'([A-Z])'/g, (_m, l) => (letter === l ? 'true' : 'false'));
  // Convert `<>` to a placeholder BEFORE the single-`=` pass, so that pass never
  // sees (and mangles) the second `=` of the `!==` this will become.
  js = js.replace(/<>/g, '§NEQ§');
  js = js.replace(/(?<![<>=!])=(?!=)/g, '===');
  js = js.replace(/§NEQ§/g, '!==');
  js = js.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${js});`)();
}

function passesFor(letter, params) {
  const clause = substitutePlaceholders(extractShowEntriesClause(SQL), params);
  return evaluateClauseForLetter(clause, letter);
}

const ALL_LETTERS = ['N', 'R', 'C', 'O', 'D'];
const DEFAULT_PARAMS = {
  showRegularEntries: 'true',
  showPlClosingEntries: 'true',
  showClosingEntries: 'true',
  showOpeningEntries: 'true',
  showDivideUpEntries: 'true',
};

describe('report-journal-entries — show*Entries SQL filter (ETP-4898)', () => {
  it('the contract SQL still references all 5 show*Entries placeholders plus the fallback', () => {
    const clause = extractShowEntriesClause(SQL);
    for (const p of ['SHOWREGULARENTRIES', 'SHOWPLCLOSINGENTRIES', 'SHOWCLOSINGENTRIES', 'SHOWOPENINGENTRIES', 'SHOWDIVIDEUPENTRIES']) {
      assert.match(clause, new RegExp(`__${p}__`), `expected __${p}__ in the extracted clause`);
    }
    // fallback sub-clause: all 5 <> 'true' AND factaccttype = 'N'
    assert.match(clause, /factaccttype\s*=\s*'N'/g);
  });

  it('with all 5 defaults (true), every factaccttype letter passes — equivalent to the old IN (\'C\',\'N\',\'O\',\'R\',\'D\')', () => {
    for (const letter of ALL_LETTERS) {
      assert.equal(passesFor(letter, DEFAULT_PARAMS), true, `letter ${letter} should pass with all defaults`);
    }
  });

  it('with all 5 unchecked (false), the fallback forces only \'N\' to pass', () => {
    const allFalse = Object.fromEntries(Object.keys(DEFAULT_PARAMS).map((k) => [k, 'false']));
    assert.equal(passesFor('N', allFalse), true, 'fallback must let Regular (N) through when all 5 are unchecked');
    for (const letter of ['R', 'C', 'O', 'D']) {
      assert.equal(passesFor(letter, allFalse), false, `letter ${letter} must NOT pass when all 5 are unchecked`);
    }
  });

  it('a partial combination (only showOpeningEntries=true) lets only \'O\' pass — no fallback triggers', () => {
    const partial = {
      showRegularEntries: 'false',
      showPlClosingEntries: 'false',
      showClosingEntries: 'false',
      showOpeningEntries: 'true',
      showDivideUpEntries: 'false',
    };
    assert.equal(passesFor('O', partial), true);
    for (const letter of ['N', 'R', 'C', 'D']) {
      assert.equal(passesFor(letter, partial), false, `letter ${letter} must NOT pass with only showOpeningEntries=true`);
    }
  });

  it('another partial combination (showRegularEntries + showClosingEntries) lets exactly N and C pass', () => {
    const partial = {
      showRegularEntries: 'true',
      showPlClosingEntries: 'false',
      showClosingEntries: 'true',
      showOpeningEntries: 'false',
      showDivideUpEntries: 'false',
    };
    assert.equal(passesFor('N', partial), true);
    assert.equal(passesFor('C', partial), true);
    for (const letter of ['R', 'O', 'D']) {
      assert.equal(passesFor(letter, partial), false, `letter ${letter} must NOT pass`);
    }
  });
});

// ── Part 2: entry_description column visibility in templates ───────────────

const META_BASE = {
  title: 'Journal Entries',
  generatedAt: '2026-08-18T00:00:00.000Z',
  recordCount: 1,
  ui: { records: 'records', total: 'Total', generatedBy: 'Generated by Schema Forge' },
  labels: {
    fact_acct_group_id: 'Entry',
    dateacct: 'Date',
    document_type: 'Document Type',
    account_no: 'Account No.',
    account_name: 'Account Name',
    amtacctdr: 'Debit',
    amtacctcr: 'Credit',
    entry_description: 'ENTRY DESCRIPTION LABEL',
  },
};

const ROWS = [
  {
    entry_no: 1,
    fact_acct_group_id: 'grp-1',
    dateacct: '2026-08-01',
    document_type: 'Journal',
    account_no: '43000000',
    account_name: 'Clientes',
    amtacctdr: 1000,
    amtacctcr: 0,
    entry_description: 'ENTRY DESCRIPTION VALUE',
  },
];

function renderHtmlLike(templateFile, showEntryDescription) {
  const hb = Handlebars.create();
  const helpersCode = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  registerReportHelpers(hb, helpersCode);
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, templateFile), 'utf8');
  const template = hb.compile(templateSrc);
  return template({
    css: '',
    meta: { ...META_BASE, params: { showEntryDescription: String(showEntryDescription) } },
    rows: ROWS,
  });
}

describe('report-journal-entries — template.hbs (HTML/PDF) entry_description column', () => {
  it('hides the column and value when showEntryDescription=false', () => {
    const html = renderHtmlLike('template.hbs', false);
    assert.doesNotMatch(html, /ENTRY DESCRIPTION LABEL/);
    assert.doesNotMatch(html, /ENTRY DESCRIPTION VALUE/);
  });

  it('shows the column header and value when showEntryDescription=true', () => {
    const html = renderHtmlLike('template.hbs', true);
    assert.match(html, /ENTRY DESCRIPTION LABEL/);
    assert.match(html, /ENTRY DESCRIPTION VALUE/);
  });
});

describe('report-journal-entries — template-excel.hbs entry_description column', () => {
  it('hides the column and value when showEntryDescription=false', () => {
    const html = renderHtmlLike('template-excel.hbs', false);
    assert.doesNotMatch(html, /ENTRY DESCRIPTION LABEL/);
    assert.doesNotMatch(html, /ENTRY DESCRIPTION VALUE/);
  });

  it('shows the column header and value when showEntryDescription=true', () => {
    const html = renderHtmlLike('template-excel.hbs', true);
    assert.match(html, /ENTRY DESCRIPTION LABEL/);
    assert.match(html, /ENTRY DESCRIPTION VALUE/);
  });
});

// CSV goes through the jsreport render path (recipe 'text'): the helpers string
// sent to jsreport is built via buildJsreportHelpersString (canonical set +
// the report-specific `csvField` extra extracted from helpers.js), then
// evaluated with `new Function` — mirroring exactly what report-api.js does
// for the jsreport (pdf/xlsx/csv) branch, per report-jsreport-helpers-builder.test.js.
function renderCsv(showEntryDescription) {
  const helpersCode = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  const built = buildJsreportHelpersString(helpersCode);
  const helperNames = [...built.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  // eslint-disable-next-line no-new-func
  const helpers = new Function(`${built}\nreturn { ${helperNames.join(', ')} };`)();

  const hb = Handlebars.create();
  for (const [name, fn] of Object.entries(helpers)) {
    hb.registerHelper(name, fn);
  }
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, 'template-csv.hbs'), 'utf8');
  const template = hb.compile(templateSrc);
  return template({
    meta: { ...META_BASE, params: { showEntryDescription: String(showEntryDescription) } },
    rows: ROWS,
  });
}

describe('report-journal-entries — template-csv.hbs entry_description column', () => {
  it('omits the description column (header + value) when showEntryDescription=false', () => {
    const csv = renderCsv(false);
    assert.doesNotMatch(csv, /ENTRY DESCRIPTION LABEL/);
    assert.doesNotMatch(csv, /ENTRY DESCRIPTION VALUE/);
  });

  it('appends the description column (header + value) when showEntryDescription=true', () => {
    const csv = renderCsv(true);
    assert.match(csv, /ENTRY DESCRIPTION LABEL/);
    assert.match(csv, /ENTRY DESCRIPTION VALUE/);
  });
});
