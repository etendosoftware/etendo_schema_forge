import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_ORDER, compareStatusCodes } from '../statusBadge.js';

// Regression coverage for ETP-4696: the "All statuses" dropdown must render
// in a fixed order regardless of the arrival order of its two data sources
// (in-memory rows vs. the uncached backend distinct-values fetch).

describe('compareStatusCodes (ETP-4696 — stable status dropdown order)', () => {
  it('orders known codes by their fixed STATUS_ORDER position', () => {
    const shuffled = ['VO', 'DR', 'CO', 'IP', 'CL', 'RPAP'];
    const sorted = shuffled.slice().sort(compareStatusCodes);
    const expected = STATUS_ORDER.filter((c) => shuffled.includes(c));
    assert.deepEqual(sorted, expected);
  });

  it('produces the same order no matter the input order (idempotent regardless of arrival order)', () => {
    const a = ['CL', 'DR', 'VO', 'IP', 'CO'];
    const b = ['VO', 'IP', 'CO', 'CL', 'DR'];
    assert.deepEqual(a.slice().sort(compareStatusCodes), b.slice().sort(compareStatusCodes));
  });

  it('is case-insensitive', () => {
    const mixed = ['vo', 'DR', 'Co', 'ip'];
    const sorted = mixed.slice().sort(compareStatusCodes);
    assert.deepEqual(sorted.map((c) => c.toUpperCase()), ['DR', 'IP', 'CO', 'VO']);
  });

  it('pushes unknown codes after all known ones', () => {
    const codes = ['ZZZ_UNKNOWN', 'DR', 'AAA_UNKNOWN'];
    const sorted = codes.slice().sort(compareStatusCodes);
    assert.equal(sorted[0], 'DR');
    assert.deepEqual(sorted.slice(1), ['AAA_UNKNOWN', 'ZZZ_UNKNOWN']);
  });

  it('keeps unknown codes stable and alphabetical relative to each other', () => {
    const codes = ['UNKNOWN_B', 'UNKNOWN_A', 'UNKNOWN_C'];
    const sorted = codes.slice().sort(compareStatusCodes);
    assert.deepEqual(sorted, ['UNKNOWN_A', 'UNKNOWN_B', 'UNKNOWN_C']);
  });

  it('treats boolean-derived codes (true/false) consistently with Draft/Completed buckets', () => {
    const codes = ['true', 'false'];
    const sorted = codes.slice().sort(compareStatusCodes);
    assert.deepEqual(sorted, ['false', 'true']);
  });
});
