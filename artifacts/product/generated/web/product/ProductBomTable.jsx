import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productBom
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'bOMProduct', column: 'M_ProductBOM_ID', type: 'string' },
  { key: 'bOMQuantity', column: 'BOMQty', type: 'string' },
];
// @sf-generated-end columns:productBom

const filters = [];

// @sf-generated-start component:ProductBomTable
export default function ProductBomTable(props) {
  // @sf-custom-slot hooks:ProductBomTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductBomTable

// @sf-custom-slot section:ProductBomTable-custom
