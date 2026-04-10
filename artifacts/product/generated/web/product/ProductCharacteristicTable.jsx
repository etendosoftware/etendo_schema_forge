import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productCharacteristic
const columns = [
  { key: 'sequenceNumber', column: 'Seqno', type: 'number', label: 'Sequence Number' },
  { key: 'characteristic', column: 'M_Characteristic_ID', type: 'string', label: 'Characteristic' },
  { key: 'variant', column: 'Isvariant', type: 'boolean', label: 'Variant' },
];
// @sf-generated-end columns:productCharacteristic

const filters = [];

// @sf-generated-start component:ProductCharacteristicTable
export default function ProductCharacteristicTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductCharacteristicTable
