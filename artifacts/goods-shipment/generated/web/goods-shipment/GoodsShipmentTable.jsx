import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:goodsShipment
const columns = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'movementDate', column: 'MovementDate', type: 'date' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', display: 'dot' },
];
// @sf-generated-end columns:goodsShipment

const filters = ['documentNo', 'warehouse', 'businessPartner', 'movementDate', 'documentStatus'];

// @sf-generated-start component:GoodsShipmentTable
export default function GoodsShipmentTable(props) {
  // @sf-custom-slot hooks:GoodsShipmentTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:GoodsShipmentTable

// @sf-custom-slot section:GoodsShipmentTable-custom
