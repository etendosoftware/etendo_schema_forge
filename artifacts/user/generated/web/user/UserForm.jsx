import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:user
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'username', column: 'UserName', type: 'text', label: 'Username', required: true, section: 'principal' },
  { key: 'firstName', column: 'Firstname', type: 'text', label: 'First Name', section: 'principal' },
  { key: 'lastName', column: 'Lastname', type: 'text', label: 'Last Name', section: 'principal' },
  { key: 'password', column: 'Password', type: 'text', label: 'Password', section: 'security' },
  { key: 'isPasswordExpired', column: 'Isexpiredpassword', type: 'checkbox', label: 'Expired Password', readOnly: true, section: 'security', defaultValue: 'N' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'details' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', section: 'details', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'email', column: 'Email', type: 'text', label: 'Email', section: 'principal' },
  { key: 'locked', column: 'IsLocked', type: 'checkbox', label: 'Locked', required: true, readOnly: true, section: 'security', defaultValue: 'N' },
  { key: 'position', column: 'Title', type: 'text', label: 'Position', section: 'details' },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'details' },
  { key: 'supervisor', column: 'Supervisor_ID', type: 'search', label: 'Supervisor', section: 'details', reference: 'User', inputMode: 'search' },
  { key: 'defaultRole', column: 'Default_Ad_Role_ID', type: 'selector', label: 'Default Role', section: 'defaults', reference: 'Role', inputMode: 'selector' },
  { key: 'defaultLanguage', column: 'Default_Ad_Language', type: 'selector', label: 'Default Language', section: 'defaults', reference: 'Language', inputMode: 'selector' },
  { key: 'defaultClient', column: 'Default_Ad_Client_ID', type: 'dependent', label: 'Default Client', section: 'defaults', reference: 'Client', inputMode: 'dependent', dependsOn: { field: 'defaultRole', filterKey: 'Default_AD_Role_ID' } },
  { key: 'defaultOrganization', column: 'Default_Ad_Org_ID', type: 'dependent', label: 'Default Organization', section: 'defaults', reference: 'Organization', inputMode: 'dependent', dependsOn: { field: 'defaultRole', filterKey: 'Default_AD_Role_ID' } },
  { key: 'defaultWarehouse', column: 'Default_M_Warehouse_ID', type: 'dependent', label: 'Default Warehouse', section: 'defaults', reference: 'Warehouse', inputMode: 'dependent', dependsOn: { field: 'defaultClient', filterKey: 'Default_AD_Client_ID' } },
  { key: 'lastPasswordUpdate', column: 'LastPasswordUpdate', type: 'date', label: 'Last Password Update', required: true, readOnly: true, section: 'security', defaultValue: '@#Date@' },
];
// @sf-generated-end fields:user

// @sf-generated-start component:UserForm
export default function UserForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:UserForm
