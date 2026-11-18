import { ArrowsCounterClockwiseIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency.js';
import {
  PortalDate, PortalDocumentStatus, PortalPaymentStatus, PortalRowBadge, PORTAL_ROW_FOCUS,
} from './PortalBits.jsx';
import { documentLabelKey } from './portalPresentation.js';

/*
 * The desktop side panel of a document, as the designer's Figma draws it (2026-11-17): the
 * "Detalles" card and "Documentos relacionados". Hex values and type sizes are the Figma's; the
 * badges use the main screen's Figma palette. The mobile detail keeps the app's preview cards.
 * Not built yet, on purpose: the Figma's "Comentarios" block (no backend, decision pending) and its
 * greyed "Pedido – Pendiente de creación" placeholder (user decision: only real documents).
 */

/** A status badge of the panel: 24px, padding 4px 8px, r360, no border, 12/16. */
const PANEL_BADGE = 'h-6 rounded-full border-transparent px-2 py-1 font-normal';

/** One "Detalles" row: the label left (12/16, #6B7280), the value right (14/20, #1B1A1F). */
function DetailRow({ label, children, testId }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3" data-testid={testId}>
      <span className="text-xs leading-4 tracking-[-0.005em] text-[#6B7280]">{label}</span>
      <span className="min-w-0 text-right text-sm leading-5 text-[#1B1A1F] tabular-nums">{children}</span>
    </div>
  );
}

/**
 * "Detalles": the total as its header, then date, validity (quotations), status, tax base and
 * taxes. Invoices keep the rows the story requires (due date, payment state, outstanding, payment
 * method), and every kind keeps its payment method when it has one, in the same style. A shipment
 * has no amounts: no total header, no money rows.
 */
export function PortalDetailsCard({ document }) {
  const ui = useUI();
  const isInvoice = document.kind === 'INVOICE';
  const hasAmounts = document.kind !== 'SHIPMENT';
  const money = (value) => (value == null ? '—' : formatCurrency(document.currency, value));
  const taxesTotal = document.taxes.reduce((sum, tax) => sum + (tax.taxAmount ?? 0), 0);
  return (
    <section
      className={cn('flex flex-col gap-3 rounded-lg border border-[#E3E7EC] pb-3', hasAmounts ? '' : 'pt-3')}
      data-testid="portal-details-card"
    >
      {hasAmounts ? (
        <div className="flex items-center justify-between gap-3 border-b border-[#E3E7EC] p-3 text-sm font-semibold leading-5 text-[#1B1A1F]">
          <span>{ui('portalTotal')}</span>
          <span className="tabular-nums" data-testid="portal-details-total">{money(document.grandTotal)}</span>
        </div>
      ) : null}
      <DetailRow label={ui('portalFieldDate')} data-testid="DetailRow__c1fc7f"><PortalDate value={document.date} data-testid="PortalDate__d3c1a0" /></DetailRow>
      {document.kind === 'QUOTATION' ? (
        <DetailRow label={ui('portalColValidUntil')} data-testid="DetailRow__c1fc7f"><PortalDate value={document.validUntil} data-testid="PortalDate__d3c1a0" /></DetailRow>
      ) : null}
      {isInvoice ? (
        <DetailRow label={ui('portalColDueDate')} data-testid="DetailRow__c1fc7f"><PortalDate value={document.dueDate} data-testid="PortalDate__d3c1a0" /></DetailRow>
      ) : null}
      <DetailRow label={ui('portalColStatus')} data-testid="DetailRow__c1fc7f">
        {document.documentStatus ? (
          <PortalDocumentStatus status={document.documentStatus} palette="figma" className={PANEL_BADGE} data-testid="PortalDocumentStatus__d3c1a0" />
        ) : '—'}
      </DetailRow>
      {isInvoice ? (
        <DetailRow label={ui('portalColPaymentStatus')} data-testid="DetailRow__c1fc7f">
          <PortalPaymentStatus
            document={document}
            installments={document.installments}
            palette="figma"
            className={PANEL_BADGE}
            data-testid="PortalPaymentStatus__d3c1a0" />
        </DetailRow>
      ) : null}
      {isInvoice ? <DetailRow label={ui('portalColOutstanding')} data-testid="DetailRow__c1fc7f">{money(document.outstandingAmount)}</DetailRow> : null}
      {document.paymentMethod ? <DetailRow label={ui('portalFieldPaymentMethod')} data-testid="DetailRow__c1fc7f">{document.paymentMethod}</DetailRow> : null}
      {hasAmounts ? <DetailRow label={ui('portalColTaxBase')} data-testid="DetailRow__c1fc7f">{money(document.taxBase)}</DetailRow> : null}
      {hasAmounts ? <DetailRow label={ui('portalFieldTaxes')} data-testid="DetailRow__c1fc7f">{money(taxesTotal)}</DetailRow> : null}
    </section>
  );
}

/**
 * "Documentos relacionados": a 12/16 heading with a round refresh button, then one row per related
 * document — its kind and number, its date, its status (or an invoice's payment state) and a
 * chevron. The open document is not listed (user decision). Opening a row opens that document.
 */
export function PortalRelatedList({ related, refreshing, onRefresh, onOpen }) {
  const ui = useUI();
  const rows = related ?? [];
  return (
    <section className="flex flex-col" data-testid="portal-related-panel">
      <div className="flex items-center justify-between pb-1">
        <h2 className="text-xs font-normal leading-4 text-[#1B1A1F] [font-family:inherit]">{ui('relatedDocuments')}</h2>
        <button
          type="button"
          aria-label={ui('portalRefresh')}
          title={ui('portalRefresh')}
          onClick={onRefresh}
          disabled={refreshing}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[#81848F] hover:bg-[#F3F5F9] disabled:opacity-60"
          data-testid="portal-related-refresh"
        >
          <ArrowsCounterClockwiseIcon size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" data-testid="ArrowsCounterClockwise__d3c1a0" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-xs text-[#6B7280]" data-testid="portal-related-empty">{ui('noRelatedDocuments')}</p>
      ) : (
        <ul className="flex flex-col gap-3 rounded-lg border border-[#E8EAEF] py-2">
          {rows.map((item) => {
            const label = `${ui(documentLabelKey(item))} #${item.documentNo ?? ''}`;
            return (
              <li key={`${item.kind}:${item.id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  aria-label={label}
                  className={`flex w-full items-center px-2 py-1 text-left hover:bg-[#F3F5F9] ${PORTAL_ROW_FOCUS}`}
                  data-testid="portal-related-item"
                >
                  <span className="flex min-w-0 flex-1 flex-col pl-2 pr-4">
                    <span className="text-sm leading-6 text-[#1B1A1F]">{label}</span>
                    <span className="text-xs leading-5 text-[#6B7280]"><PortalDate value={item.date} data-testid="PortalDate__d3c1a0" /></span>
                  </span>
                  <PortalRowBadge document={item} palette="figma" className={PANEL_BADGE} data-testid="PortalRowBadge__d3c1a0" />
                  <CaretRightIcon size={20} className="ml-1 shrink-0 text-[#81848F]" aria-hidden="true" data-testid="CaretRight__d3c1a0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
