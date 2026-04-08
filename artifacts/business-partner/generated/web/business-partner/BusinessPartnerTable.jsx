import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:businessPartner
const columns = [
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'searchKey', column: 'Value', type: 'string' },
  { key: 'active', column: 'IsActive', type: 'boolean' },
];
// @sf-generated-end columns:businessPartner

const filters = ['name', 'searchKey'];

// @sf-generated-start component:BusinessPartnerTable
export default function BusinessPartnerTable(props) {
  // @sf-custom-slot hooks:BusinessPartnerTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:BusinessPartnerTable

// @sf-custom-slot section:BusinessPartnerTable-custom
