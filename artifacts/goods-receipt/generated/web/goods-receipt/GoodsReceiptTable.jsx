import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'movementDate', label: 'Movement Date', type: 'date' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
];

const filters = ['businessPartner', 'movementDate', 'warehouse', 'poReference', 'documentNo', 'docStatus'];

export default function GoodsReceiptTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
