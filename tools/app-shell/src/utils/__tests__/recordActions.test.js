import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDeleteVisibleForRecord, DELETABLE_DOC_STATUSES, evalRowVisibleWhen } from '../recordActions.js';

describe('isDeleteVisibleForRecord', () => {
  it('returns true when hideDeleteWhenComplete is false (feature opt-out)', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: 'CO' },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: false,
      }),
      true,
    );
  });

  it('returns true when no statusField is configured (no gate to apply)', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: 'CO' },
        statusField: null,
        hideDeleteWhenComplete: true,
      }),
      true,
    );
  });

  it('returns true for draft records', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: 'DR' },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      true,
    );
  });

  it('returns true for RPAP (pending approval) records', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: 'RPAP' },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      true,
    );
  });

  it('returns false for completed records', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: 'CO' },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      false,
    );
  });

  it('returns false for voided records', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: 'VO' },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      false,
    );
  });

  it('returns true for records with empty/null status (treated as new)', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: null },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      true,
    );
    assert.equal(
      isDeleteVisibleForRecord({
        record: { documentStatus: '' },
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      true,
    );
    assert.equal(
      isDeleteVisibleForRecord({
        record: {},
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      true,
    );
  });

  it('handles missing record gracefully', () => {
    assert.equal(
      isDeleteVisibleForRecord({
        record: null,
        statusField: 'documentStatus',
        hideDeleteWhenComplete: true,
      }),
      true,
    );
  });

  it('exposes the deletable status whitelist', () => {
    assert.deepEqual(DELETABLE_DOC_STATUSES, ['DR', 'RPAP', 'N']);
  });

  describe('boolean-typed statusField (e.g. physical-inventory / goods-movements "processed")', () => {
    it('returns true when the boolean status is false (not yet processed / draft-like)', () => {
      assert.equal(
        isDeleteVisibleForRecord({
          record: { processed: false },
          statusField: 'processed',
          hideDeleteWhenComplete: true,
        }),
        true,
      );
    });

    it('returns false when the boolean status is true (processed)', () => {
      assert.equal(
        isDeleteVisibleForRecord({
          record: { processed: true },
          statusField: 'processed',
          hideDeleteWhenComplete: true,
        }),
        false,
      );
    });

    it('does not fall through to the string-code whitelist for booleans (regression guard)', () => {
      // Before the fix, `DELETABLE_DOC_STATUSES.includes(false)` and
      // `.includes(true)` both evaluate to false, which hid Delete
      // unconditionally — even for draft (processed: false) records.
      assert.equal(
        isDeleteVisibleForRecord({
          record: { processed: false },
          statusField: 'processed',
          hideDeleteWhenComplete: true,
        }),
        true,
        'draft-like boolean status must remain deletable',
      );
    });

    it('is unaffected when hideDeleteWhenComplete is false, regardless of boolean value', () => {
      assert.equal(
        isDeleteVisibleForRecord({
          record: { processed: true },
          statusField: 'processed',
          hideDeleteWhenComplete: false,
        }),
        true,
      );
    });
  });

  describe('hideDeleteButton (unconditional hide)', () => {
    it('returns false for a draft record when hideDeleteButton is true', () => {
      assert.equal(
        isDeleteVisibleForRecord({
          record: { documentStatus: 'DR' },
          statusField: 'documentStatus',
          hideDeleteWhenComplete: false,
          hideDeleteButton: true,
        }),
        false,
      );
    });

    it('returns false regardless of status or hideDeleteWhenComplete', () => {
      for (const status of ['DR', 'RPAP', 'N', 'CO', 'VO', null, '']) {
        for (const hideDeleteWhenComplete of [true, false]) {
          assert.equal(
            isDeleteVisibleForRecord({
              record: { documentStatus: status },
              statusField: 'documentStatus',
              hideDeleteWhenComplete,
              hideDeleteButton: true,
            }),
            false,
            `expected hidden for status=${status} hideDeleteWhenComplete=${hideDeleteWhenComplete}`,
          );
        }
      }
    });

    it('returns false even with no statusField configured', () => {
      assert.equal(
        isDeleteVisibleForRecord({
          record: { documentStatus: 'DR' },
          statusField: null,
          hideDeleteWhenComplete: false,
          hideDeleteButton: true,
        }),
        false,
      );
    });

    it('defaults to false (absent flag) → visibility unchanged vs. legacy behavior', () => {
      // Draft record, no gate → visible, exactly as before the flag existed.
      assert.equal(
        isDeleteVisibleForRecord({
          record: { documentStatus: 'DR' },
          statusField: 'documentStatus',
          hideDeleteWhenComplete: true,
        }),
        true,
      );
    });

    it('explicit hideDeleteButton: false behaves identically to omitting it', () => {
      assert.equal(
        isDeleteVisibleForRecord({
          record: { documentStatus: 'CO' },
          statusField: 'documentStatus',
          hideDeleteWhenComplete: true,
          hideDeleteButton: false,
        }),
        false, // hidden because completed, not because of the button flag
      );
      assert.equal(
        isDeleteVisibleForRecord({
          record: { documentStatus: 'DR' },
          statusField: 'documentStatus',
          hideDeleteWhenComplete: true,
          hideDeleteButton: false,
        }),
        true,
      );
    });
  });
});

