import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmailAddress,
  isValidEmailAddress,
  normalizeRecipientList,
  buildRecipientEdits,
} from '../recipientEdits.js';

// ETP-4226 — recipientEdits is the pure diff layer that turns the user-edited
// recipient set into the minimal `recipientEdits` payload sent to the backend.
// A send whose recipients are untouched MUST produce `null` so the request is
// byte-identical to the pre-feature behavior (server derives the idempotency key).

describe('normalizeEmailAddress', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(normalizeEmailAddress('  user@example.com  '), 'user@example.com');
  });

  it('lowercases only the domain, preserving the local part case', () => {
    assert.equal(normalizeEmailAddress('John.Doe@Example.COM'), 'John.Doe@example.com');
  });

  it('returns empty string for null', () => {
    assert.equal(normalizeEmailAddress(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(normalizeEmailAddress(undefined), '');
  });

  it('returns empty string for an empty/whitespace string', () => {
    assert.equal(normalizeEmailAddress(''), '');
    assert.equal(normalizeEmailAddress('   '), '');
  });

  it('returns a string without an @ unchanged (after trim)', () => {
    assert.equal(normalizeEmailAddress('  not-an-email  '), 'not-an-email');
  });

  it('splits on the LAST @ when multiple are present', () => {
    // local part keeps its first @, only the trailing domain is lowercased
    assert.equal(normalizeEmailAddress('weird@local@Domain.COM'), 'weird@local@domain.com');
  });
});

describe('isValidEmailAddress', () => {
  it('accepts a well-formed address', () => {
    assert.equal(isValidEmailAddress('user@example.com'), true);
  });

  it('accepts an address with mixed-case domain (normalized first)', () => {
    assert.equal(isValidEmailAddress('User@Example.COM'), true);
  });

  it('rejects an address with no TLD', () => {
    assert.equal(isValidEmailAddress('user@localhost'), false);
  });

  it('rejects a string with no @', () => {
    assert.equal(isValidEmailAddress('userexample.com'), false);
  });

  it('rejects an address containing spaces', () => {
    assert.equal(isValidEmailAddress('user name@example.com'), false);
  });

  it('rejects empty / null / undefined', () => {
    assert.equal(isValidEmailAddress(''), false);
    assert.equal(isValidEmailAddress(null), false);
    assert.equal(isValidEmailAddress(undefined), false);
  });
});

describe('normalizeRecipientList', () => {
  it('returns [] for null/undefined input', () => {
    assert.deepEqual(normalizeRecipientList(null), []);
    assert.deepEqual(normalizeRecipientList(undefined), []);
  });

  it('drops empty / whitespace-only entries', () => {
    assert.deepEqual(normalizeRecipientList(['a@x.com', '', '   ']), ['a@x.com']);
  });

  it('deduplicates case-insensitively, keeping the first occurrence', () => {
    assert.deepEqual(
      normalizeRecipientList(['User@Example.com', 'user@example.COM']),
      ['User@example.com'],
    );
  });

  it('preserves insertion order of distinct addresses', () => {
    assert.deepEqual(
      normalizeRecipientList(['c@x.com', 'a@x.com', 'b@x.com']),
      ['c@x.com', 'a@x.com', 'b@x.com'],
    );
  });

  it('normalizes the domain of each kept address', () => {
    assert.deepEqual(normalizeRecipientList(['User@EXAMPLE.com']), ['User@example.com']);
  });
});

describe('buildRecipientEdits', () => {
  it('returns null when final To equals base and there is no cc', () => {
    const edits = buildRecipientEdits(
      ['a@x.com', 'b@x.com'],
      { to: ['a@x.com', 'b@x.com'] },
    );
    assert.equal(edits, null);
  });

  it('returns null when final To equals base ignoring case/whitespace and no cc', () => {
    const edits = buildRecipientEdits(
      ['A@X.com'],
      { to: [' a@x.COM '] },
    );
    assert.equal(edits, null);
  });

  it('reports only additions when an address is added to To', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com', 'b@x.com'] },
    );
    assert.deepEqual(edits, { to: { add: ['b@x.com'] } });
  });

  it('reports only removals when an address is dropped from To', () => {
    const edits = buildRecipientEdits(
      ['a@x.com', 'b@x.com'],
      { to: ['a@x.com'] },
    );
    assert.deepEqual(edits, { to: { remove: ['b@x.com'] } });
  });

  it('reports both add and remove when To is changed in both directions', () => {
    const edits = buildRecipientEdits(
      ['a@x.com', 'b@x.com'],
      { to: ['a@x.com', 'c@x.com'] },
    );
    assert.deepEqual(edits, { to: { add: ['c@x.com'], remove: ['b@x.com'] } });
  });

  it('does NOT count a case-only variation of a base address as an addition', () => {
    const edits = buildRecipientEdits(
      ['user@example.com'],
      { to: ['USER@example.com'] },
    );
    assert.equal(edits, null);
  });

  it('emits cc always as add (never diffed against base)', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com'], cc: ['cc@x.com'] },
    );
    assert.deepEqual(edits, { cc: { add: ['cc@x.com'] } });
  });

  it('combines To diff and cc add', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com', 'b@x.com'], cc: ['cc@x.com'] },
    );
    assert.deepEqual(edits, {
      to: { add: ['b@x.com'] },
      cc: { add: ['cc@x.com'] },
    });
  });

  it('deduplicates within the To channel before diffing', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com', 'b@x.com', 'B@x.com'] },
    );
    assert.deepEqual(edits, { to: { add: ['b@x.com'] } });
  });

  it('deduplicates within the cc channel', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com'], cc: ['cc@x.com', 'CC@x.com'] },
    );
    assert.deepEqual(edits, { cc: { add: ['cc@x.com'] } });
  });

  it('treats missing/empty channels as no diff (null)', () => {
    assert.equal(buildRecipientEdits([], {}), null);
    assert.equal(buildRecipientEdits(null, null), null);
  });
});
