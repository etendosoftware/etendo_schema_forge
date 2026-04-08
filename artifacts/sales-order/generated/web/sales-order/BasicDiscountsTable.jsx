import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:basicDiscounts
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'cascade', column: 'Cascade', type: 'boolean' },
  { key: 'active', column: 'Isactive', type: 'boolean' },
];
// @sf-generated-end columns:basicDiscounts

const filters = [];

// @sf-generated-start component:BasicDiscountsTable
export default function BasicDiscountsTable(props) {
  // @sf-custom-slot hooks:BasicDiscountsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BasicDiscountsTable

// @sf-custom-slot section:BasicDiscountsTable-custom
