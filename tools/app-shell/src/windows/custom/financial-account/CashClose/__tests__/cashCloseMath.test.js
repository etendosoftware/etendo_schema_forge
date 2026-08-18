import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CASH_CLOSE_TOLERANCE,
  countAfterStatementDate,
  isAfterStatementDate,
  parseDeclaredAmount,
  selectionState,
  summarize,
  toggleAllVisible,
  toggleOne,
  visibleMovements,
} from '../cashCloseMath.js';

/** The prototype's own fixture, so the numbers below match the design handoff exactly. */
const MOVEMENTS = [
  { id: '1', transactionDate: '2026-08-05T00:00:00Z', partnerName: 'Alimentos y Supermercados, S.A', documentNo: '1000376', description: 'Factura nº 1000371', amount: 18.51 },
  { id: '2', transactionDate: '2026-08-05T00:00:00Z', partnerName: 'Cafetería Duna', documentNo: '1000377', description: 'Cobro en efectivo', amount: 42.0 },
  { id: '3', transactionDate: '2026-08-05T00:00:00Z', partnerName: 'Ferretería Sur', documentNo: '1000378', description: 'Pago a proveedor', amount: -65.3 },
  { id: '4', transactionDate: '2026-08-04T00:00:00Z', partnerName: 'Juan Pérez', documentNo: '1000379', description: 'Anticipo de cliente', amount: 120.0 },
  { id: '5', transactionDate: '2026-08-04T00:00:00Z', partnerName: 'Papelería Lux', documentNo: '1000380', description: 'Compra de material', amount: -23.9 },
  { id: '6', transactionDate: '2026-08-04T00:00:00Z', partnerName: 'Transportes Vega', documentNo: '1000381', description: 'Portes agosto', amount: -88.15 },
  { id: '7', transactionDate: '2026-08-03T00:00:00Z', partnerName: 'Ventas al contado', documentNo: '1000382', description: 'Cierre TPV turno mañana', amount: 210.45 },
  { id: '8', transactionDate: '2026-08-03T00:00:00Z', partnerName: 'Caja chica', documentNo: '1000383', description: 'Reposición de caja chica', amount: -50.0 },
  { id: '9', transactionDate: '2026-08-06T00:00:00Z', partnerName: 'Muebles Aris', documentNo: '1000384', description: 'Cobro posterior a la fecha', amount: 75.0 },
];
const OPENING = 19.0;
const STATEMENT_DATE = '2026-08-05';
const MARKED = new Set(['1', '2', '3', '4', '7']);

describe('parseDeclaredAmount', () => {
  it('parses es-ES notation with thousands dots and a decimal comma', () => {
    assert.equal(parseDeclaredAmount('1.234,56'), 1234.56);
    assert.equal(parseDeclaredAmount('182,61'), 182.61);
  });

  it('treats a lone dot with 1-2 trailing digits as a decimal point, not thousands', () => {
    // A numeric keypad produces "12.50"; reading it as 1250 would silently inflate the close.
    assert.equal(parseDeclaredAmount('12.50'), 12.5);
    assert.equal(parseDeclaredAmount('12.5'), 12.5);
  });

  it('treats a lone dot with 3 trailing digits as thousands grouping', () => {
    assert.equal(parseDeclaredAmount('1.234'), 1234);
  });

  it('handles negatives, numbers, blanks and garbage', () => {
    assert.equal(parseDeclaredAmount('-65,30'), -65.3);
    assert.equal(parseDeclaredAmount(182.61), 182.61);
    assert.equal(parseDeclaredAmount(''), 0);
    assert.equal(parseDeclaredAmount('   '), 0);
    assert.equal(parseDeclaredAmount(null), 0);
    assert.equal(parseDeclaredAmount(undefined), 0);
    assert.equal(parseDeclaredAmount('abc'), 0);
    assert.equal(parseDeclaredAmount(Number.NaN), 0);
  });
});

