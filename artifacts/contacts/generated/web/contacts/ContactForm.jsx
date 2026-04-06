import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:contact
const fields = [
  // @sf-custom-slot callout:SL_User_Name
  { key: 'firstName', column: 'Firstname', type: 'text', label: 'First Name', section: 'principal' },
  // @sf-custom-slot callout:SL_User_Name
  { key: 'lastName', column: 'Lastname', type: 'text', label: 'Last Name', section: 'principal' },
  { key: 'email', column: 'Email', type: 'text', label: 'Email', section: 'principal' },
  // @sf-custom-slot callout:SL_User_Name
  { key: 'name', column: 'Name', type: 'text', label: 'User', required: true, readOnly: true, section: 'principal' },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'principal' },
  { key: 'alternativePhone', column: 'Phone2', type: 'text', label: 'Alternative Phone', section: 'principal' },
  { key: 'position', column: 'Title', type: 'text', label: 'Position', section: 'principal' },
  { key: 'comments', column: 'Comments', type: 'textarea', label: 'Comments', section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'other' },
  { key: 'isdefaultfordocs', column: 'Isdefaultfordocs', type: 'checkbox', label: 'Default', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'commercialauth', column: 'Commercialauth', type: 'checkbox', label: 'Commercial authorization', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'viasms', column: 'Viasms', type: 'checkbox', label: 'Sms', required: true, section: 'other', defaultValue: 'N' },
  { key: 'viaemail', column: 'Viaemail', type: 'checkbox', label: 'Email', required: true, section: 'other', defaultValue: 'N' },
];
// @sf-generated-end fields:contact

// @sf-generated-start component:ContactForm
export default function ContactForm(props) {
  // @sf-custom-slot hooks:ContactForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ContactForm

// @sf-custom-slot section:ContactForm-custom
