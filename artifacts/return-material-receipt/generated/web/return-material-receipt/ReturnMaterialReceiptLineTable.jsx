import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:returnMaterialReceiptLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'string' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string' },
  { key: 'orderQuantity', column: 'QuantityOrder', type: 'string' },
];
// @sf-generated-end columns:returnMaterialReceiptLine

const filters = ['product'];

// @sf-generated-start component:ReturnMaterialReceiptLineTable
export default function ReturnMaterialReceiptLineTable(props) {
  // @sf-custom-slot hooks:ReturnMaterialReceiptLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ReturnMaterialReceiptLineTable

// @sf-custom-slot section:ReturnMaterialReceiptLineTable-custom
