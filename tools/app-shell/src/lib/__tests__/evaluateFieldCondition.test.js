import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFieldCondition } from '../evaluateFieldCondition.js';

describe('evaluateFieldCondition', () => {
  describe('scalar equality', () => {
    it('matches a string scalar', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: 'DR' }, { documentStatus: 'DR' }), true);
    });

    it('does not match a different string scalar', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: 'DR' }, { documentStatus: 'CO' }), false);
    });

    it('matches a number scalar', () => {
      assert.equal(evaluateFieldCondition({ quantity: 5 }, { quantity: 5 }), true);
    });

    it('does not match a different number scalar', () => {
      assert.equal(evaluateFieldCondition({ quantity: 5 }, { quantity: 6 }), false);
    });

    it('matches a boolean scalar', () => {
      assert.equal(evaluateFieldCondition({ processed: true }, { processed: true }), true);
    });

    it('does not match a different boolean scalar', () => {
      assert.equal(evaluateFieldCondition({ processed: true }, { processed: false }), false);
    });

    it('is strict about type — number 1 does not match string "1"', () => {
      assert.equal(evaluateFieldCondition({ quantity: 1 }, { quantity: '1' }), false);
    });
  });

  describe('array expectation (membership / implicit "in")', () => {
    it('matches when the record value is a member of the array', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: ['DR', 'CO'] }, { documentStatus: 'CO' }), true);
    });

    it('does not match when the record value is not a member of the array', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: ['DR', 'CO'] }, { documentStatus: 'CA' }), false);
    });

    it('does not match an empty array (no possible member)', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: [] }, { documentStatus: 'DR' }), false);
    });
  });

  describe('operator: equals', () => {
    it('matches when equal', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { equals: 'DR' } }, { documentStatus: 'DR' }), true);
    });

    it('does not match when not equal', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { equals: 'DR' } }, { documentStatus: 'CO' }), false);
    });
  });

  describe('operator: notEquals', () => {
    it('matches when values differ', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { notEquals: 'DR' } }, { documentStatus: 'CO' }), true);
    });

    it('does not match when values are equal', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { notEquals: 'DR' } }, { documentStatus: 'DR' }), false);
    });
  });

  describe('operator: in', () => {
    it('matches when the value is a member of the operator array', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { in: ['DR', 'CO'] } }, { documentStatus: 'DR' }),
        true,
      );
    });

    it('does not match when the value is not a member of the operator array', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { in: ['DR', 'CO'] } }, { documentStatus: 'CA' }),
        false,
      );
    });
  });

  describe('operator: notIn', () => {
    it('matches when the value is not a member of the operator array', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { notIn: ['DR', 'CO'] } }, { documentStatus: 'CA' }),
        true,
      );
    });

    it('does not match when the value is a member of the operator array', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { notIn: ['DR', 'CO'] } }, { documentStatus: 'DR' }),
        false,
      );
    });

    it('matches the real ETP-4714 sales-quotation shape: hides print outside the 4 allowed statuses', () => {
      // decisions.json: hidePrintWhen: { documentStatus: { notIn: ["UE", "CA", "ETGO_CI", "CJ"] } }
      // -> hidden (condition true) everywhere EXCEPT those 4 statuses.
      const condition = { documentStatus: { notIn: ['UE', 'CA', 'ETGO_CI', 'CJ'] } };
      assert.equal(evaluateFieldCondition(condition, { documentStatus: 'DR' }), true, 'DR is outside the allowed list -> hidden');
      assert.equal(evaluateFieldCondition(condition, { documentStatus: 'CO' }), true, 'CO is outside the allowed list -> hidden');
      assert.equal(evaluateFieldCondition(condition, { documentStatus: 'UE' }), false, 'UE is inside the allowed list -> shown');
      assert.equal(evaluateFieldCondition(condition, { documentStatus: 'CA' }), false, 'CA is inside the allowed list -> shown');
      assert.equal(evaluateFieldCondition(condition, { documentStatus: 'ETGO_CI' }), false, 'ETGO_CI is inside the allowed list -> shown');
      assert.equal(evaluateFieldCondition(condition, { documentStatus: 'CJ' }), false, 'CJ is inside the allowed list -> shown');
    });

    it('is the logical negation of "in" for the same array and value', () => {
      const value = { documentStatus: 'DR' };
      const arr = ['DR', 'CO'];
      assert.equal(
        evaluateFieldCondition({ documentStatus: { in: arr } }, value),
        !evaluateFieldCondition({ documentStatus: { notIn: arr } }, value),
      );
    });

    it('matches (vacuously true) against an empty operator array — nothing to exclude', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { notIn: [] } }, { documentStatus: 'DR' }), true);
    });

    it('does not match when the field is missing from the record but the array contains undefined', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { notIn: [undefined, 'CO'] } }, {}),
        false,
      );
    });

    it('matches when the field is missing from the record and the array does not contain undefined', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { notIn: ['DR', 'CO'] } }, {}),
        true,
      );
    });

    it('guarded against a non-array operand (Array.isArray guard) — fails safe to false, not a thrown error', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { notIn: 'DR' } }, { documentStatus: 'CO' }), false);
      assert.doesNotThrow(() => evaluateFieldCondition({ documentStatus: { notIn: 'DR' } }, { documentStatus: 'CO' }));
    });

    it('guarded against a null operand', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { notIn: null } }, { documentStatus: 'DR' }), false);
    });

    it('combines with AND across fields: both notIn conditions must hold', () => {
      assert.equal(
        evaluateFieldCondition(
          { documentStatus: { notIn: ['DR'] }, invoiceStatus: { notIn: ['NA'] } },
          { documentStatus: 'CO', invoiceStatus: 'CO' },
        ),
        true,
      );
      assert.equal(
        evaluateFieldCondition(
          { documentStatus: { notIn: ['DR'] }, invoiceStatus: { notIn: ['NA'] } },
          { documentStatus: 'CO', invoiceStatus: 'NA' },
        ),
        false,
      );
    });

    it('a bogus operator sibling to a valid notIn still fails the whole field (AND across operator keys)', () => {
      assert.equal(
        evaluateFieldCondition({ documentStatus: { notIn: ['DR'], bogus: 1 } }, { documentStatus: 'CO' }),
        false,
      );
    });
  });

  describe('operator: gt', () => {
    it('matches when the numeric value is strictly greater', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gt: 100 } }, { quantity: 101 }), true);
    });

    it('does not match when the numeric value is equal', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gt: 100 } }, { quantity: 100 }), false);
    });

    it('does not match when the numeric value is lower', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gt: 100 } }, { quantity: 99 }), false);
    });
  });

  describe('operator: gte', () => {
    it('matches when the numeric value is greater', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gte: 100 } }, { quantity: 101 }), true);
    });

    it('matches when the numeric value is equal', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gte: 100 } }, { quantity: 100 }), true);
    });

    it('does not match when the numeric value is lower', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gte: 100 } }, { quantity: 99 }), false);
    });
  });

  describe('operator: lt', () => {
    it('matches when the numeric value is strictly lower', () => {
      assert.equal(evaluateFieldCondition({ quantity: { lt: 100 } }, { quantity: 99 }), true);
    });

    it('does not match when the numeric value is equal', () => {
      assert.equal(evaluateFieldCondition({ quantity: { lt: 100 } }, { quantity: 100 }), false);
    });

    it('does not match when the numeric value is greater', () => {
      assert.equal(evaluateFieldCondition({ quantity: { lt: 100 } }, { quantity: 101 }), false);
    });
  });

  describe('operator: lte', () => {
    it('matches when the numeric value is lower', () => {
      assert.equal(evaluateFieldCondition({ quantity: { lte: 100 } }, { quantity: 99 }), true);
    });

    it('matches when the numeric value is equal', () => {
      assert.equal(evaluateFieldCondition({ quantity: { lte: 100 } }, { quantity: 100 }), true);
    });

    it('does not match when the numeric value is greater', () => {
      assert.equal(evaluateFieldCondition({ quantity: { lte: 100 } }, { quantity: 101 }), false);
    });
  });

  describe('operators compare via Number(...) even on numeric strings', () => {
    it('matches gt when the record value is a numeric string', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gt: 100 } }, { quantity: '150' }), true);
    });
  });

  describe('AND semantics across multiple fields', () => {
    it('matches when all fields match', () => {
      assert.equal(
        evaluateFieldCondition(
          { documentStatus: 'DR', quantity: { gt: 100 } },
          { documentStatus: 'DR', quantity: 150 },
        ),
        true,
      );
    });

    it('does not match when only one of several fields matches', () => {
      assert.equal(
        evaluateFieldCondition(
          { documentStatus: 'DR', quantity: { gt: 100 } },
          { documentStatus: 'DR', quantity: 50 },
        ),
        false,
      );
    });
  });

  describe('condition edge cases', () => {
    it('returns false when condition is null', () => {
      assert.equal(evaluateFieldCondition(null, { documentStatus: 'DR' }), false);
    });

    it('returns false when condition is undefined', () => {
      assert.equal(evaluateFieldCondition(undefined, { documentStatus: 'DR' }), false);
    });

    it('returns false when condition is not an object (string)', () => {
      assert.equal(evaluateFieldCondition('documentStatus', { documentStatus: 'DR' }), false);
    });

    it('returns false when condition is not an object (number)', () => {
      assert.equal(evaluateFieldCondition(42, { documentStatus: 'DR' }), false);
    });

    it('returns true (vacuously) for an empty condition object', () => {
      assert.equal(evaluateFieldCondition({}, { documentStatus: 'DR' }), true);
      assert.equal(evaluateFieldCondition({}, {}), true);
    });
  });

  describe('record edge cases', () => {
    it('treats a null record as {} and does not throw', () => {
      assert.doesNotThrow(() => evaluateFieldCondition({ documentStatus: 'DR' }, null));
      assert.equal(evaluateFieldCondition({ documentStatus: 'DR' }, null), false);
    });

    it('treats an undefined record as {} and does not throw', () => {
      assert.doesNotThrow(() => evaluateFieldCondition({ documentStatus: 'DR' }, undefined));
      assert.equal(evaluateFieldCondition({ documentStatus: 'DR' }, undefined), false);
    });

    it('an empty condition against a null/undefined record still returns true (vacuous AND)', () => {
      assert.equal(evaluateFieldCondition({}, null), true);
      assert.equal(evaluateFieldCondition({}, undefined), true);
    });
  });

  describe('field absent from the record', () => {
    it('does not match a scalar expectation when the field is missing (undefined vs expected)', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: 'DR' }, { other: 'x' }), false);
    });

    it('matches notEquals when the field is missing (undefined !== expected)', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { notEquals: 'DR' } }, { other: 'x' }), true);
    });

    it('does not match "in" when the field is missing (undefined not in array)', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: ['DR', 'CO'] }, { other: 'x' }), false);
    });

    describe('missing field combined with numeric operators (Number(undefined) === NaN, every comparison is false)', () => {
      it('does not match gt when the field is missing', () => {
        assert.equal(evaluateFieldCondition({ quantity: { gt: 100 } }, {}), false);
      });

      it('does not match gte when the field is missing, even against 0', () => {
        assert.equal(evaluateFieldCondition({ quantity: { gte: 0 } }, {}), false);
      });

      it('does not match lt when the field is missing', () => {
        assert.equal(evaluateFieldCondition({ quantity: { lt: 100 } }, {}), false);
      });

      it('does not match lte when the field is missing', () => {
        assert.equal(evaluateFieldCondition({ quantity: { lte: 100 } }, {}), false);
      });
    });
  });

  describe('falsy-but-valid scalar expectations (0 / false are not "no condition")', () => {
    it('matches when expected is 0 and the record value is 0', () => {
      assert.equal(evaluateFieldCondition({ quantity: 0 }, { quantity: 0 }), true);
    });

    it('does not match when expected is 0 and the record value is a truthy number', () => {
      assert.equal(evaluateFieldCondition({ quantity: 0 }, { quantity: 5 }), false);
    });

    it('does not match when expected is 0 and the record value is missing (undefined !== 0)', () => {
      assert.equal(evaluateFieldCondition({ quantity: 0 }, {}), false);
    });

    it('matches when expected is false and the record value is false', () => {
      assert.equal(evaluateFieldCondition({ processed: false }, { processed: false }), true);
    });

    it('does not match when expected is false and the record value is missing (undefined !== false)', () => {
      assert.equal(evaluateFieldCondition({ processed: false }, {}), false);
    });

    it('matches gte 0 (an operator form of the same falsy-but-valid boundary)', () => {
      assert.equal(evaluateFieldCondition({ quantity: { gte: 0 } }, { quantity: 0 }), true);
    });
  });

  describe('unknown/typo\'d operator key inside an operator object', () => {
    it('never matches a bogus operator, regardless of the record value (fails safe — Print stays visible)', () => {
      assert.equal(evaluateFieldCondition({ foo: { bogus: 1 } }, { foo: 1 }), false);
      assert.equal(evaluateFieldCondition({ foo: { bogus: 1 } }, { foo: 'anything' }), false);
    });

    it('a bogus operator sibling to a valid one still fails the whole field (AND across operator keys)', () => {
      // quantity satisfies gt:5 on its own, but the unknown "bogus" key can never
      // resolve to true, so .every() over the operator object's entries is false.
      assert.equal(evaluateFieldCondition({ quantity: { gt: 5, bogus: 1 } }, { quantity: 10 }), false);
    });
  });

  describe('"in" operator guarded against a non-array operand', () => {
    it('does not match when { in: <scalar> } is used instead of { in: [<scalar>] } (Array.isArray guard)', () => {
      assert.equal(evaluateFieldCondition({ documentStatus: { in: 'DR' } }, { documentStatus: 'DR' }), false);
    });
  });

  describe('literal true/false condition (ETP-4714 — unconditional match without hidePrint)', () => {
    it('matches unconditionally when condition is the literal true, regardless of the record', () => {
      assert.equal(evaluateFieldCondition(true, { documentStatus: 'DR' }), true);
      assert.equal(evaluateFieldCondition(true, {}), true);
      assert.equal(evaluateFieldCondition(true, null), true);
      assert.equal(evaluateFieldCondition(true, undefined), true);
    });

    it('does not match when condition is the literal false (documented explicitly, already covered by the !condition guard)', () => {
      assert.equal(evaluateFieldCondition(false, { documentStatus: 'DR' }), false);
      assert.equal(evaluateFieldCondition(false, {}), false);
      assert.equal(evaluateFieldCondition(false, null), false);
      assert.equal(evaluateFieldCondition(false, undefined), false);
    });
  });

  describe('explicit null as the expected value (equality, not "field absent")', () => {
    it('matches when both the expectation and the record value are null', () => {
      assert.equal(evaluateFieldCondition({ optionalField: null }, { optionalField: null }), true);
    });

    it('does not match null against a genuinely missing field (undefined !== null)', () => {
      assert.equal(evaluateFieldCondition({ optionalField: null }, {}), false);
    });
  });
});
