import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', display: 'dot' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'deliveryStatus', column: 'DeliveryStatus', type: 'percent' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent' },
];
// @sf-generated-end columns:header

const filters = ['documentNo', 'orderDate', 'businessPartner', 'documentStatus', 'orderReference'];

// @sf-generated-start component:HeaderTable
export default function HeaderTable(props) {
  // @sf-custom-slot hooks:HeaderTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:HeaderTable

// @sf-custom-slot section:HeaderTable-custom
