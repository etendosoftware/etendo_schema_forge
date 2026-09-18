import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:stock
const columns = [
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', required: true },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'string', label: 'Attribute Set Value', maxLength: 12 },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'number', label: 'Quantity on Hand', required: true },
  { key: 'reservedQty', column: 'ReservedQty', type: 'number', label: 'Reserved Qty', required: true },
  { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'number', label: 'Allocated Quantity', required: true },
];
// @sf-generated-end columns:stock

const filters = [];

// @sf-generated-start component:StockTable
const StockTable = forwardRef(function StockTable(props, ref) {
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

export default StockTable;
// @sf-generated-end component:StockTable