describe('evalRowVisibleWhen', () => {
  it('returns true when expr is null/undefined/empty', () => {
    assert.equal(evalRowVisibleWhen(null, {}), true);
    assert.equal(evalRowVisibleWhen(undefined, {}), true);
    assert.equal(evalRowVisibleWhen('', {}), true);
  });

  it('returns true when expr has no parseable clauses', () => {
    assert.equal(evalRowVisibleWhen('garbage text', {}), true);
  });

  it('evaluates a simple equality clause', () => {
    assert.equal(
      evalRowVisibleWhen("@DocumentStatus@='CO'", { documentStatus: 'CO' }),
      true,
    );
    assert.equal(
      evalRowVisibleWhen("@DocumentStatus@='CO'", { documentStatus: 'DR' }),
      false,
    );
  });

  it('evaluates a != clause', () => {
    assert.equal(
      evalRowVisibleWhen("@DocumentStatus@!='CO'", { documentStatus: 'DR' }),
      true,
    );
    assert.equal(
      evalRowVisibleWhen("@DocumentStatus@!='CO'", { documentStatus: 'CO' }),
      false,
    );
  });

  it('evaluates AND-chained clauses (all must match)', () => {
    const expr = "@DocumentStatus@='CO' AND @Processed@='Y'";
    assert.equal(evalRowVisibleWhen(expr, { documentStatus: 'CO', processed: 'Y' }), true);
    assert.equal(evalRowVisibleWhen(expr, { documentStatus: 'CO', processed: 'N' }), false);
    assert.equal(evalRowVisibleWhen(expr, { documentStatus: 'DR', processed: 'Y' }), false);
  });

  it('normalizes boolean true → Y and false → N', () => {
    assert.equal(
      evalRowVisibleWhen("@Processed@='Y'", { processed: true }),
      true,
    );
    assert.equal(
      evalRowVisibleWhen("@Processed@='N'", { processed: false }),
      true,
    );
    assert.equal(
      evalRowVisibleWhen("@Processed@='Y'", { processed: false }),
      false,
    );
  });

  it('returns true when referenced field is absent from row', () => {
    assert.equal(
      evalRowVisibleWhen("@MissingField@='X'", { otherField: 'Y' }),
      true,
    );
  });

  it('lowercases the first character of the field ref', () => {
    // @DocumentStatus@ → documentStatus
    assert.equal(
      evalRowVisibleWhen("@DocumentStatus@='DR'", { documentStatus: 'DR' }),
      true,
    );
  });

  it('handles null row gracefully', () => {
    assert.equal(evalRowVisibleWhen("@Field@='X'", null), true);
  });
});
