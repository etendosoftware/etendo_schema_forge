import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDENTIAL_MODES,
  resetSessionCredentials,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import * as upgradeApi from '../upgrade/api.js';
import {
  UPGRADE_ERROR_CODES,
  createCheckoutSession,
  getCheckoutStatus,
  runPaidOnboarding,
} from '../upgrade/api.js';

/**
 * ETP-4576 — the checkout client's REQUEST contract, not just its parsing.
 *
 * The bug this file now guards was silent by construction. These three calls used to take a
 * `fetchImpl` plus a `token`, and the token went to `buildAuthHeaders`, which puts whatever it
 * receives into `X-Go-CSRF`. The token was read from `sf_auth_token`/`sf_platform_token`, keys
 * `purgeLegacyAuthStorage` deletes, so the argument was null: the two POSTs left with no proof of
 * intent and were refused, while the GET beside them kept working — the browser attaches the
 * session cookie on its own and a read needs no proof. Nothing in the old suite could see that,
 * because it asserted on a fetch double it injected itself and never on what went on the wire.
 *
 * So every case here drives the REAL `apiFetch` with `globalThis.fetch` stubbed underneath, and
 * asserts the header that must be present and the one that must be absent. An implementation that
 * drops the proof, one that sends a bearer under the cookie scheme, and one that ignores the
 * active scheme all have to fail at least one assertion below.
 *
 * `node --test`, not vitest, so `src/test/sessionContract.js` (which imports vitest's `expect`) is
 * out of reach — the scheme is declared through the same core entry point that helper uses.
 */

const CSRF = 'test-csrf';
const BEARER = 'test-bearer';

/**
 * Both helpers publish BOTH credentials, so `mode` is the ONLY difference between them — the
 * reasoning is `src/test/sessionContract.js`'s and holds here for the same reason: an
 * implementation that ignored the mode and emitted whatever it held would otherwise satisfy every
 * absence check for the wrong reason (nothing to emit) instead of the right one (the scheme said
 * no).
 */
function declareCookieSession() {
  setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, token: BEARER, csrfToken: CSRF });
}

function declareBearerSession() {
  setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: BEARER, csrfToken: CSRF });
}

let calls;
let storageWrites;
const realFetch = globalThis.fetch;
const realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

/** Replaces `globalThis.fetch`, recording every call, and answers with `response`. */
function installFetch(response) {
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    return typeof response === 'function' ? response(url, init) : response;
  };
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

