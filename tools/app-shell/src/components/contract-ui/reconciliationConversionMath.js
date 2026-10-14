/**
 * Pure logic for the bank-rate conversion of the reconciliation payment-method modal (ETP-5657).
 *
 * When every selected invoice shares ONE currency that differs from the financial account's, the
 * modal behaves like Classic's Match Statement → Add Payment: the bank already told us what the
 * invoices were worth in the account currency (the statement line), so the conversion rate is
 * DERIVED from it instead of being taken from the invoice. Three figures describe the payment and
 * they are kept consistent the way Classic keeps them (`ob-aprm-addPayment.js`):
 *
 *  - `actual`    — the amount paid, in the INVOICE currency (partial payment when lowered);
 *  - `rate`      — invoice → account conversion rate, 6 decimals HALF_UP when derived;
 *  - `converted` — the amount booked on the bank, in the ACCOUNT currency.
 *
 * Which of `rate` / `converted` follows an edit of `actual` is decided by the `anchor`: the
 * converted amount starts pinned to the statement line (`'converted'`), and once the user types a
 * rate the rate becomes the anchor instead (`'rate'`).
 *
 * Kept in a plain `.js` module, separate from the hook and the section `.jsx`, so the node:test
 * runner can import it — the same arrangement as `writeoffMath.js` and
 * `reconciliationDifferenceMath.js`. The backend (`ReconciliationConversionSupport`) re-validates
 * everything; nothing here is a boundary.
 */

/** Decimals of a DERIVED rate — Classic's `FIN_AddPayment.setFinancialTransactionAmountAndRate`. */
export const RATE_DECIMALS = 6;

/**
 * Decimals of an amount. The candidate rows carry no currency precision, so both currencies use the
 * standard 2; the backend compares `actualPayment` at the invoice's real precision regardless.
 */
export const AMOUNT_DECIMALS = 2;

/** Below half a cent a difference is not worth showing. */
const NEGLIGIBLE = 0.005;

/** Decimals used to scrub binary floating-point noise off a sum (0.1 + 0.2 → 0.3). */
const NOISE_DECIMALS = 10;

/**
 * Rounds HALF_UP (away from zero) to `decimals`, without the binary-float trap of
 * `Math.round(x * 10^d) / 10^d` (1.005 → 1.00). Returns null for anything that is not a finite
 * number.
 *
 * @param {number|string|null|undefined} value
 * @param {number} decimals
 * @returns {number|null}
 */
export function roundHalfUp(value, decimals) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const text = String(abs);
  // The exponent-shift trick needs a plain decimal; a value already in exponent form is so far
  // from any amount that the plain multiply is exact enough.
  let rounded;
  if (text.includes('e')) {
    rounded = Math.round(abs * 10 ** decimals) / 10 ** decimals;
  } else {
    const shifted = Math.round(Number(`${text}e${decimals}`));
    rounded = Number(`${shifted}e-${decimals}`);
  }
  return n < 0 ? -rounded : rounded;
}

/**
 * Drops the trailing zeros of a fixed-point decimal string, then a dangling point
 * ("0.00000010000" → "0.0000001", "5.000" → "5"). A plain scan rather than a regex, which Sonar
 * flags as a backtracking hotspot (javascript:S5852). A string with no decimal point is returned
 * as is, so the significant zeros of an integer or an exponent ("1e+30") are never touched.
 *
 * @param {string} text
 * @returns {string}
 */
function trimFractionZeros(text) {
  if (!text.includes('.')) return text;
  let end = text.length;
  while (text[end - 1] === '0') end -= 1;
  if (text[end - 1] === '.') end -= 1;
  return text.slice(0, end);
}

/**
 * A number as a plain dot-decimal string, never in exponent notation — the wire shape the backend
 * parses with `new BigDecimal(String)`.
 *
 * @param {number|null} value
 * @returns {string|null}
 */
export function decimalString(value) {
  if (value == null || !Number.isFinite(value)) return null;
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return trimFractionZeros(value.toFixed(20));
}

