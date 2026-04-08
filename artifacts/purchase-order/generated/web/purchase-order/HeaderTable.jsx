import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:header
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date' },
  { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'string', label: 'Transaction Document' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string', label: 'Warehouse' },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'string', label: 'Price List' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
  { key: 'priority', column: 'PriorityRule', type: 'enum', label: 'Priority', enumLabels: { '3': 'High', '7': 'Low', '5': 'Medium' } },
  { key: 'deliveryStatusPurchase', column: 'DeliveryStatusPurchase', type: 'number', label: 'Delivery Status' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'number', label: 'Invoice Status' },
];
// @sf-generated-end columns:header

const filters = ['documentNo', 'businessPartner', 'orderDate', 'documentStatus', 'orderReference'];

// @sf-generated-start component:HeaderTable
export default function HeaderTable(props) {
  // @sf-custom-slot hooks:HeaderTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:HeaderTable

// @sf-custom-slot section:HeaderTable-custom
