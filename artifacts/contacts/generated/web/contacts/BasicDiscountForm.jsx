import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:basicDiscount
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_BPARTNER_DISCOUNT WHERE C_BPARTNER_ID=@C_BPARTNER_ID@' },
  { key: 'discount', column: 'C_Discount_ID', type: 'selector', label: 'Basic Discount', required: true, section: 'principal', reference: 'Discount', inputMode: 'selector' },
  { key: 'customer', column: 'IsCustomer', type: 'checkbox', label: 'Customer', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'vendor', column: 'IsVendor', type: 'checkbox', label: 'Vendor', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'applyInOrder', column: 'Applyinorder', type: 'checkbox', label: 'Apply in Order', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', label: 'Cascade', required: true, section: 'principal', defaultValue: 'N' },
];
// @sf-generated-end fields:basicDiscount

// @sf-generated-start component:BasicDiscountForm
export default function BasicDiscountForm(props) {
  // @sf-custom-slot hooks:BasicDiscountForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BasicDiscountForm

// @sf-custom-slot section:BasicDiscountForm-custom
