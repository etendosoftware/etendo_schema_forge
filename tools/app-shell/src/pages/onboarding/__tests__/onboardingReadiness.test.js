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

const readyResponses = [
  { includes: READINESS_ENDPOINTS.session, status: 200, body: { user: 'qa' } },
  { includes: READINESS_ENDPOINTS.defaults, status: 200, body: { documentType: 'DOC_TYPE_1' } },
  { includes: READINESS_ENDPOINTS.paymentTerms, status: 200, body: { items: [{ id: 'TERM_1', label: 'Immediate' }] } },
];

describe('checkSalesInvoiceReadiness', () => {
  it('passes when session, defaults, payment terms and document type are usable', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    assert.equal(result.ready, true);
    assert.deepEqual(result.failures, []);
    assert.equal(fetchImpl.calls.length, 3);
    assert.equal(fetchImpl.calls[0].options.headers.Authorization, 'Bearer env-token');
  });

  it('fails when the session endpoint is unauthorized', async () => {
    const fetchImpl = createFetchByUrl([
      { includes: READINESS_ENDPOINTS.session, status: 401, body: {} },
      ...readyResponses.slice(1),
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    assert.equal(result.ready, false);
    assert.deepEqual(result.failures[0], { key: READINESS_FAILURE_KEYS.session, status: 401 });
  });

  it('fails when payment terms are missing', async () => {
    const fetchImpl = createFetchByUrl([
      readyResponses[0],
      readyResponses[1],
      { includes: READINESS_ENDPOINTS.paymentTerms, status: 200, body: { items: [] } },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    assert.equal(result.ready, false);
    assert.equal(result.failures[0].key, READINESS_FAILURE_KEYS.paymentTerms);
  });

  // ETP-5079: this used to assert the opposite -- an empty customer selector made the tenant "not
  // ready". Onboarding no longer seeds a "Default Customer" business partner, so a freshly
  // provisioned tenant genuinely has none, and SetupProgressStep refuses to redirect into the app
  // on !ready. The customer leg is gone entirely; readiness must not consult C_BPartner at all.
  it('stays ready and never queries customers for a tenant with no business partners', async () => {
    const fetchImpl = createFetchByUrl(readyResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

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

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    assert.equal(result.ready, false);
    assert.deepEqual(result.failures[0], {
      key: READINESS_FAILURE_KEYS.documentType,
      status: 200,
      documentType: '0',
    });
  });
});
