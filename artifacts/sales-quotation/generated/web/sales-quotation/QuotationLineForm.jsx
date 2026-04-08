import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:quotationLine
const fields = [
  // @sf-custom-slot callout:SL_Order_Product
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity', required: true, section: 'principal', defaultValue: '1', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true || record['gROSSPRICE'] === 'Y' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', label: 'Line Net Amount', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['editLineAmount'] !== true || record['gROSSPRICE'] === 'Y' },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true, section: 'principal', reference: 'Tax', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  // @sf-custom-slot callout:SL_Order_Amt
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount', section: 'other', defaultValue: '0', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
];
// @sf-generated-end fields:quotationLine

// @sf-generated-start component:QuotationLineForm
export default function QuotationLineForm(props) {
  // @sf-custom-slot hooks:QuotationLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:QuotationLineForm

// @sf-custom-slot section:QuotationLineForm-custom
