import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * ETP-5031 (QA round) — `contactsFieldValidation.js` reuses the shared Spanish
 * tax-id algorithm from `src/lib/taxIdValidation.js` (rather than re-implementing
 * the check-digit tables, which would drift from the binding Java side). That
 * import is written RELATIVE in the module under test, not as the `@/lib/…`
 * Vite alias, precisely so this plain `node --test` suite can load it with no
 * module-customization ceremony — see the comment on the import itself.
 */
import {
  CONTACTS_TEXT_FIELD_LIMITS,
  hasUnsafeChars,
  getContactsTextFieldError,
  filterContactsInputValue,
  getContactsTaxIdError,
  CONTACTS_TAX_ID_FIELD,
  CONTACTS_TAX_ID_KEY_FIELD,
  TAX_ID_PASSPORT_ERROR_KEY,
} from '../contactsFieldValidation.js';
import {
  TAX_ID_FORMAT_ERROR_KEY,
  TAX_ID_CHECK_DIGIT_ERROR_KEY,
} from '../../../lib/taxIdValidation.js';

// ETP-5031 — text-field validation SCOPED to the Contacts (GO) window only.
// The gate (`windowName !== 'contacts'` → null) is the single most important
// behavior of this module: it is what keeps the feature from affecting any
// other window, so it gets its own describe block up front.
describe('getContactsTextFieldError — window scoping', () => {
  it('is a no-op for any window other than "contacts", regardless of the value', () => {
    const overLong = 'x'.repeat(1000);
    assert.equal(getContactsTextFieldError('sales-order', { key: 'name' }, overLong), null);
    assert.equal(getContactsTextFieldError('purchase-order', { key: 'name' }, '<script>'), null);
    assert.equal(getContactsTextFieldError(null, { key: 'name' }, '<script>'), null);
    assert.equal(getContactsTextFieldError(undefined, { key: 'name' }, '<script>'), null);
  });

  it('is a no-op for a field key with no declared limit, even inside contacts', () => {
    assert.equal(getContactsTextFieldError('contacts', { key: 'someUnknownField' }, 'x'.repeat(1000)), null);
  });
});

describe('getContactsTextFieldError — max length', () => {
  it('returns null for empty/null/undefined (required handles emptiness, not this helper)', () => {
    assert.equal(getContactsTextFieldError('contacts', { key: 'name' }, ''), null);
    assert.equal(getContactsTextFieldError('contacts', { key: 'name' }, null), null);
    assert.equal(getContactsTextFieldError('contacts', { key: 'name' }, undefined), null);
  });

  it('accepts a value at or under the declared limit', () => {
    const limit = CONTACTS_TEXT_FIELD_LIMITS.name;
    assert.equal(getContactsTextFieldError('contacts', { key: 'name' }, 'x'.repeat(limit)), null);
    assert.equal(getContactsTextFieldError('contacts', { key: 'name' }, 'x'.repeat(limit - 1)), null);
  });

  it('flags a value exceeding the declared limit with fieldMaxLengthError and the limit as maxLength param', () => {
    const limit = CONTACTS_TEXT_FIELD_LIMITS.etgoPhone;
    assert.deepEqual(
      getContactsTextFieldError('contacts', { key: 'etgoPhone' }, 'x'.repeat(limit + 1)),
      { key: 'fieldMaxLengthError', params: { maxLength: limit } },
    );
  });

  it('uses the correct per-field limit (contact.email 255 vs businessPartner.taxID 20)', () => {
    assert.equal(getContactsTextFieldError('contacts', { key: 'email' }, 'x'.repeat(255)), null);
    assert.deepEqual(
      getContactsTextFieldError('contacts', { key: 'taxID' }, 'x'.repeat(21)),
      { key: 'fieldMaxLengthError', params: { maxLength: 20 } },
    );
  });
});

