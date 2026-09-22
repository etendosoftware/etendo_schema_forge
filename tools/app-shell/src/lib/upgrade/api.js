import { buildAuthHeaders } from '@etendosoftware/etendo-go-core/onboarding/api';

/** Error codes this module raises, mapped to i18n keys by the page. */
export const UPGRADE_ERROR_CODES = {
  checkoutUnavailable: 'upgradeCheckoutUnavailable',
  checkoutCreationFailed: 'upgradeCheckoutCreationFailed',
  purchaseAlreadyExists: 'upgradePurchaseAlreadyExists',
  sessionExpired: 'upgradeSessionExpired',
  // ETP-5443 REVIEW N3: a failed READ of the subscription, or a failed portal-session
  // creation, is neither a checkout nor a creation of anything — reusing
  // `checkoutCreationFailed` for them said the wrong thing about what broke. Each gets
  // its own code so a caller (and a log line) can tell "can't read the subscription"
  // apart from "can't open the portal" apart from "checkout failed".
  subscriptionUnavailable: 'upgradeSubscriptionUnavailable',
  portalUnavailable: 'upgradePortalUnavailable',
  failed: 'upgradeGenericError',
};

/**
 * Adapts the shared, policy-compliant request helper (`apiFetch` from
 * `@etendosoftware/app-shell-core/auth/api`, or `useApiFetch`'s returned function) to the plain
 * `fetchImpl(url, init)` shape every exported client in this module already takes — so a caller
 * can stop handing them the raw global `fetch` (ETP-5443 REVIEW W7) without this module's own
 * exported functions changing shape, which would break `UpgradePage.jsx` (still on raw `fetch`,
 * out of this ticket's scope) and `upgrade-api.test.js` (which calls these exports directly with
 * a hand-rolled mock `fetchImpl`).
 *
 * Two things every call site in this module needs from the shared helper, forced here so nobody
 * has to remember them at the call site:
 *
 * - `baseUrl: ''` — every URL these clients build already carries `baseUrl` baked in (see the
 *   callers below), so the shared helper's own base-prefixing must be a no-op here; otherwise a
 *   real base (e.g. `/etendo`) would be prepended twice.
 * - `on401: 'ignore'` — a 401 must reach this module's own `response.status === 401` branch
 *   (which maps it to `UPGRADE_ERROR_CODES.sessionExpired`) instead of being turned into a
 *   generic thrown `Error('Unauthorized')` by the shared helper before this module ever sees the
 *   response. This is unrelated to (and does not require) `token` matching any locally-registered
 *   session: the shared helper only routes a 401 to its own logout handler when the bearer that
 *   earned it is still the CURRENT one for whatever session it is bound to, and the explicit
 *   `token` override below means it never is — see `createApiFetch`'s `finish()`.
 * - `token` is passed through as an explicit override, even when `getCheckoutToken()` returned
 *   `null` (no account/platform session). Passing it unconditionally — rather than only when
 *   truthy — matters: an explicit `undefined`/absent `token` option makes the shared helper fall
 *   back to whatever session is ambiently registered, which in this app is the ERP session
 *   token. Forcing the override to `null` keeps that fallback from ever firing, so a missing
 *   account session degrades to "no Authorization header" (an honest 401) rather than to
 *   silently authenticating an account-level request with the wrong (ERP) bearer.
 *
 * @param {(url: string, init?: object) => Promise<Response>} apiFetchImpl
 * @param {string|null} token
 */
export function toCheckoutFetch(apiFetchImpl, token) {
  return (url, init) => apiFetchImpl(url, { ...init, token: token ?? null, baseUrl: '', on401: 'ignore' });
}

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

/** Starts a new account-level purchase through the provider-neutral billing boundary. */
export async function createBillingPurchase(fetchImpl, baseUrl, token, input = {}) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/purchases`, {
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

/** Reads the authenticated account-level subscription projection. */
export async function getSubscription(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/subscription`, {
    headers: buildAuthHeaders(token),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.subscriptionUnavailable, data?.error?.message, response.status);
  }
  return data;
}

/** Creates an authenticated customer portal session for the account subscription. */
export async function createPortalSession(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/subscription/portal`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.portalUnavailable, data?.error?.message, response.status);
  }
  return data;
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
    // Billing mutations require the account session. An environment JWT is never a fallback:
    // it authenticates a tenant operation and can remain valid after an account switch.
    return storage?.getItem(PLATFORM_TOKEN_KEY) || null;
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
