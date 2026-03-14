import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:basicDiscounts
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'discount', column: 'C_Discount_ID', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Discount' },
  { key: 'cascade', column: 'Cascade', type: 'checkbox', required: true, readOnly: true, section: 'other' },
  { key: 'active', column: 'Isactive', type: 'checkbox', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:basicDiscounts

// @sf-generated-start component:BasicDiscountsForm
export default function BasicDiscountsForm(props) {
  // @sf-custom-slot hooks:BasicDiscountsForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BasicDiscountsForm

// @sf-custom-slot section:BasicDiscountsForm-custom
