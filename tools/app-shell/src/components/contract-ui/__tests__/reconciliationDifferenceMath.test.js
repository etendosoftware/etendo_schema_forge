/**
 * Unit tests for `reconciliationDifferenceMath.js` — the pure decision logic behind "post the
 * unreconciled remainder of a partially reconciled statement line to an accounting concept".
 *
 * node:test (not vitest) on purpose: the module is deliberately a plain `.js` sibling of the
 * `.jsx` banner/modal precisely so this runner can import it without a JSX transform.
 *
 * Every threshold asserted here is re-validated server-side by
 * `ReconciliationDifferenceSupport` — see `ReconciliationDifferenceSupportTest.java` for the twin
 * assertions. The UI gate is a convenience, never the boundary.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  differenceLimit,
  isNegligible,
  differenceState,
  DIFFERENCE_EPSILON,
} from '../reconciliationDifferenceMath.js';

/** The canonical scenario: a 12.50 statement line with 12.00 matched and 0.50 left over. */
const PARTIAL_LINE = {
  id: 'LP1',
  amount: 12.5,
  reconcileStatus: 'PARTIAL',
  reconciledAmount: 12,
  pendingAmount: 0.5,
  remainderLineId: 'LP1-rem',
};

describe('DIFFERENCE_EPSILON', () => {
  it('is half a cent, matching the backend NEGLIGIBLE constant', () => {
    assert.equal(DIFFERENCE_EPSILON, 0.005);
  });
});

describe('differenceLimit', () => {
  it('is a percentage of the line total, not of the remainder', () => {
    // 5 % of 12.50 = 0.625 — comfortably above the 0.50 remainder.
    assert.equal(differenceLimit(12.5, 5), 0.625);
  });

  it('scales with the line total', () => {
    assert.equal(differenceLimit(12500, 5), 625);
  });

  it('uses the absolute line total, so an outflow gets the same limit as its inflow twin', () => {
    assert.equal(differenceLimit(-12.5, 5), differenceLimit(12.5, 5));
    assert.equal(differenceLimit(-12.5, 5), 0.625);
  });

  it('returns 0 for a zero percentage — the action is disabled until configured', () => {
    assert.equal(differenceLimit(12.5, 0), 0);
  });

  it('returns 0 for a negative or non-numeric percentage', () => {
    assert.equal(differenceLimit(12.5, -5), 0);
    assert.equal(differenceLimit(12.5, 'abc'), 0);
  });

  it('returns 0 for an absent percentage', () => {
    assert.equal(differenceLimit(12.5, null), 0);
    assert.equal(differenceLimit(12.5, undefined), 0);
  });

  it('returns 0 when the line total is missing', () => {
    assert.equal(differenceLimit(null, 5), 0);
    assert.equal(differenceLimit(undefined, 5), 0);
  });
});

describe('isNegligible', () => {
  it('treats anything under half a cent as zero', () => {
    assert.equal(isNegligible(0), true);
    assert.equal(isNegligible(0.004), true);
    assert.equal(isNegligible(-0.004), true);
  });

  it('does NOT treat half a cent or more as zero', () => {
    assert.equal(isNegligible(0.005), false);
    assert.equal(isNegligible(-0.01), false);
    assert.equal(isNegligible(0.5), false);
  });

  it('reads absent / non-numeric values as zero', () => {
    assert.equal(isNegligible(null), true);
    assert.equal(isNegligible(undefined), true);
    assert.equal(isNegligible('abc'), true);
  });
});

