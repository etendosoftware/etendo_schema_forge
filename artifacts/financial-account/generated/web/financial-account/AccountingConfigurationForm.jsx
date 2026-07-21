import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accountingConfiguration
const fields = [
  { key: 'fINAssetAcct', column: 'FIN_Asset_Acct', type: 'selector', label: 'Bank Asset Account', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'fINTransitoryAcct', column: 'FIN_Transitory_Acct', type: 'selector', label: 'Bank Transitory Account', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accountingConfiguration

// @sf-generated-start component:AccountingConfigurationForm
export default function AccountingConfigurationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountingConfigurationForm
