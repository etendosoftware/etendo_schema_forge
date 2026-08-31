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
  const RAW_CORE_NO_COST = 'There is no cost defined for the product: @Product@ on @Date@';

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

  it('translates the raw core NoCostDefinedForProduct message with literal placeholders', () => {
    const t = (k) => (k === 'backendError.costNotCalculated'
      ? 'No se pudo calcular el costo del producto.'
      : k);
    assert.equal(translateBackendError(RAW_CORE_NO_COST, t), 'No se pudo calcular el costo del producto.');
  });

  it('returns the raw core NoCostDefinedForProduct message unchanged when the key is missing', () => {
    assert.equal(translateBackendError(RAW_CORE_NO_COST, (k) => k), RAW_CORE_NO_COST);
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

  // BUG-1 (QA finding, ETP-4831): the backend builds @invoiced@/@pending@ from
  // BigDecimal#toPlainString() (AbstractInvoiceHeaderHandler.checkInoutEntryForOverInvoicing
  // in com.etendoerp.go), so for a product with fractional UOM precision the rendered
  // values are decimal, not just integers — e.g. "2.50" / "0.75". The matcher does plain
  // digit-agnostic string slicing between fixed delimiters, so it must parse a decimal
  // quantity exactly like an integer one.
  it('translates a rendered message with decimal invoiced/pending quantities to es_ES', () => {
    const decimalRaw = 'The shipment 10000039 cannot be invoiced: quantity to invoice (2.50) exceeds pending quantity (0.75). The shipment may already be invoiced in another document.';
    assert.equal(
      translateBackendError(decimalRaw, es),
      'El albarán 10000039 no se puede facturar: la cantidad a facturar (2.50) supera la cantidad pendiente (0.75). Puede que ya esté facturado en otro documento.',
    );
  });
});

// ── ETP-4831 case 2: "No hay líneas a facturar en este pedido" always in Spanish ──
//
// CreateDraftInvoiceHandler#createFromOrder (com.etendoerp.go) throws
// `new OBException("No hay líneas a facturar en este pedido")` — a hardcoded
// Spanish literal with NO AD_Message/i18n involvement at all, so it always
// renders in Spanish even in an en_US session (the inverse symptom of case 1,
// which always rendered in English regardless of locale).
//
// Unlike the parameterized messages above, this string carries no dynamic/
// interpolated value — it's a fixed literal — so it belongs in the plain
// exact-match BACKEND_ERROR_MAP (same style as 'A tariff marked as default
// cannot be deactivated.' / the costing-engine entry), not a parameterized
// matcher. Suggested key: `backendError.noLinesToInvoice`.
//
// EXPECTED (not yet implemented): a `BACKEND_ERROR_MAP` entry mapping the raw
// Spanish literal to `backendError.noLinesToInvoice`. Until that lands, these
// tests MUST fail: translateBackendError has no matching key for this message,
// so it falls through to returning `msg` unchanged (still Spanish, even for an
// en_US translator).
describe('translateBackendError — "no lines to invoice" exact match (ETP-4831 case 2)', () => {
  const RAW = 'No hay líneas a facturar en este pedido';

  it('translates the raw Spanish literal to en_US', () => {
    const t = (k) => (k === 'backendError.noLinesToInvoice'
      ? 'There are no lines to invoice for this order.'
      : k);
    assert.equal(translateBackendError(RAW, t), 'There are no lines to invoice for this order.');
  });

  it('translates the raw Spanish literal to es_ES (symmetry with other exact-match entries)', () => {
    const t = (k) => (k === 'backendError.noLinesToInvoice'
      ? 'No hay líneas a facturar en este pedido.'
      : k);
    assert.equal(translateBackendError(RAW, t), 'No hay líneas a facturar en este pedido.');
  });
});