describe('hasUnsafeChars', () => {
  it('rejects a script tag', () => {
    assert.equal(hasUnsafeChars('<script>alert(1)</script>'), true);
  });

  it('rejects a bare angle bracket', () => {
    assert.equal(hasUnsafeChars('a < b'), true);
    assert.equal(hasUnsafeChars('a > b'), true);
  });

  it('rejects ASCII control characters', () => {
    assert.equal(hasUnsafeChars('abc\x00def'), true);
    assert.equal(hasUnsafeChars('abc\x1Fdef'), true);
  });

  it('accepts tab, newline and carriage return (normal editing characters)', () => {
    assert.equal(hasUnsafeChars('line one\nline two'), false);
    assert.equal(hasUnsafeChars('a\tb'), false);
    assert.equal(hasUnsafeChars('a\r\nb'), false);
  });

  it('accepts plain text, digits and common punctuation', () => {
    assert.equal(hasUnsafeChars('Acme Corp. S.A. (Sucursal #2)'), false);
    assert.equal(hasUnsafeChars('+54 11 5555-1234'), false);
  });
});

describe('getContactsTextFieldError — unsafe characters', () => {
  it('flags a <script> value with fieldInvalidCharacters (no params)', () => {
    assert.deepEqual(
      getContactsTextFieldError('contacts', { key: 'name' }, '<script>alert(1)</script>'),
      { key: 'fieldInvalidCharacters', params: {} },
    );
  });

  it('flags plain symbols/free text on the phone field per the AC (abc!@#)', () => {
    // ETP-5031 AC: "Teléfono ... abc!@# ... error de validación". Unsafe-char check
    // does not itself reject letters/symbols (that is recipientEdits' phone format
    // check) but must never let a script/control-char payload through on phone either.
    assert.deepEqual(
      getContactsTextFieldError('contacts', { key: 'etgoPhone' }, '<abc>'),
      { key: 'fieldInvalidCharacters', params: {} },
    );
  });

  it('checks length before unsafe characters (both violations → length error first)', () => {
    const limit = CONTACTS_TEXT_FIELD_LIMITS.name;
    const overLongWithScript = '<script>' + 'x'.repeat(limit);
    assert.deepEqual(
      getContactsTextFieldError('contacts', { key: 'name' }, overLongWithScript),
      { key: 'fieldMaxLengthError', params: { maxLength: limit } },
    );
  });

  it('accepts a safe value under the limit', () => {
    assert.equal(getContactsTextFieldError('contacts', { key: 'name' }, 'Acme Corp.'), null);
    assert.equal(getContactsTextFieldError('contacts', { key: 'etgoEmail' }, 'user@example.com'), null);
  });
});

// ETP-5031 bug report explicitly named "Nombre" — businessPartner.name was already
// covered above, but the same "Name" concept also exists as businessPartner's split
// etgoFirstname/etgoLastname AND as the separate `contact` entity's firstName/lastName
// (headerScope: 'contact' per decisions.json). None of these four keys had a literal
// test before this PR — verifying the actual runtime keys (not just 'name') catches a
// map/key-typo regression that a same-limit-value coincidence with 'name' would hide.
describe('getContactsTextFieldError — Name fields (businessPartner split + contact entity)', () => {
  for (const key of ['etgoFirstname', 'etgoLastname', 'firstName', 'lastName']) {
    it(`enforces the declared limit for "${key}"`, () => {
      const limit = CONTACTS_TEXT_FIELD_LIMITS[key];
      assert.equal(limit, 60, `expected ${key} limit to be 60 per contract.json`);
      assert.equal(getContactsTextFieldError('contacts', { key }, 'x'.repeat(limit)), null);
      assert.deepEqual(
        getContactsTextFieldError('contacts', { key }, 'x'.repeat(limit + 1)),
        { key: 'fieldMaxLengthError', params: { maxLength: limit } },
      );
    });

    it(`flags unsafe characters for "${key}"`, () => {
      assert.deepEqual(
        getContactsTextFieldError('contacts', { key }, '<script>alert(1)</script>'),
        { key: 'fieldInvalidCharacters', params: {} },
      );
    });
  }
});

