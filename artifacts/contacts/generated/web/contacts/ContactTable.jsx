import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:contact
const columns = [
  { key: 'firstName', column: 'Firstname', type: 'string', label: 'First Name' },
  { key: 'lastName', column: 'Lastname', type: 'string', label: 'Last Name' },
  { key: 'email', column: 'Email', type: 'string', label: 'Email' },
  { key: 'name', column: 'Name', type: 'string', label: 'User' },
  { key: 'phone', column: 'Phone', type: 'string', label: 'Phone' },
];
// @sf-generated-end columns:contact

const filters = ['email', 'name'];

// @sf-generated-start component:ContactTable
export default function ContactTable(props) {
  // @sf-custom-slot hooks:ContactTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ContactTable

// @sf-custom-slot section:ContactTable-custom
