/**
 * Mock payment for the tenant upgrade flow.
 *
 * No real payment processor is involved. The card is validated in the browser
 * and the token below is minted client-side.
 *
 * **This is not a payment control, and nothing downstream makes it one.** The
 * backend checks only that the token *matches the expected shape*
 * (`^mock-paid-[0-9a-f]+$`) — it does not verify that any charge occurred, so
 * anyone who can reach the endpoint can hand-write `mock-paid-deadbeef` and be
 * provisioned a tenant. Treat the whole gate as a placeholder for the flow, not
 * as something that protects revenue.
 *
 * Replacing it with real payment means the backend must validate a
 * processor-issued token against the processor, out of band from the client.
 */

/** Test card that always simulates an issuer decline. */
export const DECLINE_CARD_NUMBER = '4000000000000002';

/**
 * Token the backend rejects with HTTP 402. The client never sends it —
 * declines are simulated before any request — but it is part of the agreed
 * contract, so it is declared here rather than living only in the backend.
 */
export const DECLINED_PAYMENT_TOKEN = 'mock-declined';

const CARD_NUMBER_LENGTH = 16;
const EXPIRY_PATTERN = /^(\d{2})\s*\/\s*(\d{2})$/;

/** Strips the spaces and dashes people type into card fields. */
export function normalizeCardNumber(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

/** Groups digits in blocks of four for display while typing. */
export function formatCardNumber(value) {
  return normalizeCardNumber(value)
    .slice(0, CARD_NUMBER_LENGTH)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function isDeclinedCard(cardNumber) {
  return normalizeCardNumber(cardNumber) === DECLINE_CARD_NUMBER;
}

/**
 * Validates the checkout form.
 *
 * Returns a map of field name to i18n key; an empty object means valid.
 * `now` is injectable so expiry checks stay deterministic.
 */
export function validateCheckout({ cardholder, cardNumber, expiry, cvc, tenantName } = {}, now = new Date()) {
  const errors = {};

  if (!String(tenantName ?? '').trim()) {
    errors.tenantName = 'upgradeTenantNameRequired';
  }

  if (!String(cardholder ?? '').trim()) {
    errors.cardholder = 'upgradeCardholderRequired';
  }

  const digits = normalizeCardNumber(cardNumber);
  if (digits.length !== CARD_NUMBER_LENGTH || !/^\d+$/.test(digits)) {
    errors.cardNumber = 'upgradeCardNumberInvalid';
  }

  const match = EXPIRY_PATTERN.exec(String(expiry ?? '').trim());
  if (!match) {
    errors.expiry = 'upgradeExpiryInvalid';
  } else {
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) {
      errors.expiry = 'upgradeExpiryInvalid';
    } else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      // A card is valid through the last day of its expiry month.
      errors.expiry = 'upgradeExpiryPast';
    }
  }

  if (!/^\d{3,4}$/.test(String(cvc ?? '').trim())) {
    errors.cvc = 'upgradeCvcInvalid';
  }

  return errors;
}

let tokenSequence = 0;

/**
 * Hex for a mock token: unique, not unpredictable.
 *
 * The backend accepts any well-formed token — it validates shape, never
 * provenance — so unpredictability is not a property this value has, and
 * reaching for a general-purpose PRNG to imitate it would only suggest
 * otherwise. Where the platform offers a CSPRNG we use it because it costs
 * nothing; where it does not (non-secure contexts, older embedded webviews) a
 * timestamp and a counter keep tokens distinct without pretending to be secret.
 *
 * A real payment token will be issued by the processor and verified against it.
 * None of this generator survives that change.
 */
function randomHex(bytes = 8) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint8Array(bytes);
    cryptoApi.getRandomValues(buffer);
    return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  tokenSequence += 1;
  const stamp = Date.now().toString(16);
  const sequence = tokenSequence.toString(16).padStart(4, '0');
  return `${stamp}${sequence}`;
}

/** Mints the token a successful mock charge produces. */
export function createMockPaymentToken() {
  return `mock-paid-${randomHex()}`;
}
