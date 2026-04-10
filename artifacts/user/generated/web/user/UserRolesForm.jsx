import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:userRoles
const fields = [
  { key: 'role', column: 'AD_Role_ID', type: 'selector', label: 'Role', required: true, section: 'principal', reference: 'Role', inputMode: 'selector' },
  { key: 'roleAdmin', column: 'Is_Role_Admin', type: 'checkbox', label: 'Role Administrator', required: true, section: 'principal', defaultValue: 'N' },
];
// @sf-generated-end fields:userRoles

// @sf-generated-start component:UserRolesForm
export default function UserRolesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:UserRolesForm
