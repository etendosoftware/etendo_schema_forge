import { describe, expect, it, vi } from 'vitest';
import {
  READINESS_ENDPOINTS,
  READINESS_FAILURE_KEYS,
  checkSalesInvoiceReadiness,
} from '../onboardingReadiness.js';

function jsonResponse(body, { ok = true, status = 200, jsonThrows = false } = {}) {
  return {
    ok,
    status,
    async json() {
      if (jsonThrows) throw new Error('invalid json');
      return body;
    },
  };
}

function createFetchByEndpoint(responses) {
  const fetchImpl = vi.fn(async (url, options) => {
    const entry = responses.find((response) => url.includes(response.includes));
    if (!entry) throw new Error(`Unexpected URL: ${url}`);
    return jsonResponse(entry.body, entry);
  });
  return fetchImpl;
}

const readyReadinessResponses = [
  { includes: READINESS_ENDPOINTS.session, ok: true, status: 200, body: { user: 'qa' } },
  { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: { values: { documentType: 'DOC_TYPE_1' } } },
  { includes: READINESS_ENDPOINTS.paymentTerms, ok: true, status: 200, body: { items: [{ id: 'TERM_1', label: 'Immediate' }] } },
];

describe('onboarding readiness helpers', () => {
  it('passes when all readiness endpoints return usable data', async () => {
    const fetchImpl = createFetchByEndpoint(readyReadinessResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '/etendo', 'env-token');

    expect(result.ready).toBe(true);
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/etendo/sws/neo/session'), {
      headers: { Authorization: 'Bearer env-token', 'Accept-Language': 'es_ES' },
    });
  });

  it('reports failed readiness endpoints, empty selectors, invalid JSON, and missing document type', async () => {
    const fetchImpl = createFetchByEndpoint([
      { includes: READINESS_ENDPOINTS.session, ok: false, status: 401, body: {} },
      { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: {}, jsonThrows: true },
      { includes: READINESS_ENDPOINTS.paymentTerms, ok: true, status: 200, body: { items: [{ id: '', label: 'No id' }] } },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    expect(result.ready).toBe(false);
    expect(result.failures).toEqual([
      { key: READINESS_FAILURE_KEYS.session, status: 401 },
      { key: READINESS_FAILURE_KEYS.paymentTerms, status: 200 },
      { key: READINESS_FAILURE_KEYS.documentType, status: 200, documentType: null },
    ]);
  });

  /**
   * ETP-5079 regression guard: onboarding no longer seeds a "Default Customer" business partner, so
   * a freshly provisioned tenant genuinely has none. Readiness must still pass — SetupProgressStep
   * refuses to redirect into the app on `!ready`, so a customer check here would lock every new
   * tenant out of the environment it just created.
   */
  it('stays ready for a tenant with no business partners at all', async () => {
    const fetchImpl = createFetchByEndpoint(readyReadinessResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    expect(result.ready).toBe(true);
    expect(Object.keys(result.checks)).toEqual(['session', 'defaults', 'paymentTerms']);
    expect(READINESS_ENDPOINTS.customers).toBeUndefined();
    expect(READINESS_FAILURE_KEYS.customers).toBeUndefined();
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('C_BPartner_ID'))).toBe(false);
  });

  it('accepts document type from supported response shapes and rejects zero', async () => {
    await expect(checkSalesInvoiceReadiness(createFetchByEndpoint([
      readyReadinessResponses[0],
      { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: { data: { documentType: 'DOC_TYPE_2' } } },
      readyReadinessResponses[2],
    ]), '', 'env-token')).resolves.toMatchObject({ ready: true });

    const zeroResult = await checkSalesInvoiceReadiness(createFetchByEndpoint([
      readyReadinessResponses[0],
      { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: { defaults: { documentType: '0' } } },
      readyReadinessResponses[2],
    ]), '', 'env-token');

    expect(zeroResult.failures).toContainEqual({
      key: READINESS_FAILURE_KEYS.documentType,
      status: 200,
      documentType: '0',
    });
  });
});
