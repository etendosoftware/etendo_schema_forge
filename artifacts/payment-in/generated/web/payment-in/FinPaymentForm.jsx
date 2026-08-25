import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:finPayment
const fields = [

];
// @sf-generated-end fields:finPayment

// @sf-generated-start component:FinPaymentForm
export default function FinPaymentForm(props) {
  return <EntityForm fields={fields} cols={3} {...props} />;
}
FinPaymentForm.fields = fields;

// @sf-generated-end component:FinPaymentForm
