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
 *
 * `ON_HOLD_PATTERN` anchors on the DISTINCTIVE SENTENCE SHAPE of the two real
 * AD_MESSAGE catalog entries this condition fires from — `BusinessPartnerBlocked`
 * ("is on hold for this document, therefore it is not possible to complete it.")
 * and `SelectedBPartnerBlocked` ("The selected Business Partner is on hold for this
 * document, therefore it is not possible to complete it."), with their es_ES
 * translations ("está/bloqueada bloqueado para este documento, no se puede
 * completar.") — the same "anchor on a distinctive phrase fragment, not a bare
 * keyword" precedent `backendErrors.js` already follows for its parameterized
 * matchers. A REVIEW pass (ETP-5024) found the earlier bare `bloquead[oa]` keyword
 * false-positived on 11 unrelated live AD_MESSAGE catalog entries, including
 * `lockedProduct` ("el producto está bloqueado y no se puede entregar" — a Goods
 * Shipment Complete failure with nothing to do with the Business Partner) — see
 * `__tests__/blockingBpConditions.test.js` for the confirmed false-positive
 * regression cases. `BusinessPartnerBlocked2`/`BusinessPartnerBlocked3` (the
 * "on hold therefore invoices/shipments cannot be created" siblings, raised by
 * core's `C_INVOICE_CREATE`/`M_INOUT_CREATE` DB functions) were investigated and
 * deliberately excluded: Etendo GO's create-invoice/create-shipment actions
 * (`CreateShipmentHandler.java`, `CreateInvoiceShipmentHandler.java`) build the
 * target document directly via DAL, never calling those core DB functions, so
 * those two messages are not reachable through the current NEO Headless surface.
 *
 * `creditLimit` amount extraction: `SE_Order_BPartner.java` (core Etendo, out of
 * scope to touch) builds the message as raw string concatenation —
 * `Utility.messageBD(this, "CreditLimitOver", lang) + creditLimitExceed` — with NO
 * separating space, and `creditLimitExceed` is itself an unformatted
 * `"" + Double.parseDouble(...) * -1` (no thousands separator, no fixed decimals,
 * no currency symbol). Pasting that straight into the banner produced
 * `Aviso: Crédito limite superado4912.6` — see the `CASH_CLOSE_NO_CONCEPT_PREFIX`
 * precedent in `lib/backendErrors.js` for why a raw backend numeric string must
 * never reach UI copy unformatted. So the trailing numeric token is pulled out
 * here (always the last thing in the string, whatever language the label is in)
 * and handed back separately as `amount` — the caller (`BlockingBpBanner.jsx`) is
 * responsible for formatting it with `formatCurrency` and rebuilding the sentence
 * with an explicit space, since this module has no currency context.
 */

const CREDIT_LIMIT_PATTERN = /credit\s+limit|cr[eé]dito.{0,20}l[ií]mite|l[ií]mite.{0,20}(de\s+)?cr[eé]dito/i;
const ON_HOLD_PATTERN = /\bon\s+hold\s+for\s+this\s+document\b|bloquead[oa]\s+para\s+este\s+documento/i;
// Trailing numeric token, plain decimal OR scientific notation (Java's
// `Double.toString()` — see `SE_Order_BPartner.java` above — switches to
// scientific notation, e.g. `1.2345678E7`, for values >= 1e7, which is routine
// for ARS/COP/CLP amounts). Number() parses the scientific form natively once
// captured, so no separate exponent-expansion step is needed.
const TRAILING_AMOUNT_PATTERN = /(-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?)\s*$/;

/**
 * @param {string} text an already-localized backend message
 * @returns {{ kind: 'creditLimit', text: string, amount: number | null } | { kind: 'onHold', text: string } | null}
 */
export function detectBlockingBpCondition(text) {
  if (!text || typeof text !== 'string') return null;
  if (CREDIT_LIMIT_PATTERN.test(text)) {
    const match = text.match(TRAILING_AMOUNT_PATTERN);
    const label = match ? text.slice(0, match.index).trimEnd() : text;
    const parsed = match ? Number(match[1].replace(',', '.')) : NaN;
    const amount = Number.isFinite(parsed) ? parsed : null;
    return { kind: 'creditLimit', text: label, amount };
  }
  if (ON_HOLD_PATTERN.test(text)) return { kind: 'onHold', text };
  return null;
}
