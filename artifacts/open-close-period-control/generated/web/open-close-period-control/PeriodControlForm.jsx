import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:periodControl
const fields = [
  { key: 'status', column: 'Status', type: 'select', label: 'Status', readOnly: true, section: 'other', options: [{ value: 'C', label: 'All Closed' }, { value: 'N', label: 'All Never Opened' }, { value: 'O', label: 'All Opened' }, { value: 'P', label: 'All Permanently Closed' }, { value: 'M', label: 'Mixed' }] },
  { key: 'calendar', column: 'C_Calendar_ID', type: 'selector', label: 'Calendar', required: true, readOnly: true, section: 'other', reference: 'Calendar', inputMode: 'selector' },
  { key: 'year', column: 'C_Year_ID', type: 'selector', label: 'Year', required: true, readOnly: true, section: 'other', reference: 'Year', inputMode: 'selector' },
  { key: 'periodNo', column: 'PeriodNo', type: 'number', label: 'Period No.', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, readOnly: true, section: 'other' },
  { key: 'startingDate', column: 'StartDate', type: 'date', label: 'Starting Date', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'endingDate', column: 'EndDate', type: 'date', label: 'Ending Date', readOnly: true, section: 'other', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'periodType', column: 'PeriodType', type: 'select', label: 'Period Type', required: true, readOnly: true, section: 'other', options: [{ value: 'A', label: 'Adjustment Period' }, { value: 'S', label: 'Standard Calendar Period' }], defaultValue: 'S', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
];
// @sf-generated-end fields:periodControl

// @sf-generated-start component:PeriodControlForm
export default function PeriodControlForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:PeriodControlForm
