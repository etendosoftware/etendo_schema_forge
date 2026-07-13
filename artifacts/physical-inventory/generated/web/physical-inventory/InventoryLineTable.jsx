import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:inventoryLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true, lookup: true, grow: true },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM', required: true, grow: true, readOnly: true },
  { key: 'bookQuantity', column: 'QtyBook', type: 'number', label: 'System Count', required: true, grow: true, minWidth: 192 },
  { key: 'quantityCount', column: 'QtyCount', type: 'number', label: 'User Count', required: true, grow: true, minWidth: 192 },
];
// @sf-generated-end columns:inventoryLine

const filters = [];

// @sf-generated-start component:InventoryLineTable
const InventoryLineTable = forwardRef(function InventoryLineTable(props, ref) {
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

export default InventoryLineTable;
// @sf-generated-end component:InventoryLineTable
