import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:internalConsumption
const fields = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60, readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
];
// @sf-generated-end fields:internalConsumption

// @sf-generated-start component:InternalConsumptionForm
export default function InternalConsumptionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
InternalConsumptionForm.fields = fields;

// @sf-generated-end component:InternalConsumptionForm
