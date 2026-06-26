import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:reservedStock
const columns = [
  { key: 'reservation', column: 'M_Reservation_ID', type: 'selector', label: 'Stock Reservation', required: true },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin' },
  { key: 'allocated', column: 'IsAllocated', type: 'boolean', label: 'Allocated', required: true },
  { key: 'quantity', column: 'Quantity', type: 'number', label: 'Quantity', required: true },
  { key: 'released', column: 'ReleasedQty', type: 'number', label: 'Released' },
];
// @sf-generated-end columns:reservedStock

const filters = [];

// @sf-generated-start component:ReservedStockTable
const ReservedStockTable = forwardRef(function ReservedStockTable(props, ref) {
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

export default ReservedStockTable;
// @sf-generated-end component:ReservedStockTable
