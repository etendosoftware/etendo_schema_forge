// @covers tools/app-shell/src/lib/observability/internalUser.js
const setContextMock = vi.hoisted(() => vi.fn());
vi.mock('../../observability.js', () => ({ setContext: setContextMock }));

import { isInternalEmail, setInternalUserContext } from '../internalUser.js';

describe('isInternalEmail', () => {
  it.each(['a@etendo.software', 'a@etendo.ai', 'a@smfconsulting.es', ' A@Etendo.AI ', 'x@gmail.com@etendo.ai', '@etendo.ai'])('is true for %s', (email) => {
    expect(isInternalEmail(email)).toBe(true);
  });

  it.each(['a@gmail.com', 'x@notetendo.ai', 'x@etendo.ai.evil.com', 'x@sub.etendo.ai', 'x@etendo.software.es', 'x@etendo.ai@gmail.com'])('is false for %s', (email) => {
    expect(isInternalEmail(email)).toBe(false);
  });

  it.each([undefined, null, '', 'no-at-sign', 'a@', 42])('is undefined for %s', (email) => {
    expect(isInternalEmail(email)).toBeUndefined();
  });
});

describe('setInternalUserContext', () => {
  beforeEach(() => setContextMock.mockReset());

  it('sets only the boolean, never the email', () => {
    setInternalUserContext('ana@etendo.ai');
    expect(setContextMock).toHaveBeenCalledWith({ internal_user: true });
    expect(JSON.stringify(setContextMock.mock.calls)).not.toContain('ana');
  });

  it('sets undefined when there is no email', () => {
    setInternalUserContext(undefined);
    expect(setContextMock).toHaveBeenCalledWith({ internal_user: undefined });
  });
});
