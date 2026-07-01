import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:quotationLine
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, lookup: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity', required: true, section: 'principal', defaultValue: '1', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'listPrice', column: 'PriceList', type: 'number', label: 'Net List Price', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount', section: 'other', defaultValue: '0', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true, section: 'other', reference: 'Tax', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'lineGrossAmount', column: 'Line_Gross_Amount', type: 'number', label: 'Line Gross Amount', readOnly: true, section: 'principal', defaultValue: '0' },
];
// @sf-generated-end fields:quotationLine

// @sf-generated-start component:QuotationLineForm
export default function QuotationLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:QuotationLineForm
