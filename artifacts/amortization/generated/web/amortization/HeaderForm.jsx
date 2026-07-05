import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:header
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'startingDate', column: 'StartDate', type: 'date', label: 'Starting Date', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'select', label: 'Accounting Status', required: true, readOnly: true, section: 'other', options: [{ value: 'NC', label: 'Cost Not Calculated' }, { value: 'd', label: 'Disabled For Background' }, { value: 'D', label: 'Document Disabled' }, { value: 'L', label: 'Document Locked' }, { value: 'E', label: 'Error' }, { value: 'C', label: 'Error, No cost' }, { value: 'i', label: 'Invalid Account' }, { value: 'AD', label: 'No Accounting Date' }, { value: 'DT', label: 'No Document Type' }, { value: 'NO', label: 'No Related PO' }, { value: 'b', label: 'Not Balanced' }, { value: 'c', label: 'Not Convertible (no rate)' }, { value: 'l', label: 'Pending Refresh' }, { value: 'p', label: 'Period Closed' }, { value: 'y', label: 'Post Prepared' }, { value: 'Y', label: 'Posted' }, { value: 'T', label: 'Table Disabled' }, { value: 'N', label: 'Unposted' }], defaultValue: 'N' },
];
// @sf-generated-end fields:header

// @sf-generated-start component:HeaderForm
export default function HeaderForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:HeaderForm
