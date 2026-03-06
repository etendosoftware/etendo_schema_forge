import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'dateRequired', label: 'Date Required', type: 'date' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'user', label: 'User', type: 'string' },
];

const filters = ['businessPartner', 'dateRequired', 'description', 'documentNo', 'docStatus'];

export default function RequisitionTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
