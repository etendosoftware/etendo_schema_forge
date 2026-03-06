import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'orderDate', label: 'Order Date', type: 'date' },
  { key: 'poReference', label: 'Po Reference', type: 'string' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'currency', label: 'Currency', type: 'string' },
];

const filters = ['businessPartner', 'orderDate', 'poReference', 'documentNo', 'docStatus'];

export default function OrderTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
