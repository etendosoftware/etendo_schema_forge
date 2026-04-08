import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'employee', column: 'IsEmployee', type: 'checkbox', section: 'principal' },
  { key: 'isSalesRepresentative', column: 'IsSalesRep', type: 'checkbox', section: 'principal' },
];

export default function EmployeeForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
