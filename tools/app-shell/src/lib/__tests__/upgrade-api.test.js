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
  createBillingPurchase,
  createCheckoutSession,
  getBillingOffer,
  getBillingOverview,
  getBillingPurchase,
  getCheckoutStatus,
  getSubscription,
  createPortalSession,
  runPaidOnboarding,
} from '../upgrade/api.js';
import { minorUnitsToAmount } from '../upgrade/currency.js';

/**
 * ETP-4576 — the checkout client's REQUEST contract, not just its parsing.
 *
 * The bug this file now guards was silent by construction. Every call in this module used to take
 * a `fetchImpl` plus a `token`, and the token went to `buildAuthHeaders`, which puts whatever it
 * receives into `X-Go-CSRF`. The token was read from `sf_auth_token`/`sf_platform_token`, keys
 * `purgeLegacyAuthStorage` deletes, so the argument was null: the POSTs left with no proof of
 * intent and were refused, while the GETs beside them kept working — the browser attaches the
 * session cookie on its own and a read needs no proof. Nothing in the old suite could see that,
 * because it asserted on a fetch double it injected itself and never on what went on the wire.
 *
 * The develop merge that brought the billing calls in reintroduced that exact shape, which is why
 * the module-surface guard and the per-call header assertions below cover all of them, not only
 * the three that were migrated first.
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
  // legacy-key reader being reintroduced by a merge — which is exactly what the develop merge that
  // brought the billing calls in tried to do: they arrived built on `buildAuthHeaders(token)` with
  // the token read from those same purged keys.
  it('exposes no token reader — the credential comes from the active scheme', () => {
    assert.equal(upgradeApi.getPlatformToken, undefined);
    assert.equal(upgradeApi.getCheckoutToken, undefined);
  });

  // Pinned exactly, so a call added by a future merge cannot slip in without being routed through
  // `apiFetch` and covered below.
  it('exports only the documented calls and the error table', () => {
    assert.deepEqual(Object.keys(upgradeApi).sort(), [
      'UPGRADE_ERROR_CODES',
      'createBillingPurchase',
      'createCheckoutSession',
      'createPortalSession',
      'getBillingOffer',
      'getBillingOverview',
      'getBillingPurchase',
      'getCheckoutStatus',
      'getSubscription',
      'runPaidOnboarding',
    ]);
  });
});

describe('createCheckoutSession', () => {
  it('preserves an explicit all-false transfer choice on the legacy checkout route', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ requestId: 'req-1', checkoutUrl: 'https://c.test/s1' }));

    await createCheckoutSession('', { dataTransfer: { products: false, contacts: false } });

    assert.deepEqual(JSON.parse(calls[0][1].body).dataTransfer,
      { products: false, contacts: false });
  });

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
      { clientName: 'Acme Productive', paymentToken: 'req-1', countryCode: 'AR' },
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

  it('does not serialize an empty transfer selection for an independent productive environment', async () => {
    declareCookieSession();
    installFetch(ndjsonResponse([RESULT]));

    await runPaidOnboarding('https://api.test', {
      clientName: 'Second Productive',
      paymentToken: 'req-2',
      dataTransfer: {},
    });

    const body = JSON.parse(calls[0][1].body);
    assert.equal(body.clientName, 'Second Productive');
    assert.equal(Object.hasOwn(body, 'demoClientId'), false);
    assert.equal(Object.hasOwn(body, 'dataTransfer'), false);
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

/*
 * The four calls below arrived with the develop merge. They were written against the shape this
 * module no longer has — an injected `fetchImpl` plus a `token` fed to `buildAuthHeaders` — so they
 * are retargeted here onto the migrated signatures and, like every case above, driven through the
 * REAL `apiFetch` with `globalThis.fetch` stubbed underneath. That is the only way the assertions
 * can see the bug: a suite that inspects a double it injected itself would report
 * `Authorization: Bearer <purged key>` as a pass while the wire carried no proof of intent at all.
 */
