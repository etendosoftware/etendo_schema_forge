import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:returnMaterialReceipt
const columns = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, dot: false },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.', required: true },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', label: 'Business Partner', required: true },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', enumLabels: { 'CL': 'Closed', 'CO': 'Completed', 'DR': 'Draft', 'NA': 'Not Accepted', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TEMP': 'Temporal', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' }, required: true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', required: true },
  { key: 'sourceShipmentDocNo', column: 'sourceShipmentDocNo', type: 'string', label: 'Source Shipment' },
];
// @sf-generated-end columns:returnMaterialReceipt

const filters = ['documentNo', 'movementDate', 'businessPartner', 'documentStatus'];

// @sf-generated-start component:ReturnMaterialReceiptTable
const ReturnMaterialReceiptTable = forwardRef(function ReturnMaterialReceiptTable(props, ref) {
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

export default ReturnMaterialReceiptTable;
// @sf-generated-end component:ReturnMaterialReceiptTable
