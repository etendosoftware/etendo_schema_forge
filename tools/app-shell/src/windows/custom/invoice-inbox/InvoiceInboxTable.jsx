import { useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useLocaleSwitch } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { isSelectableRow } from './invoiceInboxFilters.js';
import InvoiceInboxRowActions, { INVOICE_INBOX_ROW_ACTION_COUNT } from './InvoiceInboxRowActions.jsx';
import {
  DocumentCell, InvoiceDateCell, NumberCell, StatusCell, TotalCell, VendorCell,
} from './InvoiceInboxCells.jsx';

/**
 * ETP-6049 — the inbox grid on the shared `DataTable`.
 *
 * Every column is backed by a real `ETGO_INCOMING_DOCUMENT` column (`column:`) — the cells only
 * compose values the row already carries. `filterable: false`: this page filters through its
 * status tabs, not per column. A row click opens the review panel (ETP-6050, `onOpenRow(row)`;
 * the page ignores PROCESSING rows). PROCESSING, CONFIRMED and DISCARDED rows cannot be checked
 * (`isRowSelectable`).
 *
 * Row hover actions (edit, kebab, discard) go through DataTable's `rowQuickActions` custom
 * `render` slot (`InvoiceInboxRowActions`); `onDiscardRow(row)` opens the discard confirmation and
 * the pencil calls `onOpenRow(row)`.
 */
export default function InvoiceInboxTable({
  rows, loading, emptyState, ui, onSelectionChange, clearSelectionTrigger, onDiscardRow, onOpenRow,
}) {
  const { locale } = useLocaleSwitch();
  const currency = useCurrency();

  const columns = useMemo(() => {
    const label = (key) => ({ [locale]: ui(key) });
    return [
      {
        key: 'fileName', column: 'File_Name', type: 'custom', required: true, filterable: false, grow: true, minWidth: 240,
        labels: label('invoiceInboxColDocument'),
        render: (row) => <DocumentCell row={row} ui={ui} locale={locale} data-testid="DocumentCell__2b9513" />,
      },
      {
        key: 'businessPartner', column: 'C_BPartner_ID', type: 'custom', filterable: false, minWidth: 220,
        labels: label('invoiceInboxColVendor'),
        render: (row) => <VendorCell row={row} ui={ui} data-testid="VendorCell__2b9513" />,
      },
      {
        key: 'orderReference', column: 'POReference', type: 'custom', filterable: false, minWidth: 160,
        labels: label('invoiceInboxColNumber'),
        render: (row) => <NumberCell row={row} ui={ui} data-testid="NumberCell__2b9513" />,
      },
      {
        key: 'invoiceDate', column: 'DateInvoiced', type: 'custom', filterMode: 'date', filterable: false, minWidth: 112,
        labels: label('invoiceInboxColDate'),
        render: (row) => <InvoiceDateCell row={row} locale={locale} data-testid="InvoiceDateCell__2b9513" />,
      },
      {
        key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', filterable: false, minWidth: 120,
        labels: label('invoiceInboxColTotal'),
        render: (row) => <TotalCell row={row} currency={currency} data-testid="TotalCell__2b9513" />,
      },
      {
        key: 'status', column: 'Status', type: 'custom', required: true, filterMode: 'enumLabel', filterable: false, minWidth: 200,
        labels: label('invoiceInboxColStatus'),
        render: (row) => <StatusCell row={row} ui={ui} locale={locale} data-testid="StatusCell__2b9513" />,
      },
    ];
  }, [locale, ui, currency]);

  const rowQuickActions = useMemo(() => ({
    render: (row) => (
      <InvoiceInboxRowActions
        row={row}
        onDiscard={onDiscardRow}
        onOpen={onOpenRow}
        data-testid="InvoiceInboxRowActions__2b9513" />
    ),
    buttonCount: INVOICE_INBOX_ROW_ACTION_COUNT,
  }), [onDiscardRow, onOpenRow]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={loading}
      showFooterTotals={false}
      selectable
      isRowSelectable={isSelectableRow}
      onSelectionChange={onSelectionChange}
      clearSelectionTrigger={clearSelectionTrigger}
      rowQuickActions={rowQuickActions}
      onRowClick={onOpenRow}
      emptyState={emptyState}
      data-testid="invoice-inbox-table"
    />
  );
}
