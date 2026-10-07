// @covers artifacts/user/generated/web/user/UserForm.jsx
// @covers artifacts/user/decisions.json
//
// The email lock on the Users form ships as a compiled `readOnlyLogicJs` expression. It reads
// the `emailEditable` flag the backend attaches to every `user` row
// (UserRoleAssignmentHandler#attachEmailEditable, com.etendoerp.go) instead of re-deriving the
// rule. This test runs the REAL compiled expression, so a regen that drops or rewrites it fails
// here, not in QA.
import { describe, expect, it } from 'vitest';
import UserForm from '@generated/user/generated/web/user/UserForm.jsx';

function emailReadOnlyLogic() {
  const field = UserForm.fields.find((f) => f.key === 'email');
  if (!field) throw new Error('email field not found in UserForm.fields — has the artifact been regenerated?');
  return field.readOnlyLogic;
}

describe('Users — email readOnlyLogic compiled expression', () => {
  it('leaves the email editable on the create form', () => {
    expect(emailReadOnlyLogic()({})).toBe(false);
  });

  it('locks a saved user unless the backend says the email can still be corrected', () => {
    const readOnlyLogic = emailReadOnlyLogic();
    expect(readOnlyLogic({ id: 'U1', emailEditable: true })).toBe(false);
    expect(readOnlyLogic({ id: 'U1', emailEditable: false })).toBe(true);
  });

  it('fails closed when the flag is missing or not a real boolean true', () => {
    const readOnlyLogic = emailReadOnlyLogic();
    for (const emailEditable of [undefined, null, 'true', 1]) {
      expect(readOnlyLogic({ id: 'U1', emailEditable })).toBe(true);
    }
  });

  it('does not lock an empty email while it is being typed in', () => {
    // The form evaluates the rule against its live data: typing must not flip the lock.
    const readOnlyLogic = emailReadOnlyLogic();
    expect(readOnlyLogic({ id: 'U1', emailEditable: true, email: '' })).toBe(false);
    expect(readOnlyLogic({ id: 'U1', emailEditable: true, email: 'n' })).toBe(false);
  });
});