describe('summarize', () => {
  it('reproduces the design handoff numbers', () => {
    const s = summarize(MOVEMENTS, { marked: MARKED, openingBalance: OPENING, declared: 182.61 });

    assert.equal(s.markedIn, 390.96);
    assert.equal(s.markedOut, -65.3);
    assert.equal(s.calculated, 344.66);
    assert.equal(s.declared, 182.61);
    assert.equal(s.difference, -162.05);
    assert.equal(s.balanced, false);
    assert.equal(s.clearedCount, 5);
    assert.equal(s.pendingCount, 4);
  });

  it('reports a POSITIVE difference when the drawer holds more than the books (surplus)', () => {
    const s = summarize(MOVEMENTS, { marked: MARKED, openingBalance: OPENING, declared: 400 });
    assert.equal(s.difference, 55.34);
    assert.ok(s.difference > 0, 'a surplus must be positive so the backend posts a deposit');
  });

  it('reports a NEGATIVE difference when the drawer holds less than the books (shortage)', () => {
    const s = summarize(MOVEMENTS, { marked: MARKED, openingBalance: OPENING, declared: 300 });
    assert.ok(s.difference < 0, 'a shortage must be negative so the backend posts a withdrawal');
  });

  it('is balanced when declared equals calculated', () => {
    const s = summarize(MOVEMENTS, { marked: MARKED, openingBalance: OPENING, declared: 344.66 });
    assert.equal(s.difference, 0);
    assert.equal(s.balanced, true);
  });

  it('treats a sub-half-cent difference as balanced and a half-cent one as unbalanced', () => {
    const under = summarize(MOVEMENTS, { marked: MARKED, openingBalance: OPENING, declared: 344.664 });
    assert.equal(under.balanced, true, `|diff| < ${CASH_CLOSE_TOLERANCE} must be balanced`);

    const at = summarize(MOVEMENTS, { marked: MARKED, openingBalance: OPENING, declared: 344.67 });
    assert.equal(at.balanced, false);
  });

  it('ignores the filters — the totals always cover every marked movement', () => {
    // Movement 9 is dated after the close and is hidden by default; marking it must still count.
    const marked = new Set([...MARKED, '9']);
    const s = summarize(MOVEMENTS, { marked, openingBalance: OPENING, declared: 0 });
    assert.equal(s.markedIn, 465.96);
    assert.equal(s.clearedCount, 6);
  });

  it('with nothing marked, the calculated balance is just the opening balance', () => {
    const s = summarize(MOVEMENTS, { marked: new Set(), openingBalance: OPENING, declared: OPENING });
    assert.equal(s.markedIn, 0);
    assert.equal(s.markedOut, 0);
    assert.equal(s.calculated, OPENING);
    assert.equal(s.balanced, true);
    assert.equal(s.pendingCount, MOVEMENTS.length);
  });

  it('does not accumulate float noise across many decimal movements', () => {
    const noisy = [
      { id: 'a', amount: 0.1, transactionDate: '2026-08-01T00:00:00Z' },
      { id: 'b', amount: 0.2, transactionDate: '2026-08-01T00:00:00Z' },
    ];
    const s = summarize(noisy, {
      marked: new Set(['a', 'b']), openingBalance: 0, declared: 0.3,
    });
    assert.equal(s.calculated, 0.3);
    assert.equal(s.difference, 0);
    assert.equal(s.balanced, true);
  });

  it('handles an empty movement list', () => {
    const s = summarize([], { marked: new Set(), openingBalance: 0, declared: 0 });
    assert.equal(s.calculated, 0);
    assert.equal(s.balanced, true);
    assert.equal(s.pendingCount, 0);
  });
});

describe('isAfterStatementDate / countAfterStatementDate', () => {
  it('flags only movements dated strictly after the close date', () => {
    assert.equal(isAfterStatementDate(MOVEMENTS[8], STATEMENT_DATE), true); // 08-06
    assert.equal(isAfterStatementDate(MOVEMENTS[0], STATEMENT_DATE), false); // 08-05, same day
    assert.equal(isAfterStatementDate(MOVEMENTS[6], STATEMENT_DATE), false); // 08-03
  });

  it('counts them for the amber banner, and recounts when the close date moves', () => {
    assert.equal(countAfterStatementDate(MOVEMENTS, STATEMENT_DATE), 1);
    // Backdating to 08-03 leaves everything dated 08-04, 08-05 and 08-06 "after": 3 + 3 + 1.
    assert.equal(countAfterStatementDate(MOVEMENTS, '2026-08-03'), 7);
    assert.equal(countAfterStatementDate(MOVEMENTS, '2026-08-31'), 0);
  });

  it('never flags anything when either date is missing', () => {
    assert.equal(isAfterStatementDate({ transactionDate: null }, STATEMENT_DATE), false);
    assert.equal(isAfterStatementDate(MOVEMENTS[8], ''), false);
  });
});

