import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:user
const fields = [
  // @sf-custom-slot callout:SL_User_Name
  { key: 'firstName', column: 'Firstname', type: 'text', label: 'First Name', section: 'principal' },
  // @sf-custom-slot callout:SL_User_Name
  { key: 'lastName', column: 'Lastname', type: 'text', label: 'Last Name', section: 'principal' },
  { key: 'email', column: 'Email', type: 'text', label: 'Email', section: 'principal' },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'principal' },
  { key: 'alternativePhone', column: 'Phone2', type: 'text', label: 'Alternative Phone', section: 'principal' },
  { key: 'position', column: 'Title', type: 'text', label: 'Position', section: 'principal' },
  { key: 'comments', column: 'Comments', type: 'textarea', label: 'Comments', section: 'principal' },
  { key: 'active', column: 'IsActive', type: 'checkbox', label: 'Active', required: true, readOnly: true, section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:user

// @sf-generated-start component:UserForm
export default function UserForm(props) {
  // @sf-custom-slot hooks:UserForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:UserForm

// @sf-custom-slot section:UserForm-custom
