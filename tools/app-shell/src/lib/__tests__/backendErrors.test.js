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

  // ── matchAccountNotFound guard branches ───────────────────────────────────────
  //
  // These exercise the early-return guards in matchAccountNotFound() that the
  // happy-path tests above never hit: a prefix match that doesn't close with ')',
  // an empty parenthesized segment, and a split that yields an empty BP or group.

  it('leaves the message untouched when it starts with the prefix but does not end with ")"', () => {
    // startsWith(prefix) is true but endsWith(')') is false — the message is
    // truncated/malformed, so matchAccountNotFound must bail out via the
    // "|| !msg.endsWith(')')" branch instead of slicing garbage.
    const raw = 'Account could not be found. (Business Partner: Acme Corp';
    assert.equal(translateBackendError(raw, en), raw);
  });

  it('leaves the message untouched when the parenthesized segment is empty', () => {
    // inner === '' after slicing — the "!inner" guard must return null rather
    // than proceeding to split an empty string.
    const raw = 'Account could not be found. (Business Partner: )';
    assert.equal(translateBackendError(raw, en), raw);
  });

  it('leaves the message untouched when the Business Partner name is empty but a BP Group is present', () => {
    // delimIdx is found, but bp (the slice before it) is empty — "!bp" guard.
    const raw = 'Account could not be found. (Business Partner: , BP Group: Vendors)';
    assert.equal(translateBackendError(raw, en), raw);
  });

  it('leaves the message untouched when the BP Group is empty but a Business Partner name is present', () => {
    // delimIdx is found, but group (the slice after it) is empty — "!group" guard.
    const raw = 'Account could not be found. (Business Partner: Acme Corp, BP Group: )';
    assert.equal(translateBackendError(raw, en), raw);
  });

  it('returns the original message when the BP+Group translation key is missing (guard, BP+Group branch)', () => {
    // Same missing-translation guard already covered for the BP-only skeleton
    // above, but exercised on the BP+Group branch (translateParameterized's
    // `match.group !== null` arm) which has its own independent guard check.
    const raw = 'Account could not be found. (Business Partner: Acme Corp, BP Group: Suppliers)';
    const missingT = (k) => k; // echoes the key back — simulates an unmapped locale
    assert.equal(translateBackendError(raw, missingT), raw);
  });

  it('does not affect existing exact-match BACKEND_ERROR_MAP entries', () => {
    const raw = 'Country needed in an IBAN account.';
    const t = (k) => (k === 'backendError.countryIban' ? 'Se necesita el País para una cuenta IBAN.' : k);
    assert.equal(translateBackendError(raw, t), 'Se necesita el País para una cuenta IBAN.');
  });

  // ── mis-split bug: BP name itself contains the ", BP Group: " delimiter ──────────
  //
  // QA found that the original regex-based matcher (two back-to-back lazy `(.+?)`
  // capture groups) split at the FIRST ", BP Group: " occurrence, so a Business
  // Partner name that happens to contain that literal substring produced a garbled
  // capture. The string-based rewrite uses `lastIndexOf` for the delimiter, which
  // always finds the LAST occurrence — the correct split point, since a BP Group
  // name legitimately containing ", BP Group: " would be a vanishingly unlikely
  // coincidence compared to it appearing inside a BP name/free-text field.
  it('demonstrates the old regex mis-split bug on a BP name containing ", BP Group: "', () => {
    const raw = 'Account could not be found. (Business Partner: Odd, BP Group: Fake, Corp, BP Group: Vendors)';
    const OLD_REGEX = /^Account could not be found\.\s*\(Business Partner:\s*(.+?),\s*BP Group:\s*(.+?)\)$/;
    const oldMatch = OLD_REGEX.exec(raw);
    // The old regex's non-greedy first group stops at the FIRST ", BP Group: " —
    // producing a wrong split (bp truncated to "Odd", group swallowing the rest).
    assert.equal(oldMatch[1], 'Odd');
    assert.equal(oldMatch[2], 'Fake, Corp, BP Group: Vendors');
  });

  it('correctly splits at the LAST ", BP Group: " when the BP name contains that literal substring', () => {
    const raw = 'Account could not be found. (Business Partner: Odd, BP Group: Fake, Corp, BP Group: Vendors)';
    const result = translateBackendError(raw, en);
    assert.equal(
      result,
      'Account could not be found. (Contact: Odd, BP Group: Fake, Corp, Business Partner Category: Vendors)',
    );
  });
});