describe('createBillingPurchase', () => {
  for (const selection of [
    { products: false, contacts: false },
    { products: true, contacts: false },
    { products: false, contacts: true },
    { products: true, contacts: true },
  ]) {
    it(`sends the explicit transfer choice ${JSON.stringify(selection)} with the purchase`, async () => {
      declareCookieSession();
      installFetch(jsonResponse({ requestId: 'req-2', checkoutUrl: 'https://c.test/s2' }));

      await createBillingPurchase('https://api.test', {
        clientName: 'Acme Productive', dataTransfer: selection,
      });

      assert.deepEqual(JSON.parse(calls[0][1].body).dataTransfer, selection);
    });
  }

  it('posts product intent to the billing boundary, with no card or price fields', async () => {
    declareCookieSession();
    installFetch(jsonResponse({
      requestId: 'req-2',
      checkoutUrl: 'https://checkout.example/session-2',
    }));

    const result = await createBillingPurchase('https://api.test', {
      clientName: 'Acme Productive',
      language: 'es_ES',
    });

    assert.deepEqual(result, {
      requestId: 'req-2',
      checkoutUrl: 'https://checkout.example/session-2',
      expiresAt: null,
    });
    assert.equal(calls[0][0], 'https://api.test/sws/go/billing/purchases');
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      action: 'productive-tenant',
      upgradeAction: 'create-productive',
      clientName: 'Acme Productive',
      language: 'es_ES',
    });
    assert.doesNotMatch(calls[0][1].body, /cardNumber|paymentToken|priceId|amount/);
  });

  // THE regression, on the call the merge introduced: it arrived with the exact shape that made the
  // original bug invisible, so the same assertion has to hold for it.
  it('carries the write proof and no bearer token under the cookie scheme', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ requestId: 'req-2', checkoutUrl: 'https://c.test/s2' }));

    await createBillingPurchase('https://api.test', {});

    assert.equal(calls[0][1].method, 'POST');
    assert.equal(headersOf()['x-go-csrf'], CSRF);
    assert.equal(headersOf().authorization, undefined);
    assert.equal(calls[0][1].credentials, 'include');
  });

  it('carries the bearer token, and the proof too, under the bearer scheme', async () => {
    declareBearerSession();
    installFetch(jsonResponse({ requestId: 'req-2', checkoutUrl: 'https://c.test/s2' }));

    await createBillingPurchase('https://api.test', {});

    assert.equal(headersOf().authorization, `Bearer ${BEARER}`);
    assert.equal(headersOf()['x-go-csrf'], CSRF);
  });

  it('writes no credential into storage', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ requestId: 'req-2', checkoutUrl: 'https://c.test/s2' }));

    await createBillingPurchase('https://api.test', {});

    assert.deepEqual(storageWrites, []);
  });

  // A duplicate is a domain answer, not a failure: the page reopens the purchase it is told about,
  // so the payload has to survive on the error object.
  it('raises purchaseAlreadyExists with the purchase attached on a 409', async () => {
    declareCookieSession();
    installFetch(jsonResponse(
      { purchaseId: 'req-1', status: 'CREATED' }, { ok: false, status: 409 },
    ));

    await assert.rejects(
      () => createBillingPurchase('', { clientName: 'Acme' }),
      (error) => error.code === UPGRADE_ERROR_CODES.purchaseAlreadyExists
        && error.status === 409
        && error.purchase.purchaseId === 'req-1'
        && error.purchase.status === 'CREATED',
    );
  });

  // A 409 that names no purchase is not a duplicate the page can reopen, and must not be reported
  // as one — the screen would navigate to a purchase nobody named.
  it('falls back to the generic failure on a 409 that names no purchase', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ message: 'conflict' }, { ok: false, status: 409 }));

    await assert.rejects(
      () => createBillingPurchase('', {}),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed
        && error.purchase === undefined,
    );
  });

  it('maps a 401 onto sessionExpired rather than logging the user out mid-checkout', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ error: { message: 'expired' } }, { ok: false, status: 401 }));

    await assert.rejects(
      () => createBillingPurchase('', {}),
      (error) => error.code === UPGRADE_ERROR_CODES.sessionExpired && error.status === 401,
    );
  });

  it('rejects a response without a hosted URL or request id', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ ok: true }));

    await assert.rejects(
      () => createBillingPurchase('', {}),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutUnavailable,
    );
  });
});

