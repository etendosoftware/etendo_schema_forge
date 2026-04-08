import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:basicDiscount
const columns = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
  { key: 'discount', column: 'C_Discount_ID', type: 'string', label: 'Basic Discount' },
  { key: 'customer', column: 'IsCustomer', type: 'boolean', label: 'Customer' },
  { key: 'vendor', column: 'IsVendor', type: 'boolean', label: 'Vendor' },
];
// @sf-generated-end columns:basicDiscount

const filters = [];

// @sf-generated-start component:BasicDiscountTable
export default function BasicDiscountTable(props) {
  // @sf-custom-slot hooks:BasicDiscountTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BasicDiscountTable

// @sf-custom-slot section:BasicDiscountTable-custom
