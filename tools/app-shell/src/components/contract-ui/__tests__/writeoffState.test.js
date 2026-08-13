import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { writeoffState, WRITEOFF_EPSILON } from '../writeoffMath.js';

/**
 * `writeoffState` is where the whole feature decides whether to appear and whether to let the user
 * through (ETP-4797), so it is tested on its own rather than through either modal.
 *
 * The limit semantics are the part most likely to be "fixed" into a regression: an unset or zero
 * limit means NO LIMIT here, deliberately unlike Classic — see
 * ReconciliationHandler.assertWithinWriteoffLimit for why.
 */
describe('writeoffState', () => {
  describe('visibility', () => {
    it('offers the write-off when the invoice asks for more than the payment funds', () => {
      const s = writeoffState({ difference: 0.5 });
      assert.equal(s.visible, true);
      assert.equal(s.blocked, false);
      assert.equal(s.amount, 0.5);
    });

    it('stays hidden when the amounts match exactly', () => {
      assert.equal(writeoffState({ difference: 0 }).visible, false);
    });

    it('stays hidden for a difference below the rounding epsilon', () => {
      // Half a tenth of a cent is float noise, not a debt worth writing off.
      assert.equal(writeoffState({ difference: WRITEOFF_EPSILON / 2 }).visible, false);
    });

    it('appears exactly at the epsilon', () => {
      assert.equal(writeoffState({ difference: WRITEOFF_EPSILON }).visible, true);
    });

    it('stays hidden when the payment covers MORE than the invoice', () => {
      // A surplus is the mirror case (money left on the statement line) and a different flow;
      // writing it off here would invent a debt that does not exist.
      assert.equal(writeoffState({ difference: -0.5 }).visible, false);
    });

    it('stays hidden when the caller says the context is not eligible', () => {
      // e.g. several invoices selected, or a draft being edited.
      assert.equal(writeoffState({ difference: 5, eligible: false }).visible, false);
    });
  });

  describe('write-off limit', () => {
    it('treats an absent limit as no limit', () => {
      assert.equal(writeoffState({ difference: 9999 }).blocked, false);
    });

    it('treats a null limit as no limit', () => {
      assert.equal(writeoffState({ difference: 9999, limit: null }).blocked, false);
    });

    it('treats a zero limit as no limit, NOT as "forbid everything"', () => {
      // Classic would block here. Writeofflimit has no default and is not mandatory, so copying
      // that would disable the feature on every account nobody configured.
      assert.equal(writeoffState({ difference: 0.5, limit: 0 }).blocked, false);
    });

    it('allows a difference equal to the limit', () => {
      assert.equal(writeoffState({ difference: 5, limit: 5 }).blocked, false);
    });

    it('blocks a difference above the limit but keeps the row visible to explain why', () => {
      const s = writeoffState({ difference: 5.01, limit: 5 });
      assert.equal(s.visible, true);
      assert.equal(s.blocked, true);
    });
  });

  it('coerces a non-numeric difference to zero instead of producing NaN', () => {
    const s = writeoffState({ difference: undefined });
    assert.equal(s.amount, 0);
    assert.equal(s.visible, false);
  });
});
