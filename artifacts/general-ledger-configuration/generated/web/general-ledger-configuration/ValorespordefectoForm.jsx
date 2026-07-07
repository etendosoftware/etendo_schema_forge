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
  { key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Product Asset', required: true, section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productExpense', column: 'P_Expense_Acct', type: 'selector', label: 'Product Expense', required: true, section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productDeferredExpense', column: 'P_Def_Expense_Acct', type: 'selector', label: 'Product Deferred Expense', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productRevenue', column: 'P_Revenue_Acct', type: 'selector', label: 'Product Revenue', required: true, section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productDeferredRevenue', column: 'P_Def_Revenue_Acct', type: 'selector', label: 'Product Deferred Revenue', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productCOGS', column: 'P_Cogs_Acct', type: 'selector', label: 'Product COGS', required: true, section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'invoicePriceVariance', column: 'P_InvoicePriceVariance_Acct', type: 'selector', label: 'Invoice Price Variance', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productRevenueReturn', column: 'P_Revenue_Return_Acct', type: 'selector', label: 'Product Revenue Return', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productCOGSReturn', column: 'P_Cogs_Return_Acct', type: 'selector', label: 'Product COGS Return', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'warehouseDifferences', column: 'W_Differences_Acct', type: 'selector', label: 'Warehouse Differences', required: true, section: 'warehouse', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'inventoryRevaluation', column: 'W_Revaluation_Acct', type: 'selector', label: 'Inventory Revaluation', section: 'warehouse', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'workInProgress', column: 'PJ_WIP_Acct', type: 'selector', label: 'Work In Progress', section: 'warehouse', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankAsset', column: 'B_Asset_Acct', type: 'selector', label: 'Bank Asset', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankInTransit', column: 'B_InTransit_Acct', type: 'selector', label: 'Bank In Transit', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankExpense', column: 'B_Expense_Acct', type: 'selector', label: 'Bank Expense', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankRevaluationGain', column: 'B_RevaluationGain_Acct', type: 'selector', label: 'Bank Revaluation Gain', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankRevaluationLoss', column: 'B_RevaluationLoss_Acct', type: 'selector', label: 'Bank Revaluation Loss', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxDue', column: 'T_Due_Acct', type: 'selector', label: 'Tax Due', required: true, section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxCredit', column: 'T_Credit_Acct', type: 'selector', label: 'Tax Credit', required: true, section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'tDueTransAcct', column: 'T_Due_Trans_Acct', type: 'selector', label: 'Tax Due Transitory', section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'tCreditTransAcct', column: 'T_Credit_Trans_Acct', type: 'selector', label: 'Tax Credit Transitory', section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashBookAsset', column: 'CB_Asset_Acct', type: 'selector', label: 'Cash Book Asset', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashBookDifferences', column: 'CB_Differences_Acct', type: 'selector', label: 'Cash Book Differences', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashTransfer', column: 'CB_CashTransfer_Acct', type: 'selector', label: 'Cash Transfer', required: true, section: 'treasury', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashBookExpense', column: 'CB_Expense_Acct', type: 'selector', label: 'Cash Book Expense', required: true, section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'cashBookReceipt', column: 'CB_Receipt_Acct', type: 'selector', label: 'Cash Book Receipt', required: true, section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'depreciation', column: 'A_Depreciation_Acct', type: 'selector', label: 'Depreciation', required: true, section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'paymentSelection', column: 'B_PaymentSelect_Acct', type: 'selector', label: 'Payment Selection', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'accumulatedDepreciation', column: 'A_Accumdepreciation_Acct', type: 'selector', label: 'Accumulated Depreciation', required: true, section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'projectAsset', column: 'PJ_Asset_Acct', type: 'selector', label: 'Project Asset', section: 'project', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxExpense', column: 'T_Expense_Acct', type: 'selector', label: 'Tax Expense', section: 'taxes', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankInterestRevenue', column: 'B_InterestRev_Acct', type: 'selector', label: 'Bank Interest Revenue', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankInterestExpense', column: 'B_InterestExp_Acct', type: 'selector', label: 'Bank Interest Expense', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankUnidentifiedReceipts', column: 'B_Unidentified_Acct', type: 'selector', label: 'Bank Unidentified Receipts', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankSettlementGain', column: 'B_SettlementGain_Acct', type: 'selector', label: 'Bank Settlement Gain', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'unallocatedCash', column: 'B_UnallocatedCash_Acct', type: 'selector', label: 'Unallocated Cash', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'bankSettlementLoss', column: 'B_SettlementLoss_Acct', type: 'selector', label: 'Bank Settlement Loss', section: 'bank', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'disposalGain', column: 'A_Disposal_Gain', type: 'selector', label: 'Disposal Gain', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'disposalLoss', column: 'A_Disposal_Loss', type: 'selector', label: 'Disposal Loss', section: 'product', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:Valores por defecto

// @sf-generated-start component:ValorespordefectoForm
export default function ValorespordefectoForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ValorespordefectoForm
