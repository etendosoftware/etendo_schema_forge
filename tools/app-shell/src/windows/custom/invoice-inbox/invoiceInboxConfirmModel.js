/**
 * ETP-6051 — pure rules of the Invoice Inbox confirm (no React, no `@/` imports, so plain
 * `node --test` can cover them): what the batch dialog shows, the numbering range of the result
 * toast, and the toast text itself.
 */
import { CONFIRM_SEVERAL_KEY, confirmReasonKey } from './invoiceInboxMessages.js';
import { isConfirmableRow, STATUS } from './invoiceInboxFilters.js';

const ISO_CODE = /^[A-Z]{3}$/;
/** Amounts are added in integer micro-units so 0.1 + 0.2 never shows as 0.30000000000000004. */
const MICRO = 1e6;
/** Numbers listed in the toast when they are not one contiguous run. */
export const TOAST_LISTED_NUMBERS = 5;

/**
 * The ISO currency code of a list row: the `currency` column as a code, else its identifier
 * (`currency$_identifier`, the ISO code for a currency), else an object's `isoCode`; null when the
 * row carries none (the caller falls back to the organization currency).
 */
export function rowCurrencyCode(row) {
  const raw = row?.currency;
  if (typeof raw === 'string' && ISO_CODE.test(raw)) return raw;
  if (raw && typeof raw === 'object' && typeof raw.isoCode === 'string') return raw.isoCode;
  const identifier = row?.['currency$_identifier'];
  return typeof identifier === 'string' && ISO_CODE.test(identifier.trim()) ? identifier.trim() : null;
}

/** `totalMismatch` of a list row or a confirm answer: Y / true is true; empty, null and anything else false. */
export function isTotalMismatch(value) {
  return value === true || value === 'Y' || value === 'true';
}

function microUnits(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * MICRO) : 0;
}

/**
 * What the confirm dialog shows for the selected `rows` (batch bar or one row):
 * `confirmable` the rows that will be sent, `skipped` how many cannot be confirmed (statuses other
 * than PENDING_REVIEW / READY, and an ERROR that is not a failed confirm), `totals` the total per
 * currency (one entry normally, in order of first appearance), `newProducts` the sum of the rows'
 * `newProducts`.
 *
 * @param {object[]} rows
 * @param {string} [fallbackCurrency] currency of a row that carries none (the organization's)
 * @returns {{confirmable: object[], skipped: number, totals: {currency: string, amount: number}[],
 *   newProducts: number}}
 */
export function summarizeConfirm(rows, fallbackCurrency = '') {
  const confirmable = (rows ?? []).filter(isConfirmableRow);
  const sums = new Map();
  let newProducts = 0;
  let mismatches = 0;
  for (const row of confirmable) {
    if (isTotalMismatch(row.totalMismatch)) mismatches += 1;
    const currency = rowCurrencyCode(row) ?? fallbackCurrency;
    sums.set(currency, (sums.get(currency) ?? 0) + microUnits(row.grandTotalAmount));
    const fresh = Number(row.newProducts);
    if (Number.isFinite(fresh) && fresh > 0) newProducts += fresh;
  }
  return {
    confirmable,
    skipped: (rows ?? []).length - confirmable.length,
    totals: [...sums].map(([currency, micro]) => ({ currency, amount: micro / MICRO })),
    newProducts,
    mismatches,
  };
}

/** `FC1000143` -> `{prefix: 'FC', digits: '1000143'}`; null when the number does not end in digits. */
function splitNumber(documentNo) {
  const text = String(documentNo ?? '');
  // Linear scan (no backtracking regex). Any line terminator yields null, as the old `.` did.
  if (/[\n\r\u2028\u2029]/.test(text)) return null;
  let start = text.length;
  while (start > 0 && text.charCodeAt(start - 1) >= 48 && text.charCodeAt(start - 1) <= 57) start -= 1;
  return start === text.length ? null : { prefix: text.slice(0, start), digits: text.slice(start) };
}

/**
 * The first and last number when `numbers` are one contiguous run (same prefix, same width, each
 * one the previous plus one, in ascending order of creation or not), else null. A number with no
 * trailing digits, or a single number, is never a run.
 */
export function contiguousRange(numbers) {
  if (numbers.length < 2) return null;
  const parts = numbers.map(splitNumber);
  if (parts.some((part) => part === null)) return null;
  const { prefix, digits } = parts[0];
  if (parts.some((part) => part.prefix !== prefix || part.digits.length !== digits.length)) return null;
  const sorted = parts.map((part) => BigInt(part.digits)).sort((a, b) => Number(a - b));
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] !== 1n) return null;
  }
  const pad = (value) => `${prefix}${value.toString().padStart(digits.length, '0')}`;
  return { from: pad(sorted[0]), to: pad(sorted[sorted.length - 1]) };
}

/**
 * The created numbers as toast text: one number as is; a contiguous run as "FC1000143 a FC1000145"
 * (`ui('invoiceInboxConfirmRange')`); anything else as the list of numbers, at most
 * `TOAST_LISTED_NUMBERS` and then an ellipsis. Empty when there are none.
 */
