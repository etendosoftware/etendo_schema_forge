import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:goodsShipment
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'partnerAddress', column: 'C_BPartner_Location_ID', type: 'selector', label: 'Partner Address', required: true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', enumLabels: { 'CL': 'Closed', 'CO': 'Completed', 'DR': 'Draft', 'NA': 'Not Accepted', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TEMP': 'Temporal', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' }, required: true },
  { key: 'invoiced', column: 'Iscompletelyinvoiced', type: 'boolean', label: 'Completely Invoiced', badge: true, badgeLabels: {"true":"Invoiced","false":"Pending"}, required: true },
];
// @sf-generated-end columns:goodsShipment

const filters = ['documentNo', 'warehouse', 'businessPartner', 'movementDate', 'documentStatus'];

// @sf-generated-start component:GoodsShipmentTable
const GoodsShipmentTable = forwardRef(function GoodsShipmentTable(props, ref) {
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

export default GoodsShipmentTable;
// @sf-generated-end component:GoodsShipmentTable
