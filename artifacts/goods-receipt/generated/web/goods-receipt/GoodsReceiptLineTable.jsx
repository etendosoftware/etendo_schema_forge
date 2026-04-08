import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:goodsReceiptLine
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'product', column: 'M_Product_ID', type: 'string' },
  { key: 'movementQuantity', column: 'MovementQty', type: 'string' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string' },
  { key: 'invoiceQuantity', column: 'Qtyinvoiced', type: 'string' },
];
// @sf-generated-end columns:goodsReceiptLine

const filters = [];

// @sf-generated-start component:GoodsReceiptLineTable
export default function GoodsReceiptLineTable(props) {
  // @sf-custom-slot hooks:GoodsReceiptLineTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:GoodsReceiptLineTable

// @sf-custom-slot section:GoodsReceiptLineTable-custom
