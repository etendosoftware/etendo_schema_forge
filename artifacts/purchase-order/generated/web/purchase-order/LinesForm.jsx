import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', required: true, lookup: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', maxLength: 2000 },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity', required: true, section: 'principal', defaultValue: '1', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') || ((record['salesTransaction'] === true || record['salesTransaction'] === 'Y') && record['iSLINKEDTOPRODUCT'] === 'Y' && record['pRODUCTTYPE'] === 'S') || record['uomManagement'] === 'Y' },
  { key: 'listPrice', column: 'PriceList', type: 'number', label: 'Net List Price', required: true, section: 'principal', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount %', section: 'principal', defaultValue: '0', min: 0, readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', required: true, section: 'principal', reference: 'Tax', inputMode: 'selector', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'lineGrossAmount', column: 'Line_Gross_Amount', type: 'number', label: 'Line Gross Amount', readOnly: true, section: 'principal', defaultValue: '0' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
LinesForm.fields = fields;

// @sf-generated-end component:LinesForm
