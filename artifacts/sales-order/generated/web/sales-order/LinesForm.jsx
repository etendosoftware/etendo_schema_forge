import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  // @sf-custom-slot callout:SL_Order_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, section: 'principal', defaultValue: '1' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'unitPrice', column: 'PriceActual', type: 'number', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'tax', column: 'C_Tax_ID', type: 'search', required: true, section: 'principal', reference: 'Tax', inputMode: 'search' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'discount', column: 'Discount', type: 'number', section: 'principal', defaultValue: '0' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'principal' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  // @sf-custom-slot hooks:LinesForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:LinesForm

// @sf-custom-slot section:LinesForm-custom
