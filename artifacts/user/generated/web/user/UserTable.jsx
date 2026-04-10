import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:user
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'username', column: 'UserName', type: 'string', label: 'Username' },
  { key: 'firstName', column: 'Firstname', type: 'string', label: 'First Name' },
  { key: 'lastName', column: 'Lastname', type: 'string', label: 'Last Name' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'email', column: 'Email', type: 'string', label: 'Email' },
  { key: 'locked', column: 'IsLocked', type: 'boolean', label: 'Locked' },
  { key: 'defaultRole', column: 'Default_Ad_Role_ID', type: 'string', label: 'Default Role' },
];
// @sf-generated-end columns:user

const filters = ['name', 'username', 'email'];

// @sf-generated-start component:UserTable
export default function UserTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:UserTable
