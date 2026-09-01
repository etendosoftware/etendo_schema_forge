import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { groupIntoRows, rowHeight } from '../dashboardRowLayout.js';

/**
 * ETP-5088 — the contract, in the words it was asked for: a user with every permission must see
 * the dashboard EXACTLY as designed, and a role with fewer widgets gets a layout that adjusts.
 */

// The design's own flex-basis weights and heights, in display order.
const ALL = [
  { key: 'pendingTasks', weight: 672, height: 234 },
  { key: 'quickActions', weight: 213, height: 234 },
  { key: 'topClients', weight: 435, height: 234 },
  { key: 'kpis', weight: 672, height: 234 },
  { key: 'recentInvoices', weight: 443, height: 234 },
  { key: 'pendingAmounts', weight: 213.33, height: 234 },
  { key: 'trends', weight: 901, height: 328 },
  { key: 'bestProducts', weight: 443.33, height: 328 },
];

const keysOf = (rows) => rows.map((row) => row.map((item) => item.key));
const visible = (...hidden) => ALL.filter((item) => !hidden.includes(item.key));

describe('a role that sees everything gets the original design, untouched', () => {
  test('the three design rows are reproduced exactly', () => {
    assert.deepEqual(keysOf(groupIntoRows(ALL)), [
      ['pendingTasks', 'quickActions', 'topClients'],
      ['kpis', 'recentInvoices', 'pendingAmounts'],
      ['trends', 'bestProducts'],
    ]);
  });

  test('the second and third rows survive despite summing above the reference capacity', () => {
    // 1328.33 and 1344.33 against a 1320 reference — the tolerance exists for exactly this.
    const rows = groupIntoRows(ALL);
    assert.equal(rows[1].reduce((n, i) => n + i.weight, 0) > 1320, true);
    assert.equal(rows[1].length, 3);
    assert.equal(rows[2].length, 2);
  });
});

describe('a role with fewer widgets gets fuller rows, not stretched ones', () => {
  test('Sales (no financial widgets) collapses from three rows to two', () => {
    // Exactly the reported case: "Cobros y pagos" spanned the full width and "Productos más
    // vendidos" became a band of its own. They now share a row.
    const rows = groupIntoRows(visible('kpis', 'trends'));
    assert.deepEqual(keysOf(rows), [
      ['pendingTasks', 'quickActions', 'topClients'],
      ['recentInvoices', 'pendingAmounts', 'bestProducts'],
    ]);
  });

  test('Purchasing keeps its four widgets in two rows', () => {
    const rows = groupIntoRows(visible('kpis', 'trends', 'topClients', 'recentInvoices'));
    assert.deepEqual(keysOf(rows), [
      ['pendingTasks', 'quickActions', 'pendingAmounts'],
      ['bestProducts'],
    ]);
  });

  test('a single widget occupies one row', () => {
    assert.deepEqual(keysOf(groupIntoRows([ALL[7]])), [['bestProducts']]);
  });

  test('no widgets means no rows', () => {
    assert.deepEqual(groupIntoRows([]), []);
    assert.deepEqual(groupIntoRows(null), []);
  });
});

describe('packing rules', () => {
  test('display order is never rearranged to fill a row better', () => {
    // quickActions (213) would fit beside trends (901); it must not be pulled forward.
    const rows = groupIntoRows([ALL[6], ALL[3], ALL[1]]);
    assert.deepEqual(keysOf(rows), [['trends'], ['kpis', 'quickActions']]);
  });

  test('an item heavier than a whole row still gets a row instead of being dropped', () => {
    const rows = groupIntoRows([{ key: 'huge', weight: 5000, height: 100 }, ALL[1]]);
    assert.deepEqual(keysOf(rows), [['huge'], ['quickActions']]);
  });

  test('a weightless item does not break the packing', () => {
    const rows = groupIntoRows([{ key: 'no-weight' }, ALL[0], ALL[1], ALL[2]]);
    assert.deepEqual(keysOf(rows), [['no-weight', 'pendingTasks', 'quickActions', 'topClients']]);
  });
});

describe('rowHeight', () => {
  test('a row is as tall as its tallest widget, so a chart is never clipped', () => {
    assert.equal(rowHeight([ALL[4], ALL[5], ALL[7]]), 328);
    assert.equal(rowHeight([ALL[0], ALL[1]]), 234);
  });

  test('an empty or malformed row resolves to 0', () => {
    assert.equal(rowHeight([]), 0);
    assert.equal(rowHeight(null), 0);
    assert.equal(rowHeight([{ key: 'x' }]), 0);
  });
});
