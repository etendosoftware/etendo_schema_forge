import { buildAuthHeaders } from '@etendosoftware/etendo-go-core/onboarding/api';

/** Error codes this module raises, mapped to i18n keys by the page. */
export const UPGRADE_ERROR_CODES = {
  checkoutUnavailable: 'upgradeCheckoutUnavailable',
  checkoutCreationFailed: 'upgradeCheckoutCreationFailed',
  sessionExpired: 'upgradeSessionExpired',
  failed: 'upgradeGenericError',
};

/**
 * Creates a provider-hosted checkout session for a known paid action.
 *
 * The browser sends product intent only. Pricing, currency, Stripe Price IDs,
 * and payment confirmation are server-owned. The returned URL is safe to use
 * as a redirect target because it is issued by the authenticated backend.
 */
export async function createCheckoutSession(fetchImpl, baseUrl, token, input = {}) {
  const response = await fetchImpl(`${baseUrl}/sws/go/checkout/sessions`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      action: input.action || 'productive-tenant',
      upgradeAction: input.upgradeAction || 'create-productive',
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
    }),
  });

  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message || data?.message, response.status);
  }
  if (!data?.checkoutUrl || !data?.requestId) {
    throw buildError(UPGRADE_ERROR_CODES.checkoutUnavailable);
  }
  return { checkoutUrl: data.checkoutUrl, requestId: data.requestId, expiresAt: data.expiresAt || null };
}

export async function getCheckoutStatus(fetchImpl, baseUrl, token, requestId) {
  const response = await fetchImpl(
    `${baseUrl}/sws/go/checkout/sessions/${encodeURIComponent(requestId)}`,
    { headers: buildAuthHeaders(token) }
  );
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data || { status: 'pending' };
}

/** Starts the existing idempotent onboarding chain after the webhook authorizes the request. */
export async function runPaidOnboarding(fetchImpl, baseUrl, token, input, onMessage) {
  const response = await fetchImpl(`${baseUrl}/sws/go/onboarding`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      clientName: input.clientName,
      currency: input.currency || 'EUR',
      language: input.language || 'en_US',
      countryCode: input.countryCode || 'AR',
      paymentToken: input.paymentToken,
      upgradeAction: input.upgradeAction || 'create-productive',
    }),
  });
  if (response.status === 401) throw buildError(UPGRADE_ERROR_CODES.sessionExpired, null, 401);
  if (!response.body?.getReader) throw buildError(UPGRADE_ERROR_CODES.checkoutCreationFailed);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      onMessage?.(message);
      if (message.type === 'result') result = message;
    }
    if (done) break;
  }
  if (!result || result.success === false) throw buildError(UPGRADE_ERROR_CODES.checkoutCreationFailed);
  return result;
}

/** localStorage key holding the account-level token that owns tenants. */
const PLATFORM_TOKEN_KEY = 'sf_platform_token';

/**
 * Tenant creation is an account-level operation, so it authenticates with the
 * platform token — the same credential onboarding uses — not the ERP session
 * token tied to the tenant the user is currently inside.
 */
export function getPlatformToken(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(PLATFORM_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Returns the active browser credential for account-level upgrade operations. The backend accepts
 * both the account session and the selected environment JWT and resolves them to one account.
 */
export function getCheckoutToken(storage = globalThis.localStorage) {
  try {
    // The selected environment JWT is the session currently used by NEO and remains valid when
    // another tab refreshes the account token. The platform token is only the fallback for the
    // account/onboarding screen where no environment has been selected yet.
    return storage?.getItem('sf_auth_token') || storage?.getItem('sf_platform_token') || null;
  } catch {
    return null;
  }
}

function buildError(code, message, status) {
  const error = new Error(message || code);
  error.code = code;
  error.status = status;
  return error;
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
