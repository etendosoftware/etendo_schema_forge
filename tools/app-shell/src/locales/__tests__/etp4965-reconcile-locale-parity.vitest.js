import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4965 — locale parity for the reconciliation feature area.
 *
 * `useUI()` echoes the key itself when the active locale has no entry for it, so a gap here does
 * not degrade to English — it renders the raw identifier (`financeReconcileDiffModalTitle`) on
 * screen. es_AR had drifted behind es_ES by 15 keys: the 14 `financeReconcileDiff*` strings of the
 * difference banner/modal, plus `financeReconcileAutomatchToastPartial` (the partial-batch toast
 * the automatch modal shows when some groups fail). An Argentinian tenant opening a partially
 * reconciled line saw the identifiers.
 *
 * The suite is deliberately written as a SUPERSET rule over the whole `financeReconcile*` family
 * rather than as a list of this ticket's keys: a per-ticket list only prevents the same regression
 * twice, whereas the drift itself is what keeps recurring. es_ES is the reference because it is the
 * locale the feature is authored in.
 */

const FAMILY = /^financeReconcile/;

function reconcileKeys(dictionary) {
  return Object.keys(dictionary.genericLabels ?? {}).filter((k) => FAMILY.test(k));
}

describe('ETP-4965 — financeReconcile* locale parity', () => {
  const esEsKeys = reconcileKeys(esES);

  it('has a non-trivial reconciliation key family in es_ES to compare against', () => {
    // Guards the guard: an empty reference set would make every assertion below vacuously true.
    expect(esEsKeys.length).toBeGreaterThan(50);
  });

  it('es_AR carries every financeReconcile* key es_ES has', () => {
    const inAr = new Set(reconcileKeys(esAR));
    const missing = esEsKeys.filter((k) => !inAr.has(k)).sort();
    expect(missing, `es_AR is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('en_US carries every financeReconcile* key es_ES has', () => {
    const inEn = new Set(reconcileKeys(enUS));
    const missing = esEsKeys.filter((k) => !inEn.has(k)).sort();
    expect(missing, `en_US is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('never ships a blank value for a reconciliation key in any locale', () => {
    for (const [name, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
      for (const key of reconcileKeys(dictionary)) {
        const value = dictionary.genericLabels[key];
        expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
        expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
      }
    }
  });

  // The 15 keys this ticket had to backfill, named explicitly so the failure message points at the
  // actual gap rather than only at the aggregate count.
  const BACKFILLED_KEYS = [
    'financeReconcileAutomatchToastPartial',
    'financeReconcileDiffAction',
    'financeReconcileDiffBannerTitle',
    'financeReconcileDiffConceptLabel',
    'financeReconcileDiffConceptPlaceholder',
    'financeReconcileDiffConfirm',
    'financeReconcileDiffDescriptionLabel',
    'financeReconcileDiffDescriptionPlaceholder',
    'financeReconcileDiffLeavePending',
    'financeReconcileDiffModalBody',
    'financeReconcileDiffModalTitle',
    'financeReconcileDiffRowDifference',
    'financeReconcileDiffRowMatched',
    'financeReconcileDiffRowStatement',
    'financeReconcileDiffToastSuccess',
  ];

  for (const key of BACKFILLED_KEYS) {
    it(`es_AR.genericLabels.${key} is present and localized`, () => {
      const value = esAR.genericLabels?.[key];
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
      // A Spanish locale must not be a copy of the English source string.
      expect(value).not.toBe(enUS.genericLabels?.[key]);
    });
  }

  // The two badges the left panel's status filter renders side by side. "Con diferencia" now means
  // exactly one thing — a real deviation inside tolerance — so it must stay distinct from
  // "Con sugerencia" in every locale, not collapse into a synonym.
  it('keeps the difference and suggestion labels distinct in every locale', () => {
    for (const [name, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
      const g = dictionary.genericLabels;
      expect(typeof g.financeReconcileBadgeDifference, `${name}`).toBe('string');
      expect(typeof g.financeReconcileFilterStatusDifference, `${name}`).toBe('string');
      expect(g.financeReconcileBadgeDifference).not.toBe(g.financeReconcileBadgeSuggested);
      expect(g.financeReconcileFilterStatusDifference)
        .not.toBe(g.financeReconcileFilterStatusSuggested);
    }
  });

  // New in this ticket: the action-bar notice shown when the selection does not balance exactly but
  // the gap is inside the account's tolerance. It defuses the red "Restante por conciliar", which
  // reads as an error for a state that is about to be resolved automatically. Two variants — with
  // and without a configured concept — because "will be posted to X" must not be promised when no X
  // exists yet.
  const NOTICE_KEYS = [
    'financeReconcileBarDifferenceNotice',
    'financeReconcileBarDifferenceNoticeNoConcept',
  ];

  for (const key of NOTICE_KEYS) {
    it(`provides ${key} in every locale`, () => {
      for (const [name, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
        const value = dictionary.genericLabels?.[key];
        expect(typeof value, `${name}.genericLabels.${key}`).toBe('string');
        expect(value.trim()).not.toBe('');
        expect(value).not.toBe(dictionary.genericLabels.financeReconcileBarRemaining);
      }
    });
  }

  // Also new in this ticket: the two action-specific failure titles for the un-reconcile split
  // button. The total-failure branch used to reuse `financeReconcileToastError` ("Error al
  // conciliar") — the wrong action for both Desconciliar and Reactivar. Each now names its own
  // action, and the backend-supplied cause rides underneath as the toast description.
  const FAILURE_TITLE_KEYS = [
    'financeReconcileToastOperationRemoveError',
    'financeReconcileToastOperationReactivateError',
  ];

  for (const key of FAILURE_TITLE_KEYS) {
    it(`provides ${key} in every locale`, () => {
      for (const [name, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
        const value = dictionary.genericLabels?.[key];
        expect(typeof value, `${name}.genericLabels.${key}`).toBe('string');
        expect(value.trim()).not.toBe('');
      }
      // A Spanish locale must not ship the English source string.
      expect(esES.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
      expect(esAR.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
    });
  }

  it('keeps each failure title distinct from the generic reconcile error and from each other', () => {
    for (const [name, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
      const g = dictionary.genericLabels;
      const [removeKey, reactivateKey] = FAILURE_TITLE_KEYS;
      // Collapsing either into the generic copy is exactly the bug this ticket fixed.
      expect(g[removeKey], `${name}`).not.toBe(g.financeReconcileToastError);
      expect(g[reactivateKey], `${name}`).not.toBe(g.financeReconcileToastError);
      // Desconciliar and Reactivar are different actions and must read differently.
      expect(g[removeKey], `${name}`).not.toBe(g[reactivateKey]);
    }
  });

  // The interpolation contract the call site relies on: the amount in both variants, and the
  // concept name only in the one that names it. A locale that drops a placeholder renders a
  // sentence with a hole in it.
  it('keeps the {amount} / {concept} placeholders in every locale', () => {
    for (const [name, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
      const g = dictionary.genericLabels;
      for (const key of NOTICE_KEYS) {
        expect(g[key], `${name}.${key} must interpolate {amount}`).toContain('{amount}');
      }
      expect(g.financeReconcileBarDifferenceNotice, `${name}`).toContain('{concept}');
      expect(g.financeReconcileBarDifferenceNoticeNoConcept, `${name}`).not.toContain('{concept}');
    }
  });
});
