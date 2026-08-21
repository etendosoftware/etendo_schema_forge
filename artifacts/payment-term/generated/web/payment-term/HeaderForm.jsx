import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'offsetMonthDue', column: 'FixMonthOffset', type: 'number', label: 'Offset Month Due', required: true, section: 'principal' },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', required: true, section: 'principal' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', section: 'principal' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
HeaderForm.fields = fields;

// @sf-generated-end component:HeaderForm
