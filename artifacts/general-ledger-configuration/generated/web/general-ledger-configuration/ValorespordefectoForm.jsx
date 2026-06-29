import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:Valores por defecto
const fields = [
  { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', label: 'Customer Receivables No.', required: true, section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', label: 'Customer Prepayment', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'writeoff', column: 'WriteOff_Acct', type: 'selector', label: 'Write-off', required: true, section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'writeoffRevenue', column: 'Writeoff_Rev_Acct', type: 'selector', label: 'Write-off Revenue', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', label: 'Vendor Liability', required: true, section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', label: 'Vendor Prepayment', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'nonInvoicedReceipts', column: 'NotInvoicedReceipts_Acct', type: 'selector', label: 'Non-Invoiced Receipts', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'doubtfulDebtAccount', column: 'DoubtfulDebt_Acct', type: 'selector', label: 'Doubtful Debt Account', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'badDebtExpenseAccount', column: 'Baddebtexpense_Acct', type: 'selector', label: 'Bad Debt Expense Account', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'badDebtRevenueAccount', column: 'BadDebtRevenue_Acct', type: 'selector', label: 'Bad Debt Revenue Account', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'allowanceForDoubtfulDebtAccount', column: 'Allowancefordoubtful_Acct', type: 'selector', label: 'Allowance For Doubtful Debt Account', section: 'receivablesPayables', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Product Asset', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productExpense', column: 'P_Expense_Acct', type: 'selector', label: 'Product Expense', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productDeferredExpense', column: 'P_Def_Expense_Acct', type: 'selector', label: 'Product Deferred Expense', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productRevenue', column: 'P_Revenue_Acct', type: 'selector', label: 'Product Revenue', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productDeferredRevenue', column: 'P_Def_Revenue_Acct', type: 'selector', label: 'Product Deferred Revenue', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productCOGS', column: 'P_Cogs_Acct', type: 'selector', label: 'Product COGS', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'invoicePriceVariance', column: 'P_InvoicePriceVariance_Acct', type: 'selector', label: 'Invoice Price Variance', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productRevenueReturn', column: 'P_Revenue_Return_Acct', type: 'selector', label: 'Product Revenue Return', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productCOGSReturn', column: 'P_Cogs_Return_Acct', type: 'selector', label: 'Product COGS Return', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'warehouseDifferences', column: 'W_Differences_Acct', type: 'selector', label: 'Warehouse Differences', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'inventoryRevaluation', column: 'W_Revaluation_Acct', type: 'selector', label: 'Inventory Revaluation', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'workInProgress', column: 'PJ_WIP_Acct', type: 'selector', label: 'Work In Progress', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankAsset', column: 'B_Asset_Acct', type: 'selector', label: 'Bank Asset', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankInTransit', column: 'B_InTransit_Acct', type: 'selector', label: 'Bank In Transit', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankExpense', column: 'B_Expense_Acct', type: 'selector', label: 'Bank Expense', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankRevaluationGain', column: 'B_RevaluationGain_Acct', type: 'selector', label: 'Bank Revaluation Gain', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankRevaluationLoss', column: 'B_RevaluationLoss_Acct', type: 'selector', label: 'Bank Revaluation Loss', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxDue', column: 'T_Due_Acct', type: 'selector', label: 'Tax Due', required: true, section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxCredit', column: 'T_Credit_Acct', type: 'selector', label: 'Tax Credit', required: true, section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'tDueTransAcct', column: 'T_Due_Trans_Acct', type: 'selector', label: 'Tax Due Transitory', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'tCreditTransAcct', column: 'T_Credit_Trans_Acct', type: 'selector', label: 'Tax Credit Transitory', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashBookAsset', column: 'CB_Asset_Acct', type: 'selector', label: 'Cash Book Asset', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashBookDifferences', column: 'CB_Differences_Acct', type: 'selector', label: 'Cash Book Differences', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashTransfer', column: 'CB_CashTransfer_Acct', type: 'selector', label: 'Cash Transfer', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'depreciation', column: 'A_Depreciation_Acct', type: 'selector', label: 'Depreciation', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'accumulatedDepreciation', column: 'A_Accumdepreciation_Acct', type: 'selector', label: 'Accumulated Depreciation', required: true, section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxExpense', column: 'T_Expense_Acct', type: 'selector', label: 'Tax Expense', section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'disposalGain', column: 'A_Disposal_Gain', type: 'selector', label: 'Disposal Gain', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'disposalLoss', column: 'A_Disposal_Loss', type: 'selector', label: 'Disposal Loss', section: 'other', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:Valores por defecto

// @sf-generated-start component:ValorespordefectoForm
export default function ValorespordefectoForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ValorespordefectoForm
