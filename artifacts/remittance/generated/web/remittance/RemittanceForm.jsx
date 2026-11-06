import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:remittance
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', readOnly: true, section: 'principal', maxLength: 30, readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'financialAccount', column: 'FIN_Financial_Account_ID', type: 'selector', label: 'Financial Account', required: true, section: 'principal', reference: 'Financial_Account', inputMode: 'selector', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'remittanceType', column: 'REM_Remittance_Type_ID', type: 'dependent', label: 'Remittance Type', required: true, section: 'principal', reference: 'REM_Remittance_Type', inputMode: 'dependent', dependsOn: { field: 'financialAccount', filterKey: 'FIN_Financial_Account_ID' }, readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'dueDate', column: 'Duedate', type: 'date', label: 'Expected Date', required: true, section: 'principal', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y'), minDate: 'today' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60, readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
  { key: 'transactionDate', column: 'Datetrx', type: 'date', label: 'Transaction Date', required: true, readOnly: true, section: 'principal', readOnlyLogic: (record) => (record['processed'] === true || record['processed'] === 'Y') },
];
// @sf-generated-end fields:remittance

// @sf-generated-start component:RemittanceForm
export default function RemittanceForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
RemittanceForm.fields = fields;

// @sf-generated-end component:RemittanceForm
