import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:orderLine
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, section: 'principal' },
  { key: 'product', column: 'M_Product_ID', type: 'search', required: true, section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'operativeQuantity', column: 'Aumqty', type: 'text', section: 'principal' },
  { key: 'operativeUOM', column: 'C_Aum', type: 'selector', section: 'principal', reference: 'UOM', inputMode: 'selector' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'text', required: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'UOM' },
  { key: 'unitPrice', column: 'PriceActual', type: 'text', required: true, section: 'other' },
  { key: 'grossUnitPrice', column: 'Gross_Unit_Price', type: 'text', section: 'other' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', required: true, section: 'other' },
  { key: 'lineGrossAmount', column: 'Line_Gross_Amount', type: 'number', readOnly: true, section: 'other' },
  { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, section: 'other', reference: 'Tax', inputMode: 'selector' },
  { key: 'listPrice', column: 'PriceList', type: 'text', required: true, readOnly: true, section: 'other' },
  { key: 'grossListPrice', column: 'GrossPriceList', type: 'text', readOnly: true, section: 'other' },
  { key: 'discount', column: 'Discount', type: 'text', section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number', section: 'other' },
  { key: 'project', column: 'C_Project_ID', type: 'search', section: 'other', reference: 'Project', inputMode: 'search' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', section: 'other', reference: 'CostCenter', inputMode: 'selector' },
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', section: 'other', reference: 'Asset', inputMode: 'selector' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', section: 'other', reference: 'UserDimension1', inputMode: 'selector' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', section: 'other', reference: 'UserDimension2', inputMode: 'selector' },
];
// @sf-generated-end fields:orderLine

// @sf-generated-start component:OrderLineForm
export default function OrderLineForm(props) {
  // @sf-custom-slot hooks:OrderLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:OrderLineForm

// @sf-custom-slot section:OrderLineForm-custom
