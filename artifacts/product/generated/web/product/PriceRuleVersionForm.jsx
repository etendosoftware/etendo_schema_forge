import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:priceRuleVersion
const fields = [
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal', defaultValue: 'Y' },
  { key: 'validFromDate', column: 'Validfrom', type: 'date', label: 'Valid From Date', required: true, section: 'principal' },
  { key: 'servicePriceRule', column: 'M_Servicepricerule_ID', type: 'selector', label: 'Service Price Rule', required: true, readOnly: true, section: 'other', reference: 'ServicePriceRule', inputMode: 'selector' },
];
// @sf-generated-end fields:priceRuleVersion

// @sf-generated-start component:PriceRuleVersionForm
export default function PriceRuleVersionForm(props) {
  // @sf-custom-slot hooks:PriceRuleVersionForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PriceRuleVersionForm

// @sf-custom-slot section:PriceRuleVersionForm-custom
