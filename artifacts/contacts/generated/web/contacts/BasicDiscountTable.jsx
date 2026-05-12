import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:basicDiscount
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true },
  { key: 'discount', column: 'C_Discount_ID', type: 'selector', label: 'Basic Discount', required: true },
  { key: 'customer', column: 'IsCustomer', type: 'boolean', label: 'Customer', required: true },
  { key: 'vendor', column: 'IsVendor', type: 'boolean', label: 'Vendor', required: true },
];
// @sf-generated-end columns:basicDiscount

const filters = [];

// @sf-generated-start component:BasicDiscountTable
const BasicDiscountTable = forwardRef(function BasicDiscountTable(props, ref) {
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

export default BasicDiscountTable;
// @sf-generated-end component:BasicDiscountTable
