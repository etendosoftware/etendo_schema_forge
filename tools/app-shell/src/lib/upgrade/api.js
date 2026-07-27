import { buildAuthHeaders } from '@etendosoftware/etendo-go-core/onboarding/api';

/**
 * Calls the onboarding endpoint for the paid upgrade flow.
 *
 * This does not reuse `runOnboardingStream` from the core package for two
 * reasons: that helper serialises a fixed allowlist of fields, so it would drop
 * `paymentToken`; and it starts reading the NDJSON stream without checking the
 * status, so a 402 paywall response would surface as a generic "no result"
 * failure instead of a payment error. Everything else — endpoint, auth header
 * shape and message protocol — matches the core helper.
 */

/** Error codes this module raises, mapped to i18n keys by the page. */
export const UPGRADE_ERROR_CODES = {
  paymentRequired: 'upgradePaymentRequired',
  streamUnavailable: 'upgradeStreamUnavailable',
  missingResult: 'upgradeMissingResult',
  failed: 'upgradeGenericError',
};

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

/** Consumes an NDJSON body, forwarding each message and keeping the final result. */
export async function readNdjsonStream(reader, onMessage) {
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();

    const lines = buffer.split('\n');
    // Keep the trailing partial line until more bytes arrive.
    buffer = done ? '' : lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // A malformed line should not abort a provisioning run already underway.
        continue;
      }
      onMessage?.(message);
      if (message.type === 'result') finalResult = message;
    }

    if (done) break;
  }

  return finalResult;
}

/**
 * Creates a second, productive tenant behind the mock paywall.
 *
 * @param {Function} fetchImpl fetch implementation
 * @param {string} baseUrl API base (may be '')
 * @param {string} token platform token
 * @param {object} form { clientName, currency, language, countryCode, paymentToken }
 * @param {Function} [onMessage] receives each streamed progress/result message
 * @returns {Promise<object>} the final `result` message
 */
export async function createProductiveTenant(fetchImpl, baseUrl, token, form, onMessage) {
  const response = await fetchImpl(`${baseUrl}/sws/go/onboarding`, {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      clientName: form.clientName,
      currency: form.currency,
      language: form.language,
      countryCode: form.countryCode,
      paymentToken: form.paymentToken,
    }),
  });

  // The paywall answers before any provisioning starts, so there is no stream
  // to read — surface it as a payment error the page can act on.
  if (response.status === 402) {
    const data = await readJsonSafely(response);
    throw buildError(UPGRADE_ERROR_CODES.paymentRequired, data?.message, 402);
  }

  if (!response.ok) {
    const data = await readJsonSafely(response);
    throw buildError(UPGRADE_ERROR_CODES.failed, data?.error?.message || data?.message, response.status);
  }

  if (!response.body?.getReader) {
    throw buildError(UPGRADE_ERROR_CODES.streamUnavailable);
  }

  const finalResult = await readNdjsonStream(response.body.getReader(), onMessage);
  if (!finalResult) {
    throw buildError(UPGRADE_ERROR_CODES.missingResult);
  }
  return finalResult;
}
