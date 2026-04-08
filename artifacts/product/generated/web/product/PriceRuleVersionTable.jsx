import { DataTable } from '@/components/contract-ui';

// @sf-generated-start columns:priceRuleVersion
const columns = [

];
// @sf-generated-end columns:priceRuleVersion

const filters = [];

// @sf-generated-start component:PriceRuleVersionTable
export default function PriceRuleVersionTable(props) {
  // @sf-custom-slot hooks:PriceRuleVersionTable
  return <DataTable columns={columns} filters={filters} {...props} />;
}
// @sf-generated-end component:PriceRuleVersionTable

// @sf-custom-slot section:PriceRuleVersionTable-custom
