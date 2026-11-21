// @covers tools/app-shell/src/hooks/useEntity.js
import { describe, it, expect } from 'vitest';
import { getCoreFieldViolation } from '../useEntity.js';

const fields = [
  { key: 'name', type: 'text', maxLength: 5 },
  { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text' },
  { key: 'hiddenText', type: 'text', maxLength: 1, readOnly: true },
];

describe('getCoreFieldViolation (save gate)', () => {
  it('blocks a changed invalid value and points at the right field', () => {
    expect(getCoreFieldViolation(fields, { name: 'abcdefg' }, { name: 'abc' }))
      .toMatchObject({ key: 'name', errorKey: 'fieldMaxLengthError', errorParams: { maxLength: 5 } });
  });
  it('lets an unrelated edit through when the legacy-invalid value is untouched', () => {
    expect(getCoreFieldViolation(fields, { name: 'abcdefg', etgoEmail: 'a@b.co' }, { name: 'abcdefg', etgoEmail: '' })).toBeNull();
  });
  it('a correction clears the violation', () => {
    expect(getCoreFieldViolation(fields, { name: 'abc' }, { name: 'abcdefg' })).toBeNull();
  });
  it('on create (no loaded record) every value is validated', () => {
    expect(getCoreFieldViolation(fields, { name: 'abcdefg' }, null)?.key).toBe('name');
    expect(getCoreFieldViolation(fields, { etgoEmail: 'bad' }, null)?.errorKey).toBe('sendModalInvalidEmail');
  });
  it('skips read-only fields and accepts optional empties', () => {
    expect(getCoreFieldViolation(fields, { hiddenText: 'toolong', name: '' }, null)).toBeNull();
  });
});