describe('differenceState — notPartial', () => {
  it('hides the banner when there is no selected line', () => {
    const info = differenceState({ line: null, amountTolerance: 5 });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'notPartial');
  });

  it('hides the banner for a plain pending line', () => {
    const info = differenceState({
      line: { id: 'L1', amount: 12.5, status: 'pending' },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'notPartial');
  });

  it('hides the banner for a fully reconciled line', () => {
    const info = differenceState({
      line: {
        id: 'LR1', amount: 12.5, reconcileStatus: 'RECONCILED',
        reconciledAmount: 12.5, pendingAmount: 0,
      },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'notPartial');
  });

  it('hides the banner when PARTIAL but nothing is actually reconciled yet', () => {
    // Guards the same collapse the backend guards: with nothing matched, the tolerance
    // denominator would equal the numerator.
    const info = differenceState({
      line: { ...PARTIAL_LINE, reconciledAmount: 0, pendingAmount: 12.5 },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'notPartial');
  });

  it('treats a sub-cent reconciled amount as nothing reconciled', () => {
    const info = differenceState({
      line: { ...PARTIAL_LINE, reconciledAmount: 0.004 },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'notPartial');
  });
});

describe('differenceState — balanced', () => {
  it('hides the banner when the remainder is already nil', () => {
    const info = differenceState({
      line: { ...PARTIAL_LINE, pendingAmount: 0 },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'balanced');
  });

  it('hides the banner for a sub-cent remainder', () => {
    const info = differenceState({
      line: { ...PARTIAL_LINE, pendingAmount: 0.004 },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'balanced');
  });
});

describe('differenceState — dismissed', () => {
  it('hides the banner after "Dejar pendiente", without changing the numbers', () => {
    const info = differenceState({ line: PARTIAL_LINE, amountTolerance: 5, dismissed: true });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'dismissed');
    assert.equal(info.remainder, 0.5);
    assert.equal(info.lineTotal, 12.5);
    assert.equal(info.reconciled, 12);
    assert.equal(info.limit, 0.625);
  });

  it('takes precedence over the tolerance check but not over balanced', () => {
    const balanced = differenceState({
      line: { ...PARTIAL_LINE, pendingAmount: 0 },
      amountTolerance: 5,
      dismissed: true,
    });
    assert.equal(balanced.reason, 'balanced');
  });
});

describe('differenceState — outOfTolerance', () => {
  it('hides the banner entirely when the remainder exceeds the limit', () => {
    // 5 % of 12.50 = 0.625; a 1.50 remainder is a real movement, not an adjustment.
    const info = differenceState({
      line: { ...PARTIAL_LINE, reconciledAmount: 11, pendingAmount: 1.5 },
      amountTolerance: 5,
    });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'outOfTolerance');
    assert.equal(info.limit, 0.625);
  });

  it('hides the banner when no tolerance is configured at all', () => {
    const info = differenceState({ line: PARTIAL_LINE, amountTolerance: 0 });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'outOfTolerance');
    assert.equal(info.limit, 0);
  });

  it('hides the banner when the tolerance prop is absent', () => {
    const info = differenceState({ line: PARTIAL_LINE });
    assert.equal(info.visible, false);
    assert.equal(info.reason, 'outOfTolerance');
  });

  it('is inclusive on the limit — a remainder exactly at the cap is still offered', () => {
    const info = differenceState({
      line: { ...PARTIAL_LINE, reconciledAmount: 11.875, pendingAmount: 0.625 },
      amountTolerance: 5,
    });
    assert.equal(info.visible, true);
    assert.equal(info.reason, null);
  });

  it('compares the ABSOLUTE remainder, so an outflow difference is judged the same', () => {
    const info = differenceState({
      line: {
        ...PARTIAL_LINE, amount: -12.5, reconciledAmount: -12, pendingAmount: -0.5,
      },
      amountTolerance: 5,
    });
    assert.equal(info.visible, true);
    assert.equal(info.reason, null);
    assert.equal(info.remainder, -0.5);
    assert.equal(info.limit, 0.625);
  });
});

describe('differenceState — the account GL item is NOT part of the decision', () => {
  // The account's configured difference concept only PRESELECTS the modal's picker. The backend
  // accepts any glItemId the modal sends and only falls back to the account default when none is
  // given, so a missing default is not a dead end — the modal's own confirm is the real guard.
  // Guards against reintroducing a `hasGlItem`/`blocked` gate here.
  it('offers the action regardless of any extra argument the caller passes', () => {
    const withFlag = differenceState({
      line: PARTIAL_LINE, amountTolerance: 5, hasGlItem: false,
    });
    const withoutFlag = differenceState({ line: PARTIAL_LINE, amountTolerance: 5 });
    assert.equal(withFlag.visible, true);
    assert.deepEqual(withFlag, withoutFlag);
  });

  it('never reports a blocked state', () => {
    for (const args of [
      { line: PARTIAL_LINE, amountTolerance: 5 },
      { line: PARTIAL_LINE, amountTolerance: 0 },
      { line: null, amountTolerance: 5 },
      { line: PARTIAL_LINE, amountTolerance: 5, dismissed: true },
    ]) {
      assert.equal(Object.hasOwn(differenceState(args), 'blocked'), false);
      assert.notEqual(differenceState(args).reason, 'noGlItem');
    }
  });
});

describe('differenceState — visible', () => {
  it('offers the action and reports every figure the banner and modal render', () => {
    const info = differenceState({ line: PARTIAL_LINE, amountTolerance: 5 });
    assert.deepEqual(info, {
      visible: true,
      remainder: 0.5,
      lineTotal: 12.5,
      reconciled: 12,
      limit: 0.625,
      reason: null,
    });
  });

  it('reads a string tolerance, as the contract serves it', () => {
    const info = differenceState({ line: PARTIAL_LINE, amountTolerance: '5' });
    assert.equal(info.visible, true);
    assert.equal(info.limit, 0.625);
  });
});
