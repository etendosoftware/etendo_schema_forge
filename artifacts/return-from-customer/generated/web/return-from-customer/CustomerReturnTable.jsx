import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:customerReturn
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', display: 'dot' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
];
// @sf-generated-end columns:customerReturn

const filters = ['documentStatus', 'documentNo', 'orderDate', 'businessPartner'];

// @sf-generated-start component:CustomerReturnTable
export default function CustomerReturnTable(props) {
  // @sf-custom-slot hooks:CustomerReturnTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:CustomerReturnTable

// @sf-custom-slot section:CustomerReturnTable-custom
