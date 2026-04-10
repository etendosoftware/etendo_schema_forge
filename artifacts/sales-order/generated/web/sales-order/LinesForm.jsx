import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity', required: true, section: 'principal', defaultValue: '1', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true || record['gROSSPRICE'] === 'Y' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', label: 'Line Net Amount', required: true, section: 'principal', readOnlyLogic: (record) => record['editLineAmount'] !== true || record['gROSSPRICE'] === 'Y' },
  { key: 'tax', column: 'C_Tax_ID', type: 'search', label: 'Tax', required: true, section: 'principal', reference: 'Tax', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount', section: 'principal', defaultValue: '0', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:LinesForm