// Edge cases beyond the boundary/unsafe-char checks already covered: unicode/emoji
// (JS string .length counts UTF-16 code units, so an astral emoji counts as 2 — this
// documents the actual behavior rather than assuming code-point counting), pasted
// multi-line text, and every declared field key at least exercised once so a future
// key added to CONTACTS_TEXT_FIELD_LIMITS without a matching test doesn't go unnoticed.
describe('getContactsTextFieldError — additional edge cases', () => {
  it('counts an astral-plane emoji as 2 UTF-16 units (documents actual .length semantics)', () => {
    const limit = CONTACTS_TEXT_FIELD_LIMITS.position; // 40
    // 39 ASCII chars + 1 emoji (2 code units) = 41 > 40 by .length, even though a
    // human would count 40 "characters". This is current, intentional behavior of
    // a .length-based check, not a code-point-aware one — documented so a future
    // change to code-point counting is a deliberate decision, not an accidental fix.
    const value = 'x'.repeat(limit - 1) + '😀';
    assert.equal(value.length, limit + 1);
    assert.deepEqual(
      getContactsTextFieldError('contacts', { key: 'position' }, value),
      { key: 'fieldMaxLengthError', params: { maxLength: limit } },
    );
  });

  it('accepts pasted multi-line text (newlines are not unsafe) as long as it fits the limit', () => {
    const limit = CONTACTS_TEXT_FIELD_LIMITS.comments; // 2000, generous field
    const value = 'Line one\nLine two\r\nLine three';
    assert.ok(value.length <= limit);
    assert.equal(getContactsTextFieldError('contacts', { key: 'comments' }, value), null);
  });

  it('every declared field key is individually exercised at its own boundary', () => {
    for (const [key, limit] of Object.entries(CONTACTS_TEXT_FIELD_LIMITS)) {
      assert.equal(
        getContactsTextFieldError('contacts', { key }, 'x'.repeat(limit)),
        null,
        `${key} should accept exactly ${limit} chars`,
      );
      assert.deepEqual(
        getContactsTextFieldError('contacts', { key }, 'x'.repeat(limit + 1)),
        { key: 'fieldMaxLengthError', params: { maxLength: limit } },
        `${key} should reject ${limit + 1} chars`,
      );
    }
  });
});

// ETP-5031 follow-up — real-time keystroke filtering for phone-like fields.
// Reported gap: the save-time format check (getPhoneFieldError) blocked "ABCDEFG"
// on Save, but the user could still TYPE it into the field with no feedback until
// then. This filters disallowed characters out as the value is typed, so a
// disallowed character never even appears in the input.
describe('filterContactsInputValue', () => {
  it('is a no-op for any window other than "contacts"', () => {
    assert.equal(filterContactsInputValue('sales-order', { key: 'etgoPhone' }, 'ABCDEFG'), 'ABCDEFG');
    assert.equal(filterContactsInputValue(null, { key: 'etgoPhone' }, 'ABCDEFG'), 'ABCDEFG');
  });

  it('strips letters and symbols from a phone-like field, keeping the allowed charset', () => {
    assert.equal(filterContactsInputValue('contacts', { key: 'etgoPhone' }, 'ABCDEFG'), '');
    assert.equal(filterContactsInputValue('contacts', { key: 'phone' }, 'abc!@#123'), '123');
  });

  it('keeps digits, +, -, (, ), ., and whitespace on a phone-like field', () => {
    const allowed = '+54 (11) 5555-1234.0';
    assert.equal(filterContactsInputValue('contacts', { key: 'etgoPhone' }, allowed), allowed);
  });

  it('matches isPhoneField detection: key OR column containing "phone", text-like types only', () => {
    assert.equal(filterContactsInputValue('contacts', { key: 'altPhone', type: 'text' }, 'abc123'), '123');
    assert.equal(filterContactsInputValue('contacts', { column: 'EM_Etgo_Phone', type: 'text' }, 'abc123'), '123');
    // Non-text-like type (e.g. a hypothetical boolean/selector column) is never filtered.
    assert.equal(filterContactsInputValue('contacts', { key: 'phone', type: 'boolean' }, 'abc123'), 'abc123');
  });

  it('does not touch a non-phone field, even inside contacts', () => {
    assert.equal(filterContactsInputValue('contacts', { key: 'name' }, '<script>abc'), '<script>abc');
  });

  it('returns an empty string unchanged', () => {
    assert.equal(filterContactsInputValue('contacts', { key: 'etgoPhone' }, ''), '');
  });
});

