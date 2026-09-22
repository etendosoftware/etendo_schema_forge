import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSalesInvoiceReadiness,
  READINESS_ENDPOINTS,
  READINESS_FAILURE_KEYS,
} from '../onboardingReadiness.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function createFetchByUrl(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const entry = responses.find(response => url.includes(response.includes));
    if (!entry) throw new Error(`Unexpected URL: ${url}`);
    return jsonResponse(entry.status, entry.body);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// ETP-4576: the readiness probes authenticate with the server-side `__Host-`
// session cookie, so every request must opt into credentials and must never
// carry a bearer token.
function assertCookieSessionRequest({ url, options }) {
  assert.equal(
    options?.credentials,
    'include',
    `readiness request to ${url} must send credentials: 'include'`,
  );

  const headerNames = Object.keys(options?.headers ?? {}).map(name => name.toLowerCase());
  assert.equal(
    headerNames.includes('authorization'),
    false,
    `readiness request to ${url} must not send an Authorization header`,
  );

  assert.equal(
    /bearer/i.test(JSON.stringify(options ?? {})),
    false,
    `readiness request to ${url} must not mention a bearer token in its fetch options`,
  );
}

const readyResponses = [
  { includes: READINESS_ENDPOINTS.session, status: 200, body: { user: 'qa' } },
  { includes: READINESS_ENDPOINTS.defaults, status: 200, body: { documentType: 'DOC_TYPE_1' } },
  { includes: READINESS_ENDPOINTS.paymentTerms, status: 200, body: { items: [{ id: 'TERM_1', label: 'Immediate' }] } },
];

/**
 * Answers 401 on every endpoint for the first pass, then the ready responses — the
 * shape a rotated session cookie produces when the probes read before it applies.
 */
function createFetchThatSettlesAfterFirstPass() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const settled = calls.length > 3;
    if (!settled) return jsonResponse(401, {});
    const entry = readyResponses.find(response => url.includes(response.includes));
    if (!entry) throw new Error(`Unexpected URL: ${url}`);
    return jsonResponse(entry.status, entry.body);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}


describe('checkSalesInvoiceReadiness', () => {
  it('passes when session, defaults, payment terms and document type are usable', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, true);
    assert.deepEqual(result.failures, []);
    assert.equal(fetchImpl.calls.length, 3);
  });

  it('authenticates every readiness request with the session cookie and no bearer token', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(fetchImpl.calls.length, 3);
    fetchImpl.calls.forEach(assertCookieSessionRequest);

    const requestedUrls = fetchImpl.calls.map(call => call.url);
    Object.values(READINESS_ENDPOINTS).forEach(endpoint => {
      assert.ok(
        requestedUrls.some(url => url.includes(endpoint)),
        `expected a readiness request to ${endpoint}`,
      );
    });
  });

  it('exposes a token-free public signature', () => {
    assert.equal(
      checkSalesInvoiceReadiness.length,
      2,
      'checkSalesInvoiceReadiness must accept only (fetchImpl, baseUrl)',
    );
  });

  it('fails when the session endpoint is unauthorized', async () => {
    const fetchImpl = createFetchByUrl([
      { includes: READINESS_ENDPOINTS.session, status: 401, body: {} },
      ...readyResponses.slice(1),
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.deepEqual(result.failures[0], { key: READINESS_FAILURE_KEYS.session, status: 401 });
  });

  it('fails when payment terms are missing', async () => {
    const fetchImpl = createFetchByUrl([
      readyResponses[0],
      readyResponses[1],
      { includes: READINESS_ENDPOINTS.paymentTerms, status: 200, body: { items: [] } },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.equal(result.failures[0].key, READINESS_FAILURE_KEYS.paymentTerms);
  });

  // ETP-5079: this used to assert the opposite -- an empty customer selector made the tenant "not
  // ready". Onboarding no longer seeds a "Default Customer" business partner, so a freshly
  // provisioned tenant genuinely has none, and SetupProgressStep refuses to redirect into the app
  // on !ready. The customer leg is gone entirely; readiness must not consult C_BPartner at all.
  it('stays ready and never queries customers for a tenant with no business partners', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, true);
    assert.equal(READINESS_ENDPOINTS.customers, undefined);
    assert.equal(READINESS_FAILURE_KEYS.customers, undefined);
    assert.equal(fetchImpl.calls.some(call => call.url.includes('C_BPartner_ID')), false);
  });

  it('fails when document type is zero', async () => {
    const fetchImpl = createFetchByUrl([
      readyResponses[0],
      { includes: READINESS_ENDPOINTS.defaults, status: 200, body: { documentType: '0' } },
      readyResponses[2],
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.deepEqual(result.failures[0], {
      key: READINESS_FAILURE_KEYS.documentType,
      status: 200,
      documentType: '0',
    });
  });

  // ETP-4576 — `POST /sws/go/session/environment` rotates the session cookie, and these
  // three probes go out in parallel immediately after it. Under load the read can land
  // before the rotated cookie applies, and the backend rejects the superseded one on all
  // three at once — telling the user their new environment cannot invoice while naming
  // things that are all present.
  it('retries once when every probe is rejected, which is the rotated-cookie window', async () => {
    const fetchImpl = createFetchThatSettlesAfterFirstPass();

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, true, 'a session that settles must be reported as ready');
    assert.equal(fetchImpl.calls.length, 6, 'exactly two passes: no more, no less');
  });

  it('does not retry a genuine gap, so a real provisioning failure is still reported at once', async () => {
    // One probe failing is what a missing dataset looks like; retrying it would only
    // delay the report and hide the gap behind a spurious second chance.
    const fetchImpl = createFetchByUrl([
      readyResponses[0],
      readyResponses[1],
      { includes: READINESS_ENDPOINTS.paymentTerms, status: 200, body: { items: [] } },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.deepEqual(result.failures, [{ key: READINESS_FAILURE_KEYS.paymentTerms, status: 200 }]);
    assert.equal(fetchImpl.calls.length, 3, 'a single pass — the gap is real, not a timing artefact');
  });

  it('still fails when the session never settles, rather than retrying forever', async () => {
    const fetchImpl = createFetchByUrl([
      { includes: READINESS_ENDPOINTS.session, status: 401, body: {} },
      { includes: READINESS_ENDPOINTS.defaults, status: 401, body: {} },
      { includes: READINESS_ENDPOINTS.paymentTerms, status: 401, body: {} },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.equal(fetchImpl.calls.length, 6, 'one retry, then it reports the failure');
  });
});
