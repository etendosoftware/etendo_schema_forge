import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:quotationLine
const fields = [
  // @sf-custom-slot callout:SL_Order_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, section: 'principal', defaultValue: '1' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'unitPrice', column: 'PriceActual', type: 'number', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', required: true, readOnly: true, section: 'other' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, section: 'principal', reference: 'Tax', inputMode: 'selector' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'discount', column: 'Discount', type: 'number', section: 'other', defaultValue: '0' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
];
// @sf-generated-end fields:quotationLine

// @sf-generated-start component:QuotationLineForm
export default function QuotationLineForm(props) {
  // @sf-custom-slot hooks:QuotationLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:QuotationLineForm

// @sf-custom-slot section:QuotationLineForm-custom
