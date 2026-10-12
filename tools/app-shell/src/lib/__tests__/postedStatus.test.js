// @covers tools/app-shell/src/lib/postedStatus.js
/**
 * ETP-5075 — shared `Posted` domain registry.
 *
 * The `Posted` AD column is not a boolean: it carries 17 distinct codes, and
 * before this registry existed the grid and the detail view each hardcoded
 * their own `'Y'`/`'N'` allowlist and disagreed on everything else — a record
 * whose posting FAILED (e.g. `'i'`, invalid account) read as "—" in the grid
 * and "Not posted" in the detail. These tests pin the registry's contract so
 * that defect cannot silently come back.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePostedStatus, postedStatusLabel, resolveStatusPill, postedStatusTone, isPostedBooleanValue,
} from '../postedStatus.js';

describe('resolvePostedStatus', () => {
  it('returns null for a column that is not registered (fails closed)', () => {
    assert.equal(resolvePostedStatus('DocStatus', 'i'), null);
    assert.equal(resolvePostedStatus('Processed', 'E'), null);
  });

  it('resolves both registered column spellings', () => {
    assert.notEqual(resolvePostedStatus('Posted', 'i'), null);
    assert.notEqual(resolvePostedStatus('posted', 'i'), null);
  });

  it('returns null for empty values regardless of column', () => {
    assert.equal(resolvePostedStatus('Posted', null), null);
    assert.equal(resolvePostedStatus('Posted', undefined), null);
    assert.equal(resolvePostedStatus('Posted', ''), null);
  });

  it('returns null for plain boolean/Y/N values so the caller keeps its own path', () => {
    assert.equal(resolvePostedStatus('Posted', true), null);
    assert.equal(resolvePostedStatus('Posted', false), null);
    assert.equal(resolvePostedStatus('Posted', 'Y'), null);
    assert.equal(resolvePostedStatus('Posted', 'N'), null);
    assert.equal(resolvePostedStatus('Posted', 'true'), null);
    assert.equal(resolvePostedStatus('Posted', 'false'), null);
  });

  it("resolves 'i' (invalid account) as destructive/red", () => {
    assert.deepEqual(resolvePostedStatus('Posted', 'i'), {
      labelKey: 'postedStatusInvalidAccount',
      rawLabel: 'i',
      tone: 'destructive',
    });
  });

  it("resolves 'E' (posting error) and 'p' (period closed) as destructive/red", () => {
    const e = resolvePostedStatus('Posted', 'E');
    assert.equal(e.labelKey, 'postedStatusError');
    assert.equal(e.tone, 'destructive');

    const p = resolvePostedStatus('Posted', 'p');
    assert.equal(p.labelKey, 'postedStatusPeriodClosed');
    assert.equal(p.tone, 'destructive');
  });

  it("resolves 'T' (table disabled) and 'D' (document disabled) as neutral", () => {
    const t = resolvePostedStatus('Posted', 'T');
    assert.equal(t.labelKey, 'postedStatusTableDisabled');
    assert.equal(t.tone, 'neutral');

    const d = resolvePostedStatus('Posted', 'D');
    assert.equal(d.labelKey, 'postedStatusDocumentDisabled');
    assert.equal(d.tone, 'neutral');
  });

  describe('case sensitivity (load-bearing — never upper/lower-case a code)', () => {
    it("'y' (post prepared) resolves differently from 'Y' (posted, boolean path)", () => {
      const lower = resolvePostedStatus('Posted', 'y');
      assert.notEqual(lower, null);
      assert.equal(lower.labelKey, 'postedStatusPostPrepared');
      // 'Y' is a plain boolean value and must short-circuit to null.
      assert.equal(resolvePostedStatus('Posted', 'Y'), null);
    });

    it("'c' (not convertible) resolves differently from 'C' (error, no cost)", () => {
      const lower = resolvePostedStatus('Posted', 'c');
      const upper = resolvePostedStatus('Posted', 'C');
      assert.notEqual(lower.labelKey, upper.labelKey);
      assert.equal(lower.labelKey, 'postedStatusNotConvertible');
      assert.equal(upper.labelKey, 'postedStatusErrorNoCost');
    });

    it("'d' (disabled for background) resolves differently from 'D' (document disabled)", () => {
      const lower = resolvePostedStatus('Posted', 'd');
      const upper = resolvePostedStatus('Posted', 'D');
      assert.notEqual(lower.labelKey, upper.labelKey);
      assert.equal(lower.labelKey, 'postedStatusDisabledBackground');
      assert.equal(upper.labelKey, 'postedStatusDocumentDisabled');
    });
  });

  it('resolves every documented multi-char code (NC, AD, DT, NO)', () => {
    assert.equal(resolvePostedStatus('Posted', 'NC').labelKey, 'postedStatusCostNotCalculated');
    assert.equal(resolvePostedStatus('Posted', 'AD').labelKey, 'postedStatusNoAccountingDate');
    assert.equal(resolvePostedStatus('Posted', 'DT').labelKey, 'postedStatusNoDocumentType');
    assert.equal(resolvePostedStatus('Posted', 'NO').labelKey, 'postedStatusNoRelatedPo');
  });

  it("resolves 'b' (not balanced) and 'L' (document locked) as destructive/red", () => {
    assert.equal(resolvePostedStatus('Posted', 'b').labelKey, 'postedStatusNotBalanced');
    assert.equal(resolvePostedStatus('Posted', 'L').labelKey, 'postedStatusDocumentLocked');
  });

  it("resolves 'l' (pending refresh) as neutral", () => {
    const l = resolvePostedStatus('Posted', 'l');
    assert.equal(l.labelKey, 'postedStatusPendingRefresh');
    assert.equal(l.tone, 'neutral');
  });

  it('an unknown code out of the AD domain is shown, never silently collapsed to a dash', () => {
    const unknown = resolvePostedStatus('Posted', 'ZZ');
    assert.deepEqual(unknown, {
      labelKey: null,
      rawLabel: 'ZZ',
      tone: 'neutral',
    });
  });

  it('coerces a non-string value to string before lookup (defensive)', () => {
    // Not a realistic backend payload, but proves the code path does not throw.
    const result = resolvePostedStatus('Posted', 123);
    assert.equal(result.rawLabel, '123');
  });
});

describe('postedStatusTone — the single colour source (ETP-5647)', () => {
  it("'N' (not posted) is warning — yellow pending, not an orange error", () => {
    assert.equal(postedStatusTone('N'), 'warning');
  });

  it("'Y' (posted) is success", () => {
    assert.equal(postedStatusTone('Y'), 'success');
  });

  it('folds every boolean spelling onto Y/N', () => {
    assert.equal(postedStatusTone(true), 'success');
    assert.equal(postedStatusTone('true'), 'success');
    assert.equal(postedStatusTone(false), 'warning');
    assert.equal(postedStatusTone('false'), 'warning');
  });

  it("'p' (period closed) is destructive, like every other failed posting", () => {
    for (const code of ['p', 'E', 'C', 'i', 'b', 'c', 'NC', 'AD', 'DT', 'NO', 'L']) {
      assert.equal(postedStatusTone(code), 'destructive', `code '${code}'`);
    }
  });

  it('switched-off / not-prepared codes and unknown codes are neutral', () => {
    for (const code of ['T', 'D', 'd', 'y', 'l', 'ZZ']) {
      assert.equal(postedStatusTone(code), 'neutral', `code '${code}'`);
    }
  });

  it('keeps case: lower-case y (post prepared) is not Y (posted)', () => {
    assert.equal(postedStatusTone('y'), 'neutral');
    assert.equal(postedStatusTone('Y'), 'success');
  });

  it('returns null for an empty value (nothing to colour)', () => {
    assert.equal(postedStatusTone(null), null);
    assert.equal(postedStatusTone(undefined), null);
    assert.equal(postedStatusTone(''), null);
  });

  it('agrees with resolvePostedStatus on every non-boolean code', () => {
    for (const code of ['E', 'C', 'i', 'b', 'c', 'NC', 'AD', 'DT', 'NO', 'L', 'p', 'T', 'D', 'd', 'y', 'l', 'ZZ']) {
      assert.equal(postedStatusTone(code), resolvePostedStatus('Posted', code).tone, `code '${code}'`);
    }
  });
});

describe('isPostedBooleanValue', () => {
  it('is true only for the Y/N pair and its boolean spellings', () => {
    for (const v of [true, false, 'Y', 'N', 'true', 'false']) assert.equal(isPostedBooleanValue(v), true, String(v));
    for (const v of ['y', 'n', 'E', '', null, undefined, 1]) assert.equal(isPostedBooleanValue(v), false, String(v));
  });
});

describe('postedStatusLabel', () => {
  it('translates via ui() when labelKey is present', () => {
    const status = resolvePostedStatus('Posted', 'i');
    const ui = (key) => `translated:${key}`;
    assert.equal(postedStatusLabel(status, ui), 'translated:postedStatusInvalidAccount');
  });

  it('falls back to rawLabel when labelKey is null (unknown code)', () => {
    const status = resolvePostedStatus('Posted', 'ZZ');
    const ui = () => { throw new Error('ui() must not be called when labelKey is null'); };
    assert.equal(postedStatusLabel(status, ui), 'ZZ');
  });
});

describe('resolveStatusPill', () => {
  const ui = (key) => key;

  it('the posting-status domain wins over trueKey/falseKey for a domain code', () => {
    const badge = { key: 'posted', trueKey: 'postedTrue', falseKey: 'postedFalse' };
    const pill = resolveStatusPill(badge, 'i', ui);
    assert.deepEqual(pill, { status: 'i', label: 'postedStatusInvalidAccount', tone: 'destructive', hint: undefined });
  });

  it("falls back to trueKey/success for 'Y'", () => {
    const badge = { key: 'posted', trueKey: 'postedTrue', falseKey: 'postedFalse' };
    const pill = resolveStatusPill(badge, 'Y', ui);
    assert.deepEqual(pill, { status: 'Y', label: 'postedTrue', tone: 'success' });
  });

  it("falls back to falseKey/warning for 'N'", () => {
    const badge = { key: 'posted', trueKey: 'postedTrue', falseKey: 'postedFalse' };
    const pill = resolveStatusPill(badge, 'N', ui);
    assert.deepEqual(pill, { status: 'N', label: 'postedFalse', tone: 'warning' });
  });

  it('resolves via badge.column when present, keyed independently of badge.key', () => {
    const badge = { key: 'anyApiKey', column: 'Posted', trueKey: 'x', falseKey: 'y' };
    const pill = resolveStatusPill(badge, 'p', ui);
    assert.equal(pill.status, 'p');
    assert.equal(pill.label, 'postedStatusPeriodClosed');
    assert.equal(pill.tone, 'destructive');
  });

  it('a one-sided badge (falseKey missing) hides on a falsy non-domain value', () => {
    const badge = { key: 'isRectificative', trueKey: 'someKey' };
    assert.equal(resolveStatusPill(badge, false, ui), null);
  });

  it("a one-sided badge with falseKey literal 'undefined' hides on a falsy value", () => {
    const badge = { key: 'isRectificative', trueKey: 'someKey', falseKey: 'undefined' };
    assert.equal(resolveStatusPill(badge, false, ui), null);
  });

  it("a posting-status pill takes its Y/N tone from the registry (keyed by badge.column too)", () => {
    const badge = { key: 'anyApiKey', column: 'Posted', trueKey: 'x', falseKey: 'y' };
    assert.equal(resolveStatusPill(badge, 'N', ui).tone, postedStatusTone('N'));
    assert.equal(resolveStatusPill(badge, true, ui).tone, postedStatusTone('Y'));
  });

  it('a non-posted true/false pill keeps the generic success/warning pair', () => {
    const badge = { key: 'isPaid', trueKey: 'paid', falseKey: 'unpaid' };
    assert.equal(resolveStatusPill(badge, 'Y', ui).tone, 'success');
    assert.equal(resolveStatusPill(badge, 'N', ui).tone, 'warning');
  });

  it('a non-posted-status column with an unrecognized value still falls to the true/false branch', () => {
    const badge = { key: 'someOtherFlag', trueKey: 'a', falseKey: 'b' };
    // Not 'Y'/'N'/true/false/'true'/'false' -> isTrue is false -> falseKey branch.
    const pill = resolveStatusPill(badge, 'weird', ui);
    assert.deepEqual(pill, { status: 'N', label: 'b', tone: 'warning' });
  });

  describe('hintKeys (ETP-5436)', () => {
    it('attaches a hint when the resolved code matches an entry in badge.hintKeys', () => {
      const badge = { key: 'posted', trueKey: 'x', falseKey: 'y', hintKeys: { D: 'goodsMovementsPostedDisabledHint' } };
      const pill = resolveStatusPill(badge, 'D', ui);
      assert.deepEqual(pill, {
        status: 'D',
        label: 'postedStatusDocumentDisabled',
        tone: 'neutral',
        hint: 'goodsMovementsPostedDisabledHint',
      });
    });

    it('does not attach a hint when the resolved code has no matching hintKeys entry', () => {
      const badge = { key: 'posted', trueKey: 'x', falseKey: 'y', hintKeys: { D: 'goodsMovementsPostedDisabledHint' } };
      const pill = resolveStatusPill(badge, 'i', ui); // 'i' is not in hintKeys
      assert.equal(pill.hint, undefined);
    });

    it('does not attach a hint for a plain Y/N value even when hintKeys is declared', () => {
      const badge = { key: 'posted', trueKey: 'postedTrue', falseKey: 'postedFalse', hintKeys: { D: 'someKey' } };
      assert.deepEqual(resolveStatusPill(badge, 'Y', ui), { status: 'Y', label: 'postedTrue', tone: 'success' });
      assert.deepEqual(resolveStatusPill(badge, 'N', ui), { status: 'N', label: 'postedFalse', tone: 'warning' });
    });

    it('a badge with no hintKeys at all behaves exactly as before (regression guard)', () => {
      const badge = { key: 'posted', trueKey: 'x', falseKey: 'y' };
      const pill = resolveStatusPill(badge, 'p', ui);
      assert.deepEqual(pill, {
        status: 'p',
        label: 'postedStatusPeriodClosed',
        tone: 'destructive',
        hint: undefined,
      });
    });
  });
});
