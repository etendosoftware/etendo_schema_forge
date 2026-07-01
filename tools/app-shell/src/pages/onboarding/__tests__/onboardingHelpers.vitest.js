import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthHeaders,
  fetchAccount,
  fetchEnvironments,
  loginAccount,
  loginEnvironment,
  registerAccount,
  runOnboardingStream,
} from '../onboardingApi.js';
import {
  READINESS_ENDPOINTS,
  READINESS_FAILURE_KEYS,
  checkSalesInvoiceReadiness,
} from '../onboardingReadiness.js';
import {
  applyProgressMessage,
  buildEnvironmentSessionStorage,
  buildOnboardingPayload,
  initialSetupSteps,
  isCompanyStepValid,
  isProfileStepValid,
  mapBackendStepStatus,
  selectPreferredOrg,
} from '../onboardingState.js';

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

function streamResponse(lines) {
  const encoder = new TextEncoder();
  const chunks = lines.map((line) => encoder.encode(`${JSON.stringify(line)}\n`));
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
        };
      },
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
  { includes: READINESS_ENDPOINTS.customers, ok: true, status: 200, body: { items: [{ id: 'BP_1', label: 'QA Customer' }] } },
];

describe('onboarding API helpers', () => {
  it('builds auth headers with optional bearer tokens', () => {
    expect(buildAuthHeaders('platform-token')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer platform-token',
    });
    expect(buildAuthHeaders(null)).toEqual({ 'Content-Type': 'application/json' });
  });

  it('calls auth and environment endpoints with expected payloads', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith('/register')) return jsonResponse({ token: 'registered-token' });
      if (url.endsWith('/login')) return jsonResponse({ token: 'login-token' });
      if (url.endsWith('/me')) return jsonResponse({ name: 'QA User' });
      if (url.endsWith('/environments')) return jsonResponse({ environments: [{ clientId: 'C1' }] });
      if (url.includes('/login?userId=AD_USER_1')) return jsonResponse({ token: 'env-token' });
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(registerAccount(fetchImpl, '/etendo', { email: 'qa@example.com' })).resolves.toEqual({ token: 'registered-token' });
    await expect(loginAccount(fetchImpl, '/etendo', { email: 'qa@example.com' })).resolves.toEqual({ token: 'login-token' });
    await expect(fetchAccount(fetchImpl, '/etendo', 'platform-token')).resolves.toEqual({ name: 'QA User' });
    await expect(fetchEnvironments(fetchImpl, '/etendo', 'platform-token')).resolves.toEqual([{ clientId: 'C1' }]);
    await expect(loginEnvironment(fetchImpl, '/etendo', 'platform-token', { adminUserId: 'AD_USER_1' })).resolves.toEqual({ token: 'env-token' });

    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/go/register', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa@example.com' }),
    }));
    expect(fetchImpl).toHaveBeenCalledWith('/etendo/sws/go/me', {
      headers: { Authorization: 'Bearer platform-token' },
    });
  });

  it('throws user-facing API errors for failed JSON responses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'Nope' } }, { ok: false, status: 400 }));

    await expect(registerAccount(fetchImpl, '', {})).rejects.toMatchObject({
      code: 'onboardingRegisterFailed',
      userMessage: 'Nope',
    });
  });

  it('streams onboarding messages and rejects missing or unavailable streams', async () => {
    const messages = [];
    const fetchImpl = vi.fn(async () => streamResponse([
      { type: 'progress', step: 'client', status: 'in_progress' },
      { type: 'result', success: true },
    ]));

    await expect(runOnboardingStream(fetchImpl, '', 'platform-token', {
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      fiscalIdValue: 'B12345678',
    }, (message) => messages.push(message))).resolves.toEqual({ type: 'result', success: true });

    expect(messages).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledWith('/sws/go/onboarding', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer platform-token',
      },
      body: JSON.stringify({
        clientName: 'QA Company',
        currency: 'EUR',
        language: 'es_ES',
        countryCode: 'ES',
      }),
    }));

    await expect(runOnboardingStream(async () => ({ body: null }), '', null, {}, vi.fn()))
      .rejects.toMatchObject({ code: 'onboardingStreamUnavailable' });
    await expect(runOnboardingStream(async () => streamResponse([{ type: 'progress', step: 'client' }]), '', null, {}, vi.fn()))
      .rejects.toMatchObject({ code: 'onboardingMissingResult' });
  });
});

