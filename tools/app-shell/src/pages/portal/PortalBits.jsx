import { useLocaleSwitch, useUI } from '@/i18n';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill.jsx';
import { StatusTag } from '@/components/ui/status-tag';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { getDueDateDotStyle, getDueDateState } from '@/lib/invoiceDueDate.js';
import { invoicePaymentState } from './portalPresentation.js';

/** The viewer's BCP-47 locale, for dates. */
export function usePortalLocale() {
  const { locale } = useLocaleSwitch();
  return (locale || 'es_ES').replace('_', '-');
}

/** A calendar day (`yyyy-MM-dd`), never shifted by the browser's timezone. */
export function PortalDate({ value, testId }) {
  const bcpLocale = usePortalLocale();
  return <span data-testid={testId}>{value ? formatCalendarDate(value, bcpLocale) : '—'}</span>;
}

/** Money through the canonical formatter; a shipment's missing amount renders "—". */
export function PortalMoney({ currency, value, className, testId }) {
  return (
    <span className={className} data-testid={testId}>
      {value == null ? '—' : formatCurrency(currency, value)}
    </span>
  );
}

/** The document status, with the app's own labels and tones (`DocumentStatusPill`). */
export function PortalDocumentStatus({ status }) {
  if (!status) return null;
  return <DocumentStatusPill status={status} showIcon={false} testId="portal-document-status" />;
}

/** An invoice's payment state, as the app shows it (see `invoicePaymentState`). */
export function PortalPaymentStatus({ document, installments = null }) {
  const ui = useUI();
  const state = invoicePaymentState(document, installments);
  if (!state) return null;
  return (
    <span data-testid="portal-payment-status" data-state={state.id}>
      <StatusTag tone={state.tone} label={ui(state.labelKey)} />
    </span>
  );
}

/** The due date with the app's four-state dot (paid / overdue / soon / ok). */
export function PortalDueDate({ document }) {
  if (!document?.dueDate) return <span>—</span>;
  const state = getDueDateState(document.dueDate, document.outstandingAmount);
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="portal-due-date" data-state={state}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={getDueDateDotStyle(state)} />
      <PortalDate value={document.dueDate} />
    </span>
  );
}

/** A section with the design's grey header band. */
export function PortalSection({ title, action, children, className = '', testId }) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-lg border border-border ${className}`}
      data-testid={testId}
    >
      <div className="flex h-12 items-center justify-between border-b border-border bg-muted px-3">
        <h2 className="text-xs font-medium uppercase leading-4">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
