import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADE_ERROR_CODES,
  getCheckoutToken,
  getPlatformToken,
  createCheckoutSession,
  createBillingPurchase,
  getBillingOverview,
  getSubscription,
  createPortalSession,
  getBillingOffer,
  getBillingPurchase,
  toCheckoutFetch,
} from '../upgrade/api.js';
import { minorUnitsToAmount } from '../upgrade/currency.js';

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

describe('account billing projection', () => {
  it('reads overview with account authentication', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ canManageBilling: true, purchases: [] }));
    const result = await getBillingOverview(fetchImpl, '', 'account-token');
    assert.deepEqual(result, { canManageBilling: true, purchases: [] });
    assert.equal(fetchImpl.calls[0].url, '/sws/go/billing/overview');
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer account-token');
  });

  it('reads the subscription with account authentication', async () => {
    const subscription = {
      hasSubscription: true,
      plan: 'Productive',
      status: 'active',
    };
    const fetchImpl = recordingFetch(jsonResponse(subscription));
    const result = await getSubscription(fetchImpl, 'https://api.test', 'account-token');

    assert.deepEqual(result, subscription);
    assert.equal(fetchImpl.calls[0].url, 'https://api.test/sws/go/billing/subscription');
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer account-token');
  });

  it('creates a portal session with the account token', async () => {
    const portal = { url: 'https://billing.stripe.test/session-1' };
    const fetchImpl = recordingFetch(jsonResponse(portal));
    const result = await createPortalSession(fetchImpl, 'https://api.test', 'account-token');

    assert.deepEqual(result, portal);
    assert.equal(fetchImpl.calls[0].url, 'https://api.test/sws/go/billing/subscription/portal');
    assert.equal(fetchImpl.calls[0].init.method, 'POST');
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer account-token');
  });

  // ETP-5443 REVIEW N3: a failed read of the subscription is its own error code, not the
  // generic checkout-creation one — see the doc comment on UPGRADE_ERROR_CODES.
  it('returns a stable error when the subscription is unavailable', async () => {
    const fetchImpl = recordingFetch(jsonResponse({}, { ok: false, status: 503 }));

    await assert.rejects(
      () => getSubscription(fetchImpl, '', 'account-token'),
      error => error.code === UPGRADE_ERROR_CODES.subscriptionUnavailable && error.status === 503
    );
  });

  // ETP-5443 REVIEW N3: a failed portal-session creation is its own error code too, distinct
  // from both `subscriptionUnavailable` and `checkoutCreationFailed`.
  it('returns a stable error when the portal session cannot be created', async () => {
    const fetchImpl = recordingFetch(jsonResponse({}, { ok: false, status: 502 }));

    await assert.rejects(
      () => createPortalSession(fetchImpl, '', 'account-token'),
      error => error.code === UPGRADE_ERROR_CODES.portalUnavailable && error.status === 502
    );
  });

  it('encodes purchase ids and returns a stable error for an unavailable projection', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ message: 'missing' }, { ok: false, status: 404 }));
    await assert.rejects(
      () => getBillingPurchase(fetchImpl, '', 'token', 'purchase/1'),
      error => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed && error.status === 404
    );
    assert.equal(fetchImpl.calls[0].url, '/sws/go/billing/purchases/purchase%2F1');
  });

  it('reads the server-owned billing offer', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ amountMinor: 4900, currency: 'EUR', interval: 'month' }));
    const result = await getBillingOffer(fetchImpl, '', 'token');
    assert.equal(result.amountMinor, 4900);
    assert.equal(fetchImpl.calls[0].url, '/sws/go/billing/offers');
  });
});

