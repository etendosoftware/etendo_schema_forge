import { AUTH_ERROR_UI_KEYS } from '@etendosoftware/etendo-go-core/onboarding/api';
// The same entry point the module under test uses, so the read below travels the same path the
// account GET does in production.
import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
  expectBearerHeader,
  expectNoAuthorizationHeader,
  expectNoCsrfHeader,
} from '@/test/sessionContract.js';
import * as authMethodsApi from '../authMethodsApi.js';
import {
  AUTH_METHOD_ERROR_UI_KEYS,
  removeAuthMethod,
  resolveAuthMethodErrorKey,
} from '../authMethodsApi.js';

/**
 * ETP-5115 / AUTH-05 — the removal endpoint's client side; ETP-4576 — its credential.
 *
 * Three contracts are pinned here, all owned elsewhere. The request shape (POST to
 * /sws/go/auth-methods/remove); the error envelope, which `EtendoGoJwtServlet.writeError` NESTS
 * under `error` — reading it flat loses the code, and with it the 409 that tells a user this is
 * the only way they can sign in; and, since ETP-4576, what the request CARRIES.
 *
 * That last one is why these cases drive the REAL `apiFetch` over a stubbed `globalThis.fetch`
 * instead of an injected fetch double. The call used to take `(fetchImpl, baseUrl, token)` and
 * feed the token to `buildAuthHeaders`, which puts whatever it receives into `X-Go-CSRF`. The
 * token came from `sf_platform_token`, a key `purgeLegacyAuthStorage` deletes, so it was null:
 * the POST went out with no proof of intent and removing a sign-in method was refused, while the
 * GET that renders the same screen kept working — the browser attaches the session cookie itself
 * and a read needs no proof. A suite that asserts on headers it handed in cannot see any of that;
 * one that asserts on what reached `fetch` can.
 */

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

/** Headers of the Nth recorded request, keys lowercased so the lookup is case-safe. */
function recordedHeaders(index = 0) {
  const entries = Object.entries(globalThis.fetch.mock.calls[index]?.[1]?.headers ?? {});
  return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]));
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'success' }));
  declareCookieSession();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the module surface', () => {
  // `readPlatformToken`/`writePlatformToken` are not an implementation detail that happened to be
  // dropped — they ARE the bug. Both named `sf_platform_token`, which the migration exists to
  // empty, so the module both authenticated from and persisted into storage the session no longer
  // lives in. Asserting their absence is what stops a merge quietly reintroducing them.
  it('exposes no storage-backed token accessor', () => {
    expect(authMethodsApi.readPlatformToken).toBeUndefined();
    expect(authMethodsApi.writePlatformToken).toBeUndefined();
  });
});

