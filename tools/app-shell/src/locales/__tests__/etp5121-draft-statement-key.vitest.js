import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5121 — the draft-statement reconciliation guard must be translated in every locale.
 *
 * The backend answers 409 with the English sentence
 * `The bank statement is in draft; process it before reconciling its lines` from three write paths
 * (`reconcileGroup`, `ReconciliationFlowSupport.prepareGroup`, `ReconciliationDifferenceSupport`).
 * `backendErrors.js` maps it to `backendError.statementDraftNotReconcilable`, and
 * `translateBackendError` GUARDS on the translation being present: when `t(key) === key` it returns
 * the ORIGINAL message. So a missing locale entry does not render the raw identifier — it silently
 * renders the English sentence, which is exactly the failure mode nobody notices in review.
 *
 * WHY THIS FILE HAS TO EXIST: the only reconciliation locale-parity suite
 * (`etp4965-reconcile-locale-parity.vitest.js`) is scoped to `/^financeReconcile/` and does not
 * cover the `backendError.*` family at all. That family has already drifted badly — en_US and es_ES
 * carry 87 `backendError.*` keys while es_AR carries only 40 (86 / 39 before this ticket) — so a
 * missing es_AR entry fails nothing today. Until a superset rule exists for `backendError.*`, each
 * new key needs its own pin.
 */

const KEY = 'backendError.statementDraftNotReconcilable';

const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe(`ETP-5121 — ${KEY} locale coverage`, () => {
  for (const [name, dictionary] of Object.entries(LOCALES)) {
    it(`${name} ships the key with a non-empty string value`, () => {
      const value = dictionary.genericLabels?.[KEY];
      expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
      expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
    });
  }

  for (const name of ['es_ES', 'es_AR']) {
    it(`${name} is actually translated, not a copy of the English string`, () => {
      // A Spanish locale carrying the en_US value is indistinguishable from having no entry at all
      // from the user's point of view — they read English either way.
      expect(LOCALES[name].genericLabels?.[KEY]).not.toBe(enUS.genericLabels?.[KEY]);
    });
  }

  it('never carries the raw backend sentence as its value in any locale', () => {
    // The sentence the backend sends. If a locale ever "translates" the key to the literal the
    // mapping exists to replace, the mapping has become a no-op.
    const RAW = 'The bank statement is in draft; process it before reconciling its lines';
    for (const [name, dictionary] of Object.entries(LOCALES)) {
      expect(dictionary.genericLabels?.[KEY], `${name}`).not.toBe(RAW);
    }
  });

  it('stays distinct from the other bank-statement lifecycle refusals', () => {
    // ETP-4921 added two neighbouring guards. Collapsing this one into either of them would tell
    // the user the wrong thing: those two are about MODIFYING or REACTIVATING a statement, this one
    // is about RECONCILING a line of a statement that is already a draft.
    for (const [name, dictionary] of Object.entries(LOCALES)) {
      const g = dictionary.genericLabels ?? {};
      expect(g[KEY], `${name}`).not.toBe(g['backendError.statementNotDraft']);
      expect(g[KEY], `${name}`).not.toBe(g['backendError.statementNotProcessed']);
    }
  });
});
