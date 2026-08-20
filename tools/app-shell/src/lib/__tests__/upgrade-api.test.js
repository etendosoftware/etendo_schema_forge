import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADE_ERROR_CODES,
  createCheckoutSession,
} from '../upgrade/api.js';
// ETP-4576: the credential comes from the active session scheme, so the tests
// publish one directly instead of stubbing a localStorage that no longer holds
// anything. Imported from the `sessionCredentials` leaf, not the `./auth`
// barrel, which re-exports AuthContext.jsx and cannot load under `node --test`.
import {
  CREDENTIAL_MODES,
  setSessionCredentials,
  resetSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

const TEST_BEARER = 'test-bearer';
const TEST_CSRF = 'test-csrf';

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('createCheckoutSession', () => {
  it('posts product intent without card or price fields', async () => {
    const fetchImpl = recordingFetch(jsonResponse({
      requestId: 'req-1',
      checkoutUrl: 'https://checkout.stripe.test/session-1',
    }));
    setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: TEST_BEARER, csrfToken: TEST_CSRF });
    const result = await createCheckoutSession(fetchImpl, 'https://api.test', {
      action: 'productive-tenant',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });

    assert.deepEqual(result, {
      requestId: 'req-1',
      checkoutUrl: 'https://checkout.stripe.test/session-1',
      expiresAt: null,
    });
    assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });
    assert.doesNotMatch(fetchImpl.calls[0].init.body, /cardNumber|paymentToken|priceId|amount/);
  });

  it('raises a stable error when session creation fails', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ message: 'Stripe unavailable' }, { ok: false, status: 503 }));
    await assert.rejects(
      () => createCheckoutSession(fetchImpl, ''),
      error => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed && error.status === 503
    );
  });

  it('rejects a response without a hosted URL or request id', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ ok: true }));
    await assert.rejects(
      () => createCheckoutSession(fetchImpl, ''),
      error => error.code === UPGRADE_ERROR_CODES.checkoutUnavailable
    );
  });

  it('carries the bearer token under the bearer scheme', async () => {
    setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: TEST_BEARER, csrfToken: TEST_CSRF });
    const fetchImpl = recordingFetch(jsonResponse({
      requestId: 'req-1', checkoutUrl: 'https://checkout.stripe.test/session-1',
    }));
    await createCheckoutSession(fetchImpl, 'https://api.test', {});

    const { init } = fetchImpl.calls[0];
    assert.equal(init.headers.Authorization, `Bearer ${TEST_BEARER}`);
    assert.equal(init.headers['X-Go-CSRF'], undefined);
    assert.equal(init.credentials, 'include');
    resetSessionCredentials();
  });

  it('carries the CSRF proof and no bearer token under the cookie scheme', async () => {
    setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, token: TEST_BEARER, csrfToken: TEST_CSRF });
    const fetchImpl = recordingFetch(jsonResponse({
      requestId: 'req-1', checkoutUrl: 'https://checkout.stripe.test/session-1',
    }));
    await createCheckoutSession(fetchImpl, 'https://api.test', {});

    const { init } = fetchImpl.calls[0];
    // POST is unsafe: without this header the backend answers 403 once the
    // cookie-session preference is on, and no bearer-only test can see it.
    assert.equal(init.headers['X-Go-CSRF'], TEST_CSRF);
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.credentials, 'include');
    resetSessionCredentials();
  });
});
