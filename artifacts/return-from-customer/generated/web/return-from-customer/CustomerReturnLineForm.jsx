import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:customerReturnLine
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, readOnly: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, section: 'principal', label: 'Return Qty' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', required: true, readOnly: true, section: 'principal' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', required: true, readOnly: true, section: 'principal' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, readOnly: true, section: 'principal', reference: 'Tax', inputMode: 'selector' },
];
// @sf-generated-end fields:customerReturnLine

// @sf-generated-start component:CustomerReturnLineForm
export default function CustomerReturnLineForm(props) {
  // @sf-custom-slot hooks:CustomerReturnLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:CustomerReturnLineForm

// @sf-custom-slot section:CustomerReturnLineForm-custom