// ── ETP-4831 case 3: "No hay líneas pendientes de facturar en este albarán" ─────
//
// CreateDraftInvoiceHandler (com.etendoerp.go) has TWO throw sites —
// capShipmentLineOverrides and the line-selection loop inside
// createFromShipments — that both throw the IDENTICAL hardcoded Spanish literal
// `new OBException("No hay líneas pendientes de facturar en este albarán")`,
// same bug class as case 2 (case 2 is the order-invoicing flow, this is the
// shipment-invoicing flow) but with no AD_Message/i18n involvement, so it
// always renders in Spanish regardless of session locale.
//
// Both throw sites emit the exact same string, so ONE BACKEND_ERROR_MAP entry
// covers both. Suggested key: `backendError.noPendingLinesToInvoiceShipment`.
//
// EXPECTED (not yet implemented): a `BACKEND_ERROR_MAP` entry mapping the raw
// Spanish literal to `backendError.noPendingLinesToInvoiceShipment`. Until that
// lands, these tests MUST fail: translateBackendError has no matching key for
// this message, so it falls through to returning `msg` unchanged (still
// Spanish, even for an en_US translator).
describe('translateBackendError — "no pending lines to invoice" shipment exact match (ETP-4831 case 3)', () => {
  const RAW = 'No hay líneas pendientes de facturar en este albarán';

  it('translates the raw Spanish literal to en_US', () => {
    const t = (k) => (k === 'backendError.noPendingLinesToInvoiceShipment'
      ? 'There are no pending lines to invoice for this shipment.'
      : k);
    assert.equal(translateBackendError(RAW, t), 'There are no pending lines to invoice for this shipment.');
  });

  it('translates the raw Spanish literal to es_ES (symmetry with other exact-match entries)', () => {
    const t = (k) => (k === 'backendError.noPendingLinesToInvoiceShipment'
      ? 'No hay líneas pendientes de facturar en este albarán.'
      : k);
    assert.equal(translateBackendError(RAW, t), 'No hay líneas pendientes de facturar en este albarán.');
  });
});

// ── ETP-4831 case 4: 9 more hardcoded, untranslated literals (QA scope sweep) ────
//
// Verified directly against com.etendoerp.go source. Two families:
//
//  A) Exact-match literals (no interpolation) — belong in BACKEND_ERROR_MAP, same
//     style as case 2/3 above.
//  B) Parameterized literals (fixed prefix + a dynamic ID appended) — need NEW
//     matchers wired into translateParameterized, same plain-string-slicing style
//     (no regex, ReDoS-safe) as matchAccountNotFound / matchInvoiceLineAlreadyInvoiced.
//
// EXPECTED (not yet implemented): none of the BACKEND_ERROR_MAP entries, matcher
// functions, or i18n keys below exist yet. Until they land, ALL tests in this
// block MUST fail: translateBackendError falls through to returning `msg`
// unchanged for every one of these raw messages.

