import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACTS_TEXT_FIELD_LIMITS, hasUnsafeChars, getContactsTextFieldError, filterContactsInputValue } from '../contactsFieldValidation.js';

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
