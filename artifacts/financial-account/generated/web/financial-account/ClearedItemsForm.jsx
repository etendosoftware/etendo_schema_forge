import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:clearedItems
const fields = [
  { key: 'accountingDate', column: 'Dateacct', type: 'date', label: 'Accounting Date', readOnly: true, section: 'other' },
  { key: 'transactionDate', column: 'Statementdate', type: 'date', label: 'Transaction Date', readOnly: true, section: 'other' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', readOnly: true, section: 'other' },
  { key: 'financialAccountTransaction', column: 'FIN_Finacc_Transaction_ID', type: 'search', label: 'Financial account transaction', readOnly: true, section: 'other', reference: 'Finacc_Transaction', inputMode: 'search' },
  { key: 'bankStatementLine', column: 'FIN_Bankstatementline_ID', type: 'search', label: 'Bank Statement Line', readOnly: true, section: 'other', reference: 'Bankstatementline', inputMode: 'search' },
  { key: 'transactionType', column: 'Trxtype', type: 'select', label: 'Transaction Type', readOnly: true, section: 'other', options: [{ value: 'BPD', label: 'BP Deposit', labels: {"es_ES":"Cobro"} }, { value: 'BPW', label: 'BP Withdrawal', labels: {"es_ES":"Pago"} }, { value: 'BF', label: 'Bank fee', labels: {"es_ES":"Tasa de Banco"} }] },
  { key: 'currency', column: 'C_Currency_ID', type: 'search', label: 'Currency', readOnly: true, section: 'other', reference: 'Currency', inputMode: 'search' },
  { key: 'payment', column: 'FIN_Payment_ID', type: 'search', label: 'Payment', readOnly: true, section: 'other', reference: 'Payment', inputMode: 'search' },
  { key: 'gLItem', column: 'C_Glitem_ID', type: 'search', label: 'G/L Item', readOnly: true, section: 'other', reference: 'Glitem', inputMode: 'search' },
  { key: 'depositAmount', column: 'Depositamt', type: 'number', label: 'Deposit Amount', readOnly: true, section: 'other' },
  { key: 'paymentAmount', column: 'Paymentamt', type: 'number', label: 'Withdrawal Amount', readOnly: true, section: 'other' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', readOnly: true, section: 'other', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', label: '1st Dimension', readOnly: true, section: 'other', reference: 'User1', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', label: '2nd Dimension', readOnly: true, section: 'other', reference: 'User2', inputMode: 'selector', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro' },
];
// @sf-generated-end fields:clearedItems

// @sf-generated-start component:ClearedItemsForm
export default function ClearedItemsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ClearedItemsForm.fields = fields;

// @sf-generated-end component:ClearedItemsForm
