import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:replacementOrders
const fields = [
  { key: 'cReplacementID', column: 'C_Replacement_ID', type: 'search', required: true, section: 'principal', reference: 'Order', inputMode: 'search' },
];
// @sf-generated-end fields:replacementOrders

// @sf-generated-start component:ReplacementOrdersForm
export default function ReplacementOrdersForm(props) {
  // @sf-custom-slot hooks:ReplacementOrdersForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ReplacementOrdersForm

// @sf-custom-slot section:ReplacementOrdersForm-custom
