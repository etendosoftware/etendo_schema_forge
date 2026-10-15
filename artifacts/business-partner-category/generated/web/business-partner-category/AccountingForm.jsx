import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', label: 'Customer Receivables No.', required: true, lookup: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', label: 'Customer Prepayment', lookup: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', label: 'Vendor Liability', required: true, lookup: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', label: 'Vendor Prepayment', lookup: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'writeoff', column: 'WriteOff_Acct', type: 'selector', label: 'Write-off', required: true, lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'writeoffRevAcct', column: 'Writeoff_Rev_Acct', type: 'selector', label: 'Write-off Revenue', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedReceipts', column: 'NotInvoicedReceipts_Acct', type: 'selector', label: 'Non-Invoiced Receipts', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedReceivables', column: 'NotInvoicedReceivables_Acct', type: 'selector', label: 'Non-Invoiced Receivables', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedRevenues', column: 'NotInvoicedRevenue_Acct', type: 'selector', label: 'Non-Invoiced Revenues', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'paymentDiscountExpense', column: 'PayDiscount_Exp_Acct', type: 'selector', label: 'Payment Discount Expense', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'paymentDiscountRevenue', column: 'PayDiscount_Rev_Acct', type: 'selector', label: 'Payment Discount Revenue', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'doubtfulDebtAccount', column: 'Doubtfuldebt_Acct', type: 'selector', label: 'Doubtful Debt Account', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'badDebtExpenseAccount', column: 'BadDebtExpense_Acct', type: 'selector', label: 'Bad Debt Expense Account', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'badDebtRevenueAccount', column: 'Baddebtrevenue_Acct', type: 'selector', label: 'Bad Debt Revenue Account', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'allowanceForDoubtfulDebtAccount', column: 'AllowanceForDoubtful_Acct', type: 'selector', label: 'Allowance For Doubtful Debt Account', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unearnedRevenue', column: 'UnEarnedRevenue_Acct', type: 'selector', label: 'Unearned Revenue', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unrealizedGainsAcct', column: 'UnrealizedGain_Acct', type: 'selector', label: 'Unrealized Gains Acct.', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unrealizedLossesAcct', column: 'UnrealizedLoss_Acct', type: 'selector', label: 'Unrealized Losses Acct.', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'realizedGainAcct', column: 'RealizedGain_Acct', type: 'selector', label: 'Realized Gain Acct', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'realizedLossAcct', column: 'RealizedLoss_Acct', type: 'selector', label: 'Realized Loss Acct', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorServiceLiability', column: 'V_Liability_Services_Acct', type: 'selector', label: 'Vendor Service Liability', lookup: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AccountingForm.fields = fields;

// @sf-generated-end component:AccountingForm
