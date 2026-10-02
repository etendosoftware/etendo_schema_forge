import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5424 — `apiFetch` now turns the browser's `TypeError('Failed to fetch')` into a
 * NetworkError whose `.message` is resolved through the app's registered translator with the
 * key `networkErrorRetry`. ~150 UI sites render `err.message` as-is, so this one entry is what
 * decides whether a dropped connection reads in Spanish or in English everywhere at once.
 *
 * A missing entry is SILENT: the translator returns the key unchanged, core reads that as
 * "untranslated" and falls back to its English default — the user sees English, not a bare
 * key, and nothing reports it. es_AR is asserted as a full, independent dictionary (it is the
 * one most likely to lag). `locales/generated/core.*.json` is gitignored build output and is
 * deliberately NOT asserted here.
 */

const KEY = 'networkErrorRetry';
const SPANISH = 'No se pudo completar la acción. Intenta nuevamente.';

describe('ETP-5424 — networkErrorRetry i18n key', () => {
  it('en_US declares the same English text as the core fallback', () => {
    expect(enUS.genericLabels?.[KEY]).toBe('Could not complete the action. Try again.');
  });

  it('es_ES declares the Spanish text', () => {
    expect(esES.genericLabels?.[KEY]).toBe(SPANISH);
  });

  it('es_AR declares the same Spanish text', () => {
    expect(esAR.genericLabels?.[KEY]).toBe(SPANISH);
  });

  it('declares the key in all three locales (no drift)', () => {
    const declaredIn = Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })
      .filter(([, dictionary]) => KEY in (dictionary.genericLabels ?? {}))
      .map(([name]) => name);
    expect(declaredIn).toEqual(['en_US', 'es_ES', 'es_AR']);
  });

  it('never leaks the browser prose into any locale', () => {
    for (const dictionary of [enUS, esES, esAR]) {
      expect(dictionary.genericLabels?.[KEY] ?? '').not.toMatch(/failed to fetch/i);
    }
  });
});
