import {
  ibanPrefixFor, expectedIbanLength, validateIbanForCountry, countryLacksIbanConfig,
} from '../countryIban.js';

const SPAIN = { id: '106', name: 'Spain', iso: 'ES', ibanPrefix: 'ES', ibanLength: 24 };
const ITALY = { id: '107', name: 'Italy', iso: 'IT', ibanPrefix: 'IT', ibanLength: 27 };
// ~198 of 243 countries have no IBAN metadata at all (ETP-4896) — e.g. Argentina, United States.
const NO_IBAN_META = { id: '108', name: 'Argentina', iso: 'AR' };

describe('countryIban', () => {
  describe('ibanPrefixFor', () => {
    it('prefers ibanPrefix over iso', () => {
      expect(ibanPrefixFor(SPAIN)).toBe('ES');
    });

    it('falls back to iso when ibanPrefix is absent', () => {
      expect(ibanPrefixFor({ iso: 'es' })).toBe('ES');
    });

    it('returns null when neither is present', () => {
      expect(ibanPrefixFor({ id: 'x' })).toBe(null);
      expect(ibanPrefixFor(null)).toBe(null);
      expect(ibanPrefixFor(undefined)).toBe(null);
    });
  });

  describe('expectedIbanLength', () => {
    it('reads ibanLength as a number', () => {
      expect(expectedIbanLength(SPAIN)).toBe(24);
    });

    it('returns null when unset, zero, negative, or not a number', () => {
      expect(expectedIbanLength(NO_IBAN_META)).toBe(null);
      expect(expectedIbanLength({ ibanLength: 0 })).toBe(null);
      expect(expectedIbanLength({ ibanLength: -5 })).toBe(null);
      expect(expectedIbanLength({ ibanLength: 'abc' })).toBe(null);
      expect(expectedIbanLength(null)).toBe(null);
    });
  });

  describe('validateIbanForCountry', () => {
    it('accepts an empty IBAN regardless of country (still optional)', () => {
      expect(validateIbanForCountry('', SPAIN)).toEqual({ ok: true, code: null });
      expect(validateIbanForCountry('   ', null)).toEqual({ ok: true, code: null });
    });

    it('rejects a checksum failure before any country check', () => {
      expect(validateIbanForCountry('ES9121000418450200051333', SPAIN))
        .toEqual({ ok: false, code: 'invalid' });
    });

    it('accepts a valid IBAN when no country is selected yet', () => {
      expect(validateIbanForCountry('ES9121000418450200051332', null))
        .toEqual({ ok: true, code: null });
    });

    it('accepts a valid IBAN matching the selected country', () => {
      expect(validateIbanForCountry('ES91 2100 0418 4502 0005 1332', SPAIN))
        .toEqual({ ok: true, code: null });
    });

    it('rejects a prefix mismatch, not a checksum failure, when both would fail', () => {
      // A real Spanish IBAN checked against Italy: wrong prefix, and it would also fail Italy's
      // mod-97 — the country-specific message must win.
      expect(validateIbanForCountry('ES9121000418450200051332', ITALY))
        .toEqual({ ok: false, code: 'countryMismatch' });
    });

    it('rejects a length mismatch when the prefix happens to still match', () => {
      const wrongLength = { ...SPAIN, ibanLength: 20 };
      expect(validateIbanForCountry('ES9121000418450200051332', wrongLength))
        .toEqual({ ok: false, code: 'lengthMismatch' });
    });

    // This function's contract is unchanged: given a resolved catalog ROW it cannot tell "no
    // country picked" from "picked one with no IBAN metadata" — both arrive as null. Callers detect
    // the second case with countryLacksIbanConfig (see its own describe block below), because the
    // DB trigger DOES reject it.
    it('skips prefix/length checks (mod-97 only) when the country has no IBAN metadata', () => {
      // GB IBAN, "checked" against a country with zero metadata — nothing to cross-check.
      expect(validateIbanForCountry('GB82WEST12345698765432', NO_IBAN_META))
        .toEqual({ ok: true, code: null });
    });
  });

  describe('countryLacksIbanConfig', () => {
    const RULES = [SPAIN, ITALY];

    it('is true for a country absent from a populated catalog', () => {
      expect(countryLacksIbanConfig('ar-no-metadata', RULES)).toBe(true);
    });

    it('is false for a country present in the catalog', () => {
      expect(countryLacksIbanConfig('106', RULES)).toBe(false);
    });

    it('is false when no country is selected', () => {
      expect(countryLacksIbanConfig('', RULES)).toBe(false);
      expect(countryLacksIbanConfig(null, RULES)).toBe(false);
      expect(countryLacksIbanConfig(undefined, RULES)).toBe(false);
    });

    // The empty-catalog guard is load-bearing: countryIbanRules is legitimately [] on a non-ok
    // /defaults, a network throw, a payload without the key, and on every render before the fetch
    // resolves. Reading that as "every country lacks IBAN config" would block valid saves.
    it('is false when the catalog is empty or not an array (unknown, defer to the backend)', () => {
      expect(countryLacksIbanConfig('ar-no-metadata', [])).toBe(false);
      expect(countryLacksIbanConfig('ar-no-metadata', undefined)).toBe(false);
      expect(countryLacksIbanConfig('ar-no-metadata', null)).toBe(false);
    });

    it('tolerates malformed catalog rows without throwing', () => {
      expect(countryLacksIbanConfig('106', [null, undefined, {}])).toBe(true);
    });
  });
});
