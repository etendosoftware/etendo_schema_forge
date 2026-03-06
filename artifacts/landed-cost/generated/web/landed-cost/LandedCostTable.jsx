import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'organization', label: 'Organization', type: 'string' },
  { key: 'dateAcct', label: 'Date Acct', type: 'date' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
];

const filters = ['organization', 'dateAcct', 'description', 'documentNo', 'docStatus'];

export default function LandedCostTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
