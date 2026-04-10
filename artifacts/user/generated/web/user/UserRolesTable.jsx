import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:userRoles
const columns = [
  { key: 'role', column: 'AD_Role_ID', type: 'string', label: 'Role' },
  { key: 'roleAdmin', column: 'Is_Role_Admin', type: 'boolean', label: 'Role Administrator' },
];
// @sf-generated-end columns:userRoles

const filters = ['role'];

// @sf-generated-start component:UserRolesTable
export default function UserRolesTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:UserRolesTable
