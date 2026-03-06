import { EntityForm } from '@/components/contract-ui';

const fields = [

];

export default function LandedCostAllocationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
