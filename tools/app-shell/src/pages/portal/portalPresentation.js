// Relative imports, not the `@/` alias: keeps this module loadable by plain `node --test`.
import { resolveInvoicePaymentBadge } from '../../windows/custom/shared/invoicePaymentBadge.js';
import { todayCalendarISO } from '../../lib/dateOnly.js';

/**
 * Presentation rules of the customer portal (ETP-6209 Part B) — pure, no React.
 *
 * Statuses and payment states are the app's own: document status through `statusLabel` /
 * `DocumentStatusPill` (`lib/statusBadge.js`), invoice payment through
 * `resolveInvoicePaymentBadge` (`windows/custom/shared/invoicePaymentBadge.js`), the due-date dot
 * through `getDueDateState` (`lib/invoiceDueDate.js`). Nothing here invents a status of its own.
 */

/** Per kind: the i18n keys a view names it with, and the list's date column. */
export const PORTAL_KIND_META = Object.freeze({
  QUOTATION: {
    singularKey: 'portalKindQuotation',
    pluralKey: 'portalKindQuotationPlural',
    dateColumnKey: 'portalColQuotationDate',
  },
  ORDER: {
    singularKey: 'portalKindOrder',
    pluralKey: 'portalKindOrderPlural',
    dateColumnKey: 'portalColOrderDate',
  },
  SHIPMENT: {
    singularKey: 'portalKindShipment',
    pluralKey: 'portalKindShipmentPlural',
    dateColumnKey: 'portalColShipmentDate',
  },
  INVOICE: {
    singularKey: 'portalKindInvoice',
    pluralKey: 'portalKindInvoicePlural',
    dateColumnKey: 'portalColInvoiceDate',
  },
});

/** The singular label key of one document, telling a credit note from an invoice. */
export function documentLabelKey(document) {
  if (document?.kind === 'INVOICE' && document?.isCreditNote) return 'portalKindCreditNote';
  return PORTAL_KIND_META[document?.kind]?.singularKey ?? 'portalKindInvoice';
}

/**
 * The payment state of an invoice row as the app shows it, plus overdue.
 *
 * `resolveInvoicePaymentBadge` decides paid / partial / pending / credit; an invoice the backend
 * reports with an instalment past due and money still owed is shown as overdue, exactly the
 * priority the invoice topbar gives it (`InvoiceTopbarExtra`: overdue before partial).
 *
 * @returns {{ id: string, labelKey: string, tone: string }|null} null when not an invoice
 */
export function invoicePaymentState(document) {
  if (document?.kind !== 'INVOICE') return null;
  const badge = resolveInvoicePaymentBadge({
    grandTotalAmount: document.grandTotal,
    outstandingAmount: document.outstandingAmount,
    documentStatus: document.documentStatus,
  });
  if (badge.kind === 'draft') return null;
  if (!badge.isCredit && document.overdue && (badge.kind === 'pending' || badge.kind === 'partial')) {
    return { id: 'overdue', labelKey: 'statusOverdue', tone: 'destructive' };
  }
  switch (badge.kind) {
    case 'paid':
      return { id: 'paid', labelKey: 'statusPaid', tone: 'success' };
    case 'partial':
      return { id: 'partial', labelKey: 'statusPartial', tone: 'warning' };
    case 'credit-available':
      return { id: 'credit-available', labelKey: 'cpFavorBadge', tone: 'info' };
    case 'credit-applied':
      return { id: 'credit-applied', labelKey: 'cpCreditFullyApplied', tone: 'success' };
    default:
      return { id: 'pending', labelKey: 'statusPending', tone: 'neutral' };
  }
}

/**
 * The default list range (decision D-2): the rolling last month, today − 1 month … today, as the
 * `{ from, to }` value `DateRangePopover` takes. The day is clamped to the target month's length
 * (31 Mar → 28/29 Feb), like `presetBounds`' last3m/last6m.
 */
export function defaultPortalRange(reference = new Date()) {
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const lastDayOfTarget = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const from = new Date(today.getFullYear(), today.getMonth() - 1,
    Math.min(today.getDate(), lastDayOfTarget));
  return { from, to: today };
}

/** A local `Date` as the `yyyy-MM-dd` calendar day the API expects. */
export function toCalendarParam(date) {
  return date instanceof Date ? todayCalendarISO(date) : null;
}

/**
 * The portal's view, read from and written to the URL search string. The token is in the path
 * (`/portal/:token`) and never here.
 *
 * - `{ view: 'home' }`
 * - `{ view: 'list', kind }`
 * - `{ view: 'doc', kind, id }`
 */
export function readPortalView(searchParams) {
  const view = searchParams.get('view');
  const kind = searchParams.get('kind');
  const id = searchParams.get('id');
  if (view === 'list' && PORTAL_KIND_META[kind]) return { view: 'list', kind };
  if (view === 'doc' && PORTAL_KIND_META[kind] && id) return { view: 'doc', kind, id };
  if (view === 'home') return { view: 'home' };
  return null;
}

/** The search string of a view (see {@link readPortalView}). */
export function writePortalView(target) {
  const params = new URLSearchParams();
  params.set('view', target.view);
  if (target.kind) params.set('kind', target.kind);
  if (target.id) params.set('id', target.id);
  return params;
}
