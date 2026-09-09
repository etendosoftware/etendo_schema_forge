// PSD-23 — client-side max-length validation for the Financial Account free-text fields.
//
// The bug: typing a description longer than the column allows let the request LEAVE the browser
// and come back as a 400. The message is translated (matchFieldTooLong in lib/backendErrors.js),
// but the round-trip should never happen — no free-text field of this window validated its length
// on the client at all.
//
// This is the pure-logic half of the fix. It mirrors the sibling helper
// `components/contract-ui/contactsFieldValidation.js` (same `{ key, params } | null` contract as
// `lib/numericValidation.js`'s getNumericFieldError), and is tested the same way that sibling is:
// node:test, importing the module directly (no React, no aliases).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCIAL_ACCOUNT_FIELD_LIMITS,
  getMaxLengthError,
} from '../fieldLengthValidation.js';

describe('FINANCIAL_ACCOUNT_FIELD_LIMITS', () => {
  // These three numbers are NOT free parameters. They are the AD column widths published by the
  // window contract, at
  //   artifacts/financial-account/contract.json
  //     → frontendContract.entities.<entity>.fields[].validation.maxLength
  // If someone "rounds" one of them by hand, the client gate stops matching the column and the
  // 400 this ticket removes comes straight back. That is what this assertion guards.
  it('matches the maxLength published by the financial-account contract', () => {
    assert.deepEqual(FINANCIAL_ACCOUNT_FIELD_LIMITS, {
      transactionDescription: 255,
      statementLineDescription: 2000,
      statementLineReference: 30,
    });
  });

  it('declares the transaction description limit reported by PSD-23 (255)', () => {
    assert.equal(FINANCIAL_ACCOUNT_FIELD_LIMITS.transactionDescription, 255);
  });

  it('declares the bank-statement-line limits (description 2000, reference 30)', () => {
    assert.equal(FINANCIAL_ACCOUNT_FIELD_LIMITS.statementLineDescription, 2000);
    assert.equal(FINANCIAL_ACCOUNT_FIELD_LIMITS.statementLineReference, 30);
  });
});

describe('getMaxLengthError — empty values', () => {
  // Emptiness is the `required` gate's business, never this helper's — same split as
  // getNumericFieldError and getContactsTextFieldError.
  it('returns null for an empty string', () => {
    assert.equal(getMaxLengthError('', 255), null);
  });

  it('returns null for null', () => {
    assert.equal(getMaxLengthError(null, 255), null);
  });

  it('returns null for undefined', () => {
    assert.equal(getMaxLengthError(undefined, 255), null);
  });
});

describe('getMaxLengthError — boundary', () => {
  it('returns null at exactly the limit (255 chars is still valid)', () => {
    assert.equal(getMaxLengthError('x'.repeat(255), 255), null);
  });

  it('returns the error descriptor at limit + 1 (the 256-char case from the ticket)', () => {
    assert.deepEqual(getMaxLengthError('x'.repeat(256), 255), {
      key: 'fieldMaxLengthError',
      params: { maxLength: 255 },
    });
  });

  it('returns null one character below the limit', () => {
    assert.equal(getMaxLengthError('x'.repeat(254), 255), null);
  });

  it('reports the limit it was given, not a hardcoded 255', () => {
    // The same helper serves the 2000-char statement description and the 30-char reference.
    assert.deepEqual(getMaxLengthError('x'.repeat(31), 30), {
      key: 'fieldMaxLengthError',
      params: { maxLength: 30 },
    });
    assert.deepEqual(getMaxLengthError('x'.repeat(2001), 2000), {
      key: 'fieldMaxLengthError',
      params: { maxLength: 2000 },
    });
    assert.equal(getMaxLengthError('x'.repeat(2000), 2000), null);
  });
});

describe('getMaxLengthError — missing limit', () => {
  // A field with no declared limit must never block the user: an undefined limit means
  // "unconstrained", not "limit 0".
  it('returns null when the limit is null', () => {
    assert.equal(getMaxLengthError('x'.repeat(5000), null), null);
  });

  it('returns null when the limit is undefined', () => {
    assert.equal(getMaxLengthError('x'.repeat(5000), undefined), null);
  });

  it('returns null when the limit is omitted entirely', () => {
    assert.equal(getMaxLengthError('x'.repeat(5000)), null);
  });
});

describe('getMaxLengthError — non-string values', () => {
  it('casts a number before measuring it', () => {
    // 5 digits, limit 5 → valid; limit 4 → over.
    assert.equal(getMaxLengthError(12345, 5), null);
    assert.deepEqual(getMaxLengthError(12345, 4), {
      key: 'fieldMaxLengthError',
      params: { maxLength: 4 },
    });
  });

  it('treats the number 0 as the one-character string "0", not as an empty value', () => {
    assert.equal(getMaxLengthError(0, 1), null);
    assert.deepEqual(getMaxLengthError(0, 0), {
      key: 'fieldMaxLengthError',
      params: { maxLength: 0 },
    });
  });

  it('casts a boolean before measuring it', () => {
    assert.equal(getMaxLengthError(true, 4), null); // "true"
    assert.deepEqual(getMaxLengthError(false, 4), { // "false"
      key: 'fieldMaxLengthError',
      params: { maxLength: 4 },
    });
  });
});

describe('getMaxLengthError — descriptor shape', () => {
  it('returns the i18n key that already exists in both locale files', () => {
    // `fieldMaxLengthError` ships in locales/en_US.json ("Maximum length is {maxLength}
    // characters") and locales/es_ES.json ("La longitud máxima es de {maxLength} caracteres").
    // The callers render it as `ui(err.key, err.params)`, so the params key must be `maxLength`
    // verbatim or the placeholder is left uninterpolated on screen.
    const err = getMaxLengthError('x'.repeat(300), 255);
    assert.equal(err.key, 'fieldMaxLengthError');
    assert.deepEqual(Object.keys(err.params), ['maxLength']);
  });

  it('never returns a bare string (callers interpolate a descriptor, like getNumericFieldError)', () => {
    const err = getMaxLengthError('x'.repeat(300), 255);
    assert.equal(typeof err, 'object');
    assert.notEqual(err, null);
  });
});
