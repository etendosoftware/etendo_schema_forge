import test from 'node:test';
import assert from 'node:assert/strict';

import { OPERATORS, matchesCondition, applyConditions } from '../advancedFilterApply.js';

const ROWS = [
  { name: 'Alpha', status: 'DRAFT', amount: 100, date: '2026-06-01T00:00:00Z', notes: 'x' },
  { name: 'Beta', status: 'PENDING', amount: 250, date: '2026-06-10T00:00:00Z', notes: '' },
  { name: 'Gamma', status: 'RECONCILED', amount: -50, date: '2026-07-01T00:00:00Z', notes: 'y' },
];

const f = (conditions, rowOperator = 'and') => ({ rowOperator, conditions });

test('OPERATORS string predicates are case-insensitive', () => {
  assert.equal(OPERATORS.iContains('Hello World', 'world'), true);
  assert.equal(OPERATORS.iNotContains('Hello', 'bye'), true);
  assert.equal(OPERATORS.iEquals('ABC', 'abc'), true);
  assert.equal(OPERATORS.iNotEqual('ABC', 'xyz'), true);
});

test('OPERATORS null checks', () => {
  assert.equal(OPERATORS.isNull(''), true);
  assert.equal(OPERATORS.isNull(null), true);
  assert.equal(OPERATORS.isNotNull('v'), true);
  assert.equal(OPERATORS.isNotNull(''), false);
});

test('OPERATORS equals/inSet accept arrays and comma strings', () => {
  assert.equal(OPERATORS.equals('a', ['a', 'b']), true);
  assert.equal(OPERATORS.notEqual('c', ['a', 'b']), true);
  assert.equal(OPERATORS.inSet('b', 'a, b, c'), true);
  assert.equal(OPERATORS.inSet('z', ['a', 'b']), false);
});

test('OPERATORS numeric comparisons guard non-numbers', () => {
  assert.equal(OPERATORS.greaterThan(5, 3), true);
  assert.equal(OPERATORS.lessOrEqual(3, 3), true);
  assert.equal(OPERATORS.greaterThan('x', 3), false); // NaN → no match
});

test('OPERATORS between handles numbers and dates', () => {
  assert.equal(OPERATORS.between(5, [1, 10], 'amount'), true);
  assert.equal(OPERATORS.between('2026-06-05', ['2026-06-01', '2026-06-30'], 'date'), true);
  assert.equal(OPERATORS.between('2026-08-05', ['2026-06-01', '2026-06-30'], 'date'), false);
});

test('matchesCondition returns true for unknown operators (no filtering)', () => {
  assert.equal(matchesCondition({ a: 1 }, { field: 'a', operator: 'nope', value: 9 }), true);
});

test('applyConditions returns input for null/empty filter', () => {
  assert.equal(applyConditions(ROWS, null), ROWS);
  assert.equal(applyConditions(ROWS, f([])), ROWS);
});

test('applyConditions AND requires every condition', () => {
  const out = applyConditions(ROWS, f([
    { field: 'status', operator: 'equals', value: 'PENDING' },
    { field: 'amount', operator: 'greaterThan', value: 100 },
  ]));
  assert.deepEqual(out.map((r) => r.name), ['Beta']);
});

test('applyConditions OR matches any condition', () => {
  const out = applyConditions(ROWS, f([
    { field: 'status', operator: 'equals', value: 'DRAFT' },
    { field: 'status', operator: 'equals', value: 'RECONCILED' },
  ], 'or'));
  assert.deepEqual(out.map((r) => r.name), ['Alpha', 'Gamma']);
});

test('applyConditions applies the optional deriveRow projection', () => {
  const out = applyConditions(
    ROWS,
    f([{ field: 'derived', operator: 'equals', value: 'YES' }]),
    (r) => ({ ...r, derived: r.amount > 0 ? 'YES' : 'NO' }),
  );
  assert.deepEqual(out.map((r) => r.name), ['Alpha', 'Beta']);
});
