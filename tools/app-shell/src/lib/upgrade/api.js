import { buildAuthHeaders } from '@etendosoftware/etendo-go-core/onboarding/api';

/** Error codes this module raises, mapped to i18n keys by the page. */
export const UPGRADE_ERROR_CODES = {
  checkoutUnavailable: 'upgradeCheckoutUnavailable',
  checkoutCreationFailed: 'upgradeCheckoutCreationFailed',
  plansUnavailable: 'upgradePlansUnavailable',
  purchaseAlreadyExists: 'upgradePurchaseAlreadyExists',
  sessionExpired: 'upgradeSessionExpired',
  failed: 'upgradeGenericError',
};

/**
 * Reads the server's plan catalog — the list of things that are actually purchasable.
 *
 * This exists because the checkout endpoint REQUIRES a plan key and has no default: without a
 * catalog the browser has no way to learn one, so there is no client-side list of keys to fall
 * back on. Guessing a key here would be exactly the unreviewed fallback the server-side design
 * refuses, so a failed lookup raises instead, and the page disables checkout.
 *
 * The server never sends a provider price id, and this client never sends one either.
 *
 * @returns {Promise<Array<{planKey: string, name: string, description: string,
 *   displayPrice: string, currency: string, billingInterval: string}>>} possibly empty — an
 *   empty catalog is an answer, not a failure.
 */
export async function fetchPlans(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/plans`, {
    headers: buildAuthHeaders(token),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.plansUnavailable, data?.error?.message || data?.message, response.status);
  }
  return Array.isArray(data?.plans) ? data.plans : [];
}

/**
 * Creates a provider-hosted checkout session for a known paid action.
 *
 * The browser sends product intent only. Pricing, currency, Stripe Price IDs,
 * and payment confirmation are server-owned. The returned URL is safe to use
 * as a redirect target because it is issued by the authenticated backend.
 *
 * `planKey` names a row in the server's plan catalog — a KEY, never a price.
 * The server resolves it to a Stripe Price ID; there is no request field for a
 * price and no code path that reads one, so a price added to this body would be
 * ignored rather than honoured. The server requires the key and has no default
 * plan, which is why the module and this client ship together (ETP-5046).
 */
export async function createCheckoutSession(fetchImpl, baseUrl, token, input = {}) {
  const response = await fetchImpl(`${baseUrl}/sws/go/checkout/sessions`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      action: input.action || 'productive-tenant',
      upgradeAction: input.upgradeAction || 'create-productive',
      ...(input.planKey ? { planKey: input.planKey } : {}),
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      ...(input.dataTransfer ? { dataTransfer: input.dataTransfer } : {}),
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

/** Starts a new account-level purchase through the provider-neutral billing boundary. */
export async function createBillingPurchase(fetchImpl, baseUrl, token, input = {}) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/purchases`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      action: input.action || 'productive-tenant',
      upgradeAction: input.upgradeAction || 'create-productive',
      // Required by the server, which has no default plan and no fallback price (ETP-5046).
      // Always a catalog KEY, never a price: pricing is server-owned and the browser has no
      // field that could influence it.
      ...(input.planKey ? { planKey: input.planKey } : {}),
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      ...(input.dataTransfer ? { dataTransfer: input.dataTransfer } : {}),
    }),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    if (response.status === 409 && data?.purchaseId) {
      const error = buildError(UPGRADE_ERROR_CODES.purchaseAlreadyExists,
        data.status || 'Purchase already exists', response.status);
      error.purchase = data;
      throw error;
    }
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

/** Reads the authenticated account-level billing projection. */
export async function getBillingOverview(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/overview`, {
    headers: buildAuthHeaders(token),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data || { purchases: [] };
}

/** Reads the server-owned productive offer used to render purchase terms. */
export async function getBillingOffer(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/offers`, {
    headers: buildAuthHeaders(token),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data;
}

/** Reads one account-scoped purchase without exposing provider identifiers. */
export async function getBillingPurchase(fetchImpl, baseUrl, token, purchaseId) {
  const response = await fetchImpl(
    `${baseUrl}/sws/go/billing/purchases/${encodeURIComponent(purchaseId)}`,
    { headers: buildAuthHeaders(token) }
  );
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data;
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
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      paymentToken: input.paymentToken,
      upgradeAction: input.upgradeAction || 'create-productive',
      ...(input.dataTransfer ? { dataTransfer: input.dataTransfer } : {}),
    }),
  });
  if (response.status === 401) throw buildError(UPGRADE_ERROR_CODES.sessionExpired, null, 401);
  if (!response.body?.getReader) throw buildError(UPGRADE_ERROR_CODES.checkoutCreationFailed);
  const result = await readOnboardingResult(response.body.getReader(), onMessage);
  if (!result || result.success === false) throw buildError(UPGRADE_ERROR_CODES.checkoutCreationFailed);
  return result;
}

async function readOnboardingResult(reader, onMessage) {
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let done = false;
  while (!done) {
    ({ done, value: buffer } = await readStreamChunk(reader, decoder, buffer));
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop();
    result = consumeOnboardingLines(lines, onMessage, result);
  }
  return result;
}

async function readStreamChunk(reader, decoder, buffer) {
  const { done, value } = await reader.read();
  const chunk = value ? decoder.decode(value, { stream: !done }) : '';
  return { done, value: done ? buffer + chunk + decoder.decode() : buffer + chunk };
}

function consumeOnboardingLines(lines, onMessage, result) {
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    onMessage?.(message);
    if (message.type === 'result') result = message;
  }
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
