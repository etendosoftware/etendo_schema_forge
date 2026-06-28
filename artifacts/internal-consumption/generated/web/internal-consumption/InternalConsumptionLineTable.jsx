import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:internalConsumptionLine
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', required: true, lookup: true, lookupDrawer: 'internal-consumption-product' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity', required: true, minWidth: 160 },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', label: 'UOM' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Warehouse', required: true },
];
// @sf-generated-end columns:internalConsumptionLine

const filters = ['product'];

// @sf-generated-start component:InternalConsumptionLineTable
const InternalConsumptionLineTable = forwardRef(function InternalConsumptionLineTable(props, ref) {
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

export default InternalConsumptionLineTable;
// @sf-generated-end component:InternalConsumptionLineTable
