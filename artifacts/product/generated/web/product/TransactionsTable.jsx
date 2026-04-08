import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:transactions
const columns = [
  { key: 'organization', column: 'AD_Org_ID', type: 'string', label: 'Organization' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string', label: 'Storage Bin' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number', label: 'Movement Quantity' },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date' },
  { key: 'movementType', column: 'MovementType', type: 'enum', label: 'Movement Type', enumLabels: { 'V+': 'Vendor Receipts', 'I+': 'Inventory In', 'M-': 'Movement From', 'M+': 'Movement To', 'I-': 'Inventory Out', 'P-': 'Production -', 'P+': 'Production +', 'C-': 'Customer Shipment', 'D-': 'Internal Consumption -', 'D+': 'Internal Consumption +' } },
  { key: 'totalCost', column: 'TotalCost', type: 'amount', label: 'Total Cost' },
];
// @sf-generated-end columns:transactions

const filters = [];

// @sf-generated-start component:TransactionsTable
export default function TransactionsTable(props) {
  // @sf-custom-slot hooks:TransactionsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:TransactionsTable

// @sf-custom-slot section:TransactionsTable-custom
