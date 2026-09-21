import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5381 — `rectifyLinkedBadge`, the badge `InvoicePickerModal` puts on every invoice the
 * backend's chain detection found (return line → original line → its invoice).
 *
 * The key was renamed from `rectifySuggestedBadge` in the same change that stopped preselecting
 * ambiguous detections: with two or more detected invoices nothing is preselected any more, so the
 * badge is the ONLY thing left telling the user which rows the chain found. "Detected"/"Detectada"
 * read as if the app had already decided; "Related"/"Relacionada" states the relationship and
 * leaves the decision to the user.
 *
 * A rename is exactly the change that goes wrong quietly here: `useUI()` echoes the key when the
 * active locale has no entry for it (there is no locale-to-locale fallback in LocaleProvider), so
 * a half-finished rename shows the literal `rectifySuggestedBadge` inside the badge pill rather
 * than failing anything. Hence both halves are pinned — the new key must exist everywhere, the old
 * one must exist nowhere.
 *
 * es_AR is asserted alongside the other two even though the badge is not Argentina-specific:
 * es_AR carries only a small subset of the rectify-family keys, and this one is in it.
 * `locales/generated/core.*.json` is gitignored build output and is deliberately NOT asserted.
 */

const KEY = 'rectifyLinkedBadge';
const RENAMED_FROM = 'rectifySuggestedBadge';
const EN_LABEL = 'Related';
const ES_LABEL = 'Relacionada';

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5381 — rectifyLinkedBadge label', () => {
  it.each(Object.entries(DICTIONARIES))('%s declares the key with a non-empty value', (name, dictionary) => {
    const value = dictionary.genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  it('resolves where useUI looks — genericLabels, not ui', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(
        Object.keys(dictionary.genericLabels ?? {}),
        `${name} must declare ${KEY} in genericLabels, where resolveUI reads it`,
      ).toContain(KEY);
    }
  });

  it('uses the English label in en_US and the Spanish one in both Spanish locales', () => {
    expect(enUS.genericLabels[KEY]).toBe(EN_LABEL);
    expect(esES.genericLabels[KEY]).toBe(ES_LABEL);
    expect(esAR.genericLabels[KEY]).toBe(ES_LABEL);
  });

  it('is actually translated in the Spanish locales, not a copy of the English string', () => {
    for (const name of ['es_ES', 'es_AR']) {
      expect(DICTIONARIES[name].genericLabels[KEY]).not.toBe(enUS.genericLabels[KEY]);
    }
  });

  // The other half of the rename. A leftover entry is not harmless: it keeps a dead key alive for
  // a future reader to copy, and it hides the fact that some call site is still asking for it.
  it('no locale still ships the key it was renamed from', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(
        Object.keys(dictionary.genericLabels ?? {}),
        `${name} must no longer declare ${RENAMED_FROM}`,
      ).not.toContain(RENAMED_FROM);
    }
  });

  // The wording carries the point of the change, so a silent revert to the old copy has to fail.
  it('never carries the old "already decided" wording', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(dictionary.genericLabels[KEY], name).not.toBe('Detected');
      expect(dictionary.genericLabels[KEY], name).not.toBe('Detectada');
    }
  });

  // The badge sits inside a pill a few characters wide, next to the document number and the date.
  // A sentence there wraps the row; this is the cheapest guard against one being pasted in.
  it('stays short enough for the pill it renders in', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(dictionary.genericLabels[KEY].length, `${name} badge label is too long for the pill`)
        .toBeLessThanOrEqual(16);
    }
  });
});
