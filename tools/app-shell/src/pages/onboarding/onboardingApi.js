export const ONBOARDING_ERROR_CODES = {
  registerFailed: 'onboardingRegisterFailed',
  invalidCredentials: 'onboardingInvalidCredentials',
  invalidSession: 'onboardingInvalidSession',
  loadEnvironmentsFailed: 'onboardingLoadEnvironmentsFailed',
  environmentLoginFailed: 'onboardingEnvironmentLoginFailed',
  credentialChangeFailed: 'onboardingCredentialChangeFailed',
  credentialResetFailed: 'onboardingCredentialResetFailed',
  ssoFailed: 'onboardingSsoFailed',
  streamUnavailable: 'onboardingStreamUnavailable',
  missingResult: 'onboardingMissingResult',
};

const SSO_PAYLOAD_BUILDERS = {
  google: (payload = {}) => ({
    credential: payload.credential,
  }),
};

export function buildAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function buildApiError(data, fallbackCode) {
  const error = new Error(data?.error?.message || data?.message || fallbackCode);
  // Prefer the backend's stable error code (e.g. "WEAK_PASSWORD") when present,
  // falling back to the generic per-call code.
  error.code = data?.error?.code || fallbackCode;
  error.userMessage = data?.error?.userMessage || data?.error?.message || data?.message || null;
  return error;
}

async function readJsonResponse(response, fallbackCode) {
  const data = await response.json();
  if (!response.ok) {
    throw buildApiError(data, fallbackCode);
  }
  return data;
}

export async function registerAccount(fetchImpl, baseUrl, form) {
  const response = await fetchImpl(`${baseUrl}/sws/go/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.registerFailed);
}

export async function loginAccount(fetchImpl, baseUrl, form) {
  const response = await fetchImpl(`${baseUrl}/sws/go/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.invalidCredentials);
}

export async function loginWithSsoProvider(fetchImpl, baseUrl, provider, payload) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const buildPayload = SSO_PAYLOAD_BUILDERS[normalizedProvider];
  if (!buildPayload) {
    const error = new Error(ONBOARDING_ERROR_CODES.ssoFailed);
    error.code = ONBOARDING_ERROR_CODES.ssoFailed;
    throw error;
  }
  const response = await fetchImpl(`${baseUrl}/sws/go/sso/${encodeURIComponent(normalizedProvider)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(payload)),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.ssoFailed);
}

export async function requestPasswordReset(fetchImpl, baseUrl, email) {
  const response = await fetchImpl(`${baseUrl}/sws/go/password-reset/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.credentialResetFailed);
}

export async function confirmPasswordReset(fetchImpl, baseUrl, form) {
  const response = await fetchImpl(`${baseUrl}/sws/go/password-reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: form.token,
      password: form.password,
    }),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.credentialResetFailed);
}

export async function changePassword(fetchImpl, baseUrl, token, form) {
  const response = await fetchImpl(`${baseUrl}/sws/go/change-password`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    }),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.credentialChangeFailed);
}

export async function fetchAccount(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.invalidSession);
}

export async function fetchEnvironments(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/environments`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await readJsonResponse(response, ONBOARDING_ERROR_CODES.loadEnvironmentsFailed);
  return data.environments || [];
}

export async function loginEnvironment(fetchImpl, baseUrl, token, env) {
  const userId = encodeURIComponent(env.adminUserId);
  const response = await fetchImpl(`${baseUrl}/sws/go/login?userId=${userId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.environmentLoginFailed);
}

export async function fetchOnboardingDraft(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/onboarding/draft`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await readJsonResponse(response, ONBOARDING_ERROR_CODES.invalidSession);
  return data.draft || null;
}

export async function saveOnboardingDraft(fetchImpl, baseUrl, token, draft) {
  const response = await fetchImpl(`${baseUrl}/sws/go/onboarding/draft`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({ draft }),
  });
  return readJsonResponse(response, ONBOARDING_ERROR_CODES.invalidSession);
}

function processLines(lines, onMessage, finalResult) {
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    onMessage?.(message);
    if (message.type === 'result') {
      finalResult = message;
    }
  }
  return finalResult;
}

async function readStreamResult(reader, onMessage) {
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  while (true) {
    const {done, value} = await reader.read();
    if (value) buffer += decoder.decode(value, {stream: !done});
    if (done) buffer += decoder.decode();

    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();

    finalResult = processLines(lines, onMessage, finalResult);

    if (done) break;
  }
  return finalResult;
}

export async function runOnboardingStream(fetchImpl, baseUrl, token, form, onMessage) {
  const response = await fetchImpl(`${baseUrl}/sws/go/onboarding`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      clientName: form.clientName,
      currency: form.currency,
      language: form.language,
      countryCode: form.countryCode,
      ...(form.address ? { address: form.address } : {}),
    }),
  });

  if (!response.body?.getReader) {
    const error = new Error(ONBOARDING_ERROR_CODES.streamUnavailable);
    error.code = ONBOARDING_ERROR_CODES.streamUnavailable;
    throw error;
  }

  const reader = response.body.getReader();
  const finalResult = await readStreamResult(reader, onMessage);

  if (!finalResult) {
    const error = new Error(ONBOARDING_ERROR_CODES.missingResult);
    error.code = ONBOARDING_ERROR_CODES.missingResult;
    throw error;
  }
  return finalResult;
}
