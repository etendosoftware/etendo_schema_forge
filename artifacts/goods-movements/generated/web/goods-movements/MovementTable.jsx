import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:movement
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date' },
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'processed', column: 'Processed', type: 'status', label: 'Status' },
];
// @sf-generated-end columns:movement

const filters = ['name', 'movementDate'];

// @sf-generated-start component:MovementTable
export default function MovementTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:MovementTable