describe('removeAuthMethod', () => {
  describe('the request it makes', () => {
    it('posts the method to the removal endpoint under the given base URL', async () => {
      await removeAuthMethod('google', undefined, 'https://base');

      const [url, init] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('https://base/sws/go/auth-methods/remove');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ method: 'google' });
    });

    // THE regression. The removal is the one act on this screen that is refused when the proof is
    // missing, and it fails in a way the screen cannot show: the list beside it still loads.
    it('carries the write proof and no bearer token under the cookie scheme', async () => {
      await removeAuthMethod('google', undefined, 'https://base');

      expect(recordedHeaders()['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
      expectNoAuthorizationHeader();
      // Without this the `__Host-` cookie never leaves the browser cross-origin — the dev setup
      // (:3100 -> :8080) and any split-origin deploy.
      expect(globalThis.fetch.mock.calls[0][1].credentials).toBe('include');
      expect(recordedHeaders()['content-type']).toBe('application/json');
    });

    // The other half of the preference's promise: the SAME call site has to work under the scheme
    // the app runs on while the CSRF preference is off. The proof travels there too, deliberately
    // — the browser attaches a same-origin session cookie whatever the client believes it is
    // doing, and the backend validates CSRF the moment it sees one on an unsafe method.
    it('carries the bearer token, and the proof too, under the bearer scheme', async () => {
      declareBearerSession();

      await removeAuthMethod('google', undefined, 'https://base');

      expectBearerHeader(TEST_BEARER_TOKEN);
      expect(recordedHeaders()['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
    });

    it('falls back to the ambient session base URL when none is given', async () => {
      await removeAuthMethod('google');

      expect(globalThis.fetch.mock.calls[0][0]).toBe('/sws/go/auth-methods/remove');
    });

    it('sends the current password alongside the method when one is supplied', async () => {
      await removeAuthMethod('password', 'hunter2', 'https://base');

      expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body))
        .toEqual({ method: 'password', currentPassword: 'hunter2' });
    });

    it('omits the currentPassword key entirely when there is none to send', async () => {
      await removeAuthMethod('google', undefined, 'https://base');

      expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).not.toHaveProperty('currentPassword');
    });

    it('returns the payload, which carries the remaining methods', async () => {
      const body = {
        status: 'success',
        authMethods: { password: { enabled: true }, identities: [], removable: [] },
      };
      globalThis.fetch.mockResolvedValue(jsonResponse(body));

      await expect(removeAuthMethod('google', undefined, 'https://base')).resolves.toEqual(body);
    });

    /**
     * The servlet rotates the session on EVERY removal and the legacy backend still echoes the new
     * token in the body. Under the cookie scheme that rotation arrives as a `Set-Cookie` the
     * browser installs on its own, so the body's `token` is not a credential to keep — it is a
     * credential to DROP. The previous code stored it in `sf_platform_token`, writing into exactly
     * the storage `purgeLegacyAuthStorage` empties on mount, which left the value racing the purge.
     */
    it('persists nothing, not even the rotated token the response still echoes', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({
        status: 'success',
        token: 'rotated',
        authMethods: { password: { enabled: true }, identities: [], removable: [] },
      }));

      await removeAuthMethod('google', undefined, 'https://base');

      expect(localStorage.getItem('sf_platform_token')).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    it('leaves a legacy entry that is already in storage untouched rather than refreshing it',
      async () => {
        // The purge owns that key. A module that "kept it in sync" would keep resurrecting it.
        localStorage.setItem('sf_platform_token', 'stale');
        globalThis.fetch.mockResolvedValue(jsonResponse({ status: 'success', token: 'rotated' }));

        await removeAuthMethod('google', undefined, 'https://base');

        expect(localStorage.getItem('sf_platform_token')).toBe('stale');
      });
  });

  describe('the error envelope it reads', () => {
    it('carries the 409 code and sentence off the nested envelope the servlet sends', async () => {
      // Exactly what EtendoGoJwtServlet.writeError(response, SC_CONFLICT, ...) writes.
      globalThis.fetch.mockResolvedValue(jsonResponse({
        error: {
          code: 'LAST_AUTH_METHOD',
          message: 'removeAuthMethod: refusing to remove the only remaining method',
          userMessage: 'This is the only way you can sign in. Add another method before removing this one.',
          status: 409,
        },
      }, { ok: false, status: 409 }));

      const err = await removeAuthMethod('google', undefined, 'https://base')
        .then(() => null, (e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('LAST_AUTH_METHOD');
      expect(err.userMessage).toBe(
        'This is the only way you can sign in. Add another method before removing this one.',
      );
      expect(err.message).toBe('removeAuthMethod: refusing to remove the only remaining method');
    });

    it('carries the 404 code the servlet answers for a method the account lacks', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({
        error: {
          code: 'AUTH_METHOD_NOT_FOUND',
          message: 'removeAuthMethod: the account does not have the requested method',
          userMessage: 'That sign-in method is not enabled on this account.',
          status: 404,
        },
      }, { ok: false, status: 404 }));

      const err = await removeAuthMethod('github', undefined, 'https://base')
        .then(() => null, (e) => e);

      expect(err.code).toBe('AUTH_METHOD_NOT_FOUND');
      expect(err.userMessage).toBe('That sign-in method is not enabled on this account.');
    });

    it('falls back to the nested message when the envelope has no userMessage', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      }, { ok: false, status: 500 }));

      const err = await removeAuthMethod('google', undefined, 'https://base')
        .then(() => null, (e) => e);

      expect(err.code).toBe('INTERNAL_ERROR');
      expect(err.userMessage).toBe('boom');
    });

    it('reads the older flat envelope whose error is the code itself', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({
        error: 'PAYMENT_REQUIRED', message: 'Subscription required',
      }, { ok: false, status: 402 }));

      const err = await removeAuthMethod('google', undefined, 'https://base')
        .then(() => null, (e) => e);

      expect(err.code).toBe('PAYMENT_REQUIRED');
      expect(err.userMessage).toBe('Subscription required');
    });

    it('still throws a usable error when the failure body is not JSON at all', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      });

      const err = await removeAuthMethod('google', undefined, 'https://base')
        .then(() => null, (e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBeNull();
      expect(err.userMessage).toBeNull();
      expect(err.message).toBeTruthy();
    });

    it('resolves rather than throws when a success body is not JSON', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => { throw new SyntaxError('no body'); },
      });

      await expect(removeAuthMethod('google', undefined, 'https://base')).resolves.toBeNull();
    });

    it('lets a transport failure through untouched', async () => {
      globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(removeAuthMethod('google', undefined, 'https://base'))
        .rejects.toThrow('Failed to fetch');
    });

    /**
     * A 401 must reach the caller as a 401, not as `apiFetch`'s bare `Unauthorized`.
     *
     * This module does NOT pass `on401: 'ignore'` — unlike `lib/upgrade/api.js`, whose page owns
     * the expired-session wording mid-checkout. Here the shared logout choke point is the right
     * destination: an account screen whose session has gone is exactly where being signed out is
     * the correct outcome. Pinned so the difference between the two modules stays a decision.
     */
    it('lets the logout choke point own an expired session', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ error: { code: 'EXPIRED' } },
        { ok: false, status: 401 }));

      await expect(removeAuthMethod('google', undefined, 'https://base'))
        .rejects.toThrow('Unauthorized');
    });
  });

  describe('the read beside it', () => {
    // The asymmetry that made the bug invisible: the account GET that draws this screen needs no
    // proof, so it kept working while every removal was refused. Pinned so it stays deliberate.
    it('would send neither credential header on a read under the cookie scheme', async () => {
      globalThis.fetch.mockResolvedValue(jsonResponse({ authMethods: {} }));

      await apiFetch('/sws/go/me', { baseUrl: 'https://base' });

      expectNoCsrfHeader();
      expectNoAuthorizationHeader();
      expect(globalThis.fetch.mock.calls[0][1].credentials).toBe('include');
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

  it('overrides the core wording for the code the servlet reuses from change-password', () => {
    // The servlet answers CHANGE_PASSWORD_MISSING_CREDENTIALS when a password removal arrives
    // without the current password. The core table maps it to sentence about changing a password,
    // which is the wrong act to describe here, so the local map must win.
    expect(resolveAuthMethodErrorKey('CHANGE_PASSWORD_MISSING_CREDENTIALS'))
      .toBe('accountMethodCurrentPasswordRequired');
    expect(resolveAuthMethodErrorKey('CHANGE_PASSWORD_MISSING_CREDENTIALS'))
      .not.toBe(AUTH_ERROR_UI_KEYS.CHANGE_PASSWORD_MISSING_CREDENTIALS);
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
