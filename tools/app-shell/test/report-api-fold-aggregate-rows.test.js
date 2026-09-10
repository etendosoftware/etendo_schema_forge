import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { foldAggregateRows } from '../vite-plugins/report-api.js';

// ETP-4898 regression — report-trial-balance ("Sumas y Saldos").
//
// Classic's real "has activity" criterion (ReportTrialBalance_data.xsql:116):
//   and (a.initialamt <>0 or a.amtacctcr <>0 or a.amtacctdr<>0)
// i.e. an account belongs in the report if it has a nonzero OPENING balance,
// even with zero period movement (e.g. a cash/bank account untouched this
// period but carrying a balance forward). The old GO filter only checked
// period activity (activity_debit/activity_credit), silently dropping those
// accounts — which also broke the opening/closing column totals (a Trial
// Balance must always net to zero across all included accounts).

function fineGrainRow(overrides) {
  return {
    account_no: '00000000', account_id: 'acct-x', account_name: 'Account X',
    opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0,
    ...overrides,
  };
}

describe('foldAggregateRows (report-trial-balance)', () => {
  it('keeps an account with activity in the period', () => {
    const rows = [
      fineGrainRow({ account_no: '43000000', account_name: 'Clientes', activity_debit: 1000, activity_credit: 0, closing_balance: 1000 }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.equal(folded.length, 1);
    assert.equal(folded[0].account_no, '43000000');
  });

  it('keeps an account with a nonzero opening balance but zero period activity (real case: 57000000 Caja euros)', () => {
    const rows = [
      fineGrainRow({
        account_no: '57000000', account_name: 'Caja euros',
        opening_balance: -226661.91, activity_debit: 0, activity_credit: 0, closing_balance: -226661.91,
      }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.equal(folded.length, 1, 'account with opening balance but no activity must NOT be dropped');
    assert.equal(folded[0].account_no, '57000000');
    assert.equal(folded[0].opening_balance, -226661.91);
  });

  it('keeps a second real case: 61000000 Variación de existencias', () => {
    const rows = [
      fineGrainRow({
        account_no: '61000000', account_name: 'Variación de existencias',
        opening_balance: -28274.22, activity_debit: 0, activity_credit: 0, closing_balance: -28274.22,
      }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.equal(folded.length, 1);
    assert.equal(folded[0].opening_balance, -28274.22);
  });

  it('still discards a fully inactive account (opening=0, activity=0) — the HAVING criterion still exists, only changed', () => {
    const rows = [
      fineGrainRow({ account_no: '99999999', account_name: 'Never used', opening_balance: 0, activity_debit: 0, activity_credit: 0, closing_balance: 0 }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.equal(folded.length, 0);
  });

  it('mixed dataset: drops only the inactive account, keeps activity-only and opening-only accounts', () => {
    const rows = [
      fineGrainRow({ account_no: '43000000', activity_debit: 500, closing_balance: 500 }),
      fineGrainRow({ account_no: '57000000', opening_balance: -100, closing_balance: -100 }),
      fineGrainRow({ account_no: '99999999' }), // fully zero — must be dropped
    ];
    const folded = foldAggregateRows(rows, null);
    const accountNos = folded.map(a => a.account_no).sort();
    assert.deepEqual(accountNos, ['43000000', '57000000']);
  });

  it('double-entry dataset: opening_balance across all included accounts sums to 0', () => {
    // Simple double-entry set: two balanced accounts with opening balances that
    // net to zero, plus one purely-activity account (opening 0) that must also
    // be included but does not disturb the opening-column total.
    const rows = [
      fineGrainRow({ account_no: '43000000', account_name: 'Clientes', opening_balance: 226661.91, activity_debit: 1000, closing_balance: 227661.91 }),
      fineGrainRow({ account_no: '57000000', account_name: 'Caja euros', opening_balance: -226661.91, closing_balance: -226661.91 }),
      fineGrainRow({ account_no: '61000000', account_name: 'Variación de existencias', activity_credit: 1000, closing_balance: -1000 }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.equal(folded.length, 3, 'all three accounts must be present (double-entry, no drops)');
    const openingSum = folded.reduce((sum, a) => sum + a.opening_balance, 0);
    assert.ok(Math.abs(openingSum) < 1e-9, `opening_balance column must sum to 0, got ${openingSum}`);
  });

  it('folds multiple fine-grain rows (account × contact × product × project) into one row per account', () => {
    const rows = [
      fineGrainRow({ account_no: '43000000', opening_balance: -100, activity_debit: 0 }),
      fineGrainRow({ account_no: '43000000', opening_balance: 0, activity_debit: 100 }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.equal(folded.length, 1);
    assert.equal(folded[0].opening_balance, -100);
    assert.equal(folded[0].activity_debit, 100);
  });

  it('respects a dimensionField, keeping per-dimension rows that individually pass the filter', () => {
    const rows = [
      fineGrainRow({ account_no: '57000000', bpartner_name: 'ACME', opening_balance: -50 }),
      fineGrainRow({ account_no: '57000000', bpartner_name: 'Other Corp', opening_balance: 0, activity_debit: 0, activity_credit: 0 }),
    ];
    const folded = foldAggregateRows(rows, 'bpartner_name');
    assert.equal(folded.length, 1, 'the zero-everything dimension slice must still be dropped');
    assert.equal(folded[0].dimensionValue, 'ACME');
  });

  it('sorts results by account_no when no dimensionField is given', () => {
    const rows = [
      fineGrainRow({ account_no: '61000000', opening_balance: -1 }),
      fineGrainRow({ account_no: '43000000', opening_balance: -1 }),
      fineGrainRow({ account_no: '57000000', opening_balance: -1 }),
    ];
    const folded = foldAggregateRows(rows, null);
    assert.deepEqual(folded.map(a => a.account_no), ['43000000', '57000000', '61000000']);
  });

  // ETP-5013 — the grouped view is now ONE BLOCK PER ACCOUNT (dimension
  // breakdown nested inside), so the fold must order account-first. The
  // previous order was dimension-first, which is what produced the
  // dimension-outer cards whose "total" row always netted to ~0.
  it('sorts by account_no FIRST and dimensionValue SECOND when a dimensionField is given', () => {
    const rows = [
      fineGrainRow({ account_no: '57000000', bpartner_name: 'Alpha', opening_balance: -1 }),
      fineGrainRow({ account_no: '43000000', bpartner_name: 'Zeta', opening_balance: -1 }),
      fineGrainRow({ account_no: '57000000', bpartner_name: 'Zeta', opening_balance: -1 }),
      fineGrainRow({ account_no: '43000000', bpartner_name: 'Alpha', opening_balance: -1 }),
    ];
    const folded = foldAggregateRows(rows, 'bpartner_name');
    assert.deepEqual(folded.map(a => [a.account_no, a.dimensionValue]), [
      ['43000000', 'Alpha'],
      ['43000000', 'Zeta'],
      ['57000000', 'Alpha'],
      ['57000000', 'Zeta'],
    ]);
  });

  it('leaves every account as ONE contiguous run, which the account blocks depend on', () => {
    const rows = [
      fineGrainRow({ account_no: '57000000', bpartner_name: 'B', opening_balance: -1 }),
      fineGrainRow({ account_no: '43000000', bpartner_name: 'B', opening_balance: -1 }),
      fineGrainRow({ account_no: '57000000', bpartner_name: 'A', opening_balance: -1 }),
      fineGrainRow({ account_no: '43000000', bpartner_name: 'A', opening_balance: -1 }),
    ];
    const runs = [];
    for (const r of foldAggregateRows(rows, 'bpartner_name')) {
      if (runs[runs.length - 1] !== r.account_no) runs.push(r.account_no);
    }
    assert.deepEqual(runs, ['43000000', '57000000']);
  });

  it('keeps the blank dimension value ("") as its own row, first within its account', () => {
    const rows = [
      fineGrainRow({ account_no: '35000000', bpartner_name: 'Juan Perez', opening_balance: -141413.14, activity_credit: 640.52, closing_balance: -142053.66 }),
      fineGrainRow({ account_no: '35000000', bpartner_name: '', opening_balance: 159193.58, closing_balance: 159193.58 }),
    ];
    const folded = foldAggregateRows(rows, 'bpartner_name');
    assert.equal(folded.length, 2, 'the no-dimension bucket must not be merged into another row');
    assert.deepEqual(folded.map(a => a.dimensionValue), ['', 'Juan Perez']);
  });
});
