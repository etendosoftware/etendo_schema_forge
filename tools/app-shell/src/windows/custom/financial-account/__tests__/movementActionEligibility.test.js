/**
 * resolveMovementDeleteBlock (ETP-5111) — the reason a movement cannot be deleted, decided in one
 * place so both the row kebab's "Eliminar" and the backend's own 409 guards read identically.
 *
 * This is the client-side half of the unified delete rule ("never pre-block the affordance, always
 * explain the refusal"): the item is rendered on EVERY row, and this function is what turns the
 * click into an explanatory toast instead of a request. So what is under test here is the
 * PRECEDENCE and the exact key/params each case yields — the kebab only forwards them to `ui()`.
 *
 * Pure JS (no JSX, no React), so node:test runs it directly — same style as the sibling
 * `statementStatus.test.js`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMovementDeleteBlock } from '../movementActionEligibility.js';

/** A plain manual G/L movement: nothing references it, so nothing blocks it. */
const GL_MOVEMENT = { id: 'gl-1', trxType: 'BPD' };

describe('resolveMovementDeleteBlock — rule 1: linked to a payment or a receipt', () => {
  // The bank transaction belongs to the FIN_Payment; the correct removal direction is
  // payment -> transaction, so this window can only ever point the user at the payment.
  //
  // `paymentIsReceipt` picks the WORDING — pago vs cobro — using the same `=== 'Y'` test
  // `MovementsTable.openPayment` uses to choose between the payment-in and payment-out windows.
  it('reports the payment (pago) wording for a payment-linked movement', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({ paymentId: 'p-1', paymentIsReceipt: 'N' }),
      { key: 'backendError.paymentMovementNotDeletable' },
    );
  });

  it('reports the receipt (cobro) wording when paymentIsReceipt is Y', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({ paymentId: 'p-1', paymentIsReceipt: 'Y' }),
      { key: 'backendError.receiptMovementNotDeletable' },
    );
  });

  /**
   * The null case, pinned on purpose. The backend decides the same thing with
   * `Boolean.TRUE.equals(trx.getFinPayment().isReceipt())` — a boxed Boolean that is null when the
   * flag was never set — so BOTH sides must treat "unset" as a payment, not a receipt. This is the
   * one input where the two implementations could silently disagree (a truthiness check here, or a
   * dereference there, would each break it differently), so it is asserted for every shape the
   * absent flag can arrive in rather than just one.
   */
  it('treats an absent, undefined or empty paymentIsReceipt as a payment, never a receipt', () => {
    for (const movement of [
      { paymentId: 'p-1' },                          // field absent entirely
      { paymentId: 'p-1', paymentIsReceipt: undefined },
      { paymentId: 'p-1', paymentIsReceipt: null },
      { paymentId: 'p-1', paymentIsReceipt: '' },
    ]) {
      assert.deepEqual(
        resolveMovementDeleteBlock(movement),
        { key: 'backendError.paymentMovementNotDeletable' },
        `unset paymentIsReceipt must read as a payment, got a different key for ${JSON.stringify(movement)}`,
      );
    }
  });

  // Only the exact 'Y' flips it — a lowercase or boolean-ish value is not the AD convention and
  // must not be guessed at, or the two paths drift.
  it('does not treat a non-Y truthy value as a receipt', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({ paymentId: 'p-1', paymentIsReceipt: 'y' }),
      { key: 'backendError.paymentMovementNotDeletable' },
    );
  });

  /**
   * No `params`, on ANY branch. The earlier wording interpolated the payment's `documentNo`, which
   * the user's correction removed: it produced a second, longer variant of the same sentence for no
   * decision the user could act on differently. Asserting the key alone would still pass if params
   * came back, so the absence is asserted explicitly — and via `Object.keys`, so a `params:
   * undefined` property added back by a future refactor is caught too.
   */
  it('never interpolates anything into the message, on any branch', () => {
    for (const movement of [
      { paymentId: 'p-1', paymentIsReceipt: 'Y', documentNo: 'PAY-0042' },
      { paymentId: 'p-1', paymentIsReceipt: 'N', documentNo: 'PAY-0042' },
      { transferTxnId: 'txn-2', trxType: 'BPW', documentNo: 'TRF-0001' },
    ]) {
      const block = resolveMovementDeleteBlock(movement);

      assert.deepEqual(Object.keys(block), ['key'], `expected only a \`key\`, got ${JSON.stringify(block)}`);
      assert.equal(block.params, undefined);
      // A documentNo present on the row must not leak into the result in any form.
      assert.doesNotMatch(JSON.stringify(block), /PAY-0042|TRF-0001/);
    }
  });

  /**
   * Every branch returns one of the `backendError.*` keys `BACKEND_ERROR_MAP` maps the backend's own
   * 409 literals to. That is what makes the sentence byte-identical whether it came from this
   * client-side pre-check (the row kebab) or from the server (the bulk path, REST, MCP) — the whole
   * reason this module returns a KEY instead of a formatted string.
   */
  it('returns only shared backendError.* keys, so both paths read identically', () => {
    for (const movement of [
      { paymentId: 'p-1', paymentIsReceipt: 'Y' },
      { paymentId: 'p-1', paymentIsReceipt: 'N' },
      { transferTxnId: 'txn-2', trxType: 'BPW' },
    ]) {
      assert.match(resolveMovementDeleteBlock(movement).key, /^backendError\./);
    }
  });
});

