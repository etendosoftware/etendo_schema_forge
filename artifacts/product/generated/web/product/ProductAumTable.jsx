import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:productAum
const columns = [
  { key: 'uOM', column: 'C_Uom_ID', type: 'string' },
  { key: 'conversionRate', column: 'Conversionrate', type: 'string' },
  { key: 'sales', column: 'Sales', type: 'string' },
  { key: 'purchase', column: 'Purchase', type: 'string' },
  { key: 'logistics', column: 'Logistics', type: 'string' },
];
// @sf-generated-end columns:productAum

const filters = [];

// @sf-generated-start component:ProductAumTable
export default function ProductAumTable(props) {
  // @sf-custom-slot hooks:ProductAumTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:ProductAumTable

// @sf-custom-slot section:ProductAumTable-custom
