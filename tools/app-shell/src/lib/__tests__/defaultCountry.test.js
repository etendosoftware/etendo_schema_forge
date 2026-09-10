import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COUNTRY_LABEL_ALIASES,
  DEFAULT_COUNTRY_LIMIT,
  DEFAULT_COUNTRY_QUERY,
  findDefaultCountryOption,
  resolveDefaultCountryId,
} from '../defaultCountry.js';

const ES_ID = 'ES-ID';
const FR_ID = 'FR-ID';

/** Catalog as the Spanish UI receives it — the selector labels are translated. */
const SPANISH_CATALOG = [
  { id: FR_ID, label: 'Francia' },
  { id: ES_ID, label: 'España' },
];

/** Same catalog served to an English session, where the alias must still hit. */
const ENGLISH_CATALOG = [
  { id: FR_ID, label: 'France' },
  { id: ES_ID, label: 'Spain' },
];

describe('findDefaultCountryOption', () => {
  it('resolves the Spanish label', () => {
    assert.deepEqual(findDefaultCountryOption(SPANISH_CATALOG), { id: ES_ID, label: 'España' });
  });

  it('resolves the English label — the same default in an en_US session', () => {
    assert.deepEqual(findDefaultCountryOption(ENGLISH_CATALOG), { id: ES_ID, label: 'Spain' });
  });

  it('resolves a label decorated with its ISO code', () => {
    const decorated = [{ id: ES_ID, label: 'ESPAÑA (ES)' }];
    assert.equal(findDefaultCountryOption(decorated)?.id, ES_ID);
  });

  it('returns null when the catalog holds no default country', () => {
    assert.equal(findDefaultCountryOption([{ id: FR_ID, label: 'Francia' }]), null);
  });

  it('returns null for an empty, missing or non-array catalog', () => {
    // The options arrive asynchronously, so every caller renders at least once
    // before they exist. Guessing an id there would preselect a wrong country.
    assert.equal(findDefaultCountryOption([]), null);
    assert.equal(findDefaultCountryOption(undefined), null);
    assert.equal(findDefaultCountryOption(null), null);
    assert.equal(findDefaultCountryOption('not-a-list'), null);
  });

  it('prefers the first alias when a catalog somehow carries both spellings', () => {
    const both = [
      { id: 'EN-DUP', label: 'Spain' },
      { id: ES_ID, label: 'España' },
    ];
    assert.equal(findDefaultCountryOption(both).id, ES_ID);
  });
});

describe('resolveDefaultCountryId', () => {
  it('reduces the match to its id', () => {
    assert.equal(resolveDefaultCountryId(SPANISH_CATALOG), ES_ID);
  });

  it('returns an empty string when unresolved, so the field stays untouched', () => {
    // '' is what the form field already holds: the caller can write it back
    // without having to special-case a null.
    assert.equal(resolveDefaultCountryId([{ id: FR_ID, label: 'Francia' }]), '');
    assert.equal(resolveDefaultCountryId([]), '');
  });
});

describe('default country constants', () => {
  it('queries the selector by the untranslated core name', () => {
    // `q` filters on C_Country.NAME, which is English seed data in every install.
    assert.equal(DEFAULT_COUNTRY_QUERY, 'Spain');
    assert.equal(DEFAULT_COUNTRY_LIMIT, 5);
  });

  it('carries both spellings, Spanish first', () => {
    assert.deepEqual(DEFAULT_COUNTRY_LABEL_ALIASES, ['España', 'Spain']);
  });
});
