import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthHeaders,
  changePassword,
  confirmPasswordReset,
  registerAccount,
  loginAccount,
  loginWithSsoProvider,
  requestPasswordReset,
  fetchAccount,
  fetchEnvironments,
  loginEnvironment,
  fetchOnboardingDraft,
  saveOnboardingDraft,
  runOnboardingStream,
} from '../onboardingApi.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function streamResponse(lines) {
  const encoder = new TextEncoder();
  const chunks = lines.map(line => encoder.encode(`${JSON.stringify(line)}\n`));
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

function assertNoProviderPayload(body) {
  const payload = JSON.parse(body);
  const serialized = JSON.stringify(payload).toLowerCase();

  assert.equal(Object.hasOwn(payload, 'to'), false);
  assert.equal(Object.hasOwn(payload, 'template'), false);
  assert.equal(Object.hasOwn(payload, 'data'), false);
  assert.equal(serialized.includes('sender'), false);
  assert.equal(serialized.includes('reply-to'), false);
  assert.equal(serialized.includes('replyto'), false);
  assert.equal(serialized.includes('provider'), false);
}

function assertNoSsoAuthorityFields(body) {
  const payload = JSON.parse(body);
  assert.equal(Object.hasOwn(payload, 'email'), false);
  assert.equal(Object.hasOwn(payload, 'name'), false);
  assert.equal(Object.hasOwn(payload, 'subject'), false);
  assert.equal(Object.hasOwn(payload, 'provider'), false);
  assert.equal(Object.hasOwn(payload, 'client_id'), false);
  assert.equal(Object.hasOwn(payload, 'g_csrf_token'), false);
}

