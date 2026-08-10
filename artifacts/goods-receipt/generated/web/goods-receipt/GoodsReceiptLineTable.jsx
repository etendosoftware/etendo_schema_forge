import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:goodsReceiptLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'number', label: 'Order Quantity', readOnly: true },
  { key: 'dimensions', type: 'dimensionsPanel', label: 'Accounting dimensions', labels: { en_US: 'Accounting dimensions', es_ES: 'Dimensiones contables' }, dimensionFields: [
    { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', reference: 'Project', inputMode: 'search' },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', reference: 'CostCenter', inputMode: 'selector' },
  ] },
];
// @sf-generated-end columns:goodsReceiptLine

const filters = [];

// @sf-generated-start component:GoodsReceiptLineTable
const GoodsReceiptLineTable = forwardRef(function GoodsReceiptLineTable(props, ref) {
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

export default GoodsReceiptLineTable;
// @sf-generated-end component:GoodsReceiptLineTable
