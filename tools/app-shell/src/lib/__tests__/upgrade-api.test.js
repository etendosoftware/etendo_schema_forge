import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADE_ERROR_CODES,
  getCheckoutToken,
  getPlatformToken,
  createCheckoutSession,
  fetchPlans,
  createBillingPurchase,
  getBillingOverview,
  getBillingOffer,
  getBillingPurchase,
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

describe('account billing projection', () => {
  it('reads overview with account authentication', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ canManageBilling: true, purchases: [] }));
    const result = await getBillingOverview(fetchImpl, '', 'account-token');
    assert.deepEqual(result, { canManageBilling: true, purchases: [] });
    assert.equal(fetchImpl.calls[0].url, '/sws/go/billing/overview');
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer account-token');
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
  it('prefers the active environment JWT over a stale account token', async () => {
    assert.equal(getCheckoutToken({
      getItem: key => ({ sf_auth_token: 'environment-token', sf_platform_token: 'stale-token' }[key]),
    }), 'environment-token');
  });
});

describe('fetchPlans', () => {
  const PLAN = {
    planKey: 'productive-monthly',
    name: 'Productive',
    description: 'A second tenant for real work',
    displayPrice: '49.00',
    currency: 'EUR',
    billingInterval: 'month',
  };

  it('reads the catalog with the session credential and no price field', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ plans: [PLAN] }));

    assert.deepEqual(await fetchPlans(fetchImpl, 'https://api.test', 'platform-token'), [PLAN]);
    assert.equal(fetchImpl.calls[0].url, 'https://api.test/sws/go/plans');
    // The canonical builder, so Accept-Language rides along and the backend answers reference
    // data in the UI locale rather than the account's AD language (ETP-5022).
    assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer platform-token');
    assert.ok(fetchImpl.calls[0].init.headers['Accept-Language']);
    assert.equal(fetchImpl.calls[0].init.body, undefined);
  });

  it('treats an empty catalog as an answer, not a failure', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ plans: [] }));

    // "Nothing is on sale" is a state the page renders (checkout disabled), not an error it
    // reports as a broken backend.
    assert.deepEqual(await fetchPlans(fetchImpl, '', 'token'), []);
  });

  it('returns an empty list when the payload carries no plans array', async () => {
    const fetchImpl = recordingFetch(jsonResponse({}));

    assert.deepEqual(await fetchPlans(fetchImpl, '', 'token'), []);
  });

  it('raises a stable error the page can translate when the catalog cannot be read', async () => {
    const fetchImpl = recordingFetch(jsonResponse({ message: 'boom' }, { ok: false, status: 503 }));

    // It must REJECT rather than fall back to a guessed key: the server requires a plan key and
    // has no default, so a guess would be a purchase nobody reviewed.
    await assert.rejects(
      () => fetchPlans(fetchImpl, '', 'token'),
      error => error.code === UPGRADE_ERROR_CODES.plansUnavailable && error.status === 503
    );
  });

  it('reports an expired session distinctly from an unreadable catalog', async () => {
    const fetchImpl = recordingFetch(jsonResponse({}, { ok: false, status: 401 }));

    await assert.rejects(
      () => fetchPlans(fetchImpl, '', 'token'),
      error => error.code === UPGRADE_ERROR_CODES.sessionExpired
    );
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
      planKey: 'productive-monthly',
    });

    assert.deepEqual(result, {
      requestId: 'req-1',
      checkoutUrl: 'https://checkout.stripe.test/session-1',
      expiresAt: null,
    });
    assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      planKey: 'productive-monthly',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });
    // A plan KEY, never a price. The server owns the Stripe Price ID; there is no request field
    // for one and no code path that reads one.
    assert.doesNotMatch(fetchImpl.calls[0].init.body, /cardNumber|paymentToken|priceId|amount/);
  });

  it('omits planKey when the caller did not name a plan', async () => {
    const fetchImpl = recordingFetch(jsonResponse({
      requestId: 'req-2',
      checkoutUrl: 'https://checkout.stripe.test/session-2',
    }));

    await createCheckoutSession(fetchImpl, 'https://api.test', 'platform-token', {
      clientName: 'Acme Productive',
    });

    // The server requires the key and has no default plan, so a missing one is refused there
    // rather than papered over here with a guess about what is for sale.
    assert.equal('planKey' in JSON.parse(fetchImpl.calls[0].init.body), false);
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
