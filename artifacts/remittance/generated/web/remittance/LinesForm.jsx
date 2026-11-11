import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:lines
const fields = [
  { key: 'amount', column: 'Amount', type: 'number', labels: {"es_ES":"A remesar","es_AR":"A remesar","en_US":"To remit"}, label: 'Amount', required: true, readOnly: true, section: 'other', defaultValue: '0' },
];
// @sf-generated-end fields:lines

// @sf-generated-start component:LinesForm
export default function LinesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
LinesForm.fields = fields;

// @sf-generated-end component:LinesForm
