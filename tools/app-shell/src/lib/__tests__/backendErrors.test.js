import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateBackendError } from '../backendErrors.js';

/**
 * Unit tests for translateBackendError.
 *
 * Contract:
 *  - Known Etendo backend messages are mapped to i18n keys and translated via t().
 *  - Unknown messages are returned as-is (original string preserved).
 *  - If t(key) === key (translation missing), original message is returned as a guard.
 *  - null / undefined input is returned unchanged.
 *  - Leading/trailing whitespace in the message is stripped before lookup.
 *  - If t is not a function, original message is returned.
 */

describe('translateBackendError', () => {
  // ── known messages ──────────────────────────────────────────────────────────

  describe('known IBAN / account messages', () => {
    const KNOWN = [
      {
        raw: 'Country needed in an IBAN account.',
        key: 'backendError.countryIban',
      },
      {
        raw: 'Using IBAN for generating the Displayed Account requires to introduce the IBAN',
        key: 'backendError.ibanRequired',
      },
      {
        raw: 'Using the Generic Account No. for generating the Displayed Account requires to introduce a Generic Account Number',
        key: 'backendError.genericAccountRequired',
      },
      {
        raw: 'IBAN code entered is not correct. Please review the IBAN code and the country defined for the bank',
        key: 'backendError.ibanInvalid',
      },
    ];

    for (const { raw, key } of KNOWN) {
      it(`maps "${raw.slice(0, 40)}..." to key ${key}`, () => {
        const t = (k) => (k === key ? `translated:${key}` : k);
        const result = translateBackendError(raw, t);
        assert.equal(result, `translated:${key}`);
      });
    }
  });

  // ── translation missing guard ────────────────────────────────────────────────

  it('returns original message when t returns the key itself (key not found in locale)', () => {
    const raw = 'Country needed in an IBAN account.';
    // t() echoes back the key — translation is missing
    const t = (k) => k;
    const result = translateBackendError(raw, t);
    assert.equal(result, raw);
  });

  it('returns translated string when t returns non-key value for a known message', () => {
    const raw = 'Country needed in an IBAN account.';
    const t = (k) => (k === 'backendError.countryIban' ? 'Se necesita un país para cuentas IBAN.' : k);
    const result = translateBackendError(raw, t);
    assert.equal(result, 'Se necesita un país para cuentas IBAN.');
  });

  // ── unknown messages ─────────────────────────────────────────────────────────

  it('returns original message unchanged for an unknown backend error', () => {
    const raw = 'Some other unrecognised backend error';
    const t = (k) => `translated:${k}`;
    const result = translateBackendError(raw, t);
    assert.equal(result, raw);
  });

  it('returns original message unchanged when message is an empty-ish string not in map', () => {
    const raw = 'Not a known error at all.';
    const t = () => 'something';
    const result = translateBackendError(raw, t);
    // Not in map → returned as-is
    assert.equal(result, raw);
  });

  // ── whitespace trimming ───────────────────────────────────────────────────────

  it('trims leading and trailing whitespace before looking up the key', () => {
    const raw = '  Country needed in an IBAN account.  ';
    const t = (k) => (k === 'backendError.countryIban' ? 'Traducido' : k);
    const result = translateBackendError(raw, t);
    assert.equal(result, 'Traducido');
  });

  it('returns the trimmed message unchanged when trimmed form is not in map', () => {
    const raw = '   Unknown error   ';
    const t = (k) => `translated:${k}`;
    const result = translateBackendError(raw, t);
    // key not found — returns original (with spaces, since we return msg not msg.trim())
    assert.equal(result, raw);
  });

  // ── null / undefined / non-function t ────────────────────────────────────────

  it('returns null when msg is null', () => {
    const t = (k) => k;
    const result = translateBackendError(null, t);
    assert.equal(result, null);
  });

  it('returns undefined when msg is undefined', () => {
    const t = (k) => k;
    const result = translateBackendError(undefined, t);
    assert.equal(result, undefined);
  });

  it('returns empty string when msg is an empty string', () => {
    const t = (k) => k;
    const result = translateBackendError('', t);
    assert.equal(result, '');
  });

  it('returns original message when t is not a function', () => {
    const raw = 'Country needed in an IBAN account.';
    const result = translateBackendError(raw, null);
    assert.equal(result, raw);
  });

  it('returns original message when t is undefined', () => {
    const raw = 'Country needed in an IBAN account.';
    const result = translateBackendError(raw, undefined);
    assert.equal(result, raw);
  });

  it('returns original message when t is an object (not a function)', () => {
    const raw = 'Country needed in an IBAN account.';
    const result = translateBackendError(raw, {});
    assert.equal(result, raw);
  });
});

