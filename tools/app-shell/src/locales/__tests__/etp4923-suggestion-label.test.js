import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-4923 — the "suggestion" indicator on reconciliation statement lines must
 * read "Con sugerencia" (es) / "With suggestion" (en), not "Sugerido"/"Sugerida"/
 * "Suggested". Both the row badge (financeReconcileBadgeSuggested) and the status
 * filter chip (financeReconcileFilterStatusSuggested) share the same state and
 * must show the same text — they had drifted apart before this fix.
 */

const KEYS = ['financeReconcileBadgeSuggested', 'financeReconcileFilterStatusSuggested'];

describe('ETP-4923 — suggestion label i18n', () => {
  let enUS;
  let esES;
  let esAR;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../../locales/en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../../locales/es_ES.json', import.meta.url), 'utf8'));
    esAR = JSON.parse(readFileSync(new URL('../../locales/es_AR.json', import.meta.url), 'utf8'));
  });

  for (const key of KEYS) {
    it(`en_US.genericLabels.${key} === "With suggestion"`, () => {
      assert.equal(enUS.genericLabels[key], 'With suggestion');
    });

    it(`es_ES.genericLabels.${key} === "Con sugerencia"`, () => {
      assert.equal(esES.genericLabels[key], 'Con sugerencia');
    });

    it(`es_AR.genericLabels.${key} === "Con sugerencia"`, () => {
      assert.equal(esAR.genericLabels[key], 'Con sugerencia');
    });
  }

  it('badge and filter chip agree with each other per locale (no drift)', () => {
    for (const dict of [enUS, esES, esAR]) {
      assert.equal(
        dict.genericLabels.financeReconcileBadgeSuggested,
        dict.genericLabels.financeReconcileFilterStatusSuggested,
      );
    }
  });
});
