import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:locationAddress
const columns = [
  { key: 'name', column: 'Name', type: 'string', labels: {"en_US":"Location / Address","es_ES":"Dirección"}, label: 'Name', required: true },
  { key: 'shipToAddress', column: 'IsShipTo', type: 'boolean', labels: {"en_US":"Shipping Address","es_ES":"Dir.envíos"}, label: 'Shipping Address', required: true },
  { key: 'invoiceToAddress', column: 'IsBillTo', type: 'boolean', labels: {"en_US":"Invoicing Address","es_ES":"Dir.factura"}, label: 'Invoicing Address', required: true },
];
// @sf-generated-end columns:locationAddress

const filters = ['name'];

// @sf-generated-start component:LocationAddressTable
const LocationAddressTable = forwardRef(function LocationAddressTable(props, ref) {
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

export default LocationAddressTable;
// @sf-generated-end component:LocationAddressTable
