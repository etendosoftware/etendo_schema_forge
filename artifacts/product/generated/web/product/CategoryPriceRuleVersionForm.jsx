import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:categoryPriceRuleVersion
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'validFromDate', column: 'Validfrom', type: 'date', label: 'Valid From Date', required: true, section: 'principal' },
  { key: 'servicePriceRule', column: 'M_Servicepricerule_ID', type: 'selector', label: 'Service Price Rule', required: true, readOnly: true, section: 'other', reference: 'ServicePriceRule', inputMode: 'selector' },
];
// @sf-generated-end fields:categoryPriceRuleVersion

// @sf-generated-start component:CategoryPriceRuleVersionForm
export default function CategoryPriceRuleVersionForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:CategoryPriceRuleVersionForm
