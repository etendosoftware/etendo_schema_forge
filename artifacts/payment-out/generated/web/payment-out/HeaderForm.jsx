import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', label: 'Paying To', section: 'principal', reference: 'BusinessPartner', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'server-macro', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'account', column: 'Fin_Financial_Account_ID', type: 'selector', label: 'Paying From', required: true, section: 'principal', reference: 'FinancialAccount', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true && record['status'] !== 'RPAE' },
  { key: 'paymentDate', column: 'Paymentdate', type: 'date', label: 'Payment Date', section: 'principal', readOnlyLogic: (record) => record['processed'] === true && record['status'] !== 'RPAE' },
  { key: 'paymentMethod', column: 'Fin_Paymentmethod_ID', type: 'selector', label: 'Payment Method', required: true, section: 'principal', reference: 'PaymentMethod', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true && record['status'] !== 'RPAE' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlySource: 'server', readOnlyLogicReason: 'session-variable' },
  { key: 'referenceNo', column: 'Referenceno', type: 'text', label: 'Reference No.', section: 'collapsed' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated' }, { value: 'd', label: 'Disabled For Background' }, { value: 'D', label: 'Document Disabled' }, { value: 'L', label: 'Document Locked' }, { value: 'E', label: 'Error' }, { value: 'C', label: 'Error, No cost' }, { value: 'i', label: 'Invalid Account' }, { value: 'AD', label: 'No Accounting Date' }, { value: 'DT', label: 'No Document Type' }, { value: 'NO', label: 'No Related PO' }, { value: 'b', label: 'Not Balanced' }, { value: 'c', label: 'Not Convertible (no rate)' }, { value: 'l', label: 'Pending Refresh' }, { value: 'p', label: 'Period Closed' }, { value: 'y', label: 'Post Prepared' }, { value: 'Y', label: 'Posted' }, { value: 'T', label: 'Table Disabled' }, { value: 'N', label: 'Unposted' }], defaultValue: 'N' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
HeaderForm.hasCollapsedFields = true;

// @sf-generated-end component:HeaderForm
