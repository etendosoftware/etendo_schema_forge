import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ETP-4898 — report-trial-balance ("Balance de Sumas y Saldos") new
// `openingEntryAmount` toggle.
//
// Mirrors Classic's com.etendoerp.financial.reports.advanced.handler
// .TrialBalanceAdvanced "OpeningEntryAmount" checkbox (AD Process
// D8E8015B1478473799E47F84796C481C):
//
//   - Rows with fa.dateacct < dateFrom always land in opening_balance,
//     regardless of the toggle.
//   - Rows with fa.dateacct = dateFrom AND fa.factaccttype = 'O':
//       true  (default) -> counted in opening_balance, excluded from activity
//       false           -> excluded from opening_balance, counted in activity
//   - closing_balance is never affected by the toggle either way.
//
// This test reads the REAL contract SQL from disk (never a hardcoded copy of
// the clause) so a future edit to the contract that breaks this behavior
// fails here — same convention as report-journal-entries-show-options.test.js.

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-trial-balance');
const CONTRACT = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'report-contract.json'), 'utf8'));
const SQL = CONTRACT.sql.query;

// ── Part 1: contract shape (parameter + section) ────────────────────────────

describe('report-trial-balance — openingEntryAmount contract parameter (ETP-4898)', () => {
  it('declares the openingEntryAmount toggle parameter with the expected shape', () => {
    const param = CONTRACT.parameters.find((p) => p.name === 'openingEntryAmount');
    assert.ok(param, 'expected a parameter named openingEntryAmount');
    assert.equal(param.type, 'toggle');
    assert.equal(param.default, true);
    assert.equal(param.section, 'opciones');
    assert.equal(param.label.en_US, 'Opening Entry Amount to Initial Balance');
    assert.equal(param.label.es_ES, 'Importe del asiento de apertura al saldo inicial');
  });

  it('declares the "opciones" section referenced by the parameter', () => {
    const section = CONTRACT.sections.find((s) => s.id === 'opciones');
    assert.ok(section, 'expected a section with id "opciones"');
    assert.equal(section.label.en_US, 'Options');
    assert.equal(section.label.es_ES, 'Opciones');
  });
});

// ── Part 2: SQL placeholder wiring ───────────────────────────────────────────

/**
 * Enumerates every `CASE WHEN <cond> THEN ... ELSE 0 END), 0) AS <alias>`
 * clause in the SQL and returns a map of alias -> condition. Uses a global,
 * non-anchored regex so each CASE block only ever pairs with its own nearest
 * alias (no manual index bookkeeping needed).
 */
function extractCaseConditionsByAlias(sql) {
  const re = /CASE WHEN ([\s\S]*?) THEN [\s\S]*? ELSE 0 END\), 0\) AS (\w+)/g;
  const byAlias = {};
  let m;
  while ((m = re.exec(sql))) {
    byAlias[m[2]] = m[1];
  }
  return byAlias;
}

const CASE_CONDITIONS = extractCaseConditionsByAlias(SQL);

function requireCondition(alias) {
  assert.ok(CASE_CONDITIONS[alias], `expected to find a CASE...END clause aliased as ${alias}`);
  return CASE_CONDITIONS[alias];
}

const openingBalanceCond = requireCondition('opening_balance');
const activityDebitCond = requireCondition('activity_debit');
const activityCreditCond = requireCondition('activity_credit');
const closingBalanceCond = requireCondition('closing_balance');

describe('report-trial-balance — __OPENINGENTRYAMOUNT__ placeholder wiring (ETP-4898)', () => {
  it('opening_balance CASE references __OPENINGENTRYAMOUNT__ in an OR-clause with fa.factaccttype = \'O\'', () => {
    assert.match(openingBalanceCond, /OR\s*\(fa\.dateacct = '__DATEFROM__'::date AND fa\.factaccttype = 'O' AND '__OPENINGENTRYAMOUNT__' = 'true'\)/);
  });

  it('activity_debit CASE references __OPENINGENTRYAMOUNT__ inside a NOT(...) guard', () => {
    assert.match(activityDebitCond, /NOT\s*\(fa\.dateacct = '__DATEFROM__'::date AND fa\.factaccttype = 'O' AND '__OPENINGENTRYAMOUNT__' = 'true'\)/);
  });

  it('activity_credit CASE references __OPENINGENTRYAMOUNT__ inside the same NOT(...) guard', () => {
    assert.match(activityCreditCond, /NOT\s*\(fa\.dateacct = '__DATEFROM__'::date AND fa\.factaccttype = 'O' AND '__OPENINGENTRYAMOUNT__' = 'true'\)/);
  });

  it('closing_balance CASE does NOT reference __OPENINGENTRYAMOUNT__ — unaffected by the toggle', () => {
    assert.doesNotMatch(closingBalanceCond, /__OPENINGENTRYAMOUNT__/);
    assert.doesNotMatch(closingBalanceCond, /factaccttype/);
  });
});

// ── Part 3: placeholder substitution + row-level semantics ─────────────────

/** Same placeholder-substitution rule applyPlaceholders() uses: __KEY__ -> raw value (quotes untouched). */
function substitutePlaceholders(clauseSql, params) {
  let q = clauseSql;
  for (const [key, value] of Object.entries(params)) {
    q = q.replace(new RegExp(`__${key.toUpperCase()}__`, 'g'), String(value));
  }
  return q;
}

function compareDates(rowDate, op, lit) {
  switch (op) {
    case '<': return rowDate < lit;
    case '<=': return rowDate <= lit;
    case '>': return rowDate > lit;
    case '>=': return rowDate >= lit;
    case '=': return rowDate === lit;
    default: throw new Error(`unsupported operator ${op}`);
  }
}

