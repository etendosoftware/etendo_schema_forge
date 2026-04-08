import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:reservedStock
const columns = [
  { key: 'reservation', column: 'M_Reservation_ID', type: 'string', label: 'Stock Reservation' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string', label: 'Storage Bin' },
  { key: 'allocated', column: 'IsAllocated', type: 'boolean', label: 'Allocated' },
  { key: 'quantity', column: 'Quantity', type: 'number', label: 'Quantity' },
  { key: 'released', column: 'ReleasedQty', type: 'number', label: 'Released' },
];
// @sf-generated-end columns:reservedStock

const filters = [];

// @sf-generated-start component:ReservedStockTable
export default function ReservedStockTable(props) {
  // @sf-custom-slot hooks:ReservedStockTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ReservedStockTable

// @sf-custom-slot section:ReservedStockTable-custom
