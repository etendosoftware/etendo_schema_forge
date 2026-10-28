/**
 * Decision rule for carrying an order's global discount (`etgoTotalDiscount`, a percentage) into
 * an invoice when its lines are imported with the "Add from order" popup (ETP-5828).
 *
 * Shared by the sales-invoice and purchase-invoice import modals. Pure: no React, no I/O, so it
 * can be evaluated on every selection change and covered with plain `node --test`.
 *
 * Inputs:
 *  - `selectedOrders`: one entry per order that owns at least one selected line,
 *    `{ docNo, pct }`. An order without a global discount carries `pct = 0`.
 *  - `invoicePct`: the invoice header's current `etgoTotalDiscount` (null / 0 = none).
 *  - `invoiceHasLines`: the invoice already has (visible) lines.
 *  - `invoiceStateKnown`: `false` when the invoice header or its lines could not be read. The
 *    invoice % and lines are then unknown, so the outcome is always `none`: nothing is offered and
 *    nothing is PATCHed, because an unread % could be overwritten and unread lines discounted.
 *
 * Outcomes (`kind`):
 *  - `none`            — nothing to show (no selection, invoice state unknown, or every order at
 *                        0 % and no invoice %).
 *  - `mixed`           — the selected orders carry different global discounts (warning).
 *  - `invoiceMismatch` — the invoice already has a % that differs from the orders' one, including
 *                        orders at 0 % (warning).
 *  - `invoiceHasLines` — the invoice has no % but already has lines; applying the orders' % would
 *                        also discount them (warning).
 *  - `carry`           — the orders' % can be carried (toggle). `matchesInvoice` tells whether the
 *                        invoice already holds that same %.
 *
 * A warning never blocks the import, and line discounts are never modified.
 */

const PCT_PRECISION = 1e4;

/**
 * Normalizes a raw percentage into a finite, non-negative number rounded to 4 decimals, so two
 * values that differ only by float noise compare equal. Null / blank / non-numeric → 0.
 *
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
export function normalizeGlobalDiscountPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * PCT_PRECISION) / PCT_PRECISION;
}

/**
 * @param {object} input
 * @param {Array<{docNo: string, pct: number|string|null}>} input.selectedOrders
 * @param {number|string|null} input.invoicePct
 * @param {boolean} input.invoiceHasLines
 * @param {boolean} [input.invoiceStateKnown] `false` = invoice header or lines unread
 * @returns {{kind: 'none'}
 *   | {kind: 'mixed', orders: Array<{docNo: string, pct: number}>, invoicePct: number}
 *   | {kind: 'invoiceMismatch', pct: number, invoicePct: number}
 *   | {kind: 'invoiceHasLines', pct: number, invoicePct: number}
 *   | {kind: 'carry', pct: number, invoicePct: number, matchesInvoice: boolean}}
 */
export function resolveOrderGlobalDiscount({ selectedOrders, invoicePct, invoiceHasLines, invoiceStateKnown }) {
  if (invoiceStateKnown === false) return { kind: 'none' };
  const orders = (selectedOrders || []).map(o => ({ docNo: o.docNo, pct: normalizeGlobalDiscountPct(o.pct) }));
  const invPct = normalizeGlobalDiscountPct(invoicePct);
  if (orders.length === 0) return { kind: 'none' };

  const distinct = [...new Set(orders.map(o => o.pct))];
  if (distinct.length > 1) return { kind: 'mixed', orders, invoicePct: invPct };

  const pct = distinct[0];
  if (pct === 0 && invPct === 0) return { kind: 'none' };
  if (invPct > 0 && pct !== invPct) return { kind: 'invoiceMismatch', pct, invoicePct: invPct };
  if (invPct === 0 && invoiceHasLines) return { kind: 'invoiceHasLines', pct, invoicePct: invPct };
  return { kind: 'carry', pct, invoicePct: invPct, matchesInvoice: invPct === pct };
}

/**
 * Whether the import carries the orders' global discount: the toggle is offered and ON.
 *
 * @param {ReturnType<typeof resolveOrderGlobalDiscount>} decision
 * @param {boolean} carryOn the toggle state
 * @returns {boolean}
 */
export function isCarryingGlobalDiscount(decision, carryOn) {
  return decision?.kind === 'carry' && !!carryOn;
}

/**
 * Whether the invoice header must be PATCHed with the orders' %: only when carrying and the
 * invoice has no % yet. When the invoice already holds the same %, nothing is written; every
 * other outcome leaves the header untouched.
 *
 * @param {ReturnType<typeof resolveOrderGlobalDiscount>} decision
 * @param {boolean} carryOn the toggle state
 * @returns {boolean}
 */
export function shouldPatchInvoiceGlobalDiscount(decision, carryOn) {
  return isCarryingGlobalDiscount(decision, carryOn) && decision.invoicePct === 0;
}
