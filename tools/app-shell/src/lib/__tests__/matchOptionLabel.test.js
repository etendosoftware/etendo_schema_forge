import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchOptionByLabel, normalizeLabel } from '../matchOptionLabel.js';

const COUNTRIES = [
  { id: 'ES-ID', label: 'España' },
  { id: 'FR-ID', label: 'Francia' },
  { id: 'US-ID', label: 'Estados Unidos' },
];

describe('normalizeLabel', () => {
  it('strips accents, case and redundant whitespace', () => {
    assert.equal(normalizeLabel('  ESPAÑA  '), 'espana');
    assert.equal(normalizeLabel('Estados   Unidos'), 'estados unidos');
  });

  it('returns an empty string for nullish input', () => {
    assert.equal(normalizeLabel(null), '');
    assert.equal(normalizeLabel(undefined), '');
  });
});

describe('matchOptionByLabel', () => {
  it('matches an exact label', () => {
    assert.equal(matchOptionByLabel(COUNTRIES, 'Francia'), 'FR-ID');
  });

  it('matches ignoring case and accents — the OCR reads what is printed', () => {
    assert.equal(matchOptionByLabel(COUNTRIES, 'ESPANA'), 'ES-ID');
    assert.equal(matchOptionByLabel(COUNTRIES, 'españa'), 'ES-ID');
    assert.equal(matchOptionByLabel(COUNTRIES, '  España '), 'ES-ID');
  });

  it('matches when the option label carries a suffix the document does not', () => {
    assert.equal(matchOptionByLabel([{ id: 'ES-ID', label: 'ESPAÑA (ES)' }], 'España'), 'ES-ID');
  });

  it('matches when the document carries a suffix the option label does not', () => {
    assert.equal(matchOptionByLabel(COUNTRIES, 'Francia (FR)'), 'FR-ID');
  });

  it('returns empty when nothing matches, rather than guessing', () => {
    assert.equal(matchOptionByLabel(COUNTRIES, 'Portugal'), '');
  });

  it('refuses to prefix-match against a very short option label', () => {
    // 'ES' would otherwise swallow every value starting with those two letters.
    assert.equal(matchOptionByLabel([{ id: 'x', label: 'ES' }], 'Estados Unidos'), '');
  });

  it('ignores a needle too short to be meaningful', () => {
    assert.equal(matchOptionByLabel(COUNTRIES, 'E'), '');
    assert.equal(matchOptionByLabel(COUNTRIES, ''), '');
    assert.equal(matchOptionByLabel(COUNTRIES, null), '');
  });

  it('tolerates a missing or non-array options list', () => {
    assert.equal(matchOptionByLabel(undefined, 'España'), '');
    assert.equal(matchOptionByLabel(null, 'España'), '');
    assert.equal(matchOptionByLabel({}, 'España'), '');
  });

  it('prefers the exact match over an earlier prefix candidate', () => {
    const options = [
      { id: 'long', label: 'Estados Unidos de America' },
      { id: 'exact', label: 'Estados Unidos' },
    ];
    assert.equal(matchOptionByLabel(options, 'Estados Unidos'), 'exact');
  });
});
