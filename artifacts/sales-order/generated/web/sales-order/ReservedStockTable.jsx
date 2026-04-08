import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:reservedStock
const columns = [
  { key: 'stockReservation', column: 'M_Reservation_ID', type: 'string' },
  { key: 'storageBin', column: 'M_Locator_ID', type: 'string' },
  { key: 'quantity', column: 'Quantity', type: 'string' },
  { key: 'released', column: 'ReleasedQty', type: 'string' },
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
