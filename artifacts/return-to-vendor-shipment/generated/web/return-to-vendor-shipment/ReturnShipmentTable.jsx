import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'movementDate', label: 'Movement Date', type: 'date' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'returnReason', label: 'Return Reason', type: 'string' },
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
];

const filters = ['businessPartner', 'movementDate', 'warehouse', 'returnReason', 'orderReference', 'poReference', 'documentNo', 'docStatus'];

export default function ReturnShipmentTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
