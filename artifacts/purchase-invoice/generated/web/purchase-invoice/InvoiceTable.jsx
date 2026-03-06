import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'dateInvoiced', label: 'Date Invoiced', type: 'date' },
  { key: 'currency', label: 'Currency', type: 'string' },
  { key: 'poReference', label: 'Po Reference', type: 'string' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'isPaid', label: 'Is Paid', type: 'boolean' },
];

const filters = ['businessPartner', 'dateInvoiced', 'poReference', 'documentNo', 'docStatus'];

export default function InvoiceTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
