import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:lines
const columns = [
  { key: 'invoiceDocumentNo', column: 'DocumentNo', type: 'string', labels: {"es_ES":"Factura","es_AR":"Factura","en_US":"Invoice"}, label: 'Invoice', grow: true },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', labels: {"es_ES":"Fecha factura","es_AR":"Fecha factura","en_US":"Invoice date"}, label: 'Invoice Date' },
  { key: 'dueDate', column: 'ExpectedDate', type: 'date', labels: {"es_ES":"Vencimiento","es_AR":"Vencimiento","en_US":"Due date"}, label: 'Due Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', labels: {"es_ES":"Cliente","es_AR":"Cliente","en_US":"Customer"}, label: 'Customer' },
  { key: 'invoiceGrandTotal', column: 'GrandTotal', type: 'amount', labels: {"es_ES":"Total factura","es_AR":"Total factura","en_US":"Invoice total"}, label: 'Invoice Total', currencyField: 'currency' },
  { key: 'invoiceOutstanding', column: 'OutstandingAmt', type: 'amount', labels: {"es_ES":"Pendiente","es_AR":"Pendiente","en_US":"Outstanding"}, label: 'Outstanding', currencyField: 'currency' },
  { key: 'amount', column: 'Amount', type: 'amount', labels: {"es_ES":"A remesar","es_AR":"A remesar","en_US":"To remit"}, label: 'Amount', required: true, currencyField: 'currency' },
  { key: 'status', column: 'Status', type: 'status', labels: {"es_ES":"Estado del recibo","es_AR":"Estado del recibo","en_US":"Receipt status"}, label: 'Receipt Status', enumLabels: { 'RPAP': 'statusRpap', 'RPAE': 'statusRpae', 'RPVOID': 'statusRpvoid', 'REM_SENT': 'statusRemSent', 'PPM': 'statusPpm', 'RPR': 'statusRpr', 'REM_CANCEL': 'statusRemCancel', 'RDNC': 'statusRdnc', 'PWNC': 'statusPwnc', 'RPPC': 'statusRppc', 'ETGOERR': 'statusEtgoerr' } },
];
// @sf-generated-end columns:lines

const filters = [];

// @sf-generated-start component:LinesTable
const LinesTable = forwardRef(function LinesTable(props, ref) {
  // Inline-editable layout always uses InlineLinesPanel for existing rows so column
  // widths (flex layout) never shift when the add-row form opens. When addRow is
  // active we render a header-hidden, data-hidden DataTable below for just the
  // add-row form — it owns callouts, selectors, validation and the imperative flush
  // ref. The ref is forwarded to InlineLinesPanel so DetailView can flush pending
  // inline edits on global save.
  if (props.linesLayout === 'inlineEditable') {
    if (props.addRow?.active) {
      return (
        <>
          <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
          <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
        </>
      );
    }
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default LinesTable;
// @sf-generated-end component:LinesTable
