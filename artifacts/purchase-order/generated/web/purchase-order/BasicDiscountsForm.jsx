import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:basicDiscounts
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM C_ORDER_DISCOUNT WHERE C_ORDER_ID=@C_ORDER_ID@' },
  { key: 'discount', column: 'C_Discount_ID', type: 'search', label: 'Basic Discount', required: true, readOnly: true, section: 'other', reference: 'Discount' },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', label: 'Cascade', required: true, readOnly: true, section: 'other', defaultValue: 'N' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other', defaultValue: 'Y' },
];
// @sf-generated-end fields:basicDiscounts

// @sf-generated-start component:BasicDiscountsForm
export default function BasicDiscountsForm(props) {
  // @sf-custom-slot hooks:BasicDiscountsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BasicDiscountsForm

// @sf-custom-slot section:BasicDiscountsForm-custom
