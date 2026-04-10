import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:intrastatAdquisitions
const columns = [

];
// @sf-generated-end columns:intrastatAdquisitions

const filters = [];

// @sf-generated-start component:IntrastatAdquisitionsTable
export default function IntrastatAdquisitionsTable(props) {
  // @sf-custom-slot hooks:IntrastatAdquisitionsTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:IntrastatAdquisitionsTable

// @sf-custom-slot section:IntrastatAdquisitionsTable-custom