// ---------------------------------------------------------------------------
// ETP-5031 (QA round) — tax identifier CONTENT validation.
//
// Fixtures are the SAME check-digit-correct identifiers used by
// `lib/__tests__/taxIdValidation.test.js` (which in turn mirrors the binding
// Java `SpanishTaxIdValidatorTest`). Reused verbatim rather than invented: a
// fixture with a miscomputed control character would make these tests pass for
// the wrong reason (rejected as "invalid" when the dispatch is what is under
// test). Each one is derivable from the algorithm in lib/taxIdValidation.js:
//   B1234567 -> even digits (2,4,6) = 12; odd digits (1,3,5,7) doubled and
//   digit-summed = 2+6+1+5 = 14; (10 - 26 % 10) % 10 = 4, whose letter is
//   'JABCDEFGHI'[4] = 'D'. 12345678 % 23 = 14 -> 'TRWAGMYFPDXBNJZSQVHLCKE'[14]
//   = 'Z'. X1234567 -> 01234567 % 23 = 19 -> 'L'.
// ---------------------------------------------------------------------------
const VALID_CIF_LETTER = 'B1234567D';
const VALID_CIF_DIGIT = 'B12345674';
const VALID_DNI = '12345678Z';
const VALID_NIE_X = 'X1234567L';
const VALID_NIE_Y = 'Y1234567X';
const VALID_NIE_Z = 'Z1234567R';

const TAX_ID_FIELD = { key: CONTACTS_TAX_ID_FIELD };
/** A record declaring the number is a Spanish NIF/CIF/NIE (`EM_OBTIK_Tax_ID_Key` = '1'). */
const nifRecord = () => ({ [CONTACTS_TAX_ID_KEY_FIELD]: '1' });
/** A record declaring the number is a passport (`EM_OBTIK_Tax_ID_Key` = '3'). */
const passportRecord = () => ({ [CONTACTS_TAX_ID_KEY_FIELD]: '3' });

describe('getContactsTaxIdError — gates', () => {
  it('exports the field keys it dispatches on, matching the AD columns', () => {
    // Guards against a silent rename: the whole feature keys off these two
    // runtime field keys (AD columns `TaxID` and `EM_OBTIK_Tax_ID_Key`).
    assert.equal(CONTACTS_TAX_ID_FIELD, 'taxID');
    assert.equal(CONTACTS_TAX_ID_KEY_FIELD, 'oBTIKTaxIDKey');
    assert.equal(TAX_ID_PASSPORT_ERROR_KEY, 'taxIdInvalidPassport');
  });

  it('is a no-op for any window other than "contacts", however invalid the value', () => {
    for (const windowName of ['sales-order', 'purchase-order', 'organization', null, undefined, '']) {
      assert.equal(
        getContactsTaxIdError(windowName, TAX_ID_FIELD, 'not a nif at all', nifRecord()),
        null,
        String(windowName),
      );
    }
  });

  it('is a no-op for any field other than taxID, even inside contacts', () => {
    for (const key of ['name', 'etgoPhone', 'fiscalIdValue', 'TaxID', 'taxid', undefined]) {
      assert.equal(
        getContactsTaxIdError('contacts', { key }, 'not a nif at all', nifRecord()),
        null,
        String(key),
      );
    }
    // A missing/malformed descriptor must not throw either.
    assert.equal(getContactsTaxIdError('contacts', null, 'not a nif', nifRecord()), null);
    assert.equal(getContactsTaxIdError('contacts', {}, 'not a nif', nifRecord()), null);
  });

  it('treats an empty value as valid whatever the document type (required is a separate mechanism)', () => {
    for (const record of [nifRecord(), passportRecord()]) {
      for (const empty of ['', '   ', '\t', null, undefined]) {
        assert.equal(
          getContactsTaxIdError('contacts', TAX_ID_FIELD, empty, record),
          null,
          JSON.stringify(empty),
        );
      }
    }
  });
});