describe('onboardingApi', () => {
  it('buildAuthHeaders includes content type and optional bearer token', () => {
    assert.deepEqual(buildAuthHeaders('platform-token'), {
      'Content-Type': 'application/json',
      Authorization: 'Bearer platform-token',
    });
    assert.deepEqual(buildAuthHeaders(null), {
      'Content-Type': 'application/json',
    });
  });

  it('registerAccount posts the registration form to /sws/go/register', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ token: 'platform-token', account: { email: 'new@example.com' } });
    };

    const result = await registerAccount(fetchImpl, '/etendo', {
      name: 'New User',
      email: 'new@example.com',
      password: 'secret',
      language: 'es_ES',
    });

    assert.equal(result.token, 'platform-token');
    assert.equal(calls[0].url, '/etendo/sws/go/register');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.body, JSON.stringify({
      name: 'New User',
      email: 'new@example.com',
      password: 'secret',
      language: 'es_ES',
    }));
  });

  it('loginAccount posts credentials to /sws/go/login', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ token: 'platform-token', account: { email: 'user@example.com' } });
    };

    const result = await loginAccount(fetchImpl, '', {
      email: 'user@example.com',
      password: 'secret',
    });

    assert.equal(result.token, 'platform-token');
    assert.equal(calls[0].url, '/sws/go/login');
    assert.equal(calls[0].options.method, 'POST');
  });

  it('loginWithSsoProvider posts only the allowlisted provider payload', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ token: 'platform-token', authMethod: 'sso' });
    };

    const result = await loginWithSsoProvider(fetchImpl, '/etendo', 'google', {
      credential: 'id-token',
      g_csrf_token: 'csrf-token',
      email: 'browser@example.com',
      name: 'Browser User',
      subject: 'browser-subject',
      provider: 'google',
      client_id: 'client-id.apps.googleusercontent.com',
    });

    assert.equal(result.token, 'platform-token');
    assert.equal(calls[0].url, '/etendo/sws/go/sso/google');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.body, JSON.stringify({
      credential: 'id-token',
    }));
    assertNoProviderPayload(calls[0].options.body);
    assertNoSsoAuthorityFields(calls[0].options.body);
  });

  it('loginWithSsoProvider rejects unknown providers without a raw user message', async () => {
    await assert.rejects(
      () => loginWithSsoProvider(async () => jsonResponse({}), '/etendo', 'unknown', {}),
      (error) => {
        assert.equal(error.code, 'onboardingSsoFailed');
        assert.equal(error.userMessage, undefined);
        return true;
      },
    );
  });

  it('requestPasswordReset posts only the account email to the neutral reset endpoint', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true });
    };

    const result = await requestPasswordReset(fetchImpl, '/etendo', 'user@example.com');

    assert.equal(result.success, true);
    assert.equal(calls[0].url, '/etendo/sws/go/password-reset/request');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.body, JSON.stringify({ email: 'user@example.com' }));
    assertNoProviderPayload(calls[0].options.body);
  });

  it('confirmPasswordReset posts only the reset token and new password', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true });
    };

    await confirmPasswordReset(fetchImpl, '', {
      token: 'reset-token',
      password: 'new-secret',
      confirmPassword: 'new-secret',
      ignored: 'not-sent',
    });

    assert.equal(calls[0].url, '/sws/go/password-reset/confirm');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.body, JSON.stringify({
      token: 'reset-token',
      password: 'new-secret',
    }));
    assertNoProviderPayload(calls[0].options.body);
  });

  it('changePassword uses the platform token and local password fields only', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ token: 'rotated-platform-token' });
    };

    const result = await changePassword(fetchImpl, '', 'platform-token', {
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
      confirmPassword: 'new-secret',
      ignored: 'not-sent',
    });

    assert.equal(result.token, 'rotated-platform-token');
    assert.equal(calls[0].url, '/sws/go/change-password');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer platform-token');
    assert.equal(calls[0].options.body, JSON.stringify({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
    }));
    assertNoProviderPayload(calls[0].options.body);
  });

  it('fetchAccount uses the platform token against /sws/go/me', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ email: 'user@example.com', name: 'User' });
    };

    const account = await fetchAccount(fetchImpl, '', 'platform-token');

    assert.equal(account.name, 'User');
    assert.equal(calls[0].url, '/sws/go/me');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer platform-token');
  });

  it('fetchEnvironments returns an empty array when the backend omits environments', async () => {
    const fetchImpl = async () => jsonResponse({});

    const envs = await fetchEnvironments(fetchImpl, '', 'platform-token');

    assert.deepEqual(envs, []);
  });

  it('loginEnvironment calls /sws/go/login with the environment admin user id', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ token: 'env-token', roleList: [] });
    };

    const result = await loginEnvironment(fetchImpl, '', 'platform-token', {
      adminUserId: 'AD_USER_1',
    });

    assert.equal(result.token, 'env-token');
    assert.equal(calls[0].url, '/sws/go/login?userId=AD_USER_1');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer platform-token');
  });

  it('fetchOnboardingDraft gets the draft with the platform token', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ draft: { step: 2, form: { clientName: 'QA Company' } } });
    };

    const draft = await fetchOnboardingDraft(fetchImpl, '/etendo', 'platform-token');

    assert.deepEqual(draft, { step: 2, form: { clientName: 'QA Company' } });
    assert.equal(calls[0].url, '/etendo/sws/go/onboarding/draft');
    assert.equal(calls[0].options.method, undefined);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer platform-token');
  });

  it('fetchOnboardingDraft returns null when the backend has no draft', async () => {
    const fetchImpl = async () => jsonResponse({});

    const draft = await fetchOnboardingDraft(fetchImpl, '', 'platform-token');

    assert.equal(draft, null);

    const draftFromNull = await fetchOnboardingDraft(
      async () => jsonResponse({ draft: null }),
      '',
      'platform-token',
    );
    assert.equal(draftFromNull, null);
  });

  it('fetchOnboardingDraft throws onboardingInvalidSession on non-ok response', async () => {
    const fetchImpl = async () => jsonResponse({ error: { message: 'expired' } }, { ok: false, status: 401 });

    await assert.rejects(
      () => fetchOnboardingDraft(fetchImpl, '', 'stale-token'),
      (error) => {
        assert.equal(error.code, 'onboardingInvalidSession');
        assert.equal(error.userMessage, 'expired');
        return true;
      },
    );
  });

  it('saveOnboardingDraft posts the draft with auth headers', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true });
    };

    const result = await saveOnboardingDraft(fetchImpl, '/etendo', 'platform-token', {
      step: 3,
      form: { currency: 'EUR' },
    });

    assert.equal(result.success, true);
    assert.equal(calls[0].url, '/etendo/sws/go/onboarding/draft');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer platform-token');
    assert.equal(calls[0].options.body, JSON.stringify({
      draft: { step: 3, form: { currency: 'EUR' } },
    }));
  });

  it('saveOnboardingDraft sends draft null when clearing the draft', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true });
    };

    await saveOnboardingDraft(fetchImpl, '', 'platform-token', null);

    assert.equal(calls[0].options.body, JSON.stringify({ draft: null }));
  });

  it('saveOnboardingDraft throws onboardingInvalidSession on non-ok response', async () => {
    const fetchImpl = async () => jsonResponse({ message: 'session lost' }, { ok: false, status: 401 });

    await assert.rejects(
      () => saveOnboardingDraft(fetchImpl, '', 'stale-token', { step: 1 }),
      (error) => {
        assert.equal(error.code, 'onboardingInvalidSession');
        assert.equal(error.userMessage, 'session lost');
        return true;
      },
    );
  });

  it('runOnboardingStream posts payload and emits every NDJSON message', async () => {
    const calls = [];
    const messages = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return streamResponse([
        { type: 'progress', step: 'client', status: 'in_progress' },
        { type: 'progress', step: 'client', status: 'done', ms: 20 },
        { type: 'result', success: true },
      ]);
    };

    const result = await runOnboardingStream(fetchImpl, '', 'platform-token', {
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      fiscalIdValue: 'B12345678',
    }, message => messages.push(message));

    assert.equal(result.success, true);
    assert.equal(calls[0].url, '/sws/go/onboarding');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer platform-token');
    assert.equal(calls[0].options.body, JSON.stringify({
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
    }));
    assert.equal(messages.length, 3);
  });

  it('runOnboardingStream omits the address key when address is empty', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return streamResponse([{ type: 'result', success: true }]);
    };

    await runOnboardingStream(fetchImpl, '', 'platform-token', {
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      address: '',
    }, () => {});

    const body = JSON.parse(calls[0].options.body);
    assert.equal('address' in body, false);
  });

  it('runOnboardingStream omits the address key when address is absent', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return streamResponse([{ type: 'result', success: true }]);
    };

    await runOnboardingStream(fetchImpl, '', 'platform-token', {
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
    }, () => {});

    const body = JSON.parse(calls[0].options.body);
    assert.equal('address' in body, false);
  });

  it('runOnboardingStream includes the address key when address is provided', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return streamResponse([{ type: 'result', success: true }]);
    };

    await runOnboardingStream(fetchImpl, '', 'platform-token', {
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      address: 'QA Street 123',
    }, () => {});

    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.address, 'QA Street 123');
  });
});
