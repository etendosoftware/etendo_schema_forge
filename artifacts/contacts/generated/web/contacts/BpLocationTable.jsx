import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'name', column: 'Name', type: 'string' },
];

const filters = ['name'];

export default function BpLocationTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
