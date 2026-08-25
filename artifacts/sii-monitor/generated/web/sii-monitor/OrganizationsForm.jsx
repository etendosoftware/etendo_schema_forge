import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:organizations
const fields = [
  { key: 'acogidaAlSII', column: 'Insiisystem', type: 'checkbox', label: 'In SII system', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'cIF', column: 'CIF', type: 'text', label: 'CIF', section: 'principal' },
  { key: 'conexiones', column: 'conexiones', type: 'number', label: 'Connections', section: 'principal' },
  { key: 'cashVAT', column: 'iscashvat', type: 'checkbox', label: 'Cash VAT', section: 'other' },
  { key: 'recc', column: 'Recc', type: 'checkbox', label: 'RECC affected', required: true, section: 'other' },
  { key: 'monitordate', column: 'Monitordate', type: 'date', label: 'From date display in "SII Monitor"', section: 'other', defaultValue: '01-01-2017' },
];
// @sf-generated-end fields:organizations

// @sf-generated-start component:OrganizationsForm
export default function OrganizationsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
OrganizationsForm.fields = fields;

// @sf-generated-end component:OrganizationsForm
