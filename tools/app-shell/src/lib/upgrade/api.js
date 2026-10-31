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
  plansUnavailable: 'upgradePlansUnavailable',
  // The server answered PLAN_NOT_AVAILABLE: the key this page sent is not for sale any more. The
  // usual innocent cause is a plan list loaded before it changed (e.g. the legacy price fallback
  // retired by the first priced plan), so the copy tells the user to reload.
  planNotAvailable: 'upgradePlanNotAvailable',
  purchaseAlreadyExists: 'upgradePurchaseAlreadyExists',
  sessionExpired: 'upgradeSessionExpired',
  // ETP-5443 REVIEW N3: a failed READ of the subscription, or a failed portal-session
  // creation, is neither a checkout nor a creation of anything — reusing
  // `checkoutCreationFailed` for them said the wrong thing about what broke. Each gets
  // its own code so a caller (and a log line) can tell "can't read the subscription"
  // apart from "can't open the portal" apart from "checkout failed".
  subscriptionUnavailable: 'upgradeSubscriptionUnavailable',
  portalUnavailable: 'upgradePortalUnavailable',
  // ETP-5051 O-1b: the portal found no subscription for the environment it was asked about
  // (404 NO_SUBSCRIPTION) — a demo, or an environment with no purchase of its own. Not transient,
  // so it is not `portalUnavailable`'s "please try again".
  portalNoSubscription: 'upgradePortalNoSubscription',
  // ETP-5548: the account already has a productive environment with this company name. Refused
  // before the provider is contacted, because a paid checkout fixes its name.
  tenantNameInUse: 'upgradeTenantNameInUse',
  // ETP-5742: refusals of the re-subscription. Only the owner may re-subscribe, and only an
  // environment whose subscription was canceled has one to re-subscribe.
  reactivationOwnerRequired: 'blockedAccessSubscriptionCanceledMemberMessage',
  reactivationNotAvailable: 'blockedAccessReactivateFailed',
  // ETP-5053: plan changes from /account. The offered changes could not be read; the change was
  // refused because no Allowed plan changes row offers it (409 PLAN_CHANGE_NOT_ALLOWED) or the
  // subscription is past due or canceled (409 SUBSCRIPTION_NOT_CURRENT); anything else failed.
  planChangesUnavailable: 'planChangeUnavailable',
  planChangeNotAllowed: 'planChangeNotAllowed',
  planChangeNotCurrent: 'planChangeNotCurrent',
  planChangeFailed: 'planChangeFailed',
  failed: 'upgradeGenericError',
};

/** Backend code of the pre-payment company-name collision (EtendoGoJwtServlet). */
const CLIENT_NAME_IN_USE = 'CLIENT_NAME_IN_USE';

function isClientNameInUse(response, data) {
  return response.status === 409 && data?.error?.code === CLIENT_NAME_IN_USE;
}

/**
 * Reads the server's plan catalog — the list of things that are actually purchasable.
 *
 * This exists because checkout sells plans by key: without a catalog the browser has no way to
 * learn one, so there is no client-side list of keys to fall back on. Guessing a key here would be
 * a purchase nobody reviewed, so a failed lookup raises instead, and the page disables checkout.
 * While the server's legacy price fallback is active (no priced plan exists yet) the catalog is
 * exactly the grandfathered `legacy-productive` plan, quoted from the configured Stripe price, and
 * the page auto-selects it like any single plan.
 *
 * The server never sends a provider price id, and this client never sends one either.
 *
 * @returns {Promise<Array<{planKey: string, name: string, description: string,
 *   displayPrice: string, currency: string, billingInterval: string}>>} possibly empty — an
 *   empty catalog is an answer, not a failure.
 */
