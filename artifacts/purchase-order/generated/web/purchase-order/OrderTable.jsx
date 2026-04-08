import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:order
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date' },
  { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'string' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string' },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'string' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'priority', column: 'PriorityRule', type: 'string' },
  { key: 'deliveryStatusPurchase', column: 'DeliveryStatusPurchase', type: 'status' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'status' },
];
// @sf-generated-end columns:order

const filters = ['documentNo', 'businessPartner', 'orderDate', 'documentStatus', 'orderReference'];

// @sf-generated-start component:OrderTable
export default function OrderTable(props) {
  // @sf-custom-slot hooks:OrderTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:OrderTable

// @sf-custom-slot section:OrderTable-custom
