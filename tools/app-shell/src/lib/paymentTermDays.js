/**
 * ETP-5826 — the number of days a user types to create a payment term from a selector
 * ("+ Crear condición de pago"), and the order payment terms are listed in.
 *
 * Pure functions, no React: the inline-create variant registry
 * (`lib/inlineCreateVariants.js`) wires them into the create modal and the
 * selector, and they are unit-testable on their own.
 *
 * A created term is "net N days" — the backend (`PaymentTermHandler`, com.etendoerp.go) derives
 * the name ("N Días" / "1 Día") and the rest of the record from N, and refuses N outside the same
 * range with a 400. The client check exists so the user gets a precise, translated message before
 * any request is sent.
 */

export const PAYMENT_TERM_DAYS_MIN = 1;
export const PAYMENT_TERM_DAYS_MAX = 365;

/** i18n keys (`genericLabels`) of the three ways a typed value can be rejected. */
export const PAYMENT_TERM_DAYS_ERROR_KEYS = Object.freeze({
  empty: 'paymentTermDaysRequired',
  notInteger: 'paymentTermDaysNotInteger',
  outOfRange: 'paymentTermDaysOutOfRange',
});

const UNSIGNED_INTEGER = /^\d+$/;
// Only used to tell "a negative whole number" (out of range) apart from free text (not an integer).
const SIGNED_INTEGER = /^-\d+$/;

/**
 * Validates the typed number of days.
 *
 * Accepted: digits only, after trimming surrounding spaces, within
 * {@link PAYMENT_TERM_DAYS_MIN}–{@link PAYMENT_TERM_DAYS_MAX}. Rejected, each with its own key:
 * - empty / blank → `empty`;
 * - anything that is not a whole number (`abc`, `7,5`, `7.5`, `50% 30 / 50% 60`, `+5`) → `notInteger`;
 * - a whole number outside the range (`0`, `-5`, `366`) → `outOfRange`, with `{ min, max }` params.
 *
 * @param {unknown} raw the input value
 * @returns {{ ok: true, days: number } | { ok: false, errorKey: string, params?: object }}
 */
export function validatePaymentTermDays(raw) {
  const value = raw == null ? '' : String(raw).trim();
  if (!value) return { ok: false, errorKey: PAYMENT_TERM_DAYS_ERROR_KEYS.empty };
  if (SIGNED_INTEGER.test(value)) return outOfRange();
  if (!UNSIGNED_INTEGER.test(value)) return { ok: false, errorKey: PAYMENT_TERM_DAYS_ERROR_KEYS.notInteger };
  const days = Number(value);
  if (days < PAYMENT_TERM_DAYS_MIN || days > PAYMENT_TERM_DAYS_MAX) return outOfRange();
  return { ok: true, days };
}

function outOfRange() {
  return {
    ok: false,
    errorKey: PAYMENT_TERM_DAYS_ERROR_KEYS.outOfRange,
    params: { min: PAYMENT_TERM_DAYS_MIN, max: PAYMENT_TERM_DAYS_MAX },
  };
}

/**
 * The leading whole number of a payment-term name ("30 Días" → 30, "1 Día" → 1), or `null` when
 * the name does not start with one ("Inmediato").
 *
 * @param {unknown} name
 * @returns {number | null}
 */
export function leadingDays(name) {
  const match = /^\s*(\d+)/.exec(String(name ?? ''));
  return match ? Number(match[1]) : null;
}

/**
 * Sort comparator for payment-term selector options (`{ name }`): names without a leading number
 * first ("Inmediato"), then by that number ascending (1, 7, 15, 30, 100…), ties by name. The
 * server orders selectors alphabetically, which puts "100 Días" before "15 Días".
 *
 * @param {{ name?: string }} a
 * @param {{ name?: string }} b
 * @returns {number}
 */
export function comparePaymentTermOptions(a, b) {
  const daysA = leadingDays(a?.name);
  const daysB = leadingDays(b?.name);
  if (daysA !== daysB) {
    if (daysA === null) return -1;
    if (daysB === null) return 1;
    return daysA - daysB;
  }
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
}
