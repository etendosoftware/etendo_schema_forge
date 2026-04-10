import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:paymentMethod
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', section: 'principal', defaultValue: 'Y' },
  { key: 'payinAllow', column: 'Payin_Allow', type: 'checkbox', label: 'Payment In Allowed', required: true, section: 'paymentIn', defaultValue: 'Y' },
  { key: 'automaticReceipt', column: 'Automatic_Receipt', type: 'checkbox', label: 'Automatic Receipt', required: true, section: 'paymentIn', defaultValue: 'N' },
  { key: 'payinIsMulticurrency', column: 'Payin_IsMulticurrency', type: 'checkbox', label: 'Receive Payments in Multiple Currencies', required: true, section: 'paymentIn', defaultValue: 'N' },
  { key: 'automaticDeposit', column: 'Automatic_Deposit', type: 'checkbox', label: 'Automatic Deposit', required: true, section: 'paymentIn', defaultValue: 'N' },
  { key: 'payinExecutionType', column: 'Payin_Execution_Type', type: 'select', label: 'Execution Type', required: true, section: 'paymentIn', options: [{ value: 'A', label: 'Automatic' }, { value: 'M', label: 'Manual' }], defaultValue: 'M' },
  { key: 'payinExecutionProcessID', column: 'Payin_Execution_Process_ID', type: 'search', label: 'Execution Process', section: 'paymentIn', reference: 'Pay_Exec_Process', inputMode: 'search' },
  { key: 'payinDeferred', column: 'Payin_Deferred', type: 'checkbox', label: 'Deferred', required: true, section: 'paymentIn', defaultValue: 'N' },
  { key: 'uponReceiptUse', column: 'Uponreceiptuse', type: 'select', label: 'Upon Receipt Use', section: 'paymentIn', options: [{ value: 'CLE', label: 'Cleared Payment Account' }, { value: 'DEP', label: 'Deposited Payment Account' }, { value: 'INT', label: 'In Transit Payment Account' }, { value: 'WIT', label: 'Withdrawn Payment Account' }] },
  { key: 'uponDepositUse', column: 'Upondeposituse', type: 'select', label: 'Upon Deposit Use', section: 'paymentIn', options: [{ value: 'CLE', label: 'Cleared Payment Account' }, { value: 'DEP', label: 'Deposited Payment Account' }, { value: 'INT', label: 'In Transit Payment Account' }, { value: 'WIT', label: 'Withdrawn Payment Account' }] },
  { key: 'iNUponClearingUse', column: 'Inuponclearinguse', type: 'select', label: 'Upon Reconciliation Use', section: 'paymentIn', options: [{ value: 'CLE', label: 'Cleared Payment Account' }, { value: 'DEP', label: 'Deposited Payment Account' }, { value: 'INT', label: 'In Transit Payment Account' }, { value: 'WIT', label: 'Withdrawn Payment Account' }] },
  { key: 'payoutAllow', column: 'Payout_Allow', type: 'checkbox', label: 'Payment Out Allowed', required: true, section: 'paymentOut', defaultValue: 'Y' },
  { key: 'automaticPayment', column: 'Automatic_Payment', type: 'checkbox', label: 'Automatic Payment', required: true, section: 'paymentOut', defaultValue: 'N' },
  { key: 'payoutIsMulticurrency', column: 'Payout_IsMulticurrency', type: 'checkbox', label: 'Make Payments in Multiple Currencies', required: true, section: 'paymentOut', defaultValue: 'N' },
  { key: 'automaticWithdrawn', column: 'Automatic_Withdrawn', type: 'checkbox', label: 'Automatic Withdrawn', required: true, section: 'paymentOut', defaultValue: 'N' },
  { key: 'payoutExecutionType', column: 'Payout_Execution_Type', type: 'select', label: 'Execution Type', required: true, section: 'paymentOut', options: [{ value: 'A', label: 'Automatic' }, { value: 'M', label: 'Manual' }], defaultValue: 'M' },
  { key: 'payoutExecutionProcessID', column: 'Payout_Execution_Process_ID', type: 'search', label: 'Execution Process', section: 'paymentOut', reference: 'Pay_Exec_Process', inputMode: 'search' },
  { key: 'payoutDeferred', column: 'Payout_Deferred', type: 'checkbox', label: 'Deferred', required: true, section: 'paymentOut', defaultValue: 'N' },
  { key: 'uponPaymentUse', column: 'Uponpaymentuse', type: 'select', label: 'Upon Payment Use', section: 'paymentOut', options: [{ value: 'CLE', label: 'Cleared Payment Account' }, { value: 'DEP', label: 'Deposited Payment Account' }, { value: 'INT', label: 'In Transit Payment Account' }, { value: 'WIT', label: 'Withdrawn Payment Account' }] },
  { key: 'uponWithdrawalUse', column: 'Uponwithdrawaluse', type: 'select', label: 'Upon Withdrawal Use', section: 'paymentOut', options: [{ value: 'CLE', label: 'Cleared Payment Account' }, { value: 'DEP', label: 'Deposited Payment Account' }, { value: 'INT', label: 'In Transit Payment Account' }, { value: 'WIT', label: 'Withdrawn Payment Account' }] },
  { key: 'oUTUponClearingUse', column: 'Outuponclearinguse', type: 'select', label: 'Upon Reconciliation Use', section: 'paymentOut', options: [{ value: 'CLE', label: 'Cleared Payment Account' }, { value: 'DEP', label: 'Deposited Payment Account' }, { value: 'INT', label: 'In Transit Payment Account' }, { value: 'WIT', label: 'Withdrawn Payment Account' }] },
];
// @sf-generated-end fields:paymentMethod

// @sf-generated-start component:PaymentMethodForm
export default function PaymentMethodForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:PaymentMethodForm
