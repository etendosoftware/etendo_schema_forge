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
  { includes: READINESS_ENDPOINTS.customers, status: 200, body: { items: [{ id: 'BP_1', label: 'QA Customer' }] } },
];

describe('checkSalesInvoiceReadiness', () => {
  it('passes when session, defaults, payment terms, customers, and document type are usable', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, true);
    assert.deepEqual(result.failures, []);
    assert.equal(fetchImpl.calls.length, 4);
  });

  it('authenticates every readiness request with the session cookie and no bearer token', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(fetchImpl.calls.length, 4);
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
      readyResponses[3],
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.equal(result.failures[0].key, READINESS_FAILURE_KEYS.paymentTerms);
  });

  it('fails when customer selector is empty', async () => {
    const fetchImpl = createFetchByUrl([
      readyResponses[0],
      readyResponses[1],
      readyResponses[2],
      { includes: READINESS_ENDPOINTS.customers, status: 200, body: { items: [] } },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.equal(result.failures[0].key, READINESS_FAILURE_KEYS.customers);
  });

  it('fails when document type is zero', async () => {
    const fetchImpl = createFetchByUrl([
      readyResponses[0],
      { includes: READINESS_ENDPOINTS.defaults, status: 200, body: { documentType: '0' } },
      readyResponses[2],
      readyResponses[3],
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '');

    assert.equal(result.ready, false);
    assert.deepEqual(result.failures[0], {
      key: READINESS_FAILURE_KEYS.documentType,
      status: 200,
      documentType: '0',
    });
  });
});
