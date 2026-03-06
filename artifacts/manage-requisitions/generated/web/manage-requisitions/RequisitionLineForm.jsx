import { EntityForm } from '@/components/contract-ui';

const fields = [

];

export default function RequisitionLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
