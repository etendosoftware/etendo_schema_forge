import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'searchKey', column: 'Value', type: 'string' },
  { key: 'active', column: 'IsActive', type: 'boolean' },
];

const filters = ['name', 'searchKey'];

export default function BusinessPartnerTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
