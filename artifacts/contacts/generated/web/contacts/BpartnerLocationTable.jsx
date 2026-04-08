import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpartnerLocation
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
];
// @sf-generated-end columns:bpartnerLocation

const filters = ['name'];

// @sf-generated-start component:BpartnerLocationTable
export default function BpartnerLocationTable(props) {
  // @sf-custom-slot hooks:BpartnerLocationTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpartnerLocationTable

// @sf-custom-slot section:BpartnerLocationTable-custom
