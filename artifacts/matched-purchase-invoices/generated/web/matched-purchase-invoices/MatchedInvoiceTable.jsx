import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:matchedInvoice
const columns = [
  { key: 'invoiceLine', column: 'C_InvoiceLine_ID', type: 'selector', label: 'Invoice Line', required: true },
  { key: 'goodsShipmentLine', column: 'M_InOutLine_ID', type: 'selector', label: 'Goods Receipt Line', required: true },
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true },
  { key: 'quantity', column: 'Qty', type: 'number', label: 'Quantity', required: true },
  { key: 'transactionDate', column: 'DateTrx', type: 'date', label: 'Transaction Date', required: true, dot: false },
  { key: 'processed', column: 'Processed', type: 'boolean', label: 'Processed', badge: true, badgeLabels: {"true":{"en_US":"Yes","es_ES":"Sí"},"false":{"en_US":"No","es_ES":"No"}}, required: true },
  { key: 'posted', column: 'Posted', type: 'boolean', label: 'Posted', badge: true, badgeLabels: {"true":{"en_US":"Posted","es_ES":"Contabilizado"},"false":{"en_US":"Not posted","es_ES":"Sin contabilizar"}}, badgeVariants: {"true":"green","false":"orange"}, required: true, visibleWhenCapability: 'showAccountingFields' },
];
// @sf-generated-end columns:matchedInvoice

const filters = ['invoiceLine', 'goodsShipmentLine', 'product'];

// @sf-generated-start component:MatchedInvoiceTable
const MatchedInvoiceTable = forwardRef(function MatchedInvoiceTable(props, ref) {
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

export default MatchedInvoiceTable;
// @sf-generated-end component:MatchedInvoiceTable
