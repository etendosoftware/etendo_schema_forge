import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:returnToVendorShipmentLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', labels: {"es_ES":"Cant. a devolver","en_US":"Return Qty"}, label: 'Movement Quantity', required: true, grow: true },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'number', labels: {"es_ES":"Cant. recibida orig.","en_US":"Original Received Qty"}, label: 'Order Quantity', grow: true, readOnly: true },
];
// @sf-generated-end columns:returnToVendorShipmentLine

const filters = ['product'];

// @sf-generated-start component:ReturnToVendorShipmentLineTable
const ReturnToVendorShipmentLineTable = forwardRef(function ReturnToVendorShipmentLineTable(props, ref) {
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

export default ReturnToVendorShipmentLineTable;
// @sf-generated-end component:ReturnToVendorShipmentLineTable
