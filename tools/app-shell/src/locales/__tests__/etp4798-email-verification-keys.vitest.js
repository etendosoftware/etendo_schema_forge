import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4798 — the confirm-your-email wall (VerifyEmailStep) and the onboarding
 * gate live in schema_forge_core but resolve their copy through these generic UI
 * keys. Keep every product locale explicit: the wall is the only thing between
 * registering and onboarding, so a user sitting in front of it must never be
 * addressed in the backend's raw English.
 */
const ETP_4798_KEYS = [
  'onboardingVerifyEmailTitle',
  'onboardingVerifyEmailSent',
  'onboardingVerifyEmailSentToAddress',
  'onboardingVerifyEmailHint',
  'onboardingEmailVerifyResend',
  'onboardingEmailVerifyResendCooldown',
  'onboardingEmailVerifyResending',
  'onboardingEmailVerifyResent',
  'onboardingEmailVerifyResendFailed',
  'onboardingEmailNotVerified',
  'onboardingEmailVerifyInvalid',
  'onboardingEmailVerifyFailed',
];
const LOCALES = ['en_US', 'es_ES', 'es_AR'];

describe('ETP-4798 — email confirmation UI key coverage', () => {
  const dictionaries = { en_US: enUS, es_ES: esES, es_AR: esAR };

  for (const locale of LOCALES) {
    for (const key of ETP_4798_KEYS) {
      it(`${locale}.genericLabels.${key} is a non-empty localized string`, () => {
        const value = dictionaries[locale].genericLabels?.[key];
        expect(typeof value, `${locale}.genericLabels.${key} must be a string`).toBe('string');
        expect(value.trim(), `${locale}.genericLabels.${key} must be non-empty`).not.toBe('');
      });
    }
  }

  it('uses Spanish copy (not the English fallback) for the Spanish locales', () => {
    for (const key of ETP_4798_KEYS) {
      expect(dictionaries.es_ES.genericLabels[key], key).not.toBe(dictionaries.en_US.genericLabels[key]);
      expect(dictionaries.es_AR.genericLabels[key], key).not.toBe(dictionaries.en_US.genericLabels[key]);
    }
  });

  it('keeps the {seconds} placeholder the resend cooldown counts down with', () => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale].genericLabels.onboardingEmailVerifyResendCooldown)
        .toContain('{seconds}');
    }
  });

  it('keeps the {email} placeholder the wall interpolates', () => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale].genericLabels.onboardingVerifyEmailSentToAddress)
        .toContain('{email}');
    }
  });
});