/**
 * Turns an (already placeholder-substituted) SQL boolean condition into a JS
 * boolean expression evaluable against a candidate fact_acct row, and
 * evaluates it. Handles exactly the shape these conditions use: parens,
 * AND/OR/NOT, `fa.dateacct <op> 'YYYY-MM-DD'::date`, `fa.factaccttype = 'X'`,
 * and quoted-string equality (e.g. `'true' = 'true'`).
 */
function evaluateCondition(substitutedCondSql, row) {
  let js = substitutedCondSql;
  js = js.replace(/fa\.dateacct\s*(<=|>=|<|>|=)\s*'([\d-]+)'::date/g, (_m, op, lit) =>
    (compareDates(row.dateacct, op, lit) ? 'true' : 'false')
  );
  js = js.replace(/fa\.factaccttype\s*=\s*'([A-Z])'/g, (_m, l) => (row.factaccttype === l ? 'true' : 'false'));
  // Remaining quoted-string equality, e.g. 'true' = 'true' (the substituted toggle literal).
  js = js.replace(/'([^']*)'\s*=\s*'([^']*)'/g, (_m, a, b) => (a === b ? 'true' : 'false'));
  js = js.replace(/NOT\s*\(/g, '!(');
  js = js.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${js});`)();
}

function evaluateFor(row, openingEntryAmount) {
  const params = { dateFrom: '2026-01-01', dateTo: '2026-01-31', openingEntryAmount: String(openingEntryAmount) };
  return {
    openingBalance: evaluateCondition(substitutePlaceholders(openingBalanceCond, params), row),
    activityDebit: evaluateCondition(substitutePlaceholders(activityDebitCond, params), row),
    activityCredit: evaluateCondition(substitutePlaceholders(activityCreditCond, params), row),
    closingBalance: evaluateCondition(substitutePlaceholders(closingBalanceCond, params), row),
  };
}

describe('report-trial-balance — openingEntryAmount toggle row-level semantics (ETP-4898)', () => {
  it('a row strictly before dateFrom always lands in opening_balance, regardless of the toggle', () => {
    const row = { dateacct: '2025-12-15', factaccttype: 'N' };
    for (const toggle of [true, false]) {
      const r = evaluateFor(row, toggle);
      assert.equal(r.openingBalance, true, `toggle=${toggle}: expected opening_balance true`);
      assert.equal(r.activityDebit, false, `toggle=${toggle}: expected activity_debit false`);
      assert.equal(r.activityCredit, false, `toggle=${toggle}: expected activity_credit false`);
    }
  });

  it('an opening entry (factaccttype=O) exactly on dateFrom: openingEntryAmount=true keeps it in opening_balance and excludes it from activity', () => {
    const row = { dateacct: '2026-01-01', factaccttype: 'O' };
    const r = evaluateFor(row, true);
    assert.equal(r.openingBalance, true);
    assert.equal(r.activityDebit, false);
    assert.equal(r.activityCredit, false);
  });

  it('an opening entry (factaccttype=O) exactly on dateFrom: openingEntryAmount=false excludes it from opening_balance and counts it in activity', () => {
    const row = { dateacct: '2026-01-01', factaccttype: 'O' };
    const r = evaluateFor(row, false);
    assert.equal(r.openingBalance, false);
    assert.equal(r.activityDebit, true);
    assert.equal(r.activityCredit, true);
  });

  it('a non-opening entry (factaccttype=N) exactly on dateFrom is never counted in opening_balance and is always counted in activity, regardless of the toggle', () => {
    const row = { dateacct: '2026-01-01', factaccttype: 'N' };
    for (const toggle of [true, false]) {
      const r = evaluateFor(row, toggle);
      assert.equal(r.openingBalance, false, `toggle=${toggle}: expected opening_balance false`);
      assert.equal(r.activityDebit, true, `toggle=${toggle}: expected activity_debit true`);
      assert.equal(r.activityCredit, true, `toggle=${toggle}: expected activity_credit true`);
    }
  });

  it('a row strictly inside the period (after dateFrom) is counted in activity and never in opening_balance, regardless of the toggle', () => {
    const row = { dateacct: '2026-01-15', factaccttype: 'N' };
    for (const toggle of [true, false]) {
      const r = evaluateFor(row, toggle);
      assert.equal(r.openingBalance, false, `toggle=${toggle}: expected opening_balance false`);
      assert.equal(r.activityDebit, true, `toggle=${toggle}: expected activity_debit true`);
      assert.equal(r.activityCredit, true, `toggle=${toggle}: expected activity_credit true`);
    }
  });

  it('closing_balance is identical regardless of the toggle for every row shape (before, on, and inside the period)', () => {
    const rows = [
      { dateacct: '2025-12-15', factaccttype: 'N' },
      { dateacct: '2026-01-01', factaccttype: 'O' },
      { dateacct: '2026-01-01', factaccttype: 'N' },
      { dateacct: '2026-01-15', factaccttype: 'N' },
    ];
    for (const row of rows) {
      const rTrue = evaluateFor(row, true);
      const rFalse = evaluateFor(row, false);
      assert.equal(rTrue.closingBalance, rFalse.closingBalance, `closing_balance mismatch for row ${JSON.stringify(row)}`);
      // Every row here has dateacct <= dateTo, so closing_balance must be true.
      assert.equal(rTrue.closingBalance, true);
    }
  });

  it('a row strictly after dateTo is excluded from closing_balance, regardless of the toggle', () => {
    const row = { dateacct: '2026-02-15', factaccttype: 'N' };
    for (const toggle of [true, false]) {
      const r = evaluateFor(row, toggle);
      assert.equal(r.closingBalance, false, `toggle=${toggle}: expected closing_balance false`);
    }
  });
});
