import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:businessPartner
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Commercial Name' },
  { key: 'customer', column: 'IsCustomer', type: 'boolean', label: 'Customer' },
  { key: 'vendor', column: 'IsVendor', type: 'boolean', label: 'Vendor' },
];
// @sf-generated-end columns:businessPartner

const filters = ['searchKey', 'name'];

// @sf-generated-start component:BusinessPartnerTable
export default function BusinessPartnerTable(props) {
  // @sf-custom-slot hooks:BusinessPartnerTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BusinessPartnerTable

// @sf-custom-slot section:BusinessPartnerTable-custom
