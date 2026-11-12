// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4664 — RegisterStep/LoginStep (schema_forge_core) resolve backend error
 * codes through AUTH_ERROR_UI_KEYS into these generic UI keys. Keep every
 * product locale explicit so a register/login failure is never shown in the
 * backend's raw English text regardless of the active language.
 *
 * ETP-5763 — the superseded-session error (the same user working with
 * Etendo Go in two tabs) resolves its message through the app's registered
 * translator with the key `staleSession`. It used to carry the hardcoded
 * English sentence 'The request belongs to a superseded session.', which
 * ~150 UI sites render as-is — so an English-only sentence showed up in the
 * middle of a Spanish interface. A missing entry is SILENT: the translator
 * returns the key unchanged, core reads that as "untranslated" and falls
 * back to its English default, so the user sees English and nothing reports
 * it.
 */
const ETP_4664_KEYS = [
  'onboardingInvalidRequest',
  'onboardingRegisterMissingFields',
  'onboardingRegisterEmptyFields',
  'onboardingInvalidEmailFormat',
  'onboardingEmailAlreadyRegistered',
  'onboardingRegisterServerError',
  'onboardingLoginMissingFields',
  'onboardingLoginServerError',
];
const LOCALES = ['en_US', 'es_ES', 'es_AR'];

// ETP-5763
const STALE_SESSION_KEY = 'staleSession';
const STALE_SESSION_EN = 'Your session was opened in another tab or window. Reload the page to continue.';
const STALE_SESSION_ES = 'Tu sesión se abrió en otra pestaña o ventana. Recarga la página para continuar.';
const STALE_SESSION_AR = 'Tu sesión se abrió en otra pestaña o ventana. Recargá la página para continuar.';

describe('ETP-4664 — register/login error UI key coverage', () => {
  const dictionaries = { en_US: enUS, es_ES: esES, es_AR: esAR };

  for (const locale of LOCALES) {
    for (const key of ETP_4664_KEYS) {
      it(`${locale}.genericLabels.${key} is a non-empty localized string`, () => {
        const value = dictionaries[locale].genericLabels?.[key];
        expect(typeof value, `${locale}.genericLabels.${key} must be a string`).toBe('string');
        expect(value.trim(), `${locale}.genericLabels.${key} must be non-empty`).not.toBe('');
      });
    }
  }

  it('uses Spanish copy (not the English fallback) for the Spanish locales', () => {
    for (const key of ETP_4664_KEYS) {
      expect(dictionaries.es_ES.genericLabels[key], key).not.toBe(dictionaries.en_US.genericLabels[key]);
      expect(dictionaries.es_AR.genericLabels[key], key).not.toBe(dictionaries.en_US.genericLabels[key]);
    }
  });
});

describe('ETP-5763 — staleSession i18n key', () => {
  const dictionaries = { en_US: enUS, es_ES: esES, es_AR: esAR };

  it('en_US declares the same English text as the core fallback', () => {
    expect(dictionaries.en_US.genericLabels?.[STALE_SESSION_KEY]).toBe(STALE_SESSION_EN);
  });

  it('es_ES declares the Spanish text', () => {
    expect(dictionaries.es_ES.genericLabels?.[STALE_SESSION_KEY]).toBe(STALE_SESSION_ES);
  });

  it('es_AR declares the Argentine Spanish text', () => {
    expect(dictionaries.es_AR.genericLabels?.[STALE_SESSION_KEY]).toBe(STALE_SESSION_AR);
  });

  it('declares the key in all three locales (no drift)', () => {
    const declaredIn = Object.entries(dictionaries)
      .filter(([, dictionary]) => STALE_SESSION_KEY in (dictionary.genericLabels ?? {}))
      .map(([name]) => name);
    expect(declaredIn).toEqual(['en_US', 'es_ES', 'es_AR']);
  });

  it('the Spanish texts are actually translated, not the English one copied over', () => {
    expect(dictionaries.es_ES.genericLabels?.[STALE_SESSION_KEY]).not.toBe(STALE_SESSION_EN);
    expect(dictionaries.es_AR.genericLabels?.[STALE_SESSION_KEY]).not.toBe(STALE_SESSION_EN);
  });

  it('every locale explains what to do — reload the page', () => {
    // "Recarga" (es_ES), "Recargá" (es_AR, voseo) and "Reload" (en_US).
    for (const dictionary of Object.values(dictionaries)) {
      expect(dictionary.genericLabels?.[STALE_SESSION_KEY] ?? '').toMatch(/recarg|reload/i);
    }
  });

  it('never leaks the old hardcoded English prose into any locale', () => {
    for (const dictionary of Object.values(dictionaries)) {
      expect(dictionary.genericLabels?.[STALE_SESSION_KEY] ?? '').not.toMatch(/superseded session/i);
    }
  });
});
