import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  getPasswordChecks,
  isStrongPassword,
} from '../passwordPolicy.js';

describe('passwordPolicy', () => {
  it('accepts a password that satisfies every rule', () => {
    assert.equal(isStrongPassword('Str0ng!Pass'), true);
    assert.equal(isStrongPassword('Aa1!aaaa'), true);
  });

  it('requires at least the minimum length', () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.equal(isStrongPassword('Aa1!aa'), false); // 6 chars
    assert.equal(getPasswordChecks('Aa1!aa').minLength, false);
  });

  it('rejects the trivial password from the ticket', () => {
    assert.equal(isStrongPassword('123'), false);
  });

  it('flags each missing rule independently', () => {
    assert.deepEqual(getPasswordChecks('abc1!def'), {
      minLength: true, uppercase: false, lowercase: true, number: true, special: true,
    });
    assert.deepEqual(getPasswordChecks('ABC1!DEF'), {
      minLength: true, uppercase: true, lowercase: false, number: true, special: true,
    });
    assert.equal(getPasswordChecks('Abcdef!!').number, false);
    assert.equal(getPasswordChecks('Abcdef12').special, false);
  });

  it('does not count whitespace as a special character', () => {
    assert.equal(getPasswordChecks('Abcdef12 ').special, false);
    assert.equal(isStrongPassword('Abcdef12 '), false);
  });

  it('treats null/empty as weak', () => {
    assert.equal(isStrongPassword(null), false);
    assert.equal(isStrongPassword(''), false);
  });

  it('exposes the rule keys in display order', () => {
    assert.deepEqual(PASSWORD_RULES, ['minLength', 'uppercase', 'lowercase', 'number', 'special']);
  });
});
