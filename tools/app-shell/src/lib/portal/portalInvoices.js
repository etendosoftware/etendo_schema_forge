// Relative, not the `@/` alias: this module must stay loadable by the plain `node --test`
// suite that covers `src/lib/`, which has no Vite alias resolution. Same reason
// `formatSigned.js` and `formatCurrency.js` reach their siblings this way.
import { getCalendarDateRelation } from '../dateOnly.js';

/**
 * Presentation logic for the portal's invoice list (ETP-5267) — pure, no React, no DOM.
 *
 * It lives beside the portal's API client rather than inside `PortalPage` so the two rules a
 * BP would notice first (is this invoice settled, and what does the downloaded file get
 * called) can be asserted directly, without rendering a page.
 */

/**
 * Half a cent. Outstanding amounts arrive as JSON numbers, so an invoice that is settled to
 * the last cent can still come back as `0.000000001` after currency conversion or rounding
 * upstream; comparing against `0` exactly would show it as unpaid forever.
 */
const SETTLED_EPSILON = 0.005;

/**
 * The four states an invoice can present, each mapped to a generic label key and to a
 * `StatusTag` tone.
 *
 * Three of the four labels are EXISTING keys, which matters beyond tidiness: `useUI()` echoes
 * the raw key when the active locale has no entry for it (there is no locale-to-locale
 * fallback in `LocaleProvider`), so a key that already ships in en_US, es_ES and es_AR is a
 * key that cannot leak an identifier onto a customer's screen.
 *
 * The fourth is new. The obvious candidate to reuse, `statusPartiallyExecuted`, reads
 * "Partially executed" in English — right for a process, wrong for a bill — so the portal
 * declares `portalInvoicePartiallyPaid` and keeps the Spanish wording ("Pago parcial") that
 * key already had.
 */
export const PORTAL_INVOICE_STATUS = Object.freeze({
  paid: { id: 'paid', labelKey: 'statusPaid', tone: 'success' },
  overdue: { id: 'overdue', labelKey: 'statusOverdue', tone: 'destructive' },
  partiallyPaid: { id: 'partiallyPaid', labelKey: 'portalInvoicePartiallyPaid', tone: 'warning' },
  pending: { id: 'pending', labelKey: 'statusPending', tone: 'neutral' },
});

/**
 * Which state to show for one invoice, or `null` when the backend sent no outstanding amount
 * for it (in which case the row shows no tag rather than guessing "pending").
 *
 * Overdue outranks partially-paid deliberately: an invoice that is half paid AND past its due
 * date is overdue, and that is the fact the reader has to act on.
 *
 * The due date is compared through `getCalendarDateRelation`, which parses the `yyyy-MM-dd`
 * value with the LOCAL-time constructor. A bare `new Date('2026-08-10')` would parse as UTC
 * midnight and read as "past" for the whole of its own due date under any negative UTC offset
 * (ETP-4031, ETP-4850) — i.e. it would tell a BP in Buenos Aires that a bill due today is
 * already late.
 *
 * @param {{ outstandingAmount: number|null, grandTotalAmount: number|null, dueDate: string|null }} invoice
 * @param {Date} [reference] today, injectable so the boundary is testable
 * @returns {{ id: string, labelKey: string, tone: string }|null}
 */
export function resolveInvoiceStatus(invoice, reference = new Date()) {
  const outstanding = invoice?.outstandingAmount;
  if (!Number.isFinite(outstanding)) return null;
  if (Math.abs(outstanding) < SETTLED_EPSILON) return PORTAL_INVOICE_STATUS.paid;
  if (getCalendarDateRelation(invoice?.dueDate, reference) === 'past') {
    return PORTAL_INVOICE_STATUS.overdue;
  }
  const total = invoice?.grandTotalAmount;
  if (Number.isFinite(total) && outstanding < Math.abs(total) - SETTLED_EPSILON) {
    return PORTAL_INVOICE_STATUS.partiallyPaid;
  }
  return PORTAL_INVOICE_STATUS.pending;
}

/**
 * File name for a downloaded invoice PDF.
 *
 * Etendo document numbers routinely contain a slash (`FV/0001`), which a browser reads as a
 * path separator in the `download` attribute and silently truncates the saved name to its last
 * segment. Every character outside a conservative safe set is therefore folded to `-`.
 *
 * @param {{ documentNo: string|null, id: string|null }} invoice
 */
export function portalPdfFileName(invoice) {
  const raw = invoice?.documentNo || invoice?.id || 'invoice';
  const safe = String(raw).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'invoice'}.pdf`;
}
