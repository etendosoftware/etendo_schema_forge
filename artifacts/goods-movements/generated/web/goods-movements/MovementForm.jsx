import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:movement
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:movement

// @sf-generated-start component:MovementForm
export default function MovementForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:MovementForm
