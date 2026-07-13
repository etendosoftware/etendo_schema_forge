import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:Cuentas generales
const fields = [
  { key: 'suspenseBalancingUse', column: 'UseSuspenseBalancing', type: 'checkbox', label: 'Suspense Balancing Use', required: true, section: 'suspense' },
  { key: 'suspenseBalancing', column: 'SuspenseBalancing_Acct', type: 'selector', label: 'Suspense Balancing', section: 'suspense', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'retainedEarning', column: 'RetainedEarning_Acct', type: 'selector', label: 'Retained Earning', section: 'closing', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'suspenseErrorUse', column: 'UseSuspenseError', type: 'checkbox', label: 'Suspense Error Use', required: true, section: 'suspense' },
  { key: 'incomeSummary', column: 'IncomeSummary_Acct', type: 'selector', label: 'Income Summary', required: true, section: 'closing', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'currencyBalancingUse', column: 'UseCurrencyBalancing', type: 'checkbox', label: 'Currency Balancing Use', required: true, section: 'currencyBalancing' },
  { key: 'currencyBalancingAcct', column: 'CurrencyBalancing_Acct', type: 'selector', label: 'Currency Balancing Acct.', section: 'currencyBalancing', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cFSOrderAccount', column: 'CFS_Order_Acct', type: 'selector', label: 'CFS Order Account', section: 'closing', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'createClosing', column: 'CreateClosing', type: 'checkbox', label: 'Reverse Permanent Account Balances', required: true, section: 'closing', defaultValue: 'Y' },
];
// @sf-generated-end fields:Cuentas generales

// @sf-generated-start component:CuentasgeneralesForm
export default function CuentasgeneralesForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:CuentasgeneralesForm
