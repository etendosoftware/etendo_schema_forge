import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4664 — RegisterStep/LoginStep (schema_forge_core) resolve backend error
 * codes through AUTH_ERROR_UI_KEYS into these generic UI keys. Keep every
 * product locale explicit so a register/login failure is never shown in the
 * backend's raw English text regardless of the active language.
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
