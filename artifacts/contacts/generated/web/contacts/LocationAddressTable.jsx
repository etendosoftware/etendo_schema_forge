import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:locationAddress
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
];
// @sf-generated-end columns:locationAddress

const filters = ['name'];

// @sf-generated-start component:LocationAddressTable
export default function LocationAddressTable(props) {
  // @sf-custom-slot hooks:LocationAddressTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:LocationAddressTable

// @sf-custom-slot section:LocationAddressTable-custom
