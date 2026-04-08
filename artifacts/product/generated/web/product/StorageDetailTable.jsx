import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:storageDetail
const columns = [
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string' },
  { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'string' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string' },
  { key: 'quantityOnHand', column: 'QtyOnHand', type: 'string' },
  { key: 'reservedQty', column: 'ReservedQty', type: 'string' },
  { key: 'allocatedQuantity', column: 'AllocatedQty', type: 'string' },
];
// @sf-generated-end columns:storageDetail

const filters = [];

// @sf-generated-start component:StorageDetailTable
export default function StorageDetailTable(props) {
  // @sf-custom-slot hooks:StorageDetailTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:StorageDetailTable

// @sf-custom-slot section:StorageDetailTable-custom