/** An NDJSON body delivered in chunks, the shape `runPaidOnboarding` reads. */
function ndjsonResponse(lines, { chunkSize = 32 } = {}) {
  const bytes = new TextEncoder().encode(`${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  let offset = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          const chunk = bytes.slice(offset, offset + chunkSize);
          offset += chunkSize;
          return { done: false, value: chunk };
        },
      }),
    },
  };
}

/** Headers of the Nth recorded call, keys lowercased so the lookup is case-safe. */
function headersOf(index = 0) {
  const entries = Object.entries(calls[index]?.[1]?.headers ?? {});
  return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]));
}

beforeEach(() => {
  calls = [];
  storageWrites = [];
  resetSessionCredentials();
  // A recording stand-in rather than a no-op: `getStoredLocale` legitimately READS from storage on
  // every request, so only writes can be asserted on — and a write is exactly what must never
  // happen again (the removal used to persist a rotated token into `sf_platform_token`).
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: (key, value) => storageWrites.push([key, value]),
      removeItem: (key) => storageWrites.push([key, null]),
    },
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetSessionCredentials();
  if (realLocalStorage) Object.defineProperty(globalThis, 'localStorage', realLocalStorage);
  else delete globalThis.localStorage;
});

describe('the module surface', () => {
  // The two deleted readers are the bug itself, not an implementation detail: both took their
  // credential out of `sf_auth_token`/`sf_platform_token`. Asserting their absence is what stops a
  // legacy-key reader being reintroduced by a merge.
  it('exposes no token reader — the credential comes from the active scheme', () => {
    assert.equal(upgradeApi.getPlatformToken, undefined);
    assert.equal(upgradeApi.getCheckoutToken, undefined);
  });

  it('exports only the three calls and the error table', () => {
    assert.deepEqual(Object.keys(upgradeApi).sort(), [
      'UPGRADE_ERROR_CODES',
      'createCheckoutSession',
      'getCheckoutStatus',
      'runPaidOnboarding',
    ]);
  });
});

describe('createCheckoutSession', () => {
  it('posts product intent without card or price fields', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ requestId: 'req-1', checkoutUrl: 'https://checkout.stripe.test/s1' }));

    const result = await createCheckoutSession('https://api.test', {
      action: 'productive-tenant',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });

    assert.deepEqual(result, {
      requestId: 'req-1',
      checkoutUrl: 'https://checkout.stripe.test/s1',
      expiresAt: null,
    });
    assert.equal(calls[0][0], 'https://api.test/sws/go/checkout/sessions');
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });
    assert.doesNotMatch(calls[0][1].body, /cardNumber|paymentToken|priceId|amount/);
  });

  // THE regression. Paying for a tenant was the user-visible casualty of the missing proof.
  it('carries the write proof and no bearer token under the cookie scheme', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ requestId: 'req-1', checkoutUrl: 'https://c.test/s1' }));

    await createCheckoutSession('https://api.test', {});

    assert.equal(calls[0][1].method, 'POST');
    assert.equal(headersOf()['x-go-csrf'], CSRF);
    assert.equal(headersOf().authorization, undefined);
    // Without this the `__Host-` cookie never leaves the browser cross-origin, which is the dev
    // setup (:3100 -> :8080) and any split-origin deploy.
    assert.equal(calls[0][1].credentials, 'include');
  });

  // The other half of the preference's promise: the same call site has to work under the scheme
  // the app runs on while the CSRF preference is off. The proof travels there too — deliberately,
  // since the browser attaches a same-origin cookie whatever the client believes it is doing.
  it('carries the bearer token, and the proof too, under the bearer scheme', async () => {
    declareBearerSession();
    installFetch(jsonResponse({ requestId: 'req-1', checkoutUrl: 'https://c.test/s1' }));

    await createCheckoutSession('https://api.test', {});

    assert.equal(headersOf().authorization, `Bearer ${BEARER}`);
    assert.equal(headersOf()['x-go-csrf'], CSRF);
  });

  it('writes no credential into storage', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ requestId: 'req-1', checkoutUrl: 'https://c.test/s1' }));

    await createCheckoutSession('https://api.test', {});

    assert.deepEqual(storageWrites, []);
  });

  it('raises a stable error when session creation fails', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ message: 'Stripe unavailable' }, { ok: false, status: 503 }));

    await assert.rejects(
      () => createCheckoutSession('', {}),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed && error.status === 503
    );
  });

  // `on401: 'ignore'` is this module's documented policy (docs/request-policy.md): a 401 has to
  // reach the page as `sessionExpired`, which it renders, instead of being routed to the logout
  // choke point — that would drop the user out of the app mid-checkout. Without the option
  // `apiFetch` throws a bare `Unauthorized` and this assertion is what notices.
  it('maps a 401 onto sessionExpired rather than logging the user out mid-checkout', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ error: { message: 'expired' } }, { ok: false, status: 401 }));

    await assert.rejects(
      () => createCheckoutSession('', {}),
      (error) => error.code === UPGRADE_ERROR_CODES.sessionExpired && error.status === 401
    );
  });

  it('rejects a response without a hosted URL or request id', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ ok: true }));

    await assert.rejects(
      () => createCheckoutSession('', {}),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutUnavailable
    );
  });
});

describe('getCheckoutStatus', () => {
  it('reads the session by id, escaping it into the path', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ status: 'paid', clientName: 'Acme Productive' }));

    const status = await getCheckoutStatus('https://api.test', 'req/1');

    assert.deepEqual(status, { status: 'paid', clientName: 'Acme Productive' });
    assert.equal(calls[0][0], 'https://api.test/sws/go/checkout/sessions/req%2F1');
  });

  // The read that kept working while the writes were refused, which is what made the bug invisible
  // from the screen. Pinned so the asymmetry stays deliberate rather than accidental.
  it('sends neither credential header, and still lets the cookie travel', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ status: 'pending' }));

    await getCheckoutStatus('https://api.test', 'req-1');

    assert.equal(calls[0][1].method ?? 'GET', 'GET');
    assert.equal(headersOf()['x-go-csrf'], undefined);
    assert.equal(headersOf().authorization, undefined);
    assert.equal(calls[0][1].credentials, 'include');
  });

  it('carries the bearer token on the read under the bearer scheme', async () => {
    // A read needs the credential just as much as a write does: leaving `buildHeaders()`
    // credential-less while only the cookie scheme existed silently unauthenticated every read the
    // moment the bearer scheme came back.
    declareBearerSession();
    installFetch(jsonResponse({ status: 'pending' }));

    await getCheckoutStatus('https://api.test', 'req-1');

    assert.equal(headersOf().authorization, `Bearer ${BEARER}`);
    assert.equal(headersOf()['x-go-csrf'], undefined);
  });

  it('falls back to pending when the body is empty', async () => {
    declareCookieSession();
    installFetch({ ok: true, status: 200, json: async () => null });

    assert.deepEqual(await getCheckoutStatus('', 'req-1'), { status: 'pending' });
  });

  it('maps a 401 onto sessionExpired', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ error: { message: 'expired' } }, { ok: false, status: 401 }));

    await assert.rejects(
      () => getCheckoutStatus('', 'req-1'),
      (error) => error.code === UPGRADE_ERROR_CODES.sessionExpired
    );
  });
});

describe('runPaidOnboarding', () => {
  const RESULT = { type: 'result', success: true, clientName: 'Acme Productive' };

  it('posts the tenant intent with the write proof and streams the result back', async () => {
    declareCookieSession();
    installFetch(ndjsonResponse([
      { type: 'progress', step: 'setup', status: 'in_progress' },
      { type: 'progress', step: 'setup', status: 'done', ms: 10 },
      RESULT,
    ]));
    const messages = [];

    const result = await runPaidOnboarding(
      'https://api.test',
      { clientName: 'Acme Productive', paymentToken: 'req-1' },
      (message) => messages.push(message),
    );

    assert.equal(calls[0][0], 'https://api.test/sws/go/onboarding');
    assert.equal(calls[0][1].method, 'POST');
    assert.equal(headersOf()['x-go-csrf'], CSRF);
    assert.equal(headersOf().authorization, undefined);
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      clientName: 'Acme Productive',
      currency: 'EUR',
      language: 'en_US',
      countryCode: 'AR',
      paymentToken: 'req-1',
      upgradeAction: 'create-productive',
    });
    assert.deepEqual(result, RESULT);
    // Every line is reported as it arrives, not only the terminal one: the progress list is what
    // the screen draws while provisioning runs.
    assert.equal(messages.length, 3);
  });

  it('reassembles a result split across chunk boundaries', async () => {
    // The reader is handed 8-byte chunks, so `{"type":"result"…}` is guaranteed to arrive in
    // pieces. A buffering bug here loses the terminal message and reports a successful run as a
    // failure.
    declareCookieSession();
    installFetch(ndjsonResponse([RESULT], { chunkSize: 8 }));

    assert.deepEqual(await runPaidOnboarding('', { clientName: 'Acme' }), RESULT);
  });

  it('raises sessionExpired on a 401 instead of throwing Unauthorized', async () => {
    declareCookieSession();
    installFetch({ ok: false, status: 401, json: async () => ({}) });

    await assert.rejects(
      () => runPaidOnboarding('', { clientName: 'Acme' }),
      (error) => error.code === UPGRADE_ERROR_CODES.sessionExpired && error.status === 401
    );
  });

  it('raises the generic failure when the response carries no stream at all', async () => {
    declareCookieSession();
    installFetch({ ok: true, status: 200, json: async () => ({}) });

    await assert.rejects(
      () => runPaidOnboarding('', { clientName: 'Acme' }),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed
    );
  });

  it('raises the generic failure when the stream itself reports failure', async () => {
    declareCookieSession();
    installFetch(ndjsonResponse([{ type: 'result', success: false }]));

    await assert.rejects(
      () => runPaidOnboarding('', { clientName: 'Acme' }),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed
    );
  });

  it('writes no credential into storage', async () => {
    declareCookieSession();
    installFetch(ndjsonResponse([RESULT]));

    await runPaidOnboarding('', { clientName: 'Acme' });

    assert.deepEqual(storageWrites, []);
  });
});
