import { renderHook, act } from '@testing-library/react';

import { usePaymentBalance } from '../usePaymentBalance.js';

// Stateful balancing logic of the "Nuevo cobro/pago" modal, exercised in
// isolation from the DOM. The pure helpers (formatPlain/parsePlain/round2)
// live in usePaymentBalance.test.js.

const CREDIT = { id: 'c1', kind: 'credit', doc: 'AB-1', date: '2024-01-01', note: '', avail: 200, paymentId: 'p1' };
const ABONO = { id: 'a1', kind: 'abono', doc: 'AB-2', date: '2024-01-02', note: '', avail: 500, psdId: 's1' };

function setup(params) {
  return renderHook((p) => usePaymentBalance(p), { initialProps: params });
}

describe('usePaymentBalance', () => {
  describe('initial / exact balance', () => {
    it('prefills the amount to the rounded total', () => {
      const { result } = setup({ total: 6420, dir: 'in', sources: [] });
      expect(result.current.amount).toBe(6420);
      expect(result.current.amountStr).toBe('6.420,00');
      expect(result.current.applied).toBe(6420);
    });

    it('reports an exact match with no excess or partial', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      expect(result.current.funds).toBe(1000);
      expect(result.current.diff).toBe(0);
      expect(result.current.isExact).toBe(true);
      expect(result.current.isExcess).toBe(false);
      expect(result.current.isPartial).toBe(false);
      expect(result.current.canConfirm).toBe(true);
    });

    it('rounds a fractional total', () => {
      const { result } = setup({ total: 99.999, dir: 'in', sources: [] });
      expect(result.current.applied).toBe(100);
    });
  });

  describe('partial payment', () => {
    it('flags isPartial and exposes the missing amount when amount < applied', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange('600'));
      expect(result.current.amount).toBe(600);
      expect(result.current.diff).toBe(-400);
      expect(result.current.isPartial).toBe(true);
      expect(result.current.missingAmount).toBe(400);
      expect(result.current.canConfirm).toBe(true); // partial is allowed
    });
  });

  describe('excess — receipts (dir "in")', () => {
    it('blocks confirmation until an excessMode is chosen', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange('1200'));
      expect(result.current.isExcess).toBe(true);
      expect(result.current.excessAmount).toBe(200);
      expect(result.current.excessUnresolved).toBe(true);
      expect(result.current.canConfirm).toBe(false);
    });

    it('allows confirmation once excessMode is set (credit or refund)', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange('1200'));
      act(() => result.current.setExcessMode('credit'));
      expect(result.current.excessUnresolved).toBe(false);
      expect(result.current.canConfirm).toBe(true);

      act(() => result.current.setExcessMode('refund'));
      expect(result.current.canConfirm).toBe(true);
    });
  });

  describe('excess — payments (dir "out")', () => {
    it('blocks confirmation on any excess regardless of mode', () => {
      const { result } = setup({ total: 1000, dir: 'out', sources: [] });
      act(() => result.current.onAmountChange('1200'));
      expect(result.current.isExcess).toBe(true);
      expect(result.current.excessUnresolved).toBe(true);
      expect(result.current.canConfirm).toBe(false);

      // Setting a mode does NOT unblock a payment overpayment.
      act(() => result.current.setExcessMode('credit'));
      expect(result.current.canConfirm).toBe(false);
    });
  });

  describe('onAmountChange / onAmountBlur (es-ES)', () => {
    it('parses the typed string into a number', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange('1.234,50'));
      expect(result.current.amount).toBe(1234.5);
      expect(result.current.amountStr).toBe('1.234,50');
    });

    it('treats a blank string as 0', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange(''));
      expect(result.current.amount).toBe(0);
    });

    it('reformats to grouped es-ES on blur', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange('1234.5')); // dots stripped → 12345
      act(() => result.current.onAmountBlur());
      expect(result.current.amountStr).toBe('12.345,00');
    });

    it('blur on an empty value normalizes to 0,00', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange(''));
      act(() => result.current.onAmountBlur());
      expect(result.current.amountStr).toBe('0,00');
    });
  });

  describe('toggleLine auto-consume', () => {
    // Selecting a line consumes min(avail, applied - usedByOtherSelected) — it
    // caps at the FULL invoice need (not the remaining cash), then drops cash so
    // credit + cash == applied (diff stays 0, no artificial excess).
    it('caps use at need and drops cash so the balance stays exact', () => {
      // applied 1000, abono avail 500 < need 1000 → use full 500, cash → 500.
      const { result } = setup({ total: 1000, dir: 'in', sources: [ABONO] });
      act(() => result.current.onAmountChange('700'));
      act(() => result.current.toggleLine('a1'));
      const line = result.current.lines.find(l => l.id === 'a1');
      expect(line.sel).toBe(true);
      expect(line.use).toBe(500);          // min(avail 500, need 1000)
      expect(result.current.amount).toBe(500); // cash = applied - use
      expect(result.current.usedCredit).toBe(500);
      expect(result.current.funds).toBe(1000);
      expect(result.current.diff).toBe(0);
      expect(result.current.isExact).toBe(true);
    });

    it('uses only `applied` and zeroes cash when the line exceeds the invoice total', () => {
      // abono avail 1500 > need 1000 → use capped at 1000, cash → 0.
      const big = { ...ABONO, avail: 1500 };
      const { result } = setup({ total: 1000, dir: 'in', sources: [big] });
      act(() => result.current.toggleLine('a1'));
      const line = result.current.lines.find(l => l.id === 'a1');
      expect(line.use).toBe(1000);         // min(avail 1500, need 1000)
      expect(result.current.amount).toBe(0); // cash → 0, no excess
      expect(result.current.usedCredit).toBe(1000);
      expect(result.current.diff).toBe(0);
      expect(result.current.isExact).toBe(true);
    });

    it('caps consumption at availability when the line is smaller than the need', () => {
      // credit avail 200 < need 1000 → use 200, cash → 800 (still exact).
      const { result } = setup({ total: 1000, dir: 'in', sources: [CREDIT] });
      act(() => result.current.toggleLine('c1'));
      const line = result.current.lines.find(l => l.id === 'c1');
      expect(line.use).toBe(200);          // capped at avail
      expect(result.current.amount).toBe(800);
      expect(result.current.usedCredit).toBe(200);
      expect(result.current.diff).toBe(0);
      expect(result.current.isExact).toBe(true);
    });

    it('deselecting a line zeroes its usage and returns the freed amount to cash', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [ABONO] });
      act(() => result.current.toggleLine('a1')); // use 500, cash 500
      expect(result.current.usedCredit).toBe(500);
      expect(result.current.amount).toBe(500);
      act(() => result.current.toggleLine('a1')); // deselect
      const line = result.current.lines.find(l => l.id === 'a1');
      expect(line.sel).toBe(false);
      expect(line.use).toBe(0);
      expect(result.current.usedCredit).toBe(0);
      expect(result.current.amount).toBe(1000); // freed credit returns to cash
      expect(result.current.diff).toBe(0);
    });

    it('a second credit line caps at the remaining need after the first', () => {
      // credit 200 used first (cash 800). Then abono 500 → need now 800,
      // use min(500, 800) = 500, cash drops to 300. credit total 700, exact.
      const { result } = setup({ total: 1000, dir: 'in', sources: [CREDIT, ABONO] });
      act(() => result.current.toggleLine('c1')); // use 200, cash 800
      act(() => result.current.toggleLine('a1')); // need 800, use 500, cash 300
      const c = result.current.lines.find(l => l.id === 'c1');
      const a = result.current.lines.find(l => l.id === 'a1');
      expect(c.use).toBe(200);
      expect(a.use).toBe(500);
      expect(result.current.usedCredit).toBe(700);
      expect(result.current.amount).toBe(300);
      expect(result.current.diff).toBe(0);
      expect(result.current.isExact).toBe(true);
    });
  });

  describe('stepLine clamping', () => {
    // stepLine adjusts use within [0, avail] and does NOT touch cash.
    it('clamps to avail and leaves cash untouched', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [CREDIT] });
      act(() => result.current.toggleLine('c1')); // use 200 (== avail), cash 800
      const cashAfterToggle = result.current.amount;
      act(() => result.current.stepLine('c1', 100)); // clamp at avail 200
      expect(result.current.lines.find(l => l.id === 'c1').use).toBe(200);
      expect(result.current.amount).toBe(cashAfterToggle); // cash unchanged
    });

    it('never drops below 0', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [CREDIT] });
      act(() => result.current.toggleLine('c1')); // use 200
      act(() => result.current.stepLine('c1', -100)); // 100
      expect(result.current.lines.find(l => l.id === 'c1').use).toBe(100);
      act(() => result.current.stepLine('c1', -100)); // 0
      act(() => result.current.stepLine('c1', -100)); // clamp at 0
      expect(result.current.lines.find(l => l.id === 'c1').use).toBe(0);
    });
  });

  describe('equalize', () => {
    it('sets amount so cash + credit exactly covers the invoice', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [ABONO] });
      act(() => result.current.onAmountChange('0'));
      act(() => result.current.toggleLine('a1')); // consumes full avail 500
      expect(result.current.usedCredit).toBe(500);
      act(() => result.current.equalize());
      expect(result.current.amount).toBe(500); // applied 1000 - used 500
      expect(result.current.amountStr).toBe('500,00');
      expect(result.current.isExact).toBe(true);
    });

    it('floors the equalized amount at 0 when credit already covers the invoice', () => {
      const big = { ...ABONO, avail: 2000 };
      const { result } = setup({ total: 1000, dir: 'in', sources: [big] });
      act(() => result.current.onAmountChange('0'));
      act(() => result.current.toggleLine('a1')); // full 2000 (nothing missing path)
      act(() => result.current.equalize());
      expect(result.current.amount).toBe(0);
    });

    it('clears excessMode', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [] });
      act(() => result.current.onAmountChange('1200'));
      act(() => result.current.setExcessMode('credit'));
      act(() => result.current.equalize());
      expect(result.current.excessMode).toBe(null);
    });
  });

  describe('consumedSources', () => {
    it('returns only selected lines with use > 0, with payload shape', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [CREDIT, ABONO] });
      act(() => result.current.onAmountChange('0'));
      act(() => result.current.toggleLine('c1')); // consumes 200
      expect(result.current.consumedSources).toEqual([
        { kind: 'credit', paymentId: 'p1', psdId: undefined, use: 200 },
      ]);
    });

    it('is empty when no line is selected', () => {
      const { result } = setup({ total: 1000, dir: 'in', sources: [CREDIT] });
      expect(result.current.consumedSources).toEqual([]);
    });
  });

  describe('async source re-seed', () => {
    it('re-seeds the credit lines when sources arrive after mount', () => {
      // Credit/abono sources are fetched asynchronously: the hook starts with an
      // empty list and a useEffect re-seeds `lines` once `sources` changes.
      const { result, rerender } = setup({ total: 1000, dir: 'in', sources: [] });
      expect(result.current.lines).toHaveLength(0);

      rerender({ total: 1000, dir: 'in', sources: [CREDIT, ABONO] });
      expect(result.current.lines).toHaveLength(2);
      // Re-seeded lines start unselected with zero usage.
      expect(result.current.lines.every(l => l.sel === false && l.use === 0)).toBe(true);
      expect(result.current.lines.map(l => l.id)).toEqual(['c1', 'a1']);
    });

    it('the re-seeded lines are immediately selectable', () => {
      const { result, rerender } = setup({ total: 1000, dir: 'in', sources: [] });
      rerender({ total: 1000, dir: 'in', sources: [CREDIT] });
      act(() => result.current.toggleLine('c1'));
      expect(result.current.lines.find(l => l.id === 'c1').use).toBe(200);
      expect(result.current.usedCredit).toBe(200);
    });
  });

  it('exposes the STEP constant', () => {
    const { result } = setup({ total: 1000, dir: 'in', sources: [] });
    expect(result.current.STEP).toBe(100);
  });
});
