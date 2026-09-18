import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5034 — locale parity for the "record unavailable" pane.
 *
 * `useUI()` echoes the key itself when the active locale has no entry, so a gap does not degrade
 * to English: the user following a dead link would see `recordNotFoundTitle` rendered raw, which
 * is a worse outcome than the blank form this ticket set out to remove. All three shipped locales
 * must therefore carry the whole set.
 */

const KEYS = [
  'recordNotFoundTitle',
  'recordNotFoundBody',
  'recordLoadFailedTitle',
  'recordLoadFailedBody',
  'backToList',
];

const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5034 — record-unavailable locale parity', () => {
  for (const [name, dictionary] of Object.entries(LOCALES)) {
    it(`${name} defines every record-unavailable key under genericLabels`, () => {
      const labels = dictionary.genericLabels ?? {};
      const missing = KEYS.filter((k) => typeof labels[k] !== 'string' || labels[k].trim() === '');
      expect(missing, `${name} is missing: ${missing.join(', ')}`).toEqual([]);
    });
  }

  // ETP-5034 (review cycle) — the copy says "record", never "document".
  // Every window renders through DetailView, including plain master data (product, warehouse,
  // tax, price-list, business-partner), where "this document does not exist" is simply wrong.
  // The first round of copy said "documento"/"document" and review asked for a guard.
  it.each(Object.entries(LOCALES))('%s never calls the record a document', (name, dictionary) => {
    const offenders = KEYS.filter((k) => /\bdocumentos?\b|\bdocuments?\b/i.test(dictionary.genericLabels[k]));
    expect(
      offenders,
      `${name} still says "document" in: ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('keeps the Spanish copy on the record noun', () => {
    // Positive side of the guard above: dropping "documento" must not have dropped the subject.
    expect(esES.genericLabels.recordNotFoundTitle.toLowerCase()).toContain('registro');
    expect(esAR.genericLabels.recordNotFoundTitle.toLowerCase()).toContain('registro');
    expect(enUS.genericLabels.recordNotFoundTitle.toLowerCase()).toContain('record');
  });

  // ETP-5034 (review cycle) — es_ES addresses the user informally (tuteo), matching the rest of
  // the Spanish UI. The first round used "usted" forms ("su rol", "Compruebe", "Inténtelo").
  it('es_ES uses tuteo, not usted', () => {
    const USTED = [/\bsu rol\b/i, /\bCompruebe\b/, /Int[ée]ntelo/, /\bvuelva\b/i, /\bRevise\b/];
    const offenders = KEYS.flatMap((k) => USTED
      .filter((re) => re.test(esES.genericLabels[k]))
      .map((re) => `${k}: ${re}`));
    expect(offenders, `es_ES still uses usted in: ${offenders.join(', ')}`).toEqual([]);
    expect(esES.genericLabels.recordNotFoundBody).toMatch(/\btu rol\b/i);
  });

  it('es_AR keeps its voseo forms', () => {
    // The two Spanish variants are deliberately NOT the same string; a merge that collapsed
    // es_AR onto the es_ES copy would silently ship peninsular imperatives to the AR tenants.
    expect(esAR.genericLabels.recordNotFoundBody).not.toBe(esES.genericLabels.recordNotFoundBody);
    expect(esAR.genericLabels.recordNotFoundBody).toMatch(/Revis[áa]|volv[ée]/);
    expect(esAR.genericLabels.recordLoadFailedBody).toMatch(/Prob[áa]|volv[ée]/);
  });

  it('does not leave the Spanish locales sharing the English text verbatim', () => {
    // A copy-paste placeholder would satisfy the parity check above while still showing
    // English to a Spanish tenant, which is treated as a bug (CLAUDE.md § i18n).
    const untranslated = KEYS.filter(
      (k) => esES.genericLabels[k] === enUS.genericLabels[k]
        && esAR.genericLabels[k] === enUS.genericLabels[k]
    );
    expect(untranslated, `still English: ${untranslated.join(', ')}`).toEqual([]);
  });
});
