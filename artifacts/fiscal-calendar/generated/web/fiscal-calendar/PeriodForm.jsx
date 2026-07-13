import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:period
const fields = [
  { key: 'periodNo', column: 'PeriodNo', type: 'number', label: 'Period No.', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, readOnly: true, section: 'other' },
  { key: 'startingDate', column: 'StartDate', type: 'date', label: 'Starting Date', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'endingDate', column: 'EndDate', type: 'date', label: 'Ending Date', readOnly: true, section: 'other', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'periodType', column: 'PeriodType', type: 'select', label: 'Period Type', required: true, readOnly: true, section: 'other', options: [{ value: 'A', label: 'Adjustment Period', labels: {"es_ES":"Cambio periodo"} }, { value: 'S', label: 'Standard Calendar Period', labels: {"es_ES":"Calendario Periodo estándar"} }], defaultValue: 'S', readOnlyLogic: (record) => record['c_Period_Not_Editable'] === 'Y' },
  { key: 'status', column: 'Status', type: 'select', label: 'Status', readOnly: true, section: 'other', options: [{ value: 'C', label: 'All Closed', labels: {"es_ES":"Todos cerrados"} }, { value: 'N', label: 'All Never Opened', labels: {"es_ES":"Ningún periodo abierto."} }, { value: 'O', label: 'All Opened', labels: {"es_ES":"Todos abiertos"} }, { value: 'P', label: 'All Permanently Closed', labels: {"es_ES":"Todos permanentemente cerrados"} }, { value: 'M', label: 'Mixed', labels: {"es_ES":"Mixto"} }] },
];
// @sf-generated-end fields:period

// @sf-generated-start component:PeriodForm
export default function PeriodForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:PeriodForm
