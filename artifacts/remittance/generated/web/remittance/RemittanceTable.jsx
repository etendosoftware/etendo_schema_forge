import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:remittance
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', maxLength: 30 },
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true, maxLength: 60, grow: true },
  { key: 'remittanceType', column: 'REM_Remittance_Type_ID', type: 'selector', label: 'Remittance Type', required: true, minWidth: 260 },
  { key: 'financialAccount', column: 'FIN_Financial_Account_ID', type: 'selector', label: 'Financial Account', required: true, minWidth: 290 },
  { key: 'transactionDate', column: 'Datetrx', type: 'date', label: 'Transaction Date', required: true },
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Expected Date', required: true },
  { key: 'remittanceStatus', column: 'Remittance_Status', type: 'status', label: 'Status', enumLabels: { 'PE': 'remittanceStatusPe', 'PR': 'remittanceStatusPr', 'CT': 'remittanceStatusCt', 'PT': 'remittanceStatusPt', 'CP': 'remittanceStatusCp', 'PP': 'remittanceStatusPp', 'AN': 'remittanceStatusAn' }, enumVariants: {"PE":"neutral","PR":"info","CT":"success","PT":"success","CP":"warning","PP":"warning","AN":"destructive"}, required: true },
];
// @sf-generated-end columns:remittance

const filters = [];

// @sf-generated-start component:RemittanceTable
const RemittanceTable = forwardRef(function RemittanceTable(props, ref) {
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

export default RemittanceTable;
// @sf-generated-end component:RemittanceTable
