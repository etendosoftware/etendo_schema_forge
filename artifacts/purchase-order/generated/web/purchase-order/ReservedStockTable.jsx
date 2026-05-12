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

export default ReservedStockTable;
// @sf-generated-end component:ReservedStockTable
