/**
 * ETP-5024 — classifies an already-translated backend message as one of the two
 * Business-Partner blocking conditions that must render as a PERSISTENT inline
 * banner (InfoBanner) instead of an auto-dismissing toast:
 *
 *  - `creditLimit` — the BP's credit limit is exceeded (AD_MESSAGE `CreditLimitOver`,
 *    surfaced by the `SE_Order_BPartner`-style callout when the Business Partner
 *    field changes).
 *  - `onHold`      — the BP is on hold for this document (AD_MESSAGE
 *    `BusinessPartnerBlocked` / `SelectedBPartnerBlocked`), surfaced either by the
 *    same BP-select callout or by a failed Complete/process action.
 *
 * This is NOT a translation fix (see `lib/backendErrors.js` for that layer — it maps
 * a raw, UNTRANSLATED backend string to an i18n key). By the time a message reaches
 * this classifier it has already been correctly localized by the backend (once the
 * request carries `Accept-Language` — see `useApiFetch`/`createApiFetch`). The job
 * here is purely to recognize WHICH of the two known conditions a given message
 * represents, in whichever language it arrived in, so the UI can route it to a
 * persistent banner and remember it across renders until the condition is cleared
 * (Business Partner changed, or the document completed).
 *
 * Matches both English and Spanish wording (mirrors the bilingual-regex style
 * already used by `useEntity.js`'s `normalizeServerError`), because the backend
 * message text itself is locale-dependent — an exact-string map like
 * `backendErrors.js`'s would only match one language at a time.
 */

const CREDIT_LIMIT_PATTERN = /credit\s+limit|cr[eé]dito.{0,20}l[ií]mite|l[ií]mite.{0,20}(de\s+)?cr[eé]dito/i;
const ON_HOLD_PATTERN = /\bon\s+hold\b|bloquead[oa]/i;

/**
 * @param {string} text an already-localized backend message
 * @returns {{ kind: 'creditLimit' | 'onHold', text: string } | null}
 */
export function detectBlockingBpCondition(text) {
  if (!text || typeof text !== 'string') return null;
  if (CREDIT_LIMIT_PATTERN.test(text)) return { kind: 'creditLimit', text };
  if (ON_HOLD_PATTERN.test(text)) return { kind: 'onHold', text };
  return null;
}
