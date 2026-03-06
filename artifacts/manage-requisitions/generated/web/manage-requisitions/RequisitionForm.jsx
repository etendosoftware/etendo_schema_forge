import { EntityForm } from '@/components/contract-ui';

const fields = [

];

export default function RequisitionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
