import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productPo
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'BusinessPartner', inputMode: 'selector', defaultValue: '@C_BPartner_ID@' },
  { key: 'currentVendor', column: 'IsCurrentVendor', type: 'checkbox', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'listPrice', column: 'PriceList', type: 'text', section: 'principal' },
  { key: 'purchaseOrderPrice', column: 'PricePO', type: 'text', section: 'principal' },
  { key: 'lastPurchasePrice', column: 'PriceLastPO', type: 'text', readOnly: true, section: 'other' },
  { key: 'lastInvoicePrice', column: 'PriceLastInv', type: 'text', readOnly: true, section: 'other' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'selector', section: 'other', reference: 'UOM', inputMode: 'selector' },
  { key: 'minimumOrderQty', column: 'Order_Min', type: 'text', section: 'other' },
  { key: 'purchasingLeadTime', column: 'DeliveryTime_Promised', type: 'number', section: 'other' },
];
// @sf-generated-end fields:productPo

// @sf-generated-start component:ProductPoForm
export default function ProductPoForm(props) {
  // @sf-custom-slot hooks:ProductPoForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductPoForm

// @sf-custom-slot section:ProductPoForm-custom
