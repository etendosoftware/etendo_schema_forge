import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';

/*
 * ETP-4576 — every call in this module went out through an injected `fetchImpl` with
 * `headers: buildAuthHeaders(token)`. `buildAuthHeaders` puts its argument into `X-Go-CSRF`, and
 * the argument here was a BEARER read from `sf_auth_token`/`sf_platform_token` — keys the cookie
 * migration purges. So every POST travelled with no proof of intent and was refused, while the
 * GETs beside them kept working: the browser attaches the session cookie by itself and reads need
 * no proof. Paying for a tenant was the user-visible casualty. The billing family arrived later,
 * from develop, in that same shape — which is why the whole module is routed through `apiFetch`
 * rather than fixed call by call.
 *
 * `apiFetch` reads the credential from the active scheme and adds the write proof on unsafe
 * methods, so neither the caller nor this module names a credential any more. `on401: 'ignore'` is
 * deliberate and pre-existing policy (docs/request-policy.md): this module maps a 401 onto its own
 * `sessionExpired` code, which the page renders — routing it to the logout choke point instead
 * would drop the user out of the app mid-checkout.
 *
 * The core subpath, never the `@/auth/api.js` barrel: the barrel re-exports `.jsx`, which plain
 * `node --test` cannot load.
 */

/** Error codes this module raises, mapped to i18n keys by the page. */
export const UPGRADE_ERROR_CODES = {
  checkoutUnavailable: 'upgradeCheckoutUnavailable',
  checkoutCreationFailed: 'upgradeCheckoutCreationFailed',
  purchaseAlreadyExists: 'upgradePurchaseAlreadyExists',
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
export async function createCheckoutSession(baseUrl, input = {}) {
  const response = await apiFetch('/sws/go/checkout/sessions', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
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

/**
 * Starts a new account-level purchase through the provider-neutral billing boundary.
 *
 * ETP-4576 — arrived from develop built on `fetchImpl` + `buildAuthHeaders(token)`, the same shape
 * its two siblings had before they were migrated. That shape is a silent failure here:
 * `buildAuthHeaders` puts its argument into `X-Go-CSRF`, the argument was a bearer read from keys
 * `purgeLegacyAuthStorage` deletes, so under the cookie session this POST would travel with no
 * proof of intent and be refused. Routed through `apiFetch` like the rest of the module.
 */
export async function createBillingPurchase(baseUrl, input = {}) {
  const response = await apiFetch('/sws/go/billing/purchases', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
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

export async function getCheckoutStatus(baseUrl, requestId) {
  const response = await apiFetch(
    `/sws/go/checkout/sessions/${encodeURIComponent(requestId)}`,
    { baseUrl, on401: 'ignore' }
  );
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data || { status: 'pending' };
}

/** Reads the authenticated account-level billing projection. */
export async function getBillingOverview(baseUrl) {
  const response = await apiFetch('/sws/go/billing/overview', { baseUrl, on401: 'ignore' });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data || { purchases: [] };
}

/** Reads the server-owned productive offer used to render purchase terms. */
export async function getBillingOffer(baseUrl) {
  const response = await apiFetch('/sws/go/billing/offers', { baseUrl, on401: 'ignore' });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data;
}

/** Reads one account-scoped purchase without exposing provider identifiers. */
export async function getBillingPurchase(baseUrl, purchaseId) {
  const response = await apiFetch(
    `/sws/go/billing/purchases/${encodeURIComponent(purchaseId)}`,
    { baseUrl, on401: 'ignore' }
  );
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data;
}

/** Starts the existing idempotent onboarding chain after the webhook authorizes the request. */
export async function runPaidOnboarding(baseUrl, input, onMessage) {
  const response = await apiFetch('/sws/go/onboarding', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
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
