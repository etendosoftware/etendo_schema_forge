import { forwardRef } from 'react';
import { DataTable, InlineLinesPanel } from '@/components/contract-ui';

// @sf-generated-start columns:priceList
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', required: true },
  { key: 'salesPriceList', column: 'IsSOPriceList', type: 'boolean', labels: {"es_ES":"Tipo","en_US":"Type"}, label: 'Sales Price List', badge: true, badgeLabels: {"true":{"es_ES":"Venta","en_US":"Sales"},"false":{"es_ES":"Compra","en_US":"Purchase"}}, badgeVariants: {"true":"blue","false":"purple"}, required: true },
  { key: 'default', column: 'IsDefault', type: 'boolean', labels: {"es_ES":"Por defecto","en_US":"Default"}, label: 'Default', badge: true, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, required: true },
  { key: 'etgoProductcount', column: 'EM_Etgo_Productcount', type: 'number', labels: {"es_ES":"Nº de productos","en_US":"Product Count"}, label: 'Product Count' },
  { key: 'active', column: 'IsActive', type: 'boolean', labels: {"es_ES":"Activo","en_US":"Active"}, label: 'Active', badge: true, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, required: true },
];
// @sf-generated-end columns:priceList

const filters = ['name'];

// @sf-generated-start component:PriceListTable
const PriceListTable = forwardRef(function PriceListTable(props, ref) {
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

export default PriceListTable;
// @sf-generated-end component:PriceListTable