describe('the account billing reads', () => {
  it('reads the overview projection', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ canManageBilling: true, purchases: [] }));

    const result = await getBillingOverview('https://api.test');

    assert.deepEqual(result, { canManageBilling: true, purchases: [] });
    assert.equal(calls[0][0], 'https://api.test/sws/go/billing/overview');
  });

  it('falls back to an empty projection when the body is empty', async () => {
    declareCookieSession();
    installFetch({ ok: true, status: 200, json: async () => null });

    assert.deepEqual(await getBillingOverview(''), { purchases: [] });
  });

  it('reads the server-owned billing offer', async () => {
    declareCookieSession();
    const stripeOffer = { code: 'productive-tenant', amountMinor: 1000, currency: 'USD', interval: 'year' };
    installFetch(jsonResponse(stripeOffer));

    const result = await getBillingOffer('https://api.test');

    assert.deepEqual(result, stripeOffer);
    assert.equal(calls[0][0], 'https://api.test/sws/go/billing/offers');
  });

  it('does not invent amount or interval when the billing offer omits them', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ currency: 'EUR' }));

    assert.deepEqual(await getBillingOffer('https://api.test'), { currency: 'EUR' });
  });

  it('escapes the purchase id into the path', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ purchaseId: 'purchase/1', status: 'CREATED' }));

    const purchase = await getBillingPurchase('https://api.test', 'purchase/1');

    assert.equal(purchase.status, 'CREATED');
    assert.equal(calls[0][0], 'https://api.test/sws/go/billing/purchases/purchase%2F1');
  });

  it('raises a stable error for an unavailable purchase', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ message: 'missing' }, { ok: false, status: 404 }));

    await assert.rejects(
      () => getBillingPurchase('', 'purchase-1'),
      (error) => error.code === UPGRADE_ERROR_CODES.checkoutCreationFailed && error.status === 404,
    );
  });

  // The asymmetry that made the original bug invisible: a read needs no proof of intent, so these
  // three kept working while the POSTs beside them were refused. Pinned on all three so the
  // asymmetry stays deliberate, and so a future "just send the header everywhere" has to argue
  // with a test.
  for (const [name, call] of [
    ['getBillingOverview', () => getBillingOverview('https://api.test')],
    ['getBillingOffer', () => getBillingOffer('https://api.test')],
    ['getBillingPurchase', () => getBillingPurchase('https://api.test', 'purchase-1')],
    ['getSubscription', () => getSubscription('https://api.test')],
  ]) {
    it(`${name} sends neither credential header, and still lets the cookie travel`, async () => {
      declareCookieSession();
      installFetch(jsonResponse({}));

      await call();

      assert.equal(calls[0][1].method ?? 'GET', 'GET');
      assert.equal(headersOf()['x-go-csrf'], undefined);
      assert.equal(headersOf().authorization, undefined);
      assert.equal(calls[0][1].credentials, 'include');
    });

    it(`${name} carries the bearer token under the bearer scheme`, async () => {
      declareBearerSession();
      installFetch(jsonResponse({}));

      await call();

      assert.equal(headersOf().authorization, `Bearer ${BEARER}`);
      assert.equal(headersOf()['x-go-csrf'], undefined);
    });

    it(`${name} writes no credential into storage`, async () => {
      declareCookieSession();
      installFetch(jsonResponse({}));

      await call();

      assert.deepEqual(storageWrites, []);
    });

    it(`${name} maps a 401 onto sessionExpired`, async () => {
      declareCookieSession();
      installFetch(jsonResponse({ error: { message: 'expired' } }, { ok: false, status: 401 }));

      await assert.rejects(
        call,
        (error) => error.code === UPGRADE_ERROR_CODES.sessionExpired && error.status === 401,
      );
    });
  }
});