// ── ETP-4706: costing engine "@product@" placeholder never resolves ──────────────
//
// Core Etendo's `NotCalculatedCostWithTransaction` AD_MESSAGE
// ("The cost of the product @product@ has not been calculated.") is returned by
// OBMessageUtils.parseTranslation() with its own embedded `@product@` placeholder
// left literally unsubstituted — parseTranslation resolves the outer message token
// in a single pass and does not recursively re-parse the resolved text for nested
// placeholders. This happens deterministically every time this specific failure
// occurs, so the raw string (with the literal `@product@`) is a stable exact-match
// candidate for BACKEND_ERROR_MAP — no dynamic value is ever actually available to
// capture, unlike the parameterized "Account could not be found" case above.
describe('translateBackendError — cost not calculated exact match (ETP-4706)', () => {
  const RAW = 'The cost of the product @product@ has not been calculated.';

  it('translates the raw (broken, literal @product@) message to en_US', () => {
    const t = (k) => (k === 'backendError.costNotCalculated'
      ? 'The cost of the product could not be calculated.'
      : k);
    assert.equal(translateBackendError(RAW, t), 'The cost of the product could not be calculated.');
  });

  it('translates the raw (broken, literal @product@) message to es_ES', () => {
    const t = (k) => (k === 'backendError.costNotCalculated'
      ? 'No se pudo calcular el costo del producto.'
      : k);
    assert.equal(translateBackendError(RAW, t), 'No se pudo calcular el costo del producto.');
  });
});

// ── ETP-4831: "shipment already invoiced" parameterized enrichment ──────────────
//
// com.etendoerp.go's own `ETGO_InvoiceLineAlreadyInvoiced` AD_MESSAGE ("The shipment
// @docNo@ cannot be invoiced: quantity to invoice (@invoiced@) exceeds pending
// quantity (@pending@). The shipment may already be invoiced in another document.")
// has zero AD_Message_Trl rows for ANY language, because com.etendoerp.go has no
// companion translation module (AD_MODULE.ISTRANSLATIONREQUIRED = N) — the same root
// cause as the ETP-4706 "Account could not be found" messages above. The backend
// always renders this with the literal docNo/invoiced/pending values substituted in
// (never the raw `@token@` placeholders), so a matcher must parse those three values
// back out of the rendered string via plain string slicing (same ReDoS-safe style as
// `matchAccountNotFound` / ACCOUNT_NOT_FOUND_PREFIX above — a document number and
// quantities are effectively free-form data, so no backtracking-prone regex).
//
// EXPECTED (not yet implemented): a `matchInvoiceLineAlreadyInvoiced` parameterized
// matcher wired into `translateParameterized`, re-rendering via a new
// `backendError.invoiceLineAlreadyInvoiced` i18n key. Until that lands, these tests
// MUST fail: translateBackendError has no exact-match entry and no matcher for this
// message shape, so it falls through to returning `msg` unchanged.
describe('translateBackendError — "shipment already invoiced" parameterized match (ETP-4831)', () => {
  const en = fakeUiTranslator({
    'backendError.invoiceLineAlreadyInvoiced':
      'Shipment {docNo} cannot be invoiced: quantity to invoice ({invoiced}) exceeds pending quantity ({pending}). It may already be invoiced in another document.',
  });
  const es = fakeUiTranslator({
    'backendError.invoiceLineAlreadyInvoiced':
      'El albarán {docNo} no se puede facturar: la cantidad a facturar ({invoiced}) supera la cantidad pendiente ({pending}). Puede que ya esté facturado en otro documento.',
  });
  const RAW = 'The shipment 10000039 cannot be invoiced: quantity to invoice (2) exceeds pending quantity (0). The shipment may already be invoiced in another document.';

  it('translates the rendered backend message to es_ES, interpolating docNo/invoiced/pending', () => {
    assert.equal(
      translateBackendError(RAW, es),
      'El albarán 10000039 no se puede facturar: la cantidad a facturar (2) supera la cantidad pendiente (0). Puede que ya esté facturado en otro documento.',
    );
  });

  it('translates the rendered backend message to en_US, interpolating docNo/invoiced/pending', () => {
    assert.equal(
      translateBackendError(RAW, en),
      'Shipment 10000039 cannot be invoiced: quantity to invoice (2) exceeds pending quantity (0). It may already be invoiced in another document.',
    );
  });

  it('returns the original message unchanged when the translation key is missing (guard)', () => {
    const missingT = (k) => k; // echoes the key back — simulates an unmapped locale
    assert.equal(translateBackendError(RAW, missingT), RAW);
  });
});