describe('getCheckoutToken', () => {
  it('uses the account token when an environment JWT is also present', () => {
    assert.equal(getCheckoutToken({
      getItem: key => ({ sf_auth_token: 'environment-token', sf_platform_token: 'stale-token' }[key]),
    }), 'stale-token');
  });

  it('does not authorize billing with an environment JWT when the account token is missing', () => {
    assert.equal(getCheckoutToken({
      getItem: key => (key === 'sf_auth_token' ? 'environment-token' : null),
    }), null);
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
      upgradeAction: 'create-productive',
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

describe('createBillingPurchase', () => {
  it('uses the account-level billing boundary while sending only product intent', async () => {
    const fetchImpl = recordingFetch(jsonResponse({
      requestId: 'req-2',
      checkoutUrl: 'https://checkout.example/session-2',
    }));
    const result = await createBillingPurchase(fetchImpl, 'https://api.test', 'token', {
      clientName: 'Acme Productive', language: 'es_ES',
    });
    assert.equal(result.requestId, 'req-2');
    assert.equal(fetchImpl.calls[0].url, 'https://api.test/sws/go/billing/purchases');
    assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });
  });

  it('returns an identifiable error for a duplicate active purchase', async () => {
    const fetchImpl = recordingFetch(jsonResponse(
      { purchaseId: 'req-1', status: 'CREATED' }, { ok: false, status: 409 }
    ));
    await assert.rejects(
      () => createBillingPurchase(fetchImpl, '', 'token', { clientName: 'Acme' }),
      error => error.code === UPGRADE_ERROR_CODES.purchaseAlreadyExists
        && error.purchase.purchaseId === 'req-1'
    );
  });
});

// ETP-5443 REVIEW W7: adapts the shared `apiFetch` request helper to the plain
// `fetchImpl(url, init)` shape this module's clients take. See `toCheckoutFetch`'s own doc
// comment in `upgrade/api.js` for why each forced option matters.
describe('toCheckoutFetch', () => {
  function recordingApiFetch() {
    const calls = [];
    const impl = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({});
    };
    impl.calls = calls;
    return impl;
  }

  it('forces baseUrl empty and on401 ignore, and passes the token through as an explicit override', async () => {
    const apiFetchImpl = recordingApiFetch();
    const fetchImpl = toCheckoutFetch(apiFetchImpl, 'account-token');

    await fetchImpl('/sws/go/billing/subscription', { headers: { Authorization: 'Bearer x' } });

    assert.equal(apiFetchImpl.calls[0].url, '/sws/go/billing/subscription');
    assert.deepEqual(apiFetchImpl.calls[0].init, {
      headers: { Authorization: 'Bearer x' },
      token: 'account-token',
      baseUrl: '',
      on401: 'ignore',
    });
  });

  // A missing account session must degrade to "no Authorization header" (an honest 401), not
  // silently fall back to the ambient ERP session token — see the doc comment's third bullet.
  it('keeps a null token null instead of falling back to the ambient session', async () => {
    const apiFetchImpl = recordingApiFetch();
    const fetchImpl = toCheckoutFetch(apiFetchImpl, null);

    await fetchImpl('/sws/go/billing/subscription', {});

    assert.equal(apiFetchImpl.calls[0].init.token, null);
    assert.notEqual(apiFetchImpl.calls[0].init.token, undefined);
  });
});

// ETP-5443 REVIEW N6: Stripe's zero-decimal currencies (JPY et al.) already carry the display
// amount in `amountMinor` — dividing by 100 would understate them 100x.
describe('minorUnitsToAmount', () => {
  it('divides by 100 for an ordinary (non-zero-decimal) currency', () => {
    assert.equal(minorUnitsToAmount('eur', 2900), 29);
    assert.equal(minorUnitsToAmount('EUR', 100), 1);
  });

  it('does not divide for a zero-decimal currency, case-insensitively', () => {
    assert.equal(minorUnitsToAmount('jpy', 100), 100);
    assert.equal(minorUnitsToAmount('JPY', 100), 100);
  });

  it('returns null for a missing or non-finite amount', () => {
    assert.equal(minorUnitsToAmount('eur', null), null);
    assert.equal(minorUnitsToAmount('eur', undefined), null);
    assert.equal(minorUnitsToAmount('eur', NaN), null);
  });
});
