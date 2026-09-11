import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5113 — `financeAccountsColCurrency`, the header of the Cuentas list's new "Moneda"
 * column and, reused verbatim, the label of the same column inside the advanced
 * ("by conditions") filter.
 *
 * It is declared as `gridLabelKey` in `artifacts/financial-account/decisions.json` and as
 * `labelKey` in `accountAdvancedFilter.js`'s COLUMN_SPEC precisely so no user-visible string
 * is versioned in either place — which makes this dictionary entry the only thing standing
 * between the user and a raw identifier: `useUI()` echoes the key when the active locale has
 * no entry for it (there is no locale-to-locale fallback in LocaleProvider), so the header
 * would read `financeAccountsColCurrency`.
 *
 * es_AR is asserted alongside the other two for that reason, even though the key is not
 * Argentina-specific. `locales/generated/core.*.json` is gitignored build output and is
 * deliberately NOT asserted here.
 */

const KEY = 'financeAccountsColCurrency';
const ES_LABEL = 'Moneda';
const EN_LABEL = 'Currency';

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };

describe('ETP-5113 — financeAccountsColCurrency label', () => {
  it.each(Object.entries(DICTIONARIES))('%s declares the key with a non-empty value', (name, dictionary) => {
    const value = dictionary.genericLabels?.[KEY];
    expect(typeof value, `${name}.genericLabels.${KEY} must be a string`).toBe('string');
    expect(value.trim(), `${name}.genericLabels.${KEY} must be non-empty`).not.toBe('');
  });

  it('uses the Spanish label in both Spanish locales', () => {
    expect(esES.genericLabels[KEY]).toBe(ES_LABEL);
    expect(esAR.genericLabels[KEY]).toBe(ES_LABEL);
  });

  it('uses the English label in en_US', () => {
    expect(enUS.genericLabels[KEY]).toBe(EN_LABEL);
  });

  // The column header and the filter column label are the same string on purpose: the funnel
  // must name its columns exactly as the grid does, so the two must not drift into two keys.
  it('sits next to the other Cuentas column headers, in genericLabels', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(
        Object.keys(dictionary.genericLabels ?? {}),
        `${name} must declare the key in genericLabels, where useUI resolves it`,
      ).toContain(KEY);
      // A sibling key from the same list, to pin the group it belongs to.
      expect(dictionary.genericLabels.financeAccountsColBalance, name).toBeTruthy();
    }
  });

  it('never carries a stray currency symbol or ISO code as the header', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      const value = dictionary.genericLabels[KEY];
      expect(value, `${name}.genericLabels.${KEY} must be a column name, not a value`)
        .not.toMatch(/[€$]|\bEUR\b|\bUSD\b/);
    }
  });
});
