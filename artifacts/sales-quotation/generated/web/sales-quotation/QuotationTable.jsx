import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:quotation
const columns = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Quotation Date', required: true },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', enumLabels: { 'AE': 'docStatusAe', 'CO': 'docStatusCo', 'CL': 'docStatusCl', 'ETGO_CI': 'docStatusEtgoCi', 'CA': 'docStatusCa', 'CJ': 'docStatusCj', 'DR': 'docStatusDr', 'ME': 'docStatusMe', 'NA': 'docStatusNa', 'NC': 'docStatusNc', 'WP': 'docStatusWp', 'RE': 'docStatusRe', 'TMP': 'docStatusTmp', 'UE': 'docStatusUe', 'IP': 'docStatusIp', '??': 'docStatus', 'VO': 'docStatusVo' }, required: true },
  { key: 'validUntil', column: 'validuntil', type: 'date', label: 'Valid Until' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount', required: true },
];
// @sf-generated-end columns:quotation

const filters = ['documentNo', 'orderDate', 'businessPartner', 'validUntil', 'documentStatus'];

// @sf-generated-start component:QuotationTable
const QuotationTable = forwardRef(function QuotationTable(props, ref) {
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

export default QuotationTable;
// @sf-generated-end component:QuotationTable