describe('getContactsTaxIdError — document-type dispatch', () => {
  it('does NOT validate for any document type other than NIF (1) and passport (3)', () => {
    // '2' (NIF-IVA/other), '4'-'7' and the "no type chosen yet" cases: with no
    // declared type there is no rule to apply, so a value that would be garbage
    // under the NIF rules must still be accepted.
    for (const type of ['2', '4', '5', '6', '7', '0', '', null, undefined, 'X']) {
      const record = { [CONTACTS_TAX_ID_KEY_FIELD]: type };
      assert.equal(
        getContactsTaxIdError('contacts', TAX_ID_FIELD, 'garbage!!!', record),
        null,
        String(type),
      );
    }
  });

  it('does NOT validate when the record itself is missing', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'garbage!!!', null), null);
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'garbage!!!', undefined), null);
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'garbage!!!', {}), null);
  });

  it('dispatches on the type: the SAME value is valid as a passport and invalid as a NIF', () => {
    // The core of the feature — one column, two meanings, decided by the sibling
    // field of the same record.
    const value = 'AB123456';
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, value, passportRecord()), null);
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, value, nifRecord()),
      { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
    );
  });

  it('accepts a numeric document type only as the string "1"/"3" (AD stores it as a string)', () => {
    // Documents actual behavior: the record value is stringified, so a numeric 1
    // coming from a lax caller still dispatches to the NIF branch.
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, 'garbage!!!', { [CONTACTS_TAX_ID_KEY_FIELD]: 1 }),
      { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
    );
  });
});

describe('getContactsTaxIdError — NIF branch (type 1): DNI', () => {
  it('accepts a DNI with the correct control letter', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, VALID_DNI, nifRecord()), null);
  });

  it('rejects a DNI with a wrong control letter as a CHECK DIGIT error', () => {
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, '12345678A', nifRecord()),
      { key: TAX_ID_CHECK_DIGIT_ERROR_KEY, params: {} },
    );
  });

  it('rejects a malformed DNI as a FORMAT error — a different key from a wrong check digit', () => {
    // The two send the user to different places (retype the letter vs retype the
    // whole number), so they must never collapse into one message.
    for (const value of ['1234567Z', '123456789Z', '12345678']) {
      assert.deepEqual(
        getContactsTaxIdError('contacts', TAX_ID_FIELD, value, nifRecord()),
        { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
        value,
      );
    }
  });
});

describe('getContactsTaxIdError — NIF branch (type 1): NIE', () => {
  it('accepts a NIE under each of its three prefixes', () => {
    for (const nie of [VALID_NIE_X, VALID_NIE_Y, VALID_NIE_Z]) {
      assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, nie, nifRecord()), null, nie);
    }
  });

  it('rejects a NIE whose control letter belongs to another prefix (X/Y/Z -> 0/1/2 is applied)', () => {
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, 'X1234567X', nifRecord()),
      { key: TAX_ID_CHECK_DIGIT_ERROR_KEY, params: {} },
    );
  });

  it('rejects a NIE-shaped value with a non-NIE prefix as a FORMAT error', () => {
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, 'T1234567A', nifRecord()),
      { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
    );
  });
});

