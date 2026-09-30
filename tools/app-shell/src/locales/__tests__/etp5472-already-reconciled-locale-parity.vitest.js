import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5472 — locale parity for the already-reconciled refusals and the partial-reconcile toast.
 *
 * `translateBackendError` keeps the original English when `t(key) === key`, and `useUI()` echoes
 * the key when the active locale has no entry — so a gap in one locale silently shows the raw
 * backend text (with its internal UUID) or the bare `financeReconcileToastPartial` key. All three
 * shipped locales must carry the whole set.
 */

const KEYS = [
  'backendError.statementLineAlreadyReconciled',
  'backendError.operationAlreadyReconciled',
  'financeReconcileToastPartial',
  'backendError.draftHoldsLine',
];

const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5472 — already-reconciled / partial-reconcile locale parity', () => {
  for (const [name, dictionary] of Object.entries(LOCALES)) {
    it(`${name} defines every ETP-5472 key under genericLabels`, () => {
      const labels = dictionary.genericLabels ?? {};
      const missing = KEYS.filter((k) => typeof labels[k] !== 'string' || labels[k].trim() === '');
      expect(missing, `${name} is missing: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${name} keeps the {amount} placeholder in the partial toast`, () => {
      expect(dictionary.genericLabels.financeReconcileToastPartial).toContain('{amount}');
    });

    it(`${name} does not interpolate an id into the already-reconciled copy`, () => {
      const withPlaceholder = KEYS.slice(0, 2).filter((k) => /\{\w+\}/.test(dictionary.genericLabels[k]));
      expect(withPlaceholder, `${name} has placeholders in: ${withPlaceholder.join(', ')}`).toEqual([]);
    });
  }

  it.each(Object.entries(LOCALES))('%s carries {documentNo} exactly once in draftHoldsLine', (name, dictionary) => {
    const text = dictionary.genericLabels['backendError.draftHoldsLine'];
    expect(text.match(/\{documentNo\}/g) ?? [], name).toHaveLength(1);
    const otherPlaceholders = (text.match(/\{\w+\}/g) ?? []).filter((p) => p !== '{documentNo}');
    expect(otherPlaceholders, name).toEqual([]);
  });

  it('es_AR uses voseo and es_ES tuteo in draftHoldsLine', () => {
    const ar = esAR.genericLabels['backendError.draftHoldsLine'];
    const es = esES.genericLabels['backendError.draftHoldsLine'];
    expect(ar).toMatch(/\bRevisala\b/);
    expect(ar).not.toMatch(/Revísala/);
    expect(es).toMatch(/Revísala/);
  });

  it('does not leave the Spanish locales sharing the English text verbatim', () => {
    const untranslated = KEYS.filter(
      (k) => esES.genericLabels[k] === enUS.genericLabels[k]
        || esAR.genericLabels[k] === enUS.genericLabels[k],
    );
    expect(untranslated, `still English: ${untranslated.join(', ')}`).toEqual([]);
  });
});
