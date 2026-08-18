import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4665 — Core resolves these keys through useUI() when a field exceeds the
 * AD column it is written to, and when provisioning fails with an unresolved AD
 * message key such as "@CreateClientFailed@". A missing key makes useUI() echo
 * the key itself, which is exactly the raw-identifier-on-screen bug this ticket
 * fixes — so every product locale must carry all of them.
 */
const ETP_4665_KEYS = [
  'onboardingFieldTooLong',
  'onboardingCreateClientFailed',
  'onboardingCreateOrgFailed',
  'onboardingDuplicateClient',
];
const LOCALES = ['en_US', 'es_ES', 'es_AR'];

describe('ETP-4665 — onboarding length/error UI key coverage', () => {
  const dictionaries = { en_US: enUS, es_ES: esES, es_AR: esAR };

  for (const locale of LOCALES) {
    for (const key of ETP_4665_KEYS) {
      it(`${locale}.genericLabels.${key} is a non-empty localized string`, () => {
        const value = dictionaries[locale].genericLabels?.[key];
        expect(typeof value, `${locale}.genericLabels.${key} must be a string`).toBe('string');
        expect(value.trim(), `${locale}.genericLabels.${key} must be non-empty`).not.toBe('');
      });
    }
  }

  it('keeps the {max} placeholder so the actual limit is interpolated', () => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale].genericLabels.onboardingFieldTooLong).toContain('{max}');
    }
  });

  it('never leaks a raw AD message key into the copy', () => {
    for (const locale of LOCALES) {
      for (const key of ETP_4665_KEYS) {
        expect(dictionaries[locale].genericLabels[key]).not.toMatch(/@\w+@/);
      }
    }
  });

  it('uses Spanish copy for the Spanish locales', () => {
    for (const key of ETP_4665_KEYS) {
      expect(dictionaries.es_ES.genericLabels[key]).not.toBe(dictionaries.en_US.genericLabels[key]);
      expect(dictionaries.es_AR.genericLabels[key]).not.toBe(dictionaries.en_US.genericLabels[key]);
    }
  });
});
