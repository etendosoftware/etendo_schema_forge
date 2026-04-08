import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpLocation
const columns = [
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'city', column: 'City', type: 'string' },
  { key: 'country', column: 'C_Country_ID', type: 'string' },
];
// @sf-generated-end columns:bpLocation

const filters = ['name', 'city'];

// @sf-generated-start component:BpLocationTable
export default function BpLocationTable(props) {
  // @sf-custom-slot hooks:BpLocationTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpLocationTable

// @sf-custom-slot section:BpLocationTable-custom
