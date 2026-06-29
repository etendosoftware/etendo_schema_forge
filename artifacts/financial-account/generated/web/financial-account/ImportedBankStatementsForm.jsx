import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:importedBankStatements
const fields = [
  { key: 'documentNo', column: 'DocumentNo', type: 'text', label: 'Document No.', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', section: 'principal', defaultValue: 'Y', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'importdate', column: 'Importdate', type: 'date', label: 'Import Date', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'transactionDate', column: 'Statementdate', type: 'date', label: 'Transaction Date', required: true, readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'fileName', column: 'Filename', type: 'text', label: 'File Name', readOnly: true, section: 'other', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'notes', column: 'Notes', type: 'textarea', label: 'Notes', section: 'principal' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated' }, { value: 'd', label: 'Disabled For Background' }, { value: 'D', label: 'Document Disabled' }, { value: 'L', label: 'Document Locked' }, { value: 'E', label: 'Error' }, { value: 'C', label: 'Error, No cost' }, { value: 'i', label: 'Invalid Account' }, { value: 'AD', label: 'No Accounting Date' }, { value: 'DT', label: 'No Document Type' }, { value: 'NO', label: 'No Related PO' }, { value: 'b', label: 'Not Balanced' }, { value: 'c', label: 'Not Convertible (no rate)' }, { value: 'l', label: 'Pending Refresh' }, { value: 'p', label: 'Period Closed' }, { value: 'y', label: 'Post Prepared' }, { value: 'Y', label: 'Posted' }, { value: 'T', label: 'Table Disabled' }, { value: 'N', label: 'Unposted' }], defaultValue: 'N' },
];
// @sf-generated-end fields:importedBankStatements

// @sf-generated-start component:ImportedBankStatementsForm
export default function ImportedBankStatementsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ImportedBankStatementsForm
