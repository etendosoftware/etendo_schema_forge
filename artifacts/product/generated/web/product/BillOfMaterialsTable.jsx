import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:billOfMaterials
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'bOMProduct', column: 'M_ProductBOM_ID', type: 'string', label: 'BOM Product' },
  { key: 'bOMQuantity', column: 'BOMQty', type: 'number', label: 'BOM Quantity' },
];
// @sf-generated-end columns:billOfMaterials

const filters = [];

// @sf-generated-start component:BillOfMaterialsTable
export default function BillOfMaterialsTable(props) {
  // @sf-custom-slot hooks:BillOfMaterialsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BillOfMaterialsTable

// @sf-custom-slot section:BillOfMaterialsTable-custom