export function numberingText(numbers, ui) {
  const list = numbers.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  const range = contiguousRange(list);
  if (range) return ui('invoiceInboxConfirmRange', range);
  const shown = list.slice(0, TOAST_LISTED_NUMBERS).join(', ');
  return list.length > TOAST_LISTED_NUMBERS ? `${shown}, …` : shown;
}

/** The reason of a failed batch: the stopping one, the shared one, or "several". */
function batchReason(result) {
  if (result.stopped) return result.stopped;
  const codes = new Set(result.failed.map((failure) => failure.code));
  return codes.size === 1 ? result.failed[0] : { reasonKey: CONFIRM_SEVERAL_KEY };
}

function reasonText(reason, ui) {
  return reason.reasonText ?? ui(reason.reasonKey ?? confirmReasonKey(reason.code));
}

/** "2 facturas registradas en Etendo · FC1000143 a FC1000144 · 2 productos creados". */
function successText(result, ui) {
  const okCount = result.ok.length;
  const parts = [okCount === 1
    ? ui('invoiceInboxConfirmedToastOne')
    : ui('invoiceInboxConfirmedToastMany', { count: okCount })];
  const numbers = numberingText(result.ok.map((entry) => entry.documentNo), ui);
  if (numbers) parts.push(numbers);
  const products = result.ok.reduce((sum, entry) => sum + (Number(entry.createdProducts) || 0), 0);
  if (products > 0) {
    parts.push(ui(products === 1 ? 'invoiceInboxConfirmProductsOne' : 'invoiceInboxConfirmProductsMany', { count: products }));
  }
  const mismatches = result.ok.filter((entry) => entry.totalMismatch).length;
  if (mismatches > 0) {
    parts.push(ui(mismatches === 1 ? 'invoiceInboxConfirmMismatchOne' : 'invoiceInboxConfirmMismatchMany', { count: mismatches }));
  }
  return parts.join(' · ');
}

/** "1 could not be confirmed: reason" / "{n} could not be confirmed: reason" and the unsent tail. */
function failureText(failedCount, notSentCount, reason, ui) {
  const parts = [];
  if (failedCount > 0) {
    parts.push(ui(failedCount === 1 ? 'invoiceInboxConfirmPartialOne' : 'invoiceInboxConfirmPartialMany', { failed: failedCount, reason }));
  }
  if (notSentCount > 0) parts.push(ui('invoiceInboxConfirmNotSent', { count: notSentCount }));
  return parts.join('. ');
}

/**
 * The toast of a finished confirm run (pure). `result` is what `runConfirmQueue` returns
 * (`{total, ok: [{id, documentNo, createdProducts…}], failed: [{code, reasonKey|reasonText…}],
 * stopped, notSent: [id]}`); `ui` resolves a `genericLabels` key. Success is green; a run with some
 * success and some failure or unsent documents is a warning that carries both; no success at all is
 * an error. Documents NOT sent after a stop are counted apart from the failed ones ("N sin confirmar").
 *
 * @returns {{tone: 'success'|'warning'|'error', text: string}}
 */
export function confirmToastText(result, ui) {
  const okCount = result.ok.length;
  const failedCount = result.failed.length;
  const notSentCount = (result.notSent ?? []).length;
  if (failedCount === 0 && notSentCount === 0) return { tone: 'success', text: successText(result, ui) };
  const reason = failedCount > 0 ? reasonText(batchReason(result), ui) : '';
  if (okCount === 0) {
    const text = failedCount > 0
      ? [ui('invoiceInboxConfirmFailed', { reason }), failureText(0, notSentCount, reason, ui)].filter(Boolean).join('. ')
      : failureText(0, notSentCount, reason, ui);
    return { tone: failedCount > 0 ? 'error' : 'warning', text };
  }
  return { tone: 'warning', text: `${successText(result, ui)}. ${failureText(failedCount, notSentCount, reason, ui)}` };
}

const PENDING_FOR_NEXT = new Set([STATUS.PENDING_REVIEW, STATUS.READY]);

/**
 * The document the review panel moves to after a confirm: the first row AFTER `currentId`, in the
 * order the list shows, that is still PENDING_REVIEW or READY. Null when there is none (the panel
 * closes). Rows are the ones the page loaded for the current filter.
 */
export function nextPendingRow(rows, currentId) {
  const list = rows ?? [];
  const index = list.findIndex((row) => row.id === currentId);
  if (index < 0) return null;
  return list.slice(index + 1).find((row) => PENDING_FOR_NEXT.has(row.status)) ?? null;
}

/** The run result of ONE confirm made from the review panel, in the shape `confirmToastText` reads. */
export function singleConfirmResult(answer) {
  return {
    total: 1,
    ok: [{
      documentNo: answer?.invoice?.documentNo ?? null,
      createdProducts: Number(answer?.createdProducts) || 0,
      totalMismatch: isTotalMismatch(answer?.totalMismatch),
    }],
    failed: [],
    stopped: null,
    notSent: [],
  };
}
