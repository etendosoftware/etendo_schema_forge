// Relative imports, not the `@/` alias: keeps this module loadable by plain `node --test`.
import { resolveInvoicePaymentBadge } from '../../windows/custom/shared/invoicePaymentBadge.js';
import { getCalendarDateRelation, todayCalendarISO } from '../../lib/dateOnly.js';
import { isCompletedStatus, isNotApprovedStatus } from '../../lib/docStatus.js';

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

/**
 * The list tabs per kind (design Listado: "Todos / Por responder / Aceptados / Rechazados"): the
 * customer-facing status groups the backend defines (`PortalDocumentQuery.GROUPS`), each with its
 * label. "All" is the implicit first tab. The mapping is recorded in the plan (§B.4). Labels are
 * the app's own status keys (PO answer: the same status names as the app), the ones its badges
 * use; only "delivered" keeps a portal key, as the app has no status of that name.
 */
export const PORTAL_KIND_GROUPS = Object.freeze({
  QUOTATION: [
    { code: 'awaiting', labelKey: 'statusUnderEvaluation' },
    { code: 'accepted', labelKey: 'statusAccepted' },
    { code: 'rejected', labelKey: 'statusRejected' },
  ],
  ORDER: [
    { code: 'inProgress', labelKey: 'statusInProcess' },
    { code: 'completed', labelKey: 'statusComplete' },
    { code: 'voided', labelKey: 'statusVoid' },
  ],
  SHIPMENT: [
    { code: 'delivered', labelKey: 'portalGroupDelivered' },
    { code: 'voided', labelKey: 'statusVoid' },
  ],
  INVOICE: [
    { code: 'pending', labelKey: 'statusPending' },
    { code: 'overdue', labelKey: 'statusOverdue' },
    { code: 'paid', labelKey: 'statusPaid' },
  ],
});

/** Whether `group` is one of `kind`'s tabs. */
export function isPortalGroup(kind, group) {
  return Boolean(group) && (PORTAL_KIND_GROUPS[kind] ?? []).some((g) => g.code === group);
}

/**
 * The "Requiere tu atención" tiles: the figure each kind calls out (the backend's `highlight`),
 * its badge, and the list tab a click opens — the same set, so the tile and the tab agree.
 */
export const PORTAL_HIGHLIGHTS = Object.freeze({
  awaitingAnswer: { labelKey: 'portalHighlightAwaitingAnswer', tone: 'info', group: 'awaiting' },
  overdue: { labelKey: 'portalHighlightOverdue', tone: 'destructive', group: 'overdue' },
  inProgress: { labelKey: 'portalHighlightInProgress', tone: 'warning', group: 'inProgress' },
  thisMonth: { labelKey: 'portalHighlightThisMonth', tone: 'neutral', group: null },
});

/**
 * A quotation's "Válido hasta" as the design draws it: a dot while the customer can still answer
 * (`UE`/`CO`) — the foreground colour, or the destructive one once the date is past — and plain
 * muted text once answered. `null` when the quotation has no validity date.
 *
 * @returns {{ state: 'open'|'expired'|'answered' }|null}
 */
export function quotationValidity(document) {
  if (document?.kind !== 'QUOTATION' || !document.validUntil) return null;
  const open = isNotApprovedStatus(document.documentStatus) || isCompletedStatus(document.documentStatus);
  if (!open) return { state: 'answered' };
  return { state: getCalendarDateRelation(document.validUntil) === 'past' ? 'expired' : 'open' };
}

/**
 * Whether the portal offers "Aceptar" (ETP-6209 Part C, PO answer to Q1: a confirmed accept moves
 * the quotation to `ETGO_AC` "Aceptado", still convertible in the app). Kept as a switch with the
 * backend's `PortalDecisionService.ACCEPT_AVAILABLE` (reported as `decision.acceptAvailable`);
 * the button shows only when both are on.
 */
export const PORTAL_ACCEPT_ENABLED = true;

/** The fixed reject reasons (PO spec), with the API codes; "Otros" requires a text. */
export const PORTAL_REJECT_REASONS = Object.freeze([
  { code: 'PRICE', labelKey: 'portalRejectReasonPrice' },
  { code: 'DELIVERY', labelKey: 'portalRejectReasonDelivery' },
  { code: 'PAYMENT_TERMS', labelKey: 'portalRejectReasonPaymentTerms' },
  { code: 'OTHER_SUPPLIER', labelKey: 'portalRejectReasonOtherSupplier' },
  { code: 'NOT_NEEDED', labelKey: 'portalRejectReasonNotNeeded' },
  { code: 'OTHER', labelKey: 'portalRejectReasonOther' },
]);

/** The reject reason that requires a text. */
export const PORTAL_REJECT_REASON_OTHER = 'OTHER';

