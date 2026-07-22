import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', lookup: true, section: 'principal', reference: 'Product', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: 'Invoiced Quantity', required: true, section: 'principal', defaultValue: '1', min: 0, readOnlyLogic: (record) => record['processed'] === true || (record['uomManagement'] === 'Y' && record['financialInvoiceLine'] !== true) },
  { key: 'listPrice', column: 'PriceList', type: 'number', label: 'List Price', required: true, section: 'principal', min: 0, readOnlyLogic: (record) => record['processed'] === true },
  { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: 'Discount %', section: 'principal', defaultValue: '0', min: 0, readOnlyLogic: (record) => record['processed'] === true },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', section: 'principal', reference: 'Tax', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'grossAmount', column: 'Line_Gross_Amount', type: 'number', label: 'Line Gross Amount', readOnly: true, section: 'principal', defaultValue: '0' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:LinesForm