// ETP-5443 — the account Subscription section's two calls, in the same shape as their siblings.
describe('the account subscription', () => {
  it('reads the subscription projection', async () => {
    declareCookieSession();
    const subscription = { hasSubscription: true, plan: 'Productive', status: 'active' };
    installFetch(jsonResponse(subscription));

    const result = await getSubscription('https://api.test');

    assert.deepEqual(result, subscription);
    assert.equal(calls[0][0], 'https://api.test/sws/go/billing/subscription');
  });

  // ETP-5443 REVIEW N3: a failed read of the subscription is its own error code, not the
  // generic checkout-creation one — see the doc comment on UPGRADE_ERROR_CODES.
  it('raises a stable error when the subscription is unavailable', async () => {
    declareCookieSession();
    installFetch(jsonResponse({}, { ok: false, status: 503 }));

    await assert.rejects(
      () => getSubscription(''),
      (error) => error.code === UPGRADE_ERROR_CODES.subscriptionUnavailable && error.status === 503,
    );
  });

  it('opens a portal session with a POST to the portal endpoint', async () => {
    declareCookieSession();
    const portal = { url: 'https://billing.stripe.test/session-1' };
    installFetch(jsonResponse(portal));

    const result = await createPortalSession('https://api.test');

    assert.deepEqual(result, portal);
    assert.equal(calls[0][0], 'https://api.test/sws/go/billing/subscription/portal');
    assert.equal(calls[0][1].method, 'POST');
  });

  it('carries the write proof and no bearer token on the portal POST under the cookie scheme', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ url: 'https://billing.stripe.test/session-1' }));

    await createPortalSession('https://api.test');

    assert.equal(headersOf()['x-go-csrf'], CSRF);
    assert.equal(headersOf().authorization, undefined);
    assert.equal(calls[0][1].credentials, 'include');
  });

  it('carries the bearer token, and the proof too, on the portal POST under the bearer scheme', async () => {
    declareBearerSession();
    installFetch(jsonResponse({ url: 'https://billing.stripe.test/session-1' }));

    await createPortalSession('https://api.test');

    assert.equal(headersOf().authorization, `Bearer ${BEARER}`);
    assert.equal(headersOf()['x-go-csrf'], CSRF);
  });

  it('writes no credential into storage when opening the portal', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ url: 'https://billing.stripe.test/session-1' }));

    await createPortalSession('https://api.test');

    assert.deepEqual(storageWrites, []);
  });

  it('maps a portal 401 onto sessionExpired', async () => {
    declareCookieSession();
    installFetch(jsonResponse({ error: { message: 'expired' } }, { ok: false, status: 401 }));

    await assert.rejects(
      () => createPortalSession(''),
      (error) => error.code === UPGRADE_ERROR_CODES.sessionExpired && error.status === 401,
    );
  });

  // ETP-5443 REVIEW N3: a failed portal-session creation is its own error code too, distinct
  // from both `subscriptionUnavailable` and `checkoutCreationFailed`.
  it('raises a stable error when the portal session cannot be created', async () => {
    declareCookieSession();
    installFetch(jsonResponse({}, { ok: false, status: 502 }));

    await assert.rejects(
      () => createPortalSession(''),
      (error) => error.code === UPGRADE_ERROR_CODES.portalUnavailable && error.status === 502,
    );
  });
});

// ETP-5443 REVIEW N6: Stripe's zero-decimal currencies (JPY et al.) already carry the display
// amount in `amountMinor` — dividing by 100 would understate them 100x.
describe('minorUnitsToAmount', () => {
  it('divides by 100 and keeps two fraction digits for an ordinary currency', () => {
    assert.deepStrictEqual(minorUnitsToAmount('eur', 2900), { amount: 29, fractionDigits: 2 });
    assert.deepStrictEqual(minorUnitsToAmount('EUR', 100), { amount: 1, fractionDigits: 2 });
    assert.deepStrictEqual(minorUnitsToAmount('usd', 1050), { amount: 10.5, fractionDigits: 2 });
  });

  it('does not divide for a zero-decimal currency, case-insensitively', () => {
    assert.deepStrictEqual(minorUnitsToAmount('jpy', 100), { amount: 100, fractionDigits: 0 });
    assert.deepStrictEqual(minorUnitsToAmount('JPY', 100), { amount: 100, fractionDigits: 0 });
  });

  // Stripe keeps two-digit API amounts for ISK and UGX for backward compatibility, but neither can
  // be charged in fractional units, so the amount is normalized by 100 and shown with no decimals.
  it('divides ISK by 100 but displays it as whole units', () => {
    assert.deepStrictEqual(minorUnitsToAmount('ISK', 500000), { amount: 5000, fractionDigits: 0 });
    assert.deepStrictEqual(minorUnitsToAmount('isk', 100), { amount: 1, fractionDigits: 0 });
  });

  it('divides UGX by 100 but displays it as whole units', () => {
    assert.deepStrictEqual(minorUnitsToAmount('UGX', 3700000), { amount: 37000, fractionDigits: 0 });
    assert.deepStrictEqual(minorUnitsToAmount('ugx', 100), { amount: 1, fractionDigits: 0 });
  });

  it('returns null for a missing or non-finite amount', () => {
    assert.equal(minorUnitsToAmount('eur', null), null);
    assert.equal(minorUnitsToAmount('eur', undefined), null);
    assert.equal(minorUnitsToAmount('eur', NaN), null);
    assert.equal(minorUnitsToAmount('eur', Infinity), null);
  });
});
