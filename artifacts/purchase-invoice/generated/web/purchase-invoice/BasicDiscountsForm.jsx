import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:basicDiscounts
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_INVOICE_DISCOUNT WHERE C_INVOICE_ID=@C_INVOICE_ID@' },
  { key: 'discount', column: 'C_Discount_ID', type: 'selector', label: 'Basic Discount', required: true, section: 'principal', reference: 'Discount', inputMode: 'selector' },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', label: 'Cascade', required: true, section: 'principal', defaultValue: 'N' },
];
// @sf-generated-end fields:basicDiscounts

// @sf-generated-start component:BasicDiscountsForm
export default function BasicDiscountsForm(props) {
  // @sf-custom-slot hooks:BasicDiscountsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BasicDiscountsForm

// @sf-custom-slot section:BasicDiscountsForm-custom
