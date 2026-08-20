import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:user
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'password', column: 'Password', type: 'text', label: 'Password', section: 'security', displayLogic: (record) => !!record.id },
  { key: 'isPasswordExpired', column: 'Isexpiredpassword', type: 'checkbox', label: 'Expired Password', readOnly: true, section: 'security' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'details' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', section: 'details', reference: 'BusinessPartner', inputMode: 'search' },
  { key: 'email', column: 'Email', type: 'text', label: 'Email', required: true, section: 'principal', readOnlyLogic: (record) => !!record.id },
  { key: 'locked', column: 'IsLocked', type: 'checkbox', label: 'Locked', required: true, readOnly: true, section: 'security' },
  { key: 'position', column: 'Title', type: 'text', label: 'Position', section: 'details' },
  { key: 'phone', column: 'Phone', type: 'text', label: 'Phone', section: 'details' },
  { key: 'supervisor', column: 'Supervisor_ID', type: 'search', label: 'Supervisor', section: 'details', reference: 'User', inputMode: 'search' },
  { key: 'defaultLanguage', column: 'Default_Ad_Language', type: 'selector', label: 'Default Language', section: 'defaults', reference: 'Language', inputMode: 'selector' },
  { key: 'defaultClient', column: 'Default_Ad_Client_ID', type: 'dependent', label: 'Default Client', section: 'defaults', reference: 'Client', inputMode: 'dependent', dependsOn: { field: 'defaultRole', filterKey: 'Default_AD_Role_ID' } },
  { key: 'defaultOrganization', column: 'Default_Ad_Org_ID', type: 'dependent', label: 'Default Organization', section: 'defaults', reference: 'Organization', inputMode: 'dependent', dependsOn: { field: 'defaultRole', filterKey: 'Default_AD_Role_ID' } },
  { key: 'defaultWarehouse', column: 'Default_M_Warehouse_ID', type: 'dependent', label: 'Default Warehouse', section: 'defaults', reference: 'Warehouse', inputMode: 'dependent', dependsOn: { field: 'defaultClient', filterKey: 'Default_AD_Client_ID' } },
  { key: 'lastPasswordUpdate', column: 'LastPasswordUpdate', type: 'date', label: 'Last Password Update', required: true, readOnly: true, section: 'security' },
];
// @sf-generated-end fields:user

// @sf-generated-start component:UserForm
export default function UserForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
UserForm.fields = fields;

// @sf-generated-end component:UserForm
