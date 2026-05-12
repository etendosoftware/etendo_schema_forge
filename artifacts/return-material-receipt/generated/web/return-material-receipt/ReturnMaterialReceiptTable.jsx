import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:returnMaterialReceipt
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', enumLabels: { 'CL': 'Closed', 'CO': 'Completed', 'DR': 'Draft', 'NA': 'Not Accepted', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TEMP': 'Temporal', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' }, required: true },
];
// @sf-generated-end columns:returnMaterialReceipt

const filters = ['documentNo', 'movementDate', 'businessPartner', 'documentStatus'];

// @sf-generated-start component:ReturnMaterialReceiptTable
const ReturnMaterialReceiptTable = forwardRef(function ReturnMaterialReceiptTable(props, ref) {
  // Inline-editable layout owns rendering of the existing rows. The add-line flow keeps
  // using the proven DataTable inline-add row (callouts, focus management, defaults) —
  // when addRow.active flips on, we hand off to DataTable so the user can fill the new
  // line, then return to InlineLinesPanel once addRow.active flips off again. The ref
  // is forwarded so DetailView can imperatively flush pending edits on global save.
  if (props.linesLayout === 'inlineEditable' && !props.addRow?.active) {
    return <InlineLinesPanel ref={ref} columns={columns} {...props} />;
  }
  return <DataTable columns={columns} filters={filters} {...props} />;
});

export default ReturnMaterialReceiptTable;
// @sf-generated-end component:ReturnMaterialReceiptTable