describe('visibleMovements', () => {
  const base = { marked: MARKED, statementDate: STATEMENT_DATE, hideCleared: false, hideAfter: true, search: '' };

  it('hides post-dated movements by default (hideAfter on)', () => {
    const visible = visibleMovements(MOVEMENTS, base);
    assert.equal(visible.length, 8);
    assert.ok(!visible.some((m) => m.id === '9'));
  });

  it('shows post-dated movements once hideAfter is turned off', () => {
    const visible = visibleMovements(MOVEMENTS, { ...base, hideAfter: false });
    assert.equal(visible.length, 9);
  });

  it('hides the already-marked rows when hideCleared is on', () => {
    const visible = visibleMovements(MOVEMENTS, { ...base, hideCleared: true });
    assert.deepEqual(visible.map((m) => m.id), ['5', '6', '8']);
  });

  it('searches contact, description and payment reference case-insensitively', () => {
    assert.deepEqual(
      visibleMovements(MOVEMENTS, { ...base, search: 'ferreter' }).map((m) => m.id), ['3']);
    assert.deepEqual(
      visibleMovements(MOVEMENTS, { ...base, search: 'TPV' }).map((m) => m.id), ['7']);
    assert.deepEqual(
      visibleMovements(MOVEMENTS, { ...base, search: '1000380' }).map((m) => m.id), ['5']);
  });

  it('combines every filter at once', () => {
    const visible = visibleMovements(MOVEMENTS, {
      ...base, hideCleared: true, search: 'a',
    });
    assert.ok(visible.every((m) => !MARKED.has(m.id)));
    assert.ok(visible.every((m) => m.id !== '9'));
  });

  it('returns everything for a blank/whitespace search', () => {
    assert.equal(visibleMovements(MOVEMENTS, { ...base, search: '   ' }).length, 8);
  });
});

describe('selection helpers', () => {
  it('reports the tri-state over the VISIBLE rows only', () => {
    const visible = MOVEMENTS.slice(0, 3);
    assert.deepEqual(selectionState(visible, new Set(['1', '2', '3'])), { allSelected: true, someSelected: false });
    assert.deepEqual(selectionState(visible, new Set(['1'])), { allSelected: false, someSelected: true });
    assert.deepEqual(selectionState(visible, new Set()), { allSelected: false, someSelected: false });
    assert.deepEqual(selectionState([], new Set(['1'])), { allSelected: false, someSelected: false });
  });

  it('select-all ticks every visible row and leaves filtered-out rows untouched', () => {
    const visible = [MOVEMENTS[4], MOVEMENTS[5]]; // ids 5, 6 — not currently marked
    const next = toggleAllVisible(visible, MARKED);
    assert.ok(next.has('5') && next.has('6'));
    // '1' is marked but hidden by a filter here — it must survive.
    assert.ok(next.has('1'), 'a row hidden by the filters must not be silently unticked');
  });

  it('select-all unticks the visible rows when they are all already ticked', () => {
    const visible = [MOVEMENTS[0], MOVEMENTS[1]]; // ids 1, 2 — both in MARKED
    const next = toggleAllVisible(visible, MARKED);
    assert.ok(!next.has('1') && !next.has('2'));
    assert.ok(next.has('4'), 'rows outside the visible set keep their state');
  });

  it('toggleOne flips a single id without mutating the input set', () => {
    const before = new Set(['1']);
    assert.deepEqual([...toggleOne(before, '2')].sort(), ['1', '2']);
    assert.deepEqual([...toggleOne(before, '1')], []);
    assert.deepEqual([...before], ['1'], 'the original set must not be mutated');
  });
});
