import { useState } from 'react';
import {
  ArrowsClockwiseIcon, CalendarBlankIcon, CaretDownIcon, CheckIcon, FunnelIcon,
} from '@phosphor-icons/react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DateRangePopoverContent, computeTriggerLabel } from '@/components/ui/date-range-popover';
import {
  PortalDate, PortalDocumentStatus, PortalDueDate, PortalInvoiceTypeBadge, PortalMoney,
  PortalPaymentStatus, PORTAL_FIGMA_SHADOW, PORTAL_ROW_FOCUS, portalRowActivation,
} from './PortalBits.jsx';
import { PORTAL_KIND_META, documentLabelKey, quotationValidity } from './portalPresentation.js';

/*
 * The desktop list of one document kind as the designer's Figma "PC Presupuestos" draws it
 * (2026-11-17): the view toolbar and the table. Hex values, sizes and type are the Figma's; the
 * badges use the main screen's Figma palette, with the app's status names. Quotations are the
 * reference; orders, shipments and invoices take the same styling with their own tabs (the
 * customer-facing status groups they already had) and columns. The mobile list is not here.
 */

/** A 40px bordered white control of the toolbar (date button, icon buttons). */
const TOOL = `inline-flex h-10 items-center justify-center rounded-lg border border-[#C7CBD3] bg-white text-[#81848F] transition-colors hover:bg-[#F3F5F9] ${PORTAL_FIGMA_SHADOW}`;

/** The Figma's tab button: 32px, padding 8px 12px, r8, label 14/24 (padding 0 4px). */
function Tab({ selected, onClick, testId, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2',
        selected
          ? 'bg-white shadow-[0_1px_3px_rgba(27,26,31,0.1),0_1px_2px_rgba(27,26,31,0.06)]'
          : 'hover:bg-white/60',
      )}
      data-testid={testId}
    >
      <span className={cn('px-1 text-sm leading-6', selected ? 'font-medium text-[#1B1A1F]' : 'font-normal text-[#40465C]')}>
        {children}
      </span>
    </button>
  );
}

