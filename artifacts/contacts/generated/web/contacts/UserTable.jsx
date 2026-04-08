import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:user
const columns = [
  { key: 'firstName', column: 'Firstname', type: 'string', label: 'First Name' },
  { key: 'lastName', column: 'Lastname', type: 'string', label: 'Last Name' },
  { key: 'email', column: 'Email', type: 'string', label: 'Email' },
  { key: 'phone', column: 'Phone', type: 'string', label: 'Phone' },
];
// @sf-generated-end columns:user

const filters = ['name', 'email'];

// @sf-generated-start component:UserTable
export default function UserTable(props) {
  // @sf-custom-slot hooks:UserTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:UserTable

// @sf-custom-slot section:UserTable-custom