/** The singular label key of one document, telling a credit note from an invoice. */
export function documentLabelKey(document) {
  if (document?.kind === 'INVOICE' && document?.isCreditNote) return 'portalKindCreditNote';
  return PORTAL_KIND_META[document?.kind]?.singularKey ?? 'portalKindInvoice';
}

/**
 * The payment state of an invoice as the app shows it.
 *
 * Source of truth, since no shared helper maps a payment badge to a tag (each window renders its
 * own): the states come from `resolveInvoicePaymentBadge` (`windows/custom/shared/
 * invoicePaymentBadge.js`), and the labels are the ones the sales invoice topbar uses for them
 * (`artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`: `statusPaid`, `statusPartial`,
 * `statusPending`, `statusOverdue`, `cpFavorBadge`, `cpCreditFullyApplied`), with the app's
 * `StatusTag` tones.
 *
 * **Overdue is decided like the app, in the browser's calendar day** (ETP-6209 review N-b):
 * - with the instalments (the document detail), like the topbar — overdue when any instalment
 *   still owing money is past due (`getCalendarDateRelation`, local-day parsing);
 * - without them (lists, home, related), like the invoice list grid — the badge shows no overdue,
 *   and the due-date column's dot (`getDueDateState`) carries it.
 *
 * @param {object} document a portal document
 * @param {Array<{dueDate: string, outstandingAmount: number}>} [installments] the detail's
 *   instalments, when known
 * @returns {{ id: string, labelKey: string, tone: string }|null} null when not an invoice
 */
export function invoicePaymentState(document, installments = null, { useServerOverdue = false } = {}) {
  if (document?.kind !== 'INVOICE') return null;
  const badge = resolveInvoicePaymentBadge({
    grandTotalAmount: document.grandTotal,
    outstandingAmount: document.outstandingAmount,
    documentStatus: document.documentStatus,
  });
  if (badge.kind === 'draft') return null;
  // `useServerOverdue` — the home's "Documentos recientes" ONLY (design Main shows "Vencida"
  // there): recent rows carry no instalments, so the row's server `overdue` flag (an instalment
  // past due with money owed, server day) stands in for them. The lists keep the app grid's rule
  // (no overdue badge, the due-date dot carries it).
  const overdue = (useServerOverdue && document.overdue === true)
    || (Array.isArray(installments) && installments.some((installment) => (
      (installment.outstandingAmount ?? 0) > 0
        && getCalendarDateRelation(installment.dueDate) === 'past')));
  if (!badge.isCredit && overdue && (badge.kind === 'pending' || badge.kind === 'partial')) {
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
 * The default list range (decision D-2, the ticket's "el listado por defecto muestra el último
 * mes"): the rolling last month, today − 1 month … today, as the `{ from, to }` value
 * `DateRangePopover` takes. The day is clamped to the target month's length (31 Mar → 28/29 Feb),
 * like `presetBounds`' last3m/last6m.
 */
export function defaultPortalRange(reference = new Date()) {
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const lastDayOfTarget = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const from = new Date(today.getFullYear(), today.getMonth() - 1,
    Math.min(today.getDate(), lastDayOfTarget));
  return { from, to: today };
}

/**
 * The range a list opens with: the rolling last month (D-2), unless the link that opened it names
 * a status group. A group link — a home tile ("Por responder", "Vencidas", "En curso") or "Ver
 * facturas pendientes" — asks for everything in that state, which may be older than a month, so it
 * opens on all time (`null`). Either way the customer can pick any other range.
 */
export function initialPortalRange(group, reference = new Date()) {
  return group ? null : defaultPortalRange(reference);
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
 * - `{ view: 'list', kind, group? }` — `group` one of the kind's tabs ({@link PORTAL_KIND_GROUPS})
 * - `{ view: 'doc', kind, id, group? }` — `group`: the list tab the document was opened from
 */
export function readPortalView(searchParams) {
  const view = searchParams.get('view');
  // Case-insensitive, so a hand-written `?view=list&kind=quotation` works like the `QUOTATION`
  // this page writes.
  const kind = searchParams.get('kind')?.toUpperCase() ?? null;
  const id = searchParams.get('id');
  const group = searchParams.get('group');
  if (view === 'list' && PORTAL_KIND_META[kind]) {
    return isPortalGroup(kind, group) ? { view: 'list', kind, group } : { view: 'list', kind };
  }
  // A document keeps the list tab it was opened from (the list stays underneath it on desktop).
  if (view === 'doc' && PORTAL_KIND_META[kind] && id) {
    return isPortalGroup(kind, group) ? { view: 'doc', kind, id, group } : { view: 'doc', kind, id };
  }
  if (view === 'home') return { view: 'home' };
  return null;
}

/** The search string of a view (see {@link readPortalView}): view, kind, id and group only. */
export function writePortalView(target) {
  const params = new URLSearchParams();
  params.set('view', target.view);
  if (target.kind) params.set('kind', target.kind);
  if (target.id) params.set('id', target.id);
  if (target.group) params.set('group', target.group);
  return params;
}
