import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';

/**
 * ETP-5455 — the keys of the /account session-expired state, resolved through useUI(). A missing
 * one makes useUI() echo the key itself, so the raw identifier would render in the one place that
 * tells the user how to get back in:
 *
 *  - `accountSessionExpired` replaces both the security section's "could not be loaded" and the
 *    subscription's "couldn't load your subscription" when either request answers 401. Neither is
 *    down; the session is, and Retry can never succeed.
 *  - `accountSignInAgain` labels the only action that helps.
 *
 * Only en_US and es_ES: the rest of the /account copy is not in es_AR either, which falls back.
 */
const ETP_5455_KEYS = ['accountSessionExpired', 'accountSignInAgain'];
const DICTIONARIES = { en_US: enUS, es_ES: esES };

describe('ETP-5455 — /account session-expired keys', () => {
  for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
    for (const key of ETP_5455_KEYS) {
      it(`${locale} defines ${key}`, () => {
        const value = dictionary.genericLabels?.[key];
        expect(typeof value).toBe('string');
        expect(value.trim()).not.toBe('');
      });
    }
  }

  it('is not the same sentence in both locales', () => {
    for (const key of ETP_5455_KEYS) {
      expect(esES.genericLabels[key]).not.toBe(enUS.genericLabels[key]);
    }
  });
});
