import { AUTH_ERROR_UI_KEYS, buildAuthHeaders } from '@etendosoftware/etendo-go-core/onboarding/api';
import {
  AUTH_METHOD_ERROR_UI_KEYS,
  readPlatformToken,
  removeAuthMethod,
  resolveAuthMethodErrorKey,
} from '../authMethodsApi.js';

/**
 * ETP-5115 / AUTH-05. The removal endpoint's client side.
 *
 * Two contracts are pinned here, both of which the servlet owns. The request shape — POST to
 * /sws/go/auth-methods/remove with the core package's own header policy — and the error envelope,
 * which `EtendoGoJwtServlet.writeError` NESTS under `error`. Reading that envelope flat is not a
 * cosmetic slip: it loses the code, and with it the 409 that tells a user this is the only way they
 * can sign in, leaving the generic "could not be removed" in its place.
 */

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('removeAuthMethod', () => {
  describe('the request it makes', () => {
    it('posts the method to the removal endpoint under the given base URL', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'success' }));

      await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google');

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://base/sws/go/auth-methods/remove');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ method: 'google' });
    });

    it('authenticates through the core header policy rather than a hand-rolled header', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'success' }));

      await removeAuthMethod(fetchImpl, 'https://base', 'platform-token', 'google');

      const [, init] = fetchImpl.mock.calls[0];
      // Whatever buildAuthHeaders decides — the bearer, and the Accept-Language that keeps the
      // backend from answering in the account's AD language (ETP-5022) — must arrive unchanged.
      expect(init.headers).toMatchObject(buildAuthHeaders('platform-token'));
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('sends the current password alongside the method when one is supplied', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'success' }));

      await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'password', 'hunter2');

      expect(JSON.parse(fetchImpl.mock.calls[0][1].body))
        .toEqual({ method: 'password', currentPassword: 'hunter2' });
    });

    it('omits the currentPassword key entirely when there is none to send', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'success' }));

      await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google');

      expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('currentPassword');
    });

    it('returns the payload, which carries the rotated token and the remaining methods', async () => {
      const body = {
        status: 'success',
        token: 'rotated',
        authMethods: { password: { enabled: true }, identities: [], removable: [] },
      };
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body));

      await expect(removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google')).resolves
        .toEqual(body);
    });
  });

  describe('the error envelope it reads', () => {
    it('carries the 409 code and sentence off the nested envelope the servlet sends', async () => {
      // Exactly what EtendoGoJwtServlet.writeError(response, SC_CONFLICT, ...) writes.
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
        error: {
          code: 'LAST_AUTH_METHOD',
          message: 'removeAuthMethod: refusing to remove the only remaining method',
          userMessage: 'This is the only way you can sign in. Add another method before removing this one.',
          status: 409,
        },
      }, { ok: false, status: 409 }));

      const err = await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google')
        .then(() => null, (e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('LAST_AUTH_METHOD');
      expect(err.userMessage).toBe(
        'This is the only way you can sign in. Add another method before removing this one.',
      );
      expect(err.message).toBe('removeAuthMethod: refusing to remove the only remaining method');
    });

    it('carries the 404 code the servlet answers for a method the account lacks', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
        error: {
          code: 'AUTH_METHOD_NOT_FOUND',
          message: 'removeAuthMethod: the account does not have the requested method',
          userMessage: 'That sign-in method is not enabled on this account.',
          status: 404,
        },
      }, { ok: false, status: 404 }));

      const err = await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'github')
        .then(() => null, (e) => e);

      expect(err.code).toBe('AUTH_METHOD_NOT_FOUND');
      expect(err.userMessage).toBe('That sign-in method is not enabled on this account.');
    });

    it('falls back to the nested message when the envelope has no userMessage', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      }, { ok: false, status: 500 }));

      const err = await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google')
        .then(() => null, (e) => e);

      expect(err.code).toBe('INTERNAL_ERROR');
      expect(err.userMessage).toBe('boom');
    });

    it('reads the older flat envelope whose error is the code itself', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
        error: 'PAYMENT_REQUIRED', message: 'Subscription required',
      }, { ok: false, status: 402 }));

      const err = await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google')
        .then(() => null, (e) => e);

      expect(err.code).toBe('PAYMENT_REQUIRED');
      expect(err.userMessage).toBe('Subscription required');
    });

    it('still throws a usable error when the failure body is not JSON at all', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      });

      const err = await removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google')
        .then(() => null, (e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBeNull();
      expect(err.userMessage).toBeNull();
      expect(err.message).toBeTruthy();
    });

    it('resolves rather than throws when a success body is not JSON', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => { throw new SyntaxError('no body'); },
      });

      await expect(removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google')).resolves
        .toBeNull();
    });

    it('lets a transport failure through untouched', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(removeAuthMethod(fetchImpl, 'https://base', 'tok', 'google'))
        .rejects.toThrow('Failed to fetch');
    });
  });
});

describe('resolveAuthMethodErrorKey', () => {
  it('maps the removal endpoint\'s own codes to dictionary keys', () => {
    // A raw code is never a dictionary key: passing one to ui() echoes it back, which is how
    // SCREAMING_SNAKE text used to reach users.
    expect(resolveAuthMethodErrorKey('LAST_AUTH_METHOD')).toBe('accountMethodLastRemaining');
    expect(resolveAuthMethodErrorKey('AUTH_METHOD_NOT_FOUND')).toBe('accountMethodNotFound');
  });

  it('falls through to the core table for a code the auth endpoints share', () => {
    expect(resolveAuthMethodErrorKey('INVALID_CURRENT_PASSWORD'))
      .toBe(AUTH_ERROR_UI_KEYS.INVALID_CURRENT_PASSWORD);
  });

  it('returns null for an unmapped code so the caller can fall back', () => {
    expect(resolveAuthMethodErrorKey('SOMETHING_THE_UI_HAS_NEVER_SEEN')).toBeNull();
  });

  it('returns null for no code at all', () => {
    expect(resolveAuthMethodErrorKey(null)).toBeNull();
    expect(resolveAuthMethodErrorKey(undefined)).toBeNull();
    expect(resolveAuthMethodErrorKey('')).toBeNull();
  });

  it('names a key for every code the table publishes', () => {
    for (const [code, key] of Object.entries(AUTH_METHOD_ERROR_UI_KEYS)) {
      expect(resolveAuthMethodErrorKey(code)).toBe(key);
    }
  });
});

describe('readPlatformToken', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads the token the platform session stored', () => {
    localStorage.setItem('sf_platform_token', 'platform-token');

    expect(readPlatformToken()).toBe('platform-token');
  });

  it('answers null when no session has been stored', () => {
    expect(readPlatformToken()).toBeNull();
  });

  it('answers null rather than an empty string for a blank entry', () => {
    localStorage.setItem('sf_platform_token', '');

    expect(readPlatformToken()).toBeNull();
  });
});
