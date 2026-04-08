import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productCharacteristic
const columns = [
  { key: 'sequenceNumber', column: 'Seqno', type: 'number' },
  { key: 'characteristic', column: 'M_Characteristic_ID', type: 'string' },
  { key: 'variant', column: 'Isvariant', type: 'boolean' },
];
// @sf-generated-end columns:productCharacteristic

const filters = [];

// @sf-generated-start component:ProductCharacteristicTable
export default function ProductCharacteristicTable(props) {
  // @sf-custom-slot hooks:ProductCharacteristicTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductCharacteristicTable

// @sf-custom-slot section:ProductCharacteristicTable-custom
