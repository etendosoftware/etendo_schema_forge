import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', section: 'principal' },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', required: true, section: 'principal' },
  { key: 'offsetMonthDue', column: 'FixMonthOffset', type: 'number', label: 'Offset Month Due', required: true, section: 'principal' },
  { key: 'fixedDueDate', column: 'IsDueFixed', type: 'checkbox', label: 'Fixed Due Date', required: true, section: 'principal' },
  { key: 'maturityDate1', column: 'FixMonthDay', type: 'number', label: 'Maturity Date 1', section: 'principal' },
  { key: 'maturityDate2', column: 'FixMonthDay2', type: 'number', label: 'Maturity Date 2', section: 'principal' },
  { key: 'maturityDate3', column: 'Fixmonthday3', type: 'number', label: 'Maturity Date 3', section: 'principal' },
  { key: 'overduePaymentDayRule', column: 'NetDay', type: 'select', label: 'Fixed Week Day', section: 'principal', options: [{ value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' }, { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' }, { value: '7', label: 'Sunday' }] },
  { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'checkbox', label: 'Next Business Day', section: 'principal' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:HeaderForm
