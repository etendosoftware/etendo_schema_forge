import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:contact
const fields = [
  { key: 'firstName', column: 'Firstname', type: 'text', label: 'First Name', section: 'principal' },
  { key: 'lastName', column: 'Lastname', type: 'text', label: 'Last Name', section: 'principal' },
  { key: 'email', column: 'Email', type: 'text', label: 'Email', section: 'principal' },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'principal' },
  { key: 'position', column: 'Title', type: 'text', label: 'Position', section: 'principal' },
  { key: 'comments', column: 'Comments', type: 'textarea', label: 'Comments', section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:contact

// @sf-generated-start component:ContactForm
export default function ContactForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ContactForm.fields = fields;

// @sf-generated-end component:ContactForm
