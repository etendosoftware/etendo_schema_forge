import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5075 — the `Posted` domain registry (`src/lib/postedStatus.js`) resolves
 * 17 AD codes to i18n keys under `genericLabels`. All of them (the 16 new
 * failure-reason keys, plus the pre-existing `postedStatus`/`notPostedStatus`
 * reused for 'Y'/'N') must exist in every shipped locale, or `postedStatusLabel`
 * silently prints the raw key back to the user in that locale.
 *
 * Separately, ETP-5075 also reworded `backendError.invalidAccountBpAndGroup`
 * and `backendError.invalidAccountBpOnly` (they used to read as "the contact
 * is missing configuration" when the real cause is the accounting
 * schema/product/category) and added both keys to es_AR, where they were
 * previously absent entirely.
 *
 * Both key lists below are checked against all three locales through one
 * loop (`for (const [name, dict] of Object.entries(LOCALES))`), on purpose:
 * a locale-specific insertion that silently fails (wrong anchor, wrong file)
 * must fail this test for that locale specifically, without anyone having to
 * remember to add a per-locale block by hand — that is exactly how es_AR
 * ended up missing both backendError keys the first time around.
 */

const POSTED_STATUS_KEYS = [
  'postedStatus',
  'notPostedStatus',
  'postedStatusError',
  'postedStatusErrorNoCost',
  'postedStatusInvalidAccount',
  'postedStatusNotBalanced',
  'postedStatusNotConvertible',
  'postedStatusCostNotCalculated',
  'postedStatusNoAccountingDate',
  'postedStatusNoDocumentType',
  'postedStatusNoRelatedPo',
  'postedStatusDocumentLocked',
  'postedStatusPeriodClosed',
  'postedStatusTableDisabled',
  'postedStatusDocumentDisabled',
  'postedStatusDisabledBackground',
  'postedStatusPostPrepared',
  'postedStatusPendingRefresh',
];

const BACKEND_ERROR_KEYS = [
  'backendError.invalidAccountBpAndGroup',
  'backendError.invalidAccountBpOnly',
];

const LOCALE_NAMES = ['en_US', 'es_ES', 'es_AR'];

describe('ETP-5075 — postedStatus i18n keys exist in all three locales', () => {
  let LOCALES;

  before(() => {
    LOCALES = {
      en_US: JSON.parse(readFileSync(new URL('../en_US.json', import.meta.url), 'utf8')),
      es_ES: JSON.parse(readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8')),
      es_AR: JSON.parse(readFileSync(new URL('../es_AR.json', import.meta.url), 'utf8')),
    };
  });

  for (const key of POSTED_STATUS_KEYS) {
    for (const localeName of LOCALE_NAMES) {
      it(`genericLabels.${key} exists and is a non-empty string in ${localeName}`, () => {
        const dict = LOCALES[localeName];
        assert.equal(typeof dict.genericLabels[key], 'string');
        assert.ok(dict.genericLabels[key].length > 0, `${localeName}.genericLabels.${key} must not be empty`);
      });
    }
  }

  for (const key of BACKEND_ERROR_KEYS) {
    for (const localeName of LOCALE_NAMES) {
      it(`genericLabels['${key}'] exists in ${localeName}`, () => {
        const dict = LOCALES[localeName];
        assert.equal(typeof dict.genericLabels[key], 'string');
        assert.ok(dict.genericLabels[key].length > 0, `${localeName}.genericLabels['${key}'] must not be empty`);
      });
    }
  }

  it('the reworded backendError messages point at accounting configuration, not the contact', () => {
    const { en_US: enUS, es_ES: esES } = LOCALES;
    assert.match(enUS.genericLabels['backendError.invalidAccountBpAndGroup'], /accounting schema|product|category/i);
    assert.doesNotMatch(
      enUS.genericLabels['backendError.invalidAccountBpAndGroup'],
      /missing.*contact|contact.*missing/i,
    );
    assert.match(esES.genericLabels['backendError.invalidAccountBpAndGroup'], /esquema contable|producto|categor/i);
  });

  it('es_AR carries the same reworded backendError wording as es_ES (parity, no drift)', () => {
    const { es_ES: esES, es_AR: esAR } = LOCALES;
    assert.equal(
      esAR.genericLabels['backendError.invalidAccountBpAndGroup'],
      esES.genericLabels['backendError.invalidAccountBpAndGroup'],
    );
    assert.equal(
      esAR.genericLabels['backendError.invalidAccountBpOnly'],
      esES.genericLabels['backendError.invalidAccountBpOnly'],
    );
  });
});