export async function fetchPlans(baseUrl) {
  const response = await apiFetch('/sws/go/plans', { baseUrl, on401: 'ignore' });
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
 * ignored rather than honoured. A missing key asks for the server's legacy price
 * fallback and is refused `PLAN_NOT_AVAILABLE` once a priced plan exists (ETP-5046).
 */
export async function createCheckoutSession(baseUrl, input = {}) {
  const response = await apiFetch('/sws/go/checkout/sessions', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
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
    if (isClientNameInUse(response, data)) {
      throw buildError(UPGRADE_ERROR_CODES.tenantNameInUse, data.error.message, response.status);
    }
    throw buildError(checkoutFailureCode(response, data), data?.error?.message || data?.message,
      response.status);
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
      // A catalog KEY, never a price: pricing is server-owned and the browser has no field that
      // could influence it. Without one the server only sells under its legacy price fallback.
      ...(input.planKey ? { planKey: input.planKey } : {}),
      ...(input.demoClientId ? { demoClientId: input.demoClientId } : {}),
      ...(input.dataTransfer && Object.keys(input.dataTransfer).length > 0
        ? { dataTransfer: input.dataTransfer }
        : {}),
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      ...(input.dataTransfer ? { dataTransfer: input.dataTransfer } : {}),
    }),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw billingPurchaseError(response, data);
  }
  if (!data?.checkoutUrl || !data?.requestId) {
    throw buildError(UPGRADE_ERROR_CODES.checkoutUnavailable);
  }
  return { checkoutUrl: data.checkoutUrl, requestId: data.requestId, expiresAt: data.expiresAt || null };
}

/** Maps a refused billing purchase to its upgrade error; a 409 for an existing one carries it. */
function billingPurchaseError(response, data) {
  if (response.status === 409 && data?.purchaseId) {
    const error = buildError(UPGRADE_ERROR_CODES.purchaseAlreadyExists,
      data.status || 'Purchase already exists', response.status);
    error.purchase = data;
    return error;
  }
  if (isClientNameInUse(response, data)) {
    return buildError(UPGRADE_ERROR_CODES.tenantNameInUse, data.error.message, response.status);
  }
  return buildError(checkoutFailureCode(response, data), data?.error?.message || data?.message,
    response.status);
}

/**
 * ETP-5742 — re-subscribes the environment of the current session after its subscription was
 * canceled. The body is empty on purpose: the environment is the session's, the plan is the one
 * the canceled subscription had, and neither is the browser's to name.
 *
 * Resolves to `{ requestId, checkoutUrl }` to send the buyer to the provider, or to
 * `{ requestId, status: 'paid' }` when the re-subscription is already paid and only waiting for the
 * payment confirmation to be applied.
 */
export async function createSubscriptionReactivation(baseUrl) {
  const response = await apiFetch('/sws/go/billing/reactivation', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(reactivationFailureCode(response, data),
      data?.error?.message || data?.message, response.status);
  }
  if (data?.status === 'paid' && data?.requestId) {
    return { requestId: data.requestId, status: 'paid' };
  }
  if (!data?.checkoutUrl || !data?.requestId) {
    throw buildError(UPGRADE_ERROR_CODES.checkoutUnavailable);
  }
  return { requestId: data.requestId, checkoutUrl: data.checkoutUrl };
}

function reactivationFailureCode(response, data) {
  if (data?.error?.code === 'REACTIVATION_OWNER_REQUIRED') {
    return UPGRADE_ERROR_CODES.reactivationOwnerRequired;
  }
  if (data?.error?.code === 'REACTIVATION_NOT_AVAILABLE') {
    return UPGRADE_ERROR_CODES.reactivationNotAvailable;
  }
  return checkoutFailureCode(response, data);
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

/** Reads the authenticated account-level subscription projection. */
export async function getSubscription(baseUrl) {
  const response = await apiFetch('/sws/go/billing/subscription', { baseUrl, on401: 'ignore' });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.subscriptionUnavailable, data?.error?.message, response.status);
  }
  return data;
}

/** Backend code of the portal's "no subscription to manage" refusal (EtendoGoJwtServlet). */
const NO_SUBSCRIPTION = 'NO_SUBSCRIPTION';

