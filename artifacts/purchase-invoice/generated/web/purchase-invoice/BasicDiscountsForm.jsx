import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:basicDiscounts
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, section: 'principal' },
  { key: 'discount', column: 'C_Discount_ID', type: 'selector', required: true, section: 'principal', reference: 'Discount', inputMode: 'selector' },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', required: true, section: 'principal' },
];
// @sf-generated-end fields:basicDiscounts

// @sf-generated-start component:BasicDiscountsForm
export default function BasicDiscountsForm(props) {
  // @sf-custom-slot hooks:BasicDiscountsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BasicDiscountsForm

// @sf-custom-slot section:BasicDiscountsForm-custom
