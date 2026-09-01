import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accountingConfiguration
const fields = [
  { key: 'fINBankrevaluationgainAcct', column: 'FIN_Bankrevaluationgain_Acct', type: 'selector', label: 'Bank Revaluation Gain Account', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'fINBankrevaluationlossAcct', column: 'FIN_Bankrevaluationloss_Acct', type: 'selector', label: 'Bank Revaluation Loss Account', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'fINBankfeeAcct', column: 'FIN_Bankfee_Acct', type: 'selector', label: 'Bank Fee Account', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'inTransitPaymentAccountIN', column: 'FIN_In_Intransit_Acct', type: 'selector', label: 'In Transit Payment IN Account', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'depositAccount', column: 'FIN_Deposit_Acct', type: 'selector', label: 'Deposit Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'clearedPaymentAccount', column: 'FIN_In_Clear_Acct', type: 'selector', label: 'Cleared Payment Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'fINOutIntransitAcct', column: 'FIN_Out_Intransit_Acct', type: 'selector', label: 'In Transit Payment OUT Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'withdrawalAccount', column: 'FIN_Withdrawal_Acct', type: 'selector', label: 'Withdrawal Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'clearedPaymentAccountOUT', column: 'FIN_Out_Clear_Acct', type: 'selector', label: 'Cleared Payment Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accountingConfiguration

// @sf-generated-start component:AccountingConfigurationForm
export default function AccountingConfigurationForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AccountingConfigurationForm.fields = fields;

// @sf-generated-end component:AccountingConfigurationForm
