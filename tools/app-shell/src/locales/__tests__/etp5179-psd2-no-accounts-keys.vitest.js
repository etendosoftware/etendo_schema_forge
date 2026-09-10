import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5179 — the PSD2 "no compatible accounts" toast splits into one label per cause.
 *
 * Connecting a USD Financial Account to a bank that only exposes EUR accounts raised the same
 * generic toast as a wrong-type or an already-linked account, so the user could not tell that
 * currency was the reason. The bridge now reports WHY the list came back empty and the flow maps
 * each reason to its own label; the generic key stays as the fallback for an unknown/absent reason.
 *
 * `useUI()` echoes the key itself when the active locale has no entry, so a gap here does not
 * degrade to English — it prints `financeAccountsBankConnectionNoAccountsCurrency` on screen.
 * Hence every locale the app ships must carry all three keys.
 */

const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };

const CURRENCY_KEY = 'financeAccountsBankConnectionNoAccountsCurrency';
const NEW_KEYS = [
  CURRENCY_KEY,
  'financeAccountsBankConnectionNoAccountsType',
  'financeAccountsBankConnectionNoAccountsAllLinked',
];

/** The pre-existing generic label, still used as the fallback for an unknown reason. */
const GENERIC_KEY = 'financeAccountsBankConnectionNoAccounts';

/** Asserts a genericLabels entry is present and not blank, naming the locale on failure. */
function expectLocalizedLabel(name, dictionary, key) {
  const value = dictionary.genericLabels?.[key];
  expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
  expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
  return value;
}

describe('ETP-5179 — PSD2 empty-account-list labels', () => {
  for (const key of NEW_KEYS) {
    it(`ships ${key} in every locale`, () => {
      for (const [name, dictionary] of Object.entries(LOCALES)) {
        expectLocalizedLabel(name, dictionary, key);
      }
    });
  }

  it(`ships the fallback ${GENERIC_KEY} in every locale`, () => {
    // The mapping degrades to this key for an absent, unknown or `noAccounts` reason, so a locale
    // without it prints the raw identifier instead of a message. es_AR never received it.
    for (const [name, dictionary] of Object.entries(LOCALES)) {
      expectLocalizedLabel(name, dictionary, GENERIC_KEY);
    }
  });

  it('keeps every new label distinct from the generic one', () => {
    for (const [name, dictionary] of Object.entries(LOCALES)) {
      // Anchored on the generic label existing: comparing against an absent key would make every
      // assertion below pass vacuously (undefined !== undefined is never reported).
      const generic = expectLocalizedLabel(name, dictionary, GENERIC_KEY);
      for (const key of NEW_KEYS) {
        const value = expectLocalizedLabel(name, dictionary, key);
        expect(value, `${name}.genericLabels.${key} must not repeat ${GENERIC_KEY}`)
          .not.toBe(generic);
      }
    }
  });

  it(`interpolates {currency} exactly once in ${CURRENCY_KEY}`, () => {
    // useUI() interpolates with String.replace and a string pattern, which substitutes only the
    // FIRST occurrence — a second {currency} would render as a raw placeholder.
    for (const [name, dictionary] of Object.entries(LOCALES)) {
      const value = dictionary.genericLabels?.[CURRENCY_KEY] ?? '';
      const occurrences = value.split('{currency}').length - 1;
      expect(occurrences, `${name}.genericLabels.${CURRENCY_KEY} must contain {currency} once`)
        .toBe(1);
    }
  });

  it('does not put a placeholder in the reasons that take no parameter', () => {
    for (const [name, dictionary] of Object.entries(LOCALES)) {
      for (const key of NEW_KEYS.filter((k) => k !== CURRENCY_KEY)) {
        expect(dictionary.genericLabels?.[key] ?? '', `${name}.genericLabels.${key}`)
          .not.toContain('{');
      }
    }
  });
});
