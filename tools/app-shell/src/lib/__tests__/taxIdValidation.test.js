/**
 * ETP-5190 — Spanish tax identifier validation, browser side.
 *
 * A `*.test.js` under `src/lib/`, which IS covered by the root `npm run test` node-runner glob
 * (unlike `src/pages/`, see firstStepsConfig.vitest.js's header). Pure module, no DOM.
 *
 * The cases below are deliberately the SAME ones as
 * `com.etendoerp.go`'s `SpanishTaxIdValidatorTest`: the two implementations must agree, and a
 * shared case list is the only thing that makes a divergence show up as a failure rather than
 * as a user being told "invalid" by one side and accepted by the other.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTaxIdError,
  getTaxIdFieldError,
  isTaxIdField,
  normalizeTaxId,
  TAX_ID_FORMAT_ERROR_KEY,
  TAX_ID_CHECK_DIGIT_ERROR_KEY,
} from '../taxIdValidation.js';

// Check-digit-correct identifiers of each accepted shape. The first two are the SAME base
// number written with each of the two legal control characters, which is what makes the
// "both representations" test below meaningful.
const VALID_CIF_LETTER = 'B1234567D';
const VALID_CIF_DIGIT = 'B12345674';
const VALID_DNI = '12345678Z';
const VALID_NIE_X = 'X1234567L';
const VALID_NIE_Y = 'Y1234567X';
const VALID_NIE_Z = 'Z1234567R';

describe('getTaxIdError — accepts every shape a real tenant can have', () => {
  test('accepts a CIF whose control character is a letter', () => {
    assert.equal(getTaxIdError(VALID_CIF_LETTER), null);
  });

  test('accepts a CIF whose control character is a digit', () => {
    // Both representations are legal and which one is used depends on the leading letter.
    // Accepting only one half would reject real companies.
    assert.equal(getTaxIdError(VALID_CIF_DIGIT), null);
    assert.equal(getTaxIdError('A58818501'), null);
  });

  test('accepts a natural-person DNI', () => {
    // REGRESSION GUARD: the signup wizard offers businessType `freelancer`, and an autónomo
    // has a personal DNI, not a company CIF. Validating only the CIF form would have rejected
    // every freelancer in the product.
    assert.equal(getTaxIdError(VALID_DNI), null);
  });

  test('accepts a NIE under each of its three prefixes', () => {
    for (const nie of [VALID_NIE_X, VALID_NIE_Y, VALID_NIE_Z]) {
      assert.equal(getTaxIdError(nie), null, nie);
    }
  });

  test('accepts an empty value — requiredness is a separate mechanism', () => {
    for (const empty of ['', '   ', null, undefined]) {
      assert.equal(getTaxIdError(empty), null, JSON.stringify(empty));
    }
  });
});

describe('getTaxIdError — rejects a wrong check digit', () => {
  test('rejects a CIF whose control character is wrong', () => {
    assert.equal(getTaxIdError('B12345679'), TAX_ID_CHECK_DIGIT_ERROR_KEY);
  });

  test('rejects a DNI whose control letter is wrong', () => {
    assert.equal(getTaxIdError('12345678A'), TAX_ID_CHECK_DIGIT_ERROR_KEY);
  });

  test('rejects a NIE whose control letter belongs to another prefix', () => {
    // Y1234567X is valid; X1234567X is not — proving the X/Y/Z -> 0/1/2 substitution is
    // actually applied and not silently skipped.
    assert.equal(getTaxIdError('X1234567X'), TAX_ID_CHECK_DIGIT_ERROR_KEY);
    assert.equal(getTaxIdError(VALID_NIE_Y), null);
  });

  test('separates "wrong shape" from "wrong check digit"', () => {
    // The two send the user to different places, so they must not collapse into one message.
    assert.equal(getTaxIdError('B12345679'), TAX_ID_CHECK_DIGIT_ERROR_KEY);
    assert.equal(getTaxIdError('BB1234567'), TAX_ID_FORMAT_ERROR_KEY);
  });
});

describe('getTaxIdError — rejects a wrong shape', () => {
  test('rejects a CIF leading letter that is not an entity type', () => {
    // I, O, T, X, Y and Z are not CIF entity letters. X/Y/Z are NIE prefixes, so those fall
    // through to the NIE rule instead of being format errors.
    for (const value of ['I1234567A', 'O1234567A', 'T1234567A']) {
      assert.equal(getTaxIdError(value), TAX_ID_FORMAT_ERROR_KEY, value);
    }
  });

  test('rejects the wrong number of digits', () => {
    for (const value of ['B1234567', 'B123456789', '1234567Z', '123456789Z']) {
      assert.equal(getTaxIdError(value), TAX_ID_FORMAT_ERROR_KEY, value);
    }
  });

  test('rejects a value with no control character', () => {
    assert.equal(getTaxIdError('12345678'), TAX_ID_FORMAT_ERROR_KEY);
  });

  test('rejects free text and other countries VAT numbers', () => {
    for (const value of ['not a nif', 'ES12345678Z', 'DE123456789', '---']) {
      assert.equal(getTaxIdError(value), TAX_ID_FORMAT_ERROR_KEY, value);
    }
  });
});

describe('normalizeTaxId — what the user is allowed to paste', () => {
  test('uppercases', () => {
    assert.equal(getTaxIdError('b1234567d'), null);
    assert.equal(getTaxIdError('12345678z'), null);
  });

  test('strips the separators people paste in', () => {
    // A NIF copied out of a document commonly carries dots or a hyphen. Rejecting on
    // punctuation the user cannot see the problem with is worse than normalizing it.
    for (const value of ['B-1234567D', 'B.1234567D', ' B 1234 567D ', '12.345.678-Z']) {
      assert.equal(getTaxIdError(value), null, value);
    }
  });

  test('returns an empty string for blank input rather than throwing', () => {
    assert.equal(normalizeTaxId(null), '');
    assert.equal(normalizeTaxId('  '), '');
  });

  test('does not strip characters that make the value wrong', () => {
    // Only whitespace, `.` and `-` are noise; a `/` or `_` is a real format error.
    assert.equal(getTaxIdError('B/1234567D'), TAX_ID_FORMAT_ERROR_KEY);
    assert.equal(getTaxIdError('B_1234567D'), TAX_ID_FORMAT_ERROR_KEY);
  });
});

describe('getTaxIdFieldError — the descriptor form', () => {
  test('validates a taxID-named field', () => {
    assert.equal(getTaxIdFieldError({ key: 'taxID' }, 'B12345679'),
      TAX_ID_CHECK_DIGIT_ERROR_KEY);
    assert.equal(getTaxIdFieldError({ key: 'taxID' }, VALID_CIF_LETTER), null);
  });

  test('validates the signup wizard field name too', () => {
    assert.equal(getTaxIdFieldError({ key: 'fiscalIdValue' }, 'nope'), TAX_ID_FORMAT_ERROR_KEY);
  });

  test('ignores every other field, however similarly named', () => {
    // REGRESSION GUARD: `taxIdType` is a Contacts field holding "1"/"2" and `taxCategory` is
    // an id. A substring match on "tax" would have started rejecting both.
    for (const key of ['taxIdType', 'taxCategory', 'tax', 'name', 'email']) {
      assert.equal(getTaxIdFieldError({ key }, 'anything at all'), null, key);
    }
  });

  test('tolerates a missing or malformed descriptor', () => {
    assert.equal(getTaxIdFieldError(null, 'nope'), null);
    assert.equal(getTaxIdFieldError({}, 'nope'), null);
    assert.equal(isTaxIdField(undefined), false);
  });

  test('recognises the field by column name as well as key', () => {
    assert.equal(isTaxIdField({ columnName: 'TaxID' }), true);
  });
});
