import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmailAddress,
  isValidEmailAddress,
  normalizeRecipientList,
  buildRecipientEdits,
  isEmailField,
  getEmailFieldError,
  isSecureUrl,
  isWebsiteField,
  getWebsiteFieldError,
  isValidPhone,
  isPhoneField,
  getPhoneFieldError,
} from '../recipientEdits.js';

// ETP-4226 — recipientEdits is the pure diff layer that turns the user-edited
// recipient set into the minimal `recipientEdits` payload sent to the backend.
// A send whose recipients are untouched MUST produce `null` so the request is
// byte-identical to the pre-feature behavior (server derives the idempotency key).

describe('normalizeEmailAddress', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(normalizeEmailAddress('  user@example.com  '), 'user@example.com');
  });

  it('lowercases only the domain, preserving the local part case', () => {
    assert.equal(normalizeEmailAddress('John.Doe@Example.COM'), 'John.Doe@example.com');
  });

  it('returns empty string for null', () => {
    assert.equal(normalizeEmailAddress(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(normalizeEmailAddress(undefined), '');
  });

  it('returns empty string for an empty/whitespace string', () => {
    assert.equal(normalizeEmailAddress(''), '');
    assert.equal(normalizeEmailAddress('   '), '');
  });

  it('returns a string without an @ unchanged (after trim)', () => {
    assert.equal(normalizeEmailAddress('  not-an-email  '), 'not-an-email');
  });

  it('splits on the LAST @ when multiple are present', () => {
    // local part keeps its first @, only the trailing domain is lowercased
    assert.equal(normalizeEmailAddress('weird@local@Domain.COM'), 'weird@local@domain.com');
  });
});

describe('isValidEmailAddress', () => {
  it('accepts a well-formed address', () => {
    assert.equal(isValidEmailAddress('user@example.com'), true);
  });

  it('accepts an address with mixed-case domain (normalized first)', () => {
    assert.equal(isValidEmailAddress('User@Example.COM'), true);
  });

  it('rejects an address with no TLD', () => {
    assert.equal(isValidEmailAddress('user@localhost'), false);
  });

  it('rejects a string with no @', () => {
    assert.equal(isValidEmailAddress('userexample.com'), false);
  });

  it('rejects an address containing spaces', () => {
    assert.equal(isValidEmailAddress('user name@example.com'), false);
  });

  it('rejects empty / null / undefined', () => {
    assert.equal(isValidEmailAddress(''), false);
    assert.equal(isValidEmailAddress(null), false);
    assert.equal(isValidEmailAddress(undefined), false);
  });
});

describe('isEmailField', () => {
  it('matches real email address fields', () => {
    assert.equal(isEmailField({ key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'string' }), true);
    assert.equal(isEmailField({ key: 'x', column: 'Email', type: 'string' }), true);
    assert.equal(isEmailField({ key: 'x', column: 'A_EMail', type: 'string' }), true);
    assert.equal(isEmailField({ key: 'email', column: 'Email', type: 'string' }), true);
    assert.equal(isEmailField({ key: 'whatever', type: 'email' }), true);
  });

  it('excludes SMTP credential fields (username / password) — regression', () => {
    assert.equal(isEmailField({ key: 'emailUser', column: 'EmailUser', type: 'string' }), false);
    assert.equal(isEmailField({ key: 'emailUserPW', column: 'EmailUserPW', type: 'string' }), false);
    assert.equal(isEmailField({ key: 'x', column: 'Email_Password', type: 'string' }), false);
  });

  it('does not match unrelated fields or non-text types', () => {
    assert.equal(isEmailField({ key: 'name', column: 'Name', type: 'string' }), false);
    assert.equal(isEmailField({ key: 'sendEmail', column: 'Send_Email', type: 'checkbox' }), false);
    assert.equal(isEmailField(null), false);
  });
});