describe('onboarding readiness helpers', () => {
  it('passes when all readiness endpoints return usable data', async () => {
    const fetchImpl = createFetchByEndpoint(readyReadinessResponses);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '/etendo', 'env-token');

    expect(result.ready).toBe(true);
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/etendo/sws/neo/session'), {
      headers: { Authorization: 'Bearer env-token' },
    });
  });

  it('reports failed readiness endpoints, empty selectors, invalid JSON, and missing document type', async () => {
    const fetchImpl = createFetchByEndpoint([
      { includes: READINESS_ENDPOINTS.session, ok: false, status: 401, body: {} },
      { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: {}, jsonThrows: true },
      { includes: READINESS_ENDPOINTS.paymentTerms, ok: true, status: 200, body: { items: [{ id: '', label: 'No id' }] } },
      { includes: READINESS_ENDPOINTS.customers, ok: true, status: 200, body: { items: [] } },
    ]);

    const result = await checkSalesInvoiceReadiness(fetchImpl, '', 'env-token');

    expect(result.ready).toBe(false);
    expect(result.failures).toEqual([
      { key: READINESS_FAILURE_KEYS.session, status: 401 },
      { key: READINESS_FAILURE_KEYS.paymentTerms, status: 200 },
      { key: READINESS_FAILURE_KEYS.customers, status: 200 },
      { key: READINESS_FAILURE_KEYS.documentType, status: 200, documentType: null },
    ]);
  });

  it('accepts document type from supported response shapes and rejects zero', async () => {
    await expect(checkSalesInvoiceReadiness(createFetchByEndpoint([
      readyReadinessResponses[0],
      { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: { data: { documentType: 'DOC_TYPE_2' } } },
      readyReadinessResponses[2],
      readyReadinessResponses[3],
    ]), '', 'env-token')).resolves.toMatchObject({ ready: true });

    const zeroResult = await checkSalesInvoiceReadiness(createFetchByEndpoint([
      readyReadinessResponses[0],
      { includes: READINESS_ENDPOINTS.defaults, ok: true, status: 200, body: { defaults: { documentType: '0' } } },
      readyReadinessResponses[2],
      readyReadinessResponses[3],
    ]), '', 'env-token');

    expect(zeroResult.failures).toContainEqual({
      key: READINESS_FAILURE_KEYS.documentType,
      status: 200,
      documentType: '0',
    });
  });
});

describe('onboarding state helpers', () => {
  it('creates fresh setup steps and maps backend statuses', () => {
    const first = initialSetupSteps();
    const second = initialSetupSteps();
    first[0].status = 'done';

    expect(second[0]).toMatchObject({ name: 'setup', status: 'pending', ms: null, error: null });
    expect(mapBackendStepStatus('in_progress')).toBe('running');
    expect(mapBackendStepStatus('done')).toBe('done');
    expect(mapBackendStepStatus('error')).toBe('failed');
    expect(mapBackendStepStatus('queued')).toBe('queued');
  });

  it('applies progress messages and ignores unrelated messages', () => {
    const steps = initialSetupSteps();

    expect(applyProgressMessage(steps, { type: 'noop' })).toBe(steps);

    const next = applyProgressMessage(steps, {
      type: 'progress',
      step: 'organization',
      status: 'error',
      message: 'Organization failed',
      ms: 25,
    });

    expect(next.find((step) => step.name === 'organization')).toMatchObject({
      status: 'failed',
      error: 'Organization failed',
      ms: 25,
    });
    expect(next.find((step) => step.name === 'client').status).toBe('pending');
  });

  it('builds privacy-safe payloads and environment session storage', () => {
    expect(buildOnboardingPayload({
      fullName: 'QA User',
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      fiscalIdValue: 'B12345678',
      address: 'QA Street',
    })).toEqual({
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      address: 'QA Street',
    });

    const storage = buildEnvironmentSessionStorage(
      { adminUserName: 'QA Admin', adminUser: 'fallback-admin' },
      {
        token: 'env-token',
        roleList: [
          {
            id: 'ROLE_1',
            name: 'Admin',
            orgList: [{ id: 'STAR', name: '*' }, { id: 'ORG_1', name: 'QA Org' }],
          },
        ],
      }
    );

    expect(storage.sf_auth_token).toBe('env-token');
    expect(storage.sf_auth_user).toBe('QA Admin');
    expect(JSON.parse(storage.sf_auth_selected_org)).toEqual({ id: 'ORG_1', name: 'QA Org' });
  });

  it('validates forms and preferred organizations', () => {
    expect(selectPreferredOrg({ orgList: [{ id: 'STAR', name: '*' }] })).toEqual({ id: 'STAR', name: '*' });
    expect(selectPreferredOrg({ orgList: [] })).toBeNull();
    expect(selectPreferredOrg(null)).toBeNull();

    expect(isProfileStepValid({ fullName: 'QA User', countryCode: 'ES' })).toBe(true);
    expect(isProfileStepValid({ fullName: ' ', countryCode: 'ES' })).toBe(false);
    expect(isCompanyStepValid({ clientName: 'QA Company', fiscalIdValue: 'B12345678' })).toBe(true);
    expect(isCompanyStepValid({ clientName: 'QA Company', fiscalIdValue: ' ' })).toBe(false);
  });
});
