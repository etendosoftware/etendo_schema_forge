import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpartner
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Commercial Name' },
];
// @sf-generated-end columns:bpartner

const filters = ['name', 'searchKey'];

// @sf-generated-start component:BpartnerTable
export default function BpartnerTable(props) {
  // @sf-custom-slot hooks:BpartnerTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpartnerTable

// @sf-custom-slot section:BpartnerTable-custom
