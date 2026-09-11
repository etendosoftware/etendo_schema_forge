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
import { resolvePostedStatus, postedStatusLabel, resolveStatusPill } from '../postedStatus.js';

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
      variant: 'red',
    });
  });

  it("resolves 'E' (posting error) and 'p' (period closed) as destructive/red", () => {
    const e = resolvePostedStatus('Posted', 'E');
    assert.equal(e.labelKey, 'postedStatusError');
    assert.equal(e.tone, 'destructive');
    assert.equal(e.variant, 'red');

    const p = resolvePostedStatus('Posted', 'p');
    assert.equal(p.labelKey, 'postedStatusPeriodClosed');
    assert.equal(p.tone, 'destructive');
    assert.equal(p.variant, 'red');
  });

  it("resolves 'T' (table disabled) and 'D' (document disabled) as neutral", () => {
    const t = resolvePostedStatus('Posted', 'T');
    assert.equal(t.labelKey, 'postedStatusTableDisabled');
    assert.equal(t.tone, 'neutral');
    assert.equal(t.variant, 'neutral');

    const d = resolvePostedStatus('Posted', 'D');
    assert.equal(d.labelKey, 'postedStatusDocumentDisabled');
    assert.equal(d.tone, 'neutral');
    assert.equal(d.variant, 'neutral');
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
    assert.equal(l.variant, 'neutral');
  });

  it('an unknown code out of the AD domain is shown, never silently collapsed to a dash', () => {
    const unknown = resolvePostedStatus('Posted', 'ZZ');
    assert.deepEqual(unknown, {
      labelKey: null,
      rawLabel: 'ZZ',
      tone: 'neutral',
      variant: 'neutral',
    });
  });

  it('coerces a non-string value to string before lookup (defensive)', () => {
    // Not a realistic backend payload, but proves the code path does not throw.
    const result = resolvePostedStatus('Posted', 123);
    assert.equal(result.rawLabel, '123');
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
    assert.deepEqual(pill, { status: 'i', label: 'postedStatusInvalidAccount', tone: 'destructive' });
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

  it('a non-posted-status column with an unrecognized value still falls to the true/false branch', () => {
    const badge = { key: 'someOtherFlag', trueKey: 'a', falseKey: 'b' };
    // Not 'Y'/'N'/true/false/'true'/'false' -> isTrue is false -> falseKey branch.
    const pill = resolveStatusPill(badge, 'weird', ui);
    assert.deepEqual(pill, { status: 'N', label: 'b', tone: 'warning' });
  });
});
