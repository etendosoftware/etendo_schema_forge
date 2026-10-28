import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60, span: 2 },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', required: true, section: 'principal', span: 2 },
  { key: 'default', column: 'IsDefault', type: 'checkbox', labels: {"es_ES":"Por defecto","en_US":"Default"}, label: 'Default', section: 'principal', span: 2 },
  { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'checkbox', labels: {"es_ES":"Siguiente día hábil","en_US":"Next Business Day"}, label: 'Next Business Day', section: 'principal', span: 2 },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
HeaderForm.fields = fields;

// @sf-generated-end component:HeaderForm