/** The all-time range and the others: the app's date-range picker, in the Figma's button. */
function DateRangeButton({ value, onChange }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const [open, setOpen] = useState(false);
  const label = computeTriggerLabel(value, undefined, ui, (locale || 'es_ES').replace('_', '-'));
  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__b71e0c">
      <PopoverTrigger asChild data-testid="PopoverTrigger__b71e0c">
        <button type="button" className={cn(TOOL, 'gap-1 px-3 py-2')} data-testid="portal-date-range">
          <CalendarBlankIcon size={20} aria-hidden="true" data-testid="CalendarBlank__b71e0c" />
          <span className="px-1 text-sm font-medium leading-6 text-[#1B1A1F]">{label}</span>
          <CaretDownIcon size={20} aria-hidden="true" data-testid="CaretDown__b71e0c" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0" data-testid="PopoverContent__b71e0c">
        <DateRangePopoverContent
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          data-testid="DateRangePopoverContent__b71e0c" />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The view toolbar (padding 8px): the kind's status tabs, the date range and the filter button on
 * the left; refresh on the right. "Descargar seleccionados" and the row checkboxes are out for now
 * (PO answer: bulk download is a performance risk); a document downloads from its detail.
 *
 * The funnel offers the same status groups as a menu. The portal has no other quick filter, and the
 * design gives the funnel no content of its own, so it adds no new filter — it keeps the status
 * choice reachable when the tabs do not fit.
 */
export function PortalListToolbar({
  kind, tabs, group, onGroup, range, onRange, onRefresh,
}) {
  const ui = useUI();
  return (
    <div className="hidden items-start justify-between gap-2.5 p-2 md:flex" data-kind={kind} data-testid="portal-list-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={ui('portalColStatus')}
          className="flex items-center gap-1 overflow-x-auto rounded-xl bg-[#F3F5F9] p-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.code ?? 'all'}
              selected={(group ?? null) === tab.code}
              onClick={() => onGroup(tab.code)}
              testId={`portal-status-tab-${(tab.code ?? 'all').toLowerCase()}`}
              data-testid="Tab__b71e0c">
              {ui(tab.labelKey)}
            </Tab>
          ))}
        </div>
        <DateRangeButton value={range} onChange={onRange} data-testid="DateRangeButton__b71e0c" />
        <DropdownMenu data-testid="DropdownMenu__b71e0c">
          <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__b71e0c">
            <button type="button" aria-label={ui('filters')} title={ui('filters')} className={cn(TOOL, 'w-10 p-2')} data-testid="portal-list-filters">
              <FunnelIcon size={20} aria-hidden="true" data-testid="Funnel__b71e0c" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" data-testid="DropdownMenuContent__b71e0c">
            <div className="px-2 py-1.5 text-xs font-semibold text-[#6B7280]">{ui('portalColStatus')}</div>
            {tabs.map((tab) => (
              <DropdownMenuItem
                key={tab.code ?? 'all'}
                onSelect={() => onGroup(tab.code)}
                data-testid={`portal-list-filter-${(tab.code ?? 'all').toLowerCase()}`}
              >
                <CheckIcon
                  size={16}
                  className={cn('mr-2', (group ?? null) === tab.code ? 'opacity-100' : 'opacity-0')}
                  aria-hidden="true"
                  data-testid="Check__b71e0c" />
                {ui(tab.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label={ui('portalRefresh')} title={ui('portalRefresh')} onClick={onRefresh} className={cn(TOOL, 'w-10 p-2')} data-testid="portal-refresh">
          <ArrowsClockwiseIcon size={20} aria-hidden="true" data-testid="ArrowsClockwise__b71e0c" />
        </button>
      </div>
    </div>
  );
}

/** A 6px dot in a 24px box before "Válido hasta" (Figma: #FFC233 while it can be answered). */
function ValidityCell({ document }) {
  const validity = quotationValidity(document);
  if (!validity) return <span className="text-[#6B7280]">—</span>;
  let dot = null;
  if (validity.state === 'open') dot = 'bg-[#FFC233]';
  if (validity.state === 'expired') dot = 'bg-[#D50B3E]';
  return (
    <span className="inline-flex items-center" data-testid="portal-valid-until" data-state={validity.state}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
        {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', dot)} /> : null}
      </span>
      <span className={validity.state === 'answered' ? 'text-[#6B7280]' : ''}>
        <PortalDate value={document.validUntil} data-testid="PortalDate__b71e0c" />
      </span>
    </span>
  );
}

/** The 24px status badge of the table (r360, no border, 12/16, Figma palette). */
const TABLE_BADGE = 'h-6 rounded-full border-transparent px-2 py-1 font-normal tracking-[-0.005em]';

/**
 * Sums of the rows shown, one per currency (never two currencies in one figure). A shipment list
 * has no amounts and no totals.
 */
function totalsByCurrency(documents) {
  const totals = new Map();
  for (const document of documents) {
    const currency = document.currency ?? '';
    const entry = totals.get(currency) ?? { currency: document.currency, taxBase: 0, grandTotal: 0 };
    entry.taxBase += document.taxBase ?? 0;
    entry.grandTotal += document.grandTotal ?? 0;
    totals.set(currency, entry);
  }
  return [...totals.values()];
}

/**
 * The table (Figma "Tabla"): the kind's columns at the Figma's widths (no checkbox column: bulk
 * download is out), 40px rows split by #E3E7EC rules, and a "Total" row per currency of the rows shown.
 * Quotations: date (semibold), number, reference, "Válido hasta" with its dot, status, tax base,
 * total. Invoices keep the story's columns (document type, due date, payment state, outstanding);
 * shipments carry no amounts. A row opens its document.
 */
export function PortalListTable({ kind, documents, onOpen }) {
  const ui = useUI();
  const isInvoice = kind === 'INVOICE';
  const isQuotation = kind === 'QUOTATION';
  const hasAmounts = kind !== 'SHIPMENT';
  const th = 'h-10 whitespace-nowrap px-3 text-left text-xs font-semibold leading-4 tracking-[-0.005em] text-[#1B1A1F]';
  const td = 'h-10 whitespace-nowrap px-3 text-sm leading-5 text-[#1B1A1F]';
  // Invoices carry three more columns than the quotation list: up to a 1280px screen the tax base
  // gives way (shown from 2xl), so "Imp. total" and "Pendiente" always fit.
  const taxBase = isInvoice ? 'hidden 2xl:table-cell' : '';
  const leadingColumns = 4 + (isQuotation || isInvoice ? 1 : 0) + (isInvoice ? 2 : 0);
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse" data-testid="portal-document-table">
        <thead>
          <tr className="border-b border-[#E3E7EC]">
            <th className={cn(th, 'w-[178px]')}>{ui(PORTAL_KIND_META[kind].dateColumnKey)}</th>
            {isInvoice ? <th className={th}>{ui('documentType')}</th> : null}
            <th className={cn(th, 'w-[140px]')}>{ui('portalColDocumentNo')}</th>
            <th className={cn(th, 'w-[240px]')}>{ui('portalColReference')}</th>
            {isQuotation ? <th className={cn(th, 'w-[136px]')}>{ui('portalColValidUntil')}</th> : null}
            {isInvoice ? <th className={th}>{ui('portalColDueDate')}</th> : null}
            <th className={cn(th, 'w-[148px]')}>{ui('portalColStatus')}</th>
            {isInvoice ? <th className={th}>{ui('portalColPaymentStatus')}</th> : null}
            {hasAmounts ? <th className={cn(th, taxBase, 'text-right')}>{ui('portalColTaxBase')}</th> : null}
            {hasAmounts ? <th className={cn(th, 'text-right')}>{ui('portalColTotal')}</th> : null}
            {isInvoice ? <th className={cn(th, 'text-right')}>{ui('portalColOutstanding')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr
              key={document.id}
              className={`cursor-pointer border-b border-[#E3E7EC] hover:bg-[#F3F5F9] ${PORTAL_ROW_FOCUS}`}
              {...portalRowActivation(() => onOpen(document), `${ui(documentLabelKey(document))} ${document.documentNo ?? ''}`.trim())}
              data-testid="portal-document-row"
            >
              <td className={cn(td, 'font-semibold tabular-nums')}><PortalDate value={document.date} data-testid="PortalDate__b71e0c" /></td>
              {isInvoice ? <td className={td}><PortalInvoiceTypeBadge document={document} data-testid="PortalInvoiceTypeBadge__b71e0c" /></td> : null}
              <td className={td}>
                {/* The number stays its own button (keyboard and screen readers); the row opens the
                    same document. Hover is the row's only (Figma): no colour change on the number. */}
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onOpen(document); }}
                  className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="portal-document-open"
                >
                  {document.documentNo}
                </button>
              </td>
              <td className={cn(td, 'max-w-[240px] truncate')} title={document.reference || undefined}>{document.reference || '—'}</td>
              {isQuotation ? <td className={cn(td, 'pl-1 tabular-nums')}><ValidityCell document={document} data-testid="ValidityCell__b71e0c" /></td> : null}
              {isInvoice ? <td className={cn(td, 'tabular-nums')}><PortalDueDate document={document} data-testid="PortalDueDate__b71e0c" /></td> : null}
              <td className={td}>
                <PortalDocumentStatus status={document.documentStatus} palette="figma" className={TABLE_BADGE} data-testid="PortalDocumentStatus__b71e0c" />
              </td>
              {isInvoice ? (
                <td className={td}>
                  <PortalPaymentStatus document={document} palette="figma" className={TABLE_BADGE} data-testid="PortalPaymentStatus__b71e0c" />
                </td>
              ) : null}
              {hasAmounts ? (
                <td className={cn(td, taxBase, 'text-right tabular-nums')}>
                  <PortalMoney currency={document.currency} value={document.taxBase} data-testid="PortalMoney__b71e0c" />
                </td>
              ) : null}
              {hasAmounts ? (
                <td className={cn(td, 'text-right tabular-nums')}>
                  <PortalMoney currency={document.currency} value={document.grandTotal} data-testid="PortalMoney__b71e0c" />
                </td>
              ) : null}
              {isInvoice ? (
                <td className={cn(td, 'text-right tabular-nums')}>
                  <PortalMoney currency={document.currency} value={document.outstandingAmount} data-testid="PortalMoney__b71e0c" />
                </td>
              ) : null}
            </tr>
          ))}
          {hasAmounts ? totalsByCurrency(documents).map((total) => (
            <tr key={total.currency ?? 'none'} className="font-semibold" data-testid="portal-document-totals">
              <td colSpan={leadingColumns} className="h-10 px-3 text-sm leading-5 text-[#1B1A1F]">{ui('portalTotal')}</td>
              <td className={cn('h-10 px-3 text-right text-sm leading-5 tabular-nums text-[#1B1A1F]', taxBase)}>
                <PortalMoney currency={total.currency} value={total.taxBase} data-testid="PortalMoney__b71e0c" />
              </td>
              <td className="h-10 px-3 text-right text-sm leading-5 tabular-nums text-[#1B1A1F]">
                <PortalMoney currency={total.currency} value={total.grandTotal} data-testid="PortalMoney__b71e0c" />
              </td>
              {isInvoice ? <td /> : null}
            </tr>
          )) : null}
        </tbody>
      </table>
    </div>
  );
}
