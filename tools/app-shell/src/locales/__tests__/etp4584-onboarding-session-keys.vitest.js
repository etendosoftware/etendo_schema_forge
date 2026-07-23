import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4584 — Core onboarding components resolve these generic UI keys through
 * useUI(). Keep every product locale explicit so an authenticated user always
 * receives a localized escape action and draft-save warning.
 */
const ETP_4584_KEYS = ['logout', 'onboardingDraftSaveWarning'];
const LOCALES = ['en_US', 'es_ES', 'es_AR'];

describe('ETP-4584 — onboarding session UI key coverage', () => {
  const dictionaries = { en_US: enUS, es_ES: esES, es_AR: esAR };

  for (const locale of LOCALES) {
    for (const key of ETP_4584_KEYS) {
      it(`${locale}.genericLabels.${key} is a non-empty localized string`, () => {
        const value = dictionaries[locale].genericLabels?.[key];
        expect(typeof value, `${locale}.genericLabels.${key} must be a string`).toBe('string');
        expect(value.trim(), `${locale}.genericLabels.${key} must be non-empty`).not.toBe('');
      });
    }
  }

  it('uses Spanish copy for the Spanish locales', () => {
    expect(dictionaries.es_ES.genericLabels.logout).toBe('Cerrar sesión');
    expect(dictionaries.es_AR.genericLabels.logout).toBe('Cerrar sesión');
    expect(dictionaries.es_ES.genericLabels.onboardingDraftSaveWarning)
      .not.toBe(dictionaries.en_US.genericLabels.onboardingDraftSaveWarning);
    expect(dictionaries.es_AR.genericLabels.onboardingDraftSaveWarning)
      .not.toBe(dictionaries.en_US.genericLabels.onboardingDraftSaveWarning);
  });
});