function portalFailureCode(response, data) {
  if (response.status === 401) return UPGRADE_ERROR_CODES.sessionExpired;
  if (response.status === 404 && data?.error?.code === NO_SUBSCRIPTION) {
    return UPGRADE_ERROR_CODES.portalNoSubscription;
  }
  return UPGRADE_ERROR_CODES.portalUnavailable;
}

/**
 * Creates an authenticated customer portal session.
 *
 * ETP-5051 O-1b — with a `clientId` the portal is that environment's own (a "Mis empresas" row);
 * the backend checks the account bought it and answers 404 NO_SUBSCRIPTION otherwise. Without one
 * no body is sent and the backend picks the entered environment, or the account's newest purchase
 * when none is entered (/account).
 */
export async function createPortalSession(baseUrl, clientId = null) {
  const response = await apiFetch('/sws/go/billing/subscription/portal', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
    ...(clientId ? { body: JSON.stringify({ clientId }) } : {}),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(portalFailureCode(response, data), data?.error?.message, response.status);
  }
  return data;
}

/** Backend refusal codes of a plan change (PlanChangeRefusedException, ETP-5053). */
const PLAN_CHANGE_NOT_ALLOWED = 'PLAN_CHANGE_NOT_ALLOWED';
const SUBSCRIPTION_NOT_CURRENT = 'SUBSCRIPTION_NOT_CURRENT';

function planChangeFailureCode(response, data) {
  if (response.status === 401) return UPGRADE_ERROR_CODES.sessionExpired;
  const code = data?.error?.code;
  if (response.status === 409 && code === PLAN_CHANGE_NOT_ALLOWED) {
    return UPGRADE_ERROR_CODES.planChangeNotAllowed;
  }
  if (response.status === 409 && code === SUBSCRIPTION_NOT_CURRENT) {
    return UPGRADE_ERROR_CODES.planChangeNotCurrent;
  }
  return UPGRADE_ERROR_CODES.planChangeFailed;
}

/**
 * ETP-5053 — the plan changes the shown subscription may ask for, each with its timing
 * (`immediate` / `period_end`), whether it changes the billing interval, and the tenant's current
 * usage measured against the target plan's quotas. With a `clientId` it is that environment's
 * subscription (a "Mis empresas" row); without one, the entered environment's, or the account's
 * newest purchase.
 */
export async function getPlanChanges(baseUrl, clientId = null) {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  const response = await apiFetch(`/sws/go/billing/subscription/plan-changes${query}`, {
    baseUrl, on401: 'ignore',
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.planChangesUnavailable, data?.error?.message, response.status);
  }
  return data || { hasSubscription: false, changes: [] };
}

/**
 * ETP-5053 — asks for a plan change. An upgrade applies now (the answer carries
 * `timing: "immediate"`); a downgrade is scheduled for the end of the current period
 * (`timing: "period_end"`, `effectiveAt`). Repeating a request is safe: the same downgrade answers
 * `alreadyPending: true`, and an upgrade is idempotent at the provider.
 */
export async function requestPlanChange(baseUrl, planKey, clientId = null) {
  const response = await apiFetch('/sws/go/billing/subscription/plan-change', {
    method: 'POST',
    baseUrl,
    on401: 'ignore',
    body: JSON.stringify(clientId ? { planKey, clientId } : { planKey }),
  });
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(planChangeFailureCode(response, data), data?.error?.message, response.status);
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
      ...(input.dataTransfer && Object.keys(input.dataTransfer).length > 0
        ? { dataTransfer: input.dataTransfer }
        : {}),
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


/** Maps a refused checkout write onto the code the page translates. */
function checkoutFailureCode(response, data) {
  if (response.status === 401) return UPGRADE_ERROR_CODES.sessionExpired;
  if (data?.error?.code === 'PLAN_NOT_AVAILABLE') return UPGRADE_ERROR_CODES.planNotAvailable;
  return UPGRADE_ERROR_CODES.checkoutCreationFailed;
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