// ── ETP-4706: parameterized "Account could not be found" enrichment ──────────────
//
// Core Etendo's `@InvalidAccount@` message ("Account could not be found.") is
// enriched server-side (DocumentPostingService#enrichWithFailingEntity) with the
// transaction's Business Partner / BP Group name via the en_US-only
// ETGO_InvalidAccountBpAndGroup / ETGO_InvalidAccountBpOnly AD_MESSAGE catalog
// entries. These two skeletons carry a dynamic name, so they can't be an exact-match
// BACKEND_ERROR_MAP entry — they need a regex match + re-interpolation instead.
// A fake `t(key, params)` mimics useUI()'s interpolation ({param} substitution).
function fakeUiTranslator(dictionary) {
  return (key, params = {}) => {
    let text = dictionary[key] ?? key;
    Object.keys(params).forEach((p) => {
      text = text.replace(`{${p}}`, params[p]);
    });
    return text;
  };
}

describe('translateBackendError — parameterized "Account could not be found" (ETP-4706)', () => {
  const en = fakeUiTranslator({
    'backendError.invalidAccountBpAndGroup': 'Account could not be found. (Contact: {bp}, Business Partner Category: {group})',
    'backendError.invalidAccountBpOnly': 'Account could not be found. (Contact: {bp})',
  });
  const es = fakeUiTranslator({
    'backendError.invalidAccountBpAndGroup': 'No se pudo encontrar la cuenta. (Contacto: {bp}, Grupos de terceros: {group})',
    'backendError.invalidAccountBpOnly': 'No se pudo encontrar la cuenta. (Contacto: {bp})',
  });

  it('translates the BP + BP Group skeleton to en_US, interpolating both names', () => {
    const raw = 'Account could not be found. (Business Partner: Acme Corp, BP Group: Suppliers)';
    assert.equal(
      translateBackendError(raw, en),
      'Account could not be found. (Contact: Acme Corp, Business Partner Category: Suppliers)',
    );
  });

  it('translates the BP + BP Group skeleton to es_ES, interpolating both names', () => {
    const raw = 'Account could not be found. (Business Partner: Acme Corp, BP Group: Suppliers)';
    assert.equal(
      translateBackendError(raw, es),
      'No se pudo encontrar la cuenta. (Contacto: Acme Corp, Grupos de terceros: Suppliers)',
    );
  });

  it('translates the BP-only skeleton to en_US, interpolating the name', () => {
    const raw = 'Account could not be found. (Business Partner: Acme Corp)';
    assert.equal(
      translateBackendError(raw, en),
      'Account could not be found. (Contact: Acme Corp)',
    );
  });

  it('translates the BP-only skeleton to es_ES, interpolating the name', () => {
    const raw = 'Account could not be found. (Business Partner: Acme Corp)';
    assert.equal(
      translateBackendError(raw, es),
      'No se pudo encontrar la cuenta. (Contacto: Acme Corp)',
    );
  });

  it('does not confuse the BP-only pattern when a BP Group is also present (matches BP+Group first)', () => {
    const raw = 'Account could not be found. (Business Partner: Jane Doe, BP Group: Retail)';
    const result = translateBackendError(raw, en);
    assert.equal(result, 'Account could not be found. (Contact: Jane Doe, Business Partner Category: Retail)');
  });

  it('returns the original message unchanged when the translation key is missing (guard)', () => {
    const raw = 'Account could not be found. (Business Partner: Acme Corp)';
    const missingT = (k) => k; // echoes the key back — simulates an unmapped locale
    assert.equal(translateBackendError(raw, missingT), raw);
  });

  it('leaves unrelated messages without a "(Business Partner: ...)" suffix untouched', () => {
    const raw = 'Account could not be found.';
    assert.equal(translateBackendError(raw, en), raw);
  });

  it('does not affect existing exact-match BACKEND_ERROR_MAP entries', () => {
    const raw = 'Country needed in an IBAN account.';
    const t = (k) => (k === 'backendError.countryIban' ? 'Se necesita el País para una cuenta IBAN.' : k);
    assert.equal(translateBackendError(raw, t), 'Se necesita el País para una cuenta IBAN.');
  });
});