describe('getContactsTaxIdError — NIF branch (type 1): CIF', () => {
  it('accepts a CIF whose control character is a LETTER', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, VALID_CIF_LETTER, nifRecord()), null);
  });

  it('accepts a CIF whose control character is a DIGIT', () => {
    // Both representations are legal and which one an entity uses depends on the
    // leading letter — accepting only one half would reject real companies.
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, VALID_CIF_DIGIT, nifRecord()), null);
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'A58818501', nifRecord()), null);
  });

  it('accepts both control representations of the SAME base number', () => {
    // B1234567D and B12345674 are the same company written two ways.
    assert.equal(VALID_CIF_LETTER.slice(0, 8), VALID_CIF_DIGIT.slice(0, 8));
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, VALID_CIF_LETTER, nifRecord()), null);
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, VALID_CIF_DIGIT, nifRecord()), null);
  });

  it('rejects a CIF with a wrong control character as a CHECK DIGIT error', () => {
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, 'B12345679', nifRecord()),
      { key: TAX_ID_CHECK_DIGIT_ERROR_KEY, params: {} },
    );
  });

  it('rejects a non-entity leading letter as a FORMAT error', () => {
    for (const value of ['I1234567A', 'O1234567A', 'BB1234567']) {
      assert.deepEqual(
        getContactsTaxIdError('contacts', TAX_ID_FIELD, value, nifRecord()),
        { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
        value,
      );
    }
  });
});

describe('getContactsTaxIdError — NIF branch (type 1): normalization', () => {
  it('accepts lowercase input', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'b1234567d', nifRecord()), null);
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, '12345678z', nifRecord()), null);
  });

  it('accepts the separators people paste in (spaces, dots, hyphens)', () => {
    for (const value of ['B-1234567D', 'B.1234567D', ' B 1234 567D ', '12.345.678-Z']) {
      assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, value, nifRecord()), null, value);
    }
  });

  it('does NOT strip characters that make the value genuinely wrong', () => {
    for (const value of ['B/1234567D', 'B_1234567D', 'ES12345678Z']) {
      assert.deepEqual(
        getContactsTaxIdError('contacts', TAX_ID_FIELD, value, nifRecord()),
        { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
        value,
      );
    }
  });

  it('rejects a value made ENTIRELY of separators rather than treating it as empty', () => {
    // "---" normalizes to the empty string; waving it through would store it as a NIF.
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, '---', nifRecord()),
      { key: TAX_ID_FORMAT_ERROR_KEY, params: {} },
    );
  });
});

describe('getContactsTaxIdError — passport branch (type 3)', () => {
  it('accepts an alphanumeric passport number of 1 to 9 characters', () => {
    for (const value of ['A', 'AB123456', '123456789', 'ABCDEFGHI']) {
      assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, value, passportRecord()), null, value);
    }
  });

  it('accepts exactly 9 characters (the ICAO maximum) and rejects 10', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'AB1234567', passportRecord()), null);
    assert.deepEqual(
      getContactsTaxIdError('contacts', TAX_ID_FIELD, 'AB12345678', passportRecord()),
      { key: TAX_ID_PASSPORT_ERROR_KEY, params: {} },
    );
  });

  it('uppercases before matching, so a lowercase passport is accepted', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, 'ab123456', passportRecord()), null);
  });

  it('trims surrounding whitespace but rejects INNER whitespace and punctuation', () => {
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, '  AB123456  ', passportRecord()), null);
    for (const value of ['AB 123456', 'AB-123456', 'AB.123456', 'AB_123456', 'ÑB123456', 'AB123456!']) {
      assert.deepEqual(
        getContactsTaxIdError('contacts', TAX_ID_FIELD, value, passportRecord()),
        { key: TAX_ID_PASSPORT_ERROR_KEY, params: {} },
        value,
      );
    }
  });

  it('does NOT apply the Spanish check-digit rules to a passport', () => {
    // '12345678A' is a check-digit-invalid DNI, but a perfectly shaped passport.
    assert.equal(getContactsTaxIdError('contacts', TAX_ID_FIELD, '12345678A', passportRecord()), null);
  });
});
