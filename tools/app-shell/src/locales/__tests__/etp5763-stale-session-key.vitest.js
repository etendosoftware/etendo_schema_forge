import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5763 — `apiFetch` rejects a request of a superseded session (the same user working in two
 * tabs) with an `AbortError` whose `.message` used to be the hardcoded English sentence 'The
 * request belongs to a superseded session.'. ~150 UI sites render `err.message` as-is, so that
 * English-only sentence showed up in the middle of a Spanish interface.
 *
 * The message now goes through the app's registered translator with the key `staleSession`,
 * exactly like ETP-5424's `networkErrorRetry` — so this ONE entry decides whether the notice
 * reads in Spanish or in English everywhere at once.
 *
 * A missing entry is SILENT: the translator returns the key unchanged, core reads that as
 * "untranslated" and falls back to its English default — the user sees English, not a bare key,
 * and nothing reports it. es_AR is asserted as a full, independent dictionary (it is the one
 * most likely to lag). `locales/generated/core.*.json` is gitignored build output and is
 * deliberately NOT asserted here.
 */

const KEY = 'staleSession';
const SPANISH_ES = 'Tu sesión se abrió en otra pestaña o ventana. Recarga la página para continuar.';
const SPANISH_AR = 'Tu sesión se abrió en otra pestaña o ventana. Recargá la página para continuar.';
const ENGLISH = 'Your session was opened in another tab or window. Reload the page to continue.';

describe('ETP-5763 — staleSession i18n key', () => {
  it('en_US declares the same English text as the core fallback', () => {
    expect(enUS.genericLabels?.[KEY]).toBe(ENGLISH);
  });

  it('es_ES declares the Spanish text', () => {
    expect(esES.genericLabels?.[KEY]).toBe(SPANISH_ES);
  });

  it('es_AR declares the Argentine Spanish text', () => {
    expect(esAR.genericLabels?.[KEY]).toBe(SPANISH_AR);
  });

  it('declares the key in all three locales (no drift)', () => {
    const declaredIn = Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })
      .filter(([, dictionary]) => KEY in (dictionary.genericLabels ?? {}))
      .map(([name]) => name);
    expect(declaredIn).toEqual(['en_US', 'es_ES', 'es_AR']);
  });

  it('the Spanish texts are actually translated, not the English one copied over', () => {
    expect(esES.genericLabels?.[KEY]).not.toBe(ENGLISH);
    expect(esAR.genericLabels?.[KEY]).not.toBe(ENGLISH);
  });

  it('every locale explains what to do — reload the page', () => {
    // "Recarga" (es_ES) and "Recargá" (es_AR, voseo) and "Reload" (en_US).
    for (const dictionary of [enUS, esES, esAR]) {
      expect(dictionary.genericLabels?.[KEY] ?? '').toMatch(/recarg|reload/i);
    }
  });

  it('never leaks the old hardcoded English prose into any locale', () => {
    for (const dictionary of [enUS, esES, esAR]) {
      expect(dictionary.genericLabels?.[KEY] ?? '').not.toMatch(/superseded session/i);
    }
  });
});
