import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productTransaction
const columns = [
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'number' },
  { key: 'movementDate', column: 'MovementDate', type: 'date' },
  { key: 'movementType', column: 'MovementType', type: 'string' },
  { key: 'goodsShipmentLine', column: 'M_InOutLine_ID', type: 'string' },
];
// @sf-generated-end columns:productTransaction

const filters = ['product', 'movementDate', 'movementType'];

// @sf-generated-start component:ProductTransactionTable
export default function ProductTransactionTable(props) {
  // @sf-custom-slot hooks:ProductTransactionTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductTransactionTable

// @sf-custom-slot section:ProductTransactionTable-custom