describe('resolveMovementDeleteBlock — rule 2: a funds-transfer leg', () => {
  // The counterpart references this row through a RESTRICT self-FK on FIN_FINACC_TRANSACTION, so
  // the removal could only ever fail. Reuses the very key BACKEND_ERROR_MAP maps the backend's own
  // 409 to, so the sentence is identical whether it came from here or from the server.
  it('blocks an outgoing leg with the shared transfer key', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({ transferTxnId: 'txn-2', trxType: 'BPW' }),
      { key: 'backendError.transferMovementNotDeletable' },
    );
  });

  it('blocks a leg whose trxType is not reported at all (unknown is not BF)', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({ transferTxnId: 'txn-2' }),
      { key: 'backendError.transferMovementNotDeletable' },
    );
  });

  // The gate is the FK DIRECTION, not the mere presence of a transfer link: a bank fee (BF) carries
  // the same transferTxnId as a leg, yet nothing references IT, so it stays deletable. Getting this
  // wrong hides a legitimately deletable row behind a refusal it does not deserve.
  it('leaves a BF bank fee deletable even though it carries a transferTxnId', () => {
    assert.equal(
      resolveMovementDeleteBlock({ transferTxnId: 'txn-2', trxType: 'BF' }),
      null,
    );
  });
});

describe('resolveMovementDeleteBlock — precedence and the deletable case', () => {
  // Payment wins over transfer: it is the actionable one ("delete it from the payment"), whereas
  // the transfer sentence would leave the user with nowhere to go.
  it('reports the payment reason when a row is both payment-linked and a transfer leg', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({
        paymentId: 'p-1', transferTxnId: 'txn-2', trxType: 'BPW',
      }),
      { key: 'backendError.paymentMovementNotDeletable' },
    );
  });

  // Same precedence for a receipt: the pago/cobro choice happens INSIDE rule 1, so it must not
  // reorder the rules — a receipt that also looks like a transfer leg still reports the receipt.
  it('reports the receipt reason when a receipt-linked row is also a transfer leg', () => {
    assert.deepEqual(
      resolveMovementDeleteBlock({
        paymentId: 'p-1', paymentIsReceipt: 'Y', transferTxnId: 'txn-2', trxType: 'BPW',
      }),
      { key: 'backendError.receiptMovementNotDeletable' },
    );
  });

  it('returns null for a plain G/L movement', () => {
    assert.equal(resolveMovementDeleteBlock(GL_MOVEMENT), null);
  });

  // A processed or posted movement is deliberately NOT blocked here: deleting it on its own runs
  // Payment Removal server-side, which reactivates it before removing. Blocking it client-side
  // would take away a delete that actually works.
  it('does NOT block a processed or posted movement (Payment Removal handles it)', () => {
    assert.equal(resolveMovementDeleteBlock({ id: 'gl-2', processed: true, posted: 'Y' }), null);
  });

  it('returns null rather than throwing for a missing movement', () => {
    assert.equal(resolveMovementDeleteBlock(null), null);
    assert.equal(resolveMovementDeleteBlock(undefined), null);
  });
});