describe('getEmailFieldError', () => {
  const emailField = { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text' };

  it('returns null for a non-email field regardless of value', () => {
    assert.equal(getEmailFieldError({ key: 'name', column: 'Name', type: 'text' }, 'not-an-email'), null);
  });

  it('returns null for an empty value (email is optional)', () => {
    assert.equal(getEmailFieldError(emailField, ''), null);
    assert.equal(getEmailFieldError(emailField, null), null);
    assert.equal(getEmailFieldError(emailField, undefined), null);
  });

  it('returns null for a whitespace-only value', () => {
    assert.equal(getEmailFieldError(emailField, '   '), null);
  });

  it('returns the error key for a non-empty malformed value', () => {
    assert.equal(getEmailFieldError(emailField, 'not-an-email'), 'sendModalInvalidEmail');
  });

  it('returns null for a well-formed value', () => {
    assert.equal(getEmailFieldError(emailField, 'user@example.com'), null);
  });
});

describe('isSecureUrl', () => {
  it('accepts an https URL with a host', () => {
    assert.equal(isSecureUrl('https://example.com'), true);
    assert.equal(isSecureUrl('https://example.com/path?q=1'), true);
  });

  it('trims surrounding whitespace before checking', () => {
    assert.equal(isSecureUrl('  https://example.com  '), true);
  });

  it('rejects a bare https:// with no host', () => {
    assert.equal(isSecureUrl('https://'), false);
    assert.equal(isSecureUrl('https:// '), false);
  });

  it('rejects http:// (insecure)', () => {
    assert.equal(isSecureUrl('http://example.com'), false);
  });

  it('rejects a scheme-less value', () => {
    assert.equal(isSecureUrl('example.com'), false);
    assert.equal(isSecureUrl('www.example.com'), false);
  });

  it('rejects empty / null / undefined', () => {
    assert.equal(isSecureUrl(''), false);
    assert.equal(isSecureUrl(null), false);
    assert.equal(isSecureUrl(undefined), false);
  });
});

describe('isWebsiteField', () => {
  it('detects the header etgoWeb field by key/column token', () => {
    assert.equal(isWebsiteField({ key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string' }), true);
  });

  it('detects an explicit type === "url"', () => {
    assert.equal(isWebsiteField({ key: 'whatever', type: 'url' }), true);
  });

  it('detects website / homepage / url tokens', () => {
    assert.equal(isWebsiteField({ key: 'website', type: 'string' }), true);
    assert.equal(isWebsiteField({ key: 'homePage', type: 'string' }), true);
    assert.equal(isWebsiteField({ key: 'x', column: 'URL', type: 'string' }), true);
  });

  it('does NOT match unrelated fields or "web" substrings (regression)', () => {
    assert.equal(isWebsiteField({ key: 'webhook', column: 'Webhook', type: 'string' }), false);
    assert.equal(isWebsiteField({ key: 'name', column: 'Name', type: 'string' }), false);
    assert.equal(isWebsiteField({ key: 'email', column: 'Email', type: 'string' }), false);
  });

  it('does NOT match a non-text field even if named like a website', () => {
    assert.equal(isWebsiteField({ key: 'website', column: 'Website', type: 'checkbox' }), false);
    assert.equal(isWebsiteField({ key: 'website', column: 'Website', type: 'select' }), false);
  });

  it('returns false for nullish input', () => {
    assert.equal(isWebsiteField(null), false);
    assert.equal(isWebsiteField(undefined), false);
  });
});

describe('getWebsiteFieldError', () => {
  const webField = { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'string' };

  it('returns null for a non-website field regardless of value', () => {
    assert.equal(getWebsiteFieldError({ key: 'name', column: 'Name', type: 'string' }, 'http://x.com'), null);
  });

  it('returns null for an empty / whitespace value (optional)', () => {
    assert.equal(getWebsiteFieldError(webField, ''), null);
    assert.equal(getWebsiteFieldError(webField, '   '), null);
    assert.equal(getWebsiteFieldError(webField, null), null);
    assert.equal(getWebsiteFieldError(webField, undefined), null);
  });

  it('returns the error key for http:// (insecure)', () => {
    assert.equal(getWebsiteFieldError(webField, 'http://example.com'), 'websiteInsecureUrl');
  });

  it('returns the error key for a scheme-less value', () => {
    assert.equal(getWebsiteFieldError(webField, 'example.com'), 'websiteInsecureUrl');
  });

  it('returns the error key for a bare https://', () => {
    assert.equal(getWebsiteFieldError(webField, 'https://'), 'websiteInsecureUrl');
  });

  it('returns null for a valid https URL with a host', () => {
    assert.equal(getWebsiteFieldError(webField, 'https://example.com'), null);
  });
});

describe('isValidPhone', () => {
  it('accepts a formatted international number', () => {
    assert.equal(isValidPhone('+34 (600) 12-34'), true);
  });

  it('accepts plain digits and dot separators', () => {
    assert.equal(isValidPhone('600123456'), true);
    assert.equal(isValidPhone('+34.600.123.456'), true);
  });

  it('trims surrounding whitespace', () => {
    assert.equal(isValidPhone('  600 123 456  '), true);
  });

  it('rejects a value with no digit (separators only)', () => {
    assert.equal(isValidPhone('+()'), false);
    assert.equal(isValidPhone('---'), false);
  });

  it('rejects letters and other characters', () => {
    assert.equal(isValidPhone('600abc'), false);
    assert.equal(isValidPhone('foo@bar'), false);
    assert.equal(isValidPhone('600#123'), false);
  });

  it('rejects empty / null / undefined', () => {
    assert.equal(isValidPhone(''), false);
    assert.equal(isValidPhone('   '), false);
    assert.equal(isValidPhone(null), false);
    assert.equal(isValidPhone(undefined), false);
  });
});

describe('isPhoneField', () => {
  it('detects the header etgoPhone field and grid phone/alternativePhone', () => {
    assert.equal(isPhoneField({ key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string' }), true);
    assert.equal(isPhoneField({ key: 'phone', column: 'Phone', type: 'string' }), true);
    assert.equal(isPhoneField({ key: 'alternativePhone', column: 'Phone2', type: 'string' }), true);
  });

  it('does NOT match unrelated fields (regression)', () => {
    assert.equal(isPhoneField({ key: 'name', column: 'Name', type: 'string' }), false);
    assert.equal(isPhoneField({ key: 'email', column: 'Email', type: 'string' }), false);
    assert.equal(isPhoneField({ key: 'fax', column: 'Fax', type: 'string' }), false);
  });

  it('does NOT match a non-text field even if named like a phone', () => {
    assert.equal(isPhoneField({ key: 'phone', column: 'Phone', type: 'checkbox' }), false);
    assert.equal(isPhoneField({ key: 'phone', column: 'Phone', type: 'select' }), false);
  });

  it('returns false for nullish input', () => {
    assert.equal(isPhoneField(null), false);
    assert.equal(isPhoneField(undefined), false);
  });
});

describe('getPhoneFieldError', () => {
  const phoneField = { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'string' };

  it('returns null for a non-phone field regardless of value', () => {
    assert.equal(getPhoneFieldError({ key: 'name', column: 'Name', type: 'string' }, 'abc'), null);
  });

  it('returns null for an empty / whitespace value (optional)', () => {
    assert.equal(getPhoneFieldError(phoneField, ''), null);
    assert.equal(getPhoneFieldError(phoneField, '   '), null);
    assert.equal(getPhoneFieldError(phoneField, null), null);
    assert.equal(getPhoneFieldError(phoneField, undefined), null);
  });

  it('returns the error key for disallowed characters', () => {
    assert.equal(getPhoneFieldError(phoneField, '600abc'), 'phoneInvalidChars');
    assert.equal(getPhoneFieldError(phoneField, 'foo@bar'), 'phoneInvalidChars');
  });

  it('returns the error key when there is no digit', () => {
    assert.equal(getPhoneFieldError(phoneField, '+()'), 'phoneInvalidChars');
  });

  it('returns null for a valid phone number', () => {
    assert.equal(getPhoneFieldError(phoneField, '+34 (600) 12-34'), null);
  });
});

describe('normalizeRecipientList', () => {
  it('returns [] for null/undefined input', () => {
    assert.deepEqual(normalizeRecipientList(null), []);
    assert.deepEqual(normalizeRecipientList(undefined), []);
  });

  it('drops empty / whitespace-only entries', () => {
    assert.deepEqual(normalizeRecipientList(['a@x.com', '', '   ']), ['a@x.com']);
  });

  it('deduplicates case-insensitively, keeping the first occurrence', () => {
    assert.deepEqual(
      normalizeRecipientList(['User@Example.com', 'user@example.COM']),
      ['User@example.com'],
    );
  });

  it('preserves insertion order of distinct addresses', () => {
    assert.deepEqual(
      normalizeRecipientList(['c@x.com', 'a@x.com', 'b@x.com']),
      ['c@x.com', 'a@x.com', 'b@x.com'],
    );
  });

  it('normalizes the domain of each kept address', () => {
    assert.deepEqual(normalizeRecipientList(['User@EXAMPLE.com']), ['User@example.com']);
  });
});

describe('buildRecipientEdits', () => {
  it('returns null when final To equals base and there is no cc', () => {
    const edits = buildRecipientEdits(
      ['a@x.com', 'b@x.com'],
      { to: ['a@x.com', 'b@x.com'] },
    );
    assert.equal(edits, null);
  });

  it('returns null when final To equals base ignoring case/whitespace and no cc', () => {
    const edits = buildRecipientEdits(
      ['A@X.com'],
      { to: [' a@x.COM '] },
    );
    assert.equal(edits, null);
  });

  it('reports only additions when an address is added to To', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com', 'b@x.com'] },
    );
    assert.deepEqual(edits, { to: { add: ['b@x.com'] } });
  });

  it('reports only removals when an address is dropped from To', () => {
    const edits = buildRecipientEdits(
      ['a@x.com', 'b@x.com'],
      { to: ['a@x.com'] },
    );
    assert.deepEqual(edits, { to: { remove: ['b@x.com'] } });
  });

  it('reports both add and remove when To is changed in both directions', () => {
    const edits = buildRecipientEdits(
      ['a@x.com', 'b@x.com'],
      { to: ['a@x.com', 'c@x.com'] },
    );
    assert.deepEqual(edits, { to: { add: ['c@x.com'], remove: ['b@x.com'] } });
  });

  it('does NOT count a case-only variation of a base address as an addition', () => {
    const edits = buildRecipientEdits(
      ['user@example.com'],
      { to: ['USER@example.com'] },
    );
    assert.equal(edits, null);
  });

  it('emits cc always as add (never diffed against base)', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com'], cc: ['cc@x.com'] },
    );
    assert.deepEqual(edits, { cc: { add: ['cc@x.com'] } });
  });

  it('combines To diff and cc add', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com', 'b@x.com'], cc: ['cc@x.com'] },
    );
    assert.deepEqual(edits, {
      to: { add: ['b@x.com'] },
      cc: { add: ['cc@x.com'] },
    });
  });

  it('deduplicates within the To channel before diffing', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com', 'b@x.com', 'B@x.com'] },
    );
    assert.deepEqual(edits, { to: { add: ['b@x.com'] } });
  });

  it('deduplicates within the cc channel', () => {
    const edits = buildRecipientEdits(
      ['a@x.com'],
      { to: ['a@x.com'], cc: ['cc@x.com', 'CC@x.com'] },
    );
    assert.deepEqual(edits, { cc: { add: ['cc@x.com'] } });
  });

  it('treats missing/empty channels as no diff (null)', () => {
    assert.equal(buildRecipientEdits([], {}), null);
    assert.equal(buildRecipientEdits(null, null), null);
  });
});
