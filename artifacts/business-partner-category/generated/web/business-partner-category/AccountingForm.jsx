import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', label: 'Customer Receivables No.', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', label: 'Customer Prepayment', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', label: 'Vendor Liability', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', label: 'Vendor Prepayment', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'writeoff', column: 'WriteOff_Acct', type: 'selector', label: 'Write-off', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'writeoffRevAcct', column: 'Writeoff_Rev_Acct', type: 'selector', label: 'Write-off Revenue', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedReceipts', column: 'NotInvoicedReceipts_Acct', type: 'selector', label: 'Non-Invoiced Receipts', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedReceivables', column: 'NotInvoicedReceivables_Acct', type: 'selector', label: 'Non-Invoiced Receivables', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedRevenues', column: 'NotInvoicedRevenue_Acct', type: 'selector', label: 'Non-Invoiced Revenues', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'paymentDiscountExpense', column: 'PayDiscount_Exp_Acct', type: 'selector', label: 'Payment Discount Expense', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'paymentDiscountRevenue', column: 'PayDiscount_Rev_Acct', type: 'selector', label: 'Payment Discount Revenue', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'doubtfulDebtAccount', column: 'Doubtfuldebt_Acct', type: 'selector', label: 'Doubtful Debt Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'badDebtExpenseAccount', column: 'BadDebtExpense_Acct', type: 'selector', label: 'Bad Debt Expense Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'badDebtRevenueAccount', column: 'Baddebtrevenue_Acct', type: 'selector', label: 'Bad Debt Revenue Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'allowanceForDoubtfulDebtAccount', column: 'AllowanceForDoubtful_Acct', type: 'selector', label: 'Allowance For Doubtful Debt Account', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unearnedRevenue', column: 'UnEarnedRevenue_Acct', type: 'selector', label: 'Unearned Revenue', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unrealizedGainsAcct', column: 'UnrealizedGain_Acct', type: 'selector', label: 'Unrealized Gains Acct.', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unrealizedLossesAcct', column: 'UnrealizedLoss_Acct', type: 'selector', label: 'Unrealized Losses Acct.', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'realizedGainAcct', column: 'RealizedGain_Acct', type: 'selector', label: 'Realized Gain Acct', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'realizedLossAcct', column: 'RealizedLoss_Acct', type: 'selector', label: 'Realized Loss Acct', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorServiceLiability', column: 'V_Liability_Services_Acct', type: 'selector', label: 'Vendor Service Liability', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountingForm
