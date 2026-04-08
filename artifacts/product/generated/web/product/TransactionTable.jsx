import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:transaction
const columns = [
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'string' },
  { key: 'movementDate', column: 'MovementDate', type: 'date' },
  { key: 'movementType', column: 'MovementType', type: 'string' },
  { key: 'totalCost', column: 'TotalCost', type: 'amount' },
];
// @sf-generated-end columns:transaction

const filters = [];

// @sf-generated-start component:TransactionTable
export default function TransactionTable(props) {
  // @sf-custom-slot hooks:TransactionTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:TransactionTable

// @sf-custom-slot section:TransactionTable-custom
