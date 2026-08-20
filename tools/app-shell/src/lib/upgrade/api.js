// Relative, NOT the `@/` alias: this module is imported by a `node --test` file,
// and plain Node has no idea what `@/` means — an alias here fails the whole
// suite with ERR_MODULE_NOT_FOUND before any assertion runs. Vite resolves both.
import { jsonHeaders, writeHeaders } from '../sessionHeaders.js';

// ETP-4576 — these three calls used to take a credential the caller had read out
// of localStorage and pass it to the onboarding package's `buildAuthHeaders`.
// That was wrong on both ends: `buildAuthHeaders` emits `X-Go-CSRF`, so a bearer
// token was travelling in the CSRF header, and both keys it was read from
// (`sf_auth_token`, `sf_platform_token`) are deleted by
// `purgeLegacyAuthStorage()` — so in practice the value was null and every
// upgrade action short-circuited before issuing a request. The credential now
// comes from the active session scheme, like every other call site.

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
export async function createCheckoutSession(fetchImpl, baseUrl, input = {}) {
  const response = await fetchImpl(`${baseUrl}/sws/go/checkout/sessions`, {
    method: 'POST',
    headers: writeHeaders(),
    credentials: 'include',
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

export async function getCheckoutStatus(fetchImpl, baseUrl, requestId) {
  const response = await fetchImpl(
    `${baseUrl}/sws/go/checkout/sessions/${encodeURIComponent(requestId)}`,
    { headers: jsonHeaders(), credentials: 'include' }
  );
  const data = await readJsonSafely(response);
  if (!response.ok) {
    throw buildError(response.status === 401 ? UPGRADE_ERROR_CODES.sessionExpired
      : UPGRADE_ERROR_CODES.checkoutCreationFailed, data?.error?.message, response.status);
  }
  return data || { status: 'pending' };
}

/** Starts the existing idempotent onboarding chain after the webhook authorizes the request. */
export async function runPaidOnboarding(fetchImpl, baseUrl, input, onMessage) {
  const response = await fetchImpl(`${baseUrl}/sws/go/onboarding`, {
    method: 'POST',
    headers: writeHeaders(),
    credentials: 'include',
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
