import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:logHash
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other', defaultValue: 'Y' },
  { key: 'logs', column: 'Logs', type: 'text', label: 'Logs', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:logHash

// @sf-generated-start component:LogHashForm
export default function LogHashForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
LogHashForm.fields = fields;

// @sf-generated-end component:LogHashForm
