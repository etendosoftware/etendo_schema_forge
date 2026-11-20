// @covers tools/app-shell/src/lib/sepaCreditorId.js
//
// The client-side mirror of the backend's SepaCreditorId. The server is the source of truth; these
// cases pin the same rule so a typed value gets its inline error before the round-trip.
import {
  SEPA_CREDITOR_ID_ERRORS,
  computeCreditorCheckDigits,
  creditorIdErrorKey,
  normalizeCreditorId,
  validateCreditorId,
} from '../sepaCreditorId.js';

describe('normalizeCreditorId', () => {
  it('strips everything but letters and digits and upper-cases', () => {
    expect(normalizeCreditorId(' es82 000-b87654323 ')).toBe('ES82000B87654323');
    expect(normalizeCreditorId(null)).toBe('');
    expect(normalizeCreditorId(undefined)).toBe('');
  });
});

describe('computeCreditorCheckDigits', () => {
  it('is ISO 7064 mod 97-10 over nationalId + country + 00, zero-padded', () => {
    expect(computeCreditorCheckDigits('ES', 'B87654323')).toBe('82');
  });

  it('pads a one-digit result with a zero', () => {
    for (let i = 0; i < 200; i += 1) {
      const digits = computeCreditorCheckDigits('ES', `A${String(i).padStart(8, '0')}`);
      expect(digits).toMatch(/^\d{2}$/);
    }
  });
});

describe('validateCreditorId', () => {
  it('accepts a valid identifier, however it was typed', () => {
    expect(validateCreditorId('ES82000B87654323')).toEqual({ normalized: 'ES82000B87654323', error: null, expectedCheckDigits: null });
    expect(validateCreditorId('es82 000 b87654323').error).toBeNull();
  });

  it('flags an empty value as blank', () => {
    expect(validateCreditorId('  ').error).toBe(SEPA_CREDITOR_ID_ERRORS.blank);
  });

  it.each([
    ['too short', 'ES82'],
    ['no country', '8282000B87654323'],
    ['no business code', 'ES82'],
    ['over 35 characters', `ES82000${'B'.repeat(29)}`],
  ])('flags a bad layout (%s)', (_name, value) => {
    expect(validateCreditorId(value).error).toBe(SEPA_CREDITOR_ID_ERRORS.invalidFormat);
  });

  it('flags wrong check digits and says which ones it expected', () => {
    expect(validateCreditorId('ES83000B87654323')).toEqual({ normalized: 'ES83000B87654323', error: SEPA_CREDITOR_ID_ERRORS.invalidCheckDigits, expectedCheckDigits: '82' });
  });

  it('does not use the business code in the check digits', () => {
    expect(validateCreditorId('ES82ZZZB87654323').error).toBeNull();
  });
});

describe('creditorIdErrorKey', () => {
  it('is null for nothing typed and for a valid value', () => {
    expect(creditorIdErrorKey('')).toBeNull();
    expect(creditorIdErrorKey('ES82000B87654323')).toBeNull();
  });

  it('maps the two reasons to their i18n keys', () => {
    expect(creditorIdErrorKey('xx')).toBe('sepaCreditorIdInvalidFormat');
    expect(creditorIdErrorKey('ES83000B87654323')).toBe('sepaCreditorIdInvalidCheckDigits');
  });
});
