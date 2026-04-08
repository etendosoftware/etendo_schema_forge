import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:bpartnerDiscount
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'discount', column: 'C_Discount_ID', type: 'string', label: 'Basic Discount' },
  { key: 'customer', column: 'IsCustomer', type: 'boolean', label: 'Customer' },
  { key: 'vendor', column: 'IsVendor', type: 'boolean', label: 'Vendor' },
];
// @sf-generated-end columns:bpartnerDiscount

const filters = [];

// @sf-generated-start component:BpartnerDiscountTable
export default function BpartnerDiscountTable(props) {
  // @sf-custom-slot hooks:BpartnerDiscountTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BpartnerDiscountTable

// @sf-custom-slot section:BpartnerDiscountTable-custom