describe('translateBackendError — ETP-4831 case 4 (9 more hardcoded messages)', () => {
  // A.1) CreateShipmentHandler.java:136 — hardcoded Spanish literal, no
  // AD_Message involvement, thrown when an order has zero pending-delivery
  // lines. Suggested key: backendError.noPendingLinesToDeliverOrder.
  describe('"no pending lines to deliver" exact match (CreateShipmentHandler)', () => {
    const RAW = 'No hay líneas pendientes de entrega en este pedido';

    it('translates the raw Spanish literal to en_US', () => {
      const t = (k) => (k === 'backendError.noPendingLinesToDeliverOrder'
        ? 'There are no pending lines to deliver for this order.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'There are no pending lines to deliver for this order.');
    });

    it('translates the raw Spanish literal to es_ES (symmetry with other exact-match entries)', () => {
      const t = (k) => (k === 'backendError.noPendingLinesToDeliverOrder'
        ? 'No hay líneas pendientes de entrega en este pedido.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'No hay líneas pendientes de entrega en este pedido.');
    });
  });

  // A.2) CreateInvoiceShipmentHandler.java:200 — hardcoded Spanish literal, no
  // AD_Message involvement, thrown when an invoice has zero lines with a
  // product. Suggested key: backendError.noProductLinesInInvoice.
  describe('"no product lines in invoice" exact match (CreateInvoiceShipmentHandler)', () => {
    const RAW = 'No hay líneas con producto en esta factura';

    it('translates the raw Spanish literal to en_US', () => {
      const t = (k) => (k === 'backendError.noProductLinesInInvoice'
        ? 'There are no lines with a product in this invoice.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'There are no lines with a product in this invoice.');
    });

    it('translates the raw Spanish literal to es_ES (symmetry with other exact-match entries)', () => {
      const t = (k) => (k === 'backendError.noProductLinesInInvoice'
        ? 'No hay líneas con producto en esta factura.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'No hay líneas con producto en esta factura.');
    });
  });

  // A.3) CreateDraftInvoiceHandler.java:812 AND :1042 — same hardcoded ENGLISH
  // literal thrown from two sites (getOrCreateArInvoiceDocType has no linked
  // doc type). One BACKEND_ERROR_MAP entry covers both throw sites. Suggested
  // key: backendError.noArInvoiceDocTypeFound.
  describe('"No AR Invoice document type found" exact match (two throw sites)', () => {
    const RAW = 'No AR Invoice document type found';

    it('translates the raw English literal to es_ES', () => {
      const t = (k) => (k === 'backendError.noArInvoiceDocTypeFound'
        ? 'No se encontró ningún tipo de documento de factura de venta.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'No se encontró ningún tipo de documento de factura de venta.');
    });

    it('translates the raw English literal to en_US (symmetry with other exact-match entries)', () => {
      const t = (k) => (k === 'backendError.noArInvoiceDocTypeFound'
        ? 'No AR Invoice document type found.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'No AR Invoice document type found.');
    });
  });

  // A.4) CreateDraftInvoiceHandler.java:999 — hardcoded English literal,
  // thrown when createFromShipments receives an empty shipment list.
  // Suggested key: backendError.noShipmentsProvided.
  describe('"No shipments provided" exact match', () => {
    const RAW = 'No shipments provided';

    it('translates the raw English literal to es_ES', () => {
      const t = (k) => (k === 'backendError.noShipmentsProvided'
        ? 'No se proporcionaron albaranes.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'No se proporcionaron albaranes.');
    });

    it('translates the raw English literal to en_US (symmetry with other exact-match entries)', () => {
      const t = (k) => (k === 'backendError.noShipmentsProvided'
        ? 'No shipments were provided.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'No shipments were provided.');
    });
  });

  // A.5) CreateDraftInvoiceHandler.java:1005 — hardcoded English literal,
  // thrown when the selected shipments don't all share the same Business
  // Partner. Suggested key: backendError.shipmentsMustShareBusinessPartner.
  describe('"All shipments must belong to the same Business Partner" exact match', () => {
    const RAW = 'All shipments must belong to the same Business Partner';

    it('translates the raw English literal to es_ES', () => {
      const t = (k) => (k === 'backendError.shipmentsMustShareBusinessPartner'
        ? 'Todos los albaranes deben pertenecer al mismo Tercero.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'Todos los albaranes deben pertenecer al mismo Tercero.');
    });

    it('translates the raw English literal to en_US (symmetry with other exact-match entries)', () => {
      const t = (k) => (k === 'backendError.shipmentsMustShareBusinessPartner'
        ? 'All shipments must belong to the same Business Partner.'
        : k);
      assert.equal(translateBackendError(RAW, t), 'All shipments must belong to the same Business Partner.');
    });
  });

  // A.6) CreateDraftInvoiceHandler.java:1068 — hardcoded English literal,
  // thrown when the Business Partner lacks mandatory Payment Terms/Method.
  // Suggested key: backendError.bpMissingPaymentTermsOrMethod.
  describe('"Business Partner is missing mandatory Payment Terms or Payment Method" exact match', () => {
    const RAW = 'Business Partner is missing mandatory Payment Terms or Payment Method';

    it('translates the raw English literal to es_ES', () => {
      const t = (k) => (k === 'backendError.bpMissingPaymentTermsOrMethod'
        ? 'Al Tercero le faltan las Condiciones de Pago o la Forma de Pago obligatorias.'
        : k);
      assert.equal(
        translateBackendError(RAW, t),
        'Al Tercero le faltan las Condiciones de Pago o la Forma de Pago obligatorias.',
      );
    });

    it('translates the raw English literal to en_US (symmetry with other exact-match entries)', () => {
      const t = (k) => (k === 'backendError.bpMissingPaymentTermsOrMethod'
        ? 'The Business Partner is missing mandatory Payment Terms or Payment Method.'
        : k);
      assert.equal(
        translateBackendError(RAW, t),
        'The Business Partner is missing mandatory Payment Terms or Payment Method.',
      );
    });
  });

  // B.1) CreateDraftInvoiceHandler.java:606 — "Order not found: " + orderId.
  // Fixed English prefix + dynamic order id appended, no closing delimiter.
  // Needs a NEW parameterized matcher (plain prefix slicing, no regex) wired
  // into translateParameterized, re-rendered via a new
  // backendError.orderNotFound i18n key with {orderId} interpolation.
  describe('"Order not found: <id>" parameterized match', () => {
    const en = fakeUiTranslator({
      // Trailing period deliberately added so this differs from the raw
      // (period-less) backend string — otherwise the pre-implementation
      // fallthrough (return msg unchanged) would trivially satisfy the
      // assertion without any matcher existing at all.
      'backendError.orderNotFound': 'Order not found: {orderId}.',
    });
    const es = fakeUiTranslator({
      'backendError.orderNotFound': 'Pedido no encontrado: {orderId}',
    });
    const RAW = 'Order not found: 12345';

    it('translates the rendered backend message to es_ES, interpolating the order id', () => {
      assert.equal(translateBackendError(RAW, es), 'Pedido no encontrado: 12345');
    });

    it('translates the rendered backend message to en_US, interpolating the order id', () => {
      assert.equal(translateBackendError(RAW, en), 'Order not found: 12345.');
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      const missingT = (k) => k; // echoes the key back — simulates an unmapped locale
      assert.equal(translateBackendError(RAW, missingT), RAW);
    });
  });

  // B.2) CreateDraftInvoiceHandler.java:996 — "Shipment not found: " + id.
  // Same shape as B.1 above but for the shipment-lookup loop inside
  // createFromShipments. Needs a NEW parameterized matcher wired into
  // translateParameterized, re-rendered via a new backendError.shipmentNotFound
  // i18n key with {id} interpolation.
  describe('"Shipment not found: <id>" parameterized match', () => {
    const en = fakeUiTranslator({
      // Trailing period deliberately added — same rationale as
      // backendError.orderNotFound above (raw backend string has no period,
      // so the pre-implementation fallthrough must not trivially match).
      'backendError.shipmentNotFound': 'Shipment not found: {id}.',
    });
    const es = fakeUiTranslator({
      'backendError.shipmentNotFound': 'Albarán no encontrado: {id}',
    });
    const RAW = 'Shipment not found: 67890';

    it('translates the rendered backend message to es_ES, interpolating the shipment id', () => {
      assert.equal(translateBackendError(RAW, es), 'Albarán no encontrado: 67890');
    });

    it('translates the rendered backend message to en_US, interpolating the shipment id', () => {
      assert.equal(translateBackendError(RAW, en), 'Shipment not found: 67890.');
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      const missingT = (k) => k; // echoes the key back — simulates an unmapped locale
      assert.equal(translateBackendError(RAW, missingT), RAW);
    });
  });
});

describe('translateBackendError — cash close (ETP-4795)', () => {
  describe('exact-match rejections', () => {
    const CASES = [
      { raw: 'The close date cannot be in the future.', key: 'backendError.cashCloseDateInFuture' },
      {
        raw: 'This reconciliation already has bank-statement lines linked to it; cash close and bank reconciliation cannot share the same document.',
        key: 'backendError.cashCloseHasBankStatementLines',
      },
      {
        raw: 'Cash close is only available for cash-type financial accounts',
        key: 'backendError.cashCloseOnlyForCashAccount',
      },
    ];

    for (const { raw, key } of CASES) {
      it(`maps "${raw.slice(0, 40)}…" to ${key}`, () => {
        const es = fakeUiTranslator({ [key]: 'mensaje en español' });
        assert.equal(translateBackendError(raw, es), 'mensaje en español');
      });

      it(`returns "${raw.slice(0, 40)}…" unchanged when the key is missing (guard)`, () => {
        assert.equal(translateBackendError(raw, (k) => k), raw);
      });
    }
  });

  describe('"There is a difference of <amount>…" parameterized match', () => {
    // The amount is deliberately not interpolated — the backend sends a raw
    // BigDecimal.toPlainString(), which must never be rendered as money in the UI.
    const RAW = 'There is a difference of -162.05 and this account has no accounting concept'
      + ' configured for it. Configure a GL Item Difference in Edit account before confirming the'
      + ' close.';

    it('translates to es_ES without echoing the unformatted amount', () => {
      const es = fakeUiTranslator({
        'backendError.cashCloseNoConcept': 'Esta cuenta no tiene concepto contable de diferencias.',
      });
      assert.equal(
        translateBackendError(RAW, es),
        'Esta cuenta no tiene concepto contable de diferencias.',
      );
    });

    it('matches whatever the amount is, including a positive surplus', () => {
      const es = fakeUiTranslator({ 'backendError.cashCloseNoConcept': 'Falta el concepto.' });
      const surplus = RAW.replace('-162.05', '200');
      assert.equal(translateBackendError(surplus, es), 'Falta el concepto.');
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  describe('"The close date cannot be earlier than the last confirmed close (<date>)." match', () => {
    const RAW = 'The close date cannot be earlier than the last confirmed close (2026-07-31).';

    it('translates to es_ES, interpolating the last close date', () => {
      const es = fakeUiTranslator({
        'backendError.cashCloseDateBeforeLastClose':
          'La fecha del cierre no puede ser anterior al último cierre confirmado ({date}).',
      });
      assert.equal(
        translateBackendError(RAW, es),
        'La fecha del cierre no puede ser anterior al último cierre confirmado (2026-07-31).',
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  describe('"The movement <id> has an accounting date in a closed period." match', () => {
    const RAW = 'The movement "1000381 - Transportes Vega" has an accounting date in a closed'
      + ' period. Reopen that period or unmark the movement before confirming the close.';

    it('translates to es_ES, interpolating the movement identifier', () => {
      const es = fakeUiTranslator({
        'backendError.cashCloseLineInClosedPeriod':
          'El movimiento «{movement}» tiene fecha contable en un periodo cerrado.',
      });
      assert.equal(
        translateBackendError(RAW, es),
        'El movimiento «1000381 - Transportes Vega» tiene fecha contable en un periodo cerrado.',
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });
});

/* ETP-4896 QA follow-up: the country/IBAN family from FinancialAccountCountrySupport. The three
 * String.format-interpolated ones are why the QA-reported "Argentina has no IBAN configuration…"
 * reached the user as raw English — an exact-match table structurally cannot catch them. */

describe('translateBackendError — country/IBAN validation (ETP-4896)', () => {
  const es = fakeUiTranslator({
    'backendError.countryNoIbanConfig':
      '{country} no tiene configuración de IBAN, así que no puede usarse en una cuenta con IBAN',
    'backendError.ibanPrefixCountryMismatch':
      "El IBAN empieza con '{prefix}' pero el país seleccionado es {country} ({iso})",
    'backendError.ibanCountryLengthMismatch':
      'Un IBAN de {country} debe tener {expected} caracteres (recibidos {actual})',
    'backendError.ibanTooShort': 'El IBAN es demasiado corto',
    'backendError.ibanChecksumInvalid':
      'El IBAN no es válido: los dígitos de control no coinciden',
    'backendError.invalidCountry': 'País no válido',
    'backendError.countryIban': 'Se necesita el País para una cuenta IBAN.',
  });

  describe('"<country> has no IBAN configuration…" match — the QA-reported message', () => {
    const RAW = 'Argentina has no IBAN configuration, so it cannot be used on an account'
      + ' with an IBAN.';

    it('translates to es_ES, interpolating the country name', () => {
      assert.equal(
        translateBackendError(RAW, es),
        'Argentina no tiene configuración de IBAN, así que no puede usarse en una cuenta con IBAN',
      );
    });

    it('handles a multi-word country name', () => {
      const raw = 'United States has no IBAN configuration, so it cannot be used on an account'
        + ' with an IBAN.';
      assert.match(translateBackendError(raw, es), /^United States no tiene/);
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });

    // Guards the `return country ? { country } : null` branch: with nothing before the suffix
    // there is no country to interpolate, so the matcher must decline and the original survive.
    it('does not match when there is no country name before the suffix', () => {
      const raw = 'has no IBAN configuration, so it cannot be used on an account with an IBAN.';
      assert.equal(translateBackendError(raw, es), raw);
    });
  });

  describe('"The IBAN starts with \'X\' but the selected country is Y (Z)." match', () => {
    const RAW = "The IBAN starts with 'ES' but the selected country is Italy (IT).";

    it('translates to es_ES, interpolating prefix, country and iso', () => {
      assert.equal(
        translateBackendError(RAW, es),
        "El IBAN empieza con 'ES' pero el país seleccionado es Italy (IT)",
      );
    });

    // The country name is split on the LAST ' (' so a parenthesised name still resolves.
    it('resolves the iso from the last parenthesised token', () => {
      const raw = "The IBAN starts with 'ES' but the selected country is Bonaire (BQ) (BQ).";
      assert.equal(
        translateBackendError(raw, es),
        "El IBAN empieza con 'ES' pero el país seleccionado es Bonaire (BQ) (BQ)",
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  describe('"An IBAN for X must have N characters (received M)." match', () => {
    const RAW = 'An IBAN for Spain must have 24 characters (received 20).';

    it('translates to es_ES, interpolating country, expected and actual', () => {
      assert.equal(
        translateBackendError(RAW, es),
        'Un IBAN de Spain debe tener 24 caracteres (recibidos 20)',
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  describe('exact-match entries', () => {
    const CASES = [
      ['The IBAN is too short.', 'El IBAN es demasiado corto'],
      ['The IBAN is not valid: the check digits do not match.',
        'El IBAN no es válido: los dígitos de control no coinciden'],
      ['Invalid country', 'País no válido'],
      // Reuses the DB message's key: same rule, one Spanish phrasing.
      ['A bank account with an IBAN must have a country.',
        'Se necesita el País para una cuenta IBAN.'],
    ];

    CASES.forEach(([raw, expected]) => {
      it(`translates "${raw}"`, () => {
        assert.equal(translateBackendError(raw, es), expected);
      });
    });
  });

  it('passes an unrelated message through untouched', () => {
    const raw = 'Something else entirely went wrong';
    assert.equal(translateBackendError(raw, es), raw);
  });
});

// ETP-4891 follow-up: PSD2_IBANAutoFillFailed (com.etendoerp.psd2) — that module ships ~108
// AD_MESSAGE rows with no real es_ES AD_MESSAGE_TRL (the trl row is a verbatim copy of the
// English text), so Core resolves the same English string regardless of session locale. `%0` is
// substituted server-side with the IBAN before the message reaches the frontend, so this is a
// fixed prefix/suffix around a dynamic IBAN — same shape as the other parameterized matchers.
describe('translateBackendError — "IBAN could not be set automatically (<iban>)." parameterized match (ETP-4891)', () => {
  const en = fakeUiTranslator({
    'backendError.ibanAutoFillFailed': 'IBAN could not be set automatically ({iban}). Enter it manually in the Financial Account.',
  });
  const es = fakeUiTranslator({
    'backendError.ibanAutoFillFailed': 'No se pudo establecer el IBAN automáticamente ({iban}). Introduce el IBAN manualmente en la cuenta financiera.',
  });
  const RAW = 'IBAN could not be set automatically (DE89370400440532013000). '
    + 'Please enter it manually in the Financial Account.';

  it('translates the rendered backend message to es_ES, interpolating the IBAN', () => {
    assert.equal(
      translateBackendError(RAW, es),
      'No se pudo establecer el IBAN automáticamente (DE89370400440532013000). '
        + 'Introduce el IBAN manualmente en la cuenta financiera.',
    );
  });

  it('translates the rendered backend message to en_US (differently worded, proving the matcher — not a passthrough)', () => {
    assert.equal(
      translateBackendError(RAW, en),
      'IBAN could not be set automatically (DE89370400440532013000). '
        + 'Enter it manually in the Financial Account.',
    );
  });

  it('returns the original message unchanged when the translation key is missing (guard)', () => {
    assert.equal(translateBackendError(RAW, (k) => k), RAW);
  });

  it('does not match a message with a blank IBAN (empty capture guard)', () => {
    const blank = 'IBAN could not be set automatically (). Please enter it manually in the Financial Account.';
    assert.equal(translateBackendError(blank, es), blank);
  });

  it('does not match an unrelated message that merely mentions IBAN', () => {
    const unrelated = 'The IBAN format is invalid. Please check and enter a valid IBAN.';
    assert.equal(translateBackendError(unrelated, es), unrelated);
  });
});

// ETP-4891 follow-up: the "Sincronizar extractos" toast (ImportedStatementsTab.jsx and
// EditAccountModal.jsx's notifySyncResult — same bridge, two UI entry points). Same root cause as
// the IBAN-autofill matcher above: com.etendoerp.psd2 ships no real es_ES translation for these
// AD_MESSAGEs. Note the literal " ." (space before the period) on the first two — genuinely what
// the AD_MESSAGE template contains (verified against ad_message.msgtext), not a typo.
describe('translateBackendError — bank-statement sync result (ETP-4891)', () => {
  const es = fakeUiTranslator({
    'backendError.transactionsObtainedForAccount': 'Movimientos obtenidos para la cuenta: {account}.',
    'backendError.noNewTransactionsForAccount': 'No se encontraron movimientos nuevos para la cuenta: {account}.',
    'backendError.syncFetchFailed': 'El banco reportó un error al sincronizar: {detail}.',
  });

  describe('"Transactions obtained for the account: <name> ." parameterized match', () => {
    const RAW = 'Transactions obtained for the account: Cuenta pais españa .';

    it('translates to es_ES, interpolating the account name', () => {
      assert.equal(
        translateBackendError(RAW, es),
        'Movimientos obtenidos para la cuenta: Cuenta pais españa.',
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  describe('"No new transactions found for the account: <name> ." parameterized match', () => {
    const RAW = 'No new transactions found for the account: Cuenta pais españa .';

    it('translates to es_ES, interpolating the account name', () => {
      assert.equal(
        translateBackendError(RAW, es),
        'No se encontraron movimientos nuevos para la cuenta: Cuenta pais españa.',
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  describe('"The bank reported an error while synchronizing: <detail>." parameterized match', () => {
    const RAW = 'The bank reported an error while synchronizing: connection timed out.';

    it('translates to es_ES, interpolating the error detail', () => {
      assert.equal(
        translateBackendError(RAW, es),
        'El banco reportó un error al sincronizar: connection timed out.',
      );
    });

    it('returns the original message unchanged when the translation key is missing (guard)', () => {
      assert.equal(translateBackendError(RAW, (k) => k), RAW);
    });
  });

  it('does not cross-match between the three sync skeletons', () => {
    const raw = 'Transactions obtained for the account: Cuenta pais españa .';
    // Sanity: the "no new transactions" and "sync failed" translations must NOT appear.
    const result = translateBackendError(raw, es);
    assert.doesNotMatch(result, /No se encontraron/);
    assert.doesNotMatch(result, /reportó un error/);
  });
});
