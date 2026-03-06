import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'dateRequired', label: 'Date Required', type: 'date' },
  { key: 'dateDoc', label: 'Date Doc', type: 'date' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'user', label: 'User', type: 'string' },
  { key: 'organization', label: 'Organization', type: 'string' },
  { key: 'cCurrencyId', label: 'C Currency Id', type: 'string' },
];

const filters = ['documentNo', 'docStatus', 'businessPartner', 'dateRequired', 'dateDoc', 'warehouse', 'user', 'organization', 'description'];

export default function RequisitionTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