/** A finite number or null — keeps `0` (unlike `|| null`) and drops NaN/blank. */
function toNumberOrNull(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * A candidate's own invoice rate, or null when it is unknown. Missing, blank, zero and negative all
 * count as unknown, so the footer's gain/loss notice can never show a difference measured against
 * a rate of 0.
 *
 * @param {object} cand
 * @returns {number|null}
 */
function knownRate(cand) {
  const rate = toNumberOrNull(cand?.rate);
  return rate != null && rate > 0 ? rate : null;
}

/**
 * An invoice candidate's outstanding amount, unsigned, in the INVOICE currency. For invoice rows
 * `pendingBalance` and `amount` are the same figure (the schedule's outstanding amount).
 *
 * @param {object} cand
 * @returns {number}
 */
export function outstandingOf(cand) {
  return Math.abs(toNumberOrNull(cand?.pendingBalance ?? cand?.amount) ?? 0);
}

/**
 * Σ outstanding of the selected invoices, in the invoice currency.
 *
 * @param {Array<object>} invoices
 * @returns {number}
 */
export function outstandingSum(invoices) {
  const sum = (invoices || []).reduce((acc, c) => acc + outstandingOf(c), 0);
  return roundHalfUp(sum, NOISE_DECIMALS) ?? 0;
}

/**
 * Whether the bank-rate conversion applies to the current selection, and in which currency.
 *
 * Eligible only for a pending line matched in invoice mode against invoices that ALL share one
 * currency other than the account's. A mixed selection (two foreign currencies, or a foreign and a
 * same-currency invoice) has no single rate to derive, so it keeps the invoice-rate behavior.
 *
 * @param {object} args
 * @param {boolean} args.invoiceMode
 * @param {boolean} args.isReconciledLine
 * @param {Array<object>} args.invoices the SELECTED invoice candidates
 * @param {string} args.accountCurrency the financial account's ISO code
 * @param {number} args.lineAmount the signed pending amount of the line
 * @returns {{ eligible: boolean, invoiceCurrency: string|null }}
 */
export function conversionEligibility({
  invoiceMode, isReconciledLine, invoices, accountCurrency, lineAmount,
}) {
  const none = { eligible: false, invoiceCurrency: null };
  if (!invoiceMode || isReconciledLine || !(Number(lineAmount) || 0)) return none;
  if (!invoices?.length) return none;
  const invoiceCurrency = invoices[0].currency;
  if (!invoiceCurrency || invoiceCurrency === accountCurrency) return none;
  if (!invoices.every((c) => c.currency === invoiceCurrency)) return none;
  return { eligible: true, invoiceCurrency };
}

/**
 * Spreads an amount to pay over the invoices the way the backend allocates it: in the given
 * (request) order, each invoice taking `min(left, outstanding)`.
 *
 * @param {Array<object>} invoices in request order
 * @param {number|null} actual
 * @returns {number[]} the amount paid to each invoice, same order
 */
export function allocateGreedy(invoices, actual) {
  let left = toNumberOrNull(actual) ?? 0;
  return (invoices || []).map((c) => {
    const pay = Math.max(0, Math.min(left, outstandingOf(c)));
    left = roundHalfUp(left - pay, NOISE_DECIMALS);
    return pay;
  });
}

/** `converted / actual` at {@link RATE_DECIMALS}, or null when either side is unusable. */
function deriveRate(converted, actual) {
  if (converted == null || actual == null || actual <= 0) return null;
  return roundHalfUp(converted / actual, RATE_DECIMALS);
}

/** `actual × rate` at {@link AMOUNT_DECIMALS}, or null when either side is unusable. */
function deriveConverted(actual, rate) {
  if (actual == null || rate == null) return null;
  return roundHalfUp(actual * rate, AMOUNT_DECIMALS);
}

/**
 * Classic parity defaults: pay everything outstanding, book exactly what the bank sent, and let the
 * rate follow (27,87 € / 40,91 USD → 0,681252).
 *
 * @param {{ outstanding: number, lineAbs: number }} args
 * @returns {ConversionState}
 */
export function conversionDefaults({ outstanding, lineAbs }) {
  const actual = toNumberOrNull(outstanding);
  const converted = toNumberOrNull(lineAbs);
  return {
    actual,
    rate: deriveRate(converted, actual),
    rateText: null,
    converted,
    anchor: 'converted',
  };
}

/**
 * Whether an edited value can drive the other two fields. A blank, zero or negative figure cannot:
 * deriving from it would blank or corrupt a field the user did not touch, so the edit only updates
 * its own field — which alone shows the error — and the other two keep their last values. It also
 * keeps a half-typed `0` (on the way to `0,68`) from flickering the other fields.
 */
function isUsable(value) {
  return value != null && value > 0;
}

/**
 * The user edited the amount to pay. The anchor decides what follows: a converted amount still
 * pinned to the statement keeps its value and the rate is re-derived (Classic); a rate the user
 * chose keeps its value and the converted amount is recomputed.
 *
 * The amount is rounded HALF_UP to {@link AMOUNT_DECIMALS} first, so the derived figures, the
 * idle display and the payload all use the same number (40,905 → 40,91). An unusable amount
 * (blank, zero, negative) keeps the rate and the converted amount, and the anchor, so the next
 * valid amount derives exactly as it would have.
 *
 * @param {ConversionState} state
 * @param {number|null} actual
 * @returns {ConversionState}
 */
export function onActualEdit(state, actual) {
  const next = roundHalfUp(actual, AMOUNT_DECIMALS);
  if (!isUsable(next)) return { ...state, actual: next };
  if (state.anchor === 'rate') {
    return { ...state, actual: next, converted: deriveConverted(next, state.rate) };
  }
  return { ...state, actual: next, rate: deriveRate(state.converted, next), rateText: null };
}

/**
 * The user typed a rate: the converted amount follows, and the rate becomes the anchor. The typed
 * text is kept verbatim for the payload.
 *
 * An unusable rate (blank, zero, negative) keeps the converted amount and the amount. The converted
 * amount becomes the anchor meanwhile — the rate has nothing to offer — so a later amount edit
 * re-derives the rate from it instead of blanking the converted amount.
 *
 * @param {ConversionState} state
 * @param {number|null} rate
 * @param {string|null} [rateText] the clean dot-decimal text the user typed
 * @returns {ConversionState}
 */
export function onRateEdit(state, rate, rateText = null) {
  const next = toNumberOrNull(rate);
  const text = next == null ? null : rateText;
  if (!isUsable(next)) return { ...state, rate: next, rateText: text, anchor: 'converted' };
  return {
    ...state,
    rate: next,
    rateText: text,
    converted: deriveConverted(state.actual, next),
    anchor: 'rate',
  };
}

/**
 * The user typed the converted amount: the rate follows, and the converted amount is the anchor
 * again.
 *
 * An unusable converted amount (blank, zero, negative) keeps the last rate and the amount, so only
 * the field the user changed is in error. The rate becomes the anchor meanwhile — it is the only
 * figure left to derive from — so a later amount edit recomputes the converted amount instead of
 * blanking the rate too.
 *
 * @param {ConversionState} state
 * @param {number|null} converted
 * @returns {ConversionState}
 */
export function onConvertedEdit(state, converted) {
  const next = toNumberOrNull(converted);
  if (!isUsable(next)) return { ...state, converted: next, anchor: 'rate' };
  return {
    ...state,
    converted: next,
    rate: deriveRate(next, state.actual),
    rateText: null,
    anchor: 'converted',
  };
}

/**
 * Field-level validity. `converted` is bounded by the line STRICTLY (no tolerance): Core would book
 * any excess as a remainder of the opposite sign.
 *
 * @param {ConversionState} state
 * @param {{ outstanding: number, lineAbs: number }} bounds
 * @returns {{ valid: boolean, actualInvalid: boolean, rateInvalid: boolean,
 *   convertedInvalid: boolean }}
 */
export function validateConversion(state, { outstanding, lineAbs }) {
  const { actual, rate, converted } = state;
  const actualInvalid = actual == null || actual <= 0
    || roundHalfUp(actual, NOISE_DECIMALS) > roundHalfUp(outstanding, NOISE_DECIMALS);
  // A rate of exactly 1 is legitimate here (a pegged pair, converted == amount): the backend only
  // treats the rate as advisory when `convertedAmount` is sent, and this modal always sends it.
  const rateInvalid = rate == null || rate <= 0;
  const roundedConverted = roundHalfUp(converted, AMOUNT_DECIMALS);
  const convertedInvalid = roundedConverted == null || roundedConverted <= 0
    || roundedConverted > roundHalfUp(lineAbs, AMOUNT_DECIMALS);
  return {
    valid: !actualInvalid && !rateInvalid && !convertedInvalid,
    actualInvalid,
    rateInvalid,
    convertedInvalid,
  };
}

/**
 * The account-currency value, at each invoice's OWN rate, of what this payment settles. The amount
 * to pay is spread over the invoices the way the backend allocates it — in the given (request)
 * order, each taking `min(left, outstanding)` — and each share is rounded like the `amountBase`
 * the candidate row shows. With the default (everything paid) it is Σ `amountBase`.
 *
 * @param {Array<object>} invoices in request order
 * @param {number} actual
 * @returns {number|null} null when a candidate has no usable rate (see knownRate)
 */
export function invoiceRateEquivalent(invoices, actual) {
  const pays = allocateGreedy(invoices, actual);
  let total = 0;
  for (const [i, c] of (invoices || []).entries()) {
    const rate = knownRate(c);
    if (rate == null) return null;
    total += roundHalfUp(pays[i] * rate, AMOUNT_DECIMALS);
  }
  return roundHalfUp(total, AMOUNT_DECIMALS);
}

/**
 * The realized exchange difference Core's accounting will book: what the bank paid minus what the
 * settled amount was worth at the invoices' rate (+0,04 € in the 27,87 € / 40,91 USD example).
 *
 * @param {ConversionState} state
 * @param {Array<object>} invoices in request order
 * @returns {number|null} null when it cannot be computed (missing rate, empty field)
 */
export function fxDifference(state, invoices) {
  if (state.converted == null || state.actual == null) return null;
  const equivalent = invoiceRateEquivalent(invoices, state.actual);
  if (equivalent == null) return null;
  return roundHalfUp(state.converted - equivalent, AMOUNT_DECIMALS);
}

/**
 * Names an exchange difference as the GAIN or LOSS Core's accounting will book. The sign alone does
 * not say which: on a receipt, collecting more account currency than the invoices were worth is a
 * gain; on a payment, paying more account currency than they were worth is a loss.
 *
 * @param {number|null} difference converted − invoice-rate value, signed (see {@link fxDifference})
 * @param {boolean} isReceipt the statement line is a receipt (amount ≥ 0)
 * @returns {{ kind: 'gain'|'loss', amount: number }|null} the unsigned amount, or null when the
 *   difference is unknown or negligible
 */
export function fxOutcome(difference, isReceipt) {
  if (difference == null || isNegligibleAmount(difference)) return null;
  const moreThanWorth = difference > 0;
  return { kind: moreThanWorth === isReceipt ? 'gain' : 'loss', amount: Math.abs(difference) };
}

/**
 * The part of the line this conversion leaves unreconciled, in the account currency (0 when the
 * converted amount covers the line, or exceeds it — that case is invalid anyway).
 *
 * @param {ConversionState} state
 * @param {number} lineAbs
 * @returns {number}
 */
export function remainderAmount(state, lineAbs) {
  const converted = roundHalfUp(state.converted, AMOUNT_DECIMALS);
  if (converted == null) return 0;
  const left = roundHalfUp(lineAbs - converted, AMOUNT_DECIMALS);
  return left >= NEGLIGIBLE ? left : 0;
}

/** True when an amount is too small to be worth showing. */
export function isNegligibleAmount(amount) {
  return Math.abs(Number(amount) || 0) < NEGLIGIBLE;
}

/**
 * The typed rate as a strict unsigned dot-decimal, or null. The mask's clean value can still be
 * mid-typing (`0.` or `.5`); both are completed rather than sent half-written.
 */
function normalizeTypedRate(text) {
  if (!text) return null;
  let t = String(text).trim();
  if (t.endsWith('.')) t = t.slice(0, -1);
  if (t.startsWith('.')) t = `0${t}`;
  return /^\d+(?:\.\d+)?$/.test(t) ? t : null;
}

/**
 * The three top-level `reconcileGroup` fields: unsigned dot-decimal strings (the line carries the
 * sign). The rate goes verbatim when the user typed it, so the backend can try it first.
 *
 * @param {ConversionState} state
 * @returns {{ actualPayment: string, conversionRate: string, convertedAmount: string }}
 */
export function conversionPayloadFields(state) {
  return {
    actualPayment: decimalString(Math.abs(state.actual)),
    conversionRate: normalizeTypedRate(state.rateText) ?? decimalString(Math.abs(state.rate)),
    convertedAmount: decimalString(Math.abs(roundHalfUp(state.converted, AMOUNT_DECIMALS))),
  };
}

/**
 * @typedef {object} ConversionState
 * @property {number|null} actual amount to pay, invoice currency
 * @property {number|null} rate invoice → account rate
 * @property {string|null} rateText the rate exactly as typed (clean dot-decimal), null if derived
 * @property {number|null} converted amount booked on the bank, account currency
 * @property {'converted'|'rate'} anchor which of rate / converted holds when `actual` changes
 */
