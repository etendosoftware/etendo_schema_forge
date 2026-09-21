import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';
import { normalizeImportDate } from '../../lib/importDateCell.js';

/**
 * ETP-5350 — the Product import's cost columns: the cost itself and its starting date, both
 * rows of M_Costing.
 *
 * Two families, both resolved through `useUI()`, which echoes the KEY when the active locale
 * has no entry for it (there is no locale-to-locale fallback in LocaleProvider):
 *
 *  - `importHeader*` / `importExample*` — what the DOWNLOADED TEMPLATE prints. A missing entry
 *    writes the raw key as a column header, and a header nobody can read back is a template
 *    that does not round-trip.
 *  - `importError*` — the three costing mistakes the row validator reports during the review.
 *
 * es_AR is asserted alongside the other two even though none of these is Argentina-specific:
 * it is a full, independent dictionary, and it is the locale most likely to lag.
 * `locales/generated/core.*.json` is gitignored build output and is deliberately NOT asserted.
 */

const TEMPLATE_KEYS = [
  'importHeaderCost',
  'importHeaderCostStartingDate',
  'importExampleProductCost',
  'importExampleProductCostStartingDate',
];
const ERROR_KEYS = [
  'importErrorInvalidCost',
  'importErrorNegativeCost',
  'importErrorInvalidDate',
  'importErrorStartingDateWithoutCost',
];
const ALL_KEYS = [...TEMPLATE_KEYS, ...ERROR_KEYS];

/** The errors whose message is useless without the offending cell interpolated into it. */
const VALUE_KEYS = ['importErrorInvalidCost', 'importErrorNegativeCost', 'importErrorInvalidDate'];

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5350 — product cost import i18n keys', () => {
  it.each(Object.entries(DICTIONARIES))(
    '%s declares every key in genericLabels with a non-empty value',
    (name, dictionary) => {
      for (const key of ALL_KEYS) {
        const value = dictionary.genericLabels?.[key];
        expect(typeof value, `${name}.genericLabels['${key}'] must be a string`).toBe('string');
        expect(value.trim(), `${name}.genericLabels['${key}'] must be non-empty`).not.toBe('');
      }
    },
  );

  it('declares the same set of keys in all three locales (no drift)', () => {
    for (const key of ALL_KEYS) {
      const declaredIn = Object.entries(DICTIONARIES)
        .filter(([, dictionary]) => key in (dictionary.genericLabels ?? {}))
        .map(([name]) => name);
      expect(declaredIn, `'${key}' must exist in every locale`)
        .toEqual(['en_US', 'es_ES', 'es_AR']);
    }
  });

  it('translates the error messages rather than copying the English text', () => {
    // The example values are exempt: an ISO-ish date is the same string in every locale, and
    // the amount differs only by its decimal separator, which is asserted on its own below.
    for (const key of ERROR_KEYS) {
      expect(esES.genericLabels[key], `es_ES['${key}'] is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
      expect(esAR.genericLabels[key], `es_AR['${key}'] is still the English text`)
        .not.toBe(enUS.genericLabels[key]);
    }
  });

  it('keeps the {value} placeholder in every locale', () => {
    // `useUI` interpolates by literal `{value}` substitution and leaves the sentence untouched
    // when the placeholder is absent, so a translation that drops it reads "el coste "" no es
    // válido" and the user is never told WHICH cell is wrong.
    for (const key of VALUE_KEYS) {
      for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
        expect(dictionary.genericLabels[key], `${name}['${key}'] must interpolate {value}`)
          .toContain('{value}');
      }
    }
  });

  it('writes the example amount with each locale\'s own decimal separator', () => {
    // The example row is what the user overwrites. Handing a Spanish user `7.40` teaches them
    // a separator `parseImportNumber` would then have to guess about.
    expect(enUS.genericLabels.importExampleProductCost).toBe('7.40');
    expect(esES.genericLabels.importExampleProductCost).toBe('7,40');
    expect(esAR.genericLabels.importExampleProductCost).toBe('7,40');
  });

  it('writes an example date every locale\'s own parser reads back as the same day', () => {
    // Stronger than matching a shape, and it has to be: `normalizeImportDate` assumes day-first
    // for EVERY separated form, in every locale. So the English example cannot be the month-first
    // `01/15/2026` an English reader would expect — the parser would read month 15 and reject its
    // own template. It is ISO instead: unambiguous, accepted, and visibly different from the
    // Spanish one, which is what the sibling exampleKey guard requires of a localized value.
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      const raw = dictionary.genericLabels.importExampleProductCostStartingDate;
      expect(normalizeImportDate(raw), `${name} example date "${raw}" must parse to 2026-01-01`)
        .toBe('2026-01-01');
    }
  });
});
