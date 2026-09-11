import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:costing
const fields = [
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost', required: true, section: 'principal', readOnlyLogic: (record) => record.manual === false || record.manual === 'N' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date', required: true, section: 'principal', readOnlyLogic: (record) => record.manual === false || record.manual === 'N' },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date', section: 'principal', readOnlyLogic: (record) => record.manual === false || record.manual === 'N' },
];
// @sf-generated-end fields:costing

// @sf-generated-start component:CostingForm
export default function CostingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
CostingForm.fields = fields;

// @sf-generated-end component:CostingForm
