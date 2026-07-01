import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:internalConsumption
const fields = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:internalConsumption

// @sf-generated-start component:InternalConsumptionForm
export default function InternalConsumptionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:InternalConsumptionForm
