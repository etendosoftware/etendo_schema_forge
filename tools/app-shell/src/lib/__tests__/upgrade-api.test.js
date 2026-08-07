import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADE_ERROR_CODES,
  getCheckoutToken,
  getPlatformToken,
  createCheckoutSession,
} from '../upgrade/api.js';

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

describe('getPlatformToken', () => {
  it('reads the account-level token', () => {
    assert.equal(getPlatformToken({ getItem: key => (key === 'sf_platform_token' ? 'tok' : null) }), 'tok');
  });

  it('returns null when storage is absent or throws', () => {
    assert.equal(getPlatformToken(undefined), null);
    assert.equal(getPlatformToken({ getItem: () => { throw new Error('blocked'); } }), null);
  });
});

describe('getCheckoutToken', () => {
  it('prefers the active environment JWT over a stale account token', async () => {
    assert.equal(getCheckoutToken({
      getItem: key => ({ sf_auth_token: 'environment-token', sf_platform_token: 'stale-token' }[key]),
    }), 'environment-token');
  });
});

describe('createCheckoutSession', () => {
  it('posts product intent without card or price fields', async () => {
    const fetchImpl = recordingFetch(jsonResponse({
      requestId: 'req-1',
      checkoutUrl: 'https://checkout.stripe.test/session-1',
    }));
    const result = await createCheckoutSession(fetchImpl, 'https://api.test', 'platform-token', {
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
      clientName: 'Acme Productive',
      language: 'es_ES',
    });
    assert.doesNotMatch(fetchImpl.calls[0].init.body, /cardNumber|paymentToken|priceId|amount/);
  });

  it('raises a stable error when session creation fails', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ message: 'Stripe unavailable' }, { ok: false, status: 503 }));
    await assert.rejects(
      () => createCheckoutSession(fetchImpl, '', 'token'),
      error => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed && error.status === 503
    );
  });

  it('rejects a response without a hosted URL or request id', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ ok: true }));
    await assert.rejects(
      () => createCheckoutSession(fetchImpl, '', 'token'),
      error => error.code === UPGRADE_ERROR_CODES.checkoutUnavailable
    );
  });
});
