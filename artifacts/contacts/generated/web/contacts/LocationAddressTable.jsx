import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:locationAddress
const columns = [
  { key: 'name', column: 'Name', type: 'string', labels: {"en_US":"Location / Address","es_ES":"Dirección"}, label: 'Name', required: true, maxLength: 60 },
  { key: 'shipToAddress', column: 'IsShipTo', type: 'boolean', labels: {"en_US":"Shipping Address","es_ES":"Dir.envíos"}, label: 'Shipping Address', required: true },
  { key: 'invoiceToAddress', column: 'IsBillTo', type: 'boolean', labels: {"en_US":"Invoicing Address","es_ES":"Dir.factura"}, label: 'Invoicing Address', required: true },
];
// @sf-generated-end columns:locationAddress

const filters = ['name'];

// @sf-generated-start component:LocationAddressTable
const LocationAddressTable = forwardRef(function LocationAddressTable(props, ref) {
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

export default LocationAddressTable;
// @sf-generated-end component:LocationAddressTable
