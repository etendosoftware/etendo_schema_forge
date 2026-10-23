import { validatePaymentTermDays, comparePaymentTermOptions } from './paymentTermDays.js';

/**
 * ETP-5826 — inline-create variants, keyed by the field's `createSpec`.
 *
 * A selector field with `allowCreate` + `createSpec` + `createEntity` renders
 * `InlineCreateSelector`, whose "+ create" action opens `InlineCreateModal`. By default the modal
 * asks for a NAME and POSTs `{ name }` (match-rule → transaction type). A target whose record is
 * not created from a name declares a variant here; the selector looks it up by `createSpec`, so
 * every field pointing at that spec — generated windows via decisions.json, hand-built forms via
 * the exported field props — gets the same input, validation and request body.
 *
 * A variant may declare (all optional; anything missing falls back to the default):
 * - `inputLabelKey`   — i18n key of the input label (default: the generic "Name").
 * - `inputSuffixKey`  — i18n key of a unit shown after the input (e.g. "días").
 * - `inputMode`       — the input's `inputMode` attribute (e.g. `'numeric'` for a mobile keypad).
 * - `inputPattern`    — RegExp (no `g` flag) the input value must always match; a typed or pasted
 *                       change that does not is refused on the spot, keeping the previous value and
 *                       showing `validate`'s message for it (or `inputRejectedKey`).
 * - `inputMaxLength`  — longest value accepted; a longer change is refused the same way.
 * - `inputRejectedKey`— i18n key shown for a refused change `validate` has no message for.
 * - `validate(value)` — `null` when valid, else `{ key, params? }`: an i18n key shown under the
 *                       input, checked before any request is sent.
 * - `buildBody(value)`— the POST body for the trimmed input (default `{ name: value }`).
 * - `sortOptions`     — `(a, b) => number` comparator applied to the selector's option list.
 * - `errorMessagesByKey` — `{ [backendMessageKey]: (messageParams) => ({ key, params? }) | null }`:
 *                       a failed create whose `error.messageKeys` holds that key shows the translated
 *                       message the builder returns (it receives `error.messageParams`). Returning
 *                       `null` lets the next rule decide.
 * - `fallbackErrorKeysByStatus` — `{ [httpStatus]: i18nKey }`: used only for a failed create that
 *                       carries NO backend message key (e.g. a generic unique-constraint 409).
 * An error matched by neither goes through the shared `translateBackendError` (lib/backendErrors.js),
 * which is where a backend message key that other screens also show belongs — the variant only
 * maps what is specific to the create modal. A 5xx is never shown verbatim (see InlineCreateSelector).
 *
 * Keep entries generic over the target spec: a variant describes how a record of THAT spec is
 * created, never how one window uses it.
 */

const DEFAULT_VARIANT = Object.freeze({
  buildBody: (value) => ({ name: value }),
});

export const INLINE_CREATE_VARIANTS = Object.freeze({
  // A payment term is created from a whole number of days (1–365); the backend derives its name
  // ("N Días" / "1 Día"). Its refusals (PaymentTermHandler, com.etendoerp.go) carry message keys —
  // ETGO_PaymentTermDaysDuplicate / ETGO_PaymentTermNameDuplicate / ETGO_PaymentTermDays* — that the
  // Payment Term window shows too, so they are translated once in lib/backendErrors.js, not here.
  // A 409 WITHOUT a key can only be C_PaymentTerm's `(client, org, name)` unique constraint caught
  // by the generic CRUD path (a race past the handler's own check), hence the nameless fallback.
  'payment-term': Object.freeze({
    inputLabelKey: 'paymentTermDaysLabel',
    inputSuffixKey: 'paymentTermDaysSuffix',
    inputMode: 'numeric',
    // Digits only, at most 3 (365 is the maximum): "5.5", "5,45", "12abc", "-5", "50%" can never be
    // typed or pasted. `validate` stays the submit-time backstop for empty, 0 and > 365.
    inputPattern: /^\d*$/,
    inputMaxLength: 3,
    inputRejectedKey: 'paymentTermDaysNotInteger',
    validate: (value) => {
      const result = validatePaymentTermDays(value);
      return result.ok ? null : { key: result.errorKey, params: result.params };
    },
    buildBody: (value) => ({ overduePaymentDaysRule: validatePaymentTermDays(value).days }),
    sortOptions: comparePaymentTermOptions,
    fallbackErrorKeysByStatus: Object.freeze({ 409: 'paymentTermNameDuplicate' }),
  }),
});

// Each entry merged over the default once, so a resolved variant keeps a stable identity across
// renders (it feeds hook dependencies and the selector's `sortOptions` prop).
const RESOLVED_VARIANTS = Object.freeze(Object.fromEntries(
  Object.entries(INLINE_CREATE_VARIANTS)
    .map(([spec, variant]) => [spec, Object.freeze({ ...DEFAULT_VARIANT, ...variant })]),
));

/**
 * The variant for `createSpec`, merged over the default name-only behaviour. Unknown or missing
 * specs get the default, so a field without a registry entry behaves exactly as before.
 *
 * @param {string | undefined} createSpec
 * @returns {object}
 */
export function resolveInlineCreateVariant(createSpec) {
  return (createSpec && Object.hasOwn(RESOLVED_VARIANTS, createSpec))
    ? RESOLVED_VARIANTS[createSpec]
    : DEFAULT_VARIANT;
}

/**
 * Field props that turn a payment-term selector (`C_PaymentTerm_ID`, `PO_PaymentTerm_ID`) into a
 * creatable one. Spread into a hand-built field definition (contacts' BillingPreferencesForm); a
 * generated window declares the same keys in its decisions.json field — see
 * docs/decisions-reference.md (`allowCreate`).
 */
export const PAYMENT_TERM_CREATE_FIELD_PROPS = Object.freeze({
  allowCreate: true,
  createSpec: 'payment-term',
  createEntity: 'header',
  createLabelKey: 'paymentTermCreate',
  createTitleKey: 'paymentTermCreateTitle',
  createNamePlaceholderKey: 'paymentTermDaysPlaceholder',
});

/**
 * The translated message for a failed create, per the variant's error rules, or `null` to keep the
 * backend's own text. Rules, in order:
 * 1. the first of `error.messageKeys` with a builder in `errorMessagesByKey` that returns a message;
 * 2. when the error carries no message key at all, `fallbackErrorKeysByStatus[error.status]`.
 *
 * @param {object} variant a resolved variant
 * @param {{ status?: number, messageKeys?: string[], messageParams?: object } | null} error
 * @returns {{ key: string, params?: object } | null}
 */
export function resolveCreateErrorMessage(variant, error) {
  const keys = Array.isArray(error?.messageKeys) ? error.messageKeys : [];
  for (const backendKey of keys) {
    const build = variant?.errorMessagesByKey && Object.hasOwn(variant.errorMessagesByKey, backendKey)
      ? variant.errorMessagesByKey[backendKey]
      : null;
    const message = build ? build(error.messageParams ?? {}) : null;
    if (message) return message;
  }
  if (keys.length > 0) return null;
  const statusKey = variant?.fallbackErrorKeysByStatus?.[error?.status];
  return statusKey ? { key: statusKey } : null;
}
