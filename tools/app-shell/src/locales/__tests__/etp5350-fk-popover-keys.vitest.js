import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5350 — the unresolved-foreign-key popover in the import review queue.
 *
 * ETP-5223 translated the engine's error messages, the review grid's headers and the mapping
 * editor's captions. These four strings were written inline in `FkMismatchCell` and stayed
 * English in every session — and the popover is exactly where a user lands to fix the row that
 * failed, so it was the worst place left.
 *
 * `ImportReviewQueue` compiles English defaults, so a missing entry degrades SILENTLY: the
 * popover renders, in English, inside a Spanish dialog. Nothing throws.
 */
const KEYS = [
  'importFkSearchPlaceholder',
  'importFkSearching',
  'importFkNoMatches',
  'importFkUseTyped',
];
const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const PAIRS = Object.keys(DICTIONARIES).flatMap((name) => KEYS.map((key) => [name, key]));

describe('ETP-5350 — the FK popover captions', () => {
  it.each(PAIRS)('%s declares %s with a non-empty value', (name, key) => {
    const value = DICTIONARIES[name].genericLabels?.[key];
    expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
  });

  it.each(KEYS.flatMap((key) => ['es_ES', 'es_AR'].map((name) => [name, key])))(
    '%s translates %s rather than leaving it in English',
    (name, key) => {
      expect(DICTIONARIES[name].genericLabels[key]).not.toBe(enUS.genericLabels[key]);
    },
  );

  // `formatTemplate` fills `{value}` with what the user typed. Lose the marker and the menu
  // item offers to use nothing; `String.replace` with a string pattern also substitutes only
  // the FIRST occurrence, so a repeat would render literally.
  it.each(Object.keys(DICTIONARIES))('%s names the typed value exactly once in fkUseTyped', (name) => {
    const value = DICTIONARIES[name].genericLabels.importFkUseTyped;
    expect(value.split('{value}').length - 1, `${name}.importFkUseTyped`).toBe(1);
  });

  // The three captions that are not templates take no interpolation at all.
  it.each(KEYS.filter((k) => k !== 'importFkUseTyped')
    .flatMap((key) => Object.keys(DICTIONARIES).map((name) => [name, key])))(
    '%s carries no interpolation marker in %s',
    (name, key) => {
      expect(DICTIONARIES[name].genericLabels[key]).not.toMatch(/\{[a-zA-Z]+\}|%s|%\d/);
    },
  );

  // es_AR is voseo throughout this app ("Guardá", "Confirmá", "Abrilo"). Only one of these four
  // is imperative, and it is the one that has to differ; the rest are infinitives or a gerund
  // and are deliberately identical in both, so this pins the ONE that must not be copied over.
  it('uses the Argentine imperative where the two Spanish locales must differ', () => {
    expect(esAR.genericLabels.importFkNoMatches).not.toBe(esES.genericLabels.importFkNoMatches);
    expect(esES.genericLabels.importFkNoMatches).toMatch(/Escribe/);
    expect(esAR.genericLabels.importFkNoMatches).toMatch(/Escribí/);
  });
});
