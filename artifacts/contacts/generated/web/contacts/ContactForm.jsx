import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:contact
const fields = [
  { key: 'firstName', column: 'Firstname', type: 'text', label: 'First Name', section: 'principal', maxLength: 60 },
  { key: 'lastName', column: 'Lastname', type: 'text', label: 'Last Name', section: 'principal', maxLength: 60 },
  { key: 'email', column: 'Email', type: 'text', label: 'Email', section: 'principal', maxLength: 255 },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'principal', maxLength: 40 },
  { key: 'position', column: 'Title', type: 'text', label: 'Position', section: 'principal', maxLength: 40 },
  { key: 'comments', column: 'Comments', type: 'textarea', label: 'Comments', section: 'principal', maxLength: 2000 },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:contact

// @sf-generated-start component:ContactForm
export default function ContactForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ContactForm.fields = fields;

// @sf-generated-end component:ContactForm
